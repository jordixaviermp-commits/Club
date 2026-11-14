// Planificar ruta: interfaz. Las reglas están en logic.js; el tiempo viene de Open-Meteo y el mapa de OpenStreetMap.
import * as R from './logic.js';
import { buildCard } from './card.js';

const main = document.getElementById('main');
const dialog = document.getElementById('dialog');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } },
};
const K_REC = 'ruta-recientes', K_LAST = 'ruta-ultima';

// ---------- Formatos ----------
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const km = (m) => nf1.format(m / 1000);
const int = (x) => Math.round(x).toLocaleString('es-ES');
const hm = (ms) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const dur = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
const dayName = (ms) => new Date(ms).toLocaleDateString('es-ES', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase());
const dayShort = (ms) => new Date(ms).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
const pct = (g) => `${nf1.format(g * 100)} %`;
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
const compass = (d) => COMPASS[Math.round(d / 22.5) % 16];
const KIND = { cara: 'De cara', lateral: 'Cruzado', favor: 'A favor' };
const localInput = (ms) => { const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const defaultStart = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); };
// «ruta/?fecha=AAAA-MM-DD»: desde una carrera de la app del club, la salida empieza ese día a las 9:00 (se puede cambiar)
const paramStart = () => { const f = new URLSearchParams(location.search).get('fecha'); if (!/^\d{4}-\d{2}-\d{2}$/.test(f || '')) return null; const t = new Date(f + 'T09:00:00').getTime(); return t > Date.now() - 3600000 ? t : null; };
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

let toastTimer;
function toast(msg, error = false) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'toast'; }, 3500);
}

const WP_TYPES = [
  ['avit', '🍌', 'Avituallamiento', 'Food'], ['oficial', '🏁', 'Avituallamiento oficial', 'Food'],
  ['agua', '💧', 'Agua', 'Drinking Water'], ['inicio', '⛰️', 'Inicio de puerto', 'Summit'],
  ['fin', '🚩', 'Fin de puerto', 'Summit'], ['peligro', '⚠️', 'Zona peligrosa', 'Danger Area'],
  ['bajada', '↘️', 'Bajada técnica', 'Danger Area'], ['cruce', '🔀', 'Cruce o desvío', 'Navaid, Blue'],
  ['bar', '☕', 'Bar o tienda', 'Restaurant'], ['reagrupa', '👥', 'Reagrupamiento', 'Flag, Blue'],
  ['foto', '📷', 'Foto o mirador', 'Scenic Area'], ['auxilio', '➕', 'Primeros auxilios', 'Medical Facility'],
  ['otro', '📍', 'Otro', 'Flag, Blue'],
];
const wpType = (id) => WP_TYPES.find((t) => t[0] === id) || WP_TYPES[WP_TYPES.length - 1];

// ---------- Estado ----------
const S = {
  id: null, name: '', raw: null, reversed: false, track: null, climbs: [], samples: [], tl: null, etas: [], along: null,
  eleSrc: 'file', dem: null, demLoading: false, demErr: '', fountains: null, fLoading: false, fErr: '',
  start: paramStart() || defaultStart(), stage: 'setup', range: null, climbView: 'medianas', profColor: 'subidas',
  pace: { mode: 'speed', kmh: 27, pFlat: 200, pClimb: 220, rider: 72, bike: 8, terrain: 'road', stopsPH: 0 },
  wx: null, wxKey: '', wxErr: '', wxLoading: false,
  view: 'completa', mode: 'viento', arrowsKm: 4, wps: [], addingWp: false,
  feeding: false, gph: 90, every: 30, feedOnMap: true, feedMode: 'smart', custom: null,
  carry: { bid: { n: 2, g: 0 }, gel: { n: 0, g: 25 }, bar: { n: 0, g: 30 } },
  exp: { wps: true, climbs: false, tomas: false, times: false, fuentes: true }, cursorD: null,
  charts: ['viento', 'temp', 'lluvia', 'humedad', 'uv'], bgProfile: true, tCursor: null,
};
let map = null, mapLayer = null, arrowLayer = null, cursorMarker = null, fitted = false;

function saveLast() {
  if (!S.id) return;
  store.set(K_LAST, { id: S.id, start: S.start, pace: S.pace, eleSrc: S.eleSrc, stage: S.stage, range: S.range, climbView: S.climbView, profColor: S.profColor, reversed: S.reversed, wps: S.wps,
    gph: S.gph, every: S.every, feeding: S.feeding, view: S.view, mode: S.mode, charts: S.charts, bgProfile: S.bgProfile, feedMode: S.feedMode, custom: S.custom, carry: S.carry });
}
function saveRecent(id, name, pts, dem = null) {
  let list = store.get(K_REC, []).filter((r) => r.id !== id);
  list.unshift({ id, name, pts, dem, at: Date.now() });
  list = list.slice(0, 8);
  while (list.length && !store.set(K_REC, list)) list.pop(); // si no cabe, se van quitando las más antiguas
}

// ---------- Cálculos ----------
function build() {
  const useDem = S.eleSrc === 'dem' && S.dem && S.dem.length === S.raw.length;
  const src = S.raw.map(([lat, lon, ele], i) => ({ lat, lon, ele: useDem ? S.dem[i] : ele }));
  const pts = S.reversed ? src.reverse() : src;
  S.full = R.buildTrack(pts);
  // «planificar solo un tramo»: se queda con los puntos entre los dos tiradores del perfil
  if (S.range) {
    const [a, b] = S.range;
    const part = S.full.points.filter((p) => p.d >= a && p.d <= b).map((p) => ({ lat: p.lat, lon: p.lon, ele: p.ele }));
    if (part.length > 1) S.track = R.buildTrack(part); else { S.range = null; S.track = S.full; }
  } else S.track = S.full;
  S.climbs = R.findClimbs(S.track.points);
  S.samples = R.samplePoints(S.track.points);
  retime();
}
const paceOpts = () => {
  const p = S.pace;
  return p.mode === 'power'
    ? { mode: 'power', pFlat: p.pFlat, pClimb: p.pClimb, rider: p.rider, bike: p.bike, terrain: p.terrain, stopsPerHour: p.stopsPH }
    : { mode: 'speed', flatKmh: p.kmh, terrain: p.terrain, stopsPerHour: p.stopsPH };
};
const paceText = () => (S.pace.mode === 'power' ? `${S.pace.pFlat} W en llano, ${S.pace.pClimb} W en subidas, ${S.pace.rider + S.pace.bike} kg` : `${nf1.format(S.pace.kmh).replace(/,0$/, '')} km/h de media`);
function etasFor(start) { return S.samples.map((s) => start + R.timeAt(S.track.points, S.tl.t, s.d)); }
function retime() {
  S.tl = R.timeline(S.track.points, paceOpts());
  S.etas = etasFor(S.start);
  S.along = S.wx ? R.weatherAlong(S.samples, S.etas, S.wx) : null;
}
const at = (d) => S.start + R.timeAt(S.track.points, S.tl.t, d);
const wxAt = (d) => {
  if (!S.along) return null;
  let best = S.along[0];
  for (const w of S.along) if (Math.abs(w.d - d) < Math.abs(best.d - d)) best = w;
  return best;
};

async function fetchWeather() {
  const from = startOfDay(S.start), to = startOfDay(S.start) + 86400000 + S.tl.total;
  const key = `${S.samples.map((s) => `${s.lat.toFixed(3)},${s.lon.toFixed(3)}`).join(';')}|${from}`;
  if (key === S.wxKey && S.wx) return;
  if (from - Date.now() > 15 * 86400000) {
    S.wx = null; S.wxKey = ''; S.wxErr = 'La previsión llega hasta 16 días: vuelve a mirarlo más cerca de la fecha.'; S.along = null;
    return update();
  }
  S.wxLoading = true; S.wxErr = ''; update();
  try {
    const res = await fetch(`${R.forecastUrl(S.samples, from, to)}&daily=sunrise,sunset`);
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.reason || `Error ${res.status}`);
    S.wx = json; S.wxKey = key;
  } catch (e) {
    S.wx = null; S.wxErr = `No se ha podido cargar la previsión (${e.message}). Revisa la conexión.`;
  }
  S.wxLoading = false;
  retime(); update();
}

/** Altitud del modelo del terreno para el track (Open-Meteo, de 100 en 100 puntos). */
async function fetchDem() {
  if (S.demLoading) return;
  S.demLoading = true; S.demErr = ''; update();
  try {
    let d = 0;
    const pts = S.raw.map(([lat, lon], i) => { if (i) d += R.haversine(S.raw[i - 1][0], S.raw[i - 1][1], lat, lon); return { lat, lon, d }; });
    const samples = R.demSamples(pts);
    const elevs = [];
    for (const url of R.demUrls(samples)) {
      const res = await fetch(url);
      const j = await res.json();
      if (!res.ok || !Array.isArray(j.elevation)) throw new Error(j.reason || `Error ${res.status}`);
      elevs.push(...j.elevation);
    }
    S.dem = R.applyDem(pts, samples, elevs).map((e) => Math.round(e * 10) / 10);
    saveRecent(S.id, S.name, S.raw, S.dem);
  } catch (e) {
    S.demErr = `No se ha podido cargar la altitud del terreno (${e.message}).`;
    if (S.track?.hasEle) S.eleSrc = 'file';
  }
  S.demLoading = false;
  build(); update(); fetchWeather();
}

/** Fuentes de agua de OpenStreetMap a menos de 500 m (se guardan por ruta; «Buscar las más recientes» las vuelve a pedir). */
const K_FONT = 'ruta-fuentes';
async function fetchFountains(force = false) {
  if (S.fLoading || !S.full) return;
  const cache = store.get(K_FONT, {});
  if (!force && cache[S.id]) { S.fountains = cache[S.id]; return; }
  S.fLoading = true; S.fErr = ''; renderFountains();
  const body = `data=${encodeURIComponent(R.fountainsQuery(S.full.points))}`;
  let json = null, err = '';
  for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      json = await res.json(); break;
    } catch (e) { err = e.message; }
  }
  S.fLoading = false;
  if (!json) { S.fErr = `No se han podido buscar las fuentes (${err}). OpenStreetMap a veces va saturado: prueba en un rato.`; return renderFountains(); }
  const elements = (json.elements || []).map((e) => ({ type: 'node', id: e.id, lat: e.lat, lon: e.lon, tags: e.tags }));
  S.fountains = { at: Date.now(), elements };
  const all = { ...cache, [S.id]: S.fountains };
  const keys = Object.keys(all);
  while (keys.length > 15) delete all[keys.shift()];
  store.set(K_FONT, all);
  update();
}
const fountains = () => (S.fountains ? R.parseFountains({ elements: S.fountains.elements }, S.track.points) : []);

/** Salida y puesta del sol del día de salida (en el primer punto), si la previsión las trae. */
function sunTimes(startMs = S.start) {
  const first = Array.isArray(S.wx) ? S.wx[0] : S.wx;
  const d = first?.daily;
  if (!d) return null;
  const i = d.time.findIndex((t) => t * 1000 <= startMs && startMs < t * 1000 + 86400000);
  return i < 0 ? null : { rise: d.sunrise[i] * 1000, set: d.sunset[i] * 1000 };
}
const darkMinutes = (start, end) => { const s = sunTimes(start); return s ? Math.max(0, s.rise - start) / 60000 + Math.max(0, end - s.set) / 60000 : 0; };

