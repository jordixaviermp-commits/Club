// Pantallas de la app. Sin dependencias ni paso de compilación: se sirve tal cual.
import { CONFIG } from './config.js';
import { supabaseApi, demoApi, friendlyError } from './api.js';
import {
  CATEGORIES, MODALITIES, PODIUM_TYPES, RACE_TYPES, CIRCUIT_SCOPES, PROVINCES, DEFAULT_COUNTRY, podiumLabel, normalize, cleanName, stageName, podiumsOf,
  parseBulkRunners, planRosterRenewal, isPodium, yearOf, availableYears, yearSummary, csvRows, toCsv, importResultsCsv,
  extractCode, todayISO, pastLimit, formatDate, searchRaces, CONTRACTS, contractLabel, bonusConfigFor, bonusStatus, tiersFor, yearBonuses, MONTH_NAMES, monthGrid, addMonths, formatRange, daysOf, numDays,
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

const NEWS_KEY = 'monzon-news-seen';
const POSTED_KEY = 'monzon-posted'; // carreras ya publicadas en redes (en este móvil)
const S = {
  session: null, code: store.get(CODE_KEY), news: null, newsFresh: new Set(),
  data: null, runnerData: null,
  year: new Date().getFullYear(), draft: null, busy: false, showPast: false, installEvt: null,
  regView: store.get(VIEW_KEY) === 'cal' ? 'cal' : 'list', calMonth: null, calDay: null,
  q: { runner: '', admin: '' }, rdraft: null,
};

const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const opt = (value, label, sel) => `<option value="${esc(value)}"${value === sel ? ' selected' : ''}>${esc(label)}</option>`;
/** Clase de color de una modalidad: «m-carretera», «m-btt»… (colores en css/app.css). */
const modClass = (m) => 'm-' + normalize(m || 'Otra').replace(/[^a-z]/g, '');
const modTag = (m) => `<span class="tag ${modClass(m)}">${esc(m)}</span>`;
const modLegend = (mods) => `<div class="mod-legend">${MODALITIES.filter((m) => !mods || mods.includes(m))
  .map((m) => `<span class="${modClass(m)}"><i></i>${esc(m)}</span>`).join('')}</div>`;
/** Texto de una noticia: escapado, con enlaces pulsables y saltos de línea. */
const newsText = (t) => esc(t).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`).replace(/\n/g, '<br>');
const newsSeen = () => { try { return new Set(JSON.parse(store.get(NEWS_KEY) || '[]')); } catch { return new Set(); } };
/** Noticias que este móvil aún no ha abierto (en la vista previa de la dirección no cuenta ninguna). */
const unreadNews = () => (S.preview || !S.news ? [] : S.news.filter((n) => !newsSeen().has(n.id)));
const markNewsSeen = () => { if (S.preview || !S.news) return; store.set(NEWS_KEY, JSON.stringify([...new Set([...newsSeen(), ...S.news.map((n) => n.id)])].slice(-200))); };
/** Carga las noticias del corredor (null si aún falta el SQL: entonces no hay campanita). */
async function loadNews() {
  try { S.news = await api.runnerNews(S.code || S.previewCode); } catch { S.news = null; }
}
/** Campanita de los corredores: noticias nuevas de la dirección. */
function newsBell() {
  if (!S.news) return '';
  const n = unreadNews().length;
  return `<a class="icon-btn bell news-bell${n ? ' on' : ''}" href="${runnerHref('noticias')}" aria-label="Noticias del club${n ? `: ${n} nueva${n === 1 ? '' : 's'}` : ''}" title="Noticias del club">${icon(ICON_BELL)}${n ? `<span class="bell-n">${n}</span>` : ''}</a>`;
}
/** Etiqueta del tipo de carrera (campeonato o circuito). */
const typeTag = (x) => (x.race_type === 'campeonato' ? '<p class="type-line"><span class="tag t-champ">🏆 Campeonato</span></p>'
  : x.race_type === 'circuito' ? `<p class="type-line"><span class="tag t-circ">🔗 ${esc(x.circuit || 'Circuito')}</span></p>` : '');
/** Nombres de circuitos ya usados (para sugerirlos y no escribirlos de dos maneras). */
function circuitNames() {
  const src = S.data && !S.preview ? [...S.data.races, ...S.data.registrations, ...(S.data.circuitPodiums || [])]
    : [...(S.runnerData?.registrations || []), ...(S.runnerData?.my_results || []), ...(S.runnerData?.circuits || []), ...(Array.isArray(S.team?.races) ? S.team.races : [])];
  const seen = new Map();
  for (const x of src) { const c = String(x.circuit || '').trim(); if (c && !seen.has(normalize(c))) seen.set(normalize(c), c); }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'es'));
}
const circuitList = () => `<datalist id="dl-circuit">${circuitNames().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`;
/** Campos «Tipo de carrera» de los formularios. `attr` = data-f (dirección) o data-rf (corredor). */
const typeFields = (d, attr) => `
    <label>Tipo de carrera<select ${attr}="race_type" data-retype>${RACE_TYPES.map((t) => opt(t.id, t.label, d.race_type || 'suelta')).join('')}</select></label>
    ${d.race_type === 'circuito' ? `<label>Nombre del circuito<input ${attr}="circuit" list="dl-circuit" value="${esc(d.circuit || '')}" placeholder="Copa Aragón XCM" maxlength="120" required autocomplete="off"></label>${circuitList()}
      <p class="hint">Escríbelo igual en todas sus pruebas. El podio en la <b>general final</b> del circuito suma carreras extra para el bono.</p>` : ''}
    ${d.race_type === 'campeonato' ? '<p class="hint">Los podios de esta carrera se guardarán como podios de campeonato.</p>' : ''}`;
const scopeLabel = (id) => (CIRCUIT_SCOPES.find((x) => x.id === id) || CIRCUIT_SCOPES[0]).label.toLowerCase();
const contractSelect = (attrs, sel) =>
  `<select ${attrs}>${opt('', 'Contrato: sin indicar', sel || '')}${CONTRACTS.map((c) => opt(c.id, c.label, sel)).join('')}</select>`;
const catSelect = (attrs, sel, emptyLabel = 'Sin categoría') =>
  `<select ${attrs}>${opt('', emptyLabel, sel || '')}${CATEGORIES.map((c) => opt(c, c, sel)).join('')}</select>`;
const byName = (a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
const runnerById = (id) => S.data?.runners.find((r) => r.id === id);
const linkFor = (code) => `${location.origin}${location.pathname}#/c/${code}`;
/** Fecha de una carrera: un día, o «sáb 12 – lun 14 jun 2027 · 3 días» si es por etapas. */
const when = (x) => x.end_date && x.end_date > x.date ? `${formatRange(x.date, x.end_date)} · ${numDays(x.date, x.end_date)} días` : formatDate(x.date);
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

async function reload() {
  S.data = await api.loadAll();
  try { S.docs = await api.listDocuments(); } catch { S.docs = null; } // null = falta el SQL de contratos
}

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
  if (S.session?.isAdmin && !['vista', 'equipo'].includes(view) && S.preview) { S.preview = null; S.runnerData = null; } // salir de la vista previa
  { // pantallas del corredor (o de la vista previa): cargar lo que necesitan
    const sub = S.session?.isAdmin ? (view === 'vista' ? (id || '') : null) : (S.code ? view : null);
    if (sub !== null) {
      if (sub === 'equipo' || (sub === '' && S.regView === 'cal' && !S.team)) loadTeam();
      if (sub === 'federaciones' && !S.fed) loadFed();
      if (sub === 'contrato') loadMyDocs();
      if (sub === 'noticias') enterNews();
      if (sub === 'nueva' && !S.team) loadTeam();
    }
  }
  if (S.session?.isAdmin) {
    if (view === 'inscripciones' && id) S.draft = draftRegistration(id);
    if (view === 'carreras' && id) S.draft = draftRace(id);
    if (view === 'federaciones' && !S.fed) loadFed();
  }
  render();
  window.scrollTo(0, 0);
}

async function loadRunner() {
  try { S.runnerData = await api.runnerView(S.code); await loadNews(); }
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
// Menú de pie de página de los corredores (y de la vista previa de la dirección).
const RUNNER_TABS = [
  ['', 'Carreras', 'M8 2v3M16 2v3M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z'],
  ['mi', 'Mi temporada', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1'],
  ['contrato', 'Contrato', 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6'],
  ['equipo', 'Equipo', 'M4 20V10M10 20V4M16 20v-7M22 20H2'],
  ['federaciones', 'Federaciones', 'M5 21V4M5 4h11l-2 4 2 4H5'],
];
const runnerBase = () => (S.session?.isAdmin && S.preview ? '#/vista' : '#');
const runnerHref = (sub) => (sub ? `${runnerBase()}/${sub}` : `${runnerBase()}/`);

/** Campanita de la dirección: número de cosas pendientes. */
function bellButton() {
  const n = alertCount();
  return `<a class="icon-btn bell${n ? ' on' : ''}" href="#/avisos" aria-label="Avisos${n ? `: ${n} pendientes` : ''}" title="Avisos">${icon(ICON_BELL)}${n ? `<span class="bell-n">${n}</span>` : ''}</a>`;
}

function frame(title, body, { back, actions = '', rtab = null } = {}) {
  const { view } = parseRoute();
  const admin = S.session?.isAdmin;
  const tabs = rtab !== null
    ? `<nav class="tabs">${RUNNER_TABS.map(([v, label, d]) =>
      `<a href="${runnerHref(v)}" class="${v === rtab ? 'on' : ''}">${icon(d)}<span>${label}</span></a>`).join('')}</nav>`
    : admin ? `<nav class="tabs">${ADMIN_TABS.map(([v, label, d]) =>
      `<a href="#/${v}" class="${view === v || (!view && v === 'inscripciones') ? 'on' : ''}">${icon(d)}<span>${label}</span></a>`).join('')}</nav>` : '';
  return `
    ${api.mode === 'demo' ? `<div class="demo-bar">Modo demostración: datos de prueba guardados solo en este móvil.</div>` : ''}
    <header class="top">
      ${back ? `<a class="back" href="${back}" aria-label="Volver">‹</a>` : '<img class="logo" src="icons/logo.png" alt="">'}
      <h1>${esc(title)}</h1>${actions}${admin && rtab === null && !back && S.data ? bellButton() : ''}${rtab !== null ? newsBell() : ''}
    </header>
    <main>${body}</main>
    ${tabs}`;
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
      resumen: viewSummary, corredores: viewRunners, datos: viewData, federaciones: viewFed, bonos: viewBonus, avisos: viewAlerts, noticias: viewAdminNews, semana: viewWeek, docs: () => viewDocs(parseRoute().id),
      vista: () => (S.preview && S.runnerData ? runnerScreen(parseRoute().id || '') : viewRunners()),
      equipo: () => (S.preview ? viewTeam() : viewSummary()),
    }[view] || viewRegistrations)();
  } else if (S.code && S.runnerData) html = runnerScreen(view);
  else html = viewWelcome();
  $app.innerHTML = html;
  document.body.classList.toggle('has-tabs', !!$app.querySelector('nav.tabs'));
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
const ICON_BELL = 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0';
const ICON_LIST = 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01';
const viewToggle = () => S.regView === 'cal'
  ? `<button class="icon-btn" data-act="reg-view" aria-label="Ver como lista" title="Ver como lista">${icon(ICON_LIST)}</button>`
  : `<button class="icon-btn" data-act="reg-view" aria-label="Ver calendario" title="Ver calendario">${icon(ICON_CAL)}</button>`;

/**
 * Mes con las carreras marcadas y, debajo, las tarjetas de ese mes (o del día pulsado).
 * `isMine(g)` marca los días en que el corredor ya está apuntado.
 */
function calendarView(regs, card, isMine = () => false, { done = [], doneCard = null, isPosted = null } = {}) {
  const today = todayISO();
  // Elementos del calendario: inscripciones (próximas o ya disputadas sin resultado) y carreras con resultados.
  const items = [
    ...regs.map((g) => ({ g, past: g.date < today, done: false, people: (g.entries || []).length })),
    ...done.map((r) => ({ g: r, past: true, done: true, people: (r.results || []).length })),
  ];
  if (!S.calMonth) S.calMonth = (regs.filter((g) => g.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] || { date: today }).date.slice(0, 7);
  const ym = S.calMonth;
  const byDay = new Map();
  for (const it of items) for (const d of daysOf(it.g.date, it.g.end_date)) (byDay.get(d) || byDay.set(d, []).get(d)).push(it);
  const [y, m] = ym.split('-').map(Number);
  const touches = (g, mm) => g.date.slice(0, 7) <= mm && (g.end_date || g.date).slice(0, 7) >= mm;
  if (S.calDay && !S.calDay.startsWith(ym)) S.calDay = null;
  const shown = S.calDay ? (byDay.get(S.calDay) || []) : items.filter((it) => touches(it.g, ym));
  const shownUp = shown.filter((it) => !it.past).sort((a, b) => a.g.date.localeCompare(b.g.date));
  const shownPast = shown.filter((it) => it.past).sort((a, b) => b.g.date.localeCompare(a.g.date));
  const months = [...new Set(items.flatMap((it) => daysOf(it.g.date, it.g.end_date).map((d) => d.slice(0, 7))))].sort();
  const cell = (d) => {
    if (!d) return '<span class="cal-cell empty"></span>';
    const list = byDay.get(d) || [];
    const up = list.filter((it) => !it.past);
    const people = list.reduce((n, it) => n + it.people, 0);
    const mods = new Set(list.map((it) => it.g.modality));
    const pst = isPosted && list.length ? (list.every((it) => isPosted(it.g)) ? 'posted' : list.some((it) => isPosted(it.g)) ? 'part-posted' : '') : '';
    const cls = ['cal-cell', pst, list.length ? 'has' : '', list.length && !up.length ? 'past-only' : '', d === today ? 'today' : '',
      d === S.calDay ? 'sel' : '', d < today ? 'past' : '', list.some((it) => isMine(it.g)) ? 'mine' : '',
      list.some((it) => it.g.end_date) ? 'stage' : '', list.length ? (mods.size === 1 ? modClass(list[0].g.modality) : 'multi-mod') : '']
      .filter(Boolean).join(' ');
    const label = `${Number(d.slice(8))} de ${MONTH_NAMES[m - 1]}${list.length ? `: ${list.map((it) => `${it.g.name} (${it.g.modality}${it.past ? ', ya disputada' : ''}, ${it.people} del club)`).join(', ')}` : ''}`;
    return list.length
      ? `<button class="${cls}" data-act="cal-day" data-d="${d}" aria-label="${esc(label)}"><b>${Number(d.slice(8))}</b>
          ${people ? `<i class="cnt">${people}</i>` : ''}
          <span class="dots">${list.slice(0, 4).map((it) => `<i class="${modClass(it.g.modality)}"></i>`).join('')}</span></button>`
      : `<span class="${cls}" aria-label="${esc(label)}"><b>${Number(d.slice(8))}</b></span>`;
  };
  const cardOf = (it) => (it.done ? (doneCard ? doneCard(it.g) : '') : card(it.g));
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
      ${modLegend([...new Set(items.map((it) => it.g.modality))])}
      <div class="state-legend"><span><i class="sl-up"></i>Próxima (inscripción)</span><span><i class="sl-past"></i>Ya disputada</span><span><b class="sl-cnt">3</b> del club</span>${isPosted ? '<span><b class="sl-ok">✓</b> publicada</span><span><b class="sl-half">½</b> alguna sin publicar</span>' : ''}</div>
      ${months.length ? `<div class="cal-months">${months.map((mm) => {
        const [yy, mo] = mm.split('-').map(Number);
        const n = items.filter((it) => touches(it.g, mm)).length;
        return `<button class="chip${mm === ym ? ' on' : ''}${mm < today.slice(0, 7) ? ' old' : ''}" data-act="cal-goto" data-m="${mm}">${MONTH_NAMES[mo - 1].slice(0, 3)} ${String(yy).slice(2)} · ${n}</button>`;
      }).join('')}</div>` : ''}
    </section>
    ${S.calDay ? `<h2 class="section">${formatDate(S.calDay)} <button class="link small" data-act="cal-day" data-d="${S.calDay}">Ver todo el mes</button></h2>` : ''}
    ${shownUp.length ? `<h2 class="section">📅 Próximas (${shownUp.length})</h2>${shownUp.map(cardOf).join('')}` : ''}
    ${shownPast.length ? `<h2 class="section past-head">🏁 Ya disputadas (${shownPast.length})</h2>${shownPast.map(cardOf).join('')}` : ''}
    ${!shown.length ? `<p class="empty">No hay carreras ${S.calDay ? 'este día' : 'este mes'}.</p>` : ''}`;
}

// ======================================================================
//  Buscador «lupa»: encontrar una carrera antes de crearla (para no duplicar)
// ======================================================================

const searchBox = (scope, placeholder) => `<label class="search">
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
  <input type="search" data-search="${scope}" value="${esc(S.q[scope] || '')}" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="search"></label>`;

/** Carreras de las federaciones que aún no están en el club, parecidas a lo buscado. */
function fedMatches(q, existing, limit = 5) {
  if (!S.fed?.races) return [];
  const today = todayISO();
  const have = new Set(existing.map((g) => g.date + '|' + normalize(g.name)));
  return searchRaces(q, S.fed.races.filter((r) => r.date >= today && !have.has(r.date + '|' + normalize(r.name)))).slice(0, limit);
}

const miniRow = (g, right) => `<li class="mini ${modClass(g.modality)}"><div><b>${esc(g.name)}</b>
  <small class="muted">${when(g)}${place(g) ? ' · ' + esc(place(g)) : ''} · ${esc(g.modality)}</small></div>${right}</li>`;

/** Resultados del buscador del corredor: carreras del club (apuntarse) y de las federaciones (añadir). */
function runnerSearchResults(q) {
  const d = S.runnerData;
  if (!d || normalize(q).length < 2) return '';
  const today = d.today || todayISO();
  const mine = (g) => g.entries.some((e) => e.runner_id === d.me.id);
  const club = searchRaces(q, d.registrations.filter((g) => g.date >= today)).slice(0, 6);
  const fed = fedMatches(q, d.registrations);
  return `
    ${club.length ? `<p class="hint"><b>Ya están en el club</b> (apúntate aquí, no hace falta crearla):</p>
      <ul class="mini-list">${club.map((g) => miniRow(g, mine(g) ? '<span class="done">✓ Apuntado</span>'
        : `<button class="btn primary small" data-act="r-join" data-id="${g.id}">Apuntarme</button>`)).join('')}</ul>` : ''}
    ${fed.length ? `<p class="hint"><b>En los calendarios de las federaciones</b>:</p>
      <ul class="mini-list">${fed.map((r) => miniRow(r, `<button class="btn small" data-act="r-new-fed" data-i="${S.fed.races.indexOf(r)}">Añadir y apuntarme</button>`)).join('')}</ul>` : ''}
    ${!club.length && !fed.length ? `<p class="hint">No hay ninguna carrera parecida a «${esc(q)}». Puedes añadirla:</p>` : ''}`;
}

function updateSearch(scope) {
  if (scope === 'runner') {
    const box = $app.querySelector('#search-results');
    if (box) box.innerHTML = runnerSearchResults(S.q.runner);
  } else if (scope === 'admin') {
    const box = $app.querySelector('#reg-list');
    if (box) box.innerHTML = adminRegList();
  } else if (scope === 'rname') {
    const box = $app.querySelector('#dup-list');
    if (box) box.innerHTML = dupSuggestions(S.rdraft?.name || '', S.runnerData.registrations, true);
  }
}

/** Avisos de posibles duplicados mientras se escribe el nombre de una carrera nueva. */
function dupSuggestions(name, regs, forRunner) {
  if (normalize(name).length < 3) return '';
  const today = todayISO();
  // el corredor también ve las ya pasadas (para apuntar una carrera que se olvidó)
  const club = searchRaces(name, regs.filter((g) => g.date >= (forRunner ? pastLimit() : today))).slice(0, 4);
  const me = S.runnerData?.me;
  const done = forRunner && Array.isArray(S.team?.races)
    ? searchRaces(name, S.team.races.filter((r) => r.date >= pastLimit() && r.date <= today)).slice(0, 3) : [];
  const fed = fedMatches(name, regs, 4);
  if (!club.length && !fed.length && !done.length) return '';
  return `<div class="dup">
    ${club.length || done.length ? `<p><b>⚠️ ¿Es alguna de estas? Ya están creadas:</b></p><ul class="mini-list">${club.map((g) => miniRow(g,
      forRunner ? (g.entries.some((e) => e.runner_id === me?.id) ? '<span class="done">✓ Apuntado</span>'
        : `<button type="button" class="btn primary small" data-act="r-join-go" data-id="${g.id}">${g.date < today ? 'La hice: apuntarme' : 'Apuntarme a esta'}</button>`)
        : `<a class="btn small" href="#/inscripciones/${g.id}">Abrir</a>`)).join('')}${done.map((r) => miniRow(r,
      (r.results || []).some((x) => x.runner_id === me?.id) ? '<span class="done">✓ Ya sales</span>'
        : `<button type="button" class="btn primary small" data-act="r-join-race" data-id="${r.id}">La hice: añadirme</button>`)).join('')}</ul>` : ''}
    ${fed.length ? `<p><b>En el calendario de las federaciones</b> (rellena los datos con un toque):</p><ul class="mini-list">${fed.map((r) => miniRow(r,
      `<button type="button" class="btn small" data-act="fill-fed" data-i="${S.fed.races.indexOf(r)}">Usar estos datos</button>`)).join('')}</ul>` : ''}
  </div>`;
}

/** Inscripción ya disputada (para llevar al corredor a poner su resultado al apuntarse). */
const isPastReg = (id) => { const g = S.runnerData?.registrations.find((x) => x.id === id); return !!g && g.date < (S.runnerData.today || todayISO()); };
/** Pantalla para poner el resultado: de una inscripción (reg_) o de una carrera ya en resultados (race_). */
const resultHref = (id) => (S.runnerData?.registrations.some((g) => g.id === id) ? `#/resultado/reg_${id}` : `#/resultado/race_${id}`);
const emptyRunnerDraft = (pre = {}) => ({ name: '', date: '', multi: false, end_date: '', place: '', province: '', country: DEFAULT_COUNTRY,
  modality: 'Carretera', race_type: 'suelta', circuit: '', category: S.runnerData?.me?.category || '', ...pre });

/** Formulario para que el corredor ponga SU resultado (una sola vez). id = «reg_<uuid>» o «race_<uuid>». */
function viewRunnerReport(key) {
  const d = S.runnerData;
  const [kind, id] = [key.slice(0, key.indexOf('_')), key.slice(key.indexOf('_') + 1)];
  const race = kind === 'reg' ? d.registrations.find((g) => g.id === id) : (d.my_results || []).find((r) => r.race_id === id);
  const back = runnerHref('mi');
  if (!race) return frame('Mi resultado', '<p class="empty">No se encuentra esta carrera.</p>', { back });
  const already = kind === 'reg' ? race.my_result : race.position;
  if (already) return frame('Mi resultado', `<p class="card">Ya pusiste tu resultado en <b>${esc(race.name)}</b>. Si hay que corregirlo, pídeselo a la dirección.</p>`, { back });
  const cat = kind === 'reg' ? race.entries.find((e) => e.runner_id === d.me.id)?.category : race.category;
  return frame('Mi resultado', `
    <form class="card stack" data-form="r-report" data-kind="${kind}" data-id="${id}">
      <div><h3>${esc(race.name)}</h3><p class="muted">${when(race)}${place(race) ? ' · ' + esc(place(race)) : ''} · ${esc(race.modality)}</p></div>
      <div class="grid2">
        <label>Tu puesto<input type="number" name="position" inputmode="numeric" min="1" max="999" required autofocus></label>
        <label>Categoría${catSelect('name="category"', cat || d.me.category || '', 'Categoría')}</label>
      </div>
      <label>Si es podio (1º, 2º o 3º), ¿de qué tipo?
        <select name="podium">${PODIUM_TYPES.map((t) => opt(t.id, t.label, race.race_type === 'campeonato' ? 'campeonato' : 'suelta')).join('')}</select></label>
      <p class="pen bad-box">⚠️ Revísalo bien: <b>una vez enviado no podrás cambiarlo</b>. Si te equivocas, tendrá que corregirlo la dirección.</p>
      <button class="btn primary">Enviar mi resultado</button>
    </form>`, { back });
}

function viewRunnerNew() {
  if (!S.rdraft) S.rdraft = emptyRunnerDraft({ name: S.q.runner || '' });
  const d = S.rdraft;
  const editing = !!d.id;
  const reg = editing ? S.runnerData.registrations.find((x) => x.id === d.id) : null;
  const others = reg ? reg.entries.filter((e) => e.runner_id !== S.runnerData.me.id).length : 0;
  if (!S.fed && !editing) loadFed().then(() => updateSearch('rname'));
  return frame(editing ? 'Editar mi carrera' : 'Añadir carrera', `
    <form class="card stack" data-form="r-create">
      <p class="hint">${editing ? 'Puedes corregir los datos de esta carrera porque la añadiste tú. Los resultados y podios los pone la dirección.'
        : 'Escribe el nombre: si ya existe en el club o en el calendario de las federaciones te saldrá aquí debajo, para no duplicarla.<br>¿Se te olvidó apuntar una carrera que ya hiciste? Añádela igual con su fecha (desde el 1 de enero del año pasado) y luego pon tu resultado.'}</p>
      <label>Nombre de la carrera<input data-rf="name" value="${esc(d.name)}" required minlength="3" maxlength="120" autocomplete="off"></label>
      <div id="dup-list">${editing ? '' : dupSuggestions(d.name, S.runnerData.registrations, true)}</div>
      <div class="grid2">
        <label>${d.multi ? 'Primer día' : 'Fecha'}<input type="date" data-rf="date" value="${esc(d.date)}" min="${pastLimit()}" required></label>
        <label>Modalidad<select data-rf="modality">${MODALITIES.map((m) => opt(m, m, d.modality)).join('')}</select></label>
      </div>
      ${S.runnerData.circuits ? typeFields(d, 'data-rf') : ''}
      <label class="check"><input type="checkbox" data-rf-multi ${d.multi ? 'checked' : ''}> Carrera de varios días (por etapas)</label>
      ${d.multi ? `<label>Último día<input type="date" data-rf="end_date" value="${esc(d.end_date)}" min="${esc(d.date || pastLimit())}" required></label>` : ''}
      <label>Lugar<input data-rf="place" value="${esc(d.place)}" maxlength="120"></label>
      <div class="grid2">
        <label>Provincia<input data-rf="province" list="dl-prov" value="${esc(d.province)}" autocomplete="off"></label>
        ${editing ? '<span></span>' : `<label>Tu categoría${catSelect('data-rf="category"', d.category, 'Categoría')}</label>`}
      </div>
      ${editing ? `<label>Notas<textarea data-rf="notes" rows="2" maxlength="500">${esc(d.notes || '')}</textarea></label>` : ''}
      <button class="btn primary">${editing ? 'Guardar cambios' : 'Añadir y apuntarme'}</button>
      <p class="hint">La dirección del club podrá corregirla o borrarla si hace falta.</p>
    </form>
    ${editing ? (others
      ? `<p class="card hint">🗑️ No puedes borrarla: hay ${others} compañero${others === 1 ? '' : 's'} más apuntado${others === 1 ? '' : 's'}. Si hay que quitarla, pídeselo a la dirección del club.</p>`
      : '<button class="btn danger ghost block" data-act="r-delete-mine">🗑️ Borrar esta carrera</button>') : ''}`, { back: runnerHref('') });
}

/** «Mis carreras»: sus carreras con resultados por temporada y las apuntadas pendientes de resultado. */
function myRacesCard(d) {
  const results = d.my_results;
  if (!results) return ''; // base de datos aún sin actualizar
  const today = d.today || todayISO();
  const mineReg = d.registrations.filter((g) => g.entries.some((e) => e.runner_id === d.me.id));
  const pending = mineReg.filter((g) => g.date < today && !g.suspended);
  const upcoming = mineReg.filter((g) => g.date >= today || g.suspended).sort((a, b) => a.date.localeCompare(b.date));
  const years = [...new Set([new Date().getFullYear(), ...results.map((r) => yearOf(r.date))])].sort((a, b) => b - a);
  if (!years.includes(S.myYear)) S.myYear = years[0];
  const list = results.filter((r) => yearOf(r.date) === S.myYear);
  const days = list.reduce((n, r) => n + numDays(r.date, r.end_date), 0);
  const row = (r) => {
    const stagePods = (r.stage_positions || []).slice(0, (r.stages || []).length).map((p, i) => ({ p, n: stageName(r, i) })).filter((x) => isPodium(x.p));
    const pos = r.position ? `${isPodium(r.position) ? medal(r.position) + ' ' : ''}${r.position}º${r.category ? ` ${esc(r.category)}` : ''}${r.self_reported ? '<br><small class="self-res">📝 puesto por ti</small>' : ''}`
      : (S.preview ? '<span class="muted">sin puesto</span>' : `<a class="btn primary small" href="#/resultado/race_${r.race_id}">Poner mi puesto</a>`);
    return `<li class="mini ${modClass(r.modality)}"><div><b>${esc(r.name)}</b>
      <small class="muted">${when(r)}${place(r) ? ' · ' + esc(place(r)) : ''} · ${esc(r.modality)}</small>
      ${stagePods.length ? `<small>${stagePods.map((x) => `${medal(x.p)} ${esc(x.n)}`).join(' · ')}</small>` : ''}</div>
      <span class="pos">${pos}</span></li>`;
  };
  const myCat = (g) => g.entries.find((e) => e.runner_id === d.me.id)?.category;
  const dleft = (g) => { const n = Math.round((new Date(g.date + 'T12:00:00Z') - new Date(today + 'T12:00:00Z')) / 864e5);
    return n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`; };
  return `
  <div class="season-chips">
    <span class="sc done">✅ ${list.length} hecha${list.length === 1 ? '' : 's'}</span>
    <span class="sc pend">🏁 ${pending.length} pendiente${pending.length === 1 ? '' : 's'}</span>
    <span class="sc next">📅 ${upcoming.length} próxima${upcoming.length === 1 ? '' : 's'}</span>
  </div>

  <section class="card season-block next-block">
    <h2>📅 Mis próximas inscripciones <small>(${upcoming.length})</small></h2>
    <p class="hint">Carreras a las que estás apuntado y que aún no se han corrido.</p>
    ${upcoming.length ? `<ul class="mini-list">${upcoming.map((g) => miniRow(g, `<span class="badge-next">${dleft(g)}${myCat(g) ? ` · ${esc(myCat(g))}` : ''}</span>`)).join('')}</ul>`
      : '<p class="empty small">No estás apuntado a ninguna. Búscalas en la pestaña Carreras.</p>'}
  </section>

  ${pending.length ? `<section class="card season-block pend-block">
    <h2>🏁 Ya corridas, pendientes de resultado <small>(${pending.length})</small></h2>
    <p class="hint">Estabas apuntado y ya se han disputado. Pon tu resultado (una sola vez): <b>en cuanto lo pongas ya te cuenta para el bono</b>. Si no fuiste, pulsa «No fui: borrarme» en la lista de carreras.</p>
    <ul class="mini-list">${pending.map((g) => miniRow(g, g.my_result
      ? `<span class="badge-sent">📝 ${g.my_result.position}º · ya cuenta</span>`
      : (S.preview ? '<span class="badge-pend">pendiente</span>' : `<a class="btn primary small" href="#/resultado/reg_${g.id}">Poner mi resultado</a>`))).join('')}</ul>
  </section>` : ''}

  <section class="card season-block done-block">
    <h2>✅ Carreras hechas ${S.myYear} <small>(${list.length}${days !== list.length ? ` · ${days} días para el bono` : ''})</small></h2>
    ${years.length > 1 ? `<div class="years">${years.map((y) => `<button class="chip${y === S.myYear ? ' on' : ''}" data-act="my-year" data-y="${y}">${y}</button>`).join('')}</div>` : ''}
    ${list.length ? `<ul class="mini-list">${list.map(row).join('')}</ul>`
      : `<p class="empty small">Todavía no hay carreras tuyas con resultado en ${S.myYear}.</p>`}
    <p class="hint">Si falta alguna carrera o un puesto, díselo a la dirección del club.</p>
  </section>`;
}

function runnerBonusCard(d) {
  const b = d.bonus;
  if (!b) return '';
  const cfg = bonusConfigFor(b.config ? { [b.year]: b.config } : {}, b.year);
  const c = b.contract || (b.nuevo ? 'nuevo' : null);
  const st = bonusStatus(b.done, cfg, c, b.extra || 0, b.suspended || 0);
  const proj = bonusStatus(b.done + (b.planned || 0), cfg, c, b.extra || 0, b.suspended || 0);
  return `<section class="card bonus-card"><h2>Tu bono ${b.year}</h2>
    ${penaltyAlert(st, cfg, b.year)}
    ${bonusBar(st, cfg, b.planned || 0)}
    <p class="bonus-text">${bonusText(st)}</p>
    ${b.contract ? `<p class="hint">Contrato: ${esc(contractLabel(b.contract))}.</p>` : ''}
    ${b.planned ? `<p class="hint">Con tus ${b.planned} inscripcion${b.planned === 1 ? '' : 'es'} de ${b.year} llegarías a ${proj.bonusCount}${proj.tier ? ` (${euros(proj.amount)})` : ''}${proj.reachesMinimum ? '' : ', aún por debajo del mínimo'}.</p>` : ''}
    <p class="hint">Tramos${st.contract ? ` (${esc(contractLabel(st.contract).toLowerCase())})` : ''}: ${tiersLine(st.tiers)}. Una carrera de varios días cuenta un día cada uno.
      <br>Penalización si no se llega al mínimo (${cfg.minimum}): ${penaltiesLine(cfg)}.
      <br>🏆 Un podio en la general final de un circuito suma +${cfg.circuitExtra ?? 4} carreras para el bono, pero <b>no cuenta para el mínimo de ${cfg.minimum}</b>: para evitar la penalización hay que correr ${cfg.minimum} carreras.</p>
  </section>`;
}

function runnerScreen(sub) {
  if (sub === 'nueva') return viewRunnerNew();
  if (sub === 'resultado') return viewRunnerReport(parseRoute().id || '');
  if (sub === 'editar') {
    const id = parseRoute().id;
    const g = S.runnerData.registrations.find((x) => x.id === id && x.mine_created);
    if (!g) return frame('Editar carrera', '<p class="empty">Esta carrera no existe o no la añadiste tú.</p>', { back: runnerHref('') });
    if (S.rdraft?.id !== id) S.rdraft = emptyRunnerDraft({ id, name: g.name, date: g.date, multi: !!g.end_date, end_date: g.end_date || '',
      place: g.place || '', province: g.province || '', country: g.country || DEFAULT_COUNTRY, modality: g.modality, notes: g.notes || '', race_type: g.race_type || 'suelta', circuit: g.circuit || '' });
    return viewRunnerNew();
  }
  if (sub === 'mi') return viewRunnerMine();
  if (sub === 'contrato') return viewRunnerContract();
  if (sub === 'noticias') return viewNews();
  if (sub === 'equipo') return viewTeam();
  if (sub === 'federaciones') return viewFed();
  return viewRunnerHome();
}

/** Aviso de la vista previa de la dirección (en todas las pantallas del corredor). */
const previewBanner = () => (S.session?.isAdmin && S.preview ? `<p class="card warn">👁️ <b>Vista previa</b> de ${esc(S.preview.name)}: no se puede apuntar ni borrar.
  <a href="#/corredores">Salir</a>${S.preview.sqlOk ? '' : '<br><b>⚠️ Falta ejecutar en Supabase el SQL de «Mis carreras»</b> (supabase/cambios/2026-11-11-mis-carreras.sql).'}</p>` : '');
const runnerTitle = () => (S.session?.isAdmin && S.preview ? `Vista de ${S.preview.name}` : 'CC Monzón');

/** Tarjeta de una carrera ya disputada (con resultados), para el calendario. */
function doneRaceCard(r, { admin = false, meId = null } = {}) {
  const res = r.results || [];
  const pods = res.filter((x) => isPodium(x.position)).sort((a, b) => a.position - b.position);
  const mine = res.find((x) => x.runner_id === meId);
  const inner = `<div class="race-head"><div><h3>${esc(r.name)}</h3>
      <p class="muted">${when(r)}${place(r) ? ' · ' + esc(place(r)) : ''}</p></div>${modTag(r.modality)}</div>${typeTag(r)}
    <p class="count">🏁 Disputada · ${res.length} del club${res.length ? ': ' + esc(res.map((x) => x.runner_name).sort((a, b) => a.localeCompare(b, 'es')).join(', ')) : ''}</p>
    ${pods.length ? `<p class="pods">${pods.map((x) => `${medal(x.position)} ${esc(x.runner_name)}`).join(' · ')}</p>` : ''}
    ${mine ? `<p class="joined-done">✓ Participaste${mine.position ? ` · ${mine.position}º` : ''}</p>` : ''}
    ${!admin && meId && !mine && r.date >= pastLimit() && !S.preview ? `<p><button class="btn small" data-act="r-join-race" data-id="${r.id}">La hice y no salgo: añadirme</button></p>` : ''}`;
  return admin ? `<a class="card race done-race link-card ${modClass(r.modality)}" href="#/carreras/${r.id}">${inner}</a>`
    : `<article class="card race done-race ${modClass(r.modality)}">${inner}</article>`;
}

function viewRunnerHome() {
  const d = S.runnerData, me = d.me, today = d.today || todayISO();
  const upcoming = d.registrations.filter((g) => g.date >= today);
  const past = d.registrations.filter((g) => g.date < today);
  const card = (g) => {
    const mine = g.entries.find((e) => e.runner_id === me.id);
    const open = g.date >= today;
    return `<article class="card race ${open ? '' : 'past-reg '}${modClass(g.modality)}">
      <div class="race-head"><div><h3>${esc(g.name)}</h3>
        <p class="muted">${when(g)}${place(g) ? ' · ' + esc(place(g)) : ''}</p></div>
        ${modTag(g.modality)}</div>${typeTag(g)}
      ${g.suspended ? '<p class="state-tag">⛔ Suspendida: cuenta para el mínimo de carreras, no para el bono</p>' : ''}
      ${open || g.suspended ? '' : `<p class="state-tag">🏁 Ya disputada · pendiente de resultados</p>
        ${mine && !S.preview ? (g.my_result ? `<p class="mine-created">📝 Tu resultado: ${g.my_result.position}º (enviado)</p>`
          : `<p class="row"><a class="btn primary small" href="#/resultado/reg_${g.id}">Poner mi resultado</a>
             <button class="btn ghost small" data-act="r-leave" data-id="${g.id}">No fui: borrarme</button></p>`) : ''}
        ${!mine && g.date >= pastLimit() ? `<div class="row">${catSelect(`data-cat="${g.id}" aria-label="Tu categoría"`, me.category, 'Categoría')}
           <button class="btn primary" data-act="r-join" data-id="${g.id}">La hice: apuntarme</button></div>` : ''}`}
      ${g.mine_created && !S.preview ? `<p class="mine-created">Añadida por ti · <a href="#/editar/${g.id}">✏️ Editar o borrar</a></p>` : ''}
      ${g.notes ? `<p class="notes">${esc(g.notes)}</p>` : ''}
      <p class="count">👥 ${g.entries.length} del club</p>
      ${g.entries.length ? `<ul class="people">${g.entries.map((e) =>
        `<li class="${e.runner_id === me.id ? 'me' : ''}">${esc(e.name)}${e.category ? ` <small>${esc(e.category)}</small>` : ''}</li>`).join('')}</ul>` : ''}
      ${!open || g.suspended ? '' : mine
        ? `<div class="row joined"><span>✓ Estás inscrito${mine.category ? ' en ' + esc(mine.category) : ''}</span>
           <button class="btn ghost small" data-act="r-leave" data-id="${g.id}">Borrarme</button></div>`
        : `<div class="row">${catSelect(`data-cat="${g.id}" aria-label="Tu categoría"`, me.category, 'Categoría')}
           <button class="btn primary" data-act="r-join" data-id="${g.id}">Apuntarme</button></div>`}
    </article>`;
  };
  const isMine = (g) => (g.entries || []).some((e) => e.runner_id === me.id) || (g.results || []).some((x) => x.runner_id === me.id);
  const done = (S.team?.races || []).filter((r) => (r.results || []).length);
  const body = S.regView === 'cal'
    ? calendarView(d.registrations, card, isMine, { done, doneCard: (r) => doneRaceCard(r, { meId: me.id }) })
    : `<h2 class="section">Próximas carreras (${upcoming.length})</h2>
    ${upcoming.length ? upcoming.map(card).join('') : '<p class="empty">Todavía no hay carreras abiertas.</p>'}
    ${past.length ? `<details class="past"><summary>🏁 Ya disputadas, pendientes de resultados (${past.length})</summary>${past.map(card).join('')}</details>` : ''}`;
  return frame(runnerTitle(), `
    ${previewBanner()}
    <div class="toolbar">
      ${searchBox('runner', 'Buscar carrera o pueblo…')}
      <button class="btn primary add-btn" data-act="r-new" aria-label="Añadir una carrera que no está" title="Añadir carrera">＋</button>
    </div>
    <div id="search-results">${runnerSearchResults(S.q.runner)}</div>
    ${body}`,
  { rtab: '', actions: `${viewToggle()}${S.preview ? '' : '<button class="icon-btn" data-act="r-refresh" aria-label="Actualizar">↻</button>'}` });
}

/** «Mi temporada»: bono, mis carreras e instalación. */
function viewRunnerMine() {
  const d = S.runnerData, me = d.me;
  return frame(runnerTitle(), `
    ${previewBanner()}
    <p class="hello">Hola, <b>${esc(me.name)}</b> 👋</p>
    ${runnerBonusCard(d)}
    ${myRacesCard(d)}
    <a class="btn block" href="${runnerHref('contrato')}">📄 Ver mi contrato</a>
    ${installHint()}
    ${S.preview ? '' : `<p class="center"><button class="link muted" data-act="r-forget">No soy ${esc(me.name)}</button></p>`}`,
  { rtab: 'mi' });
}

/** «Contrato»: el contrato de la temporada (y otros documentos) y el bono que marca. */
function viewRunnerContract() {
  return frame(runnerTitle(), `
    ${previewBanner()}
    ${myDocsCard()}
    ${runnerBonusCard(S.runnerData)}
    ${circuitsCard(S.runnerData)}`,
  { rtab: 'contrato' });
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
  const card = (g) => `<a class="card race link-card ${g.date < today ? 'past-reg ' : ''}${modClass(g.modality)}" href="#/inscripciones/${g.id}">
      <div class="race-head"><div><h3>${esc(g.name)}</h3>
      <p class="muted">${when(g)}${place(g) ? ' · ' + esc(place(g)) : ''}</p></div>${modTag(g.modality)}</div>${typeTag(g)}
      ${g.suspended ? '<p class="state-tag">⛔ Suspendida: cuenta para el mínimo, no para el bono</p>' : g.date < today ? `<p class="state-tag">🏁 Ya disputada${g.entries.some((e) => e.self_position) ? ` · 📝 ${g.entries.filter((e) => e.self_position).length} de ${g.entries.length} han puesto su resultado` : ''}</p>` : ''}
      <p class="count">👥 ${g.entries.length} del club${g.entries.length ? ': ' +
        esc(g.entries.map((e) => runnerById(e.runner_id)?.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')).join(', ')) : ''}</p>
      ${g.created_by ? `<p class="count">Añadida por ${esc(runnerById(g.created_by)?.name || 'un corredor')}</p>` : ''}</a>`;
  return frame('Inscripciones', `
    <div class="toolbar">
      ${searchBox('admin', 'Buscar inscripción…')}
      <a class="btn primary add-btn" href="#/inscripciones/nueva" aria-label="Nueva inscripción" title="Nueva inscripción">＋</a>
    </div>
    <div id="reg-list">${adminRegList(card)}</div>`,
  { actions: `${viewToggle()}<button class="icon-btn" data-act="insc-menu" aria-label="Más opciones" title="Más opciones">⋮</button>` });
}

let adminCard = null;
/** Lista (o calendario) de inscripciones, filtrada por la lupa si hay texto. */
function adminRegList(card = adminCard) {
  adminCard = card;
  const today = todayISO();
  const all = [...S.data.registrations].sort((a, b) => a.date.localeCompare(b.date) || byName(a, b));
  const q = S.q.admin;
  const regs = normalize(q).length >= 2 ? searchRaces(q, all) : all;
  if (q && !regs.length) return `<p class="empty">Ninguna inscripción se parece a «${esc(q)}».</p>`;
  if (S.regView === 'cal' && !q) {
    return calendarView(regs, card, () => false, { done: S.data.races, doneCard: (r) => doneRaceCard(r, { admin: true }) });
  }
  const up = regs.filter((g) => g.date >= today), past = regs.filter((g) => g.date < today);
  return `${up.length ? `<h2 class="section">📅 Próximas (${up.length})</h2>${up.map(card).join('')}` : '<p class="empty">No hay inscripciones próximas.</p>'}
    ${past.length ? `<h2 class="section past-head">🏁 Ya disputadas (${past.length})</h2>${past.map(card).join('')}` : ''}`;
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
  // También la ven los corredores: en vez de «Crear inscripción», «Apuntarme» o «Añadir y apuntarme».
  const runner = !S.session?.isAdmin && !!S.runnerData;
  const back = runner ? null : '#/inscripciones';
  const opts = runner ? { rtab: 'federaciones' } : { back };
  const f = S.fed;
  if (!f || f.loading) return frame('Federaciones', '<p class="empty">Cargando calendarios…</p>', opts);
  if (f.failed) return frame('Federaciones', `<p class="card warn">No se han podido cargar los calendarios. Revisa la conexión o usa los enlaces directos:</p>${fedLinks()}`, opts);
  const today = todayISO();
  const clubRegs = runner ? S.runnerData.registrations : S.data.registrations;
  const created = new Set(clubRegs.concat(runner ? [] : S.data.races).map((g) => g.date + '|' + normalize(g.name)));
  const regByKey = new Map(clubRegs.map((g) => [g.date + '|' + normalize(g.name), g]));
  const meId = S.runnerData?.me?.id;
  const action = (r) => {
    const key = r.date + '|' + normalize(r.name);
    if (!runner) return created.has(key) ? '<span class="done">✓ Ya está en la app</span>'
      : `<button class="btn primary small" data-act="fed-create" data-i="${f.races.indexOf(r)}">Crear inscripción</button>`;
    const g = regByKey.get(key);
    if (g) return g.entries.some((e) => e.runner_id === meId) ? '<span class="done">✓ Apuntado</span>'
      : `<button class="btn primary small" data-act="r-join" data-id="${g.id}">Apuntarme</button>`;
    return `<button class="btn primary small" data-act="r-new-fed" data-i="${f.races.indexOf(r)}">Añadir y apuntarme</button>`;
  };
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
    return `${head}<article class="card race fed ${modClass(r.modality)}">
      <div class="race-head"><div><h3>${esc(r.name)}</h3>
        <p class="muted">${when(r)}${place(r) ? ' · ' + esc(place(r)) : ''}</p></div>
        ${modTag(r.modality)}</div>
      <p class="fed-meta"><span class="src src-${esc(r.source)}">${esc(FED_NAMES[r.source] || r.source)}</span>
        ${esc(r.discipline || '')}${r.kind === 'Ocio' ? ' · ocio' : ''}${r.info ? ` · <span class="muted">${esc(r.info)}</span>` : ''}</p>
      <div class="row">
        <a class="btn small" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Ver en la web ↗</a>
        ${action(r)}
      </div></article>`;
  }).join('');
  const updated = f.updated_at ? new Date(f.updated_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return frame('Federaciones', `
    ${runner ? previewBanner() : ''}
    <div class="years" role="tablist">${[['all', 'Todas'], ['FCC', 'Catalana'], ['FAC', 'Aragonesa']].map(([v, l]) =>
      `<button class="chip${fedFilter.source === v ? ' on' : ''}" data-act="fed-source" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="grid2 fed-filters">
      <label>Modalidad<select data-fed="modality">${opt('all', 'Todas', fedFilter.modality)}${mods.map((m) => opt(m, m, fedFilter.modality)).join('')}</select></label>
      <label class="check"><input type="checkbox" data-fed="leisure" ${fedFilter.leisure ? 'checked' : ''}> Incluir ocio y marchas</label>
    </div>
    <p class="hint">${list.length} carrera${list.length === 1 ? '' : 's'}. ${runner
      ? 'Si ya está en el club, pulsa «Apuntarme». Si no, «Añadir y apuntarme» la crea con los datos ya rellenados.'
      : 'Pulsa «Crear inscripción» para añadirla con nombre, fecha y lugar ya rellenados.'}</p>
    ${items || '<p class="empty">No hay carreras con estos filtros.</p>'}
    ${f.errors?.length ? `<p class="card warn">Aviso de la última lectura: ${esc(f.errors.join(' · '))}</p>` : ''}
    <p class="hint center">Datos de las webs de las federaciones${updated ? `, leídos el ${updated}` : ''}. Comprueba siempre los detalles en su web.</p>
    ${fedLinks()}`, opts);
}

function draftRegistration(id) {
  if (id === 'nueva') {
    const pre = S.prefill; S.prefill = null;   // viene de «Carreras de las federaciones»
    return { kind: 'reg', id: null, name: '', date: '', place: '', province: '', country: DEFAULT_COUNTRY, modality: 'Carretera', race_type: 'suelta', circuit: '', notes: '', people: [], ...pre };
  }
  const g = S.data.registrations.find((x) => x.id === id);
  if (!g) return null;
  return { kind: 'reg', ...g, multi: !!g.end_date, people: g.entries.map((e) => ({ runner_id: e.runner_id, runner_name: runnerById(e.runner_id)?.name || '?', category: e.category || '', self_position: e.self_position || null })).sort((a, b) => a.runner_name.localeCompare(b.runner_name, 'es')) };
}

function raceFields(d) {
  return `
    <label>Nombre<input data-f="name" value="${esc(d.name)}" required></label>
    <div class="grid2">
      <label>${d.multi ? 'Primer día' : 'Fecha'}<input type="date" data-f="date" value="${esc(d.date)}" required></label>
      <label>Modalidad<select data-f="modality">${MODALITIES.map((m) => opt(m, m, d.modality)).join('')}</select></label>
    </div>
    ${typeFields(d, 'data-f')}
    <label class="check"><input type="checkbox" data-act-change="multi" ${d.multi ? 'checked' : ''}> Carrera de varios días (por etapas)</label>
    ${d.multi ? `<label>Último día<input type="date" data-f="end_date" value="${esc(d.end_date || '')}" min="${esc(d.date || '')}" required></label>` : ''}
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
      ${d.id ? '' : `<div id="dup-admin">${dupSuggestions(d.name, S.data.registrations, false)}</div>`}
      <label>Notas<textarea data-f="notes" rows="2">${esc(d.notes || '')}</textarea></label>
      <label class="check"><input type="checkbox" data-act-change="suspended" ${d.suspended ? 'checked' : ''}> ⛔ Carrera suspendida</label>
      ${d.suspended ? '<p class="hint">Cláusula 6: a los inscritos les cuenta para el mínimo de participaciones, pero <b>no para el bono</b>. No se pasa a resultados.</p>' : ''}
      <h3>Inscritos (${d.people.length})</h3>
      <ul class="edit-list">${d.people.map((p, i) => `<li>
        <span class="name">${esc(p.runner_name)}${p.self_position ? ` <small class="self-res">📝 puso ${p.self_position}º</small>` : ''}</span>
        ${catSelect(`data-p="${i}" data-pf="category" aria-label="Categoría"`, p.category)}
        <button type="button" class="icon-btn" data-act="del-person" data-i="${i}" aria-label="Quitar">✕</button></li>`).join('')}</ul>
      ${addRunnerSelect(d)}
      <button class="btn primary">Guardar</button>
    </form>
    ${d.id ? `<div class="stack">
      ${d.suspended ? '' : '<button class="btn" data-act="promote">Pasar a resultados</button>'}
      <button class="btn danger ghost" data-act="del-reg">Borrar inscripción</button></div>` : ''}`,
  { back: '#/inscripciones' });
}

/** Corredor: noticias de la dirección. Se marcan como leídas al abrir la pantalla. */
async function enterNews() {
  await loadNews();
  S.newsFresh = new Set(unreadNews().map((n) => n.id));
  markNewsSeen();
  if (S.runnerData) render();
}
function viewNews() {
  const list = S.news;
  return frame('Noticias del club', `
    ${previewBanner()}
    ${list === null ? '<p class="card warn">Las noticias aún no están activadas: la dirección tiene que ejecutar un cambio en la base de datos.</p>'
      : list.length ? list.map((n) => `<article class="card news${S.newsFresh.has(n.id) ? ' fresh' : ''}">
        <div class="race-head"><h3>${esc(n.title)}</h3>${S.newsFresh.has(n.id) ? '<span class="tag t-new">Nueva</span>' : ''}</div>
        <p class="muted">${formatDate(String(n.created_at).slice(0, 10))}${n.expires_at ? ` · hasta el ${formatDate(n.expires_at, false)}` : ''}</p>
        ${n.body ? `<p class="news-body">${newsText(n.body)}</p>` : ''}</article>`).join('')
      : '<p class="empty">No hay noticias por ahora. Cuando el club tenga algo que contaros (quedadas, pedidos de ropa…), lo verás aquí.</p>'}`, { rtab: 'noticias' });
}

/** Dirección: carreras de los próximos días con quién va, para avisar al encargado de redes (cláusula 8). */
function weekRaces(days) {
  const from = todayISO(), to = (() => { const d = new Date(from + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); })();
  return S.data.registrations.filter((g) => !g.suspended && g.date >= from && g.date <= to && g.entries.length)
    .sort((a, b) => a.date.localeCompare(b.date) || byName(a, b));
}
function weekText(days, list = weekRaces(days)) {
  if (!list.length) return '';
  const who = (g) => g.entries.map((e) => runnerById(e.runner_id)?.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')).join(', ');
  return `🚴 CC Monzón · carreras de los próximos ${days} días\n\n${list.map((g) => `📅 ${when(g)} · ${g.name}\n${place(g) || g.modality ? `📍 ${[place(g), g.modality].filter(Boolean).join(' · ')}\n` : ''}👥 ${who(g)}`).join('\n\n')}\n\n📸 Crónica y foto con la equipación, en las 48 h siguientes a la prueba.`;
}
/** Casilla «publicada en redes» (se guarda en este móvil). */
const postCheck = (id) => `<label class="check post-check"><input type="checkbox" data-act-change="post" data-id="${id}" ${postedSet().has(id) ? 'checked' : ''}> ✓ Publicada en redes</label>`;
/** Tarjeta de una carrera con inscritos (inscripción o carrera ya con resultados) y su casilla de publicada. */
function postCard(g, done = false) {
  const names = (done ? (g.results || []).map((x) => x.runner_name) : (g.entries || []).map((e) => runnerById(e.runner_id)?.name)).filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'es'));
  const isDone = done || g.date < todayISO();
  return `<article class="card race ${modClass(g.modality)}${postedSet().has(g.id) ? ' gone' : ''}"><div class="race-head"><div><h3>${esc(g.name)}</h3>
    <p class="muted">${when(g)}${place(g) ? ' · ' + esc(place(g)) : ''}</p></div>${modTag(g.modality)}</div>
    <p class="count">${isDone ? '🏁 Disputada · ' : ''}👥 ${esc(names.join(', '))}</p>
    ${g.suspended ? '<p class="state-tag">⛔ Suspendida</p>' : ''}
    <div class="row">${postCheck(g.id)}<a class="btn small ghost" href="#/${done ? 'carreras' : 'inscripciones'}/${g.id}">Abrir</a></div></article>`;
}
function viewWeek() {
  const days = S.weekDays || 14, cal = S.weekView === 'cal';
  const views = `<div class="years"><button class="chip${cal ? '' : ' on'}" data-act="week-view" data-v="list">📋 Lista</button><button class="chip${cal ? ' on' : ''}" data-act="week-view" data-v="cal">📅 Calendario</button></div>`;
  if (cal) {
    const regs = S.data.registrations.filter((g) => g.entries.length && !g.suspended);
    const done = S.data.races.filter((r) => (r.results || []).length);
    return frame('Próximas carreras', `${views}
      <p class="hint">Todas las carreras del club, próximas y ya hechas. En cada día sale ✓ si está publicada en redes (½ si hay alguna sin publicar). Toca un día y marca las casillas.</p>
      ${calendarView(regs, (g) => postCard(g), () => false, { done, doneCard: (r) => postCard(r, true), isPosted: (g) => postedSet().has(g.id) })}`, { back: '#/inscripciones' });
  }
  const list = weekRaces(days), posted = postedSet(), todo = list.filter((g) => !posted.has(g.id));
  return frame('Próximas carreras', `${views}
    <p class="hint">Para avisar al encargado de redes con una semana de antelación (cláusula 8 del contrato). Salen las carreras con algún inscrito, sin las suspendidas. Marca ✓ las que ya has publicado.</p>
    <div class="years">${[7, 14, 30].map((n) => `<button class="chip${n === days ? ' on' : ''}" data-act="week-days" data-n="${n}">${n} días</button>`).join('')}</div>
    ${list.length ? `<p class="hint"><b>${todo.length}</b> sin publicar de ${list.length}.</p>
      <div class="row">${todo.length ? `<button class="btn primary" data-act="week-copy">📋 Copiar texto</button><button class="btn" data-act="week-wa">WhatsApp</button>` : ''}
        <button class="btn ghost" data-act="week-all">${todo.length ? '✓ Marcar todas' : '↺ Desmarcar todas'}</button></div>
      ${list.map((g) => postCard(g)).join('')}
      <details class="card"><summary><b>Ver el texto que se copia</b></summary><pre class="week-pre">${esc(weekText(days, todo.length ? todo : list))}</pre></details>`
      : `<p class="empty">No hay carreras con inscritos en los próximos ${days} días.</p>`}`, { back: '#/inscripciones' });
}

/** Dirección: escribir las noticias que verán los corredores. */
function viewAdminNews() {
  const list = S.data.announcements;
  const today = todayISO();
  if (!list) return frame('Noticias para los corredores', `<p class="card warn">Falta ejecutar en Supabase <code>supabase/cambios/2026-11-12-noticias.sql</code>.</p>`, { back: '#/avisos' });
  const e = S.annEdit ? list.find((x) => x.id === S.annEdit) : null;
  const sorted = [...list].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return frame('Noticias para los corredores', `
    <p class="hint">Lo que escribas aquí les sale a todos los corredores con la campanita 🔔 de arriba, como una noticia para leer. No suena el teléfono: la ven al abrir la app.</p>
    <form class="card stack" data-form="ann-save">
      <h3>${e ? 'Editar noticia' : 'Nueva noticia'}</h3>
      <label>Título<input name="title" value="${esc(e?.title || '')}" placeholder="Quedada social del club" minlength="3" maxlength="120" required autocomplete="off"></label>
      <label>Texto<textarea name="body" rows="6" maxlength="4000" placeholder="Qué, cuándo, dónde y qué tienen que hacer. Los enlaces se pueden pulsar.">${esc(e?.body || '')}</textarea></label>
      <label>Mostrar hasta (opcional)<input type="date" name="expires_at" value="${esc(e?.expires_at || '')}" min="${today}"></label>
      <p class="hint">Si pones fecha, la noticia desaparece sola al pasar ese día. Sin fecha se queda hasta que la borres.</p>
      <div class="row"><button class="btn primary">${e ? 'Guardar cambios' : 'Publicar'}</button>${e ? '<button type="button" class="btn ghost" data-act="ann-cancel">Cancelar</button>' : ''}</div>
    </form>
    <h2 class="section">Publicadas (${sorted.length})</h2>
    ${sorted.length ? sorted.map((n) => { const gone = n.expires_at && n.expires_at < today;
      return `<article class="card news${gone ? ' gone' : ''}"><div class="race-head"><h3>${esc(n.title)}</h3>${gone ? '<span class="tag">Caducada</span>' : ''}</div>
        <p class="muted">${formatDate(String(n.created_at).slice(0, 10))}${n.expires_at ? ` · hasta el ${formatDate(n.expires_at, false)}` : ''}</p>
        ${n.body ? `<p class="news-body">${newsText(n.body)}</p>` : ''}
        <div class="row"><button class="btn small" data-act="ann-edit" data-id="${n.id}">Editar</button>
          <button class="btn small danger ghost" data-act="ann-del" data-id="${n.id}">Borrar</button></div></article>`; }).join('')
      : '<p class="empty">Todavía no has publicado ninguna.</p>'}`, { back: '#/avisos' });
}

/** Corredor: podios en la general final de un circuito (cláusula NOVENA): los comunica y la dirección los confirma. */
function circuitsCard(d) {
  if (!d.circuits) return ''; // base de datos aún sin actualizar
  const year = d.bonus?.year || new Date().getFullYear();
  const per = d.bonus?.config?.circuitExtra ?? 4;
  const mine = d.circuits.filter((c) => c.year >= year - 1);
  return `<section class="card circ-card">
    <h2>🏆 General final de un circuito</h2>
    <p class="hint">Si acabas entre los <b>3 primeros de la clasificación general final</b> de un circuito completo (Copa, Open, Critérium…), absoluta o de tu categoría,
      se te suman <b>+${per} carreras para el bono</b>, pero <b>no cuentan para el mínimo de ${d.bonus?.config?.minimum ?? 12}</b>. No vale el podio de una prueba suelta. Comunícalo aquí y la dirección lo confirmará.</p>
    ${mine.length ? `<ul class="mini-list">${mine.map((c) => `<li><div><b>${medal(c.position)} ${esc(c.circuit)}</b>
      <small class="muted">${c.year} · ${c.position}º · ${scopeLabel(c.scope)}</small></div>
      ${c.status === 'confirmado' ? `<span class="extra-chip">✅ +${per} carreras</span>`
        : `<span class="row-btns"><span class="pending-chip">⏳ Pendiente</span>${S.preview ? '' : `<button class="btn small ghost" data-act="circ-cancel" data-id="${c.id}">Retirar</button>`}</span>`}</li>`).join('')}</ul>` : ''}
    ${S.preview ? '' : `<details${mine.length ? '' : ' open'}><summary><b>+ Comunicar un podio de circuito</b></summary>
      <form class="stack" data-form="circ-propose">
        <label>Circuito<input name="circuit" list="dl-circuit" placeholder="Copa Aragón XCM" minlength="3" maxlength="120" required autocomplete="off"></label>${circuitList()}
        <div class="grid2">
          <label>Tu puesto final<select name="position"><option value="1">1º</option><option value="2">2º</option><option value="3">3º</option></select></label>
          <label>Clasificación<select name="scope">${CIRCUIT_SCOPES.map((x) => opt(x.id, x.label.replace('su ', 'mi '), 'categoria')).join('')}</select></label>
        </div>
        <label>Temporada<select name="year">${opt(String(year), String(year), String(year))}${opt(String(year - 1), String(year - 1), '')}</select></label>
        <button class="btn primary">Enviar a la dirección</button>
      </form></details>`}
  </section>`;
}

// ======================================================================
//  Avisos de la dirección (campanita)
// ======================================================================

/** Cosas pendientes de la dirección. */
const postedSet = () => { try { return new Set(JSON.parse(store.get(POSTED_KEY) || '[]')); } catch { return new Set(); } };
const savePosted = (set) => store.set(POSTED_KEY, JSON.stringify([...set].slice(-300)));
function adminAlerts() {
  const posted = postedSet();
  const week = weekRaces(7);   // carreras de los próximos 7 días con inscritos (para publicar en redes)
  return {
    circuits: (S.data.circuitPodiums || []).filter((c) => c.status === 'pendiente'),
    week, weekTodo: week.filter((g) => !posted.has(g.id)),
    noContract: S.data.runners.filter((r) => !r.contract).sort(byName),
  };
}
const alertCount = () => { const a = adminAlerts(); return a.circuits.length + a.weekTodo.length; };

function viewAlerts() {
  const a = adminAlerts();
  const per = bonusCfg(new Date().getFullYear()).circuitExtra ?? 4;
  const none = !a.circuits.length && !a.week.length && !a.noContract.length;
  const raceCard = (g) => postCard(g);
  return frame('Avisos', `
    <a class="btn primary block" href="#/noticias">📣 Noticias para los corredores${S.data.announcements ? ` (${S.data.announcements.length})` : ''}</a>
    <a class="btn block" href="#/semana">📅 Próximas carreras (para redes)</a>
    ${none ? '<p class="card pen ok">✅ No tienes nada pendiente.</p>' : ''}
    ${a.week.length ? `<h2 class="section">📅 Para publicar en redes: próximos 7 días (${a.weekTodo.length} sin publicar)</h2>
      <p class="hint">Carreras con inscritos que empiezan esta semana. Copia el texto para el encargado de redes y marca cada una cuando esté publicada.</p>
      ${a.weekTodo.length ? `<div class="row"><button class="btn primary" data-act="alert-week-copy">📋 Copiar texto</button><button class="btn" data-act="alert-week-wa">WhatsApp</button>
        <button class="btn ghost" data-act="post-all">✓ Marcar todas</button></div>` : '<p class="pen ok">✅ Todas publicadas.</p>'}
      ${a.week.map(raceCard).join('')}
      <a class="btn block ghost" href="#/semana">Ver más días</a>` : ''}
    ${a.circuits.length ? `<h2 class="section">🏆 Podios de circuito por confirmar (${a.circuits.length})</h2>
      <p class="hint">Un corredor dice que ha hecho podio en la general final de un circuito. Si lo confirmas, se le suman +${per} carreras para el bono.</p>
      ${a.circuits.map((c) => `<article class="card"><h3>${esc(runnerById(c.runner_id)?.name || '?')}</h3>
        <p>${medal(c.position)} <b>${c.position}º</b> en <b>${esc(c.circuit)}</b> · ${c.year} · clasificación ${scopeLabel(c.scope)}</p>
        <div class="row"><button class="btn primary" data-act="circ-confirm" data-id="${c.id}">Confirmar (+${per})</button>
          <button class="btn danger ghost" data-act="circ-del" data-id="${c.id}">Rechazar</button></div></article>`).join('')}` : ''}
    ${a.noContract.length ? `<h2 class="section">📄 Corredores sin tipo de contrato (${a.noContract.length})</h2>
      <p class="hint">Sin contrato indicado se les aplican los bonos y la penalización de renovación: ${esc(a.noContract.map((r) => r.name).join(', '))}.</p>
      <a class="btn block" href="#/bonos">Indicarlo en Bonos</a>` : ''}`, { back: '#/inscripciones' });
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
    return `<a class="card race link-card ${modClass(r.modality)}" href="#/carreras/${r.id}">
      <div class="race-head"><div><h3>${esc(r.name)}</h3>
      <p class="muted">${when(r)}${place(r) ? ' · ' + esc(place(r)) : ''}</p></div>${modTag(r.modality)}</div>${typeTag(r)}
      <p class="count">${r.results.length} participante${r.results.length === 1 ? '' : 's'}</p>
      ${pods.length ? `<p class="pods">${pods.map((x) => `${medal(x.position)} ${esc(x.runner_name)}${x.category ? ` <small>${esc(x.category)}</small>` : ''}`).join(' · ')}</p>` : ''}
      ${(() => { const st = podiumsOf(r.results.map((res) => ({ race: r, res }))).filter((p) => p.stage);
        return r.stages?.length ? `<p class="count">${r.stages.length} etapas${st.length ? ` · ${st.length} podio${st.length === 1 ? '' : 's'} de etapa (${st.filter((p) => p.position === 1).length} victoria${st.filter((p) => p.position === 1).length === 1 ? '' : 's'})` : ''}</p>` : ''; })()}</a>`;
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
  if (id === 'nueva') return { kind: 'race', id: null, name: '', date: '', place: '', province: '', country: DEFAULT_COUNTRY, modality: 'Carretera', race_type: 'suelta', circuit: '', notes: '', people: [], stages: [] };
  const r = S.data.races.find((x) => x.id === id);
  if (!r) return null;
  const stages = (r.stages || []).map((_, i) => stageName(r, i));
  return { kind: 'race', ...r, stages, multi: !!r.end_date, people: r.results.map((x) => ({ runner_id: x.runner_id, runner_name: x.runner_name, category: x.category || '',
    position: x.position ?? '', podium_type: x.podium_type || 'suelta', self_reported: !!x.self_reported, origPosition: x.position ?? '',
    stage_positions: stages.map((_, i) => x.stage_positions?.[i] ?? '') }))
    .sort((a, b) => (a.position || 9999) - (b.position || 9999) || a.runner_name.localeCompare(b.runner_name, 'es')) };
}

function viewRaceEdit() {
  const d = S.draft;
  if (!d) return frame('Carrera', '<p class="empty">Esta carrera ya no existe.</p>', { back: '#/carreras' });
  return frame(d.id ? 'Editar carrera' : 'Nueva carrera', `
    <form class="card stack" data-form="save-race">
      ${raceFields(d)}
      <label>Notas<textarea data-f="notes" rows="2">${esc(d.notes || '')}</textarea></label>
      <div class="stages-box">
        <div class="row stages-head"><h3>Etapas</h3>
          <div class="stepper">
            <button type="button" class="icon-btn" data-act="stages-n" data-n="-1" aria-label="Quitar etapa" ${d.stages.length ? '' : 'disabled'}>−</button>
            <b aria-live="polite">${d.stages.length || 'Sin etapas'}</b>
            <button type="button" class="icon-btn" data-act="stages-n" data-n="1" aria-label="Añadir etapa">+</button>
          </div></div>
        ${d.stages.length ? `<p class="hint">Cambia los nombres si quieres (Prólogo, CRI…). Los podios de etapa cuentan en el resumen como tipo «Etapa».</p>
          <div class="stage-names">${d.stages.map((n, i) => `<input data-stage="${i}" value="${esc(n)}" aria-label="Nombre de la etapa ${i + 1}" maxlength="40">`).join('')}</div>`
          : '<p class="hint">Para carreras por etapas: añade las etapas y podrás poner el puesto de cada corredor en cada una, además de la general.</p>'}
      </div>
      <h3>Participantes (${d.people.length})</h3>
      <p class="hint">Puesto = clasificación en su categoría${d.stages.length ? '. «General» es la clasificación final' : ''}. Del 1 al 3 es podio: indica de qué tipo.</p>
      <ul class="edit-list results">${d.people.map((p, i) => {
        const pod = isPodium(Number(p.position));
        return `<li>
        <span class="name">${esc(p.runner_name)}${p.runner_id ? '' : ' <small class="muted">(ya no está en la plantilla)</small>'}${p.self_reported ? ' <small class="self-res">📝 puesto por el corredor</small>' : ''}</span>
        <button type="button" class="icon-btn" data-act="del-person" data-i="${i}" aria-label="Quitar">✕</button>
        <div class="res-fields">
          ${catSelect(`data-p="${i}" data-pf="category" aria-label="Categoría"`, p.category)}
          <input type="number" inputmode="numeric" min="1" placeholder="${d.stages.length ? 'General' : 'Puesto'}" aria-label="${d.stages.length ? 'Puesto en la general' : 'Puesto'}" data-p="${i}" data-pf="position" value="${esc(p.position)}">
          <select data-p="${i}" data-pf="podium_type" aria-label="Tipo de podio" ${pod ? '' : 'disabled'}>
            ${PODIUM_TYPES.map((t) => opt(t.id, t.label, p.podium_type)).join('')}</select>
        </div>
        ${d.stages.length ? `<div class="stage-pos">${d.stages.map((n, j) => `<label><span data-stage-label="${j}">${esc(n)}</span>
          <input type="number" inputmode="numeric" min="1" data-p="${i}" data-sp="${j}" value="${esc(p.stage_positions?.[j] ?? '')}"></label>`).join('')}</div>` : ''}
        </li>`;
      }).join('')}</ul>
      ${addRunnerSelect(d)}
      <button class="btn primary">Guardar</button>
    </form>
    ${d.id ? `<button class="btn danger ghost block" data-act="del-race">Borrar carrera</button>` : ''}`,
  { back: '#/carreras' });
}

// ======================================================================
//  Resumen anual
// ======================================================================

/**
 * Contenido del resumen anual. `admin`: enlaces a las carreras, avisos de datos que faltan y CSV.
 * `me`: id del corredor que mira (se resalta su fila).
 */
function summaryBody(races, runners, { admin = false, me = null } = {}) {
  const years = availableYears(races);
  if (!years.includes(S.year)) S.year = years[0];
  const all = yearSummary(S.year, races, runners);          // todas las modalidades (para los selectores)
  if (S.sumMod && S.sumMod !== 'all' && !all.byModality.some((m) => m.modality === S.sumMod)) S.sumMod = 'all';
  const mod = S.sumMod && S.sumMod !== 'all' ? S.sumMod : null;
  const s = mod ? yearSummary(S.year, races.filter((r) => r.modality === mod), runners) : all;  // lo que se ve, filtrado
  const cls = mod ? modClass(mod) : '';
  const raceLink = (id, name) => admin ? `<a href="#/carreras/${id}">${esc(name)}</a>` : `<b>${esc(name)}</b>`;
  const names = (rows, n = 3) => rows.length <= n ? rows.map((r) => esc(r.name)).join(', ') : `${rows.slice(0, n).map((r) => esc(r.name)).join(', ')} y ${rows.length - n} más`;
  const maxOf = (arr) => Math.max(1, ...arr);

  // --- selector de modalidad
  const chips = `<div class="years mod-chips" role="tablist" aria-label="Modalidad">
    <button class="chip${mod ? '' : ' on'}" data-act="sum-mod" data-m="all">Todas</button>
    ${all.byModality.map((m) => `<button class="chip mchip ${modClass(m.modality)}${mod === m.modality ? ' on' : ''}" data-act="sum-mod" data-m="${esc(m.modality)}"><i class="dot"></i>${esc(m.modality)}</button>`).join('')}</div>`;

  // --- cabecera con los números grandes
  const big = (n, label) => `<div><b>${n}</b><span>${label}</span></div>`;
  const hero = `<section class="sum-hero ${cls}">
    <p class="sum-hero-t">${mod ? `🏁 ${esc(mod)}` : '🏁 Todo el equipo'} · temporada ${S.year}</p>
    <div class="sum-big">${big(s.totals.races, 'carreras')}${big(s.totals.runners, 'corredores')}${big(s.totals.podiums, 'podios')}${big(s.totals.wins, 'victorias')}</div>
    <p class="sum-hero-s">${s.totals.participations} participaciones${s.totals.podiums ? ` · ${Math.round((s.totals.podiums / Math.max(1, s.totals.participations)) * 100)} % acaban en podio` : ''}</p>
  </section>`;

  // --- líderes
  const people = s.perRunner;
  const lead = (icon, label, score, unit) => {
    const top = Math.max(0, ...people.map(score));
    if (!top) return '';
    const who = people.filter((r) => score(r) === top);
    return `<div class="lead"><span class="lead-i">${icon}</span><small>${label}</small><b>${names(who, 2)}</b><em>${top} ${top === 1 ? unit : unit + 's'}</em></div>`;
  };
  const leaders = [lead('🏁', 'Más carreras', (r) => r.races, 'carrera'), lead('🏆', 'Más podios', (r) => r.p1 + r.p2 + r.p3, 'podio'), lead('🥇', 'Más victorias', (r) => r.p1, 'victoria')].join('');

  // --- por modalidad (siempre todas; tocar una filtra)
  const maxRaces = maxOf(all.byModality.map((m) => m.races));
  const byMod = `<section class="card"><h2>Por modalidad</h2><p class="hint">Toca una modalidad para ver solo lo suyo.</p>
    ${all.byModality.map((m) => `<button type="button" class="modrow ${modClass(m.modality)}${mod === m.modality ? ' sel' : ''}" data-act="sum-mod" data-m="${esc(m.modality)}">
      <div class="modrow-h"><span><i class="dot"></i><b>${esc(m.modality)}</b></span><span class="muted">${m.races} carrera${m.races === 1 ? '' : 's'}</span></div>
      <div class="bar"><span style="width:${(m.races / maxRaces) * 100}%"></span></div>
      <div class="modrow-s"><span>👥 ${m.runners} corredor${m.runners === 1 ? '' : 'es'}</span><span>🏁 ${m.participations} part.</span><span>🏆 ${m.podiums}</span><span>🥇 ${m.wins}</span></div>
    </button>`).join('')}</section>`;

  // --- carreras por mes
  const maxMonth = maxOf(s.byMonth.map((m) => m.total));
  const MES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const months = `<section class="card"><h2>Carreras por mes</h2>
    <div class="months" role="img" aria-label="Carreras de cada mes">${s.byMonth.map((m) => `<div class="mcol${m.total ? '' : ' empty'}"><em>${m.total || ''}</em>
      <div class="mstack" style="height:${(m.total / maxMonth) * 100}%">${MODALITIES.filter((x) => m.mods[x]).map((x) =>
        `<span class="${modClass(x)}" style="flex:${m.mods[x]}" title="${esc(x)}: ${m.mods[x]}"></span>`).join('')}</div><b>${MES[m.month]}</b></div>`).join('')}</div>
    ${mod ? '' : `<div class="mod-legend">${all.byModality.filter((m) => m.races).map((m) => `<span class="${modClass(m.modality)}"><i class="dot"></i>${esc(m.modality)}</span>`).join('')}</div>`}</section>`;

  // --- clasificación de corredores
  const active = people.filter((r) => r.races > 0);
  const idle = people.filter((r) => !r.races && r.current);
  const maxR = maxOf(active.map((r) => r.races));
  const rank = `<section class="card"><h2>Corredores${mod ? ` de ${esc(mod)}` : ''}</h2>
    ${active.length ? `<ol class="rank">${active.map((r, i) => `<li class="${me && r.key === me ? 'me-row' : ''}">
      <span class="pos">${i + 1}</span>
      <div class="rk"><div class="rk-h"><b>${esc(r.name)}</b>${r.current ? '' : ' <small class="muted">(baja)</small>'}
          <span class="rk-m">${r.p1 ? `🥇${r.p1} ` : ''}${r.p2 ? `🥈${r.p2} ` : ''}${r.p3 ? `🥉${r.p3}` : ''}</span></div>
        <div class="bar seg" style="width:${(r.races / maxR) * 100}%">${MODALITIES.filter((x) => r.mods[x]).map((x) => `<span class="${modClass(x)}" style="flex:${r.mods[x]}" title="${esc(x)}: ${r.mods[x]}"></span>`).join('')}</div></div>
      <span class="rk-n">${r.races}</span></li>`).join('')}</ol>`
      : `<p class="muted">Todavía no hay carreras${mod ? ` de ${esc(mod)}` : ''} este año.</p>`}
    ${idle.length ? `<p class="muted small">Sin carreras${mod ? ` de ${esc(mod)}` : ''} todavía: ${names(idle, 30)}.</p>` : ''}</section>`;

  // --- podios
  const types = s.byPodiumType.filter((t) => t.podiums);
  const pods = `<section class="card"><h2>Podios${mod ? ` de ${esc(mod)}` : ' del año'}</h2>
    ${types.length ? `<div class="pills">${types.map((t) => `<span class="pill">${esc(t.label)} <b>${t.podiums}</b>${t.wins ? ` · 🥇 ${t.wins}` : ''}</span>`).join('')}</div>` : ''}
    ${s.podiumList.length ? `<ul class="podium-list">${s.podiumList.map((p) => `<li class="${modClass(p.modality)}"><span class="medal">${medal(p.position)}</span><div>
        <b>${esc(p.runner)}</b>${p.category ? ` <small class="muted">${esc(p.category)}</small>` : ''} · ${p.position}º ${mod ? '' : `<span class="tag ${modClass(p.modality)}">${esc(p.modality)}</span>`}
        <br>${raceLink(p.raceId, p.race)} <span class="muted">· ${formatDate(p.date, false)} · ${esc(podiumLabel(p.type))}${p.stage ? ': ' + esc(p.stage) : ''}</span></div></li>`).join('')}</ul>`
      : '<p class="muted">Sin podios este año.</p>'}</section>`;

  // --- dónde
  const where = (title, rows) => {
    const top = rows.slice(0, 8), mx = maxOf(top.map((c) => c.races));
    return `<div><h3>${title}</h3>${top.length ? top.map((c) => `<div class="hbar"><span>${esc(c.name)}</span><div class="bar"><span style="width:${(c.races / mx) * 100}%"></span></div><b>${c.races}</b></div>`).join('') : '<p class="muted small">Sin datos</p>'}</div>`;
  };
  const places = `<section class="card ${cls}"><h2>Dónde se ha competido</h2>
    <div class="grid2 top-align">${where('País', s.countries)}${where('Provincia', s.provinces)}</div>
    ${admin && s.missingPlace.length ? `<div class="warn"><b>Faltan datos en ${s.missingPlace.length} carrera${s.missingPlace.length === 1 ? '' : 's'}:</b>
      <ul>${s.missingPlace.map((m) => `<li><a href="#/carreras/${m.id}">${esc(m.name)}</a> (${formatRange(m.date, m.end_date, false)}): sin ${m.missing.join(' ni ')}</li>`).join('')}</ul></div>` : ''}</section>`;

  return `
    ${yearPicker(years)}
    ${chips}
    ${hero}
    ${leaders ? `<div class="leads">${leaders}</div>` : ''}
    ${mod ? '' : byMod}
    ${months}
    ${rank}
    ${pods}
    ${mod ? byMod : ''}
    ${places}
    ${admin ? `<button class="btn block" data-act="csv-year">Exportar ${S.year} a CSV (Excel)</button>` : ''}`;
}

function viewSummary() {
  return frame('Resumen anual', summaryBody(S.data.races, S.data.runners, { admin: true }));
}

/** Resumen del equipo para los corredores (solo lectura). */
function viewTeam() {
  const t = S.team;
  if (!t) return frame('Resumen del equipo', `${previewBanner()}<p class="empty">Cargando…</p>`, { rtab: 'equipo' });
  if (t.failed) return frame('Resumen del equipo', `${previewBanner()}<p class="card warn">${esc(t.failed)}</p>`, { rtab: 'equipo' });
  return frame('Resumen del equipo', `${previewBanner()}<p class="hint">Así va el equipo de competición del CC Monzón. 💪</p>
    ${summaryBody(t.races, t.runners, { me: S.runnerData?.me?.id })}`, { rtab: 'equipo' });
}

async function loadTeam() {
  S.team = null;
  try { S.team = await api.runnerTeam(S.code || S.previewCode); }
  catch (e) {
    S.team = { failed: /runner_team|PGRST202|function/i.test(String(e?.message))
      ? 'El resumen del equipo aún no está activado: la dirección tiene que ejecutar un cambio en la base de datos.' : friendlyError(e) };
  }
  if (S.runnerData) render();
}

// ======================================================================
//  Plantilla
// ======================================================================

// ======================================================================
//  Bonos por carreras de la temporada
// ======================================================================

const euros = (n) => `${Number(n || 0).toLocaleString('es-ES')} €`;
const bonusCfg = (year) => bonusConfigFor(S.data?.settings?.bonus, year);

/** Barra de progreso con las marcas de los tramos y del mínimo. */
function bonusBar(st, cfg, planned = 0) {
  const tiers = st.tiers || tiersFor(cfg, st.contract);
  const extra = st.extra || 0, total = st.count + extra;
  const max = Math.max(...tiers.map((t) => t.races), cfg.minimum || 0, total + planned, 1);
  const pct = (n) => `${Math.min(100, (n / max) * 100).toFixed(1)}%`;
  return `<div class="bbar" role="img" aria-label="${st.count} carreras${extra ? ` más ${extra} extra por podio de circuito` : ''}, de ${max}">
    <span class="bbar-plan" style="width:${pct(total + planned)}"></span>
    ${extra ? `<span class="bbar-extra" style="width:${pct(total)}"></span>` : ''}
    <span class="bbar-done ${st.reachesMinimum ? 'ok' : ''}" style="width:${pct(st.count)}"></span>
    ${tiers.map((t) => `<i class="bbar-mark${total >= t.races ? ' hit' : ''}${t.races === st.minimum ? ' min' : ''}" style="left:${pct(t.races)}"><b>${t.races}${t.races === st.minimum ? ' mín' : ''}</b></i>`).join('')}
    ${st.minimum && !tiers.some((t) => t.races === st.minimum) ? `<i class="bbar-mark min${st.reachesMinimum ? ' hit' : ''}" style="left:${pct(st.minimum)}"><b>${st.minimum} mín</b></i>` : ''}
  </div>`;
}

const tiersLine = (tiers) => tiers.map((t) => `${t.races} carreras → ${euros(t.amount)}`).join(' · ');
/** Tramos de cada tipo de contrato, agrupando los que coinciden: «nuevo y renovación: 12 carreras → 50 € · …». */
function tiersByContractLine(cfg) {
  const groups = new Map();
  for (const c of CONTRACTS) {
    const line = tiersLine(tiersFor(cfg, c.id));
    groups.set(line, [...(groups.get(line) || []), c.label.toLowerCase()]);
  }
  return [...groups].map(([line, names]) => `${names.join(' y ')}: ${line}`).join('<br>');
}

/** Frase con la situación: tramo actual, lo que falta y la penalización. */
const penaltiesLine = (cfg) => CONTRACTS.map((c) => `${c.label.toLowerCase()} ${euros({ ...cfg.penalty }[c.penalty] ?? 0)}`).join(' · ');

/** Recuadro muy visible del mínimo del contrato y su penalización. */
function penaltyAlert(st, cfg, year, { who = 'Te' } = {}) {
  const end = `${year}-12-31`, today = todayISO();
  const daysLeft = Math.max(0, Math.round((new Date(end + 'T12:00:00Z') - new Date(today + 'T12:00:00Z')) / 864e5));
  const closed = today > end;
  if (st.reachesMinimum) {
    return `<div class="pen ok">✅ <b>Mínimo del contrato cumplido</b> (${st.minimum} carreras): sin penalización.</div>`;
  }
  if (!st.penalty) {
    return `<div class="pen neutral">ℹ️ Mínimo del contrato: <b>${st.minimum} carreras</b> (${who.toLowerCase() === 'te' ? 'te' : 'le'} faltan ${st.missingToMinimum}).
      Con contrato de ${esc(contractLabel(st.contract).toLowerCase())} no hay penalización.</div>`;
  }
  return `<div class="pen bad-box">⚠️ <b>Mínimo del contrato: ${st.minimum} carreras.</b>
    ${who} faltan <b>${st.missingToMinimum}</b>. ${closed ? `Temporada cerrada: <b>penalización de ${euros(st.penalty)}</b>.`
      : `Si el 31 de diciembre no ${who === 'Te' ? 'llegas' : 'llega'}, <b>penalización de ${euros(st.penalty)}</b>${st.contract ? ` (${esc(contractLabel(st.contract).toLowerCase())})` : ''}.
    <br><small>Quedan ${daysLeft} días de temporada.</small>`}</div>`;
}

/** Saldo con el corredor: positivo = el club le debe; negativo = debe al club. */
const balanceText = (n) => (n > 0 ? `el club debe ${euros(n)}` : n < 0 ? `a favor del club ${euros(-n)}` : 'sin saldo');
const balanceLine = (r) => { const n = r.amount - r.penalty;
  return `<p class="saldo ${n > 0 ? 'pos' : n < 0 ? 'neg' : ''}">💶 Saldo: <b>${n > 0 ? `+${euros(n)}` : n < 0 ? `−${euros(-n)}` : euros(0)}</b> <span class="muted">(${balanceText(n)})</span></p>`; };

function bonusText(st, who = 'Llevas') {
  const parts = [`${who} <b>${st.count}</b> carrera${st.count === 1 ? '' : 's'}`];
  if (st.extra) parts.push(`<span class="extra-chip">🏆 +${st.extra} por podio de circuito = <b>${st.bonusCount}</b> para el bono</span>`);
  if (st.suspended) parts.push(`<span class="extra-chip">⛔ +${st.suspended} suspendida${st.suspended === 1 ? '' : 's'}: cuenta${st.suspended === 1 ? '' : 'n'} para el mínimo, no para el bono</span>`);
  if (st.tier) parts.push(`tramo de <b>${euros(st.amount)}</b>`);
  if (!st.reachesMinimum && st.penalty) parts.push(`<span class="bad">faltan ${st.missingToMinimum} para el mínimo (${st.minimum}) · penalización ${euros(st.penalty)}</span>`);
  else if (!st.reachesMinimum) parts.push(st.next ? `faltan ${st.missingToNext} para ${euros(st.next.amount)}` : `faltan ${st.missingToMinimum} para el mínimo (${st.minimum})`);
  else if (st.next) parts.push(`faltan ${st.missingToNext} para ${euros(st.next.amount)}`);
  else parts.push('tramo máximo');
  return parts.join(' · ');
}

function viewBonus() {
  const years = availableYears(S.data.races);
  if (!years.includes(S.year)) S.year = years[0];
  const cfg = bonusCfg(S.year);
  const rows = yearBonuses(S.year, S.data.races, S.data.registrations, S.data.runners, cfg, S.data.circuitPodiums || []);
  const totalPay = rows.reduce((n, r) => n + r.amount, 0);
  const totalPen = rows.reduce((n, r) => n + r.penalty, 0);
  const saved = !!S.data.settings?.bonus?.[S.year];
  return frame(`Bonos ${S.year}`, `
    ${yearPicker(years)}
    <div class="kpis">
      <div class="kpi"><b>${rows.filter((r) => r.tier).length}</b><span>con bono</span></div>
      <div class="kpi"><b>${euros(totalPay)}</b><span>en bonos ahora</span></div>
      <div class="kpi"><b>${rows.filter((r) => !r.reachesMinimum).length}</b><span>bajo el mínimo</span></div>
      <div class="kpi"><b>${euros(totalPen)}</b><span>penalizaciones si acabara hoy</span></div>
    </div>
    <div class="pen bad-box">⚠️ <b>Mínimo del contrato: ${cfg.minimum} carreras</b> antes del 31 de diciembre.
      Penalización si no se llega: ${penaltiesLine(cfg)}.</div>
    <p class="hint">Bonos a partir del mínimo — ${tiersByContractLine(cfg)}</p>
    <p class="hint">🏆 Un podio en la general final de un circuito suma +${cfg.circuitExtra ?? 4} carreras para el bono, pero no cuenta para el mínimo de ${cfg.minimum}. Una carrera suspendida cuenta para el mínimo, no para el bono.</p>
    <p class="hint">💶 <b>Saldo</b> = bono − penalización (si la temporada acabara hoy). El contrato permite descontar la penalización de lo que el club deba al corredor. Saldo total: <b>${balanceText(totalPay - totalPen)}</b>.</p>
    <p class="hint">Cuentan las carreras con resultados de ${S.year} y las ya disputadas en las que el corredor puso su puesto, aunque aún no las hayas pasado a resultados; una carrera de varios días cuenta un día cada uno. La parte clara de la barra suma las inscripciones de ${S.year} pendientes.</p>
    <ul class="bonus-list">${rows.map((r) => `<li>
      <div class="bonus-head"><span class="name">${esc(r.runner.name)}</span>
        ${contractSelect(`data-runner-contract="${r.runner.id}" aria-label="Tipo de contrato de ${esc(r.runner.name)}"`, r.runner.contract || (r.isNew ? 'nuevo' : ''))}</div>
      ${bonusBar(r, cfg, r.planned)}
      ${!r.reachesMinimum && r.penalty ? `<p class="pen-chip">⚠️ Penalización ${euros(r.penalty)} si no llega a ${r.minimum}</p>` : r.reachesMinimum ? '<p class="pen-chip ok">✅ Mínimo cumplido</p>' : ''}
      <p class="bonus-text">${bonusText(r, 'Lleva')}${r.planned ? ` · <span class="muted">con sus ${r.planned} inscrita${r.planned === 1 ? '' : 's'}: ${r.projected.bonusCount}</span>` : ''}</p>
      ${balanceLine(r)}
      ${r.circuits.length ? `<p class="hint">${r.circuits.map((c) => `${medal(c.position)} ${esc(c.circuit)}`).join(' · ')}</p>` : ''}
    </li>`).join('')}</ul>
    ${rows.length ? '' : '<p class="empty">No hay corredores.</p>'}
    ${adminCircuits(cfg)}
    <details class="card"${saved ? '' : ' open'}>
      <summary><b>Condiciones del bono ${S.year}</b>${saved ? '' : ' <span class="muted">(sin guardar: se usan las de la temporada anterior o las del contrato 2026)</span>'}</summary>
      <form class="stack" data-form="bonus-cfg">
        <p><b>Tramos de nuevo y renovación</b></p>
        ${tierInputs(tiersFor(cfg, 'renovacion'), '')}
        <p><b>Tramos de renovación sin licencia</b></p>
        ${tierInputs(tiersFor(cfg, 'renovacion_sin_licencia'), 'sl_')}
        <div class="grid2">
          <label>Mínimo del contrato<input type="number" min="0" name="minimum" value="${esc(cfg.minimum)}" required></label>
          <label>Carreras extra por podio de circuito<input type="number" min="0" name="circuit_extra" value="${esc(cfg.circuitExtra ?? 4)}" required></label>
          <label>Penalización renovación (€)<input type="number" min="0" name="pen_ren" value="${esc(cfg.penalty.renovado)}" required></label>
          <label>Penalización nuevos (€)<input type="number" min="0" name="pen_new" value="${esc(cfg.penalty.nuevo)}" required></label>
          <label>Penalización renovación sin licencia (€)<input type="number" min="0" name="pen_sl" value="${esc(cfg.penalty.sin_licencia ?? 0)}" required></label>
        </div>
        <p class="hint">Deja vacío un tramo para no usarlo.</p>
        <button class="btn primary">Guardar condiciones de ${S.year}</button>
      </form>
    </details>
    <button class="btn block" data-act="bonus-csv">Exportar bonos ${S.year} a CSV (Excel)</button>`, { back: '#/corredores' });
}

/** Dirección: podios en la general final de un circuito de la temporada (confirmar, añadir o borrar). */
function adminCircuits(cfg) {
  const all = S.data.circuitPodiums;
  if (!all) return `<p class="card warn">Para los podios de circuito (cláusula 9) falta ejecutar en Supabase <code>supabase/cambios/2026-11-12-circuitos-1.sql</code> y <code>…-2.sql</code>.</p>`;
  const list = all.filter((c) => c.year === S.year).sort((a, b) => a.circuit.localeCompare(b.circuit, 'es') || a.position - b.position);
  const per = cfg.circuitExtra ?? 4;
  return `<details class="card circ-card"${list.some((c) => c.status === 'pendiente') ? ' open' : ''}>
    <summary><b>🏆 Podios en la general final de un circuito (${list.length})</b></summary>
    <p class="hint">Cláusula 9: cada podio en la clasificación general final de un circuito completo (absoluta o de categoría) suma <b>+${per} carreras para el bono</b>. No cuentan para el mínimo.</p>
    ${list.length ? `<ul class="mini-list">${list.map((c) => `<li><div><b>${medal(c.position)} ${esc(runnerById(c.runner_id)?.name || '?')}</b>
      <small class="muted">${esc(c.circuit)} · ${c.position}º · ${scopeLabel(c.scope)}${c.by_runner ? ' · comunicado por el corredor' : ''}</small></div>
      <span class="row-btns">${c.status === 'pendiente' ? `<button class="btn small primary" data-act="circ-confirm" data-id="${c.id}">Confirmar</button>` : `<span class="extra-chip">+${per}</span>`}
      <button class="btn small danger ghost" data-act="circ-del" data-id="${c.id}" aria-label="Borrar">🗑️</button></span></li>`).join('')}</ul>` : '<p class="empty small">Ninguno todavía.</p>'}
    <form class="stack" data-form="circ-add">
      <label>Corredor<select name="runner" required><option value="">Elegir…</option>${[...S.data.runners].sort(byName).map((x) => opt(x.id, x.name)).join('')}</select></label>
      <label>Circuito<input name="circuit" list="dl-circuit" placeholder="Copa Aragón XCM" minlength="3" maxlength="120" required autocomplete="off"></label>${circuitList()}
      <div class="grid2">
        <label>Puesto final<select name="position"><option value="1">1º</option><option value="2">2º</option><option value="3">3º</option></select></label>
        <label>Clasificación<select name="scope">${CIRCUIT_SCOPES.map((x) => opt(x.id, x.label, 'categoria')).join('')}</select></label>
      </div>
      <button class="btn">Añadir podio de circuito ${S.year}</button>
    </form>
  </details>`;
}

function tierInputs(tiers, prefix) {
  return `<div class="tier-rows">${[0, 1, 2, 3].map((i) => { const t = tiers[i] || {};
    return `<label>Tramo ${i + 1}: carreras<input type="number" min="1" name="${prefix}r${i}" value="${esc(t.races ?? '')}"></label>
      <label>Importe (€)<input type="number" min="0" name="${prefix}a${i}" value="${esc(t.amount ?? '')}"></label>`; }).join('')}</div>`;
}

/** Lee los tramos de un formulario; devuelve un mensaje de error si están mal. */
function readTiers(f, prefix, label) {
  const tiers = [0, 1, 2, 3].map((i) => ({ races: Number(f[prefix + 'r' + i].value), amount: Number(f[prefix + 'a' + i].value) }))
    .filter((t) => t.races > 0);
  if (!tiers.length) return { error: `Pon al menos un tramo de ${label}.` };
  if (new Set(tiers.map((t) => t.races)).size !== tiers.length) return { error: `Hay dos tramos de ${label} con el mismo número de carreras.` };
  return { tiers: tiers.sort((a, b) => a.races - b.races) };
}

async function saveBonus(year, cfg) {
  const all = { ...(S.data.settings?.bonus || {}), [year]: cfg };
  await api.saveSetting('bonus', all);
  await reload();
}

/** Desplegable en la plantilla: carreras de un corredor en el año e inscripciones. */
function adminRunnerRaces(r, year) {
  const today = todayISO();
  const races = S.data.races.filter((x) => yearOf(x.date) === year && x.results.some((y) => y.runner_id === r.id))
    .sort((a, b) => b.date.localeCompare(a.date));
  const regs = S.data.registrations.filter((g) => g.entries.some((e) => e.runner_id === r.id)).sort((a, b) => a.date.localeCompare(b.date));
  const pending = regs.filter((g) => g.date < today && !g.suspended), upcoming = regs.filter((g) => g.date >= today || g.suspended);
  const days = races.reduce((n, x) => n + numDays(x.date, x.end_date), 0);
  const key = 'rr-' + r.id;
  const res = (x) => { const y = x.results.find((z) => z.runner_id === r.id);
    return y.position ? `${isPodium(y.position) ? medal(y.position) + ' ' : ''}${y.position}º` : '<span class="muted">sin puesto</span>'; };
  return `<details class="runner-races"${S.open?.[key] ? ' open' : ''} data-open-key="${key}">
    <summary>Carreras ${year}: <b>${races.length}</b>${days !== races.length ? ` (${days} días)` : ''} · apuntado a ${upcoming.length} próxima${upcoming.length === 1 ? '' : 's'}${pending.length ? ` · ${pending.length} ya disputada${pending.length === 1 ? '' : 's'} sin pasar a resultados` : ''}</summary>
    ${races.length ? `<ul class="mini-list">${races.map((x) => miniRow(x, `<a class="pos" href="#/carreras/${x.id}">${res(x)}</a>`)).join('')}</ul>` : `<p class="hint">Sin carreras con resultados en ${year}.</p>`}
    ${pending.length ? `<p class="hint"><b>Ya disputadas, aún sin pasar a resultados</b> (le cuentan para el bono si puso su puesto):</p><ul class="mini-list">${pending.map((g) => miniRow(g, `<a class="btn small" href="#/inscripciones/${g.id}">Abrir</a>`)).join('')}</ul>` : ''}
    ${upcoming.length ? `<p class="hint"><b>Próximas:</b></p><ul class="mini-list">${upcoming.map((g) => miniRow(g, `<a class="btn small" href="#/inscripciones/${g.id}">Abrir</a>`)).join('')}</ul>` : ''}
  </details>`;
}

// ======================================================================
//  Contratos y documentos de cada corredor
// ======================================================================

const MAX_DOC = 5_000_000;
const fmtSize = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

/** Lee un archivo en base64; las fotos grandes se reducen (máx. 2000 px, JPEG) para que quepan. */
async function fileToB64(file) {
  let blob = file, mime = file.type;
  if (/^image\//.test(mime) && file.size > 1_500_000) {
    const img = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(img.width, img.height));
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82)); mime = 'image/jpeg';
  }
  if (blob.size > MAX_DOC) throw new Error(`El archivo ocupa ${fmtSize(blob.size)}; el máximo es 5 MB.`);
  const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  return { b64, mime };
}

/** Abre un documento (base64) en otra pestaña o lo descarga. */
function openDoc({ filename, mime, b64 }) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener' });
  if (!/pdf|image/.test(mime)) a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const docIcon = (m) => (/pdf/.test(m) ? '📄' : '🖼️');

function viewDocs(runnerId) {
  const r = runnerById(runnerId);
  if (!r) return frame('Documentos', '<p class="empty">Este corredor no existe.</p>', { back: '#/corredores' });
  if (S.docs === null) return frame('Documentos', `<p class="card warn">Falta activar los documentos: ejecuta en Supabase el SQL
    <code>supabase/cambios/2026-11-11-contratos.sql</code>.</p>`, { back: '#/corredores' });
  const docs = (S.docs || []).filter((x) => x.runner_id === runnerId);
  const y = new Date().getFullYear();
  return frame(`Documentos de ${r.name}`, `
    <form class="card stack" data-form="doc-upload" data-runner="${r.id}">
      <h2>Subir contrato o documento</h2>
      <label class="btn file">📎 Elegir archivo (PDF o foto)<input type="file" name="file" accept="application/pdf,image/*" hidden required></label>
      <p class="hint" id="doc-chosen">Ningún archivo elegido. Máximo 5 MB; las fotos se reducen solas.</p>
      <div class="grid2">
        <label>Temporada<input type="number" name="year" value="${y}" min="2000" max="2100" required></label>
        <label>Título<input name="title" value="Contrato ${y}" maxlength="120"></label>
      </div>
      <button class="btn primary">Subir</button>
      <p class="hint">Solo lo verán ${esc(r.name)} (en la pestaña «Contrato») y la dirección.</p>
    </form>
    <h2 class="section">Documentos subidos (${docs.length})</h2>
    ${docs.length ? `<ul class="mini-list">${docs.map((x) => `<li><div><b>${docIcon(x.mime)} ${esc(x.title)}</b>
      <small class="muted">Temporada ${x.year} · ${esc(x.filename)} · ${fmtSize(x.size)}</small></div>
      <span class="row-btns"><button class="btn small" data-act="doc-open" data-id="${x.id}">Ver</button>
      <button class="btn small danger ghost" data-act="doc-del" data-id="${x.id}" aria-label="Borrar">🗑️</button></span></li>`).join('')}</ul>`
      : '<p class="empty">Todavía no hay documentos.</p>'}`, { back: '#/corredores' });
}

async function loadMyDocs() {
  try { S.myDocs = await api.runnerDocuments(S.code || S.previewCode); } catch { S.myDocs = null; }
  if (S.runnerData) render();
}

function myDocsCard() {
  const docs = S.myDocs;
  if (!docs) return '';
  return `<section class="card season-block docs-block">
    <h2>📄 Mi contrato y documentos</h2>
    ${docs.length ? `<ul class="mini-list">${docs.map((x) => `<li><div><b>${docIcon(x.mime)} ${esc(x.title)}</b>
      <small class="muted">Temporada ${x.year} · ${fmtSize(x.size)}</small></div>
      <button class="btn primary small" data-act="my-doc-open" data-id="${x.id}">Ver</button></li>`).join('')}</ul>`
      : '<p class="empty small">La dirección aún no ha subido tu contrato.</p>'}
  </section>`;
}

function viewRunners() {
  const counts = new Map();
  for (const r of S.data.races) for (const x of r.results) if (x.runner_id) counts.set(x.runner_id, (counts.get(x.runner_id) || 0) + 1);
  const runners = [...S.data.runners].sort(byName);
  const year = new Date().getFullYear();
  const bonusBy = new Map(yearBonuses(year, S.data.races, S.data.registrations, S.data.runners, bonusCfg(year), S.data.circuitPodiums || []).map((b) => [b.runner.id, b]));
  const badge = (b) => !b ? '' : `<small class="bbadge ${b.reachesMinimum ? (b.tier ? 'ok' : '') : 'bad'}">Bono ${year}: ${b.count}/${b.next ? b.next.races : b.count}${b.tier ? ` · ${euros(b.amount)}` : ''}${b.reachesMinimum ? '' : ' · bajo mínimo'}</small>`;
  return frame(`Corredores (${runners.length})`, `
    <a class="btn block" href="#/bonos">Bonos por carreras ${year}</a>
    <details class="card" ${runners.length ? '' : 'open'}>
      <summary><b>+ Añadir corredores</b></summary>
      <form class="stack" data-form="bulk">
        <p class="hint">Uno por línea. Categoría y contrato son opcionales: «Pere Soler, M40, renovación». Contratos: nuevo, renovación o renovación sin licencia. Los nombres repetidos se ignoran (sin importar mayúsculas ni tildes).</p>
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
      <div><span class="name">${esc(r.name)}${(S.docs || []).some((x) => x.runner_id === r.id && x.year === year) ? ' <a class="doc-badge" href="#/docs/' + r.id + '" title="Contrato ' + year + ' subido">📄</a>' : ''}</span><small class="muted">${counts.get(r.id) || 0} carreras en total</small>${badge(bonusBy.get(r.id))}</div>
      <div class="roster-sel">
        ${catSelect(`data-runner-cat="${r.id}" aria-label="Categoría habitual de ${esc(r.name)}"`, r.category || '')}
        ${contractSelect(`data-runner-contract="${r.id}" aria-label="Tipo de contrato de ${esc(r.name)}"`, r.contract || '')}
      </div>
      <button class="icon-btn" data-act="runner-menu" data-id="${r.id}" aria-label="Opciones de ${esc(r.name)}">⋯</button>
      ${adminRunnerRaces(r, year)}</li>`).join('')}</ul>
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
    country: cleanName(d.country), modality: d.modality, notes: String(d.notes || '').trim(),
    end_date: d.multi && d.end_date ? d.end_date : null,
    race_type: d.race_type || 'suelta', circuit: d.race_type === 'circuito' ? cleanName(d.circuit) : null,
    suspended: d.kind === 'reg' && !!d.suspended };
  if (!base.name) throw new Error('Falta el nombre de la carrera.');
  if (base.race_type === 'circuito' && !base.circuit) throw new Error('Falta el nombre del circuito.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base.date || '')) throw new Error('Falta la fecha.');
  if (d.multi && !base.end_date) throw new Error('Falta el último día de la carrera.');
  if (base.end_date && base.end_date <= base.date) throw new Error('El último día tiene que ser posterior al primero.');
  return base;
}

async function saveRegistrationDraft() {
  const d = S.draft;
  const id = await api.saveRegistration(draftPayload(), d.people.map((p) => ({ runner_id: p.runner_id, category: p.category || null })));
  await reload();
  return id;
}

/** Guarda el tipo de una carrera creada por el corredor (si ya existía y es de otro, no se toca). */
async function setMyRaceType(id, d) {
  if (!S.runnerData?.circuits) return; // base de datos sin el cambio de circuitos
  try { await api.runnerSetType(S.code, id, d.race_type || 'suelta', d.race_type === 'circuito' ? cleanName(d.circuit) : null); } catch (e) { console.warn(e); }
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
  async 'doc-open'(el) { const doc = await run(() => api.getDocument(el.dataset.id)); if (doc) openDoc(doc); },
  async 'my-doc-open'(el) { const doc = await run(() => api.runnerGetDocument(S.code || S.previewCode, el.dataset.id)); if (doc) openDoc(doc); },
  async 'doc-del'(el) {
    const x = (S.docs || []).find((y) => y.id === el.dataset.id);
    if (!await confirmAction('Borrar documento', `Se borrará «${esc(x?.title || '')}». El corredor dejará de verlo.`, 'Borrar')) return;
    await run(async () => { await api.deleteDocument(el.dataset.id); await reload(); }, 'Documento borrado'); render();
  },
  async 'r-delete-mine'() {
    const d = S.rdraft;
    if (!await confirmAction('Borrar carrera', `Se borrará «${esc(d.name)}» y tu inscripción en ella.`, 'Borrar')) return;
    const ok = await run(async () => { await api.runnerDelete(S.code, d.id); await loadRunner(); return true; }, 'Carrera borrada');
    if (ok) { S.rdraft = null; go('#/'); }
  },
  async 'r-new'() { S.rdraft = null; if (!S.fed) loadFed(); go('#/nueva'); },
  async 'r-new-fed'(el) {
    const r = S.fed.races[Number(el.dataset.i)];
    S.rdraft = emptyRunnerDraft({ name: r.name, date: r.date, place: r.place || '', province: r.province || '', country: r.country || DEFAULT_COUNTRY, modality: r.modality });
    go('#/nueva');
  },
  'fill-fed'(el) {
    const r = S.fed.races[Number(el.dataset.i)];
    const vals = { name: r.name, date: r.date, place: r.place || '', province: r.province || '', country: r.country || DEFAULT_COUNTRY, modality: r.modality };
    if (S.rdraft && parseRoute().view === 'nueva') Object.assign(S.rdraft, vals);
    else if (S.draft) Object.assign(S.draft, vals, { notes: S.draft.notes || `Federación ${FED_NAMES[r.source] || r.source}: ${r.url}` });
    render();
  },
  async 'r-join-go'(el) {
    const ok = await run(async () => { await api.runnerJoin(S.code, el.dataset.id, S.rdraft?.category || S.runnerData.me.category || null); await loadRunner(); return true; }, '¡Apuntado!');
    S.rdraft = null; go(ok && isPastReg(el.dataset.id) ? resultHref(el.dataset.id) : '#/');
  },
  async 'r-join'(el) {
    const cat = $app.querySelector(`[data-cat="${el.dataset.id}"]`)?.value || S.runnerData?.me?.category || null;
    const ok = await run(async () => { await api.runnerJoin(S.code, el.dataset.id, cat); await loadRunner(); return true; }, '¡Apuntado!');
    if (ok && isPastReg(el.dataset.id)) return go(resultHref(el.dataset.id));
    render();
  },
  // «La hice y no salgo»: añadirse a una carrera que ya está en resultados y poner el puesto
  async 'r-join-race'(el) {
    const ok = await run(async () => { await api.runnerJoinRace(S.code, el.dataset.id, S.rdraft?.category || S.runnerData.me.category || null); await loadRunner(); return true; }, 'Añadido: ahora pon tu resultado');
    if (!ok) return;
    S.rdraft = null; S.team = null; go(resultHref(el.dataset.id));
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
  'stages-n'(el) {
    const d = S.draft;
    if (Number(el.dataset.n) > 0) {
      if (d.stages.length >= 30) return;
      if (!d.stages.length) for (const p of d.people) if ((p.podium_type || 'suelta') === 'suelta') p.podium_type = 'general';
      d.stages.push(`Etapa ${d.stages.length + 1}`);
    } else {
      const j = d.stages.length - 1;
      if (j < 0) return;
      if (d.people.some((p) => p.stage_positions?.[j] !== '' && p.stage_positions?.[j] != null)
        && !confirm(`La etapa «${d.stages[j]}» tiene puestos anotados. ¿Quitarla igualmente?`)) return;
      d.stages.pop();
    }
    for (const p of d.people) p.stage_positions = d.stages.map((_, k) => p.stage_positions?.[k] ?? '');
    render();
  },
  'del-person'(el) { S.draft.people.splice(Number(el.dataset.i), 1); render(); },
  year(el) { S.year = Number(el.dataset.y); render(); },
  'my-year'(el) { S.myYear = Number(el.dataset.y); S.myOpen = true; render(); },
  'fed-source'(el) { fedFilter.source = el.dataset.v; render(); },
  'fed-create'(el) {
    const r = S.fed.races[Number(el.dataset.i)];
    S.prefill = { name: r.name, date: r.date, place: r.place || '', province: r.province || '', country: r.country || DEFAULT_COUNTRY,
      modality: r.modality, notes: `Federación ${FED_NAMES[r.source] || r.source}: ${r.url}` };
    go('#/inscripciones/nueva');
  },
  async 'insc-menu'() {
    const c = await choose('Más opciones', '', [
      { label: 'Carreras de las federaciones', value: 'fed', kind: 'primary' },
      { label: '📅 Próximas carreras (para redes)', value: 'week' },
      ...FED_CALENDARS.map((f, i) => ({ label: f.label + ' ↗', value: 'link' + i })),
    ]);
    if (c === 'fed') go('#/federaciones');
    else if (c === 'week') go('#/semana');
    else if (c?.startsWith('link')) window.open(FED_CALENDARS[Number(c.slice(4))].url, '_blank', 'noopener,noreferrer');
  },
  'reg-view'() {
    S.regView = S.regView === 'cal' ? 'list' : 'cal'; S.calDay = null; store.set(VIEW_KEY, S.regView);
    if (S.regView === 'cal' && S.runnerData && !S.team && (S.code || S.previewCode)) loadTeam();
    render();
  },
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
    if (raceId) {
      const set = postedSet(); // si ya estaba publicada, sigue estándolo al pasar a resultados
      if (S.draft?.id && set.has(S.draft.id)) { set.add(raceId); savePosted(set); }
      go('#/carreras/' + raceId);
    }
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
      { label: '📄 Contrato y documentos', value: 'docs' },
      { label: 'Ver su pantalla (vista previa)', value: 'preview' },
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
    } else if (choice === 'docs') {
      go('#/docs/' + r.id);
    } else if (choice === 'preview') {
      const view = await run(() => api.runnerView(r.code));
      if (!view) return;
      S.preview = { name: r.name, sqlOk: Array.isArray(view.my_results) }; S.previewCode = r.code;
      S.runnerData = view; S.myOpen = true; await loadNews();
      go('#/vista');
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
      const data = { corredor: { nombre: r.name, categoria: r.category, contrato: r.contract ? contractLabel(r.contract) : null, alta: r.created_at },
        resultados: races.map((x) => { const y = x.results.find((z) => z.runner_id === r.id);
          return { fecha: x.date, carrera: x.name, lugar: x.place, provincia: x.province, pais: x.country, modalidad: x.modality, categoria: y.category, puesto: y.position, tipo_podio: isPodium(y.position) ? podiumLabel(y.podium_type) : null,
            ...(x.stages?.length ? { etapas: x.stages.map((_, i) => ({ etapa: stageName(x, i), puesto: y.stage_positions?.[i] ?? null })) } : {}) }; }),
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
  'bonus-csv'() {
    const cfg = bonusCfg(S.year);
    const rows = yearBonuses(S.year, S.data.races, S.data.registrations, S.data.runners, cfg, S.data.circuitPodiums || []).map((r) => [
      r.runner.name, contractLabel(r.contract), r.count, r.extra, r.suspended, r.bonusCount, r.amount, r.reachesMinimum ? 'Sí' : 'No', r.penalty, r.amount - r.penalty,
      r.next ? r.next.races : '', r.next ? r.missingToNext : '', r.planned, r.projected.count]);
    download(`monzon-bonos-${S.year}.csv`, toCsv(rows, ['Corredor', 'Contrato', 'Carreras', 'Extra por circuitos', 'Suspendidas (solo mínimo)', 'Total para el bono', 'Bono actual (€)', 'Llega al mínimo',
      'Penalización (€)', 'Saldo (€, + el club debe)', 'Siguiente tramo', 'Faltan', 'Inscritas pendientes', 'Previsión']), 'text/csv;charset=utf-8');
  },
  'sum-mod'(el) { S.sumMod = el.dataset.m; render(); },
  'week-view'(el) { S.weekView = el.dataset.v; render(); },
  'week-all'() { const set = postedSet(), list = weekRaces(S.weekDays || 14); if (list.every((g) => set.has(g.id))) list.forEach((g) => set.delete(g.id)); else list.forEach((g) => set.add(g.id)); savePosted(set); render(); },
  'post-all'() { const set = postedSet(); for (const g of adminAlerts().week) set.add(g.id); savePosted(set); render(); },
  async 'alert-week-copy'() {
    const t = weekText(7, adminAlerts().weekTodo);
    try { await navigator.clipboard.writeText(t); toast('Texto copiado: pégalo en WhatsApp'); } catch { prompt('Copia el texto:', t); }
  },
  'alert-week-wa'() { window.open('https://wa.me/?text=' + encodeURIComponent(weekText(7, adminAlerts().weekTodo)), '_blank'); },
  'week-days'(el) { S.weekDays = Number(el.dataset.n) || 14; render(); },
  async 'week-copy'() {
    const t = weekText(S.weekDays || 14);
    try { await navigator.clipboard.writeText(t); toast('Texto copiado: pégalo en WhatsApp'); } catch { prompt('Copia el texto:', t); }
  },
  'week-wa'() { window.open('https://wa.me/?text=' + encodeURIComponent(weekText(S.weekDays || 14)), '_blank'); },
  'ann-edit'(el) { S.annEdit = el.dataset.id; render(); window.scrollTo(0, 0); },
  'ann-cancel'() { S.annEdit = null; render(); },
  async 'ann-del'(el) {
    if (!await confirmAction('Borrar noticia', 'Los corredores dejarán de verla.', 'Borrar')) return;
    await run(async () => { await api.deleteAnnouncement(el.dataset.id); await reload(); }, 'Noticia borrada');
    if (S.annEdit === el.dataset.id) S.annEdit = null;
    render();
  },
  async 'circ-confirm'(el) { await run(async () => { await api.confirmCircuitPodium(el.dataset.id); await reload(); }, 'Podio de circuito confirmado'); render(); },
  async 'circ-del'(el) {
    if (!await confirmAction('Quitar podio de circuito', 'Dejará de sumar carreras extra para el bono.', 'Quitar')) return;
    await run(async () => { await api.deleteCircuitPodium(el.dataset.id); await reload(); }, 'Quitado'); render();
  },
  async 'circ-cancel'(el) {
    if (!await confirmAction('Retirar', '¿Retirar este podio de circuito que comunicaste?', 'Retirar')) return;
    await run(async () => { await api.runnerCancelCircuit(S.code, el.dataset.id); await loadRunner(); }, 'Retirado'); render();
  },
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
    const conChanges = plan.keep.filter((k) => k.contract);
    const msg = `La plantilla quedará con <b>${total}</b> corredores.<br><br>` +
      `<b>Siguen (${plan.keep.length})</b>, con el mismo enlace${catChanges.length ? `; cambian de categoría: ${names(catChanges.map((k) => `${k.runner.name} → ${k.category}`))}` : ''}.<br><br>` +
      (conChanges.length ? `Cambian de contrato: ${names(conChanges.map((k) => `${k.runner.name} → ${contractLabel(k.contract)}`))}.<br><br>` : '') +
      `<b>Altas (${plan.add.length})</b>${plan.add.length ? ': ' + names(plan.add.map((a) => `${a.name} (${contractLabel(a.contract).toLowerCase()})`)) + '. Tendrás que enviarles su enlace.' : '.'}<br><br>` +
      `<b>Bajas (${plan.remove.length})</b>${plan.remove.length ? ': ' + names(plan.remove.map((r) => r.name)) + '. Su enlace deja de funcionar; sus resultados se conservan.' : '.'}` +
      (plan.unknownCategory.length ? `<br><br>⚠️ Categoría no reconocida (se deja como estaba): ${names(plan.unknownCategory.map((u) => `${u.name} («${u.text}»)`))}` : '') +
      (plan.remove.length > total / 2 ? '<br><br>⚠️ Se da de baja a más de la mitad. Comprueba que has pegado la lista completa.' : '');
    if (!await confirmAction('Renovar plantilla', msg, 'Aplicar cambios', 'primary')) return;
    const ok = await run(async () => {
      if (plan.add.length) await api.addRunners(plan.add);
      for (const k of catChanges) await api.updateRunner(k.runner.id, { category: k.category });
      for (const k of conChanges) await api.updateRunner(k.runner.id, { contract: k.contract });
      for (const r of plan.remove) await api.deleteRunner(r.id, false);
      await reload(); return true;
    }, 'Plantilla renovada');
    if (ok) { f.reset(); render(); }
  },
  async 'r-create'() {
    const d = S.rdraft;
    const name = cleanName(d.name);
    if (d.multi && !d.end_date) return toast('Falta el último día.', true);
    if (d.race_type === 'circuito' && !cleanName(d.circuit)) return toast('Falta el nombre del circuito.', true);
    if (d.id) { // editar una carrera propia
      const ok = await run(async () => {
        await api.runnerUpdate(S.code, d.id, { name, date: d.date, end_date: d.multi ? d.end_date : null, place: cleanName(d.place),
          province: cleanName(d.province), country: d.country, modality: d.modality, notes: d.notes || '' });
        await setMyRaceType(d.id, d);
        await loadRunner(); return true;
      }, 'Carrera actualizada');
      if (ok) { S.rdraft = null; go('#/'); }
      return;
    }
    // última comprobación: misma fecha y nombre parecido → ofrecer apuntarse a esa
    const same = searchRaces(name, S.runnerData.registrations.filter((g) => g.date === d.date))[0];
    if (same) {
      const choice = await choose('¿Es esta carrera?', `Ya hay <b>${esc(same.name)}</b> el mismo día (${esc(when(same))}).`, [
        { label: 'Sí, apuntarme a esa', value: 'join', kind: 'primary' }, { label: 'No, es otra: crearla', value: 'create' }]);
      if (!choice) return;
      if (choice === 'join') return actions['r-join-go']({ dataset: { id: same.id } });
    }
    const past = d.date < todayISO();
    const id = await run(async () => {
      const newId = await api.runnerCreate(S.code, { name, date: d.date, end_date: d.multi ? d.end_date : null, place: cleanName(d.place),
        province: cleanName(d.province), country: d.country, modality: d.modality }, d.category || null);
      if (newId && d.race_type && d.race_type !== 'suelta') await setMyRaceType(newId, d);
      await loadRunner(); return newId || true;
    }, past ? 'Carrera añadida: ahora pon tu resultado' : 'Carrera añadida y te has apuntado');
    if (id) { S.rdraft = null; S.q.runner = ''; go(past ? resultHref(id) : '#/'); }
  },
  async 'r-report'(f) {
    const position = Number(f.position.value);
    if (!Number.isInteger(position) || position < 1) return toast('Pon un puesto válido (1, 2, 3…).', true);
    const cat = f.category.value || null, pod = f.podium.value;
    const txt = `${position}º${cat ? ' en ' + cat : ''}${position <= 3 ? ` · ${podiumLabel(pod)}` : ''}`;
    if (!await confirmAction('Enviar resultado', `Vas a enviar: <b>${esc(txt)}</b>.<br>Después no podrás cambiarlo.`, 'Enviar', 'primary')) return;
    const ok = await run(async () => { await api.runnerReport(S.code, f.dataset.kind, f.dataset.id, position, cat, pod); await loadRunner(); return true; },
      position <= 3 ? `${medal(position)} ¡Enhorabuena! Resultado enviado` : 'Resultado enviado');
    if (ok) go(runnerHref('mi'));
  },
  async 'doc-upload'(f) {
    const file = f.file.files?.[0];
    if (!file) return toast('Elige un archivo.', true);
    if (!/^(application\/pdf|image\/)/.test(file.type)) return toast('Solo PDF o fotos (JPG, PNG, WEBP).', true);
    const ok = await run(async () => {
      const { b64, mime } = await fileToB64(file);
      await api.uploadDocument(f.dataset.runner, Number(f.year.value), f.title.value.trim(), file.name, mime, b64);
      await reload(); return true;
    }, 'Documento subido');
    if (ok) render();
  },
  async 'ann-save'(f) {
    const title = cleanName(f.title.value);
    if (title.length < 3) return toast('Pon un título de al menos 3 letras.', true);
    const ok = await run(async () => { await api.saveAnnouncement({ id: S.annEdit, title, body: f.body.value.trim(), expires_at: f.expires_at.value || null }); await reload(); return true; },
      S.annEdit ? 'Noticia guardada' : 'Noticia publicada: ya la ven los corredores');
    if (ok) { S.annEdit = null; render(); window.scrollTo(0, 0); }
  },
  async 'circ-propose'(f) {
    const name = cleanName(f.circuit.value);
    if (name.length < 3) return toast('Escribe el nombre del circuito.', true);
    const ok = await run(async () => { await api.runnerProposeCircuit(S.code, name, Number(f.year.value), Number(f.position.value), f.scope.value); await loadRunner(); return true; },
      'Enviado: la dirección tiene que confirmarlo');
    if (ok) render();
  },
  async 'circ-add'(f) {
    const name = cleanName(f.circuit.value);
    if (!f.runner.value || name.length < 3) return toast('Elige el corredor y escribe el circuito.', true);
    await run(async () => { await api.saveCircuitPodium({ runner_id: f.runner.value, year: S.year, circuit: name, position: Number(f.position.value), scope: f.scope.value, status: 'confirmado' }); await reload(); },
      'Podio de circuito añadido');
    render();
  },
  async 'bonus-cfg'(f) {
    const main = readTiers(f, '', 'nuevo y renovación');
    if (main.error) return toast(main.error, true);
    const sl = readTiers(f, 'sl_', 'renovación sin licencia');
    if (sl.error) return toast(sl.error, true);
    const cfg = { ...bonusCfg(S.year), tiers: main.tiers, tiersByContract: { renovacion_sin_licencia: sl.tiers }, minimum: Number(f.minimum.value), circuitExtra: Number(f.circuit_extra.value),
      penalty: { renovado: Number(f.pen_ren.value), nuevo: Number(f.pen_new.value), sin_licencia: Number(f.pen_sl.value) } };
    await run(() => saveBonus(S.year, cfg), `Condiciones de ${S.year} guardadas`);
    render();
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
        const stage_positions = d.stages.map((n, j) => {
          const v = p.stage_positions?.[j];
          if (v === '' || v == null) return null;
          const k = Number(v);
          if (!Number.isInteger(k) || k < 1) throw new Error(`Puesto no válido para ${p.runner_name} en ${n}.`);
          return k;
        });
        return { runner_id: p.runner_id, runner_name: p.runner_name, category: p.category || null, position,
          podium_type: isPodium(position) ? p.podium_type || 'suelta' : 'suelta',
          stage_positions: stage_positions.some((x) => x !== null) ? stage_positions : null,
          self_reported: !!p.self_reported && String(p.position) === String(p.origPosition) };
      });
      race.stages = d.stages.length ? d.stages.map((n, j) => cleanName(n) || `Etapa ${j + 1}`) : null;
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

// Al volver a la app (desde el fondo), se mira si hay noticias nuevas y se actualiza solo la campanita.
let lastNewsCheck = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || S.session?.isAdmin || !S.code || !S.runnerData || Date.now() - lastNewsCheck < 60000) return;
  lastNewsCheck = Date.now();
  await loadNews();
  const bell = $app.querySelector('.news-bell');
  if (bell && parseRoute().view !== 'noticias') bell.outerHTML = newsBell();
});

