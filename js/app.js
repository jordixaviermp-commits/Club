// Pantallas de la app. Sin dependencias ni paso de compilación: se sirve tal cual.
import { CONFIG } from './config.js';
import { supabaseApi, demoApi, friendlyError } from './api.js';
import {
  CATEGORIES, MODALITIES, PODIUM_TYPES, PROVINCES, DEFAULT_COUNTRY, podiumLabel, normalize, cleanName,
  parseBulkRunners, planRosterRenewal, isPodium, yearOf, availableYears, yearSummary, csvRows, toCsv, importResultsCsv,
  extractCode, todayISO, formatDate, MONTH_NAMES, monthGrid, addMonths,
} from './logic.js';

const CODE_KEY = 'monzon-code';
const VIEW_KEY = 'monzon-regview';
const FED_CALENDARS = [
  { label: 'Calendario Federació Catalana', url: 'https://www.ciclisme.cat/calendari/tot' },
  { label: 'Calendario Federación Aragonesa', url: 'https://aragonciclismo.com/es/smartweb/seccion/seccion/aragon/CALENDARIO_GLOBAL' },
];
const fedLinks = () => `<div class="fed-links">${FED_CALENDARS.map((c) =>
  `<a class="btn small" href="${c.url}" target="_blank" rel="noopener noreferrer">${esc(c.label)} ↗</a>`).join('')}</div>`;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* modo privado */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* modo privado */ } },
};

const api = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY && window.supabase
  ? supabaseApi(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY) : demoApi();

const S = {
  session: null, code: store.get(CODE_KEY),
  data: null, runnerData: null,
  year: new Date().getFullYear(), draft: null, busy: false, showPast: false, installEvt: null,
  regView: store.get(VIEW_KEY) === 'cal' ? 'cal' : 'list', calMonth: null, calDay: null,
};

const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const opt = (value, label, sel) => `<option value="${esc(value)}"${value === sel ? ' selected' : ''}>${esc(label)}</option>`;
const catSelect = (attrs, sel, emptyLabel = 'Sin categoría') =>
  `<select ${attrs}>${opt('', emptyLabel, sel || '')}${CATEGORIES.map((c) => opt(c, c, sel)).join('')}</select>`;
const byName = (a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
const runnerById = (id) => S.data?.runners.find((r) => r.id === id);
const linkFor = (code) => `${location.origin}${location.pathname}#/c/${code}`;
const place = (x) => [x.place, x.province, x.country && x.country !== DEFAULT_COUNTRY ? x.country : ''].filter(Boolean).join(' · ');

// ---------- utilidades de interfaz ----------

let toastTimer;
function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = 'toast'; }, isError ? 6000 : 2800);
}

/** Ventana con opciones. Devuelve el `value` elegido o null. */
function choose(title, text, options) {
  return new Promise((resolve) => {
    const dlg = document.getElementById('dialog');
    dlg.innerHTML = `<form method="dialog" class="dlg">
      <h2>${esc(title)}</h2>${text ? `<p>${text}</p>` : ''}
      <div class="dlg-actions">${options.map((o, i) =>
        `<button value="${i}" class="btn ${o.kind || ''}">${esc(o.label)}</button>`).join('')}
        <button value="" class="btn ghost">Cancelar</button></div></form>`;
    dlg.onclose = () => { const v = dlg.returnValue; resolve(v === '' ? null : options[Number(v)]?.value ?? null); };
    dlg.returnValue = '';
    dlg.showModal();
  });
}
const confirmAction = async (title, text, label, kind = 'danger') => (await choose(title, text, [{ label, value: true, kind }])) === true;

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function run(fn, okMsg) {
  if (S.busy) return;
  S.busy = true; document.body.classList.add('busy');
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { console.error(e); toast(friendlyError(e), true); return undefined; }
  finally { S.busy = false; document.body.classList.remove('busy'); }
}

async function reload() { S.data = await api.loadAll(); }

// ---------- rutas ----------

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { view: parts[0] || '', id: parts[1] || null };
}
const go = (hash) => { if (location.hash === hash) onRoute(); else location.hash = hash; };

async function onRoute() {
  const { view, id } = parseRoute();
  if (view === 'c' && id) {               // llegada desde el enlace personal
    const code = extractCode('#/c/' + id);
    S.code = code; store.set(CODE_KEY, code); S.runnerData = null;
    history.replaceState(null, '', location.pathname + '#/');
    return onRoute();
  }
  if (S.session?.isAdmin && !S.data) await run(reload);
  if (!S.session?.isAdmin && S.code && !S.runnerData && !['entrar'].includes(view)) await loadRunner();
  S.draft = null;
  if (S.session?.isAdmin) {
    if (view === 'inscripciones' && id) S.draft = draftRegistration(id);
    if (view === 'carreras' && id) S.draft = draftRace(id);
    if (view === 'federaciones' && !S.fed) loadFed();
  }
  render();
  window.scrollTo(0, 0);
}

async function loadRunner() {
  try { S.runnerData = await api.runnerView(S.code); }
  catch (e) {
    S.runnerData = null;
    if (/enlace_no_valido/.test(String(e?.message))) { store.del(CODE_KEY); S.code = null; }
    toast(friendlyError(e), true);
  }
}

// ---------- marco común ----------