// ---------- Mejor hora de salida ----------
const BEST = { open: false, sel: null };
/** Salidas posibles del día (cada 15 min, con previsión para toda la ruta): la de menos viento de cara y lluvia, con luz. */
function bestOfDay(day) {
  const first = Array.isArray(S.wx) ? S.wx[0] : S.wx;
  const last = first?.hourly?.time?.length ? first.hourly.time[first.hourly.time.length - 1] * 1000 : 0;
  let best = null;
  for (let st = Math.max(day, Math.ceil(Date.now() / 900000) * 900000); st < day + 86400000; st += 900000) {
    if (st + S.tl.total > last) break;
    const wx = R.weatherAlong(S.samples, etasFor(st), S.wx);
    const score = R.departureScore(wx, darkMinutes(st, st + S.tl.total));
    if (!best || score < best.score) best = { st, score, w: wx[0] };
  }
  return best;
}
function openBest() { BEST.open = true; BEST.sel = null; renderBest(); if (!dialog.open) dialog.showModal(); }
function renderBest() {
  const day = startOfDay(S.start), today = startOfDay(Date.now());
  const label = day === today ? 'Hoy' : day === today + 86400000 ? 'Mañana' : dayShort(day);
  let body;
  if (S.wxErr) body = `<p class="warn">${esc(S.wxErr)}</p>`;
  else if (!S.wx || S.wxLoading) body = '<p class="hint">Cargando la previsión…</p>';
  else {
    const best = bestOfDay(day);
    const first = Array.isArray(S.wx) ? S.wx[0] : S.wx, h = first.hourly;
    const hourAt = (k, ms) => R.interpHourly(h.time, h[k], ms);
    const sel = BEST.sel ?? best?.st ?? null;
    body = `${best ? `<div class="tip">Para toda la salida, con luz, menos viento y menos lluvia: <b>a las ${hm(best.st)}</b>, ${int(best.w.temp)} °C y viento de ${int(best.w.wind)} km/h al salir.
        <br><button class="btn small" data-act="best-apply" data-st="${best.st}">Salir a las ${hm(best.st)}</button></div>`
      : '<p class="warn">Ese día ya no da tiempo a hacer la ruta con la previsión disponible.</p>'}
      ${sel !== null ? `<p class="readout"><b>${hm(sel)}</b>: ${int(hourAt('temperature_2m', sel))} °C, viento ${int(hourAt('wind_speed_10m', sel))} km/h (rachas ${int(hourAt('wind_gusts_10m', sel))} km/h), lluvia ${int(hourAt('precipitation_probability', sel) ?? 0)} %</p>` : ''}
      ${dayChart(day, h, sel)}
      ${sel !== null ? `<button class="btn primary block" data-act="best-apply" data-st="${sel}">Salir a las ${hm(sel)}</button>` : ''}
      <div class="legend"><span><i style="background:#e8711a"></i>Temperatura (°C, eje izquierdo)</span><span><i style="background:var(--accent)"></i>Viento (km/h, eje derecho)</span><span><i style="background:#9cc7ef"></i>Lluvia (probabilidad)</span><span><i style="background:#f5c518"></i>Luz del día</span></div>
      <p class="hint">Toca la gráfica para elegir otra hora.</p>`;
  }
  dialog.innerHTML = `<div class="dlg best"><h3>Mejor hora de salida <button class="linkbtn" data-act="best-close" aria-label="Cerrar">✕</button></h3>
    <div class="daynav"><button class="btn small" data-act="best-day" data-n="-1" ${day <= today ? 'disabled' : ''} aria-label="Día anterior">‹</button><b>${label}</b>
      <button class="btn small" data-act="best-day" data-n="1" ${day >= today + 14 * 86400000 ? 'disabled' : ''} aria-label="Día siguiente">›</button></div>${body}</div>`;
}
const DW = 340, DH = 180, DP = { l: 30, r: 30, t: 16, b: 22 };
function dayChart(day, h, sel) {
  const xs = (ms) => DP.l + ((ms - day) / 86400000) * (DW - DP.l - DP.r);
  const idx = h.time.map((t, i) => [t * 1000, i]).filter(([ms]) => ms >= day && ms <= day + 86400000);
  if (!idx.length) return '';
  const temps = idx.map(([, i]) => h.temperature_2m[i]), winds = idx.map(([, i]) => h.wind_speed_10m[i]);
  const tLo = Math.floor(Math.min(...temps) / 5) * 5, tHi = Math.ceil((Math.max(...temps) + 0.1) / 5) * 5;
  const wHi = Math.max(10, Math.ceil(Math.max(...winds) / 10) * 10);
  const yT = (v) => DP.t + (1 - (v - tLo) / (tHi - tLo || 1)) * (DH - DP.t - DP.b);
  const yW = (v) => DP.t + (1 - v / wHi) * (DH - DP.t - DP.b);
  const base = DH - DP.b;
  const bars = idx.map(([ms, i]) => { const p = h.precipitation_probability?.[i] ?? 0; const hgt = (p / 100) * (base - DP.t) * 0.45; return p ? `<rect x="${xs(ms) - 3}" y="${base - hgt}" width="6" height="${hgt}" fill="#9cc7ef"/>` : ''; }).join('');
  const sun = sunTimes(day + 12 * 3600000);
  const light = sun ? `<rect x="${xs(sun.rise)}" y="${DP.t - 8}" width="${xs(sun.set) - xs(sun.rise)}" height="4" fill="#f5c518"/>` : '';
  const line = (vals, y, color) => `<polyline points="${idx.map(([ms], k) => `${xs(ms).toFixed(1)},${y(vals[k]).toFixed(1)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>`;
  const ticks = [0, 6, 12, 18].map((hh) => `<text x="${xs(day + hh * 3600000)}" y="${DH - 6}" text-anchor="middle">${String(hh).padStart(2, '0')}:00</text><line x1="${xs(day + hh * 3600000)}" x2="${xs(day + hh * 3600000)}" y1="${DP.t}" y2="${base}" stroke="var(--line)"/>`).join('');
  const lt = [tLo, (tLo + tHi) / 2, tHi].map((v) => `<text x="${DP.l - 4}" y="${yT(v) + 3}" text-anchor="end" style="fill:#e8711a">${int(v)}°</text>`).join('');
  const rt = [0, wHi / 2, wHi].map((v) => `<text x="${DW - DP.r + 4}" y="${yW(v) + 3}" style="fill:var(--accent)">${int(v)}</text>`).join('');
  const cur = sel !== null && sel >= day && sel <= day + 86400000 ? `<line x1="${xs(sel)}" x2="${xs(sel)}" y1="${DP.t - 8}" y2="${base}" stroke="var(--text)" stroke-dasharray="4 3"/>` : '';
  return `<svg class="daychart" id="daychart" data-day="${day}" viewBox="0 0 ${DW} ${DH}" role="img" aria-label="Tiempo del día">${ticks}${light}${bars}${line(temps, yT, '#e8711a')}${line(winds, yW, 'var(--accent)')}${lt}${rt}${cur}</svg>`;
}
function dayPick(ev) {
  const svg = ev.target.closest('#daychart'), r = svg.getBoundingClientRect(), day = +svg.dataset.day;
  const fx = ((ev.clientX - r.left) / r.width) * DW;
  const ms = day + Math.max(0, Math.min(1, (fx - DP.l) / (DW - DP.l - DP.r))) * 86400000;
  BEST.sel = Math.min(day + 86400000 - 900000, Math.round(ms / 900000) * 900000);
  renderBest();
}

// ---------- Inicio ----------
function renderHome() {
  document.getElementById('change').hidden = true;
  if (map) { map.remove(); map = null; }
  const last = store.get(K_LAST, null);
  const rec = store.get(K_REC, []);
  const lastRoute = last && rec.find((r) => r.id === last.id);
  main.innerHTML = `
    <p class="intro">Sube el track, di cuándo sales y mira el viento, el tiempo y las subidas a la hora a la que pasas por cada sitio.</p>
    <div class="step"><b>1</b><h2>Track</h2></div>
    ${lastRoute ? `<div class="resume">¿Sigues con <b>${esc(lastRoute.name)}</b> donde lo dejaste?
      <div class="row"><button class="btn" data-act="resume">Seguir</button><button class="linkbtn" data-act="forget">No</button></div></div>` : ''}
    <button class="pick" data-act="file"><span class="ic">⬆️</span><span><b>Archivo</b><span>Sube el archivo .gpx o .fit de la ruta que quieres planificar.</span></span></button>
    <input type="file" id="file" accept=".gpx,.fit,application/gpx+xml,application/octet-stream" hidden>
    <button class="pick" data-act="recent"><span class="ic">🕘</span><span><b>Recientes</b><span>Las rutas que ya has planificado en este móvil u ordenador, para repetirlas.</span></span></button>
    <p>¿Sin track a mano? <button class="linkbtn" data-act="example">Probar con una ruta de ejemplo</button></p>
    ${foot()}`;
}
const foot = () => `<p class="foot">Previsión: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> · Mapa © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>.
  El track y tus ajustes se guardan solo en este dispositivo.</p>`;

async function readFile(file) {
  try {
    const isFit = /\.fit$/i.test(file.name);
    const parsed = isFit ? R.parseFIT(await file.arrayBuffer()) : R.parseGPX(await file.text());
    if (parsed.points.length < 2) throw new Error('no tiene puntos con posición');
    openRoute(parsed.name || file.name.replace(/\.(gpx|fit)$/i, ''), parsed.points);
  } catch (e) { toast(`No se ha podido leer el archivo: ${e.message}`, true); }
}
function openRoute(name, points, settings = null) {
  const pts = Array.isArray(points[0]) ? points : R.decimate(points, 4000);
  const id = settings?.id || `r${Date.now().toString(36)}`;
  Object.assign(S, { id, name, raw: pts, dem: settings?.dem || null, eleSrc: 'file', demErr: '', fountains: null, fErr: '', reversed: false, range: null, stage: 'setup', wps: [], feeding: false, custom: null, wx: null, wxKey: '', wxErr: '', cursorD: null, tCursor: null });
  if (settings) {
    for (const k of ['start', 'pace', 'eleSrc', 'stage', 'range', 'climbView', 'profColor', 'reversed', 'wps', 'gph', 'every', 'feeding', 'view', 'mode', 'charts', 'bgProfile', 'feedMode', 'custom', 'carry']) if (settings[k] !== undefined) S[k] = settings[k];
    if (settings.flat && !settings.pace) S.pace = { ...S.pace, kmh: settings.flat }; // ajustes guardados por la versión anterior
    if (S.start < Date.now() - 3600000) { const d = new Date(S.start); const n = new Date(defaultStart()); n.setHours(d.getHours(), d.getMinutes()); S.start = n.getTime(); }
  }
  saveRecent(id, name, pts);
  fitted = false;
  build();
  // sin altitud en el archivo: se usa la del terreno
  if (!S.track.hasEle) { S.eleSrc = 'dem'; if (!S.dem) fetchDem(); else build(); }
  if (S.eleSrc === 'dem' && S.dem) build();
  render(); fetchWeather();
}
function showRecent() {
  const rec = store.get(K_REC, []);
  dialog.innerHTML = `<div class="dlg"><h3>Recientes <button class="linkbtn" data-act="close">Cerrar</button></h3>
    ${rec.length ? `<ul class="mini-list">${rec.map((r) => `<li><div><b>${esc(r.name)}</b><small class="muted">${new Date(r.at).toLocaleDateString('es-ES')}</small></div>
      <span class="row"><button class="btn small" data-act="open-rec" data-id="${r.id}">Abrir</button><button class="btn small ghost" data-act="del-rec" data-id="${r.id}" aria-label="Quitar">✕</button></span></li>`).join('')}</ul>`
      : '<p class="muted">Aún no has planificado ninguna ruta en este dispositivo.</p>'}</div>`;
  dialog.showModal();
}

// ---------- Primer menú: track, salida y ritmo ----------
function render() { if (S.stage === 'plan') renderPlan(); else renderSetup(); }
function salidaHtml() {
  return `<label>Hora de salida <input type="datetime-local" id="start" value="${localInput(S.start)}"></label>
    <button class="btn block" data-act="best">Mejor hora</button>
    <div class="shift"><span>${dayName(S.start)}</span> · <button class="linkbtn" data-act="shift" data-min="-15">−15 min</button> <button class="linkbtn" data-act="shift" data-min="15">+15 min</button></div>`;
}
function ritmoHtml() {
  const p = S.pace;
  const num = (k, label, unit, min, max, step = 1) => `<label>${label}<span class="unit"><input type="number" data-pace="${k}" value="${p[k]}" min="${min}" max="${max}" step="${step}" inputmode="decimal"><span>${unit}</span></span></label>`;
  return `<p class="lbl">Cómo calcular el tiempo</p>
    <div class="seg"><button data-pace-mode="speed" class="${p.mode === 'speed' ? 'on' : ''}">Velocidad media</button><button data-pace-mode="power" class="${p.mode === 'power' ? 'on' : ''}">Potencia y peso</button></div>
    ${p.mode === 'power' ? `<div class="grid2">${num('pFlat', 'Potencia en llano', 'W', 60, 500)}${num('rider', 'Peso del ciclista, equipado', 'kg', 30, 150)}${num('bike', 'Peso de la bici, con bidones', 'kg', 5, 30)}${num('pClimb', 'Potencia en subidas', 'W', 60, 600)}</div>`
      : num('kmh', 'Velocidad media', 'km/h', 10, 50, 0.5)}
    <p class="lbl">Terreno</p>
    <div class="seg">${Object.entries(R.TERRAIN).map(([k, v]) => `<button data-terrain="${k}" class="${p.terrain === k ? 'on' : ''}">${v.label}</button>`).join('')}</div>
    <p class="hint">${p.mode === 'power' ? 'Potencias medias, no normalizadas. La de subidas se aplica desde el 3 % de pendiente. En las bajadas (desde el −3 %) se cuentan 100 W: casi no se pedalea.'
      : `La media es la de llano y sin viento: subiendo vas más lento y bajando más rápido (como mucho ${R.TERRAIN[p.terrain].vmax} km/h).`}</p>
    <p class="lbl">Paradas (min por hora)</p>
    <div class="seg">${[0, 5, 10, 15].map((m) => `<button data-stops="${m}" class="${p.stopsPH === m ? 'on' : ''}">${m}</button>`).join('')}</div>`;
}
const arriveHtml = () => `<p class="arrive">Llegada <mark>${hm(S.start + S.tl.total)}</mark></p>
  <p class="muted">${dur(S.tl.total)} · ${km(S.track.distance)} km · ${int(S.track.gain)} m+ · ${nf1.format(S.track.distance / S.tl.moving * 3600)} km/h sin viento</p>`;
function eleHtml() {
  const q = S.full?.quality || {};
  const noisy = S.eleSrc === 'file' && q.noise >= 4;
  const note = S.demLoading ? 'Cargando la altitud del terreno…'
    : S.eleSrc === 'dem' ? 'Modelo del terreno Copernicus (90 m): uniforme para cualquier track, pero no ve puentes ni túneles (se corrigen solos los saltos de ida y vuelta).'
    : !S.track.hasEle ? 'El archivo no trae altitud.'
    : `La que trae el archivo${q.noise ? ` (ruido ±${nf1.format(q.noise)} m${q.repaired ? `, ${q.repaired} salto${q.repaired > 1 ? 's' : ''} de túnel o puente arreglado${q.repaired > 1 ? 's' : ''}` : ''})` : ''}.`;
  return `<p class="lbl">Altitud</p>
    <div class="seg"><button data-elesrc="file" class="${S.eleSrc === 'file' ? 'on' : ''}" ${S.track.hasEle ? '' : 'disabled'}>Del archivo</button><button data-elesrc="dem" class="${S.eleSrc === 'dem' ? 'on' : ''}">Del terreno</button></div>
    <p class="hint">${note}</p>
    ${noisy ? '<p class="warn">La altitud de este archivo tiene mucho ruido (suele pasar con el GPS del móvil o del reloj). Prueba con la del terreno: el desnivel y las subidas saldrán más fiables.</p>' : ''}
    ${S.demErr ? `<p class="warn">${esc(S.demErr)}</p>` : ''}`;
}
function renderSetup() {
  document.getElementById('change').hidden = true;
  if (map) { map.remove(); map = null; }
  const t = S.track;
  main.innerHTML = `
    <p class="intro">Sube el track, di cuándo sales y mira el viento, el tiempo y las subidas a la hora a la que pasas por cada sitio.</p>
    <div class="step"><b>1</b><h2>Track</h2></div>
    <button class="linkbtn" data-act="home">← Archivo o Recientes</button>
    <div class="chosen"><b>${esc(S.name)}</b> · ${km(t.distance)} km · ${int(t.gain)} m+${S.range ? ` <small class="muted">(solo un tramo)</small>` : ''}<br><button class="linkbtn" data-act="home">Elegir otra</button></div>
    <p class="hint">En el sentido del track. Si vas a hacerla al revés, dale la vuelta.</p>
    <button class="btn" data-act="reverse">Invertir sentido</button>
    ${eleHtml()}
    <div class="step"><b>2</b><h2>Salida</h2></div>${salidaHtml()}
    <div class="step"><b>3</b><h2>Ritmo</h2></div>${ritmoHtml()}
    <div id="arrive">${arriveHtml()}</div>
    <button class="btn go" data-act="go">Ver la previsión</button>
    ${foot()}`;
}

// ---------- Planificación ----------
function renderPlan() {
  document.getElementById('change').hidden = false;
  main.innerHTML = `
    <div id="top"></div>
    <div id="s1"></div>
    <div class="step"><b>2</b><h2>Mapa, perfil y subidas</h2></div>
    <div class="seg" id="modes">${[['viento', 'Viento'], ['rachas', 'Rachas'], ['temp', 'Temperatura']].map(([k, l]) => `<button data-mode="${k}">${l}</button>`).join('')}</div>
    <div class="row"><button class="btn small" data-act="addwp">+ Añadir waypoint</button></div>
    <div id="legend" class="legend"></div>
    <div class="map-wrap"><div id="map"></div><div class="hint-map" id="maphint" hidden>Toca el track donde quieras el waypoint · <button class="linkbtn" style="color:inherit" data-act="cancelwp">Cancelar</button></div></div>
    <label class="row" style="flex-direction:row;align-items:center">Flechas cada <input type="range" id="arrows" min="2" max="10" step="1" value="${S.arrowsKm}" style="flex:1"> <span id="arrowsv">${S.arrowsKm} km</span></label>
    <div class="row" style="margin-top:1rem;justify-content:space-between"><h3 style="margin:0">Elevación</h3>
      <div class="seg mini" id="profcolor"></div></div>
    <p id="pinfo" class="readout">Toca el perfil para ver la hora, el tiempo y el viento en ese punto.</p>
    <div id="profile"></div>
    <p class="hint">Arrastra los tiradores de los extremos del perfil para planificar solo un tramo.</p>
    <div id="climbs"></div>
    <div id="fountains"></div>
    <div id="rest"></div>
    ${foot()}`;
  initMap();
  update();
  fetchFountains();
}

function update() {
  if (!S.track) return;
  saveLast();
  if (BEST.open && dialog.open) renderBest();
  if (S.stage !== 'plan') return renderSetup();
  renderTop(); renderSummary(); renderLegend(); drawMap(); renderProfile(); renderClimbs(); renderFountains(); renderRest();
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === S.mode));
}

function renderTop() {
  const t = S.track;
  document.getElementById('top').innerHTML = `
    <div class="title-row"><h2>${esc(S.name)}</h2><p class="muted">${dayShort(S.start)} · ${km(t.distance)} km · ${int(t.gain)} m+ · ${R.TERRAIN[S.pace.terrain].label.toLowerCase()}</p>
      ${S.range ? `<p class="hint">Solo el tramo del km ${km(S.range[0])} al ${km(S.range[1])} de ${km(S.full.distance)} km. <button class="linkbtn" data-act="range-off">Toda la ruta</button></p>` : ''}</div>
    <div class="panel">
      ${salidaHtml()}
      <details><summary>Ritmo: <b>${paceText()}</b></summary><div style="margin-top:.6rem">${ritmoHtml()}</div></details>
      <button class="btn" data-act="reverse" style="margin-top:.6rem">Invertir sentido</button>
    </div>
    <div class="seg" id="view"><button data-view="sencilla" class="${S.view === 'sencilla' ? 'on' : ''}">Sencilla</button><button data-view="completa" class="${S.view === 'completa' ? 'on' : ''}">Completa</button></div>
    <p class="hint">${S.view === 'completa' ? 'Todo: tiempo detallado, avituallamiento y exportar.' : 'Solo el resumen, el mapa y las subidas.'}</p>`;
}

function hardest() {
  return S.climbs.reduce((b, c) => (!b || c.gain > b.gain ? c : b), null);
}

function renderSummary() {
  const t = S.track, total = S.tl.total, end = S.start + total;
  const moving = S.tl.moving;
  let wind = '<span class="muted">cargando la previsión…</span>', temp = wind, rain = wind, light = wind;
  if (S.wxErr) wind = temp = rain = light = `<span class="bad">${esc(S.wxErr)}</span>`;
  else if (S.along) {
    const a = S.along.filter((w) => w.wind !== undefined);
    const max = Math.max(...a.map((w) => w.wind)), gust = Math.max(...a.map((w) => w.gust));
    const head = a.filter((w) => w.rel.kind === 'cara').length / a.length;
    const word = max < 12 ? 'flojo' : max < 25 ? 'moderado' : 'fuerte';
    wind = `${word}, máx. ${int(max)} km/h (rachas ${int(gust)}), ${head ? `${int(head * 100)} % de la ruta de cara` : 'sin viento de cara'}`;
    const temps = a.map((w) => w.temp);
    temp = `${int(Math.min(...temps))} a ${int(Math.max(...temps))} °C`;
    const wet = a.reduce((b, w) => (w.rainProb > (b?.rainProb ?? -1) ? w : b), null);
    rain = !wet || wet.rainProb < 10 ? 'sin lluvia prevista' : `hasta el ${int(wet.rainProb)} % hacia las ${hm(wet.eta)}`;
    const sun = sunTimes();
    if (!sun) light = '—';
    else if (S.start < sun.rise) light = `<span class="bad">sales de noche</span> (amanece a las ${hm(sun.rise)})`;
    else if (end > sun.set) light = `<span class="bad">llegas de noche</span> (se pone el sol a las ${hm(sun.set)})`;
    else light = `con luz de día (se pone el sol a las ${hm(sun.set)})`;
  }
  const h = hardest();
  document.getElementById('s1').innerHTML = `
    <div class="step"><b>1</b><h2>Salida</h2></div>
    <div class="facts">
      <div><small>Salida</small><b>${hm(S.start)}</b></div><div><small>Llegada</small><b><mark>${hm(end)}</mark></b></div><div><small>Duración</small><b>${dur(total)}</b></div>
      <div><small>Distancia</small><b>${km(t.distance)} km</b></div><div><small>Desnivel</small><b>${int(t.gain)} m</b></div><div><small>Media</small><b>${nf1.format(t.distance / 1000 / (moving / 3600000))} km/h</b></div>
    </div>
    ${S.wxLoading ? '<p class="hint">Cargando la previsión…</p>' : ''}
    ${t.hasEle ? '' : '<p class="warn">Este track no trae altitud: los tiempos son como si fuera llano.</p>'}
    <details class="fact"><summary><b>Viento</b> ${wind}</summary><p>A la hora a la que pasas por cada punto y respecto a tu dirección de marcha. «De cara» es si viene a menos de 45° de tu frente.</p></details>
    <details class="fact"><summary><b>Temperatura</b> ${temp}</summary><p>Temperatura a 2 m en cada punto a tu hora de paso.</p></details>
    <details class="fact"><summary><b>Lluvia</b> ${rain}</summary><p>La probabilidad más alta de precipitación a lo largo de la ruta.</p></details>
    <details class="fact"><summary><b>Luz</b> ${light}</summary><p>Con la salida y la puesta de sol del día, en el punto de salida.</p></details>
    <details class="fact"><summary><b>Subida más dura</b> ${h ? `${km(h.length)} km al ${pct(h.avg)}` : 'ninguna'}</summary>
      <p>${h ? `Empieza en el km ${km(h.start)}, la pasas entre las ${hm(at(h.start))} y las ${hm(at(h.end))}. Sube ${int(h.gain)} m, máx. ${pct(h.max)}.` : 'No hay subidas de 40 m o más al 2,5 % o más, ni puertos largos y tendidos.'}</p></details>`;
}

// ---------- Mapa ----------
function initMap() {
  map = L.map('map', { zoomControl: true, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  mapLayer = L.layerGroup().addTo(map);
  arrowLayer = L.layerGroup().addTo(map);
  map.on('zoomend', drawArrows);
  map.on('click', (e) => {
    if (!S.addingWp) return;
    const d = R.nearestD(S.track.points, e.latlng.lat, e.latlng.lng);
    setAdding(false); wpDialog(d);
  });
}
function setAdding(on) {
  S.addingWp = on;
  document.getElementById('maphint').hidden = !on;
  if (on) document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
const tempColor = (t) => { const f = Math.max(0, Math.min(1, t / 35)); return `hsl(${Math.round(240 - 240 * f)} 80% 45%)`; };
const gustColor = (g) => { const f = Math.max(0, Math.min(1, g / 60)); return `hsl(${Math.round(120 - 120 * f)} 75% 42%)`; };
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function segColor(w) {
  if (!w || w.wind === undefined) return css('--accent') || '#284556';
  if (S.mode === 'temp') return tempColor(w.temp);
  if (S.mode === 'rachas') return gustColor(w.gust);
  return css(w.rel.kind === 'cara' ? '--head' : w.rel.kind === 'favor' ? '--tail' : '--cross');
}
function renderLegend() {
  const el = document.getElementById('legend');
  if (S.mode === 'temp') el.innerHTML = '<span>0 °C</span><span class="scale" style="background:linear-gradient(90deg,hsl(240 80% 45%),hsl(120 80% 45%),hsl(0 80% 45%))"></span><span>35+ °C</span>';
  else if (S.mode === 'rachas') el.innerHTML = '<span>0 km/h</span><span class="scale" style="background:linear-gradient(90deg,hsl(120 75% 42%),hsl(60 75% 42%),hsl(0 75% 42%))"></span><span>60+ km/h</span>';
  else el.innerHTML = '<span><i style="background:var(--head)"></i>De cara</span><span><i style="background:var(--cross)"></i>Cruzado</span><span><i style="background:var(--tail)"></i>A favor</span><span>Flechas: hacia dónde sopla; más grandes, más viento</span>';
}
function drawMap() {
  if (!map) return;
  mapLayer.clearLayers();
  const P = S.track.points;
  if (!fitted) { map.fitBounds(L.latLngBounds(P.map((p) => [p.lat, p.lon])), { padding: [16, 16] }); fitted = true; }
  const cuts = S.samples.map((s) => s.d);
  // un tramo por punto de previsión, coloreado con el tiempo de ese punto
  for (let k = 0; k < cuts.length - 1; k++) {
    const a = R.indexAt(P, cuts[k]), b = R.indexAt(P, cuts[k + 1]);
    const line = P.slice(Math.max(0, a - 1), b + 1).map((p) => [p.lat, p.lon]);
    const w = S.along?.[k];
    L.polyline(line, { color: segColor(w), weight: 6, opacity: .9 }).addTo(mapLayer);
  }
  drawArrows();
  shown().forEach((c) => {
    const p = R.pointAt(P, c.start), k = catOf(c);
    L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', iconSize: [24, 24], html: `<div class="cnum" style="background:${catColor(c)};color:${['3', ''].includes(k) ? '#111' : '#fff'}">${climbNo(c)}</div>` }) })
      .bindPopup(`<b>Subida ${climbNo(c)}</b> · ${R.catLabel(k)}<br>km ${km(c.start)} · ${km(c.length)} km al ${pct(c.avg)}<br>${hm(at(c.start))} → ${hm(at(c.end))}`).addTo(mapLayer);
  });
  S.wps.forEach((w, i) => {
    const p = R.pointAt(P, w.d);
    L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', iconSize: [24, 24], html: `<div class="cnum wp">${wpType(w.type)[1]}</div>` }) })
      .bindPopup(`<b>${esc(w.name)}</b><br>km ${km(w.d)} · ${hm(at(w.d))}<br><button class="linkbtn" data-act="del-wp" data-i="${i}">Quitar</button>`).addTo(mapLayer);
  });
  if (S.feeding && S.feedOnMap) feeding().forEach((f, i) => {
    const p = R.pointAt(P, f.d);
    L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', iconSize: [22, 22], html: `<div class="cnum toma">${i + 1}</div>` }) })
      .bindPopup(`<b>${esc(tomaLabel(f, i))}</b><br>${hm(S.start + f.ms)} · km ${km(f.d)} · ${f.grams} g`).addTo(mapLayer);
  });
  fountains().forEach((f) => {
    L.marker([f.lat, f.lon], { icon: L.divIcon({ className: '', iconSize: [22, 22], html: '<div class="cnum fuente">💧</div>' }) })
      .bindPopup(`<b>${esc(f.name || f.kind)}</b><br>km ${km(f.d)} · ${hm(at(f.d))}<br>${f.off < 30 ? 'En la ruta' : `A ${int(f.off)} m de la ruta`}`).addTo(mapLayer);
  });
  const s = P[0], e = P[P.length - 1];
  L.circleMarker([s.lat, s.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 }).bindTooltip('Salida').addTo(mapLayer);
  L.circleMarker([e.lat, e.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#111', fillOpacity: 1 }).bindTooltip('Llegada').addTo(mapLayer);
  cursorMarker = null;
}

// ---------- Perfil ----------
const PW = 720, PH = 260, PAD = { l: 40, r: 14, t: 26, b: 40 };
const DRAG = { side: null, d: null };
const shown = () => R.climbFilter(S.climbs, S.climbView);
const climbNo = (c) => S.climbs.indexOf(c) + 1;
const catOf = (c) => R.climbCategory(c);
const catColor = (c) => R.CAT_COLOR[catOf(c)];
const px = (d) => PAD.l + (d / S.track.distance) * (PW - PAD.l - PAD.r);
function renderProfile() {
  const t = S.track, P = t.points, total = t.distance;
  const lo = Math.floor((t.minEle - 20) / 50) * 50, hi = Math.ceil((t.maxEle + 20) / 50) * 50;
  const x = px;
  const y = (e) => PAD.t + (1 - (e - lo) / (hi - lo || 1)) * (PH - PAD.t - PAD.b);
  const base = PH - PAD.b;
  const step = Math.max(60, total / 360);
  const area = (d1, d2, fill) => {
    const pts = [`${x(d1).toFixed(1)},${base}`];
    for (let d = d1; d < d2; d += step) pts.push(`${x(d).toFixed(1)},${y(R.pointAt(P, d).es).toFixed(1)}`);
    pts.push(`${x(d2).toFixed(1)},${y(R.pointAt(P, d2).es).toFixed(1)}`, `${x(d2).toFixed(1)},${base}`);
    return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
  };
  let fills = '';
  if (S.profColor === 'pendiente') {
    for (let d = 0; d < total; d += step * 2) {
      const d2 = Math.min(total, d + step * 2), g = (R.pointAt(P, d2).es - R.pointAt(P, d).es) / (d2 - d || 1);
      fills += area(d, d2, R.gradeColor(g));
    }
  } else {
    fills = area(0, total, 'var(--prof-base)') + shown().map((c) => area(c.start, c.end, catColor(c))).join('');
  }
  let outline = '';
  for (let d = 0; d <= total; d += step) outline += `${x(d).toFixed(1)},${y(R.pointAt(P, d).es).toFixed(1)} `;
  const yTicks = []; const ys = Math.max(50, Math.ceil((hi - lo) / 4 / 50) * 50);
  for (let e = lo; e <= hi; e += ys) yTicks.push(`<line x1="${PAD.l}" x2="${PW - PAD.r}" y1="${y(e)}" y2="${y(e)}" stroke="var(--line)"/><text x="${PAD.l - 5}" y="${y(e) + 4}" text-anchor="end">${e}</text>`);
  const xs = total > 100000 ? 20000 : total > 40000 ? 10000 : 5000;
  const xTicks = []; for (let d = 0; d <= total; d += xs) xTicks.push(`<text x="${x(d)}" y="${base + 13}" text-anchor="middle">${d / 1000}</text>`);
  // horas de paso arriba: salida, horas en punto con sitio y llegada
  const tAt = (ms) => R.distAtTime(P, S.tl.t, ms);
  const hours = [[0, hm(S.start), 'start']];
  for (let h = Math.ceil(S.start / 3600000) * 3600000; h < S.start + S.tl.total; h += 3600000) {
    const xx = x(tAt(h - S.start));
    if (xx - x(0) > 50 && x(total) - xx > 50) hours.push([tAt(h - S.start), hm(h), 'middle']);
  }
  hours.push([total, hm(S.start + S.tl.total), 'end']);
  const hl = hours.map(([d, l, a]) => `<text x="${x(d)}" y="${PAD.t - 10}" text-anchor="${a}" class="hr">${l}</text>`).join('');
  const nums = shown().map((c) => `<text x="${(x(c.start) + x(c.end)) / 2}" y="${y(c.top) - 6}" text-anchor="middle" style="font-weight:700;fill:var(--text)">${climbNo(c)}</text>`).join('');
  let strip = '';
  if (S.along) {
    const cuts = S.samples.map((s) => s.d);
    for (let k = 0; k < cuts.length - 1; k++) strip += `<rect x="${x(cuts[k])}" y="${base + 20}" width="${x(cuts[k + 1]) - x(cuts[k]) + .5}" height="9" fill="${segColor(S.along[k])}"/>`;
    strip += `<text x="${PAD.l - 5}" y="${base + 28}" text-anchor="end">${S.mode === 'temp' ? 'Temp.' : S.mode === 'rachas' ? 'Rachas' : 'Viento'}</text>`;
  }
  const feeds = S.feeding && S.feedOnMap ? feeding().map((f, i) => `<circle cx="${x(f.d)}" cy="${base - 8}" r="7" fill="#e6c229" stroke="#fff"/><text x="${x(f.d)}" y="${base - 4.5}" text-anchor="middle" style="fill:#111;font-size:9px;font-weight:700">${i + 1}</text>`).join('') : '';
  const drops = fountains().map((f) => `<text x="${x(f.d)}" y="${base - 2}" text-anchor="middle" style="font-size:13px">💧</text>`).join('');
  let cur = '';
  if (S.cursorD !== null && S.cursorD <= total) {
    const cy = y(R.pointAt(P, S.cursorD).es);
    cur = `<line x1="${x(S.cursorD)}" x2="${x(S.cursorD)}" y1="${PAD.t}" y2="${base}" stroke="var(--text)" stroke-dasharray="3 3"/><circle cx="${x(S.cursorD)}" cy="${cy}" r="5" fill="var(--accent)" stroke="#fff" stroke-width="2"/>`;
  }
  // tiradores para planificar solo un tramo
  const da = DRAG.side === 'a' && DRAG.d !== null ? DRAG.d : 0, db = DRAG.side === 'b' && DRAG.d !== null ? DRAG.d : total;
  const dim = `${da > 0 ? `<rect x="${PAD.l}" y="${PAD.t}" width="${x(da) - PAD.l}" height="${base - PAD.t}" fill="var(--bg)" opacity=".7"/>` : ''}${db < total ? `<rect x="${x(db)}" y="${PAD.t}" width="${x(total) - x(db)}" height="${base - PAD.t}" fill="var(--bg)" opacity=".7"/>` : ''}`;
  const handle = (side, d) => `<g data-handle="${side}" class="handle"><rect x="${x(d) - 18}" y="${PAD.t}" width="36" height="${base - PAD.t}" fill="transparent"/>
    <line x1="${x(d)}" x2="${x(d)}" y1="${PAD.t}" y2="${base}" stroke="var(--text)" stroke-width="2"/><rect x="${x(d) - 7}" y="${(PAD.t + base) / 2 - 22}" width="14" height="44" rx="7" fill="var(--card)" stroke="var(--text)" stroke-width="2"/></g>`;
  const dragLbl = DRAG.side && DRAG.d !== null ? `<text x="${x(DRAG.d)}" y="${PAD.t + 14}" text-anchor="${DRAG.side === 'a' ? 'start' : 'end'}" class="drag">km ${km(DRAG.d)}</text>` : '';
  document.getElementById('profile').innerHTML = `<svg class="profile" id="psvg" viewBox="0 0 ${PW} ${PH}" role="img" aria-label="Perfil de elevación">
    ${yTicks.join('')}${fills}<polyline points="${outline}" fill="none" stroke="var(--prof-line)" stroke-width="1.6"/>${nums}${xTicks.join('')}${hl}<text x="${PW - PAD.r}" y="${base + 13}" text-anchor="end">km</text>${strip}${feeds}${drops}${cur}${dim}${handle('a', da)}${handle('b', db)}${dragLbl}</svg>
    ${S.profColor === 'pendiente'
      ? '<div class="legend"><b>Pendiente</b><span><i style="background:var(--g1)"></i>&lt; 3 % y bajadas</span><span><i style="background:var(--g2)"></i>3-6 %</span><span><i style="background:var(--g3)"></i>6-9 %</span><span><i style="background:var(--g4)"></i>9-12 %</span><span><i style="background:var(--g5)"></i>&gt; 12 %</span></div>'
      : catLegend()}
    <div class="legend"><b>Viento</b><span><i style="background:var(--head)"></i>De cara</span><span><i style="background:var(--cross)"></i>Cruzado o flojo</span><span><i style="background:var(--tail)"></i>Favorable</span></div>`;
  const pc = document.getElementById('profcolor');
  if (pc) pc.innerHTML = [['subidas', 'Subidas'], ['pendiente', 'Pendiente']].map(([k, l]) => `<button data-profcolor="${k}" class="${S.profColor === k ? 'on' : ''}">${l}</button>`).join('');
}
function catLegend() {
  const cats = [...new Set(shown().map(catOf))].sort((a, b) => ['', '4', '3', '2', '1', 'HC'].indexOf(a) - ['', '4', '3', '2', '1', 'HC'].indexOf(b));
  return cats.length ? `<div class="legend">${cats.map((k) => `<span><i style="background:${R.CAT_COLOR[k]}"></i>${R.catLabel(k)}</span>`).join('')}</div>` : '';
}
function dFromEvent(ev) {
  const r = document.getElementById('psvg').getBoundingClientRect();
  const fx = ((ev.clientX - r.left) / r.width) * PW;
  return Math.max(0, Math.min(S.track.distance, ((fx - PAD.l) / (PW - PAD.l - PAD.r)) * S.track.distance));
}
function handleMove(ev) {
  const d = dFromEvent(ev), total = S.track.distance, minGap = Math.min(2000, total / 4);
  DRAG.d = DRAG.side === 'a' ? Math.min(d, total - minGap) : Math.max(d, minGap);
  renderProfile();
}
function handleUp() {
  const side = DRAG.side, d = DRAG.d;
  DRAG.side = null; DRAG.d = null;
  if (d === null || (side === 'a' && d < 100) || (side === 'b' && d > S.track.distance - 100)) return renderProfile();
  const off = S.range ? S.range[0] : 0;
  const a = side === 'a' ? off + d : off, b = side === 'b' ? off + d : off + S.track.distance;
  setRange([a, b]);
}
/** Planifica solo el tramo [a, b] (en km de la ruta entera), o toda la ruta con null. */
function setRange(r) {
  const oldOff = S.range ? S.range[0] : 0, newOff = r ? r[0] : 0, newLen = r ? r[1] - r[0] : S.full.distance;
  S.wps = S.wps.map((w) => ({ ...w, d: w.d + oldOff - newOff })).filter((w) => w.d >= 0 && w.d <= newLen);
  S.range = r; S.custom = null; S.cursorD = null; S.tCursor = null; fitted = false;
  build(); update(); fetchWeather();
  toast(r ? `Planificando del km ${km(r[0])} al ${km(r[1])}` : 'Planificando toda la ruta');
}
function profilePick(ev) {
  const svg = document.getElementById('psvg');
  if (!svg) return;
  const r = svg.getBoundingClientRect();
  const fx = ((ev.clientX - r.left) / r.width) * PW;
  focusAt(Math.max(0, Math.min(S.track.distance, ((fx - PAD.l) / (PW - PAD.l - PAD.r)) * S.track.distance)));
}
/**
 * Flechas del viento: una cada «Flechas cada» km como mucho, y nunca más juntas que su tamaño en
 * pantalla (al alejar el mapa se omiten; al acercarlo salen más). Tocar una abre su viento y marca
 * ese punto en el perfil y en las gráficas.
 */
function drawArrows() {
  if (!arrowLayer) return;
  arrowLayer.clearLayers();
  if (!S.along || !S.track || !map?._loaded) return;
  const P = S.track.points, placed = [];
  for (let d = S.arrowsKm * 500; d < S.track.distance; d += S.arrowsKm * 1000) {
    const p = R.pointAt(P, d), w = wxAt(d);
    if (!w || w.wind === undefined) continue;
    const size = Math.round(26 + Math.min(28, w.wind * 0.95)); // de 26 px (calma) a 54 px (30 km/h o más)
    const px = map.latLngToLayerPoint([p.lat, p.lon]);
    if (placed.some((q) => q.distanceTo(px) < size + 16)) continue;
    placed.push(px);
    const html = `<div class="warrow" style="width:${size}px;height:${size}px">
      <svg viewBox="0 0 24 24" style="transform:rotate(${(w.windFrom + 180) % 360}deg)"><path d="M12 1.5 21.5 12.5h-5.8V22.5H8.3V12.5H2.5Z" fill="${segColor(w)}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>
      <span class="wspeed">${int(w.wind)}</span></div>`;
    L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'warrow-wrap', iconSize: [size, size], iconAnchor: [size / 2, size / 2], html }), zIndexOffset: -500, riseOnHover: true, keyboard: false })
      .on('click', () => focusAt(d))
      .bindPopup(() => windPopup(d, w), { offset: [0, -size / 2 + 4], autoPanPadding: [20, 20] })
      .addTo(arrowLayer);
  }
}
/** Viento en una flecha del mapa: de dónde viene, cuánto y cómo te pilla. */
function windPopup(d, w) {
  const r = w.rel;
  const how = r.kind === 'cara' ? `<b class="k-cara">De cara</b>: te frena como ${int(Math.max(0, r.head))} km/h de frente`
    : r.kind === 'favor' ? `<b class="k-favor">A favor</b>: te empuja como ${int(Math.max(0, -r.head))} km/h`
    : `<b class="k-lateral">Cruzado</b> desde la ${r.side}${Math.abs(r.head) >= 3 ? `, algo ${r.head > 0 ? 'de cara' : 'a favor'}` : ''}`;
  return `<div class="wpop"><b>km ${km(d)} · ${hm(at(d))}</b><br>
    💨 ${int(w.wind)} km/h del ${compass(w.windFrom)} · rachas ${int(w.gust)} km/h<br>${how}<br>
    <small class="muted">${int(w.temp)} °C · lluvia ${int(w.rainProb ?? 0)} %</small></div>`;
}
/** Marca un punto de la ruta en el perfil, en el mapa y en las gráficas del tiempo. */
function focusAt(d) {
  S.cursorD = d;
  S.tCursor = at(d) - S.start;
  const p = R.pointAt(S.track.points, d), w = wxAt(d);
  const g = R.gradeAt(S.track.points, d, 100);
  let txt = `<b>${km(d)} km, ${hm(at(d))}</b> · Elevación: <b>${int(p.es)} m</b><br>Pendiente: ${pct(g)}`;
  if (w && w.wind !== undefined) {
    txt += ` · Temperatura: ${int(w.temp)} °C${w.feels !== null && w.feels !== undefined ? ` (sensación ${int(w.feels)} °C)` : ''}`;
    const comp = Math.abs(w.rel.head) >= 0.5 ? ` (${int(Math.abs(w.rel.head))} km/h de componente)` : '';
    txt += `<br>Viento: ${int(w.wind)} km/h del ${compass(w.windFrom)}, ${w.rel.kind === 'cara' ? 'de cara' : w.rel.kind === 'favor' ? 'favorable' : 'cruzado o flojo'}${comp} · rachas ${int(w.gust)} km/h`;
  }
  document.getElementById('pinfo').innerHTML = txt;
  renderProfile();
  if (map) {
    if (!cursorMarker) cursorMarker = L.circleMarker([p.lat, p.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#284556', fillOpacity: 1 }).addTo(mapLayer);
    else cursorMarker.setLatLng([p.lat, p.lon]);
  }
  renderCharts();
}

function renderFountains() {
  const el = document.getElementById('fountains');
  if (!el) return;
  const list = S.fountains ? fountains() : [];
  const when = S.fountains ? new Date(S.fountains.at).toLocaleDateString('es-ES') : '';
  el.innerHTML = `<h3>💧 Fuentes</h3>
    ${S.fLoading ? '<p class="hint">Buscando fuentes de agua en OpenStreetMap… (puede tardar unos segundos por cada 30 km)</p>' : ''}
    ${S.fErr ? `<p class="warn">${esc(S.fErr)}</p>` : ''}
    ${S.fountains ? `<p>${list.length ? `<b>${list.length}</b> fuente${list.length > 1 ? 's' : ''}` : 'Ninguna fuente'} a menos de 500 m de la ruta <span class="muted">(datos de OpenStreetMap del ${when})</span>.
      <button class="linkbtn" data-act="fuentes-reload">Buscar las más recientes</button></p>
      ${list.length ? `<ul class="mini-list fuentes">${list.map((f) => `<li class="tappable"><button class="sv-item" data-act="fuente-go" data-d="${f.d}">
        <b>km ${km(f.d)} · ${esc(f.name || f.kind)}</b><small class="muted">${hm(at(f.d))} · ${f.off < 30 ? 'en la ruta' : `a ${int(f.off)} m de la ruta`}${f.name ? ` · ${f.kind.toLowerCase()}` : ''}${f.unsure ? ' · puede no tener agua siempre' : ''}</small></button></li>`).join('')}</ul>
        <p class="hint">Son las que alguien ha marcado como agua potable en OpenStreetMap: puede faltar alguna o estar cerrada. Si conoces una que no sale, se puede añadir en openstreetmap.org.</p>` : ''}`
      : (!S.fLoading && !S.fErr ? '<p class="hint">Aún no se han buscado.</p>' : '')}`;
}

function renderClimbs() {
  const el = document.getElementById('climbs');
  if (!S.climbs.length) { el.innerHTML = '<p class="hint">Sin subidas: nada que suba 20 m o más al 3 % o más.</p>'; return; }
  const list = shown();
  const n = (w) => R.climbFilter(S.climbs, w).length;
  el.innerHTML = `<h3>Subidas ${list.length}</h3>
    <div class="seg tabs3">${[['todas', 'Todas'], ['medianas', 'Medianas y grandes'], ['grandes', 'Solo grandes']].map(([k, l]) => `<button data-climbview="${k}" class="${S.climbView === k ? 'on' : ''}">${l} (${n(k)})</button>`).join('')}</div>
    <details class="more"><summary>Cómo se calculan</summary><p class="hint">Una subida va de un punto bajo a una cima; si en medio se baja poco (unos 25 m, o menos del 15 % de lo subido) sigue siendo la misma.
      Se quitan la aproximación y el final llanos. La categoría sale de longitud × pendiente media, como en Strava: 4ª desde 8.000 (p. ej. 2 km al 4 %), 3ª desde 16.000, 2ª desde 32.000, 1ª desde 64.000 y especial desde 80.000.
      «Todas» incluye los repechos pequeños (desde 20 m al 3 %); «Medianas y grandes», las de 40 m o más o con categoría; «Solo grandes», las que tienen categoría. Los puertos largos y tendidos (300 m al 1,5 %, o 150 m al 2 %) cuentan como una sola subida.</p></details>
    ${list.length ? `<div class="climbs-row">${list.map((c) => {
      const w = wxAt(c.end);
      return `<button class="climb" data-act="climb-go" data-d="${c.start}"><span class="n" style="background:${catColor(c)};color:${['3', ''].includes(catOf(c)) ? '#111' : '#fff'}">${climbNo(c)}</span><span><b>km ${km(c.start)}</b>
        <small>${km(c.length)} km · ${pct(c.avg)} · ${int(c.gain)} m</small><small>${hm(at(c.start))} → ${hm(at(c.end))}${w && w.wind !== undefined ? ` · ${int(w.temp)} °C` : ''}</small></span></button>`;
    }).join('')}</div>` : '<p class="hint">Ninguna con este filtro.</p>'}`;
}

// ---------- Tiempo, avituallamiento y exportar ----------
const WHAT = { g: ['Solo gramos', null], gel: ['Gel', 'gel'], bar: ['Barrita', 'bar'], bid: ['Bidón', 'bid'], fruta: ['Fruta', null], otro: ['Otro', null] };
/** Tomas: la lista editada por el usuario o la calculada (inteligente o cada X minutos). */
function feeding() {
  if (S.custom) return S.custom.map((c) => ({ ...c, ms: Math.min(c.ms, S.tl.total), d: R.distAtTime(S.track.points, S.tl.t, Math.min(c.ms, S.tl.total)) }));
  return R.feedingPlan(S.track.points, S.tl.t, { gph: S.gph, everyMin: S.every, smart: S.feedMode === 'smart' });
}
const tomaLabel = (f, i) => (f.label || (f.what && f.what !== 'g' ? `Toma ${i + 1}: ${WHAT[f.what][0].toLowerCase()}` : `Toma ${i + 1}: ${f.grams} g`)).slice(0, 15);
/** Pasa a lista propia (la primera vez que se toca una toma). */
function own() { if (!S.custom) S.custom = feeding().map((f) => ({ ms: f.ms, grams: f.grams, what: 'g', label: '' })); return S.custom; }

// ---------- Gráficas del tiempo en la ruta ----------
const CHARTS = {
  viento: { title: 'Viento', series: [['wind', 'Viento', 'km/h'], ['gust', 'Rachas', 'km/h']] },
  temp: { title: 'Temperatura', series: [['temp', 'Temperatura', '°C'], ['feels', 'Sensación térmica', '°C']] },
  lluvia: { title: 'Precipitación y nubes', series: [['rainProb', 'Prob. precipitación', '%'], ['clouds', 'Cobertura de nubes', '%']], range: [0, 100] },
  humedad: { title: 'Humedad y punto de rocío', series: [['hum', 'Humedad', '%'], ['dew', 'Punto de rocío', '°C']] },
  uv: { title: 'Índice UV y luz diurna', series: [['uv', 'Índice UV', '']], daylight: true },
  mm: { title: 'Lluvia acumulada por hora', series: [['rain', 'Precipitación', 'mm']], min0: true },
};
const CW = 360, CH = 190, CP = { l: 34, r: 10, t: 24, b: 8 };
const KIND_BG = { cara: '#f3b4ae', lateral: '#f5e3a0', favor: '#a9dcb8' };
const SERIES_COLOR = ['var(--accent)', '#e8711a'];
function niceTicks(lo, hi, n = 4) {
  const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw);
  const a = Math.floor(lo / step) * step, out = [];
  for (let v = a; ; v += step) { out.push(+v.toFixed(6)); if (v >= hi - step * 1e-6) break; }
  return out;
}
function chartSvg(id) {
  const c = CHARTS[id], A = S.along.filter((w) => w.wind !== undefined), total = S.tl.total;
  const tx = (ms) => CP.l + (ms / total) * (CW - CP.l - CP.r);
  const vals = c.series.flatMap(([k]) => A.map((w) => w[k]).filter((v) => v !== null && v !== undefined));
  if (!vals.length) return '<p class="hint">Sin datos para esta gráfica.</p>';
  let lo = c.range ? c.range[0] : Math.min(...vals), hi = c.range ? c.range[1] : Math.max(...vals);
  if (c.min0 || id === 'uv' || id === 'viento') lo = 0;
  if (hi - lo < 1) hi = lo + 1;
  const ticks = niceTicks(lo, hi);
  lo = ticks[0]; hi = ticks[ticks.length - 1];
  const y = (v) => CP.t + (1 - (v - lo) / (hi - lo)) * (CH - CP.t - CP.b);
  const base = CH - CP.b;
  let g = '';
  // perfil de fondo coloreado por el viento
  if (S.bgProfile) {
    const t = S.track, P = t.points, N = 160, eh = (t.maxEle - t.minEle) || 1;
    const ey = (e) => base - ((e - t.minEle) / eh) * (base - CP.t) * 0.85;
    for (let k = 0; k < N; k++) {
      const d1 = (k / N) * t.distance, d2 = ((k + 1) / N) * t.distance, w = wxAt((d1 + d2) / 2);
      const x1 = tx(R.timeAt(P, S.tl.t, d1)), x2 = tx(R.timeAt(P, S.tl.t, d2));
      g += `<polygon points="${x1.toFixed(1)},${base} ${x1.toFixed(1)},${ey(R.pointAt(P, d1).es).toFixed(1)} ${x2.toFixed(1)},${ey(R.pointAt(P, d2).es).toFixed(1)} ${x2.toFixed(1)},${base}" fill="${KIND_BG[w?.rel?.kind] || '#dde3e8'}" stroke="none" opacity=".75"/>`;
    }
  }
  if (c.daylight) A.forEach((w, i) => { if (i < A.length - 1 && w.isDay) g += `<rect x="${tx(w.eta - S.start)}" y="${CP.t - 9}" width="${tx(A[i + 1].eta - S.start) - tx(w.eta - S.start) + .5}" height="5" fill="#f5c518"/>`; });
  const grid = ticks.map((v) => `<line x1="${CP.l}" x2="${CW - CP.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${CP.l - 4}" y="${y(v) + 3.5}" text-anchor="end">${nf1.format(v).replace(/,0$/, '')}</text>`).join('');
  // horas arriba: salida, cada hora en punto y llegada
  const hours = [[0, hm(S.start)]];
  for (let h = Math.ceil(S.start / 3600000) * 3600000; h < S.start + total; h += 3600000) if (tx(h - S.start) - tx(0) > 30 && tx(total) - tx(h - S.start) > 30) hours.push([h - S.start, hm(h)]);
  hours.push([total, hm(S.start + total)]);
  const hl = hours.map(([ms, l], i) => `<line x1="${tx(ms)}" x2="${tx(ms)}" y1="${CP.t}" y2="${base}" stroke="var(--line)" stroke-dasharray="2 3"/><text x="${tx(ms)}" y="${CP.t - 12}" text-anchor="${i === hours.length - 1 ? 'end' : i ? 'middle' : 'start'}">${l}</text>`).join('');
  const lines = c.series.map(([k], si) => {
    const pts = A.filter((w) => w[k] !== null && w[k] !== undefined).map((w) => `${tx(w.eta - S.start).toFixed(1)},${y(w[k]).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${SERIES_COLOR[si]}" stroke-width="2.2" ${si ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round"/>`;
  }).join('');
  let cur = '';
  if (S.tCursor !== null) {
    const x = tx(S.tCursor);
    cur = `<line x1="${x}" x2="${x}" y1="${CP.t}" y2="${base}" stroke="var(--muted)"/>` + c.series.map(([k], si) => {
      const v = valueAt(k, S.tCursor);
      return v === null ? '' : `<circle cx="${x}" cy="${y(v)}" r="4.5" fill="${SERIES_COLOR[si]}" stroke="#fff" stroke-width="1.5"/>`;
    }).join('');
  }
  return `<svg class="wchart" viewBox="0 0 ${CW} ${CH}" role="img" aria-label="${esc(c.title)}">${g}${grid}${hl}${lines}${cur}</svg>`;
}
/** Valor de una serie en el instante ms (desde la salida), interpolando entre puntos de previsión. */
function valueAt(k, ms) {
  const A = S.along.filter((w) => w[k] !== null && w[k] !== undefined);
  if (!A.length) return null;
  const t = S.start + ms;
  if (t <= A[0].eta) return A[0][k];
  for (let i = 1; i < A.length; i++) if (A[i].eta >= t) { const f = (t - A[i - 1].eta) / (A[i].eta - A[i - 1].eta || 1); return A[i - 1][k] + (A[i][k] - A[i - 1][k]) * f; }
  return A[A.length - 1][k];
}
function chartsHtml() {
  const ms = S.tCursor ?? null;
  const dAt = (m) => { const P = S.track.points, t = S.tl.t; let i = 1; while (i < t.length - 1 && t[i] < m) i++; const f = (m - t[i - 1]) / (t[i] - t[i - 1] || 1); return P[i - 1].d + (P[i].d - P[i - 1].d) * f; };
  const fmt = (v, u) => `${u === '°C' || u === 'mm' ? nf1.format(v) : int(v)}${u ? (u === '%' ? ' %' : ' ' + u) : ''}`;
  const blocks = S.charts.map((id, ci) => {
    const c = CHARTS[id];
    const read = ms !== null ? `<p class="readout">${km(dAt(ms))} km, ${hm(S.start + ms)} · ${c.series.map(([k, l, u]) => { const v = valueAt(k, ms); return v === null ? '' : `${l}: <b>${fmt(v, u)}</b>`; }).filter(Boolean).join(' · ')}</p>`
      : '<p class="readout muted">Toca o arrastra en la gráfica para ver el valor en cada momento.</p>';
    return `<div class="wblock">
      <div class="whead"><select data-chart="${ci}" aria-label="Cambiar gráfica">${Object.entries(CHARTS).map(([k, v]) => `<option value="${k}" ${k === id ? 'selected' : ''}>${v.title}</option>`).join('')}</select>
        <button class="linkbtn small" data-act="chart-del" data-i="${ci}">Quitar</button></div>
      <div class="legend">${c.series.map(([, l], si) => `<span><i class="${si ? 'dash' : ''}" style="background:${SERIES_COLOR[si]}"></i>${l}</span>`).join('')}${c.daylight ? '<span><i style="background:#f5c518"></i>Luz diurna</span>' : ''}${S.bgProfile ? '<span><i style="background:#f3b4ae"></i>Viento de cara</span><span><i style="background:#f5e3a0"></i>Cruzado o flojo</span><span><i style="background:#a9dcb8"></i>Favorable</span>' : ''}</div>
      ${read}${chartSvg(id)}</div>`;
  }).join('');
  const left = Object.keys(CHARTS).filter((k) => !S.charts.includes(k));
  return `${blocks}<div class="row" style="margin-top:.6rem">${left.length ? `<select id="chart-add" aria-label="Añadir un gráfico"><option value="">+ Añadir un gráfico</option>${left.map((k) => `<option value="${k}">${CHARTS[k].title}</option>`).join('')}</select>
    <button class="linkbtn" data-act="chart-all">Ver todos</button>` : ''}</div>`;
}
function renderCharts() { const el = document.getElementById('wcharts'); if (el && S.along) el.innerHTML = chartsHtml(); }
function chartPick(ev) {
  const svg = ev.target.closest('.wchart');
  const r = svg.getBoundingClientRect();
  const fx = ((ev.clientX - r.left) / r.width) * CW;
  S.tCursor = Math.max(0, Math.min(S.tl.total, ((fx - CP.l) / (CW - CP.l - CP.r)) * S.tl.total));
  renderCharts();
}

function renderRest() {
  const el = document.getElementById('rest');
  if (S.view !== 'completa') { el.innerHTML = ''; return; }
  let wxHtml;
  if (S.wxErr) wxHtml = `<p class="warn">${esc(S.wxErr)}</p><button class="btn" data-act="retry">Reintentar</button>`;
  else if (!S.along) wxHtml = '<p class="hint">Cargando la previsión…</p>';
  else wxHtml = `<label class="check"><input type="checkbox" id="bgprof" ${S.bgProfile ? 'checked' : ''}> Perfil de la ruta de fondo</label>
    <div id="wcharts">${chartsHtml()}</div>
    <details class="fact"><summary><b>Ver la tabla</b></summary><div class="wrap-x"><table class="wx"><thead><tr><th>Hora</th><th>Km</th><th></th><th>Temp.</th><th>Lluvia</th><th>Viento (rachas)</th></tr></thead><tbody>
    ${S.along.map((w) => { const [ic, lab] = R.weatherLabel(w.code); return `<tr><td><b>${hm(w.eta)}</b></td><td class="k">${km(w.d)}</td><td title="${lab}">${ic}</td>
      <td>${int(w.temp)}°</td><td>${int(w.rainProb ?? 0)} %${w.rain >= 0.1 ? ` <small class="muted">${nf1.format(w.rain)} mm</small>` : ''}</td>
      <td><span class="pill ${w.rel.kind}">${KIND[w.rel.kind]}</span> ${int(w.wind)} <small class="muted">(${int(w.gust)}) ${compass(w.windFrom)}</small></td></tr>`; }).join('')}
    </tbody></table></div></details>`;

  const tomas = S.feeding ? feeding() : [];
  const grams = tomas.reduce((s, f) => s + f.grams, 0);
  const need = Math.round((S.gph * S.tl.total) / 3600000 / 10) * 10;
  const carried = Object.values(S.carry).reduce((a, c) => a + c.n * c.g, 0);
  const timeOpts = (sel) => { let o = ''; for (let m = 5; m * 60000 < S.tl.total; m += 5) { const ms = m * 60000; o += `<option value="${ms}" ${Math.abs(ms - sel) < 150000 ? 'selected' : ''}>${hm(S.start + ms)}</option>`; } return o; };
  const avit = S.feeding ? `
    <h3>Hidratos por hora</h3>
    <div class="opts">${[[60, '60 g/h', 'Hasta 2,5 h o ritmo suave'], [90, '90 g/h', 'Marchas y tiradas largas'], [120, '120 g/h', 'Solo si lo tienes entrenado']].map(([v, a, b]) =>
      `<button data-gph="${v}" class="${S.gph === v ? 'on' : ''}"><b>${a}</b><small>${b}</small></button>`).join('')}
      <button data-act="gph-manual" class="${![60, 90, 120].includes(S.gph) ? 'on' : ''}"><b>Manual</b><small>${![60, 90, 120].includes(S.gph) ? `${S.gph} g/h` : 'Tu cantidad'}</small></button></div>
    <details class="more"><summary>¿Por qué no te pedimos el peso?</summary><p class="hint">Los hidratos que aprovechas por hora no dependen de lo que pesas, sino de lo que absorbe el intestino, y eso se entrena. Elige según la intensidad de la salida y lo que estés acostumbrado a tomar.</p></details>
    <h3>Reparto de las tomas</h3>
    <div class="seg narrow"><button data-feedmode="smart" class="${S.feedMode === 'smart' ? 'on' : ''}">Inteligente</button><button data-feedmode="manual" class="${S.feedMode === 'manual' ? 'on' : ''}">Manual</button></div>
    <label style="flex-direction:row;align-items:center;gap:.6rem">Una toma cada <select id="every">${[20, 30, 40, 45, 60].map((m) => `<option value="${m}" ${S.every === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
    <details class="more"><summary>Cómo reparte las tomas</summary><p class="hint">${S.feedMode === 'smart'
      ? `La primera a los 25 minutos y después cada ${S.every} minutos, hasta 20 minutos antes de llegar. Calcula los hidratos de toda la salida (${S.gph} g/h × ${dur(S.tl.total)} ≈ ${need} g) y los reparte a partes iguales. Luego mueve cada toma hasta 8 minutos para que no caiga en una bajada ni en una rampa dura: se come mejor en llano o subiendo suave.`
      : `La primera a los 25 minutos y después cada ${S.every} minutos, con lo que toca a ${S.gph} g/h en cada intervalo, sin mirar el terreno.`}</p></details>
    ${S.custom ? '<p class="hint">Estás usando tu propia lista de tomas. <button class="linkbtn" data-act="feed-reset">Volver al reparto automático</button></p>' : ''}
    <label class="check"><input type="checkbox" id="feedmap" ${S.feedOnMap ? 'checked' : ''}> Marcar las tomas en el mapa y en el perfil</label>
    <div class="facts"><div><small>Duración</small><b>${dur(S.tl.total)}</b></div><div><small>Hidratos · ${S.gph} g/h</small><b><mark>${int(grams)} g</mark></b></div>
      <div><small>Tomas${S.custom ? '' : ` · cada ${S.every} min`}</small><b>${S.custom || new Set(tomas.map((f) => f.grams)).size > 1 ? `${tomas.length}` : `${tomas.length} × ${tomas[0]?.grams ?? 0} g`}</b></div></div>
    <details class="more" ${S.custom ? 'open' : ''}><summary>Cambia el aviso de cada toma</summary>
      <p>En cada toma puedes elegir qué te vas a tomar, añadir otra o quitarla. En cuanto cambies una, la lista pasa a ser tuya.</p>
      ${tomas.map((f, i) => `<div class="toma-ed">
        <div class="row"><span class="dot">${i + 1}</span><b>${hm(S.start + f.ms)}</b><small class="muted">${dur(f.ms)}</small><span class="muted">km ${km(f.d)}</span><b style="margin-left:auto">${f.grams} g</b></div>
        ${f.moved ? `<p class="hint">Movida unos minutos para no caer en ${f.moved === 'bajada' ? 'la bajada' : 'la rampa'}.</p>` : ''}
        <div class="row"><label class="inline">A las <select data-toma="${i}" data-f="ms">${timeOpts(f.ms)}</select></label></div>
        <div class="row"><select data-toma="${i}" data-f="what">${Object.entries(WHAT).map(([k, [l]]) => `<option value="${k}" ${(f.what || 'g') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <input type="number" data-toma="${i}" data-f="grams" value="${f.grams}" min="0" max="300" step="5" inputmode="numeric" style="width:5.5rem"> g</div>
        <div class="row"><button class="linkbtn small" data-act="toma-dup" data-i="${i}">Otra 15 min después</button><button class="linkbtn small" data-act="toma-del" data-i="${i}">Quitar esta toma</button></div>
        <label class="inline">Aviso <input data-toma="${i}" data-f="label" maxlength="15" value="${esc(tomaLabel(f, i))}"> <small class="muted">${tomaLabel(f, i).length}/15</small></label>
      </div>`).join('')}
      <button class="btn" data-act="toma-add">Añadir una toma</button>
    </details>
    <h3>Lo que llevas</h3>
    ${[['bid', 'Bidones'], ['gel', 'Geles'], ['bar', 'Barritas']].map(([k, l]) => `<div class="carry">
      <b>${l}</b><label class="inline"><input type="number" data-carry="${k}" value="${S.carry[k].g}" min="0" max="200" step="5" inputmode="numeric"> g/ud</label>
      <span class="stepper"><button class="icon-btn" data-act="carry" data-k="${k}" data-n="-1" ${S.carry[k].n ? '' : 'disabled'}>−</button><b>${S.carry[k].n}</b><button class="icon-btn" data-act="carry" data-k="${k}" data-n="1">+</button></span>
      <b class="tot">${S.carry[k].n * S.carry[k].g} g</b></div>`).join('')}
    <p class="${carried < grams ? 'bad' : ''}">Llevas ${int(carried)} g de los ${int(grams)} g de las tomas${carried < grams ? `: te faltan ${int(grams - carried)} g (rellena en ruta o lleva más)` : carried > grams + 30 ? `: te sobran ${int(carried - grams)} g` : ''}.</p>
    ${fountains().length ? `<p class="hint">💧 Agua por el camino: ${fountains().slice(0, 8).map((f) => `km ${km(f.d)}`).join(', ')}${fountains().length > 8 ? '…' : ''} (ver «Fuentes» arriba).</p>` : ''}
    <details class="more"><summary>Cómo rellenar los bidones</summary><p class="hint">Si solo llevas agua, deja 0 g/ud. Si llevas bebida con hidratos, pon los gramos de cada bidón: los indica el bote (lo habitual es entre 30 y 60 g por bidón de 500-750 ml). Más concentrada cuesta más de digerir. Lo que lleven los bidones también cuenta para las tomas.</p></details>
    <p class="hint">Una guía: ajústala a lo que toleras en los entrenamientos.</p>
    <button class="linkbtn" data-act="feed-off">Quitar el avituallamiento</button>`
    : `<p>Hidratos y tomas para tus ${dur(S.tl.total)} de salida.</p><button class="btn" data-act="feed-on">Calcular</button>`;

  const name15 = S.name.slice(0, 15);
  el.innerHTML = `
    <div class="step"><b>3</b><h2>Tiempo en la ruta</h2></div>${wxHtml}
    <div class="step"><b>4</b><h2>Avituallamiento</h2></div>${avit}
    <div class="step"><b>5</b><h2>Llévatela al ciclocomputador</h2></div>
    <p>Descarga la ruta con tus waypoints para Garmin Connect, Wahoo, Karoo, iGPSport y otros.</p>
    ${S.wps.length ? `<ul class="mini-list">${S.wps.map((w, i) => `<li><div><b>${wpType(w.type)[1]} ${esc(w.name)}</b><small class="muted">km ${km(w.d)} · ${hm(at(w.d))}</small></div><button class="btn small ghost" data-act="del-wp" data-i="${i}" aria-label="Quitar">✕</button></li>`).join('')}</ul>` : ''}
    <button class="btn small" data-act="addwp">+ Añadir waypoint</button>
    <div class="export" style="margin-top:1rem">
      <label>Nombre de la ruta en el ciclocomputador<input id="expname" maxlength="40" value="${esc(name15)}"></label>
      <label class="check"><input type="checkbox" data-exp="wps" ${S.exp.wps ? 'checked' : ''}> Tus waypoints (${S.wps.length})</label>
      <label class="check"><input type="checkbox" data-exp="climbs" ${S.exp.climbs ? 'checked' : ''}> Inicio de cada subida (${S.climbs.length})</label>
      <label class="check"><input type="checkbox" data-exp="tomas" ${S.exp.tomas ? 'checked' : ''} ${S.feeding ? '' : 'disabled'}> Tus avisos de avituallamiento (${tomas.length})</label>
      <label class="check"><input type="checkbox" data-exp="fuentes" ${S.exp.fuentes ? 'checked' : ''}> Fuentes de agua (${fountains().length})</label>
      <label class="check"><input type="checkbox" data-exp="times" ${S.exp.times ? 'checked' : ''}> Horas de paso previstas (para el «compañero virtual»)</label>
      <button class="btn primary" data-act="gpx">Descargar .gpx</button>
      <h3 style="margin-top:1rem">Pásasela a tu grupeta</h3>
      <p class="hint">Una ficha en imagen con el mapa del viento, el perfil con las subidas y el tiempo, lista para el grupo de WhatsApp.</p>
      <button class="btn wa" data-act="card">🖼️ Crear la ficha para compartir</button>
      <label class="check"><input type="checkbox" data-exp="cardgpx" ${S.exp.cardgpx ? 'checked' : ''}> Adjuntar también el .gpx</label>
      <button class="linkbtn" data-act="whatsapp">Enviar solo el texto por WhatsApp</button>
    </div>`;
}

function exportGPX() {
  const name = (document.getElementById('expname')?.value || S.name).trim() || 'Ruta';
  const P = S.track.points, wps = [];
  const pt = (d) => R.pointAt(P, d);
  if (S.exp.wps) S.wps.forEach((w) => { const p = pt(w.d); wps.push({ lat: p.lat, lon: p.lon, name: w.name, desc: `${wpType(w.type)[2]} · km ${km(w.d)}`, sym: wpType(w.type)[3] }); });
  if (S.exp.climbs) S.climbs.forEach((c, i) => { const p = pt(c.start); wps.push({ lat: p.lat, lon: p.lon, name: `Subida ${i + 1}`.slice(0, 15), desc: `${km(c.length)} km al ${pct(c.avg)}`, sym: 'Summit' }); });
  if (S.exp.tomas && S.feeding) feeding().forEach((f, i) => { const p = pt(f.d); wps.push({ lat: p.lat, lon: p.lon, name: tomaLabel(f, i), desc: `${hm(S.start + f.ms)} · ${f.grams} g`, sym: 'Food' }); });
  if (S.exp.fuentes) fountains().forEach((f) => wps.push({ lat: f.lat, lon: f.lon, name: (f.name || f.kind).slice(0, 15), desc: `${f.kind} · km ${km(f.d)}`, sym: 'Drinking Water' }));
  const text = R.toGPX(name, P, wps, S.exp.times ? { startMs: S.start, t: S.tl.t } : {});
  const file = `${name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '-') || 'ruta'}.gpx`;
  return { text, file };
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/gpx+xml' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function shareText() {
  const t = S.track, end = S.start + S.tl.total;
  const lines = [`🚴 ${S.name}`, `📅 ${dayName(S.start)} ${new Date(S.start).toLocaleDateString('es-ES')} · salida ${hm(S.start)}, llegada ${hm(end)}`,
    `📏 ${km(t.distance)} km · ⛰️ ${int(t.gain)} m+ · ${paceText()}`];
  const h = hardest();
  if (h) lines.push(`🔺 Subida más dura: ${km(h.length)} km al ${pct(h.avg)} (km ${km(h.start)})`);
  if (S.along) {
    const a = S.along.filter((w) => w.wind !== undefined);
    lines.push(`🌡️ ${int(Math.min(...a.map((w) => w.temp)))}-${int(Math.max(...a.map((w) => w.temp)))} °C · 💨 máx. ${int(Math.max(...a.map((w) => w.wind)))} km/h · 🌧️ ${int(Math.max(...a.map((w) => w.rainProb ?? 0)))} %`);
  }
  return lines.join('\n');
}

// ---------- Ficha para compartir ----------
const CARD = { blob: null, url: '' };
async function openCard() {
  dialog.innerHTML = '<div class="dlg"><h3>Ficha para compartir <button class="linkbtn" data-act="close">✕</button></h3><p class="hint">Preparando la imagen…</p></div>';
  if (!dialog.open) dialog.showModal();
  const t = S.track, end = S.start + S.tl.total;
  const lines = [
    `${dayName(S.start)} ${new Date(S.start).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}. Salida a las ${hm(S.start)}, llegada hacia las ${hm(end)}.`,
    `${km(t.distance)} km y ${int(t.gain)} m de desnivel, unas ${dur(S.tl.total)}.`,
  ];
  if (S.along) {
    const a = S.along.filter((w) => w.wind !== undefined);
    if (a.length) {
      const head = Math.round((a.filter((w) => w.rel.kind === 'cara').length / a.length) * 100), rain = Math.max(...a.map((w) => w.rainProb ?? 0));
      lines.push(`${int(Math.min(...a.map((w) => w.temp)))} a ${int(Math.max(...a.map((w) => w.temp)))} °C · viento hasta ${int(Math.max(...a.map((w) => w.wind)))} km/h${head ? `, ${head} % de cara` : ''} · ${rain < 10 ? 'sin lluvia prevista' : `lluvia hasta ${int(rain)} %`}`);
    }
  }
  const h = hardest();
  try {
    const { blob, tiles } = await buildCard({
      name: S.name, club: 'Club Ciclista Monzón', logo: '../icons/logo.png', start: S.start, track: t, tl: S.tl, samples: S.samples, along: S.along, lines,
      climbs: shown().map((c) => ({ start: c.start, end: c.end, top: c.top, n: climbNo(c), color: catColor(c) })),
      hard: h ? `Subida más dura: ${km(h.length)} km al ${pct(h.avg)}` : '',
      footer: S.along ? `Previsión de Open-Meteo del ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : '',
    });
    if (CARD.url) URL.revokeObjectURL(CARD.url);
    CARD.blob = blob; CARD.url = URL.createObjectURL(blob);
    if (!dialog.open) return;
    dialog.innerHTML = `<div class="dlg cardlg"><h3>Ficha para compartir <button class="linkbtn" data-act="close">✕</button></h3>
      ${tiles ? '' : '<p class="hint">No se ha podido cargar el fondo del mapa (sin conexión con OpenStreetMap): la ruta sale sobre fondo liso.</p>'}
      <div class="cardprev"><img src="${CARD.url}" alt="Ficha de la ruta: mapa con el viento, perfil y tiempo"></div>
      <button class="btn wa block" data-act="card-share">Compartir${S.exp.cardgpx ? ' con el .gpx' : ''}</button>
      <button class="btn block" data-act="card-save">Descargar la imagen</button></div>`;
  } catch (e) {
    dialog.innerHTML = `<div class="dlg"><h3>Ficha para compartir <button class="linkbtn" data-act="close">✕</button></h3><p class="warn">No se ha podido crear la imagen (${esc(e.message)}).</p></div>`;
  }
}
const cardName = () => `${S.name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '-') || 'ruta'}.png`;
function saveBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
async function shareCard() {
  if (!CARD.blob) return;
  const files = [new File([CARD.blob], cardName(), { type: 'image/png' })];
  if (S.exp.cardgpx) { const { text, file } = exportGPX(); files.push(new File([text], file, { type: 'application/gpx+xml' })); }
  try {
    if (navigator.canShare?.({ files })) await navigator.share({ title: S.name, text: shareText(), files });
    else if (navigator.canShare?.({ files: files.slice(0, 1) })) { await navigator.share({ title: S.name, text: shareText(), files: files.slice(0, 1) }); if (S.exp.cardgpx) toast('Este móvil no deja adjuntar el .gpx: descárgalo y adjúntalo a mano'); }
    else { saveBlob(cardName(), CARD.blob); toast('Este navegador no comparte imágenes: la he descargado para que la adjuntes'); }
  } catch (err) { if (err.name !== 'AbortError') { saveBlob(cardName(), CARD.blob); toast('No se ha podido compartir: imagen descargada'); } }
}

