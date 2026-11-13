// Planificar ruta: interfaz. Las reglas están en logic.js; el tiempo viene de Open-Meteo y el mapa de OpenStreetMap.
import * as R from './logic.js';

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
  start: defaultStart(), flat: 27, mass: 80, stops: 0,
  wx: null, wxKey: '', wxErr: '', wxLoading: false,
  view: 'completa', mode: 'viento', arrowsKm: 4, wps: [], addingWp: false,
  feeding: false, gph: 90, every: 30, feedOnMap: true,
  exp: { wps: true, climbs: false, tomas: false, times: false }, cursorD: null,
};
let map = null, mapLayer = null, cursorMarker = null, fitted = false;

function saveLast() {
  if (!S.id) return;
  store.set(K_LAST, { id: S.id, start: S.start, flat: S.flat, mass: S.mass, stops: S.stops, reversed: S.reversed, wps: S.wps,
    gph: S.gph, every: S.every, feeding: S.feeding, view: S.view, mode: S.mode });
}
function saveRecent(id, name, pts) {
  let list = store.get(K_REC, []).filter((r) => r.id !== id);
  list.unshift({ id, name, pts, at: Date.now() });
  list = list.slice(0, 8);
  while (list.length && !store.set(K_REC, list)) list.pop(); // si no cabe, se van quitando las más antiguas
}