const ADMIN_TABS = [
  ['inscripciones', 'Inscripciones', 'M8 2v3M16 2v3M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z'],
  ['carreras', 'Carreras', 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3'],
  ['resumen', 'Resumen', 'M4 20V10M10 20V4M16 20v-7M22 20H2'],
  ['corredores', 'Corredores', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8'],
  ['datos', 'Datos', 'M12 3c-4.4 0-8 1.3-8 3v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6c0-1.7-3.6-3-8-3zM4 6c0 1.7 3.6 3 8 3s8-1.3 8-3M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
];
const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

function frame(title, body, { back, actions = '' } = {}) {
  const { view } = parseRoute();
  const admin = S.session?.isAdmin;
  return `
    ${api.mode === 'demo' ? `<div class="demo-bar">Modo demostración: datos de prueba guardados solo en este móvil.</div>` : ''}
    <header class="top">
      ${back ? `<a class="back" href="${back}" aria-label="Volver">‹</a>` : '<img class="logo" src="icons/logo.png" alt="">'}
      <h1>${esc(title)}</h1>${actions}
    </header>
    <main>${body}</main>
    ${admin ? `<nav class="tabs">${ADMIN_TABS.map(([v, label, d]) =>
      `<a href="#/${v}" class="${view === v || (!view && v === 'inscripciones') ? 'on' : ''}">${icon(d)}<span>${label}</span></a>`).join('')}</nav>` : ''}`;
}

function render() {
  const { view } = parseRoute();
  const admin = S.session?.isAdmin;
  let html;
  if (view === 'entrar') html = viewLogin();
  else if (admin) {
    html = ({
      inscripciones: S.draft ? viewRegistrationEdit : viewRegistrations,
      carreras: S.draft ? viewRaceEdit : viewRaces,
      resumen: viewSummary, corredores: viewRunners, datos: viewData, federaciones: viewFed,
    }[view] || viewRegistrations)();
  } else if (S.code && S.runnerData) html = viewRunnerHome();
  else html = viewWelcome();
  $app.innerHTML = html;
  document.body.classList.toggle('has-tabs', !!admin && view !== 'entrar');
}

// ======================================================================
//  Corredores (sin cuenta): bienvenida y su pantalla
// ======================================================================

function installHint() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return '';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (S.installEvt) return `<button class="btn ghost small" data-act="install">Instalar la app en el móvil</button>`;
  if (ios) return `<p class="hint">Para tenerla como app: botón <b>Compartir</b> (cuadrado con flecha hacia arriba) → <b>Añadir a pantalla de inicio</b>.</p>`;
  return '';
}

function viewWelcome() {
  return frame('CC Monzón', `
    <section class="card center">
      <img src="icons/logo.png" alt="" class="hero-logo">
      <h2>Carreras del club</h2>
      <p>Abre el <b>enlace personal</b> que te ha enviado la dirección del club por WhatsApp.</p>
      <p class="muted">Si has instalado la app en el móvil y te pide el enlace, pégalo aquí (solo hace falta una vez):</p>
      <form data-form="code" class="stack">
        <input name="code" placeholder="Pega aquí tu enlace o código" autocomplete="off" autocapitalize="characters" required>
        <button class="btn primary">Entrar</button>
      </form>
    </section>
    ${api.mode === 'demo' ? `<section class="card"><h3>Probar la demostración</h3>
      <p>Entra como dirección para ver todas las pantallas. Desde «Corredores» puedes abrir el enlace de cualquier corredor de prueba.</p>
      <button class="btn" data-act="demo-admin">Entrar como dirección (demo)</button></section>` : ''}
    <p class="center"><a href="#/entrar" class="muted">Acceso de la dirección</a></p>`);
}

// ---------- Calendario de inscripciones (dirección y corredores) ----------

const ICON_CAL = 'M8 2v3M16 2v3M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z';
const ICON_LIST = 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01';
const viewToggle = () => S.regView === 'cal'
  ? `<button class="icon-btn" data-act="reg-view" aria-label="Ver como lista" title="Ver como lista">${icon(ICON_LIST)}</button>`
  : `<button class="icon-btn" data-act="reg-view" aria-label="Ver calendario" title="Ver calendario">${icon(ICON_CAL)}</button>`;

/**
 * Mes con las carreras marcadas y, debajo, las tarjetas de ese mes (o del día pulsado).
 * `isMine(g)` marca los días en que el corredor ya está apuntado.
 */
function calendarView(regs, card, isMine = () => false) {
  const today = todayISO();
  if (!S.calMonth) S.calMonth = (regs.find((g) => g.date >= today) || { date: today }).date.slice(0, 7);
  const ym = S.calMonth;
  const byDay = new Map();
  for (const g of regs) (byDay.get(g.date) || byDay.set(g.date, []).get(g.date)).push(g);
  const [y, m] = ym.split('-').map(Number);
  const inMonth = regs.filter((g) => g.date.startsWith(ym));
  if (S.calDay && !S.calDay.startsWith(ym)) S.calDay = null;
  const shown = S.calDay ? (byDay.get(S.calDay) || []) : inMonth;
  // carreras por mes (para saltar rápido a meses con carreras)
  const months = [...new Set(regs.map((g) => g.date.slice(0, 7)))].sort();
  const cell = (d) => {
    if (!d) return '<span class="cal-cell empty"></span>';
    const list = byDay.get(d) || [];
    const cls = ['cal-cell', list.length ? 'has' : '', d === today ? 'today' : '', d === S.calDay ? 'sel' : '',
      d < today ? 'past' : '', list.some(isMine) ? 'mine' : ''].filter(Boolean).join(' ');
    const label = `${Number(d.slice(8))} de ${MONTH_NAMES[m - 1]}${list.length ? `: ${list.map((g) => g.name).join(', ')}` : ''}`;
    return list.length
      ? `<button class="${cls}" data-act="cal-day" data-d="${d}" aria-label="${esc(label)}"><b>${Number(d.slice(8))}</b><i>${list.length > 1 ? list.length : ''}</i></button>`
      : `<span class="${cls}" aria-label="${esc(label)}"><b>${Number(d.slice(8))}</b></span>`;
  };
  return `
    <section class="card cal">
      <div class="cal-head">
        <button class="icon-btn" data-act="cal-month" data-n="-1" aria-label="Mes anterior">‹</button>
        <h2>${MONTH_NAMES[m - 1][0].toUpperCase() + MONTH_NAMES[m - 1].slice(1)} ${y}</h2>
        <button class="icon-btn" data-act="cal-month" data-n="1" aria-label="Mes siguiente">›</button>
      </div>
      <div class="cal-grid" role="grid">
        ${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<span class="cal-dow">${d}</span>`).join('')}
        ${monthGrid(ym).flat().map(cell).join('')}
      </div>
      ${months.length ? `<div class="cal-months">${months.map((mm) => {
        const [yy, mo] = mm.split('-').map(Number);
        const n = regs.filter((g) => g.date.startsWith(mm)).length;
        return `<button class="chip${mm === ym ? ' on' : ''}" data-act="cal-goto" data-m="${mm}">${MONTH_NAMES[mo - 1].slice(0, 3)} ${String(yy).slice(2)} · ${n}</button>`;
      }).join('')}</div>` : ''}
    </section>
    <h2 class="section">${S.calDay ? `${formatDate(S.calDay)} <button class="link small" data-act="cal-day" data-d="${S.calDay}">Ver todo el mes</button>`
      : `${inMonth.length} carrera${inMonth.length === 1 ? '' : 's'} en ${MONTH_NAMES[m - 1]}`}</h2>
    ${shown.length ? shown.map(card).join('') : '<p class="empty">No hay carreras este mes.</p>'}`;
}

function viewRunnerHome() {
  const d = S.runnerData, me = d.me, today = d.today || todayISO();
  const upcoming = d.registrations.filter((g) => g.date >= today);
  const past = d.registrations.filter((g) => g.date < today);
  const card = (g) => {
    const mine = g.entries.find((e) => e.runner_id === me.id);
    const open = g.date >= today;
    return `<article class="card race">
      <div class="race-head"><div><h3>${esc(g.name)}</h3>
        <p class="muted">${formatDate(g.date)}${place(g) ? ' · ' + esc(place(g)) : ''}</p></div>
        <span class="tag">${esc(g.modality)}</span></div>
      ${g.notes ? `<p class="notes">${esc(g.notes)}</p>` : ''}
      <p class="count">${g.entries.length} inscrito${g.entries.length === 1 ? '' : 's'}</p>
      ${g.entries.length ? `<ul class="people">${g.entries.map((e) =>
        `<li class="${e.runner_id === me.id ? 'me' : ''}">${esc(e.name)}${e.category ? ` <small>${esc(e.category)}</small>` : ''}</li>`).join('')}</ul>` : ''}
      ${!open ? '' : mine
        ? `<div class="row joined"><span>✓ Estás inscrito${mine.category ? ' en ' + esc(mine.category) : ''}</span>
           <button class="btn ghost small" data-act="r-leave" data-id="${g.id}">Borrarme</button></div>`
        : `<div class="row">${catSelect(`data-cat="${g.id}" aria-label="Tu categoría"`, me.category, 'Categoría')}
           <button class="btn primary" data-act="r-join" data-id="${g.id}">Apuntarme</button></div>`}
    </article>`;
  };
  const isMine = (g) => g.entries.some((e) => e.runner_id === me.id);
  const body = S.regView === 'cal'
    ? calendarView(d.registrations, card, isMine)
    : `<h2 class="section">Próximas carreras</h2>
    ${upcoming.length ? upcoming.map(card).join('') : '<p class="empty">Todavía no hay carreras abiertas.</p>'}
    ${past.length ? `<details class="past"><summary>Carreras ya disputadas pendientes de resultados (${past.length})</summary>${past.map(card).join('')}</details>` : ''}`;
  return frame('CC Monzón', `
    <p class="hello">Hola, <b>${esc(me.name)}</b> 👋</p>
    ${installHint()}
    ${body}
    <h2 class="section">Calendarios de las federaciones</h2>
    ${fedLinks()}
    <p class="center"><button class="link muted" data-act="r-forget">No soy ${esc(me.name)}</button></p>`,
  { actions: `${viewToggle()}<button class="icon-btn" data-act="r-refresh" aria-label="Actualizar">↻</button>` });
}

// ======================================================================
//  Acceso de la dirección
// ======================================================================

function viewLogin() {
  if (api.mode === 'demo') {
    return frame('Acceso dirección', `<section class="card"><p>En modo demostración no hace falta contraseña.</p>
      <button class="btn primary" data-act="demo-admin">Entrar como dirección (demo)</button></section>`, { back: '#/' });
  }
  return frame('Acceso dirección', `
    <form class="card stack" data-form="login">
      <label>Email<input type="email" name="email" autocomplete="username" required></label>
      <label>Contraseña<input type="password" name="password" autocomplete="current-password" required></label>
      <button class="btn primary">Entrar</button>
    </form>
    ${S.session && !S.session.isAdmin ? `<p class="card warn">Has entrado como ${esc(S.session.email)}, pero esta cuenta no es de la dirección.
      <button class="link" data-act="logout">Salir</button></p>` : ''}`, { back: '#/' });
}

// ======================================================================
//  Inscripciones (dirección)
// ======================================================================

function viewRegistrations() {
  const today = todayISO();
  const regs = [...S.data.registrations].sort((a, b) => a.date.localeCompare(b.date) || byName(a, b));
  const card = (g) => `<a class="card race link-card" href="#/inscripciones/${g.id}">
      <div class="race-head"><div><h3>${esc(g.name)}</h3>
      <p class="muted">${formatDate(g.date)}${place(g) ? ' · ' + esc(place(g)) : ''}</p></div><span class="tag">${esc(g.modality)}</span></div>
      ${g.date < today ? '<p class="warn-inline">Ya se ha disputado: pásala a resultados.</p>' : ''}
      <p class="count">${g.entries.length} inscrito${g.entries.length === 1 ? '' : 's'}${g.entries.length ? ': ' +
        esc(g.entries.map((e) => runnerById(e.runner_id)?.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')).join(', ')) : ''}</p></a>`;
  return frame('Inscripciones', `
    <a class="btn primary block" href="#/inscripciones/nueva">+ Nueva inscripción</a>
    <a class="btn block" href="#/federaciones">Carreras de las federaciones (catalana y aragonesa)</a>
    ${fedLinks()}
    ${S.regView === 'cal' ? calendarView(regs, card)
      : regs.length ? regs.map(card).join('') : '<p class="empty">No hay inscripciones abiertas.</p>'}`,
  { actions: viewToggle() });
}

// ---------- Carreras de las federaciones (leídas cada semana por GitHub) ----------

const FED_DATA_URLS = [
  // el archivo del repositorio está siempre al día; la copia publicada con la app, de respaldo
  'https://raw.githubusercontent.com/jordixaviermp-commits/Club/main/data/calendarios.json',
  'data/calendarios.json',
];
const FED_NAMES = { FCC: 'Catalana', FAC: 'Aragonesa' };
const fedFilter = { source: 'all', modality: 'all', leisure: false };

async function loadFed() {
  S.fed = { loading: true };
  for (const url of FED_DATA_URLS) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data.races)) { S.fed = data; break; }
    } catch { /* probar la siguiente */ }
  }
  if (S.fed.loading) S.fed = { failed: true };
  if (parseRoute().view === 'federaciones') render();
}

