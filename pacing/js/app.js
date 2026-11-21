// Interfaz de Pacing: inicio, ruta (perfil, objetivo, tramos, nutrición) y mapa.
import { parseGPX, parseFIT, buildTrack, findClimbs, pointAt, decimate, gradeColor } from './track.js';
import { OBJECTIVES, DEFAULT_PROFILE, profileFromQuery, planRoute, planAt, nutritionPlan, strategyText, freshness, planAsText,
  fmtDur, fmtKm, fmtPct, TYPE_LABEL } from './pacing.js';

const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (x, d = 0) => Number(x).toFixed(d).replace('.', ',');

// ---------- Estado guardado en el dispositivo ----------
const store = {
  get(k, def) { try { const v = localStorage.getItem('pacing-' + k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v) { try { localStorage.setItem('pacing-' + k, JSON.stringify(v)); } catch { /* sin almacenamiento: la app sigue funcionando */ } },
  del(k) { try { localStorage.removeItem('pacing-' + k); } catch { /* idem */ } },
};
const state = {
  profile: store.get('profile', null),
  saved: store.get('route', null), // { name, pts }
  objective: store.get('objective', 'good'),
  date: store.get('date', ''),
  temp: 17, tempFrom: '', view: 'home', open: -1,
};
if (!OBJECTIVES[state.objective]) state.objective = 'good';

let track = null, climbs = [], plan = null, nutri = null, strat = null;

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove('on'), ms);
}

// ---------- Cálculo ----------
function loadTrack() {
  track = null; climbs = []; plan = null;
  if (!state.saved) return;
  try {
    const raw = state.saved.pts.map(([lat, lon, ele]) => ({ lat, lon, ele }));
    track = buildTrack(raw);
    climbs = findClimbs(track.points);
  } catch (e) { toast('No se pudo leer la ruta guardada'); state.saved = null; store.del('route'); }
}
function compute() {
  if (!track) { plan = nutri = strat = null; return; }
  const prof = { ...DEFAULT_PROFILE, ...(state.profile || {}) };
  plan = planRoute(track.points, prof, state.objective, { climbs });
  nutri = nutritionPlan(plan, state.objective, state.temp);
  strat = strategyText(plan, state.saved.name || 'La ruta', nutri, { temp: state.temp });
}