// ---------- Cálculos ----------
function build() {
  const pts = (S.reversed ? [...S.raw].reverse() : S.raw).map(([lat, lon, ele]) => ({ lat, lon, ele }));
  S.track = R.buildTrack(pts);
  S.climbs = R.findClimbs(S.track.points);
  S.samples = R.samplePoints(S.track.points);
  retime();
}
function etasFor(start) { return S.samples.map((s) => start + R.timeAt(S.track.points, S.tl.t, s.d)); }
function retime() {
  S.tl = R.timeline(S.track.points, { flatKmh: S.flat, mass: S.mass, stopsMin: S.stops });
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

/** Salida y puesta del sol del día de salida (en el primer punto), si la previsión las trae. */
function sunTimes(startMs = S.start) {
  const first = Array.isArray(S.wx) ? S.wx[0] : S.wx;
  const d = first?.daily;
  if (!d) return null;
  const i = d.time.findIndex((t) => t * 1000 <= startMs && startMs < t * 1000 + 86400000);
  return i < 0 ? null : { rise: d.sunrise[i] * 1000, set: d.sunset[i] * 1000 };
}
const darkMinutes = (start, end) => { const s = sunTimes(start); return s ? Math.max(0, s.rise - start) / 60000 + Math.max(0, end - s.set) / 60000 : 0; };

function bestDeparture() {
  if (!S.wx) return toast('Primero tiene que cargar la previsión', true);
  const sun = sunTimes() || { rise: startOfDay(S.start) + 7 * 3600000, set: startOfDay(S.start) + 19 * 3600000 };
  let best = null;
  const from = Math.max(Math.ceil((sun.rise - 30 * 60000) / 900000) * 900000, Date.now());
  for (let st = from; st + S.tl.total <= sun.set + 30 * 60000; st += 900000) {
    const wx = R.weatherAlong(S.samples, etasFor(st), S.wx);
    const score = R.departureScore(wx, darkMinutes(st, st + S.tl.total));
    if (!best || score < best.score) best = { st, score };
  }
  if (!best) return toast('Ese día no da tiempo a hacer la ruta con luz', true);
  S.start = best.st; retime(); update();
  toast(`Mejor hora: ${hm(best.st)} (menos viento de cara y lluvia, con luz)`);
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
  Object.assign(S, { id, name, raw: pts, reversed: false, wps: [], feeding: false, wx: null, wxKey: '', wxErr: '', cursorD: null });
  if (settings) {
    for (const k of ['start', 'flat', 'mass', 'stops', 'reversed', 'wps', 'gph', 'every', 'feeding', 'view', 'mode']) if (settings[k] !== undefined) S[k] = settings[k];
    if (S.start < Date.now() - 3600000) { const d = new Date(S.start); const n = new Date(defaultStart()); n.setHours(d.getHours(), d.getMinutes()); S.start = n.getTime(); }
  }
  saveRecent(id, name, pts);
  fitted = false;
  build(); renderPlan(); fetchWeather();
}
function showRecent() {
  const rec = store.get(K_REC, []);
  dialog.innerHTML = `<div class="dlg"><h3>Recientes <button class="linkbtn" data-act="close">Cerrar</button></h3>
    ${rec.length ? `<ul class="mini-list">${rec.map((r) => `<li><div><b>${esc(r.name)}</b><small class="muted">${new Date(r.at).toLocaleDateString('es-ES')}</small></div>
      <span class="row"><button class="btn small" data-act="open-rec" data-id="${r.id}">Abrir</button><button class="btn small ghost" data-act="del-rec" data-id="${r.id}" aria-label="Quitar">✕</button></span></li>`).join('')}</ul>`
      : '<p class="muted">Aún no has planificado ninguna ruta en este dispositivo.</p>'}</div>`;
  dialog.showModal();
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
    <h3 style="margin-top:1rem">Elevación</h3>
    <div id="profile"></div>
    <p id="pinfo" class="hint">Toca el perfil para ver la hora, el tiempo y el viento en ese punto.</p>
    <div id="climbs"></div>
    <div id="rest"></div>
    ${foot()}`;
  initMap();
  update();
}

function update() {
  if (!S.track) return;
  saveLast();
  renderTop(); renderSummary(); renderLegend(); drawMap(); renderProfile(); renderClimbs(); renderRest();
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === S.mode));
}

function renderTop() {
  const t = S.track;
  document.getElementById('top').innerHTML = `
    <div class="title-row"><h2>${esc(S.name)}</h2><p class="muted">${dayShort(S.start)} · ${km(t.distance)} km · ${int(t.gain)} m+</p></div>
    <div class="panel">
      <label>Hora de salida <input type="datetime-local" id="start" value="${localInput(S.start)}"></label>
      <button class="btn block" data-act="best">Mejor hora</button>
      <div class="shift"><span>${dayName(S.start)}</span> · <button class="linkbtn" data-act="shift" data-min="-15">−15 min</button> <button class="linkbtn" data-act="shift" data-min="15">+15 min</button></div>
      <details><summary>Ritmo: <b>${S.flat} km/h en llano</b></summary>
        <div class="grid2" style="margin-top:.6rem">
          <label>Media en llano (km/h)<input type="number" id="flat" min="10" max="50" step="0.5" value="${S.flat}" inputmode="decimal"></label>
          <label>Peso con bici (kg)<input type="number" id="mass" min="40" max="150" step="1" value="${S.mass}" inputmode="numeric"></label>
          <label>Paradas (min en total)<input type="number" id="stops" min="0" max="300" step="5" value="${S.stops}" inputmode="numeric"></label>
        </div>
        <p class="hint">Se calcula la potencia que da esa media en llano y, con ella, lo que tardas en cada tramo según la pendiente (bajando, como mucho 55 km/h).</p>
      </details>
      <button class="btn" data-act="reverse" style="margin-top:.6rem">Invertir sentido</button>
    </div>
    <div class="seg" id="view"><button data-view="sencilla" class="${S.view === 'sencilla' ? 'on' : ''}">Sencilla</button><button data-view="completa" class="${S.view === 'completa' ? 'on' : ''}">Completa</button></div>
    <p class="hint">${S.view === 'completa' ? 'Todo: tiempo detallado, avituallamiento y exportar.' : 'Solo el resumen, el mapa y las subidas.'}</p>`;
}

function hardest() {
  return S.climbs.reduce((b, c) => (!b || c.length * c.avg > b.length * b.avg ? c : b), null);
}

function renderSummary() {
  const t = S.track, total = S.tl.total, end = S.start + total;
  const moving = total - S.stops * 60000;
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
      <p>${h ? `Empieza en el km ${km(h.start)}, la pasas entre las ${hm(at(h.start))} y las ${hm(at(h.end))}. Sube ${int(h.gain)} m, máx. ${pct(h.max)}.` : 'No hay subidas de más de 40 m al 3 % o más.'}</p></details>`;
}

// ---------- Mapa ----------
function initMap() {
  map = L.map('map', { zoomControl: true, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  mapLayer = L.layerGroup().addTo(map);
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
  const cuts = S.samples.map((s) => s.d);
  // un tramo por punto de previsión, coloreado con el tiempo de ese punto
  for (let k = 0; k < cuts.length - 1; k++) {
    const a = R.indexAt(P, cuts[k]), b = R.indexAt(P, cuts[k + 1]);
    const line = P.slice(Math.max(0, a - 1), b + 1).map((p) => [p.lat, p.lon]);
    const w = S.along?.[k];
    L.polyline(line, { color: segColor(w), weight: 6, opacity: .9 }).addTo(mapLayer);
  }
  if (S.along) {
    for (let d = S.arrowsKm * 500; d < S.track.distance; d += S.arrowsKm * 1000) {
      const p = R.pointAt(P, d), w = wxAt(d);
      if (!w || w.wind === undefined) continue;
      const size = Math.round(14 + Math.min(20, w.wind * 0.6));
      L.marker([p.lat, p.lon], { interactive: false, icon: L.divIcon({ className: '', iconSize: [size, size],
        html: `<div class="warrow" style="font-size:${size}px;line-height:${size}px;color:${segColor(w)};transform:rotate(${(w.windFrom + 180) % 360}deg)">↑</div>` }) }).addTo(mapLayer);
    }
  }
  S.climbs.forEach((c, i) => {
    const p = R.pointAt(P, c.start);
    L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', iconSize: [24, 24], html: `<div class="cnum" style="background:${R.gradeColor(c.avg)}">${i + 1}</div>` }) })
      .bindPopup(`<b>Subida ${i + 1}</b><br>km ${km(c.start)} · ${km(c.length)} km al ${pct(c.avg)}<br>${hm(at(c.start))} → ${hm(at(c.end))}`).addTo(mapLayer);
  });
  S.wps.forEach((w, i) => {
    const p = R.pointAt(P, w.d);
    L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', iconSize: [24, 24], html: `<div class="cnum wp">${wpType(w.type)[1]}</div>` }) })
      .bindPopup(`<b>${esc(w.name)}</b><br>km ${km(w.d)} · ${hm(at(w.d))}<br><button class="linkbtn" data-act="del-wp" data-i="${i}">Quitar</button>`).addTo(mapLayer);
  });
  if (S.feeding && S.feedOnMap) feeding().forEach((f, i) => {
    const p = R.pointAt(P, f.d);
    L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', iconSize: [22, 22], html: `<div class="cnum toma">${i + 1}</div>` }) })
      .bindPopup(`<b>Toma ${i + 1}</b><br>${hm(S.start + f.ms)} · km ${km(f.d)} · ${f.grams} g`).addTo(mapLayer);
  });
  const s = P[0], e = P[P.length - 1];
  L.circleMarker([s.lat, s.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 }).bindTooltip('Salida').addTo(mapLayer);
  L.circleMarker([e.lat, e.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#111', fillOpacity: 1 }).bindTooltip('Llegada').addTo(mapLayer);
  cursorMarker = null;
  if (!fitted) { map.fitBounds(L.latLngBounds(P.map((p) => [p.lat, p.lon])), { padding: [16, 16] }); fitted = true; }
}

// ---------- Perfil ----------
const PW = 720, PH = 230, PAD = { l: 38, r: 8, t: 12, b: 44 };
function renderProfile() {
  const t = S.track, P = t.points, total = t.distance;
  const lo = Math.floor((t.minEle - 20) / 50) * 50, hi = Math.ceil((t.maxEle + 20) / 50) * 50;
  const x = (d) => PAD.l + (d / total) * (PW - PAD.l - PAD.r);
  const y = (e) => PAD.t + (1 - (e - lo) / (hi - lo || 1)) * (PH - PAD.t - PAD.b);
  const base = PH - PAD.b;
  const step = Math.max(100, total / 300);
  let polys = '';
  for (let d = 0; d < total; d += step) {
    const d2 = Math.min(total, d + step);
    const a = R.pointAt(P, d), b = R.pointAt(P, d2);
    const g = (b.es - a.es) / (d2 - d || 1);
    polys += `<polygon points="${x(d).toFixed(1)},${base} ${x(d).toFixed(1)},${y(a.es).toFixed(1)} ${x(d2).toFixed(1)},${y(b.es).toFixed(1)} ${x(d2).toFixed(1)},${base}" fill="${R.gradeColor(g)}" stroke="${R.gradeColor(g)}" stroke-width=".5"/>`;
  }
  const yTicks = []; const ys = Math.max(50, Math.ceil((hi - lo) / 4 / 50) * 50);
  for (let e = lo; e <= hi; e += ys) yTicks.push(`<line x1="${PAD.l}" x2="${PW - PAD.r}" y1="${y(e)}" y2="${y(e)}" stroke="var(--line)"/><text x="${PAD.l - 4}" y="${y(e) + 4}" text-anchor="end">${e}</text>`);
  const xs = total > 100000 ? 20000 : total > 40000 ? 10000 : 5000;
  const xTicks = []; for (let d = 0; d <= total; d += xs) xTicks.push(`<text x="${x(d)}" y="${base + 13}" text-anchor="middle">${d / 1000}</text>`);
  const climbs = S.climbs.map((c, i) => `<rect x="${x(c.start)}" y="${PAD.t}" width="${Math.max(1, x(c.end) - x(c.start))}" height="${base - PAD.t}" fill="var(--accent)" opacity=".07"/>
    <text x="${(x(c.start) + x(c.end)) / 2}" y="${y(c.top) - 4}" text-anchor="middle" style="font-weight:700;fill:var(--text)">${i + 1}</text>`).join('');
  let strip = '';
  if (S.along) {
    const cuts = S.samples.map((s) => s.d);
    for (let k = 0; k < cuts.length - 1; k++) strip += `<rect x="${x(cuts[k])}" y="${base + 20}" width="${x(cuts[k + 1]) - x(cuts[k]) + .5}" height="10" fill="${segColor(S.along[k])}"/>`;
    strip += `<text x="${PAD.l - 4}" y="${base + 29}" text-anchor="end">${S.mode === 'temp' ? 'Temp.' : S.mode === 'rachas' ? 'Rachas' : 'Viento'}</text>`;
  }
  const cur = S.cursorD !== null ? `<line x1="${x(S.cursorD)}" x2="${x(S.cursorD)}" y1="${PAD.t}" y2="${base}" stroke="var(--text)" stroke-dasharray="3 3"/>` : '';
  document.getElementById('profile').innerHTML = `<svg class="profile" id="psvg" viewBox="0 0 ${PW} ${PH}" role="img" aria-label="Perfil de elevación">
    ${yTicks.join('')}${polys}${climbs}${xTicks.join('')}<text x="${PW - PAD.r}" y="${base + 13}" text-anchor="end">km</text>${strip}${cur}</svg>
    <div class="legend"><span><i style="background:var(--g1)"></i>&lt; 3 % y bajadas</span><span><i style="background:var(--g2)"></i>3-6 %</span><span><i style="background:var(--g3)"></i>6-9 %</span><span><i style="background:var(--g4)"></i>9-12 %</span><span><i style="background:var(--g5)"></i>&gt; 12 %</span></div>`;
}
function profilePick(ev) {
  const svg = document.getElementById('psvg');
  if (!svg) return;
  const r = svg.getBoundingClientRect();
  const fx = ((ev.clientX - r.left) / r.width) * PW;
  const d = Math.max(0, Math.min(S.track.distance, ((fx - PAD.l) / (PW - PAD.l - PAD.r)) * S.track.distance));
  S.cursorD = d;
  const p = R.pointAt(S.track.points, d), w = wxAt(d);
  const g = R.gradeAt(S.track.points, d, 100);
  let txt = `<b>km ${km(d)}, ${hm(at(d))}</b> · Elevación ${int(p.es)} m · Pendiente ${pct(g)}`;
  if (w && w.wind !== undefined) txt += ` · ${int(w.temp)} °C · Lluvia ${int(w.rainProb ?? 0)} % · Viento ${int(w.wind)} km/h del ${compass(w.windFrom)}, ${KIND[w.rel.kind].toLowerCase()} (rachas ${int(w.gust)})`;
  document.getElementById('pinfo').innerHTML = txt;
  renderProfile();
  if (map) {
    if (!cursorMarker) cursorMarker = L.circleMarker([p.lat, p.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#284556', fillOpacity: 1 }).addTo(mapLayer);
    else cursorMarker.setLatLng([p.lat, p.lon]);
  }
}

function renderClimbs() {
  const el = document.getElementById('climbs');
  if (!S.climbs.length) { el.innerHTML = '<p class="hint">Sin subidas de más de 40 m al 3 % o más.</p>'; return; }
  el.innerHTML = `<h3>Subidas (${S.climbs.length})</h3><div class="climbs">${S.climbs.map((c, i) => {
    const cat = R.climbCategory(c);
    const w = wxAt(c.end);
    return `<div class="climb"><span class="n" style="background:${R.gradeColor(c.avg)}">${i + 1}</span><div><b>km ${km(c.start)}</b>
      <small>${km(c.length)} km · ${pct(c.avg)} · ${int(c.gain)} m${cat ? ` · ${cat === 'HC' ? 'HC' : cat + 'ª cat.'}` : ''}</small>
      <small>${hm(at(c.start))} → ${hm(at(c.end))}${w && w.wind !== undefined ? ` · ${int(w.temp)} °C arriba` : ''}</small></div></div>`;
  }).join('')}</div>`;
}

// ---------- Tiempo, avituallamiento y exportar ----------
const feeding = () => R.feedingPlan(S.track.points, S.tl.t, { gph: S.gph, everyMin: S.every });

function renderRest() {
  const el = document.getElementById('rest');
  if (S.view !== 'completa') { el.innerHTML = ''; return; }
  let wxHtml;
  if (S.wxErr) wxHtml = `<p class="warn">${esc(S.wxErr)}</p><button class="btn" data-act="retry">Reintentar</button>`;
  else if (!S.along) wxHtml = '<p class="hint">Cargando la previsión…</p>';
  else wxHtml = `<div class="wrap-x"><table class="wx"><thead><tr><th>Hora</th><th>Km</th><th></th><th>Temp.</th><th>Lluvia</th><th>Viento (rachas)</th></tr></thead><tbody>
    ${S.along.map((w) => { const [ic, lab] = R.weatherLabel(w.code); return `<tr><td><b>${hm(w.eta)}</b></td><td class="k">${km(w.d)}</td><td title="${lab}">${ic}</td>
      <td>${int(w.temp)}°</td><td>${int(w.rainProb ?? 0)} %${w.rain >= 0.1 ? ` <small class="muted">${nf1.format(w.rain)} mm</small>` : ''}</td>
      <td><span class="pill ${w.rel.kind}">${KIND[w.rel.kind]}</span> ${int(w.wind)} <small class="muted">(${int(w.gust)}) ${compass(w.windFrom)}</small></td></tr>`; }).join('')}
    </tbody></table></div>`;

  const tomas = S.feeding ? feeding() : [];
  const grams = tomas.reduce((s, f) => s + f.grams, 0);
  const avit = S.feeding ? `
    <h3>Hidratos por hora</h3>
    <div class="opts">${[[60, '60 g/h', 'Hasta 2,5 h o ritmo suave'], [90, '90 g/h', 'Marchas y tiradas largas'], [120, '120 g/h', 'Solo si lo tienes entrenado']].map(([v, a, b]) =>
      `<button data-gph="${v}" class="${S.gph === v ? 'on' : ''}"><b>${a}</b><small>${b}</small></button>`).join('')}
      <button data-act="gph-manual" class="${![60, 90, 120].includes(S.gph) ? 'on' : ''}"><b>Manual</b><small>${![60, 90, 120].includes(S.gph) ? `${S.gph} g/h` : 'Tu cantidad'}</small></button></div>
    <label style="flex-direction:row;align-items:center;gap:.6rem">Una toma cada <select id="every">${[20, 30, 40, 45, 60].map((m) => `<option value="${m}" ${S.every === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
    <label class="check"><input type="checkbox" id="feedmap" ${S.feedOnMap ? 'checked' : ''}> Marcar las tomas en el mapa</label>
    <div class="facts"><div><small>Duración</small><b>${dur(S.tl.total)}</b></div><div><small>Hidratos</small><b>${int(grams)} g</b></div><div><small>Tomas</small><b>${tomas.length} × ${tomas[0]?.grams ?? 0} g</b></div></div>
    <ul class="mini-list tomas">${tomas.map((f, i) => `<li><span class="dot">${i + 1}</span><div><b>${hm(S.start + f.ms)}</b><small class="muted">${dur(f.ms)} de ruta</small></div><span>km ${km(f.d)}</span><b>${f.grams} g</b></li>`).join('')}</ul>
    <p class="hint">Una guía: ajústala a lo que toleras en los entrenamientos. Un gel suele llevar 20-30 g y una barrita 25-40 g.</p>
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
      <label class="check"><input type="checkbox" data-exp="tomas" ${S.exp.tomas ? 'checked' : ''} ${S.feeding ? '' : 'disabled'}> Tus tomas de avituallamiento (${tomas.length})</label>
      <label class="check"><input type="checkbox" data-exp="times" ${S.exp.times ? 'checked' : ''}> Horas de paso previstas (para el «compañero virtual»)</label>
      <button class="btn primary" data-act="gpx">Descargar .gpx</button>
      <h3 style="margin-top:1rem">Pásasela a tu grupeta</h3>
      <p class="hint">Un mensaje con la salida, los kilómetros, el desnivel y el tiempo previsto.</p>
      <button class="btn wa" data-act="whatsapp">Compartir por WhatsApp</button>
      <button class="btn" data-act="share">Compartir con el .gpx</button>
    </div>`;
}

function exportGPX() {
  const name = (document.getElementById('expname')?.value || S.name).trim() || 'Ruta';
  const P = S.track.points, wps = [];
  const pt = (d) => R.pointAt(P, d);
  if (S.exp.wps) S.wps.forEach((w) => { const p = pt(w.d); wps.push({ lat: p.lat, lon: p.lon, name: w.name, desc: `${wpType(w.type)[2]} · km ${km(w.d)}`, sym: wpType(w.type)[3] }); });
  if (S.exp.climbs) S.climbs.forEach((c, i) => { const p = pt(c.start); wps.push({ lat: p.lat, lon: p.lon, name: `Subida ${i + 1}`.slice(0, 15), desc: `${km(c.length)} km al ${pct(c.avg)}`, sym: 'Summit' }); });
  if (S.exp.tomas && S.feeding) feeding().forEach((f, i) => { const p = pt(f.d); wps.push({ lat: p.lat, lon: p.lon, name: `Toma ${i + 1}: ${f.grams} g`.slice(0, 15), desc: hm(S.start + f.ms), sym: 'Food' }); });
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
    `📏 ${km(t.distance)} km · ⛰️ ${int(t.gain)} m+ · ${S.flat} km/h en llano`];
  const h = hardest();
  if (h) lines.push(`🔺 Subida más dura: ${km(h.length)} km al ${pct(h.avg)} (km ${km(h.start)})`);
  if (S.along) {
    const a = S.along.filter((w) => w.wind !== undefined);
    lines.push(`🌡️ ${int(Math.min(...a.map((w) => w.temp)))}-${int(Math.max(...a.map((w) => w.temp)))} °C · 💨 máx. ${int(Math.max(...a.map((w) => w.wind)))} km/h · 🌧️ ${int(Math.max(...a.map((w) => w.rainProb ?? 0)))} %`);
  }
  return lines.join('\n');
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
document.getElementById('change').addEventListener('click', () => { S.track = null; S.id = null; renderHome(); window.scrollTo(0, 0); });

document.addEventListener('click', async (e) => {
  const mode = e.target.closest('[data-mode]');
  if (mode) { S.mode = mode.dataset.mode; return update(); }
  const view = e.target.closest('[data-view]');
  if (view) { S.view = view.dataset.view; return update(); }
  const gph = e.target.closest('[data-gph]');
  if (gph) { S.gph = +gph.dataset.gph; return update(); }
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
    if (r) openRoute(r.name, r.pts, act === 'resume' ? last : { id: r.id });
  } else if (act === 'forget') { store.del(K_LAST); renderHome(); }
  else if (act === 'del-rec') { store.set(K_REC, store.get(K_REC, []).filter((x) => x.id !== b.dataset.id)); showRecent(); }
  else if (act === 'best') bestDeparture();
  else if (act === 'shift') { S.start += +b.dataset.min * 60000; retime(); update(); fetchWeather(); }
  else if (act === 'reverse') { S.reversed = !S.reversed; S.wps = S.wps.map((w) => ({ ...w, d: S.track.distance - w.d })).sort((a, c) => a.d - c.d); fitted = true; build(); update(); fetchWeather(); toast(S.reversed ? 'Ruta en sentido contrario' : 'Ruta en su sentido original'); }
  else if (act === 'addwp') setAdding(true);
  else if (act === 'cancelwp') setAdding(false);
  else if (act === 'del-wp') { S.wps.splice(+b.dataset.i, 1); map?.closePopup(); update(); }
  else if (act === 'retry') { S.wxKey = ''; fetchWeather(); }
  else if (act === 'feed-on') { S.feeding = true; S.exp.tomas = true; update(); }
  else if (act === 'feed-off') { S.feeding = false; S.exp.tomas = false; update(); }
  else if (act === 'gph-manual') {
    const v = parseInt(prompt('Gramos de hidratos por hora', String(S.gph)) || '', 10);
    if (v > 0 && v <= 200) { S.gph = v; update(); }
  } else if (act === 'gpx') { const { text, file } = exportGPX(); download(file, text); }
  else if (act === 'whatsapp') window.open(`https://wa.me/?text=${encodeURIComponent(shareText())}`, '_blank', 'noopener');
  else if (act === 'share') {
    const { text, file } = exportGPX();
    const f = new File([text], file, { type: 'application/gpx+xml' });
    try {
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ title: S.name, text: shareText(), files: [f] });
      else if (navigator.share) await navigator.share({ title: S.name, text: shareText() });
      else { await navigator.clipboard.writeText(shareText()); toast('Resumen copiado'); }
    } catch (err) { if (err.name !== 'AbortError') toast('No se ha podido compartir', true); }
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'file' && t.files[0]) readFile(t.files[0]);
  else if (t.id === 'start' && t.value) { S.start = new Date(t.value).getTime(); retime(); update(); fetchWeather(); }
  else if (['flat', 'mass', 'stops'].includes(t.id)) {
    const v = parseFloat(String(t.value).replace(',', '.'));
    const lim = { flat: [10, 50], mass: [40, 150], stops: [0, 300] }[t.id];
    if (Number.isFinite(v)) { S[t.id] = Math.max(lim[0], Math.min(lim[1], v)); retime(); update(); }
  } else if (t.id === 'every') { S.every = +t.value; update(); }
  else if (t.id === 'feedmap') { S.feedOnMap = t.checked; drawMap(); }
  else if (t.dataset.exp) S.exp[t.dataset.exp] = t.checked;
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'arrows') { S.arrowsKm = +e.target.value; document.getElementById('arrowsv').textContent = `${S.arrowsKm} km`; drawMap(); }
});
document.addEventListener('pointerdown', (e) => { if (e.target.closest('#psvg')) profilePick(e); });
document.addEventListener('pointermove', (e) => { if (e.buttons && e.target.closest('#psvg')) profilePick(e); });

// Arrastrar un .gpx o .fit sobre la página (ordenador)
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) readFile(f); });

renderHome();