function wpDialog(d) {
  let type = 'avit';
  dialog.innerHTML = `<form class="dlg" method="dialog" id="wpform"><h3>Nuevo waypoint <small class="muted">km ${km(d)}</small> <button type="button" class="linkbtn" data-act="close">✕</button></h3>
    <p class="hint">Qué hay en este punto</p>
    <div class="types">${WP_TYPES.map(([id, ic, lab]) => `<button type="button" data-type="${id}" class="${id === type ? 'on' : ''}">${ic} ${lab}</button>`).join('')}</div>
    <label>Nombre del aviso<input id="wpname" maxlength="15" value="Avituallamiento"></label>
    <p class="hint">Es lo que te enseña el ciclocomputador al llegar: hasta 15 caracteres, lo que admite Garmin.</p>
    <label>Kilómetro<input id="wpkm" type="number" step="0.1" min="0" max="${(S.track.distance / 1000).toFixed(1)}" value="${(d / 1000).toFixed(1)}" inputmode="decimal"></label>
    <button class="btn primary block" type="submit" style="margin-top:1rem">Añadir waypoint</button></form>`;
  dialog.showModal();
  dialog.querySelector('.types').addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]'); if (!b) return;
    const old = wpType(type)[2]; type = b.dataset.type;
    dialog.querySelectorAll('.types button').forEach((x) => x.classList.toggle('on', x === b));
    const inp = dialog.querySelector('#wpname');
    if (!inp.value || inp.value === old.slice(0, 15)) inp.value = wpType(type)[2].slice(0, 15);
  });
  dialog.querySelector('#wpform').addEventListener('submit', () => {
    const kmv = parseFloat(String(dialog.querySelector('#wpkm').value).replace(',', '.'));
    const dd = Number.isFinite(kmv) ? Math.max(0, Math.min(S.track.distance, kmv * 1000)) : d;
    S.wps.push({ d: dd, type, name: dialog.querySelector('#wpname').value.trim() || wpType(type)[2].slice(0, 15) });
    S.wps.sort((a, b) => a.d - b.d);
    update(); toast('Waypoint añadido');
  });
}