async function loadWeather() {
  state.tempFrom = '';
  if (!track || !state.date) { state.temp = 17; return; }
  const days = (new Date(state.date) - Date.now()) / 864e5;
  if (!(days > -1 && days < 15)) { state.temp = 17; return; }
  try {
    const mid = pointAt(track.points, track.distance / 2);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${mid.lat.toFixed(2)}&longitude=${mid.lon.toFixed(2)}&daily=temperature_2m_max,temperature_2m_min&start_date=${state.date}&end_date=${state.date}&timezone=auto`;
    const j = await (await fetch(url)).json();
    const hi = j.daily.temperature_2m_max[0], lo = j.daily.temperature_2m_min[0];
    if (Number.isFinite(hi) && Number.isFinite(lo)) { state.temp = Math.round((hi * 0.7 + lo * 0.3)); state.tempFrom = `Previsión: ${Math.round(lo)}–${Math.round(hi)} °C`; }
  } catch { state.temp = 17; }
}

// ---------- Utilidades de dibujo ----------
const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  flag: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h13l-3 4 3 4H5"/></svg>',
  chev: '<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
};
const KIND = {
  climb: { c: 'var(--orange)', g: '▲' }, descent: { c: 'var(--blue)', g: '▼' },
  rolling: { c: 'var(--accent)', g: '≈' }, flat: { c: 'var(--muted)', g: '▬' },
};
const TAKE_ICON = { gel: '⚡', drink: '💧', solid: '🍌' };

/** Perfil de altimetría del recorrido (SVG responsive). `sel` resalta un tramo; `markers` pone los puertos. */
function profileSvg(id, { sel = null, markers = true, h = 150 } = {}) {
  const W = 360, top = markers ? 30 : 8, bot = 4, N = 220, total = track.distance;
  const pts = []; let min = Infinity, max = -Infinity;
  for (let i = 0; i <= N; i++) { const e = pointAt(track.points, (i / N) * total).es; pts.push(e); min = Math.min(min, e); max = Math.max(max, e); }
  const x = (d) => (d / total) * W, y = (e) => top + (1 - (e - min) / Math.max(1, max - min)) * (h - top - bot);
  const line = pts.map((e, i) => `${i ? 'L' : 'M'}${x((i / N) * total).toFixed(1)} ${y(e).toFixed(1)}`).join('');
  let s = `<svg id="${id}" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" role="img" aria-label="Perfil de altimetría">
    <defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b6f90" stop-opacity=".9"/><stop offset="1" stop-color="#16384a" stop-opacity=".55"/></linearGradient></defs>`;
  if (sel) s += `<rect x="${x(sel.start)}" y="0" width="${Math.max(2, x(sel.end) - x(sel.start))}" height="${h}" fill="#5cc8f0" opacity=".22"/>`;
  s += `<path d="${line}L${W} ${h}L0 ${h}Z" fill="url(#${id}g)"/><path d="${line}" fill="none" stroke="#5cc8f0" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
  if (markers && plan) {
    const hardest = [...plan.climbs].sort((a, b) => b.gain * b.avg - a.gain * a.avg)[0];
    for (const c of plan.climbs) {
      const cx = x(c.end), cy = y(c.top);
      const col = c === hardest ? '#ef4444' : '#f59e0b';
      s += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${h - bot}" stroke="${col}" stroke-opacity=".5" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>`;
    }
  }
  s += `<g id="${id}cur" visibility="hidden"><line y1="0" y2="${h}" stroke="#fff" stroke-opacity=".8" vector-effect="non-scaling-stroke"/></g></svg>`;
  return s;
}
/** Los números de los puertos van en HTML (no se deforman con el SVG estirado). */
function markerHtml() {
  if (!plan) return '';
  const hardest = [...plan.climbs].sort((a, b) => b.gain * b.avg - a.gain * a.avg)[0];
  let min = Infinity, max = -Infinity;
  for (let i = 0; i <= 220; i++) { const e = pointAt(track.points, (i / 220) * track.distance).es; min = Math.min(min, e); max = Math.max(max, e); }
  return plan.climbs.map((c) => {
    const left = (c.end / track.distance) * 100;
    const topPct = ((30 + (1 - (c.top - min) / Math.max(1, max - min)) * (150 - 34)) / 150) * 100;
    const col = c === hardest ? 'var(--red)' : 'var(--orange)';
    return `<button class="pin" data-seg="${c.id - 1}" style="position:absolute;left:calc(${left}% - 12px);top:calc(${topPct}% - 30px);background:${col};cursor:pointer" aria-label="Ir al tramo ${c.id}">${c.climbNo}</button>`;
  }).join('');
}

function segmentChart(seg) {
  const W = 300, H = 110, top = 6, bot = 18;
  const bars = Math.min(70, Math.max(10, Math.round(seg.length / 100)));
  const vals = [];
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < bars; i++) {
    const d0 = seg.start + (seg.length * i) / bars, d1 = seg.start + (seg.length * (i + 1)) / bars;
    const e = pointAt(track.points, (d0 + d1) / 2).es;
    vals.push({ e, g: (pointAt(track.points, d1).es - pointAt(track.points, d0).es) / (d1 - d0) });
    min = Math.min(min, e); max = Math.max(max, e);
  }
  const bw = W / bars;
  let s = `<svg class="gr" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`;
  vals.forEach((v, i) => {
    const hh = 8 + ((v.e - min) / Math.max(1, max - min)) * (H - top - bot - 8);
    s += `<rect x="${(i * bw).toFixed(2)}" y="${(H - bot - hh).toFixed(1)}" width="${(bw + 0.4).toFixed(2)}" height="${hh.toFixed(1)}" fill="${gradeColor(v.g)}"/>`;
  });
  const ticks = Math.max(2, Math.min(6, Math.floor(seg.length / 1000)));
  for (let i = 0; i <= ticks; i++) s += `<text x="${(i / ticks) * (W - 12) + 2}" y="${H - 4}" fill="#8b95a5" font-size="9" font-family="system-ui">${Math.round((i / ticks) * seg.length / 1000)}</text>`;
  return s + '</svg>';
}