function viewFed() {
  const f = S.fed;
  if (!f || f.loading) return frame('Federaciones', '<p class="empty">Cargando calendarios…</p>', { back: '#/inscripciones' });
  if (f.failed) return frame('Federaciones', `<p class="card warn">No se han podido cargar los calendarios. Revisa la conexión o usa los enlaces directos:</p>${fedLinks()}`, { back: '#/inscripciones' });
  const today = todayISO();
  const created = new Set(S.data.registrations.concat(S.data.races).map((g) => g.date + '|' + normalize(g.name)));
  const list = f.races.filter((r) => r.date >= today
    && (fedFilter.source === 'all' || r.source === fedFilter.source)
    && (fedFilter.modality === 'all' || r.modality === fedFilter.modality)
    && (fedFilter.leisure || r.kind !== 'Ocio'));
  const mods = MODALITIES.filter((m) => f.races.some((r) => r.modality === m));
  let month = '';
  const items = list.map((r, i) => {
    const ym = r.date.slice(0, 7);
    const head = ym !== month ? `<h2 class="section">${MONTH_NAMES[Number(ym.slice(5)) - 1][0].toUpperCase() + MONTH_NAMES[Number(ym.slice(5)) - 1].slice(1)} ${ym.slice(0, 4)}</h2>` : '';
    month = ym;
    const done = created.has(r.date + '|' + normalize(r.name));
    return `${head}<article class="card race fed">
      <div class="race-head"><div><h3>${esc(r.name)}</h3>
        <p class="muted">${formatDate(r.date)}${place(r) ? ' · ' + esc(place(r)) : ''}</p></div>
        <span class="tag">${esc(r.modality)}</span></div>
      <p class="fed-meta"><span class="src src-${esc(r.source)}">${esc(FED_NAMES[r.source] || r.source)}</span>
        ${esc(r.discipline || '')}${r.kind === 'Ocio' ? ' · ocio' : ''}${r.info ? ` · <span class="muted">${esc(r.info)}</span>` : ''}</p>
      <div class="row">
        <a class="btn small" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Ver en la web ↗</a>
        ${done ? '<span class="done">✓ Ya está en la app</span>'
          : `<button class="btn primary small" data-act="fed-create" data-i="${f.races.indexOf(r)}">Crear inscripción</button>`}
      </div></article>`;
  }).join('');
  const updated = f.updated_at ? new Date(f.updated_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return frame('Federaciones', `
    <div class="years" role="tablist">${[['all', 'Todas'], ['FCC', 'Catalana'], ['FAC', 'Aragonesa']].map(([v, l]) =>
      `<button class="chip${fedFilter.source === v ? ' on' : ''}" data-act="fed-source" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="grid2 fed-filters">
      <label>Modalidad<select data-fed="modality">${opt('all', 'Todas', fedFilter.modality)}${mods.map((m) => opt(m, m, fedFilter.modality)).join('')}</select></label>
      <label class="check"><input type="checkbox" data-fed="leisure" ${fedFilter.leisure ? 'checked' : ''}> Incluir ocio y marchas</label>
    </div>
    <p class="hint">${list.length} carrera${list.length === 1 ? '' : 's'}. Pulsa «Crear inscripción» para añadirla con nombre, fecha y lugar ya rellenados.</p>
    ${items || '<p class="empty">No hay carreras con estos filtros.</p>'}
    ${f.errors?.length ? `<p class="card warn">Aviso de la última lectura: ${esc(f.errors.join(' · '))}</p>` : ''}
    <p class="hint center">Datos de las webs de las federaciones${updated ? `, leídos el ${updated}` : ''}. Comprueba siempre los detalles en su web.</p>
    ${fedLinks()}`, { back: '#/inscripciones' });
}

function draftRegistration(id) {
  if (id === 'nueva') {
    const pre = S.prefill; S.prefill = null;   // viene de «Carreras de las federaciones»
    return { kind: 'reg', id: null, name: '', date: '', place: '', province: '', country: DEFAULT_COUNTRY, modality: 'Carretera', notes: '', people: [], ...pre };
  }
  const g = S.data.registrations.find((x) => x.id === id);
  if (!g) return null;
  return { kind: 'reg', ...g, people: g.entries.map((e) => ({ runner_id: e.runner_id, runner_name: runnerById(e.runner_id)?.name || '?', category: e.category || '' })).sort((a, b) => a.runner_name.localeCompare(b.runner_name, 'es')) };
}

function raceFields(d) {
  return `
    <label>Nombre<input data-f="name" value="${esc(d.name)}" required></label>
    <div class="grid2">
      <label>Fecha<input type="date" data-f="date" value="${esc(d.date)}" required></label>
      <label>Modalidad<select data-f="modality">${MODALITIES.map((m) => opt(m, m, d.modality)).join('')}</select></label>
    </div>
    <label>Lugar<input data-f="place" value="${esc(d.place || '')}"></label>
    <div class="grid2">
      <label>Provincia<input data-f="province" list="dl-prov" value="${esc(d.province || '')}" autocomplete="off"></label>
      <label>País<input data-f="country" list="dl-country" value="${esc(d.country || '')}"></label>
    </div>`;
}

function addRunnerSelect(d) {
  const taken = new Set(d.people.map((p) => p.runner_id));
  const free = S.data.runners.filter((r) => !taken.has(r.id)).sort(byName);
  if (!free.length) return S.data.runners.length ? '' : '<p class="muted">Primero da de alta corredores en «Corredores».</p>';
  return `<select data-act-change="add-person"><option value="">+ Añadir corredor…</option>${free.map((r) => opt(r.id, r.name)).join('')}</select>`;
}

function viewRegistrationEdit() {
  const d = S.draft;
  if (!d) return frame('Inscripción', '<p class="empty">Esta inscripción ya no existe.</p>', { back: '#/inscripciones' });
  return frame(d.id ? 'Editar inscripción' : 'Nueva inscripción', `
    <form class="card stack" data-form="save-reg">
      ${raceFields(d)}
      <label>Notas<textarea data-f="notes" rows="2">${esc(d.notes || '')}</textarea></label>
      <h3>Inscritos (${d.people.length})</h3>
      <ul class="edit-list">${d.people.map((p, i) => `<li>
        <span class="name">${esc(p.runner_name)}</span>
        ${catSelect(`data-p="${i}" data-pf="category" aria-label="Categoría"`, p.category)}
        <button type="button" class="icon-btn" data-act="del-person" data-i="${i}" aria-label="Quitar">✕</button></li>`).join('')}</ul>
      ${addRunnerSelect(d)}
      <button class="btn primary">Guardar</button>
    </form>
    ${d.id ? `<div class="stack">
      <button class="btn" data-act="promote">Pasar a resultados</button>
      <button class="btn danger ghost" data-act="del-reg">Borrar inscripción</button></div>` : ''}`,
  { back: '#/inscripciones' });
}

// ======================================================================
//  Carreras con resultados (dirección)
// ======================================================================

const medal = (p) => ['', '🥇', '🥈', '🥉'][p] || '';

function viewRaces() {
  const years = availableYears(S.data.races);
  if (!years.includes(S.year)) S.year = years[0];
  const races = S.data.races.filter((r) => yearOf(r.date) === S.year).sort((a, b) => b.date.localeCompare(a.date) || byName(a, b));
  const card = (r) => {
    const pods = r.results.filter((x) => isPodium(x.position)).sort((a, b) => a.position - b.position);
    return `<a class="card race link-card" href="#/carreras/${r.id}">
      <div class="race-head"><div><h3>${esc(r.name)}</h3>
      <p class="muted">${formatDate(r.date)}${place(r) ? ' · ' + esc(place(r)) : ''}</p></div><span class="tag">${esc(r.modality)}</span></div>
      <p class="count">${r.results.length} participante${r.results.length === 1 ? '' : 's'}</p>
      ${pods.length ? `<p class="pods">${pods.map((x) => `${medal(x.position)} ${esc(x.runner_name)}${x.category ? ` <small>${esc(x.category)}</small>` : ''}`).join(' · ')}</p>` : ''}</a>`;
  };
  return frame('Carreras', `
    ${yearPicker(years)}
    <a class="btn primary block" href="#/carreras/nueva">+ Nueva carrera</a>
    ${races.length ? races.map(card).join('') : `<p class="empty">No hay carreras en ${S.year}.</p>`}`);
}

function yearPicker(years) {
  return `<div class="years" role="tablist">${years.map((y) =>
    `<button class="chip${y === S.year ? ' on' : ''}" data-act="year" data-y="${y}">${y}</button>`).join('')}</div>`;
}

function draftRace(id) {
  if (id === 'nueva') return { kind: 'race', id: null, name: '', date: '', place: '', province: '', country: DEFAULT_COUNTRY, modality: 'Carretera', notes: '', people: [] };
  const r = S.data.races.find((x) => x.id === id);
  if (!r) return null;
  return { kind: 'race', ...r, people: r.results.map((x) => ({ runner_id: x.runner_id, runner_name: x.runner_name, category: x.category || '',
    position: x.position ?? '', podium_type: x.podium_type || 'suelta' }))
    .sort((a, b) => (a.position || 9999) - (b.position || 9999) || a.runner_name.localeCompare(b.runner_name, 'es')) };
}

function viewRaceEdit() {
  const d = S.draft;
  if (!d) return frame('Carrera', '<p class="empty">Esta carrera ya no existe.</p>', { back: '#/carreras' });
  return frame(d.id ? 'Editar carrera' : 'Nueva carrera', `
    <form class="card stack" data-form="save-race">
      ${raceFields(d)}
      <label>Notas<textarea data-f="notes" rows="2">${esc(d.notes || '')}</textarea></label>
      <h3>Participantes (${d.people.length})</h3>
      <p class="hint">Puesto = clasificación en su categoría. Del 1 al 3 es podio: indica de qué tipo.</p>
      <ul class="edit-list results">${d.people.map((p, i) => {
        const pod = isPodium(Number(p.position));
        return `<li>
        <span class="name">${esc(p.runner_name)}${p.runner_id ? '' : ' <small class="muted">(ya no está en la plantilla)</small>'}</span>
        <button type="button" class="icon-btn" data-act="del-person" data-i="${i}" aria-label="Quitar">✕</button>
        <div class="res-fields">
          ${catSelect(`data-p="${i}" data-pf="category" aria-label="Categoría"`, p.category)}
          <input type="number" inputmode="numeric" min="1" placeholder="Puesto" aria-label="Puesto" data-p="${i}" data-pf="position" value="${esc(p.position)}">
          <select data-p="${i}" data-pf="podium_type" aria-label="Tipo de podio" ${pod ? '' : 'disabled'}>
            ${PODIUM_TYPES.map((t) => opt(t.id, t.label, p.podium_type)).join('')}</select>
        </div></li>`;
      }).join('')}</ul>
      ${addRunnerSelect(d)}
      <p class="hint">Un corredor tiene un solo puesto por carrera. En una prueba por etapas con podio de etapa y de general, crea dos carreras (p. ej. «Volta – etapa 2» y «Volta – general»).</p>
      <button class="btn primary">Guardar</button>
    </form>
    ${d.id ? `<button class="btn danger ghost block" data-act="del-race">Borrar carrera</button>` : ''}`,
  { back: '#/carreras' });
}

// ======================================================================
//  Resumen anual
// ======================================================================

function viewSummary() {
  const years = availableYears(S.data.races);
  if (!years.includes(S.year)) S.year = years[0];
  const s = yearSummary(S.year, S.data.races, S.data.runners);
  const kpi = (n, label) => `<div class="kpi"><b>${n}</b><span>${label}</span></div>`;
  const table = (head, rows, cls = '') => `<div class="table-wrap"><table class="${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${head.length}" class="muted">Sin datos</td></tr>`}</tbody></table></div>`;
  return frame('Resumen anual', `
    ${yearPicker(years)}
    <div class="kpis">${kpi(s.totals.races, 'carreras')}${kpi(s.totals.runners, 'corredores')}${kpi(s.totals.podiums, 'podios')}${kpi(s.totals.wins, 'victorias')}</div>

    <section class="card"><h2>Por modalidad</h2>
      ${table(['Modalidad', 'Carreras', 'Particip.', 'Podios'], s.byModality.map((m) =>
        `<tr><td>${esc(m.modality)}</td><td>${m.races}</td><td>${m.participations}</td><td>${m.podiums}</td></tr>`), 'num')}</section>

    <section class="card"><h2>Dónde se ha competido</h2>
      <div class="grid2 top-align">
        ${table(['País', 'Carreras'], s.countries.map((c) => `<tr><td>${esc(c.name)}</td><td>${c.races}</td></tr>`), 'num')}
        ${table(['Provincia', 'Carreras'], s.provinces.map((c) => `<tr><td>${esc(c.name)}</td><td>${c.races}</td></tr>`), 'num')}
      </div>
      ${s.missingPlace.length ? `<div class="warn"><b>Faltan datos en ${s.missingPlace.length} carrera${s.missingPlace.length === 1 ? '' : 's'}:</b>
        <ul>${s.missingPlace.map((m) => `<li><a href="#/carreras/${m.id}">${esc(m.name)}</a> (${formatDate(m.date, false)}): sin ${m.missing.join(' ni ')}</li>`).join('')}</ul></div>` : ''}
    </section>

    <section class="card"><h2>Participaciones por corredor</h2>
      ${table(['Corredor', 'Carr.', 'Carret.', 'BTT', '1º', '2º', '3º'], s.perRunner.map((r) =>
        `<tr class="${r.races ? '' : 'zero'}"><td>${esc(r.name)}${r.current ? '' : ' <small class="muted">(baja)</small>'}</td><td>${r.races}</td><td>${r.road}</td><td>${r.btt}</td><td>${r.p1}</td><td>${r.p2}</td><td>${r.p3}</td></tr>`), 'num')}</section>

    <section class="card"><h2>Podios por tipo</h2>
      ${table(['Tipo', 'Podios', 'Victorias'], s.byPodiumType.map((t) => `<tr><td>${esc(t.label)}</td><td>${t.podiums}</td><td>${t.wins}</td></tr>`), 'num')}
      <h3>Podios del año</h3>
      ${s.podiumList.length ? `<ul class="podium-list">${s.podiumList.map((p) => `<li><span class="medal">${medal(p.position)}</span><div>
        <b>${esc(p.runner)}</b>${p.category ? ` <small class="muted">${esc(p.category)}</small>` : ''} · ${p.position}º
        <br><a href="#/carreras/${p.raceId}">${esc(p.race)}</a> <span class="muted">· ${formatDate(p.date, false)} · ${esc(podiumLabel(p.type))}</span></div></li>`).join('')}</ul>`
        : '<p class="muted">Sin podios este año.</p>'}
    </section>

    <button class="btn block" data-act="csv-year">Exportar ${S.year} a CSV (Excel)</button>`);
}

// ======================================================================
//  Plantilla
// ======================================================================

function viewRunners() {
  const counts = new Map();
  for (const r of S.data.races) for (const x of r.results) if (x.runner_id) counts.set(x.runner_id, (counts.get(x.runner_id) || 0) + 1);
  const runners = [...S.data.runners].sort(byName);
  return frame(`Corredores (${runners.length})`, `
    <details class="card" ${runners.length ? '' : 'open'}>
      <summary><b>+ Añadir corredores</b></summary>
      <form class="stack" data-form="bulk">
        <p class="hint">Uno por línea. La categoría es opcional: «Pere Soler, M40». Los nombres repetidos se ignoran (sin importar mayúsculas ni tildes).</p>
        <textarea name="bulk" rows="5" placeholder="Pere Soler, M40&#10;Anna Puig, Élite&#10;Jordi Vila"></textarea>
        <button class="btn primary">Añadir</button>
      </form>
    </details>
    <details class="card">
      <summary><b>↻ Renovar plantilla del año</b></summary>
      <form class="stack" data-form="renew">
        <p class="hint">Pega la lista completa de la nueva temporada, uno por línea («Pere Soler, M40»). Antes de cambiar nada verás un resumen:</p>
        <ul class="hint"><li>Quien sigue <b>conserva su enlace</b> (no hay que reenviárselo). Si pones categoría, se actualiza.</li>
          <li>Quien es nuevo se da de alta y recibe enlace.</li>
          <li>Quien no está en la lista se da de baja: su enlace deja de funcionar, pero <b>sus resultados se conservan</b> en el historial.</li></ul>
        <textarea name="renew" rows="6" placeholder="Pere Soler, M40&#10;Anna Puig, Élite&#10;…"></textarea>
        <button class="btn primary">Revisar cambios</button>
      </form>
    </details>
    ${runners.length ? '<button class="btn block" data-act="all-links">Copiar todos los enlaces</button>' : ''}
    <ul class="roster">${runners.map((r) => `<li>
      <div><span class="name">${esc(r.name)}</span><small class="muted">${counts.get(r.id) || 0} carreras</small></div>
      ${catSelect(`data-runner-cat="${r.id}" aria-label="Categoría habitual"`, r.category || '')}
      <button class="icon-btn" data-act="runner-menu" data-id="${r.id}" aria-label="Opciones de ${esc(r.name)}">⋯</button></li>`).join('')}</ul>
    ${runners.length ? '' : '<p class="empty">Todavía no hay corredores.</p>'}`);
}

// ======================================================================
//  Datos: copias, migración, privacidad
// ======================================================================

function viewData() {
  return frame('Datos', `
    <section class="card stack"><h2>Copia de seguridad</h2>
      <p>Descarga todos los datos (corredores, inscripciones, carreras y resultados) en un archivo. Guárdalo en tu Drive o correo una vez al mes.</p>
      <button class="btn primary" data-act="backup">Descargar copia completa</button>
      <button class="btn" data-act="csv-all">Exportar todos los resultados a CSV</button>
    </section>
    <section class="card stack"><h2>Restaurar o migrar</h2>
      <label class="btn file">Restaurar copia completa (.json)<input type="file" accept=".json,application/json" data-file="restore" hidden></label>
      <p class="hint">Sustituye <b>todos</b> los datos actuales por los de la copia.</p>
      <label class="btn file">Importar resultados desde CSV<input type="file" accept=".csv,text/csv,text/plain" data-file="csv" hidden></label>
      <p class="hint">Columnas: Fecha, Carrera, Lugar, Provincia, País, Modalidad, Corredor, Categoría, Puesto y Tipo de podio (las mismas que la exportación). Se añaden a lo que ya hay; las carreras que ya existan (misma fecha y nombre) se saltan.</p>
    </section>
    <section class="card"><h2>Privacidad</h2>
      <p>Solo se guarda el nombre, la categoría y las carreras de cada corredor. Los datos están en un servidor de la UE (Frankfurt).
      Para dar a un corredor sus datos o borrarlos: «Corredores» → ⋯ junto a su nombre.</p></section>
    ${api.mode === 'demo' ? `<button class="btn ghost block" data-act="demo-reset">Reiniciar datos de demostración</button>` : ''}
    <p class="muted center">Sesión: ${esc(S.session?.email)}</p>
    <button class="btn ghost block" data-act="logout">Cerrar sesión</button>`);
}

// ======================================================================
//  Acciones
// ======================================================================

function draftPayload() {
  const d = S.draft;
  const base = { id: d.id, name: cleanName(d.name), date: d.date, place: cleanName(d.place), province: cleanName(d.province),
    country: cleanName(d.country), modality: d.modality, notes: String(d.notes || '').trim() };
  if (!base.name) throw new Error('Falta el nombre de la carrera.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base.date || '')) throw new Error('Falta la fecha.');
  return base;
}

async function saveRegistrationDraft() {
  const d = S.draft;
  const id = await api.saveRegistration(draftPayload(), d.people.map((p) => ({ runner_id: p.runner_id, category: p.category || null })));
  await reload();
  return id;
}

const actions = {
  async install() { S.installEvt?.prompt(); S.installEvt = null; render(); },
  async 'demo-admin'() { await api.signIn(); S.session = await api.session(); await run(reload); go('#/inscripciones'); },
  async 'demo-reset'() {
    if (!await confirmAction('Reiniciar demostración', 'Se borran los cambios de prueba y se cargan los datos de ejemplo.', 'Reiniciar')) return;
    await api.resetDemo(); await run(reload, 'Demostración reiniciada'); render();
  },
  async logout() { await api.signOut(); S.session = null; S.data = null; go('#/'); },

  // corredor
  async 'r-join'(el) {
    const cat = $app.querySelector(`[data-cat="${el.dataset.id}"]`)?.value || null;
    await run(async () => { await api.runnerJoin(S.code, el.dataset.id, cat); await loadRunner(); }, '¡Apuntado!');
    render();
  },
  async 'r-leave'(el) {
    if (!await confirmAction('Borrar inscripción', '¿Seguro que quieres borrarte de esta carrera?', 'Sí, borrarme')) return;
    await run(async () => { await api.runnerLeave(S.code, el.dataset.id); await loadRunner(); }, 'Te has borrado');
    render();
  },
  async 'r-refresh'() { await run(loadRunner, 'Actualizado'); render(); },
  async 'r-forget'() {
    if (!await confirmAction('Salir', 'Se olvidará tu enlace en este móvil. Para volver a entrar necesitarás abrirlo de nuevo.', 'Salir')) return;
    store.del(CODE_KEY); S.code = null; S.runnerData = null; go('#/');
  },

  // listas de inscritos / participantes
  'del-person'(el) { S.draft.people.splice(Number(el.dataset.i), 1); render(); },
  year(el) { S.year = Number(el.dataset.y); render(); },
  'fed-source'(el) { fedFilter.source = el.dataset.v; render(); },
  'fed-create'(el) {
    const r = S.fed.races[Number(el.dataset.i)];
    S.prefill = { name: r.name, date: r.date, place: r.place || '', province: r.province || '', country: r.country || DEFAULT_COUNTRY,
      modality: r.modality, notes: `Federación ${FED_NAMES[r.source] || r.source}: ${r.url}` };
    go('#/inscripciones/nueva');
  },
  'reg-view'() { S.regView = S.regView === 'cal' ? 'list' : 'cal'; S.calDay = null; store.set(VIEW_KEY, S.regView); render(); },
  'cal-month'(el) { S.calMonth = addMonths(S.calMonth, Number(el.dataset.n)); S.calDay = null; render(); },
  'cal-goto'(el) { S.calMonth = el.dataset.m; S.calDay = null; render(); },
  'cal-day'(el) {
    S.calDay = S.calDay === el.dataset.d ? null : el.dataset.d; render();
    document.querySelector('h2.section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  async promote() {
    if (!await confirmAction('Pasar a resultados', 'Se creará la carrera con estos inscritos y la inscripción desaparecerá. Luego podrás poner los puestos.', 'Pasar a resultados', 'primary')) return;
    const raceId = await run(async () => {
      const id = await saveRegistrationDraft();
      const r = await api.promoteRegistration(id); await reload(); return r;
    }, 'Carrera creada: añade los puestos');
    if (raceId) go('#/carreras/' + raceId);
  },
  async 'del-reg'() {
    if (!await confirmAction('Borrar inscripción', `Se borrará «${esc(S.draft.name)}» con todos sus inscritos.`, 'Borrar')) return;
    if (await run(async () => { await api.deleteRegistration(S.draft.id); await reload(); return true; }, 'Inscripción borrada')) go('#/inscripciones');
  },
  async 'del-race'() {
    if (!await confirmAction('Borrar carrera', `Se borrará «${esc(S.draft.name)}» con todos sus resultados.`, 'Borrar')) return;
    if (await run(async () => { await api.deleteRace(S.draft.id); await reload(); return true; }, 'Carrera borrada')) go('#/carreras');
  },

  async 'runner-menu'(el) {
    const r = runnerById(el.dataset.id);
    const link = linkFor(r.code);
    const choice = await choose(r.name, `Enlace personal: <code class="break">${esc(link)}</code>`, [
      { label: 'Enviar enlace por WhatsApp', value: 'wa', kind: 'primary' },
      { label: 'Copiar enlace', value: 'copy' },
      ...(api.mode === 'demo' ? [{ label: 'Abrir su pantalla (demo)', value: 'open' }] : []),
      { label: 'Cambiar nombre', value: 'rename' },
      { label: 'Crear enlace nuevo (anula el anterior)', value: 'regen' },
      { label: 'Descargar sus datos', value: 'export' },
      { label: 'Borrar corredor', value: 'delete', kind: 'danger ghost' },
    ]);
    if (!choice) return;
    if (choice === 'wa') {
      const msg = `Hola ${r.name}! Este es tu enlace personal para ver las carreras del Club Ciclista Monzón y apuntarte:\n${link}\n\nEs solo tuyo: no lo reenvíes. Consejo: ábrelo y añádelo a la pantalla de inicio.`;
      window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
    } else if (choice === 'copy') {
      try { await navigator.clipboard.writeText(link); toast('Enlace copiado'); } catch { prompt('Copia el enlace:', link); }
    } else if (choice === 'open') {
      await api.signOut(); S.session = null; S.data = null; go('#/c/' + r.code);
    } else if (choice === 'rename') {
      const name = cleanName(prompt('Nuevo nombre:', r.name) || '');
      if (!name || name === r.name) return;
      if (S.data.runners.some((x) => x.id !== r.id && normalize(x.name) === normalize(name))) return toast('Ya hay un corredor con ese nombre.', true);
      await run(async () => { await api.updateRunner(r.id, { name }); await reload(); }, 'Nombre cambiado'); render();
    } else if (choice === 'regen') {
      if (!await confirmAction('Enlace nuevo', `El enlace actual de ${esc(r.name)} dejará de funcionar. Tendrás que enviarle el nuevo.`, 'Crear enlace nuevo')) return;
      await run(async () => { await api.regenerateCode(r.id); await reload(); }, 'Enlace nuevo creado: envíaselo'); render();
    } else if (choice === 'export') {
      const races = S.data.races.filter((x) => x.results.some((y) => y.runner_id === r.id));
      const data = { corredor: { nombre: r.name, categoria: r.category, alta: r.created_at },
        resultados: races.map((x) => { const y = x.results.find((z) => z.runner_id === r.id);
          return { fecha: x.date, carrera: x.name, lugar: x.place, provincia: x.province, pais: x.country, modalidad: x.modality, categoria: y.category, puesto: y.position, tipo_podio: isPodium(y.position) ? podiumLabel(y.podium_type) : null }; }),
        inscripciones: S.data.registrations.filter((g) => g.entries.some((e) => e.runner_id === r.id)).map((g) => ({ fecha: g.date, carrera: g.name })) };
      download(`datos-${normalize(r.name).replace(/\W+/g, '-')}.json`, JSON.stringify(data, null, 2), 'application/json');
    } else if (choice === 'delete') {
      const how = await choose(`Borrar a ${r.name}`, 'Sale de la plantilla y de las inscripciones abiertas. ¿Qué hacemos con sus resultados de carreras pasadas?', [
        { label: 'Mantener su nombre en el historial', value: 'keep', kind: 'primary' },
        { label: 'Borrar también su nombre del historial (lo pide el corredor)', value: 'anon', kind: 'danger' },
      ]);
      if (!how) return;
      await run(async () => { await api.deleteRunner(r.id, how === 'anon'); await reload(); }, 'Corredor borrado'); render();
    }
  },

  async 'all-links'() {
    const text = [...S.data.runners].sort(byName).map((r) => `${r.name}: ${linkFor(r.code)}`).join('\n');
    try { await navigator.clipboard.writeText(text); toast(`${S.data.runners.length} enlaces copiados: pégalos en tus notas y envía a cada uno el suyo`); }
    catch { download('enlaces-corredores.txt', text, 'text/plain;charset=utf-8'); }
  },
  async backup() {
    const data = await run(() => api.exportAll());
    if (data) download(`monzon-copia-${todayISO()}.json`, JSON.stringify(data, null, 1), 'application/json');
  },
  'csv-year'() { download(`monzon-resultados-${S.year}.csv`, toCsv(csvRows(S.data.races.filter((r) => yearOf(r.date) === S.year))), 'text/csv;charset=utf-8'); },
  'csv-all'() { download(`monzon-resultados-todos.csv`, toCsv(csvRows(S.data.races)), 'text/csv;charset=utf-8'); },
};

const forms = {
  async code(f) {
    const code = extractCode(f.code.value);
    if (!code) return toast('No reconozco ese enlace. Cópialo entero desde WhatsApp.', true);
    S.code = code; store.set(CODE_KEY, code); S.runnerData = null;
    await loadRunner(); render();
  },
  async login(f) {
    const ok = await run(async () => { await api.signIn(f.email.value.trim(), f.password.value); S.session = await api.session(); return true; });
    if (!ok) return;
    if (!S.session?.isAdmin) { toast('Esta cuenta no es de la dirección.', true); render(); return; }
    S.data = null; go('#/inscripciones');
  },
  async bulk(f) {
    const { toAdd, duplicates, unknownCategory } = parseBulkRunners(f.bulk.value, S.data.runners.map((r) => r.name));
    if (!toAdd.length) return toast(duplicates.length ? 'Todos ya estaban en la plantilla.' : 'Escribe al menos un nombre.', true);
    const ok = await run(async () => { await api.addRunners(toAdd); await reload(); return true; });
    if (!ok) return;
    const notes = [`${toAdd.length} añadido${toAdd.length === 1 ? '' : 's'}`];
    if (duplicates.length) notes.push(`${duplicates.length} repetido${duplicates.length === 1 ? '' : 's'} ignorado${duplicates.length === 1 ? '' : 's'}`);
    if (unknownCategory.length) notes.push(`categoría no reconocida en: ${unknownCategory.map((u) => u.name).join(', ')} (quedan sin categoría)`);
    toast(notes.join(' · '), unknownCategory.length > 0);
    render();
  },
  async renew(f) {
    const plan = planRosterRenewal(f.renew.value, S.data.runners);
    const total = plan.keep.length + plan.add.length;
    if (!total) return toast('Pega la lista de corredores de la temporada.', true);
    const names = (xs) => esc(xs.join(', '));
    const catChanges = plan.keep.filter((k) => k.category);
    const msg = `La plantilla quedará con <b>${total}</b> corredores.<br><br>` +
      `<b>Siguen (${plan.keep.length})</b>, con el mismo enlace${catChanges.length ? `; cambian de categoría: ${names(catChanges.map((k) => `${k.runner.name} → ${k.category}`))}` : ''}.<br><br>` +
      `<b>Altas (${plan.add.length})</b>${plan.add.length ? ': ' + names(plan.add.map((a) => a.name)) + '. Tendrás que enviarles su enlace.' : '.'}<br><br>` +
      `<b>Bajas (${plan.remove.length})</b>${plan.remove.length ? ': ' + names(plan.remove.map((r) => r.name)) + '. Su enlace deja de funcionar; sus resultados se conservan.' : '.'}` +
      (plan.unknownCategory.length ? `<br><br>⚠️ Categoría no reconocida (se deja como estaba): ${names(plan.unknownCategory.map((u) => `${u.name} («${u.text}»)`))}` : '') +
      (plan.remove.length > total / 2 ? '<br><br>⚠️ Se da de baja a más de la mitad. Comprueba que has pegado la lista completa.' : '');
    if (!await confirmAction('Renovar plantilla', msg, 'Aplicar cambios', 'primary')) return;
    const ok = await run(async () => {
      if (plan.add.length) await api.addRunners(plan.add);
      for (const k of catChanges) await api.updateRunner(k.runner.id, { category: k.category });
      for (const r of plan.remove) await api.deleteRunner(r.id, false);
      await reload(); return true;
    }, 'Plantilla renovada');
    if (ok) { f.reset(); render(); }
  },
  async 'save-reg'() {
    const id = await run(saveRegistrationDraft, 'Inscripción guardada');
    if (id) go('#/inscripciones');
  },
  async 'save-race'() {
    const d = S.draft;
    const id = await run(async () => {
      const race = draftPayload();
      const results = d.people.map((p) => {
        const position = p.position === '' || p.position == null ? null : Number(p.position);
        if (position !== null && (!Number.isInteger(position) || position < 1)) throw new Error(`Puesto no válido para ${p.runner_name}.`);
        return { runner_id: p.runner_id, runner_name: p.runner_name, category: p.category || null, position,
          podium_type: isPodium(position) ? p.podium_type || 'suelta' : 'suelta' };
      });
      const r = await api.saveRace(race, results); await reload(); return r;
    }, 'Carrera guardada');
    if (id) go('#/carreras');
  },
};

const fileHandlers = {
  async restore(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { return toast('El archivo no es una copia válida.', true); }
    if (!Array.isArray(data?.runners) || !Array.isArray(data?.races)) return toast('El archivo no es una copia de esta app.', true);
    const msg = `La copia tiene ${data.runners.length} corredores, ${data.races.length} carreras y ${(data.registrations || []).length} inscripciones. <b>Se borrará todo lo actual.</b> Antes descarga una copia por si acaso.`;
    if (!await confirmAction('Restaurar copia', msg, 'Restaurar')) return;
    await run(async () => { await api.importAll(data); await reload(); }, 'Copia restaurada'); render();
  },
  async csv(file) {
    const { races, errors } = importResultsCsv(await file.text());
    if (!races.length) return toast(errors[0] || 'No hay carreras en el archivo.', true);
    const exists = new Set(S.data.races.map((r) => r.date + '|' + normalize(r.name)));
    const fresh = races.filter((r) => !exists.has(r.date + '|' + normalize(r.name)));
    const known = new Map(S.data.runners.map((r) => [normalize(r.name), r]));
    const newNames = [...new Map(fresh.flatMap((r) => r.results).filter((x) => !known.has(normalize(x.runner_name)))
      .map((x) => [normalize(x.runner_name), x])).values()];
    const msg = `<b>${fresh.length}</b> carreras nuevas con ${fresh.reduce((n, r) => n + r.results.length, 0)} participaciones` +
      (races.length - fresh.length ? ` (${races.length - fresh.length} ya existían y se saltan)` : '') + '.' +
      (newNames.length ? `<br>${newNames.length} corredores no están en la plantilla: ${esc(newNames.map((x) => x.runner_name).join(', '))}.` : '') +
      (errors.length ? `<br><br><b>Avisos:</b><br>${errors.slice(0, 8).map(esc).join('<br>')}${errors.length > 8 ? `<br>… y ${errors.length - 8} más` : ''}` : '');
    if (!fresh.length) return choose('Importar CSV', msg, []);
    const opts = newNames.length
      ? [{ label: 'Importar y dar de alta a los que faltan', value: 'add', kind: 'primary' }, { label: 'Importar sin darlos de alta (quedan como «baja»)', value: 'noadd' }]
      : [{ label: 'Importar', value: 'noadd', kind: 'primary' }];
    const how = await choose('Importar CSV', msg, opts);
    if (!how) return;
    await run(async () => {
      if (how === 'add' && newNames.length) {
        await api.addRunners(newNames.map((x) => ({ name: cleanName(x.runner_name), category: x.category })));
        await reload();
      }
      const ids = new Map(S.data.runners.map((r) => [normalize(r.name), r.id]));
      for (const r of fresh) {
        const { results, ...race } = r;
        await api.saveRace(race, results.map((x) => ({ ...x, runner_id: ids.get(normalize(x.runner_name)) || null })));
      }
      await reload();
    }, `${fresh.length} carreras importadas`);
    render();
  },
};

// ---------- eventos (delegados) ----------

$app.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || !actions[el.dataset.act]) return;
  ev.preventDefault();
  actions[el.dataset.act](el);
});

$app.addEventListener('submit', (ev) => {
  const f = ev.target.closest('[data-form]');
  if (!f || !forms[f.dataset.form]) return;
  ev.preventDefault();
  forms[f.dataset.form](f);
});

$app.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!S.draft) return;
  if (t.dataset.f) S.draft[t.dataset.f] = t.value;
  if (t.dataset.pf) {
    const p = S.draft.people[Number(t.dataset.p)];
    p[t.dataset.pf] = t.value;
    if (t.dataset.pf === 'position') {
      const sel = t.closest('li').querySelector('[data-pf="podium_type"]');
      if (sel) sel.disabled = !isPodium(Number(t.value));
    }
  }
});