// ---------- Eventos ----------
document.getElementById('change').addEventListener('click', () => { S.stage = 'setup'; saveLast(); render(); window.scrollTo(0, 0); });
dialog.addEventListener('close', () => { BEST.open = false; });

document.addEventListener('click', async (e) => {
  const mode = e.target.closest('[data-mode]');
  if (mode) { S.mode = mode.dataset.mode; return update(); }
  const view = e.target.closest('[data-view]');
  if (view) { S.view = view.dataset.view; return update(); }
  const pm = e.target.closest('[data-pace-mode]');
  if (pm) { S.pace.mode = pm.dataset.paceMode; retime(); return update(); }
  const ter = e.target.closest('[data-terrain]');
  if (ter) { S.pace.terrain = ter.dataset.terrain; retime(); return update(); }
  const st = e.target.closest('[data-stops]');
  if (st) { S.pace.stopsPH = +st.dataset.stops; retime(); return update(); }
  const es_ = e.target.closest('[data-elesrc]');
  if (es_ && !es_.disabled) { S.eleSrc = es_.dataset.elesrc; if (S.eleSrc === 'dem' && !S.dem) return fetchDem(); build(); return update(); }
  const cv = e.target.closest('[data-climbview]');
  if (cv) { S.climbView = cv.dataset.climbview; return update(); }
  const pc = e.target.closest('[data-profcolor]');
  if (pc) { S.profColor = pc.dataset.profcolor; saveLast(); return renderProfile(); }
  const fm = e.target.closest('[data-feedmode]');
  if (fm) { S.feedMode = fm.dataset.feedmode; S.custom = null; return update(); }
  const gph = e.target.closest('[data-gph]');
  if (gph) { S.gph = +gph.dataset.gph; S.custom = null; return update(); }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'file') document.getElementById('file').click();
  else if (act === 'recent') showRecent();
  else if (act === 'close') dialog.close();
  else if (act === 'example') {
    try { const res = await fetch('ejemplo.gpx'); const g = R.parseGPX(await res.text()); openRoute(g.name, g.points); }
    catch { toast('No se ha podido cargar la ruta de ejemplo', true); }
  } else if (act === 'resume' || act === 'open-rec') {
    const last = store.get(K_LAST, null);
    const id = act === 'resume' ? last?.id : b.dataset.id;
    const r = store.get(K_REC, []).find((x) => x.id === id);
    if (dialog.open) dialog.close();
    if (r) openRoute(r.name, r.pts, act === 'resume' ? { ...last, dem: r.dem } : { id: r.id, dem: r.dem });
  } else if (act === 'forget') { store.del(K_LAST); renderHome(); }
  else if (act === 'del-rec') { store.set(K_REC, store.get(K_REC, []).filter((x) => x.id !== b.dataset.id)); showRecent(); }
  else if (act === 'best') openBest();
  else if (act === 'best-close') dialog.close();
  else if (act === 'best-day') { S.start += +b.dataset.n * 86400000; BEST.sel = null; retime(); update(); fetchWeather(); }
  else if (act === 'best-apply') { S.start = +b.dataset.st; dialog.close(); retime(); update(); fetchWeather(); toast(`Salida a las ${hm(S.start)}`); }
  else if (act === 'go') { S.stage = 'plan'; saveLast(); render(); window.scrollTo(0, 0); }
  else if (act === 'home') { S.track = null; S.id = null; renderHome(); window.scrollTo(0, 0); }
  else if (act === 'range-off') { setRange(null); }
  else if (act === 'fuentes-reload') fetchFountains(true);
  else if (act === 'fuente-go') { focusAt(+b.dataset.d); document.getElementById('profile').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  else if (act === 'climb-go') { focusAt(+b.dataset.d); document.getElementById('profile').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  else if (act === 'shift') { S.start += +b.dataset.min * 60000; retime(); update(); fetchWeather(); }
  else if (act === 'reverse') { S.range = null; S.reversed = !S.reversed; S.wps = S.wps.map((w) => ({ ...w, d: S.track.distance - w.d })).sort((a, c) => a.d - c.d); fitted = true; build(); update(); fetchWeather(); toast(S.reversed ? 'Ruta en sentido contrario' : 'Ruta en su sentido original'); }
  else if (act === 'addwp') setAdding(true);
  else if (act === 'cancelwp') setAdding(false);
  else if (act === 'del-wp') { S.wps.splice(+b.dataset.i, 1); map?.closePopup(); update(); }
  else if (act === 'chart-del') { S.charts.splice(+b.dataset.i, 1); saveLast(); renderCharts(); }
  else if (act === 'chart-all') { S.charts = Object.keys(CHARTS); saveLast(); renderCharts(); }
  else if (act === 'retry') { S.wxKey = ''; fetchWeather(); }
  else if (act === 'feed-on') { S.feeding = true; S.exp.tomas = true; update(); }
  else if (act === 'feed-reset') { S.custom = null; update(); }
  else if (act === 'toma-dup') { const c = own(), i = +b.dataset.i; c.splice(i + 1, 0, { ...c[i], ms: Math.min(S.tl.total - 60000, c[i].ms + 15 * 60000), label: '' }); c.sort((x, y) => x.ms - y.ms); update(); }
  else if (act === 'toma-del') { own().splice(+b.dataset.i, 1); update(); }
  else if (act === 'toma-add') { const c = own(); const last = c[c.length - 1]?.ms ?? 0; c.push({ ms: Math.min(S.tl.total - 5 * 60000, last + S.every * 60000), grams: c[c.length - 1]?.grams ?? 30, what: 'g', label: '' }); c.sort((x, y) => x.ms - y.ms); update(); }
  else if (act === 'carry') { const k = S.carry[b.dataset.k]; k.n = Math.max(0, k.n + +b.dataset.n); update(); }
  else if (act === 'feed-off') { S.feeding = false; S.exp.tomas = false; update(); }
  else if (act === 'gph-manual') {
    const v = parseInt(prompt('Gramos de hidratos por hora', String(S.gph)) || '', 10);
    if (v > 0 && v <= 200) { S.gph = v; update(); }
  } else if (act === 'gpx') { const { text, file } = exportGPX(); download(file, text); }
  else if (act === 'whatsapp') window.open(`https://wa.me/?text=${encodeURIComponent(shareText())}`, '_blank', 'noopener');
  else if (act === 'card') openCard();
  else if (act === 'card-share') shareCard();
  else if (act === 'card-save') { if (CARD.blob) saveBlob(cardName(), CARD.blob); }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'file' && t.files[0]) readFile(t.files[0]);
  else if (t.id === 'start' && t.value) { S.start = new Date(t.value).getTime(); retime(); update(); fetchWeather(); }
  else if (t.dataset.pace) {
    const v = parseFloat(String(t.value).replace(',', '.'));
    const lim = { kmh: [10, 50], pFlat: [60, 500], pClimb: [60, 600], rider: [30, 150], bike: [5, 30] }[t.dataset.pace];
    if (Number.isFinite(v)) { S.pace[t.dataset.pace] = Math.max(lim[0], Math.min(lim[1], v)); retime(); update(); }
  } else if (t.id === 'every') { S.every = +t.value; S.custom = null; update(); }
  else if (t.dataset.toma !== undefined) {
    const c = own(), f = c[+t.dataset.toma], k = t.dataset.f;
    if (k === 'ms') { f.ms = +t.value; c.sort((x, y) => x.ms - y.ms); }
    else if (k === 'grams') f.grams = Math.max(0, Math.min(300, parseInt(t.value, 10) || 0));
    else if (k === 'label') f.label = t.value.trim().slice(0, 15);
    else if (k === 'what') { f.what = t.value; const src = WHAT[t.value][1]; if (src && S.carry[src].g) f.grams = S.carry[src].g; f.label = ''; }
    update();
  } else if (t.dataset.carry) { S.carry[t.dataset.carry].g = Math.max(0, Math.min(200, parseInt(t.value, 10) || 0)); update(); }
  else if (t.id === 'feedmap') { S.feedOnMap = t.checked; drawMap(); }
  else if (t.dataset.exp) S.exp[t.dataset.exp] = t.checked;
  else if (t.id === 'bgprof') { S.bgProfile = t.checked; saveLast(); renderCharts(); }
  else if (t.dataset.chart !== undefined) { S.charts[+t.dataset.chart] = t.value; saveLast(); renderCharts(); }
  else if (t.id === 'chart-add' && t.value) { S.charts.push(t.value); saveLast(); renderCharts(); }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'arrows') { S.arrowsKm = +e.target.value; document.getElementById('arrowsv').textContent = `${S.arrowsKm} km`; drawMap(); }
});
document.addEventListener('pointerdown', (e) => {
  const hd = e.target.closest('[data-handle]');
  if (hd) { e.preventDefault(); DRAG.side = hd.dataset.handle; DRAG.d = null; hd.setPointerCapture?.(e.pointerId); return; }
  if (e.target.closest('#psvg')) profilePick(e); else if (e.target.closest('.wchart')) chartPick(e); else if (e.target.closest('#daychart')) dayPick(e);
});
document.addEventListener('pointermove', (e) => {
  if (DRAG.side) { e.preventDefault(); return handleMove(e); }
  if (!e.buttons) return;
  if (e.target.closest('#psvg')) profilePick(e); else if (e.target.closest('.wchart')) chartPick(e); else if (e.target.closest('#daychart')) dayPick(e);
});
document.addEventListener('pointerup', () => { if (DRAG.side) handleUp(); });
document.addEventListener('pointercancel', () => { DRAG.side = null; renderProfile(); });

// Arrastrar un .gpx o .fit sobre la página (ordenador)
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) readFile(f); });

// Si se vuelve a abrir con la última ruta a medias, se sigue en el mismo paso
renderHome();