// ---------- eventos (delegados) ----------

const RUNNER_ACTIONS = new Set(['r-join', 'r-leave', 'r-new', 'r-new-fed', 'r-forget', 'r-refresh', 'r-join-go', 'r-delete-mine', 'r-join-race', 'circ-cancel']);
$app.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || !actions[el.dataset.act]) return;
  ev.preventDefault();
  if (S.preview && parseRoute().view === 'vista' && RUNNER_ACTIONS.has(el.dataset.act)) {
    toast('Vista previa: aquí no se puede apuntar ni cambiar nada.', true); return;
  }
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
  if (t.dataset.search) {
    S.q[t.dataset.search] = t.value;
    if (t.dataset.search === 'runner' && !S.fed) loadFed().then(() => updateSearch('runner'));
    updateSearch(t.dataset.search);
    return;
  }
  if (t.dataset.rf && S.rdraft) {
    S.rdraft[t.dataset.rf] = t.value;
    if (t.dataset.rf === 'name') updateSearch('rname');
    return;
  }
  if (!S.draft) return;
  if (S.draft.kind === 'reg' && !S.draft.id && t.dataset.f === 'name') {
    S.draft.name = t.value;
    if (!S.fed) loadFed();
    const box = $app.querySelector('#dup-admin');
    if (box) box.innerHTML = dupSuggestions(t.value, S.data.registrations, false);
  }
  if (t.dataset.f) S.draft[t.dataset.f] = t.value;
  if (t.dataset.stage) {
    S.draft.stages[Number(t.dataset.stage)] = t.value;
    for (const el of $app.querySelectorAll(`[data-stage-label="${t.dataset.stage}"]`)) el.textContent = t.value || `Etapa ${Number(t.dataset.stage) + 1}`;
  }
  if (t.dataset.sp) {
    const p = S.draft.people[Number(t.dataset.p)];
    p.stage_positions = p.stage_positions || [];
    p.stage_positions[Number(t.dataset.sp)] = t.value;
  }
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
  if ('retype' in t.dataset) { // cambia el tipo de carrera: mostrar u ocultar el nombre del circuito
    const d = t.dataset.rf ? S.rdraft : S.draft;
    if (d) { d.race_type = t.value; render(); $app.querySelector('[list="dl-circuit"]')?.focus(); }
    return;
  }
  if ('rfMulti' in t.dataset && S.rdraft) {
    S.rdraft.multi = t.checked; if (!t.checked) S.rdraft.end_date = ''; render(); return;
  }
  if (t.dataset.actChange === 'post') { const set = postedSet(); if (t.checked) set.add(t.dataset.id); else set.delete(t.dataset.id); savePosted(set); render(); return; }
  if (t.dataset.actChange === 'suspended' && S.draft) { S.draft.suspended = t.checked; render(); return; }
  if (t.dataset.actChange === 'multi') {
    S.draft.multi = t.checked;
    if (!t.checked) S.draft.end_date = '';
    render();
    $app.querySelector('[data-f="end_date"]')?.focus();
  } else if (t.dataset.actChange === 'add-person' && t.value) {
    const r = runnerById(t.value);
    S.draft.people.push({ runner_id: r.id, runner_name: r.name, category: r.category || '', position: '',
      podium_type: S.draft.race_type === 'campeonato' ? 'campeonato' : S.draft.stages?.length ? 'general' : 'suelta', stage_positions: (S.draft.stages || []).map(() => '') });
    render();
    $app.querySelector('.edit-list li:last-child')?.scrollIntoView({ block: 'center' });
  } else if (t.dataset.fed) {
    fedFilter[t.dataset.fed] = t.type === 'checkbox' ? t.checked : t.value; render();
  } else if (t.dataset.runnerContract) {
    const id = t.dataset.runnerContract;
    await run(async () => { await api.updateRunner(id, { contract: t.value || null }); runnerById(id).contract = t.value || null; }, 'Contrato guardado');
    if (parseRoute().view === 'bonos') render();
  } else if (t.dataset.runnerCat) {
    const id = t.dataset.runnerCat;
    await run(async () => { await api.updateRunner(id, { category: t.value || null }); runnerById(id).category = t.value || null; }, 'Categoría guardada');
  } else if (t.name === 'file' && t.closest('[data-form="doc-upload"]')) {
    const f = t.files?.[0]; const p = $app.querySelector('#doc-chosen');
    if (p && f) p.textContent = `Elegido: ${f.name} (${fmtSize(f.size)})`;
  } else if (t.dataset.file && t.files?.[0]) {
    const file = t.files[0]; t.value = '';
    await fileHandlers[t.dataset.file](file);
  }
});

// Recordar si un desplegable estaba abierto (p. ej. «Mis carreras») al volver a pintar la pantalla.
$app.addEventListener('toggle', (ev) => {
  const k = ev.target.dataset?.toggleKey; if (k) S[k] = ev.target.open;
  const o = ev.target.dataset?.openKey; if (o) (S.open ||= {})[o] = ev.target.open;
}, true);
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