$app.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t.dataset.actChange === 'add-person' && t.value) {
    const r = runnerById(t.value);
    S.draft.people.push({ runner_id: r.id, runner_name: r.name, category: r.category || '', position: '', podium_type: 'suelta' });
    render();
    $app.querySelector('.edit-list li:last-child')?.scrollIntoView({ block: 'center' });
  } else if (t.dataset.fed) {
    fedFilter[t.dataset.fed] = t.type === 'checkbox' ? t.checked : t.value; render();
  } else if (t.dataset.runnerCat) {
    const id = t.dataset.runnerCat;
    await run(async () => { await api.updateRunner(id, { category: t.value || null }); runnerById(id).category = t.value || null; }, 'Categoría guardada');
  } else if (t.dataset.file && t.files?.[0]) {
    const file = t.files[0]; t.value = '';
    await fileHandlers[t.dataset.file](file);
  }
});

window.addEventListener('hashchange', onRoute);
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; if (S.runnerData) render(); });

// ---------- arranque ----------

(async function start() {
  document.getElementById('dl').innerHTML =
    `<datalist id="dl-prov">${PROVINCES.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
     <datalist id="dl-country">${['España', 'Andorra', 'Francia', 'Portugal', 'Italia'].map((p) => `<option value="${p}">`).join('')}</datalist>`;
  try { S.session = await api.session(); } catch (e) { console.error(e); S.session = null; }
  await onRoute();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