// ---------- Vistas ----------
function dateHeader() {
  const d = new Date();
  const wd = new Intl.DateTimeFormat('es', { weekday: 'long' }).format(d);
  const rest = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(d);
  const [day, , month] = rest.split(' ');
  return `<div class="date"><b>${esc(wd[0].toUpperCase() + wd.slice(1))} ${esc(day)}</b><span>${esc(month || '')}</span></div>`;
}

function profileLine(p) {
  const lvl = { beginner: 'principiante', intermediate: 'intermedio', advanced: 'avanzado' }[p.level] || '';
  return `Carretera · nivel ${lvl} · ${p.age} años · ${num(p.weight, p.weight % 1 ? 1 : 0)} kg · FTP ${p.ftp} W`;
}

function homeView() {
  const p = state.profile;
  const fr = freshness(p?.ctl, p?.atl);
  let h = `<div class="bar"><a class="icon" href="../" aria-label="Volver a la app del club">${ICON.back}</a><h1>Pacing</h1><button class="icon" data-act="menu" aria-label="Menú">${ICON.menu}</button></div>${dateHeader()}`;
  h += p ? `<p class="lead">Ya te conozco. Cuando quieras, montamos tu plan</p><p class="sub">${esc(profileLine(p))}</p>`
    : `<p class="lead">Cuéntame sobre ti y montamos tu plan</p><p class="sub">Con tu FTP y tu peso calculo los vatios de cada tramo.</p>`;
  h += `<div class="tiles"><div class="tile"><small>Forma</small><strong>${Math.round(p?.ctl || 0)}</strong><em>CTL${p?.ctl ? '' : ' · sin datos'}</em></div>
    <div class="tile"><small>Frescura</small><strong>${fr.pct}%</strong><em>${fr.label}${p?.ctl || p?.atl ? ' (estimada)' : ''}</em><div class="meter"><i style="width:${fr.pct}%"></i></div></div></div>`;
  if (track) {
    h += `<div class="card"><h3>Tu ${esc(state.saved.name || 'ruta')}, con todo el detalle</h3>
      <p>${esc(fmtKm(track.distance))} · +${Math.round(track.gain).toLocaleString('es')} m · estimado ${esc(fmtDur(plan.totalMs, true))} con el objetivo «${esc(plan.label)}».</p>
      <button class="more" data-act="route">Verla completa →</button></div>`;
  }
  h += `<button class="card link" data-act="choose"><div class="cta"><span class="ico">${ICON.flag}</span><div><b>Elige tu prueba</b><span>${track ? 'Cambia de ruta o sube otro track' : 'Sube un .gpx o .fit y verás cómo repartir el esfuerzo'}</span></div></div></button>`;
  h += `<a class="card link" href="../ruta/" style="text-decoration:none;color:inherit"><h3>Viento, tiempo y subidas</h3><p>Planifica la ruta a la hora de salida: previsión por tramos, puertos y avituallamiento.</p><span class="more">Planificar ruta →</span></a>`;
  const label = !p ? 'Crear mi perfil' : track ? 'Ver mi plan' : 'Elegir mi prueba';
  h += `<button class="fab" data-act="${!p ? 'profile' : track ? 'route' : 'choose'}">${ICON.flag} ${label}</button>`;
  return h;
}

function segmentsHtml() {
  return plan.segments.map((s, i) => {
    const k = KIND[s.kind];
    const open = state.open === i;
    let body = '';
    if (open) {
      body = `<div class="body">${segmentChart(s)}<div class="facts">
        <div><small>Distancia</small><b>${esc(fmtKm(s.length))}</b></div>
        <div><small>Desnivel</small><b>${s.kind === 'descent' ? '−' + Math.round(s.loss) : '+' + Math.round(s.gain)} m</b></div>
        <div><small>Pendiente</small><b>${esc(fmtPct(s.avg))}</b></div>
        <div><small>IF</small><b>${num(s.ifLo, 2)}–${num(s.ifHi, 2)}</b></div>
        <div><small>Duración</small><b>${esc(fmtDur(s.durMs))}</b></div>
        <div><small>Vel. estimada</small><b>${num(s.speedKmh, 1)} km/h</b></div></div>
        <p class="note">${s.kind === 'climb' ? `Cima a ${Math.round(s.top)} m · ` : ''}Pendiente máxima ${esc(fmtPct(s.max))} · ${s.kind === 'descent' ? 'rueda suave: en bajada no se gana tiempo empujando' : 'potencia media real ' + Math.round(s.pMean) + ' W'}</p></div>`;
    }
    return `<div class="seg${open ? ' open' : ''}" id="seg${i}" style="--c:${k.c}"><button data-seg="${i}" aria-expanded="${open}">
      <span class="gl">${k.g}</span><span class="nm"><b>${esc(s.kind === 'climb' ? `${s.name} ${s.climbNo}` : s.name)}</b>
      <span>${(s.start / 1000).toFixed(1)} - ${(s.end / 1000).toFixed(1)} km · ${esc(fmtPct(s.avg))}</span></span>
      <span class="w">${s.pLo}–${s.pHi} <small>W</small></span>${ICON.chev}</button>${body}</div>`;
  }).join('');
}

function nutritionHtml() {
  const n = nutri;
  let h = `<h2 class="sec">Nutrición</h2><p class="hint">${state.tempFrom ? esc(state.tempFrom) + '.' : `Sin fecha no hay previsión: el líquido está calculado para un día de unos ${state.temp} °C.`} Hidratos según el objetivo; el sodio y el líquido, según el calor.</p>
    <div class="totals"><div><b>${num(n.gph, 1)} g/h</b>hidratos</div><div><b>${n.totalCarbs} g</b>total</div><div><b>${n.count}</b>tomas</div><div><b>${n.naPerHour} mg/h</b>sodio</div></div>`;
  for (const x of n.items) {
    h += `<div class="take"><span class="ic">${TAKE_ICON[x.type]}</span><div class="tx"><b>${esc(fmtDur(x.ms))}</b> <span>${esc(x.where)} · ${esc(TYPE_LABEL[x.type])}</span><br>${esc(x.note)}</div><div class="am">${x.grams} g<small>${x.ml} ml</small></div></div>`;
  }
  return h;
}

function routeView() {
  const o = state.objective;
  let h = `<div class="bar"><button class="icon" data-act="home" aria-label="Volver">${ICON.back}</button><h1>${esc(state.saved.name || 'Ruta')}</h1>
    <button class="icon" data-act="map" aria-label="Mapa">${ICON.map}</button><button class="icon" data-act="share" aria-label="Compartir">${ICON.share}</button><button class="icon" data-act="menu" aria-label="Más">${ICON.more}</button></div>`;
  h += `<div class="profile" style="position:relative"><div id="profwrap" style="position:relative">${profileSvg('prof', { sel: state.open >= 0 ? plan.segments[state.open] : null })}${markerHtml()}<div id="scrub" class="readout" style="position:absolute;left:0;right:0;top:0;display:none;padding:4px 8px"></div></div></div>`;
  h += `<div class="stats"><div><strong>${esc(num(track.distance / 1000, 1))} km</strong><small>Distancia</small></div><div><strong>+${Math.round(track.gain).toLocaleString('es')} m</strong><small>Desnivel</small></div><div><strong>~${esc(fmtDur(plan.totalMs))}</strong><small>Estimado</small></div></div><div class="hr"></div>`;
  h += `<p class="q">¿Cómo la vas a hacer?</p><div class="chips">${Object.entries(OBJECTIVES).map(([k, v]) => `<button class="chip${k === o ? ' on' : ''}" data-obj="${k}">${v.label}</button>`).join('')}</div>`;
  h += `<p class="q">¿Cuándo la vas a hacer?</p><label class="field"><svg class="cal" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg> <input type="date" id="date" value="${esc(state.date)}" aria-label="¿Cuándo la vas a hacer?"></label>`;
  h += `<div class="card plan"><h3>El plan</h3><p>${esc(strat.text)}</p><div class="badges">${strat.chips.map((c) => `<span class="badge ${c.type}">${esc(c.text)}</span>`).join('')}</div></div>`;
  h += `<p class="hint">IF ${num(plan.IF, 2)} · NP ${Math.round(plan.np)} W · media ${Math.round(plan.avgPower)} W · ${Math.round(plan.kj)} kJ · TSS ≈ ${Math.round(plan.tss)} <span class="note">(estimado con un modelo físico propio, no medido)</span></p>`;
  h += segmentsHtml() + nutritionHtml();
  return `<div id="routeroot">${h}</div>`;
}

function render() {
  if (state.view === 'route' && !plan) state.view = 'home';
  app.innerHTML = state.view === 'route' ? routeView() : homeView();
  if (state.view === 'route') bindScrub($('#prof'), $('#scrub'));
}

// ---------- Interacción ----------
/** Arrastrar sobre el perfil: cursor, lectura en `out` (opcional) y `onMove(d, valores)`. Devuelve show(fracción). */
function bindScrub(svg, out, onMove, { keep = false } = {}) {
  if (!svg) return () => {};
  const cur = $('#' + svg.id + 'cur');
  const show = (f) => {
    const d = f * track.distance, at = planAt(plan, d);
    cur.setAttribute('visibility', 'visible');
    cur.firstElementChild.setAttribute('x1', f * 360); cur.firstElementChild.setAttribute('x2', f * 360);
    if (out) {
      out.style.display = '';
      out.innerHTML = `<p style="grid-column:1/-1;margin:0;background:rgba(14,17,22,.9);border-radius:8px;padding:4px 8px;font-size:12px">km ${num(d / 1000, 1)} · <b>${Math.round(at.power)} W</b> · ${num(at.grade * 100, 1)}% · ${num(at.kmh, 1)} km/h · ${fmtDur(at.ms)}</p>`;
    }
    onMove?.(d, at);
  };
  const move = (ev) => { const r = svg.getBoundingClientRect(); show(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width))); };
  const end = () => { if (keep) return; if (out) out.style.display = 'none'; cur.setAttribute('visibility', 'hidden'); };
  svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture?.(e.pointerId); move(e); });
  svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') move(e); });
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') end(); });
  return show;
}

window.addEventListener('popstate', () => { if (state.view === 'route') { state.view = 'home'; render(); } });
function pushRoute() { history.pushState({ v: 'route' }, ''); state.view = 'route'; render(); window.scrollTo(0, 0); }
function openRoute() { if (state.view === 'route') render(); else pushRoute(); }

function setOpen(i) {
  state.open = state.open === i ? -1 : i;
  render();
  if (state.open >= 0) $('#seg' + i)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function setRoute(name, raw) {
  const t = buildTrack(raw);
  state.saved = { name: name || 'Mi ruta', pts: decimate(t.points, 3500) };
  store.set('route', state.saved);
  state.open = -1;
  loadTrack(); await loadWeather(); compute();
  toast(`${state.saved.name}: ${num(track.distance / 1000, 1)} km`);
}

async function fromFile(file) {
  try {
    const isFit = /\.fit$/i.test(file.name);
    const parsed = isFit ? { name: file.name.replace(/\.fit$/i, ''), points: parseFIT(await file.arrayBuffer()) } : parseGPX(await file.text());
    const pts = Array.isArray(parsed.points) ? parsed.points : parsed.points?.points;
    if (!pts || pts.length < 2) throw new Error('El archivo no trae un recorrido con posición');
    await setRoute(parsed.name || file.name.replace(/\.\w+$/, ''), pts);
    $('#dialog').close(); openRoute();
  } catch (e) { toast(e.message || 'No se pudo leer el archivo', 4000); }
}

async function useExample() {
  try {
    const parsed = parseGPX(await (await fetch('ejemplo.gpx')).text());
    await setRoute(parsed.name, parsed.points);
    $('#dialog').close(); openRoute();
  } catch { toast('No se pudo cargar el ejemplo'); }
}

function dlg(html) { const d = $('#dialog'); d.innerHTML = html; if (!d.open) d.showModal(); return d; }

function chooseDialog() {
  const d = dlg(`<form method="dialog"><h2>Elige tu prueba</h2>
    <p class="note">Sube el track de tu marcha (.gpx o .fit). Se queda en este dispositivo; nada se envía a ningún servidor salvo, si pones fecha, la previsión del tiempo.</p>
    <button type="button" class="btn primary" data-act="pick">Subir un archivo</button>
    <button type="button" class="btn" data-act="example">Probar con una marcha de ejemplo</button>
    <div class="row"><button class="btn" value="cancel">Cerrar</button></div></form>`);
  return d;
}

function profileDialog() {
  const p = { ...DEFAULT_PROFILE, ...(state.profile || {}) };
  const sel = (v, cur, t) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${t}</option>`;
  const d = dlg(`<form id="pf"><h2>Tu perfil</h2>
    <label>Nivel<select name="level">${sel('beginner', p.level, 'Principiante')}${sel('intermediate', p.level, 'Intermedio')}${sel('advanced', p.level, 'Avanzado')}</select></label>
    <div class="two"><label>Edad<input name="age" type="number" min="14" max="90" value="${p.age}" required></label><label>Peso (kg)<input name="weight" type="number" step="0.1" min="35" max="140" value="${p.weight}" required></label></div>
    <div class="two"><label>FTP (W)<input name="ftp" type="number" min="80" max="500" value="${p.ftp}" required></label><label>Peso bici + equipo (kg)<input name="bike" type="number" step="0.1" min="5" max="25" value="${p.bike}" required></label></div>
    <label>Posición en la bici<select name="cda">${sel('0.40', p.cda.toFixed(2), 'Relajada (manos arriba)')}${sel('0.36', p.cda.toFixed(2), 'Normal (manos abajo del manillar)')}${sel('0.32', p.cda.toFixed(2), 'Agresiva / aerodinámica')}</select></label>
    <div class="two"><label>Forma CTL (opcional)<input name="ctl" type="number" min="0" max="250" value="${p.ctl || 0}"></label><label>Fatiga ATL (opcional)<input name="atl" type="number" min="0" max="300" value="${p.atl || 0}"></label></div>
    <p class="note">CTL (forma) y ATL (fatiga) salen de tu plataforma de entrenamiento y se escriben a mano. Con ellos el plan ajusta la intensidad: si vas cargado o la ruta es muy dura para tu forma, baja el ritmo; si vas fresco y en forma, lo sube un poco. Sin ellos, el plan no se ajusta.</p>
    <div class="row"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
  $('#pf', d).addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    state.profile = { level: f.get('level'), age: +f.get('age'), weight: +f.get('weight'), ftp: +f.get('ftp'), bike: +f.get('bike'), cda: +f.get('cda'), ctl: +f.get('ctl') || 0, atl: +f.get('atl') || 0 };
    store.set('profile', state.profile);
    d.close(); compute(); render();
    toast('Perfil guardado');
  });
}

function menuDialog() {
  const items = [['profile', 'Mi perfil']];
  if (track) items.push(['share', 'Compartir el plan'], ['download', 'Descargar el plan (.txt)'], ['choose', 'Cambiar de ruta'], ['clear', 'Quitar la ruta']);
  else items.push(['choose', 'Elegir una ruta']);
  dlg(`<div class="menu">${items.map(([a, t]) => `<button data-act="${a}">${t}</button>`).join('')}</div>`);
}

async function share() {
  const text = planAsText(plan, nutri, state.saved.name);
  try {
    if (navigator.share) await navigator.share({ title: `Plan: ${state.saved.name}`, text });
    else { await navigator.clipboard.writeText(text); toast('Plan copiado'); }
  } catch (e) { if (e.name !== 'AbortError') toast('No se pudo compartir'); }
}
function download() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([planAsText(plan, nutri, state.saved.name)], { type: 'text/plain' }));
  a.download = (state.saved.name || 'plan').replace(/[^\w-]+/g, '-') + '-plan.txt'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- Mapa ----------
let leafletReady = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  leafletReady ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = '../ruta/vendor/leaflet-1.9.4/leaflet.js'; s.onload = res; s.onerror = rej; document.head.append(s); });
  return leafletReady;
}
async function mapView() {
  try { await loadLeaflet(); } catch { toast('No se pudo cargar el mapa'); return; }
  const el = document.createElement('div'); el.id = 'mapview';
  el.innerHTML = `<div class="bar"><button class="icon" data-act="closemap" aria-label="Volver">${ICON.back}</button><h1>Mapa de la ruta</h1></div><div id="map"></div>
    <div class="readout" data-full="1"><div><small>Potencia</small><b id="rp">–</b></div><div><small>Pendiente</small><b id="rg">–</b></div><div><small>Vel. estimada</small><b id="rv">–</b></div><p id="rl">Desliza por el perfil para ver cada punto</p></div>
    <div class="profile" style="background:rgba(14,17,22,.92);padding:0 var(--gutter) 8px;position:relative"><div style="position:relative">${profileSvg('mprof', { markers: false, h: 90 })}</div></div>`;
  document.body.append(el);
  const map = L.map('map', { zoomControl: false, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  const col = { climb: '#f59e0b', descent: '#3b82c4', rolling: '#5cc8f0', flat: '#5cc8f0' };
  const all = [];
  for (const s of plan.segments) {
    const ll = []; for (let d = s.start; d <= s.end; d += Math.max(50, track.distance / 1500)) { const p = pointAt(track.points, d); ll.push([p.lat, p.lon]); }
    const e = pointAt(track.points, s.end); ll.push([e.lat, e.lon]); all.push(...ll);
    L.polyline(ll, { color: col[s.kind], weight: 4, opacity: .95 }).addTo(map);
  }
  map.fitBounds(L.latLngBounds(all), { padding: [24, 24] });
  const hardest = [...plan.climbs].sort((a, b) => b.gain * b.avg - a.gain * a.avg)[0];
  for (const c of plan.climbs) {
    const p = pointAt(track.points, c.end);
    L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', html: `<div class="pin" style="background:${c === hardest ? '#ef4444' : '#f59e0b'}">${c.climbNo}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(map);
  }
  const dot = L.marker(all[0], { icon: L.divIcon({ className: '', html: '<div class="dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(map);
  const show = bindScrub($('#mprof'), null, (d, at) => {
    const p = pointAt(track.points, d); dot.setLatLng([p.lat, p.lon]);
    $('#rp').innerHTML = `${Math.round(at.power)}<small> W</small>`; $('#rg').innerHTML = `${num(at.grade * 100, 1)}<small> %</small>`; $('#rv').innerHTML = `${num(at.kmh, 1)}<small> km/h</small>`;
    $('#rl').textContent = `${num(d / 1000, 1)} / ${num(track.distance / 1000, 1)} km · ${fmtDur(at.ms)} · ${at.seg.name}`;
  }, { keep: true });
  show(0);
  setTimeout(() => map.invalidateSize(), 50);
  el._map = map;
}
function closeMap() { const el = $('#mapview'); if (el) { el._map?.remove(); el.remove(); } }

// ---------- Eventos ----------
document.addEventListener('click', async (ev) => {
  const segBtn = ev.target.closest('[data-seg]');
  if (segBtn && state.view === 'route') { setOpen(+segBtn.dataset.seg); return; }
  const objBtn = ev.target.closest('[data-obj]');
  if (objBtn) { state.objective = objBtn.dataset.obj; store.set('objective', state.objective); compute(); render(); return; }
  const a = ev.target.closest('[data-act]')?.dataset.act;
  if (!a) return;
  if (a !== 'pick' && a !== 'example') { /* el menú se cierra al elegir */ const d = $('#dialog'); if (d.open && d.querySelector('.menu')) d.close(); }
  switch (a) {
    case 'home': history.back(); break;
    case 'route': pushRoute(); break;
    case 'choose': $('#dialog').open && $('#dialog').close(); chooseDialog(); break;
    case 'pick': $('#file').click(); break;
    case 'example': useExample(); break;
    case 'profile': $('#dialog').open && $('#dialog').close(); profileDialog(); break;
    case 'close': $('#dialog').close(); break;
    case 'menu': menuDialog(); break;
    case 'map': mapView(); break;
    case 'closemap': closeMap(); break;
    case 'share': share(); break;
    case 'download': download(); break;
    case 'clear': state.saved = null; store.del('route'); loadTrack(); compute(); if (state.view === 'route') history.back(); render(); break;
  }
});
$('#file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) fromFile(f); });
document.addEventListener('change', async (e) => {
  if (e.target.id === 'date') { state.date = e.target.value; store.set('date', state.date); await loadWeather(); compute(); render(); }
});

// ---------- Arranque ----------
// Enlace de importación: …/#importar?ftp=310&weight=69&ctl=59&atl=64 rellena el perfil (el fragmento # nunca se envía a ningún servidor).
let imported = false;
{
  const m = /^#importar\?(.+)$/.exec(location.hash);
  const p = m && profileFromQuery(m[1], { ...DEFAULT_PROFILE, ...(state.profile || {}) });
  if (p) { state.profile = p; store.set('profile', p); imported = true; }
  if (m) history.replaceState(null, '', location.pathname + location.search);
}
loadTrack(); await loadWeather(); compute(); render();
// Llegada desde «Planificar ruta» (…/pacing/?de=ruta): la ruta ya está guardada; se abre directamente el plan (o, si aún no hay perfil, se pide primero).
{   // …/pacing/?fecha=2027-04-02 (desde una carrera del club): deja puesta la fecha para el tiempo y la nutrición
  const f = /[?&]fecha=(\d{4}-\d{2}-\d{2})\b/.exec(location.search)?.[1];
  if (f && !Number.isNaN(Date.parse(f))) { state.date = f; store.set('date', f); await loadWeather(); compute(); render(); history.replaceState(null, '', location.pathname); }
}
if (/[?&]de=ruta\b/.test(location.search)) {
  history.replaceState(null, '', location.pathname);
  if (state.saved) { if (state.profile) openRoute(); else { toast('Antes dime tu FTP y tu peso para calcular los vatios', 4000); profileDialog(); } }
}
if (imported) toast('Perfil actualizado desde el enlace', 3500);
