// Pantallas de la app. Sin dependencias ni paso de compilación: se sirve tal cual.
import { CONFIG } from './config.js';
import { supabaseApi, demoApi, friendlyError, cleanWeb } from './api.js';
import {
  CATEGORIES, MODALITIES, PODIUM_TYPES, RACE_TYPES, CIRCUIT_SCOPES, SUBTYPES, disciplineKey, parseKm, kmText, socialAudit, resKeyOf, parseStoryLog, storyState, storyDateOf, daysTo, daysToText, icsEvent, parseTime, formatTime, seasonByRunner, seasonStats, seasonDetail, SEASON_COLUMNS, SEASON_BONUS_COLUMNS, SEASON_DETAIL_COLUMNS, guessSubtype, missingFields, PROVINCES, DEFAULT_COUNTRY, podiumLabel, normalize, cleanName, stageName, podiumsOf,
  teamMoves, parseBulkRunners, planRosterRenewal, isPodium, yearOf, availableYears, yearSummary, csvRows, toCsv, importResultsCsv,
  directorBoard, raceImpact, alDia, tierRanges, nextTeamRace, igLastUpdate, avgSpeed, postKeyOf, groupMessage, watchInfo, sortWatch, watchTbc, nextYearWatch, projectLeagueRaces, WATCH_TBC, watchMatch, parseElev, parsePrice, elevText, SOFT_GAPS, modalityTree, subLabel, fullLabel, yearInsights, WEEKDAYS, seenDays, seenText, seenLevel, extractCode, newCode, todayISO, pastLimit, formatDate, searchRaces, matchPeople, cleanGoogleLink, CONTRACTS, contractLabel, bonusConfigFor, bonusStatus, tiersFor, yearBonuses, MONTH_NAMES, igSummary, igPrevTotals, igPeriods, igHeadline, uspacShift, USPAC_GROUPS, USPAC_NAMES, socialBoard, chronicleStatus, monthGrid, addMonths, formatRange, daysOf, numDays,
} from './logic.js';

const CODE_KEY = 'monzon-code';
import { FEDERACIONES, ORDEN_FEDERACIONES } from './seguros.js';
import { ENLACES_CONTRATO } from './enlaces.js';
import { ORIGEN, FACTOR_CARRETERA, distanceKm, placeCoords, geoKey, pickGeocode } from './viajes.js';
import { VERSION } from './version.js';
const VIEW_KEY = 'monzon-regview';
const FED_KEY = 'monzon-federacion';
const MOD_KEY = 'monzon-modfilter';
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

/** Aspecto: automático (el del sistema), claro u oscuro. Lo elige cada persona en su móvil. */
const THEME_KEY = 'monzon-theme';
const getTheme = () => (['light', 'dark'].includes(store.get(THEME_KEY)) ? store.get(THEME_KEY) : 'auto');
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'dark' || (t === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) ? '#0e151a' : '#284556';
}
applyTheme(getTheme());
/** Menú de perfil (toca el logo de arriba a la izquierda): aspecto, turnos (si la dirección lo habilitó) y «No soy…». */
const themeButtons = () => [['auto', '🌓 Automático'], ['light', '☀️ Claro'], ['dark', '🌙 Oscuro']].map(([v, l]) => `<button type="button" class="chip${getTheme() === v ? ' on' : ''}" data-prof="theme" data-t="${v}" aria-pressed="${getTheme() === v}">${l}</button>`).join('');
function profileHtml() {
  const me = S.runnerData?.me;
  return `<form method="dialog" class="dlg profile"><h2>${avatar(me?.name || '')}<span>${esc(me?.name || 'Mi perfil')}</span></h2>
    <h3>Aspecto de la app</h3><div class="years">${themeButtons()}</div>
    ${S.shiftOn ? `<h3>Mis turnos de trabajo <small class="muted">(opcional)</small></h3>
      <label class="sp-row">Mi escamot<select data-prof="shift" aria-label="Mi escamot"><option value="">Sin turnos</option>${USPAC_GROUPS.map((g) => `<option value="${g}"${S.myShift === g ? ' selected' : ''}>Escamot ${g.slice(1)}</option>`).join('')}</select></label>
      <p class="hint" data-nofold>Verás tus turnos (M, T, N, F…) en el calendario de Carreras. Solo los ves tú.</p>` : ''}
    <p class="muted center small">Versión de la app: <b>${esc(VERSION)}</b></p>
    <div class="dlg-actions"><button type="button" class="btn danger" data-prof="forget">No soy ${esc(me?.name || 'esta persona')}</button><button value="" class="btn primary">Cerrar</button></div></form>`;
}
function openProfile() { const dlg = document.getElementById('dialog'); dlg.innerHTML = profileHtml(); if (!dlg.open) dlg.showModal(); }
{
  const dlg = document.getElementById('dialog');
  dlg.addEventListener('click', async (ev) => {
    const b = ev.target.closest('.profile [data-prof]'); if (!b) return;
    if (b.dataset.prof === 'theme') { ev.preventDefault(); store.set(THEME_KEY, b.dataset.t); applyTheme(b.dataset.t); dlg.innerHTML = profileHtml(); render(); }
    else if (b.dataset.prof === 'forget') { ev.preventDefault(); dlg.close(); await actions['r-forget'](); }
  });
  dlg.addEventListener('change', async (ev) => {
    const t = ev.target.closest('.profile select[data-prof="shift"]'); if (!t) return;
    await run(async () => { await api.runnerSetMyShift(S.code, t.value); S.myShift = t.value || null; }, t.value ? 'Escamot guardado' : 'Turnos quitados');
    dlg.innerHTML = profileHtml(); render();
  });
}
const themeLineIfPreview = () => (S.preview ? themeLine() : '');
const themeLine = () => `<div class="theme-line"><span class="muted">Aspecto de la app:</span><div class="years">${[['auto', '🌓 Automático'], ['light', '☀️ Claro'], ['dark', '🌙 Oscuro']].map(([v, l]) =>
  `<button class="chip${getTheme() === v ? ' on' : ''}" data-act="theme" data-t="${v}" aria-pressed="${getTheme() === v}">${l}</button>`).join('')}</div>
  ${getTheme() === 'auto' ? '<small class="muted">Automático sigue el modo claro u oscuro de tu móvil.</small>' : ''}</div>`;

const api = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY && window.supabase
  ? supabaseApi(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY) : demoApi();

const NEWS_KEY = 'monzon-news-seen';
const POSTED_KEY = 'monzon-posted'; // marcas de «publicada» si aún falta el SQL de redes (en este móvil)
const SOCIAL_KEY = 'monzon-social';  // enlace propio del encargado de redes (en su móvil)
const BACKUP_KEY = 'monzon-backup-data', BACKUP_DOCS_KEY = 'monzon-backup-docs', BACKUP_SNOOZE_KEY = 'monzon-backup-snooze'; // fechas de las últimas copias (en este móvil)
const S = {
  session: null, code: store.get(CODE_KEY), news: null, newsFresh: new Set(),
  data: null, runnerData: null,
  year: new Date().getFullYear(), draft: null, busy: false, showPast: false, installEvt: null,
  fedSeguro: FEDERACIONES[store.get(FED_KEY)] ? store.get(FED_KEY) : null, mod: store.get(MOD_KEY) || 'all', sub: 'all', who: 'all', fsub: 'all', kind: 'all', fold: new Set(), regView: store.get(VIEW_KEY) === 'cal' ? 'cal' : 'list', calMonth: null, calDay: null,
  q: { runner: '', admin: '', rlist: '' }, rdraft: null,
};

const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const opt = (value, label, sel) => `<option value="${esc(value)}"${value === sel ? ' selected' : ''}>${esc(label)}</option>`;
/** Clase de color de una modalidad: «m-carretera», «m-btt»… (colores en css/app.css). */
const modClass = (m) => 'm-' + normalize(m || 'Otra').replace(/[^a-z]/g, '');
/** «Editar ›» visible en las tarjetas de carrera que se abren para editar (dirección). */
const editCta = () => `<span class="edit-cta">${ico('pen')}Editar${ico('go')}</span>`;
/** Etiqueta de modalidad con su formato: «BTT · XCO», «Carretera · Critérium»… */
const modTag = (m, sub) => `<span class="tag ${modClass(m)}">${esc(m)}${sub ? ` · <b>${esc(sub)}</b>` : ''}</span>`;
/** Clase de color de una disciplina (modalidad + formato): «d-btt-xco». */
const slug = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const discClass = (m, sub) => `d-${slug(m)}-${slug(sub) || 'sin'}`;
/** Nombre corto de una disciplina: «XCO»; si el formato no la identifica sola, «BTT · Otra». */
/** Tiempo para escribir desde el móvil: tres casillas numéricas (h · min · s), sin dos puntos. El valor se guarda en un campo oculto como «h:mm:ss». */
const timeFields = (value, hiddenAttrs) => {
  const sec = value ? (typeof value === 'number' ? value : parseTime(value)) : null;
  const h = sec ? Math.floor(sec / 3600) : '', m = sec ? Math.floor((sec % 3600) / 60) : '', x = sec ? sec % 60 : 0;
  const part = (k, v, lab, max, ml) => `<label class="tf-p"><input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="${ml}" data-tpart="${k}" data-max="${max}" value="${v === '' ? '' : v}" placeholder="0" aria-label="${lab}"><span>${lab}</span></label>`;
  return `<span class="tinput" data-sec="${x}" role="group" aria-label="Tiempo: horas y minutos">${part('h', h, 'horas', 99, 2)}<b>:</b>${part('m', m, 'min', 59, 2)}<input type="hidden" ${hiddenAttrs} data-tvalue value="${sec ? esc(formatTime(sec)) : ''}"></span>`;
};
const discLabel = (m, sub) => (!sub ? (SUBTYPES[m] ? `${m} · sin formato` : m) : sub === 'Otra' ? `${m} · Otra` : sub);
const modText = (x) => [x.modality, x.subtype].filter(Boolean).join(' · ');
const modLegend = (mods) => `<div class="mod-legend">${MODALITIES.filter((m) => !mods || mods.includes(m))
  .map((m) => `<span class="${modClass(m)}"><i></i>${esc(m)}</span>`).join('')}</div>`;
/** Texto de una noticia: escapado, con enlaces pulsables y saltos de línea. */
const newsText = (t) => esc(t).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`).replace(/\n/g, '<br>');
const newsSeen = () => { try { return new Set(JSON.parse(store.get(NEWS_KEY) || '[]')); } catch { return new Set(); } };
/** Noticias que este móvil aún no ha abierto (en la vista previa de la dirección no cuenta ninguna). */
const unreadNews = () => (S.preview || !S.news ? [] : S.news.filter((n) => !newsSeen().has(n.id) || (n.rsvp && !n.my_answer)));
const markNewsSeen = () => { if (S.preview || !S.news) return; store.set(NEWS_KEY, JSON.stringify([...new Set([...newsSeen(), ...S.news.map((n) => n.id)])].slice(-200))); };
/** Carga las noticias del corredor (null si aún falta el SQL: entonces no hay campanita). */
async function loadNews() {
  try { S.news = await api.runnerNews(S.code || S.previewCode); } catch { S.news = null; }
}
/** Sus peticiones de corrección de puesto (null si aún falta el SQL). */
async function loadCorrections() {
  try { S.corrections = await api.runnerCorrections(S.code || S.previewCode); } catch { S.corrections = null; }
}
/** Campanita de los corredores: noticias nuevas de la dirección. */
function newsBell() {
  if (!S.news) return '';
  const n = unreadNews().length;
  return `<a class="icon-btn bell news-bell${n ? ' on' : ''}" href="${runnerHref('noticias')}" aria-label="Noticias del club${n ? `: ${n} nueva${n === 1 ? '' : 's'}` : ''}" title="Noticias del club">${icon(ICON_BELL)}${n ? `<span class="bell-n">${n}</span>` : ''}</a>`;
}
/** Etiqueta del tipo de carrera (campeonato o circuito). */
const typeTag = (x) => {
  const chips = [];
  if (x.race_type === 'campeonato') chips.push(`<span class="tag t-champ">${ico('trophy', 't-i')}Campeonato</span>`);
  else if (x.race_type === 'circuito') chips.push(`<span class="tag t-circ">${ico('link', 't-i')}${esc(x.circuit || 'Circuito')}</span>`);
  return chips.length ? `<p class="type-line">${chips.join('')}</p>` : '';
};
/** Campos «Disciplina» (según la modalidad: obligatoria en BTT y Carretera) y «Distancia» de los formularios. `attr` = data-f (dirección) o data-rf (corredor). */
/** Sección numerada de un formulario (cabecera de color con icono) para que se encuentre cada cosa de un vistazo. */
/** Sección plegable de un formulario: título con su resumen a la derecha; se abre al tocar (y recuerda si estaba abierta). */
const fsecD = (key, n, icon, title, preview, body, color, openDefault = false) => `<details class="fsec fsec-d" style="--sc:${color}" data-open-key="${key}"${S.open?.[key] ? ' open' : ''}><summary class="fsec-h"><span class="fsec-n">${n}</span>${ico(icon)}<span class="fsec-tx"><span class="fsec-t">${title}</span><span class="fsec-p">${preview ? esc(preview) : ''}</span></span>${ico('chevd', 'fsec-chev')}</summary><div class="fsec-b">${body}</div></details>`;
/** Resumen de una línea de cada sección del formulario de carrera (lo que se ve con la sección plegada). */
const racePreview = (d) => [
  d.name,
  [d.date ? formatDate(d.date) : '', d.place || d.province].filter(Boolean).join(' · '),
  [d.modality, d.subtype, d.km ? kmText(d.km) : ''].filter(Boolean).join(' · '),
  [d.elevation ? elevText(d.elevation) : '', d.price !== '' && d.price != null ? (Number(d.price) === 0 ? 'Gratis' : `${d.price} €`) : '', d.url ? 'con web' : ''].filter(Boolean).join(' · '),
];
const fsec = (n, icon, title, body, color = '#1f6fd1') => `<section class="fsec" style="--sc:${color}"><h3 class="fsec-h"><span class="fsec-n">${n}</span>${ico(icon)}<span>${title}</span></h3><div class="fsec-b">${body}</div></section>`;
/** Fichas para elegir una opción (en vez de un desplegable): un toque y queda marcada. Son «radio» ocultos, así que todo lo demás funciona igual. */
const radioChips = (attr, field, options, cur, { required = false, extra = '' } = {}) => `<div class="chips-pick" role="radiogroup">${options.map(([v, l, cls = '', extra = '']) =>
  `<label class="cpick ${cls}"><input type="radio" name="${attr.replace('data-', '')}-${field}" ${attr}="${field}" value="${esc(v)}"${v === (cur ?? '') ? ' checked' : ''}${required ? ' required' : ''}${extra}><span>${l}</span></label>`).join('')}</div>`;
const modalityChips = (d, attr) => radioChips(attr, 'modality', MODALITIES.map((m) => [m, `${MOD_ICON[m] || '🏁'} ${esc(m)}`, modClass(m)]), d.modality);
const RACE_TYPE_SHORT = { suelta: 'Carrera normal', campeonato: 'Campeonato', circuito: 'De un circuito (Copa, Open…)' };
const detailInputs = (d, attr) => `${SUBTYPES[d.modality] ? `<div class="disc-field"><span class="flabel">Disciplina de ${esc(d.modality)} <b class="req">obligatoria</b></span>${radioChips(attr, 'subtype', SUBTYPES[d.modality].map((x) => [x, esc(x)]), d.subtype, { required: true })}
      <small class="hint">Así el resumen y los gráficos del equipo reparten las carreras por disciplina.</small></div>` : ''}
    <label class="flabel-l">Distancia (km)<input type="number" inputmode="decimal" step="0.1" min="0.1" max="1000" ${attr}="km" value="${esc(d.km ?? '')}" placeholder="85"></label>`;
/** Nombres de circuitos ya usados (para sugerirlos y no escribirlos de dos maneras). */
function circuitNames() {
  const src = S.data && !S.preview ? [...S.data.races, ...S.data.registrations, ...(S.data.circuitPodiums || [])]
    : [...(S.runnerData?.registrations || []), ...(S.runnerData?.my_results || []), ...(S.runnerData?.circuits || []), ...(Array.isArray(S.team?.races) ? S.team.races : [])];
  const seen = new Map();
  for (const x of [...src, ...(S.fed?.races || [])]) { const c = String(x.circuit || '').trim(); if (c && !seen.has(normalize(c))) seen.set(normalize(c), c); }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'es'));
}
const circuitList = () => `<datalist id="dl-circuit">${circuitNames().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`;
/** Campos «Tipo de carrera» de los formularios. `attr` = data-f (dirección) o data-rf (corredor). */
const typeFields = (d, attr) => `
    <div class="disc-field"><span class="flabel">Tipo de carrera</span>${radioChips(attr, 'race_type', RACE_TYPES.map((t) => [t.id, esc(RACE_TYPE_SHORT[t.id] || t.label)]), d.race_type || 'suelta', { extra: ' data-retype' })}</div>
    ${d.race_type === 'circuito' ? `<label>Nombre del circuito<input ${attr}="circuit" list="dl-circuit" value="${esc(d.circuit || '')}" placeholder="Copa Aragón XCM" maxlength="120" required autocomplete="off"></label>${circuitList()}
      <p class="hint">Escríbelo igual en todas sus pruebas. El podio en la <b>general final</b> de la liga da el <b>plus de bonificación</b> (carreras extra para la bonificación, no para el mínimo).</p>` : ''}
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
const place = (x) => [...new Set([x.place, x.province, x.country && x.country !== DEFAULT_COUNTRY ? x.country : ''].filter(Boolean))].join(' · ');

// ---------- Casilla de carrera: la misma en toda la app (fecha en cajita, nombre, datos clave y cuenta atrás) ----------
const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const raceDays = (x) => (x.end_date && x.end_date > x.date ? numDays(x.date, x.end_date) : 0);
/** Cajita con el día y el mes (color de la disciplina); con ✓ verde si participas o estás inscrito. */
const raceTile = (x, { mine = false } = {}) => { const dt = new Date(`${x.date}T12:00:00Z`), n = raceDays(x);
  return `<span class="rc-date ${modClass(x.modality)}${mine ? ' mine' : ''}" aria-hidden="true"><b>${dt.getUTCDate()}</b><i>${MES3[dt.getUTCMonth()]}</i>${n ? `<small>${n} días</small>` : ''}${mine ? `<em class="rc-tick">${ico('check')}</em>` : ''}</span>${mine ? '<span class="sr-only">Participas. </span>' : ''}`; };
const raceSub = (x) => { const wd = new Date(`${x.date}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
  return `${raceDays(x) ? when(x) : wd}${place(x) ? ' · ' + place(x) : ''}`; };
/** Disciplina (en su color), km, desnivel y precio: lo que falte se omite. */
const raceMeta = (x) => [`<span class="rc-dis">${esc(x.modality === 'Otra' ? 'Carrera' : x.modality)}${x.subtype && x.subtype !== 'Otra' ? ' · ' + esc(x.subtype) : ''}</span>`, x.km ? esc(kmText(x.km)) : '', x.elevation ? esc(elevText(x.elevation)) : '',
  x.price !== null && x.price !== undefined && x.price !== '' ? (Number(x.price) === 0 ? 'Gratis' : esc(euros(x.price))) : ''].filter(Boolean).map((y) => `<span class="rc-mi">${y}</span>`).join(' ');
/** Cuenta atrás con color: rojo hasta 7 días, ámbar hasta 30. Solo para carreras que aún no se han corrido. */
const raceCd = (x, today = todayISO()) => { if (x.suspended || x.date < today) return ''; const n = daysTo(x.date);
  return `<span class="rc-cd${n <= 7 ? ' now' : n <= 30 ? ' soon' : ''}">${n <= 0 ? 'hoy' : n === 1 ? 'mañana' : n < 100 ? `en ${n} d` : `en ${Math.round(n / 30)} m`}</span>`; };
/** Cabecera de una casilla de carrera (se usa en todas las listas). */
/** Nombres con una palabra muy larga (MEGATAMPANADA): se achican un punto en vez de partirse a mitad de palabra. */
const nameFit = (n) => { const m = Math.max(0, ...String(n).split(/[\s\-–/]+/).map((w) => w.length)); return m >= 16 ? ' xlong' : m >= 11 ? ' long' : ''; };
function raceHead(x, { mine = false, side = '', today } = {}) {
  const t = today || S.runnerData?.today || todayISO();
  return `<div class="race-head rh2">${raceTile(x, { mine })}<div class="rh-main"><h3 class="${nameFit(x.name).trim()}">${esc(x.name)}</h3><p class="rh-sub">${esc(raceSub(x))}</p><p class="rc-meta">${raceMeta(x)}</p></div>${raceCd(x, t) || side ? `<div class="rc-side">${raceCd(x, t)}${side}</div>` : ''}</div>`;
}
/** Casilla de carrera plegable (la misma de Carreras): cabecera con fecha, nombre, datos y cuenta atrás; al tocar se despliega `body`. */
function raceFold(x, { key, mine = false, side = '', body = '', today, open = false, id = '', cls = '', noPast = false } = {}) {
  const t = today || S.runnerData?.today || todayISO(), isOpen = open || !!S.open?.[key];
  return `<details class="card race rcard ${x.date < t && !noPast ? 'past-reg ' : ''}${modClass(x.modality)}${cls ? ' ' + cls : ''}"${id ? ` id="${id}"` : ''} data-open-key="${esc(key)}"${isOpen ? ' open' : ''}>
      <summary class="rc-sum">${raceTile(x, { mine })}
        <span class="rc-main"><b class="rc-name${nameFit(x.name)}">${esc(x.name)}</b><span class="rc-sub">${esc(raceSub(x))}</span><span class="rc-meta">${raceMeta(x)}</span></span>
        <span class="rc-side">${raceCd(x, t)}${side}</span><span class="rc-chev" aria-hidden="true">${ico('chevd')}</span>
      </summary>
      <div class="rc-body">${body}</div>
    </details>`;
}

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

/** Registro de historias previas publicadas por la tarea automática (archivo público, sin datos personales). */
const STORY_LOG_URLS = ['https://raw.githubusercontent.com/jordixaviermp-commits/Club/claude/historias-instagram/historias/registro.json'];
async function loadStories() {
  let log = null;
  for (const url of STORY_LOG_URLS) {
    try { const r = await fetch(url, { cache: 'no-cache' }); if (r.ok) { log = parseStoryLog(await r.json()); break; } } catch { /* sin conexión o sin registro todavía */ }
  }
  S.stories = log || { desde: null, byKey: new Map(), none: true };
  if (S.runnerData && !S.session?.isAdmin && ['', 'mi'].includes(parseRoute().view) && !S.draft && !searchActive()) render();
  if ((['inscripciones', 'carreras', 'publicaciones', 'avisos', 'redes', ''].includes(parseRoute().view) && S.session?.isAdmin && !S.draft) || (S.runnerData && S.chroTab === 'imp' && !S.draft)) render();
}

async function reload() {
  if (S.stories === undefined && S.session?.isAdmin) loadStories();
  try { await api.autoPromote(); } catch { /* aún falta su SQL */ } // pasa solas a resultados las carreras ya disputadas con puestos
  S.data = await api.loadAll();
  try { S.docs = await api.listDocuments(); } catch { S.docs = null; } // null = falta el SQL de contratos
  try { S.tpls = await api.listContractTemplates(); } catch { S.tpls = null; } // null = falta el SQL de contratos por tipo
}

// ---------- rutas ----------

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { view: parts[0] || '', id: parts[1] || null, rest: parts[2] || null };
}
const go = (hash) => { if (location.hash === hash) onRoute(); else location.hash = hash; };

let landed = false;
async function onRoute() {
  const { view, id } = parseRoute();
  if (S.lastHash !== location.hash) {      // al entrar en otra pantalla, las secciones plegables de los formularios vuelven a salir plegadas
    S.lastHash = location.hash;
    if (S.open) for (const k of Object.keys(S.open)) if (/^(wf|rf|af)\d$/.test(k)) delete S.open[k];
  }
  if (view === 'c' && id) {               // llegada desde el enlace personal
    const code = extractCode('#/c/' + id);
    S.code = code; store.set(CODE_KEY, code); S.runnerData = null;
    history.replaceState(null, '', location.pathname + '#/');
    return onRoute();
  }
  if (view === 'r' && id) {               // llegada desde el enlace del encargado de redes
    store.set(SOCIAL_KEY, String(id).toUpperCase().replace(/[^A-Z0-9]/g, '')); S.socialData = null;
    history.replaceState(null, '', location.pathname + '#/redes');
    return onRoute();
  }
  // al abrir la app, el corredor aterriza en «Mi temporada» (la pestaña del medio); después navega con normalidad
  const firstOpen = !landed; landed = true;
  if (firstOpen && !S.session?.isAdmin && S.code && view === '') return go('#/mi');
  if (!S.session?.isAdmin && !S.code && view === '' && store.get(SOCIAL_KEY)) return go('#/redes');
  if (S.session?.isAdmin && !S.data) await run(reload);
  if (S.session?.isAdmin) refreshPosts();
  if (!S.session?.isAdmin && view === 'redes' && !S.socialData) loadSocial();
  if (!S.session?.isAdmin && S.code && !S.runnerData && !['entrar'].includes(view)) await loadRunner();
  S.draft = null;
  if (S.session?.isAdmin && !['vista', 'equipo'].includes(view) && S.preview) { S.preview = null; S.runnerData = null; } // salir de la vista previa
  { // pantallas del corredor (o de la vista previa): cargar lo que necesitan
    const sub = S.session?.isAdmin ? (view === 'vista' ? (id || '') : null) : (S.code ? view : null);
    if (sub !== null) {
      if (sub === 'equipo' || (sub === '' && S.regView === 'cal' && !S.team)) loadTeam();
      if (sub === 'federaciones' && !S.fed) loadFed();
      if (sub === 'contrato') loadMyDocs();
      if (sub === 'mi' && !S.preview) loadWatch().then(() => { if (parseRoute().view === 'mi' && !S.rdraft?.wk) render(); });
      if (sub === 'noticias') enterNews();
      if (sub === 'nueva' && !S.team) loadTeam();
      if (sub === 'carrera' && !S.team) loadTeam();
      if (sub === 'mi' && !S.team) loadTeam();
      if ((sub === '' || sub === 'mi') && !S.preview) loadImpact();
      if ((sub === 'mi' || sub === 'equipo') && !S.preview) loadStreaks();
    }
  }
  if (S.session?.isAdmin && view === 'historial') loadChanges();
  if (S.session?.isAdmin && ['', 'hoy', 'movimientos'].includes(view)) loadMovements();
  if (S.session?.isAdmin && ['resumen', 'temporada', 'calidad', 'memoria'].includes(view)) geocodeMissing();
  if (S.session?.isAdmin && view === 'corredores' && id && RFILTERS.some(([f]) => f === id)) S.rfilter = id;
  if (S.session?.isAdmin) {
    if (view === 'inscripciones' && id) S.draft = draftRegistration(id);
    if (view === 'carreras' && id) S.draft = draftRace(id);
    if (view === 'federaciones' && !S.fed) loadFed();
  }
  render();
  window.scrollTo(0, 0);
}

/** Crónicas que el corredor ya pasó (Set de claves). null = falta el SQL; undefined = aún sin cargar. */
async function loadChron() {
  const code = S.code || S.previewCode;
  try {
    const team = await api.runnerChroniclesTeam(code);   // las pasadas por cualquiera: basta con que la pase uno
    if (Array.isArray(team)) { S.chron = new Set(team.map((x) => x.key)); S.chronBy = new Map(team.map((x) => [x.key, x])); return; }
  } catch { /* sin el SQL nuevo: se sigue con las propias */ }
  S.chronBy = null;
  try { const keys = await api.runnerChronicles(code); S.chron = Array.isArray(keys) ? new Set(keys) : null; } catch { S.chron = null; }
}
/** Clasificación de la racha «al día» de todo el club (null = falta el SQL). */
async function loadStreaks() {
  if (S.preview || !S.code) return;
  let r = null; try { r = await api.runnerStreaks(S.code); } catch { r = null; }
  S.streaks = Array.isArray(r) ? r : null;
  if (S.runnerData && ['mi', 'equipo'].includes(parseRoute().view) && !S.draft) render();
}
/** Posición en la clasificación (los empates comparten puesto). */
const streakRows = () => { let pos = 0, last = null; return (Array.isArray(S.streaks) ? S.streaks : []).map((x, i) => { if (x.streak !== last) { pos = i + 1; last = x.streak; } return { ...x, pos }; }); };
function streakBoard(meId) {
  const rows = streakRows(); if (!rows.length) return '';
  const li = (x) => `<li class="${x.id === meId ? 'me' : ''}"><span class="sb-pos">${x.pos <= 3 ? medal(x.pos) : x.pos}</span><span class="sb-nm">${esc(x.name)}${x.id === meId ? ' <small>(tú)</small>' : ''}</span><b>🔥 ${x.streak}</b></li>`;
  const top = rows.slice(0, 5), rest = rows.slice(5), mine = rows.find((x) => x.id === meId), mineOut = mine && mine.pos > top[top.length - 1].pos && !top.includes(mine);
  return `<section class="card rs-card streak-board" id="sec-racha"><h2>🔥 Rachas al día</h2>
    <p class="hint">Carreras seguidas, de la más reciente hacia atrás, con tu resultado puesto y la crónica pasada. Las de la última semana sin terminar no rompen la racha.</p>
    <ol class="sb-list">${top.map(li).join('')}${mineOut ? `<li class="sb-gap" aria-hidden="true">···</li>${li(mine)}` : ''}</ol>
    ${rest.length ? `<details class="sb-more" data-open-key="sbmore"${S.open?.sbmore ? ' open' : ''}><summary>Ver los ${rest.length} restantes</summary><ol class="sb-list" start="${top.length + 1}">${rest.map(li).join('')}</ol></details>` : ''}</section>`; }
/** Lo que el club ha publicado en redes sobre una carrera mía: historia previa (automática o marcada a mano) y post de resultados. */
const myPub = (g) => {
  if (!g || (Array.isArray(g.entries) && !g.entries.some((e) => e.runner_id === S.runnerData?.me?.id))) return null;
  const hit = S.stories?.byKey?.get?.(postKeyOf(g)), manual = S.impact?.posted?.has?.(postKeyOf(g)), res = S.impact?.posted?.has?.(resKeyOf(g));
  if (!hit && !manual && !res) return null;
  return { story: !!(hit || manual), date: hit?.publicada || null, res: !!res };
};
const myPubChip = (g) => { const p = myPub(g); return p ? `<span class="rc-pub" title="${p.story ? 'Historia publicada' : ''}${p.story && p.res ? ' · ' : ''}${p.res ? 'Post de resultados publicado' : ''}" aria-label="Publicado en redes">${ico('camera')}${ico('check', 'rc-pub-ok')}</span>` : ''; };
const myPubLine = (g) => { const p = myPub(g); if (!p) return '';
  return `<div class="rc-pubs">${p.story ? `<p><span class="rc-pub">${ico('camera')}${ico('check', 'rc-pub-ok')}</span>Historia publicada${p.date ? ' el ' + esc(shortDate(p.date)) : ''}: sale gracias a tu inscripción.</p>` : ''}${p.res ? `<p><span class="rc-pub">${ico('image')}${ico('check', 'rc-pub-ok')}</span>Post de resultados publicado.</p>` : ''}</div>`; };
/** «Impacto en redes» del corredor: publicaciones del club y cifras de Instagram de 30 días. null = falta el SQL; undefined = sin cargar. */
async function loadImpact() {
  if (S.impact !== undefined && S.impact !== 'loading') return;
  S.impact = 'loading';
  if (S.stories === undefined) loadStories();
  let r = null; try { r = await api.runnerSocialImpact(S.code || S.previewCode); } catch { r = null; }
  S.impact = r && Array.isArray(r.posted) ? { posted: new Set(r.posted), ig: r.ig_rows ? igHeadline(r.ig_rows) : null } : null;
  if (S.runnerData) render();
}
/** Escamot (E1–E5) del corredor para pintar sus turnos en el calendario; null si no tiene. */
async function loadShift() {
  const code = S.code || S.previewCode; let info = null;
  try { info = await api.runnerShiftInfo(code); } catch { info = null; }
  if (info) { S.myShift = info.group || null; S.shiftOn = !!info.enabled; return; }
  let g = null; try { g = await api.runnerMyShift(code); } catch { g = null; }   // sin el SQL de «turnos propios»: solo se ve el escamot que haya puesto la dirección
  S.myShift = g || null; S.shiftOn = false;
}
async function loadRunner() {
  if (!S.session?.isAdmin) api.runnerPing?.(S.code).catch(() => {});   // actividad: última vez que abrió la app
  try { S.moves = undefined; S.runnerData = await api.runnerView(S.code); await loadNews(); await loadCorrections(); await loadChron(); await loadWatch(); await loadNotes(); await loadShift(); }
  catch (e) {
    S.runnerData = null;
    if (/enlace_no_valido/.test(String(e?.message))) { store.del(CODE_KEY); S.code = null; }
    toast(friendlyError(e), true);
  }
}

// ---------- marco común ----------

const ADMIN_TABS = [
  ['hoy', 'Hoy', 'M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'],
  ['inscripciones', 'Carreras', 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3'],
  ['corredores', 'Equipo', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8'],
  ['resumen', 'Resumen', 'M4 20V10M10 20V4M16 20v-7M22 20H2'],
  ['redes', 'Redes', 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4'],
];
/** Pestaña de la dirección a la que pertenece cada pantalla (y su color). */
const ADMIN_GROUP = { '': 'hoy', hoy: 'hoy', movimientos: 'hoy', avisos: 'hoy', mensajes: 'hoy', calidad: 'hoy', actividad: 'hoy', noticias: 'hoy', historial: 'hoy',
  inscripciones: 'inscripciones', carreras: 'inscripciones', federaciones: 'inscripciones',
  corredores: 'corredores', contratos: 'corredores', computo: 'corredores', informe: 'corredores', bonos: 'corredores', corredor: 'corredores', docs: 'corredores',
  resumen: 'resumen', instagram: 'redes', dossier: 'redes', datos: 'resumen', temporada: 'resumen', memoria: 'resumen', vista: 'corredores', equipo: 'resumen',
  redes: 'redes', semana: 'redes', publicaciones: 'redes' };
const SEC_OF = { hoy: 'hoy', inscripciones: 'car', corredores: 'eq', resumen: 'res', redes: 'red', '': 'car', federaciones: 'fed', mi: 'hoy', contrato: 'eq', equipo: 'res', noticias: 'hoy', carrera: 'car', nueva: 'car' };
const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
// Menú de pie de página de los corredores (y de la vista previa de la dirección).
const RUNNER_TABS = [
  ['', 'Carreras', 'M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM9 16h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15'],
  ['federaciones', 'Federaciones', 'M16 10h2M16 14h2M6.17 15a3 3 0 0 1 5.66 0M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'],
  ['mi', 'Mi temporada', 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM12 17.2a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM8.8 21a3.2 3.2 0 0 1 6.4 0'],
  ['contrato', 'Contrato', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8'],
  ['equipo', 'Equipo', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'],
];
const runnerBase = () => (S.session?.isAdmin && S.preview ? '#/vista' : '#');
const runnerHref = (sub) => (sub ? `${runnerBase()}/${sub}` : `${runnerBase()}/`);

// ---------- Búsqueda rápida (lupa de la cabecera) ----------
const adminScreens = () => [
  ['🏠', 'Hoy: lo que tienes por hacer', '#/hoy', 'hoy inicio pendiente por hacer tareas resumen dia'],
  ['💬', 'Mensaje al equipo (WhatsApp por grupos)', '#/mensajes', 'mensaje whatsapp recordar avisar grupo resultados apuntarse inactivos'],
  ['📲', 'Actividad: quién usa la app', '#/actividad', 'actividad usa app abierto entrado ultima vez inactivos'],
  ['🧹', 'Datos incompletos de las carreras', '#/calidad', 'datos incompletos calidad provincia disciplina km puesto falta'],
  ['📋', 'Inscripciones', '#/inscripciones', 'inscripciones apuntarse calendario proximas carreras abiertas'],
  ['🏆', 'Carreras (resultados)', '#/carreras', 'carreras resultados podios historico hechas'],
  ['📊', 'Resumen de la temporada', '#/resumen', 'resumen estadistica categorias podios km modalidad temporada'],
  ['👥', 'Corredores (plantilla)', '#/corredores', 'corredores plantilla categoria enlaces renovar anadir ropa pedido filtros'],
  ['📄', 'Contratos por tipo', '#/contratos', 'contratos contrato nuevo renovacion licencia pdf subir antiguos'],
  ['📈', 'Resumen: panorama, podios, equipo y alcance', '#/resumen', 'temporada fin de ano disciplinas podios records corredores comparar anterior exportar excel panorama alcance bonos'],
  ['📘', 'Memoria para sponsors', '#/memoria', 'memoria sponsors patrocinadores informe imprimir pdf temporada resumen'],
  ['📸', 'Dossier de Instagram', '#/dossier', 'dossier instagram sponsors patrocinadores colaboradores redes pdf estadisticas'],
  ['📊', 'Cómputo de la temporada', '#/computo', 'computo fin temporada descargar csv excel control cerrar'],
  ['🖨️', 'Informe de temporada', '#/informe', 'informe imprimir pdf bono saldo penalizacion cierre hojas corredor'],
  ['💶', 'Bonos', '#/bonos', 'bonos bonificacion minimo penalizacion tramos plus circuito condiciones'],
  ['📈', 'Estadísticas de Instagram (en Redes)', '#/instagram', 'instagram estadisticas seguidores alcance interacciones visualizaciones publicaciones redes'],
  ['📱', 'Redes: panel de historias, avisos y resultados', '#/redes', 'redes instagram historia post resultados avisos publicar pendiente encargado panel'],
  ['📸', 'Publicaciones en redes (control detallado)', '#/publicaciones', 'redes instagram historia post resultados publicar anomalias encargado'],
  ['📅', 'Próximas carreras (para redes)', '#/semana', 'semana redes avisar encargado proximas'],
  ['🔔', 'Avisos', '#/avisos', 'avisos pendientes campanita correcciones puestos'],
  ['📣', 'Noticias para los corredores', '#/noticias', 'noticias anuncios quedada comunicado'],
  ['🗂️', 'Datos: copias, versión y aspecto (en Resumen)', '#/resumen', 'datos copia seguridad backup restaurar importar csv version aspecto oscuro claro sesion cerrar'],
  ['🕘', 'Movimientos de la app (quién hace qué)', '#/movimientos', 'movimientos historial inscripciones pagos cronicas quien se inscribio actividad control'],
  ['🕘', 'Historial de cambios', '#/historial', 'historial cambios quien modifico'],
  ['🏁', 'Federaciones y ligas', '#/federaciones', 'federaciones ligas calendario fcc fac catalana aragonesa'],
  ['⚕️', 'En caso de accidente', '#/accidente', 'accidente seguro poliza telefono gerosalud divina rc responsabilidad civil'],
  ['🗺️', 'Planificar ruta (viento y tiempo)', 'ruta/', 'ruta planificar track gpx fit viento tiempo lluvia subidas avituallamiento garmin salida'],
  ['⚡', 'Pacing: vatios por tramo y nutrición', 'pacing/', 'pacing vatios ftp potencia nutricion hidratos ritmo marcha tramos objetivo estrategia'],
];
const runnerScreens = () => [
  ['🏠', 'Carreras', runnerHref(''), 'carreras proximas apuntarme buscar crear nueva calendario'],
  ['🏁', 'Federaciones y ligas', runnerHref('federaciones'), 'federaciones ligas calendario fcc fac catalana aragonesa'],
  ['⭐', 'Por valorar: carreras guardadas para decidir', '#/mi/valorar', 'por valorar guardar guardadas carrera favorita estrella decidir inscribirme plazo precio lista pendiente'],
  ['🧍', 'Mi temporada', runnerHref('mi'), 'mi temporada resultados carreras hechas puesto tiempo bono'],
  ['📄', 'Contrato y bonificación', runnerHref('contrato'), 'contrato bonificacion bono licencia ropa pedido documentos plus'],
  ['📊', 'Equipo', runnerHref('equipo'), 'equipo ranking estadistica categorias km tiempo podios'],
  ['📣', 'Noticias del club', runnerHref('noticias'), 'noticias avisos comunicados quedada'],
  ['⚕️', 'En caso de accidente', '#/accidente', 'accidente seguro poliza telefono federacion'],
  ['🗺️', 'Planificar ruta (viento y tiempo)', 'ruta/', 'ruta planificar track gpx fit viento tiempo lluvia subidas avituallamiento garmin salida'],
  ['⚡', 'Pacing: vatios por tramo y nutrición', 'pacing/', 'pacing vatios ftp potencia nutricion hidratos ritmo marcha tramos objetivo estrategia'],
];
/** Todas las palabras escritas tienen que aparecer (sin importar mayúsculas ni tildes). */
const gsHit = (q, ...fields) => { const t = normalize(q).split(' ').filter(Boolean); const h = normalize(fields.filter(Boolean).join(' ')); return t.length > 0 && t.every((w) => h.includes(w)); };
function globalSearchGroups(q) {
  const admin = S.session?.isAdmin && parseRoute().view !== 'vista';
  const groups = [];
  const screens = (admin ? adminScreens() : runnerScreens()).filter(([, label, , kw]) => gsHit(q, label, kw)).map(([ic, label, href]) => ({ icon: ic, label, href }));
  groups.push(['Ir a…', screens.slice(0, 6)]);
  const cap = (arr, n) => arr.slice(0, n);
  if (admin && S.data) {
    const d = S.data;
    groups.push(['Corredores', cap(d.runners.filter((r) => gsHit(q, r.name, r.category, contractLabel(r.contract))).sort(byName), 6)
      .map((r) => ({ icon: '👤', label: r.name, sub: [r.category, contractLabel(r.contract)].filter(Boolean).join(' · '), href: `#/corredor/${r.id}` }))]);
    groups.push(['Inscripciones', cap(d.registrations.filter((g) => gsHit(q, g.name, g.place, g.province, g.modality, g.subtype, ...(g.entries || []).map((e) => runnerById(e.runner_id)?.name))).sort((a, b) => a.date.localeCompare(b.date)), 6)
      .map((g) => { const who = (g.entries || []).map((e) => runnerById(e.runner_id)?.name).find((n) => n && gsHit(q, n) && !gsHit(q, g.name));
        return { icon: '📋', label: g.name, sub: `${when(g)}${place(g) ? ' · ' + place(g) : ''}${who ? ' · 👤 ' + who : ''}`, href: `#/inscripciones/${g.id}` }; })]);
    groups.push(['Carreras', cap(d.races.filter((r) => gsHit(q, r.name, r.place, r.province, r.modality, r.subtype, r.circuit, ...(r.results || []).map((x) => x.runner_name))).sort((a, b) => b.date.localeCompare(a.date)), 8)
      .map((r) => { const x = (r.results || []).find((y) => gsHit(q, y.runner_name) && !gsHit(q, r.name));
        return { icon: '🏆', label: r.name, sub: `${when(r)}${place(r) ? ' · ' + place(r) : ''}${x ? ` · 👤 ${x.runner_name}${x.position ? ' ' + x.position + 'º' : ''}` : ''}`, href: `#/carreras/${r.id}` }; })]);
    groups.push(['Noticias', cap((d.announcements || []).filter((a) => gsHit(q, a.title, a.body)), 4).map((a) => ({ icon: '📣', label: a.title, sub: 'Noticia', href: '#/noticias' }))]);
  } else if (S.runnerData) {
    const rd = S.runnerData;
    groups.push(['Compañeros', cap(teamRoster().filter((m) => gsHit(q, m.name)), 5).map((m) => ({ icon: '👤', label: m.name, sub: 'Ver dónde se ha apuntado', mate: m.id }))]);
    groups.push(['Carreras próximas', cap(rd.registrations.filter((g) => g.date >= (rd.today || todayISO()) && gsHit(q, g.name, g.place, g.province, g.modality, g.subtype)).sort((a, b) => a.date.localeCompare(b.date)), 8)
      .map((g) => ({ icon: '📅', label: g.name, sub: `${when(g)}${place(g) ? ' · ' + place(g) : ''}`, href: `${runnerHref('carrera')}/${g.id}` }))]);
    groups.push(['Carreras ya hechas', cap((S.team?.races || []).filter((r) => (r.results || []).length && gsHit(q, r.name, r.place, r.province)).sort((a, b) => b.date.localeCompare(a.date)), 5)
      .map((r) => ({ icon: '🏁', label: r.name, sub: `${when(r)}${place(r) ? ' · ' + place(r) : ''}`, href: `${runnerHref('carrera')}/race_${r.id}` }))]);
  }
  return groups.filter(([, items]) => items.length);
}
function globalSearchHtml(q) {
  if (normalize(q).length < 2) return '<p class="hint">Escribe una palabra: un nombre de corredor, una carrera, un pueblo, «contrato», «bono», «ropa», «copia»… y te llevo directo.</p>';
  const groups = globalSearchGroups(q);
  if (!groups.length) return `<p class="empty">No encuentro nada con «${esc(q)}». Prueba con otra palabra o con menos letras.</p>`;
  return groups.map(([title, items]) => `<h3 class="gs-h">${esc(title)}</h3><ul class="mini-list">${items.map((it) => (it.mate
    ? `<li class="mini tappable"><button type="button" class="mini-main" data-gs-mate="${esc(it.mate)}"><b>${it.icon} ${esc(it.label)}</b><small class="muted">${esc(it.sub || '')}</small></button></li>`
    : `<li class="mini tappable"><a class="mini-main" href="${esc(it.href)}"><b>${it.icon} ${esc(it.label)}</b>${it.sub ? `<small class="muted">${esc(it.sub)}</small>` : ''}</a></li>`)).join('')}</ul>`).join('');
}
function openGlobalSearch() {
  const dlg = document.getElementById('dialog');
  dlg.innerHTML = `<form class="dlg gsearch" onsubmit="return false">
    <div class="gs-top"><input type="search" data-gs name="q" placeholder="Buscar en toda la app…" autocomplete="off" enterkeyhint="search" aria-label="Buscar"><button type="button" class="btn ghost" data-gs-close>Cerrar</button></div>
    <div id="gs-results" class="gs-results">${globalSearchHtml('')}</div></form>`;
  dlg.onclose = null;
  dlg.showModal();
  dlg.querySelector('input[data-gs]')?.focus();
}
{
  const dlg = document.getElementById('dialog');
  dlg.addEventListener('input', (ev) => { if (ev.target.dataset?.gs !== undefined) dlg.querySelector('#gs-results').innerHTML = globalSearchHtml(ev.target.value); });
  dlg.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.dataset?.gs !== undefined) { ev.preventDefault(); const a = dlg.querySelector('#gs-results a.mini-main, #gs-results button.mini-main'); if (a) a.click(); } });
  dlg.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-gs-close]')) return dlg.close();
    const fa = ev.target.closest('.fdlg [data-act]');
    if (fa && actions[fa.dataset.act]) { ev.preventDefault(); dlg.close(); actions[fa.dataset.act](fa); return; }
    const m = ev.target.closest('[data-gs-mate]');
    if (m) { dlg.close(); openMate(m.dataset.gsMate); }
  });
}
// «/» abre la búsqueda (en ordenador), si no se está escribiendo en otro sitio
document.addEventListener('keydown', (ev) => {
  if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.getElementById('dialog')?.open) return;
  if (!(S.session?.isAdmin || S.runnerData)) return;
  ev.preventDefault(); openGlobalSearch();
});

/** Campanita de la dirección: número de cosas pendientes. */
function bellButton() {
  const n = alertCount();
  return `<a class="icon-btn bell${n ? ' on' : ''}" href="#/avisos" aria-label="Avisos${n ? `: ${n} pendientes` : ''}" title="Avisos">${icon(ICON_BELL)}${n ? `<span class="bell-n">${n}</span>` : ''}</a>`;
}

const ICON_AID = 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z';
/** Botón «Accidente» (a la izquierda de la campanita): da los datos del seguro con un toque. */
const ICON_FILTER = 'M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2M14 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM16 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z';
const ICON_SEARCH = 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3';
/** Lupa de la cabecera: búsqueda rápida por palabra en toda la app. */
const searchButton = () => `<button type="button" class="icon-btn" data-act="gsearch" aria-label="Buscar en toda la app" title="Buscar">${icon(ICON_SEARCH)}</button>`;
const accidentButton = () => `<a class="icon-btn sos" href="#/accidente" aria-label="En caso de accidente: teléfono y datos del seguro" title="Accidente">${icon(ICON_AID)}</a>`;

function frame(title, body, { back, actions = '', rtab = null, noSearch = false, head = null } = {}) {
  const { view } = parseRoute();
  const admin = S.session?.isAdmin;
  const tabs = rtab !== null
    ? `<nav class="tabs">${RUNNER_TABS.map(([v, label, d]) =>
      `<a href="${runnerHref(v)}" class="${v === rtab ? 'on' : ''}">${icon(d)}${v === 'mi' && !S.preview && watchUrgent() ? `<b class="tab-n" title="Plazo de inscripción a punto de cerrarse">${watchUrgent()}</b>` : ''}<span>${label}</span></a>`).join('')}</nav>`
    : admin ? `<nav class="tabs">${ADMIN_TABS.map(([v, label, d]) =>
      `<a href="#/${v}" class="${(ADMIN_GROUP[view] || 'hoy') === v ? 'on' : ''}">${icon(d)}${v === 'redes' && S.data && socialPending() ? `<b class="tab-n">${socialPending()}</b>` : ''}${v === 'hoy' && S.data && todayCount() ? `<b class="tab-n">${todayCount()}</b>` : ''}<span>${label}</span></a>`).join('')}</nav>` : '';
  return `
    ${api.mode === 'demo' ? `<div class="demo-bar">Modo demostración: datos de prueba guardados solo en este móvil.</div>` : ''}
    <header class="top">
      ${back ? `<a class="back" href="${back}" aria-label="Volver">‹</a>` : rtab !== null && !S.preview && S.runnerData?.me ? `<button type="button" class="logo-btn" data-act="profile" aria-label="Mi perfil: aspecto, turnos y cambiar de persona" title="Mi perfil"><img class="logo" src="icons/logo.png" alt=""></button>` : '<img class="logo" src="icons/logo.png" alt="">'}
      ${head ? head : rtab !== null && !S.preview && S.runnerData?.me?.name && title === runnerTitle() ? `<h1 class="greet" aria-label="${esc(title)}" title="${esc(title)}"><span>${esc(title)}</span></h1>` : `<h1>${esc(title)}</h1>`}${actions}${(admin && rtab === null && !back && S.data) || rtab !== null ? (noSearch ? '' : searchButton()) + accidentButton() : ''}${rtab !== null ? newsBell() : ''}
    </header>
    <main>${body}</main>
    ${tabs}`;
}

/** Línea «Versión de la app»; si el móvil ya tiene instalada una más nueva que la que se está ejecutando, lo avisa. */
const versionLine = () => `<p class="muted center small app-ver" id="app-ver">Versión de la app: <b>${esc(VERSION)}</b></p>`;
async function checkVersion() {
  const el = document.getElementById('app-ver');
  if (!el || !('caches' in window)) return;
  try {
    const nums = (await caches.keys()).map((k) => /^monzon-v(\d+)$/.exec(k)?.[1]).filter(Boolean).map(Number);
    const newest = Math.max(0, ...nums), mine = Number(VERSION.slice(1));
    if (newest > mine && document.getElementById('app-ver') === el) {
      el.innerHTML += `<br>⚠️ Hay una versión más nueva (v${newest}). <button class="link" data-act="app-reload">Actualizar ahora</button>`;
    }
  } catch { /* sin acceso a la caché: solo se enseña la versión */ }
}

/** Si el nombre de la barra de arriba no cabe, se desliza de ida y vuelta para poder leerlo entero. */
function fitGreeting() {
  const h = $app.querySelector('h1.greet'); if (!h) return;
  const t = h.firstElementChild, over = Math.ceil(t.scrollWidth - h.clientWidth);
  if (over > 2) { h.style.setProperty('--ov', `${over + 6}px`); h.style.setProperty('--dur', `${Math.max(6, Math.round(over / 18) + 5)}s`); h.classList.add('scroll'); }
}
window.addEventListener('resize', () => { const h = $app.querySelector('h1.greet'); if (h) { h.classList.remove('scroll'); fitGreeting(); } });

function render() {
  const { view } = parseRoute();
  const admin = S.session?.isAdmin;
  let html;
  if (view === 'entrar') html = viewLogin();
  else if (view === 'accidente' && (admin || S.code)) html = viewAccident();
  else if (admin) {
    html = ({
      '': viewToday, hoy: viewToday, movimientos: viewMovements, mensajes: viewMessages, calidad: viewQuality, actividad: viewActivity,
      inscripciones: S.draft ? viewRegistrationEdit : viewRegistrations,
      carreras: S.draft ? viewRaceEdit : viewRaces,
      resumen: viewSummary, temporada: viewSummary, memoria: viewMemoria, dossier: viewIgDossier, instagram: viewInstagram, redes: viewNetworks, corredores: viewRunners, contratos: viewContracts, computo: viewSeasonCount, informe: viewSeasonReport, publicaciones: viewPublications, datos: viewData, federaciones: viewFed, bonos: viewBonus, avisos: viewAlerts, noticias: viewAdminNews, semana: viewWeek, historial: viewHistory, corredor: () => viewRunnerCard(parseRoute().id), docs: () => viewDocs(parseRoute().id),
      vista: () => (S.preview && S.runnerData ? runnerScreen(parseRoute().id || '') : viewRunners()),
      equipo: () => (S.preview ? viewTeam() : viewSummary()),
    }[view] || viewToday)();
  } else if (view === 'redes' && store.get(SOCIAL_KEY)) html = viewSocial();
  else if (S.code && S.runnerData) html = runnerScreen(view);
  else html = viewWelcome();
  $app.innerHTML = html;
  fitGreeting();
  syncSearchMode();
  if ($app.querySelector('#app-ver')) checkVersion();
  document.body.classList.toggle('has-tabs', !!$app.querySelector('nav.tabs'));
  // color de la sección: cada pestaña tiene el suyo
  document.body.dataset.sec = admin && view !== 'vista' ? ({ hoy: 'hoy', inscripciones: 'car', corredores: 'eq', resumen: 'res', redes: 'red' }[ADMIN_GROUP[view] || 'hoy'])
    : (SEC_OF[admin ? (parseRoute().id || '') : view] || 'car');
}

// ---------- En caso de accidente ----------
const telHref = (t) => 'tel:' + String(t).replace(/[^\d+]/g, '');
const copyBtn = (text, msg) => `<button class="btn small ghost" data-act="copy-text" data-text="${esc(text)}" data-msg="${esc(msg)}">Copiar</button>`;
const telBtn = (t) => `<a class="btn primary big" href="${telHref(t.numero)}">📞 Llamar · ${esc(t.numero)}${t.etiqueta ? ` (${esc(t.etiqueta)})` : ''}</a>`;
const mailBtn = (c, verbo = 'Escribir a') => `<a class="btn primary big" href="mailto:${esc(c.para)}?subject=${encodeURIComponent(c.asunto || '')}">✉️ ${verbo} ${esc(c.para)}</a>
  <p class="sos-row"><span>${esc(c.para)}</span>${copyBtn(c.para, 'Correo copiado')}</p>`;
const polizaRow = (etiqueta, valor, msg = 'Número de póliza copiado') => `<p class="sos-row"><span>${esc(etiqueta)}:<br><b class="sos-num">${esc(valor)}</b></span>${copyBtn(valor, msg)}</p>`;
/** Enlaces a PDF: con `download`, un toque los descarga (en algunos móviles se abren en el visor, que también deja guardarlos). */
const pdfLinks = (list = []) => list.map((l) => `<a class="btn" href="${esc(l.href)}" download="${esc(l.href.split('/').pop())}" target="_blank" rel="noopener noreferrer">${esc(l.etiqueta)} ⬇️</a>`).join('');
/** Todos los documentos de una federación en un solo sitio, para descargarlos. */
function accidentDocs(fed) {
  const docs = [...(fed.imagen ? [{ etiqueta: '🖼️ Imagen resumen', href: fed.imagen }] : []), ...(fed.accidente.pdfs || []), ...(fed.rc.pdfs || [])];
  if (!docs.length) return '';
  return `<section class="card sos-card"><h2>📥 Documentos para descargar</h2>
    <p class="hint">Descárgalos con cobertura y los tendrás en el móvil por si los necesitas sin ella.</p>${pdfLinks(docs)}</section>`;
}

/** Imagen resumen de la federación elegida (se genera con scripts/imagenes-seguros.mjs). */
const accidentImage = (fed) => (fed.imagen ? `<section class="card sos-card sos-img"><h2>🖼️ Resumen en una imagen</h2>
  <a href="${esc(fed.imagen)}" target="_blank" rel="noopener noreferrer"><img src="${esc(fed.imagen)}" alt="Qué hacer en caso de accidente con licencia ${esc(fed.corto.toLowerCase())}: llamar a Gerosalud al 981 941 111 antes de ir al médico, enviar el parte y pedir autorización para más asistencia"></a>
  <a class="btn primary" href="${esc(fed.imagen)}" download="${esc(fed.imagen.split('/').pop())}">⬇️ Descargar la imagen</a>
  <p class="hint">Tócala para verla a tamaño completo. Guárdala en tu galería y la tendrás también sin cobertura.</p></section>` : '');

function accidentSteps(a) {
  return `${a.aviso ? `<p class="card sos-urgent">⚠️ <b>${esc(a.aviso)}</b></p>` : ''}
    ${a.pasos.map((p, i) => `<section class="card sos-card">
      <h2><span class="sos-n">${i + 1}</span> ${esc(p.titulo)}</h2>
      <p>${esc(p.texto)}</p>
      ${p.tel ? telBtn(p.tel) : ''}
      ${[].concat(p.correo || []).map((c) => mailBtn(c)).join('')}
      ${p.copia ? polizaRow(p.copia.etiqueta, p.copia.valor, p.copia.msg) : ''}
      ${pdfLinks(p.enlaces)}</section>`).join('')}
    ${a.avisoFinal ? `<p class="card warn">${esc(a.avisoFinal)}</p>` : ''}
    ${a.resumen ? `<section class="card sos-card"><h2>📋 Qué cubre el seguro (resumen)</h2>
      <ul class="bullets">${a.resumen.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p class="hint">Es un resumen: manda siempre el texto de la póliza.</p>${pdfLinks(a.pdfs)}</section>` : ''}`;
}

function accidentRc(rc) {
  return `<section class="card sos-card">
    <h2>🛡️ Responsabilidad civil</h2>
    <p>Si el daño lo has causado tú a otra persona o a sus cosas.</p>
    ${polizaRow(`Póliza ${rc.aseguradora}`, rc.poliza)}
    ${rc.datos?.length ? `<ul class="bullets">${rc.datos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${rc.antes ? `<p><b>${esc(rc.antes)}</b></p>` : ''}
    ${(rc.casos || []).map((c) => `<details class="sos-case"><summary><b>${esc(c.titulo)}</b></summary>
      <p>${esc(c.antes)}</p>
      <p class="hint"><b>Entrega junta, a la federación:</b></p>
      <ol class="bullets">${c.adjuntar.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></details>`).join('')}
    ${rc.tel ? telBtn(rc.tel) : ''}
    ${pdfLinks(rc.pdfs)}
    ${rc.correo ? mailBtn(rc.correo, 'Enviar a') : ''}
  </section>`;
}

function viewAccident() {
  const back = S.session?.isAdmin ? '#/inscripciones' : runnerHref('mi');
  const fed = FEDERACIONES[S.fedSeguro];
  const chips = `<p class="hint sos-pick">Mi licencia es de la federación:</p>
    <div class="modbar fedbar" role="group" aria-label="Federación de tu licencia">${ORDEN_FEDERACIONES.map((id) =>
      `<button class="chip modchip${S.fedSeguro === id ? ' on' : ''}" data-act="fed-seguro" data-f="${id}" aria-pressed="${S.fedSeguro === id}">${esc(FEDERACIONES[id].corto)}</button>`).join('')}</div>`;
  return frame('Accidente', `
    <p class="card sos-urgent">🚨 <b>Urgencia grave: llama primero al 112.</b> Lo de abajo es para comunicar el accidente al seguro de la federación.</p>
    ${chips}
    ${fed ? `${accidentImage(fed)}
      ${accidentSteps(fed.accidente)}
      ${accidentRc(fed.rc)}
      ${accidentDocs(fed)}
      <p class="hint center">Datos de la ${esc(fed.nombre)}. Si tu licencia es de otra federación, cambia arriba. Toda la información, en <a href="${esc(fed.info)}" target="_blank" rel="noopener noreferrer">${esc(fed.info.replace('https://', ''))}</a>.</p>`
      : '<p class="card">👆 <b>Elige la federación de tu licencia</b> (sale en tu carné de federado): el seguro y los pasos cambian. Se recordará en este móvil.</p>'}`, { back });
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

// ---------- Filtros rápidos bajo la lupa: modalidad, formato y situación ----------
const MOD_ICON = { Carretera: '🚴', BTT: '⛰️', Gravel: '🪨', Ciclocross: '🌲', Pista: '🏟️', Otra: '🏁' };
/** Deja solo las carreras de la modalidad elegida (todas si no hay filtro). */
const byMod = (list) => (S.mod === 'all' ? list : list.filter((x) => x.modality === S.mod));
/** Modalidad + formato (+ «con compañeros» / «aún no estoy apuntado» si se indica `me`). */
/** Tipos de prueba para filtrar (corredores): por etapas, liga o copa (puntuable de un circuito) y campeonato. */
const KIND_TEST = { stages: (g) => !!g.end_date && g.end_date > g.date, circuit: (g) => g.race_type === 'circuito', champ: (g) => g.race_type === 'campeonato' };
const KIND_LABEL = { stages: '🗓️ Por etapas', circuit: '🏆 Liga o copa', champ: '🥇 Campeonato' };
function regFilter(list, me = null) {
  let out = byMod(list);
  if (S.mod !== 'all' && S.sub !== 'all') out = out.filter((g) => (S.sub === '_none' ? !g.subtype : g.subtype === S.sub));
  if (me && S.fsub !== 'all') out = out.filter((g) => g.subtype === S.fsub);
  if (me && S.kind !== 'all') out = out.filter(KIND_TEST[S.kind] || (() => true));
  if (me && S.who === 'mates') out = out.filter((g) => (g.entries || []).some((e) => e.runner_id !== me.id));
  if (me && S.who === 'free') out = out.filter((g) => !(g.entries || []).some((e) => e.runner_id === me.id) && !(g.results || []).some((x) => x.runner_id === me.id));
  return out;
}
const filtersOn = (me) => S.mod !== 'all' || S.sub !== 'all' || (!!me && (S.who !== 'all' || S.fsub !== 'all' || S.kind !== 'all'));
const clearFilters = () => { S.mod = 'all'; S.sub = 'all'; S.who = 'all'; S.fsub = 'all'; S.kind = 'all'; store.set(MOD_KEY, 'all'); };
/**
 * Botones de filtro: modalidad → formato (al elegir modalidad) → situación (solo corredores).
 * Los números son carreras próximas. `regs`: todas las inscripciones; `me`: el corredor (null en dirección).
 */
/** Filtros de los corredores: modalidad, formato (XCO, Critérium…) y tipo de prueba (etapas, liga o copa, campeonato). Rellena S.fd. */
function runnerFilterModel(regs) {
  const today = todayISO();
  const up = regs.filter((g) => g.date >= today && !g.suspended);
  const mods = MODALITIES.filter((m) => regs.some((g) => g.modality === m));
  if (S.mod !== 'all' && !mods.includes(S.mod)) S.mod = 'all';
  S.who = 'all'; S.sub = 'all';
  const inMod = up.filter((g) => S.mod === 'all' || g.modality === S.mod);
  const fmts = [...new Set(inMod.map((g) => g.subtype).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  if (S.fsub !== 'all' && !fmts.includes(S.fsub)) S.fsub = 'all';
  const okKind = (g) => S.kind === 'all' || KIND_TEST[S.kind](g), okFmt = (g) => S.fsub === 'all' || g.subtype === S.fsub;
  const ch = (act, attr, val, cur, label, n, cls = '') => `<button type="button" class="chip modchip ${cls}${cur === val ? ' on' : ''}" data-act="${act}" data-${attr}="${esc(val)}" aria-pressed="${cur === val}">${label}${n == null ? '' : `<b>${n}</b>`}</button>`;
  const kinds = Object.keys(KIND_TEST).map((k) => [k, inMod.filter((g) => okFmt(g) && KIND_TEST[k](g)).length]).filter(([k, n]) => n > 0 || S.kind === k);
  const sec = (title, body) => `<p class="hint fsec">${title}</p><div class="modbar" role="group" aria-label="${title}">${body}</div>`;
  const html = [
    mods.length >= 2 ? sec('Modalidad', ch('mod-filter', 'm', 'all', S.mod, 'Todas', up.length) + mods.map((m) => ch('mod-filter', 'm', m, S.mod, `${MOD_ICON[m] || '🏁'} ${esc(m)}`, up.filter((g) => g.modality === m).length, modClass(m))).join('')) : '',
    fmts.length ? sec('Formato', ch('fsub-filter', 's', 'all', S.fsub, 'Todos', null) + fmts.map((f) => ch('fsub-filter', 's', f, S.fsub, esc(f), inMod.filter((g) => g.subtype === f && okKind(g)).length)).join('')) : '',
    kinds.length ? sec('Tipo de prueba', ch('kind-filter', 'k', 'all', S.kind, 'Todas', null) + kinds.map(([k, n]) => ch('kind-filter', 'k', k, S.kind, KIND_LABEL[k], n)).join('')) : '',
  ].join('');
  S.fd = { html, has: !!html, active: filtersOn(true) };
}

function modFilterBar(regs, me = null) {
  if (me) { runnerFilterModel(regs); return ''; }
  const today = todayISO();
  const upOf = (list) => list.filter((g) => g.date >= today && !g.suspended);
  const mods = MODALITIES.filter((m) => regs.some((g) => g.modality === m));
  if (S.mod !== 'all' && !mods.includes(S.mod)) S.mod = 'all';
  // formatos disponibles dentro de la modalidad elegida (solo los que tienen carreras próximas)
  const inMod = upOf(byMod(regs));
  const subs = S.mod === 'all' ? [] : [...(SUBTYPES[S.mod] || []).map((o) => [o, inMod.filter((g) => g.subtype === o).length]), ['_none', inMod.filter((g) => !g.subtype).length]]
    .filter(([, n]) => n > 0);
  const showSubs = subs.length >= 2;
  if (S.sub !== 'all' && (!showSubs || !subs.some(([k]) => k === S.sub))) S.sub = 'all';
  if (mods.length < 2 && !me) return '';
  const chip = (act, attr, val, cur, label, n, cls = '') => `<button class="chip modchip ${cls}${cur === val ? ' on' : ''}" data-act="${act}" data-${attr}="${esc(val)}" aria-pressed="${cur === val}">${label}<b>${n}</b></button>`;
  const modRow = mods.length >= 2 ? `<div class="modbar" role="group" aria-label="Filtrar por modalidad">
    ${chip('mod-filter', 'm', 'all', S.mod, 'Todas', upOf(regs).length)}
    ${mods.map((m) => chip('mod-filter', 'm', m, S.mod, `${MOD_ICON[m] || '🏁'} ${esc(m)}`, upOf(regs).filter((g) => g.modality === m).length, modClass(m))).join('')}
  </div>` : '';
  const subRow = showSubs ? `<div class="modbar subbar ${modClass(S.mod)}" role="group" aria-label="Filtrar por formato">
    ${chip('sub-filter', 's', 'all', S.sub, 'Todos', inMod.length)}
    ${subs.map(([k, n]) => chip('sub-filter', 's', k, S.sub, k === '_none' ? 'Sin formato' : esc(k), n)).join('')}
  </div>` : '';
  const shown = upOf(regFilter(regs, null));
  const people = new Set(shown.flatMap((g) => (g.entries || []).map((e) => e.runner_id))).size;
  const n = shown.length;
  const sum = filtersOn(null) ? `<p class="hint modsum">${[S.mod !== 'all' ? `${MOD_ICON[S.mod] || ''} <b>${esc(S.mod)}</b>` : '', S.sub !== 'all' ? `<b>${S.sub === '_none' ? 'sin formato' : esc(S.sub)}</b>` : ''].filter(Boolean).join(' · ') || 'Filtro activo'}: ${n} carrera${n === 1 ? '' : 's'} próxima${n === 1 ? '' : 's'} · 👥 ${people} compañero${people === 1 ? '' : 's'} apuntado${people === 1 ? '' : 's'}
    <button class="link small" data-act="filters-clear">Quitar filtros</button></p>` : '';
  return modRow + subRow + sum;
}

/** Lista de carreras agrupada por mes, con cabecera plegable («Diciembre 2026 · 4 carreras · 👥 6»). */
function monthList(list, card) {
  const groups = new Map();
  for (const g of list) (groups.get(g.date.slice(0, 7)) || groups.set(g.date.slice(0, 7), []).get(g.date.slice(0, 7))).push(g);
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([ym, items]) => {
    const [y, m] = ym.split('-').map(Number);
    const folded = S.fold.has(ym);
    const people = new Set(items.flatMap((g) => (g.entries || []).map((e) => e.runner_id))).size;
    return `<button class="month-head${folded ? ' folded' : ''}" data-act="month-fold" data-m="${ym}" aria-expanded="${!folded}">
      <span class="mh-name">${MONTH_NAMES[m - 1][0].toUpperCase() + MONTH_NAMES[m - 1].slice(1)} ${y}</span>
      <span class="mh-meta">${items.length} carrera${items.length === 1 ? '' : 's'}${people ? ` · 👥 ${people}` : ''}</span><i class="mh-arrow" aria-hidden="true">▾</i></button>
      ${folded ? '' : items.map(card).join('')}`;
  }).join('');
}

// ---------- Calendario de inscripciones (dirección y corredores) ----------

const ICON_CAL = 'M8 2v3M16 2v3M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z';
const ICON_BELL = 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0';
const ICON_LIST = 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01';
/** Interruptor «Lista | Calendario» (va encima de las carreras, ya no en la cabecera). */
const viewSwitch = () => `<div class="seg-sw" role="group" aria-label="Cómo ver las carreras"><button type="button" class="${S.regView === 'cal' ? '' : 'on'}" data-act="reg-view" data-v="list">${ico('list')}Lista</button><button type="button" class="${S.regView === 'cal' ? 'on' : ''}" data-act="reg-view" data-v="cal">${ico('cal')}Calendario</button></div>`;
const viewToggle = () => S.regView === 'cal'
  ? `<button class="icon-btn" data-act="reg-view" aria-label="Ver como lista" title="Ver como lista">${icon(ICON_LIST)}</button>`
  : `<button class="icon-btn" data-act="reg-view" aria-label="Ver calendario" title="Ver calendario">${icon(ICON_CAL)}</button>`;

/**
 * Mes con las carreras marcadas y, debajo, las tarjetas de ese mes (o del día pulsado).
 * `isMine(g)` marca los días en que el corredor ya está apuntado.
 */
function calendarView(regs, card, isMine = () => false, { done = [], doneCard = null, isPosted = null, shiftGroup = null } = {}) {
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
  const discOf = (it) => discClass(it.g.modality, it.g.subtype);
  const cell = (d) => {
    if (!d) return '<span class="cal-cell empty"></span>';
    const list = byDay.get(d) || [];
    const up = list.filter((it) => !it.past);
    const people = list.reduce((n, it) => n + it.people, 0);
    const discs = new Set(list.map(discOf));
    const pst = isPosted && list.length ? (list.every((it) => isPosted(it.g)) ? 'posted' : list.some((it) => isPosted(it.g)) ? 'part-posted' : '') : '';
    const sh = shiftGroup ? uspacShift(shiftGroup, d) : null;
    const shTag = sh ? `<em class="sh sh-${sh.code}" aria-hidden="true">${sh.code}</em>` : '';
    const cls = ['cal-cell', pst, list.length ? 'has' : '', list.length && !up.length ? 'past-only' : '', d === today ? 'today' : '',
      d === S.calDay ? 'sel' : '', d < today ? 'past' : '', list.some((it) => isMine(it.g)) ? 'mine' : '', sh ? `shc shc-${sh.code}` : '',
      list.some((it) => it.g.end_date) ? 'stage' : '', list.length ? (discs.size === 1 ? discOf(list[0]) : 'multi-mod') : '']
      .filter(Boolean).join(' ');
    const label = `${Number(d.slice(8))} de ${MONTH_NAMES[m - 1]}${sh ? ` (turno ${USPAC_NAMES[sh.code] || sh.code})` : ''}${list.length ? `: ${list.map((it) => `${it.g.name} (${modText(it.g)}${it.past ? ', ya disputada' : ''}, ${it.people} del club)`).join(', ')}` : ''}`;
    return list.length
      ? `<button class="${cls}" data-act="cal-day" data-d="${d}" aria-label="${esc(label)}"><b>${Number(d.slice(8))}</b>${shTag}
          ${people ? `<i class="cnt">${people}</i>` : ''}
          <span class="dots">${list.slice(0, 4).map((it) => `<i class="${discOf(it)}"></i>`).join('')}</span></button>`
      : `<span class="${cls}" aria-label="${esc(label)}"><b>${Number(d.slice(8))}</b>${shTag}</span>`;
  };
  const monthItems = items.filter((it) => touches(it.g, ym));
  const mineN = monthItems.filter((it) => isMine(it.g)).length;
  const monthDiscs = [...new Map(monthItems.map((it) => [discOf(it), it.g])).entries()];
  const cardOf = (it) => (it.done ? (doneCard ? doneCard(it.g) : '') : card(it.g));
  return `
    <section class="card cal">
      <div class="cal-head">
        <button class="icon-btn cal-nav" data-act="cal-month" data-n="-1" aria-label="Mes anterior">‹</button>
        <div class="cal-title"><h2>${MONTH_NAMES[m - 1][0].toUpperCase() + MONTH_NAMES[m - 1].slice(1)} ${y}</h2>
          <span class="cal-sub"><b>${monthItems.length}</b> carrera${monthItems.length === 1 ? '' : 's'}${mineN ? ` · <b class="cal-mine">${mineN} mía${mineN === 1 ? '' : 's'}</b>` : ''}</span></div>
        <button class="icon-btn cal-nav" data-act="cal-month" data-n="1" aria-label="Mes siguiente">›</button>
      </div>
      <div class="cal-grid" role="grid">
        ${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<span class="cal-dow">${d}</span>`).join('')}
        ${monthGrid(ym).flat().map(cell).join('')}
      </div>
      ${shiftGroup && monthGrid(ym).flat().some((d) => d && uspacShift(shiftGroup, d)) ? `<div class="cal-legend sh-legend" aria-label="Mis turnos"><span class="sh-who">${ico('clock')}Escamot ${esc(shiftGroup.slice(1))}</span>${['M', 'T', 'N', 'D', 'TN', 'F'].map((c) => `<span><em class="sh sh-${c}">${c}</em>${c === 'M' ? 'Mañana' : c === 'T' ? 'Tarde' : c === 'N' ? 'Noche' : c === 'F' ? 'Fiesta' : c}</span>`).join('')}</div>` : ''}
      ${monthDiscs.length ? `<div class="cal-legend">${monthDiscs.map(([k, g]) => `<span class="${discClass(g.modality, g.subtype)}"><i></i>${esc(discLabel(g.modality, g.subtype))}</span>`).join('')}</div>` : ''}
    </section>
    ${S.calDay ? `<h2 class="section">${formatDate(S.calDay)} <button class="link small" data-act="cal-day" data-d="${S.calDay}">Ver todo el mes</button></h2>` : ''}
    ${shownUp.length ? `<h2 class="section">📅 Próximas (${shownUp.length})</h2>${shownUp.map(cardOf).join('')}` : ''}
    ${shownPast.length ? `<h2 class="section past-head">🏁 Ya disputadas (${shownPast.length})</h2>${shownPast.map(cardOf).join('')}` : ''}
    ${!shown.length ? `<p class="empty">No hay carreras ${S.calDay ? 'este día' : 'este mes'}.</p>` : ''}`;
}

// ======================================================================
//  Buscador «lupa»: encontrar una carrera antes de crearla (para no duplicar)
// ======================================================================

const searchBox = (scope, placeholder, { marquee = '' } = {}) => `<label class="search${marquee ? ' has-marquee' : ''}">
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
  <input type="search" data-search="${scope}" value="${esc(S.q[scope] || '')}" placeholder="${marquee ? ' ' : esc(placeholder)}" aria-label="${esc(marquee || placeholder)}" autocomplete="off" enterkeyhint="search">
  ${marquee ? `<span class="ph-marquee" aria-hidden="true"><span>${esc(marquee)}</span></span>` : ''}</label>`;

/** Carreras de las federaciones que aún no están en el club, parecidas a lo buscado. */
function fedMatches(q, existing, limit = 5) {
  if (!S.fed?.races) return [];
  const today = todayISO();
  const have = new Set(existing.map((g) => g.date + '|' + normalize(g.name)));
  return searchRaces(q, S.fed.races.filter((r) => r.date >= today && !have.has(r.date + '|' + normalize(r.name)))).slice(0, limit);
}

const miniRow = (g, right, href = '') => `<li class="mini ${modClass(g.modality)}${href ? ' tappable' : ''}">${href ? `<a class="mini-main" href="${href}">` : '<div class="mini-main">'}${raceTile(g)}<span class="rh-main"><b>${esc(g.name)}</b>
  <small class="muted">${esc(raceSub(g))} · ${esc(modText(g))}</small></span>${href ? '</a>' : '</div>'}${right}</li>`;

// ---------- Compañeros: buscarlos por nombre y ver dónde se han apuntado ----------

/** Compañeros (sin el propio corredor): del resumen del equipo si ya cargó; si no, los que aparecen apuntados en alguna carrera. */
function teamRoster() {
  const d = S.runnerData, mine = d?.me?.id, m = new Map();
  for (const r of S.team?.runners || []) m.set(r.id, r.name);
  for (const g of d?.registrations || []) for (const e of g.entries || []) if (e.name && !m.has(e.runner_id)) m.set(e.runner_id, e.name);
  m.delete(mine);
  return [...m].map(([id, name]) => ({ id, name }));
}
/** Carga el resumen del equipo (la lista completa de compañeros) sin repintar la pantalla, para no cortar lo que se está escribiendo. */
async function ensureTeamQuiet() {
  if (S.team || S.teamLoading || !(S.code || S.previewCode)) return;
  S.teamLoading = true;
  try { S.team = await api.runnerTeam(S.code || S.previewCode); } catch { /* sin el resumen del equipo valen los apuntados */ }
  S.teamLoading = false;
  updateSearch('runner');
}
const upcomingOf = (id) => (S.runnerData?.registrations || []).filter((g) => g.date >= (S.runnerData.today || todayISO())
  && (g.entries || []).some((e) => e.runner_id === id));

/** Ventana con dónde se ha apuntado un compañero (próximas carreras) y cómo le fue en las últimas. */
function openMate(id, forYear = null) {
  const d = S.runnerData, today = d.today || todayISO(), meId = d.me.id;
  const person = [...teamRoster(), { id: meId, name: d.me.name }].find((x) => x.id === id);
  if (!person) return;
  const myYears = [...new Set((S.team?.races || []).filter((r) => (r.results || []).some((x) => x.runner_id === id)).map((r) => r.date.slice(0, 4)))].sort().reverse();
  const year = Number(forYear) || S.year || new Date().getFullYear(), isMe = id === meId;
  const regs = d.registrations.filter((g) => (g.entries || []).some((e) => e.runner_id === id)).sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = regs.filter((g) => g.date >= today), waiting = regs.filter((g) => g.date < today);
  const doneAll = (S.team?.races || []).filter((r) => r.date.slice(0, 4) === String(year) && (r.results || []).some((x) => x.runner_id === id))
    .sort((a, b) => b.date.localeCompare(a.date));
  const done = doneAll;
  const row = (g, right = '') => `<li class="mini ${modClass(g.modality)} tappable"><a class="mini-main" href="#/carrera/${g.id}"><b>${esc(g.name)}</b>
    <small class="muted">${when(g)}${place(g) ? ' · ' + esc(place(g)) : ''} · ${esc(modText(g))}${g.suspended ? ' · ⛔ suspendida' : ''}</small></a>${right}</li>`;
  const withMe = (g) => (!isMe && (g.entries || []).some((e) => e.runner_id === meId) ? '<span class="done">✓ Tú también</span>' : '');
  const dlg = document.getElementById('dialog');
  dlg.innerHTML = `<form method="dialog" class="dlg mate">
    <h2>👤 ${esc(person.name)}${isMe ? ' <small class="muted">(tú)</small>' : ''}</h2>
    <p class="hint">${upcoming.length ? `Apuntado a <b>${upcoming.length}</b> carrera${upcoming.length === 1 ? '' : 's'} próxima${upcoming.length === 1 ? '' : 's'}. Toca una para verla${S.preview || isMe ? '' : ' o apuntarte'}.` : `${isMe ? 'No estás apuntado' : 'No está apuntado'} a ninguna carrera próxima.`}</p>
    ${upcoming.length ? `<ul class="mini-list">${upcoming.map((g) => row(g, withMe(g))).join('')}</ul>` : ''}
    ${waiting.length ? `<h3 class="mate-h">🏁 Ya disputadas, sin resultado</h3><ul class="mini-list">${waiting.map((g) => row(g)).join('')}</ul>` : ''}
    ${myYears.length > 1 ? `<div class="years mate-years">${myYears.map((y) => `<button type="button" class="chip${String(y) === String(year) ? ' on' : ''}" data-mate-id="${esc(id)}" data-mate-y="${y}">${y}</button>`).join('')}</div>` : ''}
    ${done.length ? `<h3 class="mate-h">Carreras de ${year} (${doneAll.length})</h3><ul class="mini-list">${done.map((r) => {
      const x = r.results.find((y) => y.runner_id === id);
      return `<li class="mini ${modClass(r.modality)} tappable"><a class="mini-main" href="#/carrera/race_${r.id}"><b>${esc(r.name)}</b>
        <small class="muted">${when(r)}${place(r) ? ' · ' + esc(place(r)) : ''} · ${esc(modText(r))}</small></a>
        ${x.position ? `<span class="pos">${medal(x.position)} ${x.position}º</span>` : ''}${x.time_seconds ? `<small class="muted">⏱️ ${formatTime(x.time_seconds)}</small>` : ''}</li>`; }).join('')}</ul>${doneAll.length > done.length ? `<p class="hint">…y ${doneAll.length - done.length} más.</p>` : ''}` : (S.team ? `<h3 class="mate-h">Carreras de ${year}</h3><p class="hint">Todavía ninguna con resultado.</p>` : '')}
    <div class="dlg-actions"><button value="" class="btn ghost">Cerrar</button></div></form>`;
  dlg.onclose = null;
  if (!dlg.open) dlg.showModal();
}

/** Resultados del buscador del corredor: compañeros, carreras del club (apuntarse) y de las federaciones (añadir). */
function runnerSearchResults(q) {
  const d = S.runnerData;
  if (!d || normalize(q).length < 2) return '';
  const today = d.today || todayISO();
  const mates = matchPeople(q, teamRoster());
  const mine = (g) => g.entries.some((e) => e.runner_id === d.me.id);
  const club = searchRaces(q, d.registrations.filter((g) => g.date >= today)).slice(0, 6);
  const fed = fedMatches(q, d.registrations, 10);
  return `
    ${mates.length ? `<p class="hint"><b>Compañeros</b>: toca un nombre para ver dónde se ha apuntado.</p>
      <ul class="mini-list">${mates.slice(0, 6).map((m) => { const n = upcomingOf(m.id).length;
        return `<li class="mini tappable mate-row"><button type="button" class="mini-main" data-act="mate-open" data-id="${esc(m.id)}"><b>👤 ${esc(m.name)}</b>
          <small class="muted">${n ? `${n} carrera${n === 1 ? '' : 's'} próxima${n === 1 ? '' : 's'}` : 'Sin carreras próximas'}</small></button></li>`; }).join('')}</ul>
      ${mates.length > 6 ? `<p class="hint">…y ${mates.length - 6} más: escribe más letras del nombre.</p>` : ''}` : ''}
    ${club.length ? `<p class="hint"><b>Ya están en el club</b> (apúntate aquí, no hace falta crearla):</p>
      <ul class="mini-list">${club.map((g) => miniRow(g, mine(g) ? '<span class="done">✓ Apuntado</span>'
        : `<div class="mini-acts"><button class="btn primary small" data-act="r-join" data-id="${g.id}">Apuntarme</button>${g.suspended ? '' : starBtn(g, 'w-add-reg', ['id', g.id])}</div>`)).join('')}</ul>` : ''}
    ${fed.length ? `<p class="hint"><b>En los calendarios de las federaciones y ligas</b>:</p>
      <ul class="mini-list">${fed.map((r) => miniRow(r, `<div class="mini-acts">${r.tbc ? '<small class="muted">📅 Fecha por confirmar</small>' : `<button class="btn small" data-act="r-new-fed" data-i="${S.fed.races.indexOf(r)}">Añadir y apuntarme</button>`}${starBtn(r, 'w-add-fed', ['i', S.fed.races.indexOf(r)])}</div>`)).join('')}</ul>` : ''}
    ${!club.length && !fed.length && !mates.length ? `<p class="hint">No hay ninguna carrera parecida a «${esc(q)}».</p>
      <button class="btn primary block" data-act="r-new">＋ ¿No la encuentras? Añádela: «${esc(q.trim())}»</button>`
      : `<button class="btn ghost block small-add" data-act="r-new">＋ ¿No es ninguna de estas? Añadir una carrera nueva</button>`}`;
}

function updateSearch(scope) {
  if (scope === 'runner') {
    const box = $app.querySelector('#search-results');
    if (box) box.innerHTML = runnerSearchResults(S.q.runner);
    const pulse = $app.querySelector('#pulse-box');
    if (pulse && S.runnerData) pulse.innerHTML = normalize(S.q.runner || '').length >= 2 ? '' : teamPulse(S.runnerData);
  } else if (scope === 'admin') {
    const box = $app.querySelector('#reg-list');
    if (box) box.innerHTML = adminRegList();
  } else if (scope === 'rlist') {
    const box = $app.querySelector('#runner-list');
    if (box) box.innerHTML = runnersListHtml();
  } else if (scope === 'races') {
    const box = $app.querySelector('#race-list');
    if (box) box.innerHTML = raceListHtml();
  } else if (scope === 'rname') {
    const box = $app.querySelector('#dup-list');
    if (box) box.innerHTML = S.rdraft?.wk != null ? watchDupSuggestions(S.rdraft.name || '') : dupSuggestions(S.rdraft?.name || '', S.runnerData.registrations, true);
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
  modality: 'Carretera', race_type: 'suelta', circuit: '', subtype: '', km: '', category: '', url: '', elevation: '', price: '', ...pre });

/** Formulario para que el corredor ponga o cambie SU resultado. id = «reg_<uuid>» o «race_<uuid>». */
function viewRunnerReport(key) {
  const d = S.runnerData;
  const [kind, id] = [key.slice(0, key.indexOf('_')), key.slice(key.indexOf('_') + 1)];
  const race = kind === 'reg' ? d.registrations.find((g) => g.id === id) : (d.my_results || []).find((r) => r.race_id === id);
  const back = runnerHref('mi');
  if (!race) return frame('Mi resultado', '<p class="empty">No se encuentra esta carrera.</p>', { back });
  const cur = kind === 'reg' ? race.my_result : (race.position ? race : null); // resultado ya puesto (para cambiarlo)
  const cat = kind === 'reg' ? race.entries.find((e) => e.runner_id === d.me.id)?.category : race.category;
  return frame(cur ? 'Cambiar mi resultado' : 'Mi resultado', `${previewBanner()}
    <form class="card stack" data-form="r-report" data-kind="${kind}" data-id="${id}">
      <div><h3 class="rname">${esc(race.name)}</h3><p class="muted">${when(race)}${place(race) ? ' · ' + esc(place(race)) : ''} · ${esc(modText(race))}</p></div>
      <div class="grid2">
        <label>Tu puesto<input type="number" name="position" inputmode="numeric" min="1" max="999" required autofocus value="${esc(cur?.position ?? '')}"></label>
        <label>Categoría${catSelect('name="category"', cat || d.me.category || '', 'Categoría')}</label>
      </div>
      <div class="tf-row"><span class="flabel">⏱️ Tu tiempo <small class="muted">(opcional)</small></span>${timeFields(cur?.time_seconds, 'name="time"')}</div>
      <p class="hint">Escribe solo números en cada casilla, tal como sale en la clasificación: para <b>2 h 05 min</b> pon 2 · 05; si fue menos de una hora, deja las horas vacías (45 min). Sirve para ver cuántas horas acumula cada uno en Equipo.</p>
      <input type="hidden" name="podium" value="${podiumKind(race, cur?.podium_type)}">
      ${race.race_type === 'circuito' ? `<p class="hint">🏆 Esta carrera es puntuable de <b>${esc(race.circuit || 'un circuito')}</b>. Aquí pones solo tu puesto en <b>esta prueba</b>. Si acabas en el podio de la <b>general final</b>, se pide aparte, al terminar la liga, en <b>Contrato → Plus de bonificación</b>.</p>` : ''}
      <p class="hint">${cur ? `Ahora tienes <b>${isPodium(cur.position) ? medal(cur.position) + ' ' : ''}${cur.position}º</b>. ` : ''}Puedes cambiarlo tú cuando quieras. El puesto <b>no cambia tu bono</b> (cuenta participar); los podios en la general final de una liga (plus) se piden aparte y los confirma la dirección.</p>
      ${S.preview ? '' : `<button class="btn primary">${cur ? 'Guardar el cambio' : 'Enviar mi resultado'}</button>`}
    </form>`, { back });
}

/** Tipo de podio que lleva un resultado del corredor: no lo elige él (solo sirve para las estadísticas); la dirección puede cambiarlo. */
const podiumKind = (race, current) => (PODIUM_TYPES.some((t) => t.id === current) ? current : race?.race_type === 'campeonato' ? 'campeonato' : 'suelta');

function viewRunnerNew() {
  if (!S.rdraft || S.rdraft.wk != null) S.rdraft = emptyRunnerDraft({ name: S.q.runner || '' });
  const d = S.rdraft;
  const editing = !!d.id, isRace = d.kind === 'race';
  const reg = editing && !isRace ? S.runnerData.registrations.find((x) => x.id === d.id) : null;
  const mineCreated = editing && (isRace ? !!(S.runnerData.my_results || []).find((x) => x.race_id === d.id)?.mine_created : !!reg?.mine_created);
  const pv = racePreview(d);
  const others = isRace ? d.others || 0 : reg ? reg.entries.filter((e) => e.runner_id !== S.runnerData.me.id).length : 0;
  if (!S.fed && !editing) loadFed().then(() => updateSearch('rname'));
  return frame(editing ? 'Editar mi carrera' : 'Añadir carrera', `
    <form class="stack rform" data-form="r-create">
      <details class="rform-help"><summary>${ico('info')}<span>${editing ? 'Qué puedes cambiar aquí' : 'Cómo se añade una carrera'}</span></summary>
        <p class="hint">${editing ? `Puedes corregir los datos de esta carrera porque la añadiste tú${isRace ? ' (aunque ya esté en resultados)' : ''}. Tu puesto lo cambias en «Cambiar mi resultado»; el de los demás lo pone cada uno.`
          : 'Escribe el nombre: si ya existe en el club o en el calendario de las federaciones te saldrá aquí debajo, para no duplicarla.<br>¿Se te olvidó apuntar una carrera que ya hiciste? Añádela igual con su fecha (desde el 1 de enero del año pasado) y luego pon tu resultado.'}</p></details>
      ${fsecD('rf1', 1, 'flag', 'Qué carrera es', pv[0], `<label class="flabel-l">Nombre de la carrera<input data-rf="name" value="${esc(d.name)}" required minlength="3" maxlength="120" autocomplete="off"></label>
        <div id="dup-list">${editing ? '' : dupSuggestions(d.name, S.runnerData.registrations, true)}</div>`, '#1f6fd1', !editing)}
      ${fsecD('rf2', 2, 'cal', 'Cuándo y dónde', pv[1], `<label class="flabel-l">${d.multi ? 'Primer día' : 'Fecha'}<input type="date" data-rf="date" value="${esc(d.date)}" min="${pastLimit()}"${isRace ? ` max="${todayISO()}"` : ''} required></label>
        <label class="check"><input type="checkbox" data-rf-multi ${d.multi ? 'checked' : ''}> Carrera de varios días (por etapas)</label>
        ${d.multi ? `<label class="flabel-l">Último día<input type="date" data-rf="end_date" value="${esc(d.end_date)}" min="${esc(d.date || pastLimit())}" required></label>` : ''}
        <label class="flabel-l">Lugar<input data-rf="place" value="${esc(d.place)}" maxlength="120" placeholder="Ciudad o pueblo"></label>
        <div class="grid2"><label class="flabel-l">Provincia<input data-rf="province" list="dl-prov" value="${esc(d.province)}" autocomplete="off"></label>
          ${editing ? `<label class="flabel-l">País<input data-rf="country" list="dl-country" value="${esc(d.country || '')}" maxlength="60"></label>` : '<span></span>'}</div>`, '#0f9d8a', !editing)}
      ${fsecD('rf3', 3, 'bars', 'Qué tipo de carrera es', pv[2], `<div class="disc-field"><span class="flabel">Modalidad</span>${modalityChips(d, 'data-rf')}</div>
        ${detailInputs(d, 'data-rf')}
        ${S.runnerData.circuits ? typeFields(d, 'data-rf') : ''}`, '#e07800', !editing)}
      ${fsecD('rf4', 4, 'mountain', 'Más datos (opcionales)', pv[3], `<div class="grid2"><label class="flabel-l">Desnivel positivo (m)<input type="text" inputmode="numeric" data-rf="elevation" value="${esc(d.elevation ?? '')}" maxlength="6" placeholder="1200" autocomplete="off"></label>
        <label class="flabel-l">Precio inscripción (€)<input type="text" inputmode="decimal" data-rf="price" value="${esc(d.price ?? '')}" maxlength="8" placeholder="25" autocomplete="off"></label></div>
        ${isRace ? '' : `<label class="flabel-l">Web de la carrera<input type="text" inputmode="url" data-rf="url" value="${esc(d.url || '')}" maxlength="500" placeholder="https://…" autocomplete="off"></label>`}
        <p class="hint">Los ven todos los corredores y salen en las estadísticas del club (metros de subida, coste de competir…). Si no los sabes, déjalos vacíos: cualquier compañero podrá completarlos después. Para el precio, 0 = gratis.</p>`, '#2f6fd6')}
      ${fsecD('rf5', 5, 'users', editing ? 'Notas' : 'Tú', editing ? (d.notes ? 'con notas' : '') : d.category, editing ? `<label class="flabel-l">Notas<textarea data-rf="notes" rows="2" maxlength="500">${esc(d.notes || '')}</textarea></label>`
        : `<label class="flabel-l">Tu categoría${catSelect('data-rf="category" required', d.category, 'Elige tu categoría')}</label>`, '#8e44ad', !editing)}
      <button class="btn primary big-save">${editing ? 'Guardar cambios' : 'Añadir y apuntarme'}</button>
      <p class="hint">${editing ? 'Cualquier corredor puede corregir estos datos; cada cambio queda anotado con tu nombre en el historial de la dirección.' : 'La dirección del club podrá corregirla o borrarla si hace falta.'}</p>
    </form>
    ${editing && !mineCreated ? '<p class="card hint">🗑️ Borrar la carrera solo puede hacerlo quien la añadió o la dirección del club.</p>' : editing ? (others
      ? `<p class="card hint">🗑️ No puedes borrarla: hay ${others} compañero${others === 1 ? '' : 's'} más ${isRace ? 'con resultado en ella' : 'apuntado' + (others === 1 ? '' : 's')}. Si hay que quitarla, pídeselo a la dirección del club.</p>`
      : '<div class="wf-acts"><button class="btn danger ghost" data-act="r-delete-mine">🗑️ Borrar esta carrera</button></div>') : ''}`, { back: isRace ? runnerHref('mi') : runnerHref('') });
}


/** Iconos de línea (estilo Lucide) de Mi temporada: sustituyen a los emojis grandes. */
const ICO = {
  cal: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  ok: 'M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.78 4.78 4 4 0 0 1-6.74 0 4 4 0 0 1-4.78-4.78 4 4 0 0 1 0-6.74zM9 12l2 2 4-4',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
  ban: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v4M12 16h.01',
  go: 'M9 18l6-6-6-6',
  pen: 'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
  trophy: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z',
  book: 'M4 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM2 6h4M2 10h4M2 14h4M2 18h4M9 7h7M9 11h5',
  route: 'M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM9 16h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  ruler: 'M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0zM14.5 12.5l2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  calplus: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM12 14v4M10 16h4',
  check: 'M20 6L9 17l-5-5',
  share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13',
  layers: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  calcheck: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 16l2 2 4-4',
  timer: 'M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  folder: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z',
  money: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  idcard: 'M16 10h2M16 14h2M6.17 15a3 3 0 0 1 5.66 0M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  ext: 'M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  shirt: 'M20.4 3.5L16 2a4 4 0 0 1-8 0L3.6 3.5a2 2 0 0 0-1.3 2.2l.6 3.5a1 1 0 0 0 1 .8H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.1a1 1 0 0 0 1-.8l.6-3.5a2 2 0 0 0-1.3-2.2z',
  medal: 'M7.2 15L2.7 7.1a2 2 0 0 1 .1-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.1a2 2 0 0 1 .1 2.2L16.8 15M12 22a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 15.5v3',
  bars: 'M12 20V10M18 20V4M6 20v-4',
  euro: 'M4 10h12M4 14h9M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2',
  chevd: 'M6 9l6 6 6-6',
  home: 'M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  alert: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  msg: 'M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.7A8.4 8.4 0 1 1 21 11.5z',
  act: 'M22 12h-4l-3 9L9 3l-3 9H2',
  db: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  mountain: 'm8 3 4 8 5-5 5 15H2L8 3z',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  image: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  pin: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  clip: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3z',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
  plus: 'M12 5v14M5 12h14',
};
const ico = (k, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICO[k]}"/></svg>`;
/** Medalla de podio dibujada (sin emoji): círculo oro / plata / bronce con el puesto. */
const medalBadge = (p) => `<i class="medal m${p}" aria-label="Puesto ${p}">${p}</i>`;
/** Fila de carrera de Mi temporada: nombre y etiqueta («en 2 días · M40»), fecha en negrita · lugar y modalidad; flecha › a la derecha. */
const mrow = (g, { below = '', end = '', hero = false, side = '' } = {}) => {
  // Mi temporada usa la misma ficha desplegable que Carreras: al abrirla sale ya toda la información, sin otro menú
  const badge = hero ? '<span class="hero-badge">Próxima cita</span>' : '';
  const due = g.entries && S.payDue?.has(g.id);   // pago que ya toca (la carrera es dentro de una semana): en rojo, como la casilla de Pendientes
  if (g.entries) return `<li class="mrow-fold${hero ? ' hero' : ''}${due ? ' pay-due' : ''}">${badge}${due ? `<span class="due-badge">${ico('euro')}Pagar</span>` : ''}${runnerRegCard(g, { cls: hero ? 'hero' : '', noPast: true, notes: true })}</li>`;
  // carrera ya disputada con mi resultado (la ficha de «resultados» + lo mío)
  const me = S.runnerData?.me?.id, race = S.team?.races?.find((x) => x.id === g.race_id), count = (race?.results || []).length;
  const body = `${myPubLine({ ...g, entries: undefined })}${race ? doneRaceBody(race, { meId: me }) : typeTag(g)}${completeBox({ ...(race || {}), ...g }, 'race', g.race_id)}${below ? `<div class="mrow-below">${below}</div>` : ''}${end ? `<div class="mrow-acts">${end}</div>` : ''}`;
  return `<li class="mrow-fold">${raceFold(g, { key: `mr-r${g.race_id}`, side: `${myPubChip({ ...g, entries: undefined })}${side || (race ? `<span class="rc-n" title="Del club" aria-label="${count} del club">${ico('users')}${count}</span>` : '')}`, body, noPast: true, cls: 'done-race' })}</li>`;
};

/** «Mis carreras»: sus carreras con resultados por temporada y las apuntadas pendientes de resultado. */
const dayMon = (iso) => (iso ? `${Number(iso.slice(8, 10))} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(iso.slice(5, 7)) - 1]}` : '');
/** Mi entrada en una carrera (la del corredor que mira). */
const myEntry = (g) => (g.entries || []).find((e) => e.runner_id === S.runnerData?.me?.id);
/** Resumen rápido: cuántas de mis próximas carreras están pagadas y cuántas no. */
function payLine(list) {
  const mine = list.map(myEntry).filter(Boolean);
  if (!mine.length) return '';
  const paid = mine.filter((e) => e.paid).length, unpaid = mine.length - paid;
  return `<p class="pay-sum"><span class="ok">${ico('euro')}${paid} ${paid === 1 ? 'pagada' : 'pagadas'}</span>${unpaid ? `<span class="wait">${unpaid} sin pagar</span>` : ''}</p>`;
}
function payLineInline(list) {
  const mine = list.map(myEntry).filter(Boolean);
  if (!mine.length) return '';
  const paid = mine.filter((e) => e.paid).length, unpaid = mine.length - paid;
  return `<span class="ok">${ico('euro')}${paid} ${paid === 1 ? 'pagada' : 'pagadas'}</span>${unpaid ? `<span class="wait">${unpaid} sin pagar</span>` : ''}`;
}
/** Estado de pago en la cabecera de cada inscripción de Mi temporada: de un vistazo cuáles faltan por pagar. */
const payBadge = (g, opts = {}) => { const e = opts.notes && !g.suspended && g.date >= (S.runnerData?.today || todayISO()) ? myEntry(g) : null;
  return e ? `<span class="rc-pay ${e.paid ? 'on' : 'due'}" title="${e.paid ? 'Inscripción pagada' : 'Pendiente de pagar'}">${ico('euro')}${e.paid ? 'Pagada' : 'Pendiente'}</span>` : ''; };
/** Fila de chips de una inscripción: desde cuándo estoy inscrito y si está pagada (y cuándo). */
function payChips(g) {
  const e = myEntry(g);
  if (!e) return '';
  const label = e.paid ? `Pagada${e.paid_on ? ` · ${dayMon(e.paid_on)}` : ''}${e.paid_amount != null ? ` · ${euros(e.paid_amount)}` : ''}` : 'Sin pagar';
  const chip = `${ico('euro')}${label}`;
  return `${e.joined_on ? `<span class="ins-chip">${ico('check')}Inscrito ${dayMon(e.joined_on)}</span>` : ''}${S.preview ? `<span class="pay-chip${e.paid ? ' on' : ''}">${chip}</span>` : `<button type="button" class="pay-chip${e.paid ? ' on' : ''}" data-act="r-paid" data-id="${g.id}">${chip}</button>`}`;
}

function myRacesCard(d, afterSummary = () => '') {
  const results = d.my_results;
  if (!results) return ''; // base de datos aún sin actualizar
  const today = d.today || todayISO();
  const mineReg = d.registrations.filter((g) => g.entries.some((e) => e.runner_id === d.me.id));
  const pastReg = mineReg.filter((g) => g.date < today && !g.suspended);
  const pending = pastReg.filter((g) => !g.my_result);   // les falta poner el puesto
  const noPos = results.filter((r) => !r.position);          // carreras ya en resultados donde participó pero no consta su puesto: también le falta ponerlo
  const pendingN = pending.length + noPos.length;
  // «al día»: resultados sin poner, crónicas sin pasar y pagos que ya tocan (carrera dentro de una semana), lo siguiente y la racha
  const ad = alDia(d, S.chron instanceof Set ? S.chron : null, today, S.myYear || new Date().getFullYear());
  S.payDue = new Set(ad.items.filter((x) => x.type === 'pay').map((x) => x.id));
  const todoN = ad.total, pl = (n, a, b) => (n === 1 ? a : b);
  const parts = [ad.counts.result ? `${ad.counts.result} resultado${pl(ad.counts.result, '', 's')}` : '', ad.counts.cron ? `${ad.counts.cron} crónica${pl(ad.counts.cron, '', 's')}` : '', ad.counts.pay ? `${ad.counts.pay} pago${pl(ad.counts.pay, '', 's')}` : ''].filter(Boolean);
  const todoTxt = !parts.length ? 'todo al día' : parts.length === 1 ? `falta${pl(ad.total, '', 'n')} ${parts[0]}` : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
  const heroId = mineReg.filter((g) => g.date >= today && !g.suspended).sort((a, b) => a.date.localeCompare(b.date))[0]?.id;
  const todoTo = ad.counts.result || !ad.total ? 'sec-pend' : ad.counts.cron ? 'sec-chro' : S.payDue.has(heroId) ? 'sec-hero' : 'sec-next';
  const sent = pastReg.filter((g) => g.my_result);        // ya puso su puesto: cuenta para el bono aunque la dirección aún no la haya pasado a resultados
  const upcoming = mineReg.filter((g) => g.date >= today && !g.suspended).sort((a, b) => a.date.localeCompare(b.date));
  const cancelled = mineReg.filter((g) => g.suspended).sort((a, b) => a.date.localeCompare(b.date));
  const years = [...new Set([new Date().getFullYear(), ...results.map((r) => yearOf(r.date))])].sort((a, b) => b - a);
  if (!years.includes(S.myYear)) S.myYear = years[0];
  const upcomingYear = upcoming.filter((g) => yearOf(g.date) === S.myYear);
  // «Próximas» es de una temporada, salvo el solape de fin de año: las carreras de la temporada siguiente que caen en los próximos 60 días
  // (por ejemplo las de enero cuando estamos en noviembre o diciembre) también cuentan. Las de más adelante (febrero, junio…) no se mezclan.
  const OVERLAP_DAYS = 60, curYear = new Date().getFullYear();
  const upOther = S.myYear === curYear ? upcoming.filter((g) => yearOf(g.date) > S.myYear && daysTo(g.date) <= OVERLAP_DAYS) : [];
  const upTile = [...upcomingYear, ...upOther], upOtherYears = [...new Set(upOther.map((g) => yearOf(g.date)))].sort();
  const upSub = upOther.length ? `${upcomingYear.length} de ${S.myYear} + ${upOther.length} de ${upOtherYears.length === 1 ? upOtherYears[0] : 'enero'}` : 'inscrito';
  const list = results.filter((r) => yearOf(r.date) === S.myYear);
  const days = list.reduce((n, r) => n + numDays(r.date, r.end_date), 0);
  const row = (r) => {
    const stagePods = (r.stage_positions || []).slice(0, (r.stages || []).length).map((p, i) => ({ p, n: stageName(r, i) })).filter((x) => isPodium(x.p));
    const badge = r.position ? `${isPodium(r.position) ? medalBadge(r.position) : `${r.position}º`}${r.category ? ` <small>${esc(r.category)}</small>` : ''}` : '';
    const extra = [r.time_seconds ? `<small class="muted">${formatTime(r.time_seconds)}</small>` : '', r.self_reported ? '<small class="self-res">puesto por ti</small>' : '',
      stagePods.length ? `<small>${stagePods.map((x) => `${medalBadge(x.p)} ${esc(x.n)}`).join(' · ')}</small>` : ''].filter(Boolean).join(' · ');
    return mrow(r, { href: `${runnerHref('carrera')}/race_${r.race_id}`, side: `<span class="pos">${badge || '<span class="rc-none">sin puesto</span>'}</span>`, below: extra,
      end: `${!r.position && !S.preview ? `<a class="btn primary small" href="#/resultado/race_${r.race_id}">Poner mi puesto</a>` : ''}${!S.preview ? `<a class="edit-btn" href="#/editar/race_${r.race_id}" aria-label="Editar los datos de ${esc(r.name)}">${ico('pen')}Editar datos</a>` : ''}` });
  };
  const myCat = (g) => g.entries.find((e) => e.runner_id === d.me.id)?.category;
  const editMine = (g) => (g.mine_created && !S.preview ? `<a class="edit-ico" href="#/editar/${g.id}" aria-label="Editar o borrar ${esc(g.name)}" title="Editar o borrar">${ico('pen')}</a>` : '');
  const dleft = (g) => { const n = Math.round((new Date(g.date + 'T12:00:00Z') - new Date(today + 'T12:00:00Z')) / 864e5);
    return n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`; };
  return `
  <section class="card sum-card"><div class="sum-head"><h2>Mis carreras ${S.myYear}</h2>${ico('trophy', 'sum-trophy')}</div>
    <div class="tiles">
      <a href="#" class="tile t-next" data-act="goto-sec" data-to="sec-next"><span class="t-n">${upTile.length}</span><span class="t-l">Próximas</span>${ico('cal', 't-ico')}<small>${upSub}</small></a>
      <a href="#" class="tile t-done" data-act="goto-sec" data-to="sec-done"><span class="t-n">${list.length + sent.filter((g) => yearOf(g.date) === S.myYear).length}</span><span class="t-l">Hechas</span>${ico('ok', 't-ico')}<small>${days !== list.length ? `${days} días de competición` : 'con resultado'}</small></a>
      <a href="#" class="tile t-pend${todoN ? ' alert' : ''}" data-act="goto-sec" data-to="${todoTo}"><span class="t-n">${todoN}</span><span class="t-l">Pendientes</span>${ico('flag', 't-ico')}<small>${todoTxt}</small></a>
    </div>
    ${(() => { const n = ad.next, ageTxt = (x) => (x.age <= 7 ? `te ${7 - x.age === 1 ? 'queda 1 día' : `quedan ${7 - x.age} días`}` : `hace ${x.age} días`);
      const txt = !n ? (upcoming[0] ? `Estás al día. Lo próximo: <b>${esc(upcoming[0].name)}</b> · ${dleft(upcoming[0])}` : 'Estás al día.')
        : n.type === 'result' ? `Pon tu puesto en <b>${esc(n.name)}</b> · ${ageTxt(n)}` : n.type === 'cron' ? `Pasa la crónica de <b>${esc(n.name)}</b> · ${ageTxt(n)}` : `Marca el pago de <b>${esc(n.name)}</b> · ${n.in === 0 ? 'es hoy' : n.in === 1 ? 'es mañana' : `en ${n.in} días`}`;
      const to = !n ? (upcoming[0] ? 'sec-hero' : 'sec-pend') : n.type === 'result' ? 'sec-pend' : n.type === 'cron' ? 'sec-chro' : 'sec-next';
      return `<div class="sum-todo"><a href="#" class="sum-next${n ? ' has' : ' ok'}" data-act="goto-sec" data-to="${to}">${ico(n ? 'flag' : 'ok')}<span>${txt}</span>${ico('go')}</a>
        <div class="sum-meta">${ad.streak ? (() => { const me = streakRows().find((x) => x.id === d.me.id); return `<a class="sum-streak" href="${runnerHref('equipo')}" title="Carreras seguidas con tu resultado puesto y tu crónica pasada. Toca para ver la clasificación del club.">🔥 <b>${ad.streak}</b> ${pl(ad.streak, 'carrera seguida', 'carreras seguidas')} al día${me ? ` · <b>${me.pos}º</b> del club` : ''}</a>`; })() : ''}</div></div>`; })()}
    ${cancelled.length ? `<a href="#" class="canc-line" data-act="goto-sec" data-to="sec-canc">${ico('ban')}<span><b>${cancelled.length}</b> ${cancelled.length === 1 ? 'carrera suspendida' : 'carreras suspendidas'}</span>${ico('go')}</a>` : ''}
    ${(() => { const sentYear = sent.filter((g) => yearOf(g.date) === S.myYear).map((g) => ({ position: g.my_result.position, time_seconds: g.my_result.time_seconds })), allMine = [...list, ...sentYear];   // los enviados también cuentan
      const pod = [1, 2, 3].map((k) => allMine.filter((x) => x.position === k).length), NAMES = [['Oro', 'Oros'], ['Plata', 'Platas'], ['Bronce', 'Bronces']];
      // una sola línea pequeña: tiempo en carrera y, al lado, km de viaje (ida y vuelta, aprox.)
      // una sola fila: las horas encima de la bici con el maillot (lo que más se ve) y, al lado, los km totales de esas carreras
      const myTime = allMine.reduce((n, r) => n + (Number(r.time_seconds) || 0), 0), myKm = list.reduce((n, r) => n + (Number(r.km) || 0), 0) + sent.filter((g) => yearOf(g.date) === S.myYear).reduce((n, g) => n + (Number(g.km) || 0), 0);
      const mySpeed = avgSpeed([...list, ...sent.filter((g) => yearOf(g.date) === S.myYear).map((g) => ({ km: g.km, time_seconds: g.my_result.time_seconds }))]);   // tiempo por km
      const road = myTime || myKm ? `<p class="my-line">${myTime ? `<span title="Tiempo total en carrera" aria-label="Tiempo total en carrera">${ico('timer')}<b>${formatTime(myTime, true)}</b></span>` : ''}${myKm ? `<span title="Kilómetros totales de las carreras que has hecho" aria-label="Kilómetros totales en carrera">${ico('ruler')}<b>${kmText(Math.round(myKm))}</b></span>` : ''}${mySpeed.pace ? `<span title="Tiempo por km: por cada km de carrera tardas de media ${paceText(mySpeed.pace)} (${kmText(Math.round(mySpeed.km))} en ${formatTime(mySpeed.sec, true)}; carreras con distancia y tiempo)" aria-label="Tiempo por kilómetro">${ico('route')}<b>${paceText(mySpeed.pace)}</b></span>` : ''}</p>` : '';
      return (pod.some(Boolean) ? `<div class="pod-row" aria-label="Podios ${S.myYear}"><b class="pod-title">Podios ${S.myYear}:</b>${pod.map((n, i) => (n ? `<span class="pod-pill m${i + 1}"><i class="medal m${i + 1}"></i>${n} ${NAMES[i][n === 1 ? 0 : 1]}</span>` : '')).join('')}</div>` : '') + road; })()}
  </section>

  ${pendingN ? `<section class="card chro-card pend-card has-pend" id="sec-pend"><details class="chro-det" data-open-key="pend"${S.open?.pend ? ' open' : ''}>
    <summary><span class="chro-ic">${ico('flag')}</span><b class="chro-t">Sin resultado</b>
      <span class="chro-tag pend">${pendingN} ${pendingN === 1 ? 'pendiente' : 'pendientes'}${ico('go')}</span></summary>
    <p class="hint">Pon tu puesto: en cuanto lo pongas <b>ya cuenta para el bono</b>. Si no fuiste, pulsa «No fui: borrarme». ${WEEK_RULE}</p>
    <ul class="mini-list">${pending.map((g) => mrow(g, { href: `${runnerHref('carrera')}/${g.id}`,
      edit: editMine(g),
      below: weekChip(g.end_date || g.date, today) + (S.preview ? '<span class="badge-pend">pendiente</span>' : `<a class="btn primary small" href="#/resultado/reg_${g.id}">Poner mi resultado</a><button type="button" class="btn ghost small" data-act="r-leave" data-id="${g.id}">No fui: borrarme</button>`) })).join('')}${noPos.map((r) => mrow(r, { href: `${runnerHref('carrera')}/race_${r.race_id}`,
      below: weekChip(r.end_date || r.date, today) + (S.preview ? '<span class="badge-pend">sin puesto</span>' : `<a class="btn primary small" href="#/resultado/race_${r.race_id}">Poner mi puesto</a>`) })).join('')}</ul>
  </details></section>` : ''}
  ${sent.length ? `<section class="card chro-card sent-card"><details class="chro-det" data-open-key="sent"${S.open?.sent ? ' open' : ''}>
    <summary><span class="chro-ic">${ico('check')}</span><b class="chro-t">Resultado enviado</b>
      <span class="chro-tag ok">${sent.length}${ico('go')}</span></summary>
    <p class="hint">Lo que pones vale tal cual y ya cuenta para tu bono; nadie tiene que validarlo. Una semana después de la carrera pasa solo a la clasificación del equipo (se espera por si otros compañeros ponen también su resultado). Mientras tanto puedes cambiar el puesto o el tiempo.</p>
    <ul class="mini-list">${sent.map((g) => mrow(g, { href: `${runnerHref('carrera')}/${g.id}`, edit: editMine(g),
      below: `<span class="badge-sent">${g.my_result.position}º${g.my_result.time_seconds ? ' · ' + formatTime(g.my_result.time_seconds) : ''} · ya cuenta</span>${S.preview ? '' : `<a class="edit-btn" href="#/resultado/reg_${g.id}">${ico('pen')}Cambiar</a>`}` })).join('')}</ul>
  </details></section>` : ''}

  ${afterSummary()}

  ${upcoming.length ? `<ul class="mini-list next-hero" id="sec-hero">${mrow(upcoming[0], { href: `${runnerHref('carrera')}/${upcoming[0].id}`, hero: true, pill: `${dleft(upcoming[0])}${myCat(upcoming[0]) ? ` · ${esc(myCat(upcoming[0]))}` : ''}`, edit: editMine(upcoming[0]), below: payChips(upcoming[0]) })}</ul>` : ''}

  <details class="card season-block next-block desp${upcoming.slice(1).some((g) => S.payDue.has(g.id)) ? ' has-pend' : ''}" id="sec-next" data-open-key="next"${S.open?.next ? ' open' : ''}>
    <summary><span class="desp-t">Mis próximas inscripciones <small>(${(() => { const by = new Map(); for (const g of upcoming) by.set(yearOf(g.date), (by.get(yearOf(g.date)) || 0) + 1); return by.size > 1 || (by.size === 1 && !by.has(S.myYear)) ? [...by].sort((x, y) => x[0] - y[0]).map(([y, n]) => `${n} de ${y}`).join(' + ') : upcoming.length; })()})</small></span>${ico('chevd', 'desp-chev')}
      ${upcoming.length ? `<span class="desp-sub">${payLineInline(upcoming)}${upcoming.slice(1).some((g) => S.payDue.has(g.id)) ? `<span class="due">${upcoming.slice(1).filter((g) => S.payDue.has(g.id)).length} por pagar ya</span>` : ''}</span>` : ''}</summary>
    <p class="hint">Carreras a las que estás apuntado y que aún no se han corrido. <b>Toca una</b> para abrirla: ves quién va, puedes borrarte y, si la añadiste tú, editarla.</p>
    ${upcoming.length > 1 ? `<ul class="mini-list">${upcoming.slice(1).map((g) => mrow(g, { href: `${runnerHref('carrera')}/${g.id}`, pill: `${dleft(g)}${myCat(g) ? ` · ${esc(myCat(g))}` : ''}`, edit: editMine(g), below: payChips(g) })).join('')}</ul>`
      : upcoming.length ? '<p class="empty small">No tienes más carreras apuntadas: la próxima cita está arriba.</p>'
      : '<p class="empty small">No estás apuntado a ninguna. Búscalas en la pestaña Carreras.</p>'}
  </details>

  ${(() => { const todo = results.filter((x) => missingFields(x).length);
    return todo.length && !S.preview ? `<details class="card season-block"><summary><b>📝 Ayuda a completar tus carreras (${todo.length})</b></summary>
      <p class="hint">Les faltan datos (provincia, distancia o formato). Si los sabes, tócalas y rellénalos: así todos tenemos el resumen completo.</p>
      <ul class="mini-list">${todo.slice(0, 20).map((x) => miniRow(x, `<span class="badge-pend">${missingFields(x).map((k) => FIELD_LABELS[k]).join(', ')}</span>`, `${runnerHref('carrera')}/race_${x.race_id}`)).join('')}</ul></details>` : ''; })()}

  ${cancelled.length ? `<section class="card season-block canc-block" id="sec-canc">
    <h2 class="sec-h">Suspendidas <small>(${cancelled.length})</small></h2>
    <p class="hint">Carreras suspendidas en las que estabas inscrito.</p>
    <ul class="mini-list">${cancelled.map((g) => mrow(g, { href: `${runnerHref('carrera')}/${g.id}`, below: '<span class="badge-pend">suspendida</span>' })).join('')}</ul>
  </section>` : ''}

  <details class="card season-block done-block desp" id="sec-done" data-open-key="done"${S.open?.done ? ' open' : ''}>
    <summary><span class="desp-t">Carreras hechas ${S.myYear} <small>${list.length} ${list.length === 1 ? 'finalizada' : 'finalizadas'}${days !== list.length ? ` · ${days} jornadas` : ''}</small></span>${ico('chevd', 'desp-chev')}</summary>
    ${years.length > 1 ? `<div class="years">${years.map((y) => `<button class="chip${y === S.myYear ? ' on' : ''}" data-act="my-year" data-y="${y}">${y}</button>`).join('')}</div>` : ''}
    ${list.length ? `<ul class="mini-list">${list.map(row).join('')}</ul>`
      : `<p class="empty small">Todavía no hay carreras tuyas con resultado en ${S.myYear}.</p>`}
    <p class="hint">Si falta alguna carrera o un puesto, díselo a la dirección del club.${!S.preview ? ' Los datos de cada carrera los puede corregir cualquiera (botón «Editar datos»); borrar solo quien la añadió.' : ''}</p>
  </details>`;
}


/** Aviso del contrato al apuntarse a una carrera ya corrida (mensaje automático) y al pasar la crónica. */
/** Plazo orientativo de una semana para poner el resultado y hacer la crónica. Pasada la semana NO se cierra nada: sigue abierto. */
const WEEK_RULE = 'Tienes <b>una semana</b> desde la carrera para poner el resultado y hacer la crónica. Si pasa, no pasa nada: sigue abierto para que lo hagas cuando puedas.';
const weekChip = (date, today) => { const n = Math.round((new Date(today + 'T12:00:00Z') - new Date(String(date).slice(0, 10) + 'T12:00:00Z')) / 864e5);
  if (n < 0) return '';
  return n <= 7 ? `<span class="wk-chip${n >= 6 ? ' soon' : ''}">${ico('clock', 't-i')}${n >= 7 ? 'último día de la semana' : `te ${7 - n === 1 ? 'queda 1 día' : `quedan ${7 - n} días`}`}</span>` : `<span class="wk-chip over">${ico('clock', 't-i')}pasó la semana · sigue abierto</span>`; };
const CHRONICLE_RULE = 'Según el contrato, de cada carrera hay que hacer la <b>crónica</b>, <b>pasar los resultados</b> y <b>enviar fotos</b>. <b>Basta con que la pase uno</b> de los que corristeis: si ya la ha pasado un compañero, no tienes que hacerla. ' + WEEK_RULE;
const chronicleReminder = (name) => choose('✍️ Recuerda tu crónica', `${name ? `<b>${esc(name)}</b><br>` : ''}${CHRONICLE_RULE}<br>Cuando lo hayas enviado, márcala como pasada en <b>Mi temporada</b>.`, [{ label: 'Entendido', value: true, kind: 'primary' }]);

/** Crónicas del corredor: pendientes y pasadas, pequeña y con un desplegable para marcarlas. */
function chronicleCard(d) {
  if (!(S.chron instanceof Set)) return '';
  const year = S.myYear || new Date().getFullYear();
  const c = chronicleStatus(d, S.chron, d.today || todayISO(), year);
  if (!c.total) return '';
  const plural = (n, a, b) => (n === 1 ? a : b);
  const li = (x, isDone) => { const by = S.chronBy?.get(x.key), other = isDone && by && !by.mine;   // cualquiera puede deshacer una crónica (corregir): queda pendiente para todos
    return `<li class="chro-row"><span class="chro-name"><b>${esc(x.name)}</b><small class="muted">${esc(formatDate(x.date, false))}${x.place ? ' · ' + esc(x.place) : ''}${other ? ` · la pasó ${esc(by.by)}` : ''}</small></span>${S.preview ? '' : `<button class="btn small${isDone ? ' ghost' : ' primary'}" data-act="chro-toggle" data-key="${esc(x.key)}" data-done="${isDone ? 0 : 1}">${isDone ? 'Deshacer' : '✓ Ya la pasé'}</button>`}</li>`; };
  const pend = c.pending.length;
  const tabImp = S.chroTab === 'imp';
  if (tabImp) loadImpact();
  const impactPane = () => {
    if (S.impact === undefined || S.impact === 'loading') return '<p class="empty small">Cargando…</p>';
    if (S.impact === null) return '<p class="hint">Todavía no está activado: la dirección tiene que ejecutar un SQL en Supabase (<code>2026-11-20-impacto-redes.sql</code>).</p>';
    const mineKeys = new Set([...(d.my_results || []).filter((r) => r.position).map(postKeyOf), ...(d.registrations || []).filter((g) => g.my_result).map(postKeyOf)]);   // carreras donde ya puso su puesto
    const imp = raceImpact([...c.pending, ...c.done].sort((a, b) => b.date.localeCompare(a.date)), { posted: S.impact.posted, story: S.stories || null, chron: S.chron, mine: mineKeys });
    const t = imp.totals, H = S.impact.ig, nf = (n) => Number(n || 0).toLocaleString('de-DE');
    const okI = '<span class="imp-ok" aria-label="hecho">✓</span>', noI = '<span class="imp-no" aria-label="aún no">—</span>';
    const rowHtml = (r) => {
      const act = [!r.mine && !S.preview ? `<a class="btn small primary" href="${resultHref(r.id)}">Poner mi resultado</a>` : '', !r.cro && !S.preview ? `<button type="button" class="btn small" data-act="chro-toggle" data-key="${esc(r.key)}" data-done="1">✓ Crónica pasada</button>` : ''].filter(Boolean).join('');
      return `<li><span class="imp-n"><b>${esc(r.name)}</b><small class="muted">${esc(formatDate(r.date, false))}</small></span>
        <span class="imp-st"><span>📸 Historia ${r.story ? okI : noI}</span><span>🏁 Resultado ${r.mine ? okI : noI}</span><span>✍️ Crónica ${r.cro ? okI : noI}</span>${r.published ? '<span class="imp-pub">🖼️ publicado</span>' : ''}</span>${act ? `<span class="imp-act">${act}</span>` : ''}</li>`;
    };
    const todo = imp.rows.filter((r) => !r.mine || !r.cro).length;

    return `${H && H.source ? `<h3>El club en Instagram <small class="muted">· ${esc(formatRange(H.from, H.to, false))}</small></h3>
        <div class="imp-tiles ig"><div><b>${nf(H.views)}</b><span>visualizaciones</span></div>${H.viewers ? `<div><b>${nf(H.viewers)}</b><span>${H.viewersKind === 'unique' ? 'personas alcanzadas' : 'alcance al día'}</span></div>` : ''}<div><b>${nf(H.interactions)}</b><span>interacciones</span></div>${H.follows != null ? `<div><b>${H.follows > 0 ? '+' : ''}${nf(H.follows)}</b><span>${H.source === 'period' ? 'seguidores netos' : 'seguidores nuevos'}</span></div>` : ''}</div>
        ${H.followers ? `<p class="imp-f">${ico('users')}<span><b>${nf(H.followers)}</b> seguidores en total</span></p>` : ''}`
        : '<p class="muted small">Todavía no hay cifras de Instagram guardadas.</p>'}
      <p class="hint">Son cifras de <b>todo el club</b>, no de cada persona: Instagram no dice qué publicación viene de qué carrera.</p>
      <h3>Lo que han generado tus carreras</h3>
      <div class="imp-tiles"><div><b>${t.stories}</b><span>historias <em>(solas)</em></span></div><div><b>${t.results}</b><span>tus resultados</span></div><div><b>${t.chronicles}</b><span>crónicas</span></div></div>
      <p class="hint">Tú solo pones tu resultado y pasas la crónica: la historia sale sola al apuntarte, y con tu resultado el club publica los resultados y alimenta la estadística.</p>
      <details class="imp-races" data-open-key="imp-races"${S.open?.['imp-races'] ? ' open' : ''}><summary>Mis carreras (${imp.rows.length})${todo ? ` · <b>${todo}</b> con algo por hacer` : ' · todo al día 🎉'}</summary>
        <ul class="imp-list">${imp.rows.map(rowHtml).join('')}</ul></details>`;
  };
  return `<section class="card chro-card${pend ? ' has-pend' : ''}" id="sec-chro"><details class="chro-det" data-open-key="chro"${S.open?.chro ? ' open' : ''}>
    <summary><span class="chro-ic">${ico('book')}</span><b class="chro-t">Crónicas${year === new Date().getFullYear() ? '' : ` <small class="muted">${year}</small>`}</b>
      <span class="chro-tag ${pend ? 'pend' : 'ok'}">${pend ? `${pend} ${plural(pend, 'pendiente', 'pendientes')}` : `${c.done.length} ${plural(c.done.length, 'pasada', 'pasadas')}`}${ico('go')}</span></summary>
    <div class="seg-sw chro-sw" role="tablist" aria-label="Crónicas o impacto en redes"><button type="button" role="tab" class="${tabImp ? '' : 'on'}" data-act="chro-tab" data-t="cro">Crónicas</button><button type="button" role="tab" class="${tabImp ? 'on' : ''}" data-act="chro-tab" data-t="imp">Impacto en redes</button></div>
    ${tabImp ? impactPane() : `<p class="hint">${CHRONICLE_RULE} Cuando lo hayas enviado, márcala.</p>
    ${pend ? `<ul class="chro-list">${c.pending.map((x) => li(x, false)).join('')}</ul>${pend > 1 && !S.preview ? '<button class="btn small ghost" data-act="chro-all">✓ Marcar todas como pasadas</button>' : ''}` : '<p class="empty small">No te falta ninguna. 🎉</p>'}
    ${c.done.length ? `<details class="chro-done"${pend ? '' : ' open'}><summary>Pasadas (${c.done.length})</summary><ul class="chro-list">${c.done.map((x) => li(x, true)).join('')}</ul></details>` : ''}`}
  </details></section>`;
}

/** Barra de bonificación por zonas reales: pre-mínimo apagado (con la penalización), y un trozo por tramo (12–16, 17–21, 22 o más) con su importe debajo. */
function bonusZones(st, cfg, planned = 0, sent = 0) {
  const tiers = tierRanges(st.tiers || tiersFor(cfg, st.contract));
  if (!tiers.length) return '';
  const extra = st.extra || 0, total = st.count + extra, first = tiers[0].from, last = tiers[tiers.length - 1].from;
  const segs = [{ from: 0, units: first, kind: 'pre', range: `0–${first - 1}`, amount: st.penalty ? `−${euros(st.penalty)}` : 'sin bono' },
    ...tiers.map((t, i) => ({ from: t.from, units: t.to != null ? t.to - t.from + 1 : 6, kind: `t${Math.min(i, 2)}`, range: t.text.replace(' a ', '–'), amount: euros(t.amount) }))];
  const max = last + 6, pct = (n) => Math.max(0, Math.min(100, (n / max) * 100));
  const conf = Math.max(0, st.count - sent), mixed = extra || sent;   // conf = carreras ya en resultados; sent = puesto enviado, aún sin pasar a resultados
  const next = st.next, pill = `<b>${mixed ? `${conf}${sent ? ` + ${sent}` : ''}${extra ? ` + ${extra}` : ''}` : total}</b>${next ? `<small>${mixed ? `${total} · ` : ''}+${st.missingToNext} → ${euros(next.amount)}</small>` : st.tier ? `<small>${mixed ? `${total} · ` : ''}máximo</small>` : mixed ? `<small>${total} en total</small>` : ''}`;
  return `<div class="bz" role="img" aria-label="${total} carreras${extra ? ` (con ${extra} de plus)` : ''}; tramos: ${tiers.map((t) => `${t.text} carreras ${euros(t.amount)}`).join(', ')}">
    <div class="bz-bar">
      ${segs.map((g) => { const fill = (n) => Math.max(0, Math.min(1, (n - g.from) / g.units)) * 100;
        return `<div class="bz-seg ${g.kind}${g.kind === 'pre' && st.reachesMinimum ? ' done' : ''}" style="flex:${g.units}">${extra ? `<i class="x" style="width:${fill(total)}%"></i>` : ''}${sent ? `<i class="s" style="width:${fill(st.count)}%"></i>` : ''}<i style="width:${fill(conf)}%"></i></div>`; }).join('')}
      ${planned ? `<span class="bz-plan" style="left:${pct(total)}%;width:${Math.max(0, pct(Math.min(max, total + planned)) - pct(total))}%" title="Con tus inscripciones"></span>` : ''}
      <span class="bz-you" style="left:min(max(${pct(total).toFixed(1)}%, 52px), calc(100% - 52px))">${pill}</span>
    </div>
    <div class="bz-labels">${segs.map((g) => `<span class="${g.kind}${g.kind === 'pre' && st.reachesMinimum ? ' done' : ''}${total >= g.from && total < g.from + g.units ? ' cur' : ''}" style="flex:${g.units}"><b>${g.range}</b><small>${esc(g.amount)}</small></span>`).join('')}</div>
  </div>`;
}

/** Lo que le falta rellenar al corredor en la temporada: carreras sin su resultado o sin crónica. */
function bonusTodo(d, year) {
  const today = d.today || todayISO();
  let rows = [];
  if (S.chron instanceof Set) {
    const c = chronicleStatus(d, S.chron, today, year), doneKeys = new Set(c.done.map((x) => x.key));
    const mineKeys = new Set([...(d.my_results || []).filter((r) => r.position).map(postKeyOf), ...(d.registrations || []).filter((g) => g.my_result).map(postKeyOf)]);
    rows = [...c.pending, ...c.done].map((x) => ({ ...x, res: mineKeys.has(x.key), cro: doneKeys.has(x.key) })).filter((r) => !r.res || !r.cro).sort((a, b) => b.date.localeCompare(a.date));
  }
  return { rows };
}

function runnerBonusCard(d) {
  const b = d.bonus;
  if (!b) return '';
  const cfg = bonusConfigFor(b.config ? { [b.year]: b.config } : {}, b.year);
  const c = b.contract || (b.nuevo ? 'nuevo' : null);
  const st = bonusStatus(b.done, cfg, c, b.extra || 0, b.suspended || 0);
  const proj = bonusStatus(b.done + (b.planned || 0), cfg, c, b.extra || 0, b.suspended || 0);
  const per = cfg.circuitExtra ?? 4;
  const pendingPlus = (d.circuits || []).filter((x) => x.year >= b.year - 1 && x.status !== 'confirmado').length;
  const plural = (n, one, many) => (n === 1 ? one : many);
  const end = `${b.year}-12-31`, daysLeft = Math.max(0, Math.round((new Date(end + 'T12:00:00Z') - new Date(todayISO() + 'T12:00:00Z')) / 864e5));
  // una sola frase de estado (antes eran tres: «faltan N para el tramo», el aviso del mínimo y «aún sin tramo»)
  const msg = !st.reachesMinimum
    ? (st.penalty ? `<p class="bz-msg bad">${ico('alert')}<span>Te faltan <b>${st.missingToMinimum}</b> para el mínimo (${st.minimum}). Si el 31 de diciembre no llegas: penalización de <b>${euros(st.penalty)}</b>.${daysLeft ? ` <small>Quedan ${daysLeft} días.</small>` : ''}</span></p>`
        : `<p class="bz-msg">${ico('info')}<span>Te faltan <b>${st.missingToMinimum}</b> para el mínimo (${st.minimum}); con tu contrato no hay penalización.</span></p>`)
    : st.next ? `<p class="bz-msg ok">${ico('check')}<span>Mínimo cumplido. Te faltan <b>${st.missingToNext}</b> ${plural(st.missingToNext, 'carrera', 'carreras')} para el tramo de <b>${euros(st.next.amount)}</b>.</span></p>`
      : `<p class="bz-msg ok">${ico('check')}<span>Has llegado al <b>tramo máximo</b> (${euros(st.amount)}).</span></p>`;
  const minChip = st.reachesMinimum ? `<span class="bn-min ok">${ico('check')}Mínimo cumplido (${st.minimum})</span>` : '';
  const chips = [
    st.extra ? `<span class="bn-chip gold">${ico('trophy')}+${st.extra} plus</span>` : '',
    pendingPlus ? `<span class="bn-chip wait">${ico('clock')}${pendingPlus} plus ${plural(pendingPlus, 'pendiente', 'pendientes')}</span>` : '',
    st.suspended ? `<span class="bn-chip">${ico('ban')}${st.suspended} ${plural(st.suspended, 'suspendida', 'suspendidas')}</span>` : '',
  ].filter(Boolean).join('');
  // Lo que cuenta el servidor = carreras ya en resultados + inscripciones con el puesto enviado (sin pasar a resultados). Lo segundo es la diferencia exacta (sin filtrar por fecha).
  const resY = (d.my_results || []).filter((r) => yearOf(r.date) === b.year), daysRes = resY.reduce((n, r) => n + numDays(r.date, r.end_date), 0);
  const sentDays = Math.max(0, st.count - daysRes);
  const sentList = (d.registrations || []).filter((g) => g.my_result && !g.suspended && yearOf(g.date) === b.year), sentFound = sentList.reduce((n, g) => n + numDays(g.date, g.end_date), 0);
  const tiers = st.tiers || [];
  const rules = `<details class="rules" data-open-key="rules"${S.open?.rules ? ' open' : ''}>
    <summary>${ico('info')}<span>Ver tramos y normativa</span>${ico('chevd', 'rules-chev')}</summary>
    <div class="rules-body">
      <p class="hint">La <b>bonificación</b> es la ayuda económica del club según las carreras que corras en la temporada (cláusula 3 de tu contrato).${b.contract ? ` Tu contrato: <b>${esc(contractLabel(b.contract).toLowerCase())}</b>.` : ''}</p>
      <h4>Mínimo y penalización</h4>
      <p>Hay que correr al menos <b>${cfg.minimum} carreras</b>. Si no se llega a final de temporada, penalización: ${penaltiesLine(cfg)}.</p>
      <h4>Cómo se cuentan las carreras</h4>
      <ul class="bullets"><li>Una carrera de varios días cuenta un día cada uno.</li>
        <li>Una carrera suspendida cuenta para el mínimo, pero no para el bono.</li>
        <li>🏆 <b>Plus de bonificación</b>: un podio en la general final de una liga suma +${per} carreras para el bono, pero <b>no cuenta para el mínimo de ${cfg.minimum}</b>.</li></ul>
      ${circuitsCard(d)}
    </div></details>`;
  return `<h2 class="blk-title">Tu bonificación ${b.year} ${ico('money')}</h2>
  <section class="card bonus-card">
    <p class="bn-main"><b>${st.count}</b> ${plural(st.count, 'carrera realizada', 'carreras realizadas')}${st.tier ? ` · <span class="bn-amt">${euros(st.amount)}</span>` : ''}</p>
    ${(() => { // de dónde sale el número: carreras en resultados (con sus jornadas) + inscripciones con el puesto enviado
      if (daysRes === resY.length && !sentDays) return '';
      const parts = [`${resY.length} ${plural(resY.length, 'carrera finalizada', 'carreras finalizadas')}${daysRes !== resY.length ? ` (${daysRes} jornadas: las pruebas de varios días cuentan un día cada una)` : ''}`];
      if (sentDays) parts.push(`${sentDays} con el puesto enviado y aún sin pasar a resultados${sentList.length ? ` (${sentList.map((g) => esc(g.name)).join(', ')})` : ''}`);
      return `<p class="bn-how">${parts.join(' + ')}${sentDays !== sentFound ? ` <b>· no encuentro cuál es en tu lista: avisa a la dirección</b>` : ''}.</p>`; })()}
    ${msg}
    ${bonusZones(st, cfg, b.planned || 0, sentDays)}
    ${sentDays ? `<p class="bz-key"><i class="k-s"></i>Rayada: puesto enviado, ya cuenta (pasa a resultados en una semana)</p>` : ''}
    ${(() => { const t = bonusTodo(d, b.year); if (!t.rows.length) return '';   // solo lo que falta por rellenar; si no falta nada, no sale nada
      return `<details class="bz-det warn" data-open-key="bz-todo"${S.open?.['bz-todo'] ? ' open' : ''}><summary>${ico('alert')}<span>Te falta rellenar <b>${t.rows.length}</b> ${t.rows.length === 1 ? 'carrera' : 'carreras'}</span>${ico('chevd', 'rules-chev')}</summary>
        <p class="hint">Una carrera <b>sin resultado no cuenta</b> para el bono. El resultado y la crónica son obligación del contrato.</p>
        <ul class="bz-rows">${t.rows.map((r) => `<li><span class="bz-n"><b>${esc(r.name)}</b><small class="muted">${esc(formatDate(r.date, false))} · falta ${!r.res && !r.cro ? 'resultado y crónica' : !r.res ? 'el resultado' : 'la crónica'}</small></span><span class="bz-act">${!r.res && !S.preview ? `<a class="btn small primary" href="${resultHref(r.id)}">Poner resultado</a>` : ''}${!r.cro && !S.preview ? `<button type="button" class="btn small" data-act="chro-toggle" data-key="${esc(r.key)}" data-done="1">✓ Crónica pasada</button>` : ''}</span></li>`).join('')}</ul></details>`; })()}
    ${b.planned ? `<p class="hint bn-plan">Con tus ${b.planned} inscripcion${b.planned === 1 ? '' : 'es'} de ${b.year} llegarías a ${proj.bonusCount}${proj.tier ? ` (${euros(proj.amount)})` : ''}${proj.reachesMinimum ? '' : ', aún por debajo del mínimo'}.</p>` : ''}
    ${rules}
  </section>`;
}

function runnerScreen(sub) {
  if (sub === 'nueva') return viewRunnerNew();
  if (sub === 'resultado') return viewRunnerReport(parseRoute().id || '');
  if (sub === 'editar') {
    const id = parseRoute().id;
    if (String(id || '').startsWith('race_')) { // carrera ya pasada a resultados que añadió él
      const raceId = String(id).slice(5);
      const r = (S.runnerData.my_results || []).find((x) => x.race_id === raceId);
      if (!r) return frame('Editar carrera', '<p class="empty">No encuentro esta carrera.</p>', { back: runnerHref('mi') });
      if (S.rdraft?.id !== raceId) S.rdraft = emptyRunnerDraft({ id: raceId, kind: 'race', elevation: r.elevation ?? '', price: r.price ?? '', others: r.others || 0, name: r.name, date: r.date, multi: !!r.end_date, end_date: r.end_date || '',
        place: r.place || '', province: r.province || '', country: r.country || DEFAULT_COUNTRY, modality: r.modality, notes: r.notes || '', race_type: r.race_type || 'suelta', circuit: r.circuit || '', subtype: r.subtype || '', km: r.km ?? '' });
      return viewRunnerNew();
    }
    const g = S.runnerData.registrations.find((x) => x.id === id);
    if (!g) return frame('Editar carrera', '<p class="empty">No encuentro esta carrera.</p>', { back: runnerHref('') });
    if (S.rdraft?.id !== id) S.rdraft = emptyRunnerDraft({ id, url: g.url || '', elevation: g.elevation ?? '', price: g.price ?? '', name: g.name, date: g.date, multi: !!g.end_date, end_date: g.end_date || '',
      place: g.place || '', province: g.province || '', country: g.country || DEFAULT_COUNTRY, modality: g.modality, notes: g.notes || '', race_type: g.race_type || 'suelta', circuit: g.circuit || '', subtype: g.subtype || '', km: g.km ?? '' });
    return viewRunnerNew();
  }
  if (sub === 'mi') return viewRunnerMine();
  if (sub === 'valorar' && !S.preview) return viewWatchForm(parseRoute().id || 'nueva');
  if (sub === 'contrato') return viewRunnerContract();
  if (sub === 'noticias') return viewNews();
  if (sub === 'carrera') return viewRunnerRace(S.session?.isAdmin && S.preview ? parseRoute().rest : parseRoute().id);
  if (sub === 'equipo') return viewTeam();
  if (sub === 'federaciones') return viewFed();
  return viewRunnerHome();
}

/** Aviso de la vista previa de la dirección (en todas las pantallas del corredor). */
const previewBanner = () => (S.session?.isAdmin && S.preview ? `<p class="card warn">👁️ <b>Vista previa</b> de ${esc(S.preview.name)}: no se puede apuntar ni borrar.
  <a href="#/corredores">Salir</a>${S.preview.sqlOk ? '' : '<br><b>⚠️ Falta ejecutar en Supabase el SQL de «Mis carreras»</b> (supabase/cambios/2026-11-11-mis-carreras.sql).'}</p>` : '');
/** Título de la barra de arriba del corredor: «Hola, Pere Soler» con el nombre completo (hay nombres repetidos); si no cabe, se desliza solo. */
const runnerTitle = () => (S.session?.isAdmin && S.preview ? `Vista de ${S.preview.name}` : S.runnerData?.me?.name ? `Hola, ${cleanName(S.runnerData.me.name)}` : 'CC Monzón');

/** Tarjeta de una carrera ya disputada (con resultados), para el calendario. */
function doneRaceBody(r, { admin = false, meId = null } = {}) {
  const res = r.results || [];
  const pods = res.filter((x) => isPodium(x.position)).sort((a, b) => a.position - b.position);
  const mine = res.find((x) => x.runner_id === meId);
  return `${typeTag(r)}
    <p class="count">🏁 Disputada · ${res.length} del club${res.length ? ': ' + esc(res.map((x) => x.runner_name).sort((a, b) => a.localeCompare(b, 'es')).join(', ')) : ''}</p>
    ${pods.length ? `<p class="pods">${pods.map((x) => `${medal(x.position)} ${esc(x.runner_name)}`).join(' · ')}</p>` : ''}
    ${mine ? `<p class="joined-done">✓ Participaste${mine.position ? ` · ${mine.position}º` : ''}</p>` : ''}
    ${!admin && meId && !mine && r.date >= pastLimit() && !S.preview ? `<p><button class="btn small" data-act="r-join-race" data-id="${r.id}">La hice y no salgo: añadirme</button></p>` : ''}${admin ? `<a class="btn small ghost" href="#/carreras/${r.id}">${ico('pen')}Editar${ico('go')}</a>` : ''}`;
}
function doneRaceCard(r, { admin = false, meId = null } = {}) {
  const res = r.results || [], mine = res.find((x) => x.runner_id === meId);
  return raceFold(r, { key: `dr-${r.id}`, mine: !!mine, cls: 'done-race', noPast: true, side: `<span class="rc-n" title="Del club" aria-label="${res.length} del club">${ico('users')}${res.length}</span>`, body: doneRaceBody(r, { admin, meId }) });
}


/** Web de la carrera: botón para ir directo si alguien la puso; si no, invita a ponerla para todos. */
function webRow(g, canAdd) {
  if (g.url) return `<div class="web-row"><a class="btn small web-btn" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">${ico('ext')}Web de la carrera</a>${!S.preview ? `<button type="button" class="btn small ghost" data-act="r-web" data-id="${g.id}" aria-label="Cambiar la web de la carrera" title="Cambiar la web">${ico('pen')}</button>` : ''}</div>`;
  if (!canAdd || S.preview) return '';
  return `<div class="web-row"><button type="button" class="btn small ghost web-add" data-act="r-web" data-id="${g.id}">${ico('link')}¿Conoces su web? Ponla para todos</button></div>`;
}
/** Ventana para poner (o cambiar) la web de una carrera. Devuelve la dirección, '' para quitarla, o null si cancela. */
function askWeb(name, current) {
  return new Promise((resolve) => {
    const dlg = document.getElementById('dialog');
    dlg.innerHTML = `<form method="dialog" class="dlg"><h2>Web de la carrera</h2><p><b>${esc(name)}</b></p>
      <label>Dirección de la web<input name="url" type="text" inputmode="url" placeholder="https://…" value="${esc(current)}" autocomplete="off" maxlength="500"></label>
      <p class="hint">La verán todos los corredores del club, para ir directos a inscribirse o ver el recorrido. Cualquiera puede cambiarla: pon solo la web oficial de la carrera.</p>
      <div class="dlg-actions"><button value="save" class="btn primary">Guardar</button>${current ? '<button value="clear" class="btn danger ghost">Quitar la web</button>' : ''}<button value="" class="btn ghost">Cancelar</button></div></form>`;
    dlg.onclose = () => { const v = dlg.returnValue; resolve(v === 'save' ? dlg.querySelector('input[name="url"]').value.trim() : v === 'clear' ? '' : null); };
    dlg.returnValue = '';
    dlg.showModal();
  });
}

/** Tarjeta de una inscripción para el corredor: datos, quién va y sus acciones (apuntarse, borrarse, resultado, editar). */
/** Una inscripción para el corredor: una fila con nombre, día, lugar e inscritos que se despliega con toda la información y sus acciones. */
function runnerRegCard(g, opts = {}) {
  const d = S.runnerData, me = d.me, today = d.today || todayISO();
    const mine = g.entries.find((e) => e.runner_id === me.id);
    const open = g.date >= today;
    // una sola fila de herramientas con iconos: valorar, web, editar datos y suspender (antes eran cuatro filas con frases)
    const canSusp = !S.preview && g.date >= pastLimit();
    const tools = `<div class="rc-tools">${open && !mine && !g.suspended && !S.preview ? starBtn(g, 'w-add-reg', ['id', g.id]) : ''}${g.url ? `<a class="rc-tool lab" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer" title="Web de la carrera">${ico('ext')}<span>Web</span></a>`
      : open && !g.suspended && !S.preview ? `<button type="button" class="rc-tool" data-act="r-web" data-id="${g.id}" aria-label="Añadir la web de la carrera" title="Añadir la web (para todos)">${ico('link')}</button>` : ''}
      ${mine && !S.preview && !g.suspended && (open || !g.my_result) ? `<button type="button" class="rc-tool lab pay${mine.paid ? ' on' : ''}" data-act="r-paid" data-id="${g.id}" aria-label="${mine.paid ? 'Pagada: cambiar o quitar el pago' : 'Marcar como pagada'}" title="${mine.paid ? 'Pagada' : 'Marcar como pagada'}">${ico('euro')}<span>${mine.paid ? `${mine.paid_amount != null ? euros(mine.paid_amount) : 'Pagada'}` : 'Pagar'}</span>${mine.paid ? ico('check', 'pay-ok') : ''}</button>` : ''}
      <span class="rc-tools-sp"></span>${!S.preview ? `<a class="rc-tool" href="#/editar/${g.id}" aria-label="Editar los datos de ${esc(g.name)}" title="Editar datos${g.mine_created ? ' (la añadiste tú)' : ''}">${ico('pen')}</a>` : ''}${canSusp ? (g.suspended
        ? `<button type="button" class="rc-tool" data-act="r-suspend" data-id="${g.id}" data-v="0" aria-label="Se vuelve a celebrar" title="Se vuelve a celebrar">${ico('check')}</button>`
        : `<button type="button" class="rc-tool susp" data-act="r-suspend" data-id="${g.id}" data-v="1" aria-label="Marcar como suspendida" title="Marcar como suspendida">${ico('ban')}</button>`) : ''}</div>`;
    const mates = g.entries.length ? `<div class="club-row"><span class="count">${ico('users')}${g.entries.length} del club</span><ul class="people">${g.entries.map((e) =>
      `<li class="${e.runner_id === me.id ? 'me' : ''}${e.paid ? ' paid' : ''}">${esc(e.name)}${e.category ? ` <small>${esc(e.category)}</small>` : ''}${e.paid ? `<span class="paid-mark" title="Ha pagado la inscripción" aria-label="ha pagado la inscripción">${ico('euro')}</span>` : ''}</li>`).join('')}</ul></div>` : '';
    const key = `rc-${g.id}`, isOpen = !!opts.open || !!S.open?.[key];
    // ficha cerrada: fecha en cajita, disciplina y datos clave, cuenta atrás con color y estado
    const state = [
      g.suspended ? `<span class="rc-chip off">${ico('ban')}Suspendida</span>` : '',
      !open && !g.suspended && mine && !g.my_result ? `<span class="rc-chip warn">${ico('flag')}Falta tu resultado</span>` : '',
      !open && !g.suspended && !mine ? `<span class="rc-chip off">${ico('flag')}Ya disputada</span>` : '',
    ].filter(Boolean).join('');
    const body = `
      ${tools}${typeTag(g)}
      ${open || g.suspended ? '' : `<p class="state-tag">${mine && g.my_result ? `${ico('check', 't-i')}Ya disputada · tu resultado está enviado` : `${ico('flag', 't-i')}Ya disputada · pendiente de resultados`} ${weekChip(g.end_date || g.date, today)}</p>
        ${mine && !S.preview ? (g.my_result ? `<p class="mine-created">Tu resultado: ${g.my_result.position}º (enviado) · <a href="#/resultado/reg_${g.id}">${ico('pen', 't-i')}Cambiar</a></p>`
          : `<p class="row"><a class="btn primary small" href="#/resultado/reg_${g.id}">Poner mi resultado</a>
             <button class="btn ghost small" data-act="r-leave" data-id="${g.id}">No fui: borrarme</button></p>`) : ''}
        ${!mine && g.date >= pastLimit() ? `<div class="row">${catSelect(`data-cat="${g.id}" aria-label="Tu categoría"`, '', 'Elige tu categoría')}
           <button class="btn primary" data-act="r-join" data-id="${g.id}">La hice: apuntarme</button></div>` : ''}`}
      ${g.notes ? `<p class="notes">${esc(g.notes)}</p>` : ''}
      ${myPubLine(g)}
      ${opts.notes && mine && !S.preview ? noteBlock(g) : ''}
      ${opts.notes ? completeBox(g, 'reg', g.id) : ''}
      ${mates}
      ${!open || g.suspended ? '' : mine
        ? `<div class="joined-acts">
             <button class="btn joined-btn" data-act="r-joined" data-id="${g.id}" aria-label="Estás inscrito${mine.category ? ' en ' + esc(mine.category) : ''}: cambiar categoría o borrarme">${ico('check')}<span>Inscrito</span>${ico('chevd', 'jb-more')}</button>
             <a class="btn ghost small" href="pacing/?fecha=${esc(g.date)}" aria-label="Pacing de esta carrera: vatios por tramo y nutrición">⚡ Pacing</a>
             <button class="btn ghost small" data-act="r-ics" data-id="${g.id}" aria-label="Añadir al calendario del móvil" title="Añadir al calendario del móvil">${ico('calplus')}Calendario</button></div>`
        : `<div class="row join-row">${catSelect(`data-cat="${g.id}" aria-label="Tu categoría"`, '', 'Elige tu categoría')}
           <button class="btn primary" data-act="r-join" data-id="${g.id}">Apuntarme</button></div>`}
    `;
    return raceFold(g, { key, id: key, mine: !!(mine && !g.suspended), open: !!opts.open, cls: opts.cls || '', noPast: !!opts.noPast, side: `${myPubChip(g)}${state}${payBadge(g, opts)}<span class="rc-n" title="Inscritos del club" aria-label="${g.entries.length} del club inscrito${g.entries.length === 1 ? '' : 's'}">${ico('users')}${g.entries.length}</span>`, body, today });
  }

/** Barra de «participaciones futuras» del equipo: cuántas inscripciones hay ya en las próximas carreras, por mes (para animar a apuntarse y a crear carreras). */
/** Historial visual de inscripciones del equipo: gráfica por semanas, tendencia y línea de tiempo de los últimos movimientos. */
async function ensureMoves() {
  if (S.moves !== undefined || !(S.code || S.previewCode)) return;
  S.moves = 'loading';
  try { S.moves = (await api.runnerTeamMoves(S.code || S.previewCode)) || null; } catch { S.moves = null; }
  const box = $app.querySelector('#pulse-box');
  if (box && S.runnerData && !searchActive()) box.innerHTML = S.regView === 'cal' ? '' : teamPulse(S.runnerData);
}
function movesBlock() {
  if (!Array.isArray(S.moves) || !S.moves.length) return '';
  const m = teamMoves(S.moves), MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mx = Math.max(1, ...m.bars.map((b) => b.n)), items = m.list.slice(0, 30);
  const ago = (n) => (n === 0 ? 'hoy' : n === 1 ? 'ayer' : n < 14 ? `hace ${n} días` : `hace ${Math.round(n / 7)} sem.`);
  const row = (x) => `<li class="mv-i"><i class="mv-dot ${discClass(x.modality, x.subtype)}"></i><span class="mv-tx"><b>${esc(x.name.split(' ')[0])}</b> se apuntó a <b>${esc(x.race)}</b><small>${esc(dayMon(x.date))} · ${esc(x.subtype || x.modality)}</small></span><span class="mv-ago">${ago(x.ago)}</span></li>`;
  const trend = m.trend > 0 ? `<span class="up">▲ ${m.trend} más que las 4 semanas previas</span>` : m.trend < 0 ? `<span class="down">▼ ${-m.trend} menos que las 4 semanas previas</span>` : '<span>= igual que las 4 semanas previas</span>';
  return `<div class="mv"><h4>${ico('clock')}Últimos movimientos</h4>
    <div class="mv-bars" role="img" aria-label="Inscripciones por semana, últimas 8 semanas">${m.bars.map((b, i) => { const d = new Date(b.start); return `<div class="mv-b${i === m.bars.length - 1 ? ' now' : ''}"><em>${b.n || ''}</em><span style="height:${Math.max(b.n ? 8 : 2, (b.n / mx) * 100)}%"></span><small>${d.getUTCDate()} ${MES[d.getUTCMonth()]}</small></div>`; }).join('')}</div>
    <p class="mv-trend">${trend}</p>
    <ul class="mv-list">${items.slice(0, 6).map(row).join('')}</ul>
    ${items.length > 6 ? `<details class="mv-more" data-open-key="mvmore"${S.open?.mvmore ? ' open' : ''}><summary>Ver ${items.length - 6} más</summary><ul class="mv-list">${items.slice(6).map(row).join('')}</ul></details>` : ''}</div>`;
}
function teamPulse(d) {
  ensureMoves();
  const today = d.today || todayISO();
  const up = d.registrations.filter((g) => !g.suspended && g.date >= today && (g.entries || []).length);
  if (!up.length) return '';
  const parts = up.reduce((n, g) => n + g.entries.length, 0);
  const people = new Set(up.flatMap((g) => g.entries.map((e) => e.runner_id))).size;
  const mine = up.filter((g) => g.entries.some((e) => e.runner_id === d.me.id)).length;
  const byMonth = new Map();
  for (const g of up) {
    const ym = g.date.slice(0, 7), m = byMonth.get(ym) || { total: 0, races: 0, discs: {} }, dk = disciplineKey(g.modality, g.subtype);
    m.total += g.entries.length; m.races++; m.discs[dk] = (m.discs[dk] || 0) + g.entries.length; byMonth.set(ym, m);
  }
  const cols = [...byMonth].sort(([a], [b]) => a.localeCompare(b)).slice(0, 7);
  const mx = Math.max(1, ...cols.map(([, m]) => m.total));
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const tot = {};
  for (const [, m] of cols) for (const [k, n] of Object.entries(m.discs)) tot[k] = (tot[k] || 0) + n;
  const discs = Object.keys(tot).sort((a, b) => tot[b] - tot[a] || a.localeCompare(b, 'es'));
  // plegado por defecto: una línea con las cifras; el gráfico por meses se abre al tocar
  return `<details class="card pulse pulse-fold" data-open-key="pulse"${S.open?.pulse ? ' open' : ''}><summary><span class="pulse-t">${ico('users')}El equipo ya está apuntado</span>
      <span class="pulse-chips"><span><b>${up.length}</b> carrera${up.length === 1 ? '' : 's'}</span><span><b>${people}</b> corredor${people === 1 ? '' : 'es'}</span>${mine ? `<span class="me">Tú en <b>${mine}</b></span>` : ''}</span><span class="pulse-chev" aria-hidden="true">${ico('chevd')}</span></summary>
    <p class="pulse-sum">${parts} inscripci${parts === 1 ? 'ón' : 'ones'} en ${up.length} carrera${up.length === 1 ? '' : 's'} próxima${up.length === 1 ? '' : 's'}.</p>
    <div class="months pulse-months" role="group" aria-label="Inscripciones del equipo por mes">${cols.map(([ym, m]) => `<button type="button" class="mcol pulse-col" data-act="pulse-month" data-m="${ym}" aria-label="${MES[Number(ym.slice(5)) - 1]}: ${m.total} inscripciones en ${m.races} carreras">
      <em>${m.total}</em><div class="mstack" style="height:${(m.total / mx) * 100}%">${discs.filter((k) => m.discs[k]).reverse().map((k) => { const [dm, ds] = k.split('|');
        return `<span class="${discClass(dm, ds)}" style="flex:${m.discs[k]}" title="${esc(discLabel(dm, ds))}: ${m.discs[k]}"></span>`; }).join('')}</div>
      <b>${MES[Number(ym.slice(5)) - 1]}</b></button>`).join('')}</div>
    <p class="pulse-legend">${discs.map((k) => { const [dm, ds] = k.split('|'); return `<span class="${discClass(dm, ds)}"><i></i>${esc(discLabel(dm, ds))} <b>${tot[k]}</b></span>`; }).join('')}</p>${movesBlock()}</details>`;
}

/** Tarjeta «Planificar ruta» (herramienta ruta/): va en Carreras, justo bajo el buscador. */
const rutaCard = () => `<a class="card ruta-card" href="ruta/">${ico('route', 'ruta-ic')}<span class="ruta-txt"><b>Planificar ruta <span class="new-tag">NUEVO</span></b><small class="muted">Sube tu track y mira viento, tiempo y subidas</small></span><span class="mrow-go" aria-hidden="true">${ico('go')}</span></a>`;

/** La próxima carrera del equipo, bien resaltada: que se vea la semana en la que compite el club aunque quien mira no participe. */
function nextTeamBanner(d) {
  const today = d.today || todayISO(), g = nextTeamRace(d.registrations, today);
  if (!g) return '';
  const n = daysTo(g.date), going = d.registrations && (g.entries || []).some((e) => e.runner_id === d.me.id), live = g.date <= today;
  const wk = live || n <= 7, names = g.entries.map((e) => e.name.split(' ')[0]), shown = names.slice(0, 6);
  return `<section class="card next-team${wk ? ' wk' : ''} compact" aria-label="Próxima carrera del equipo">
    <p class="nt-k">${wk ? `${ico('flag')}Esta semana compite el equipo` : `${ico('flag')}Próxima carrera del equipo`}</p>
    <div class="nt-head">${raceTile(g, { mine: !!going })}<div class="rh-main"><h2 class="nt-n">${esc(g.name)}</h2><p class="rh-sub">${esc(raceSub(g))}</p><p class="rc-meta">${raceMeta(g)}</p></div>
      <div class="rc-side"><span class="nt-pill nt-when">${live ? 'En curso' : daysToText(n)}</span><span class="nt-pill">${g.entries.length} del club</span></div></div>
    <p class="nt-people">${shown.map(esc).join(' · ')}${names.length > shown.length ? ` · +${names.length - shown.length}` : ''}</p>
    <div class="nt-foot"><span class="nt-me${going ? ' on' : ''}">${going ? `${ico('check')}Tú vas` : 'Tú no estás apuntado'}</span><button type="button" class="btn nt-btn" data-act="goto-sec" data-to="rc-${esc(g.id)}">${going ? 'Ver carrera' : 'Apuntarme'}</button></div></section>`;
}

function viewRunnerHome() {
  const d = S.runnerData, me = d.me, today = d.today || todayISO();
  const regs = regFilter(d.registrations, me);
  const upcoming = regs.filter((g) => g.date >= today);
  const past = regs.filter((g) => g.date < today);
  const card = (g) => runnerRegCard(g);
  modFilterBar(d.registrations, me); // calcula S.fd (botón y ventana de filtros)
  const isMine = (g) => (g.entries || []).some((e) => e.runner_id === me.id) || (g.results || []).some((x) => x.runner_id === me.id);
  const done = byMod((S.team?.races || []).filter((r) => (r.results || []).length));
  const body = S.regView === 'cal'
    ? calendarView(regs, card, isMine, { done, doneCard: (r) => doneRaceCard(r, { meId: me.id }), shiftGroup: S.myShift })
    : `${(() => { const wk = upcoming.filter((g) => daysTo(g.date) <= 7); return wk.length ? `<h2 class="section">📅 Esta semana (${wk.length})</h2>${wk.map(card).join('')}` : ''; })()}
    <h2 class="section">${upcoming.some((g) => daysTo(g.date) <= 7) ? 'Más adelante' : 'Próximas carreras'} (${upcoming.filter((g) => daysTo(g.date) > 7).length || (upcoming.some((g) => daysTo(g.date) <= 7) ? 0 : upcoming.length)})</h2>
    ${upcoming.length ? monthList(upcoming.filter((g) => daysTo(g.date) > 7), card) : `<p class="empty">${filtersOn(me) ? 'Ninguna carrera próxima con estos filtros. <button class="link" data-act="filters-clear">Quitar filtros</button>' : 'Todavía no hay carreras abiertas.'}</p>`}
    ${past.length ? `<details class="past"><summary>🏁 Ya disputadas${past.some((g) => (g.entries || []).some((e) => e.runner_id === me.id) && !g.my_result) ? ', pendientes de resultados' : ''} (${past.length})</summary>${past.map(card).join('')}</details>` : ''}`;
  return frame(runnerTitle(), `
    ${previewBanner()}
    <div class="toolbar">
      ${searchBox('runner', 'Buscar…', { marquee: 'Buscar carrera, corredor, lugar…' })}
      <button class="btn primary add-btn" data-act="r-new" aria-label="Añadir una carrera que no está" title="Añadir una carrera que no está">＋</button>
      ${S.fd?.has ? `<button type="button" class="icon-btn fbtn${S.fd.active ? ' on' : ''}" data-act="r-filters" aria-label="Filtros${S.fd.active ? ' (activos)' : ''}" title="Filtros">${icon(ICON_FILTER)}${S.fd.active ? '<i class="fdot"></i>' : ''}</button>` : ''}
      <button type="button" class="icon-btn fbtn view-btn${S.regView === 'cal' ? ' on' : ''}" data-act="reg-view" aria-label="${S.regView === 'cal' ? 'Ver como lista' : 'Ver calendario'}" title="${S.regView === 'cal' ? 'Ver como lista' : 'Ver calendario'}">${icon(S.regView === 'cal' ? ICON_LIST : ICON_CAL)}</button>
    </div>
    ${normalize(S.q.runner || '').length >= 2 ? '' : nextTeamBanner(d)}
    <div id="pulse-box">${S.regView === 'cal' || normalize(S.q.runner || '').length >= 2 ? '' : teamPulse(d)}</div>
    <div id="search-results">${runnerSearchResults(S.q.runner)}</div>
    ${body}`,
  { rtab: '', head: S.preview ? null : `<a class="hdr-pacing" href="ruta/" aria-label="Pacing y planificar ruta: viento, tiempo, vatios y nutrición" title="Pacing y planificar ruta"><i aria-hidden="true">⚡</i>Pacing${ico('go', 'hp-go')}</a>` });
}

const FIELD_LABELS = { province: 'provincia', km: 'distancia', subtype: 'formato', elevation: 'desnivel', price: 'precio' };
/** Formulario para que el corredor rellene SOLO los datos que le faltan a una carrera. kind: 'reg' o 'race'. */
function completeBox(x, kind, id) {
  const miss = missingFields(x, { extra: true });
  if (!miss.length || S.preview) return '';
  const guess = guessSubtype(x.name, x.modality);
  return `<section class="card complete-box"><h3>📝 Faltan datos: ${miss.map((k) => FIELD_LABELS[k]).join(', ')}</h3>
    <p class="hint">Si los sabes, rellénalos: ayudas al club y a todos. Solo se guardan los que faltan; lo que ya está escrito no se cambia.</p>
    <form class="stack" data-form="r-complete" data-kind="${kind}" data-id="${id}">
      ${miss.includes('province') ? `<label>Provincia<input name="province" list="dl-prov" autocomplete="off"></label>` : ''}
      ${miss.includes('km') ? `<label>Distancia (km)<input name="km" type="number" inputmode="decimal" step="0.1" min="0.1" max="1000" placeholder="85"></label>` : ''}
      ${miss.includes('elevation') ? `<label>Desnivel positivo (m)<input name="elevation" type="text" inputmode="numeric" maxlength="6" placeholder="1200" autocomplete="off"></label>` : ''}
      ${miss.includes('price') ? `<label>Precio de la inscripción (€) <small class="muted">(0 = gratis)</small><input name="price" type="text" inputmode="decimal" maxlength="8" placeholder="25" autocomplete="off"></label>` : ''}
      ${miss.includes('subtype') ? `<label>Formato<select name="subtype"><option value="">No lo sé</option>${SUBTYPES[x.modality].map((o) => opt(o, o, guess)).join('')}</select></label>` : ''}
      <button class="btn primary">Guardar lo que sé</button></form></section>`;
}

/** Una carrera ya disputada (con resultados), abierta desde «Mi temporada»: datos, mi puesto, quién más corrió y completar datos. */
function viewRunnerDoneRace(raceId) {
  const back = runnerHref('mi');
  const my = (S.runnerData.my_results || []).find((x) => x.race_id === raceId);
  const team = Array.isArray(S.team?.races) ? S.team.races.find((x) => x.id === raceId) : null;
  const r = team ? { ...my, ...team } : my;
  if (!r) return frame('Carrera', `${previewBanner()}<p class="empty">No encuentro esta carrera.</p>`, { back });
  const res = (team?.results || []).filter((x) => x.position).sort((a, b) => a.position - b.position);
  const meId = S.runnerData.me.id;
  return frame('Carrera', `${previewBanner()}
    <article class="card race done-race ${modClass(r.modality)}">${raceHead(r)}${typeTag(r)}
      ${my ? `<p class="joined-done">${my.position ? `✓ Tu puesto: ${isPodium(my.position) ? medal(my.position) + ' ' : ''}${my.position}º${my.category ? ' · ' + esc(my.category) : ''}${my.self_reported ? ' · 📝 puesto por ti' : ''}
          ${S.preview ? '' : ` · <a href="#/resultado/race_${raceId}">✏️ Cambiar mi resultado</a>`}`
        : `Corriste esta carrera. ${S.preview ? '' : `<a class="btn primary small" href="#/resultado/race_${raceId}">Poner mi puesto</a>`}`}</p>` : ''}
      ${team ? `<p class="count">🏁 ${team.results.length} del club${res.length ? ':' : ''}</p>
        ${res.length ? `<ol class="rank-mini">${res.map((x) => `<li class="${x.runner_id === meId ? 'me' : ''}"><span>${isPodium(x.position) ? medal(x.position) : x.position + 'º'}</span> ${esc(x.runner_name)}${x.category ? ` <small>${esc(x.category)}</small>` : ''}</li>`).join('')}</ol>` : ''}`
        : '<p class="muted small">Cargando quién más corrió…</p>'}
      ${!S.preview ? `<p class="mine-created">${my?.mine_created ? 'Añadida por ti · ' : ''}<a href="#/editar/race_${raceId}">✏️ Editar datos${my?.mine_created ? ' o borrar' : ''}</a></p>` : ''}
    </article>
    ${completeBox(r, 'race', raceId)}`, { back });
}

/** Una inscripción abierta desde «Mi temporada»: la tarjeta completa con todas sus acciones. */
function viewRunnerRace(id) {
  if (String(id || '').startsWith('race_')) return viewRunnerDoneRace(String(id).slice(5));
  const g = S.runnerData.registrations.find((x) => x.id === id);
  const back = runnerHref('mi');
  if (!g) return frame('Carrera', `${previewBanner()}<p class="empty">Esta carrera ya no está entre las inscripciones: puede que la dirección ya la haya pasado a resultados. Mírala en «Carreras hechas».</p>`, { back });
  return frame('Carrera', `${previewBanner()}${runnerRegCard(g, { open: true })}
    ${completeBox(g, 'reg', g.id)}
`, { back });
}

/** «Mi temporada»: bono, mis carreras e instalación. */
/** Enlaces del club (pedido de ropa…): se editan en js/enlaces.js. */
const clubLinksCard = () => ENLACES_CONTRATO.map((l) => `<section class="card club-link">
  <h3>${l.icono === '👕' ? ico('shirt') : esc(l.icono || '🔗')}${esc(l.titulo)}</h3>
  ${l.texto ? `<p class="hint">${esc(l.texto)}</p>` : ''}
  <a class="btn primary block" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer">${esc(l.boton || 'Abrir')} ↗</a></section>`).join('');

/** «Mi licencia»: enlaces a la web de cada federación, donde el corredor ve su licencia digital con su propia cuenta. */
function licenseCard() {
  const link = (id) => {
    const f = FEDERACIONES[id];
    return `<a class="lic-pill${S.fedSeguro === id ? ' on' : ''}" href="${esc(f.licencia.href)}" target="_blank" rel="noopener noreferrer">${esc(f.corto)} ${ico('ext')}</a>`;
  };
  return `<section class="card lic-card"><h3>${ico('idcard')}Mi licencia</h3>
    <p class="hint">Accede a tu licencia digital en la web de tu federación:</p>
    <div class="lic-row">${ORDEN_FEDERACIONES.map(link).join('')}</div></section>`;
}

function viewRunnerMine() {
  const d = S.runnerData, me = d.me;
  if (!S.preview && parseRoute().id === 'valorar') return viewWatch();
  return frame(runnerTitle(), `
    ${previewBanner()}
    ${S.preview ? '' : miTabs('mi')}
    ${myRacesCard(d, () => chronicleCard(d))}
    ${installHint()}
    ${S.preview ? `<p class="center"></p>` : ''}${themeLineIfPreview()}${versionLine()}`,
  { rtab: 'mi' });
}


// ======================================================================
//  Por valorar: las carreras que me gustan y aún no me inscribo (personal de cada corredor)
// ======================================================================

const watchToday = () => S.runnerData?.today || todayISO();
/** Mis notas personales de cada inscripción (solo las veo yo). null = falta el SQL en la base de datos. */
async function loadNotes() {
  if (S.preview || !S.code) { S.notes = null; return; }
  try { S.notes = (await api.runnerNotes(S.code)) || null; } catch { S.notes = null; }
}
const noteOf = (g) => (S.notes && S.notes[g.id]) || '';
/** Pestañita «Mis notas» de una inscripción mía (solo en Mi temporada): hotel, coche, quién va contigo… */
const noteBlock = (g) => {
  if (!S.notes) return '';
  const t = noteOf(g);
  // sin nota: una sola línea (botón); con nota: el texto y un botón para editarla
  return t ? `<div class="rc-note has"><div class="rc-note-h">${ico('pen')}<b>Mis notas</b><button type="button" class="btn small ghost" data-act="note-edit" data-id="${g.id}">Editar</button></div><p class="rc-note-t">${esc(t)}</p></div>`
    : `<button type="button" class="rc-note-add" data-act="note-edit" data-id="${g.id}">${ico('pen')}<span>Mis notas <small>· hotel, coche…</small></span><b>＋</b></button>`;
};
async function loadWatch() {
  if (S.preview || !S.code) return;
  try { const l = await api.runnerWatchList(S.code); S.watch = Array.isArray(l) ? l : null; } catch { S.watch = undefined; }   // null = falta el SQL
}
/** Cuántas guardadas tienen el plazo de inscripción a punto de cerrarse (para el aviso de la pestaña). */
const watchUrgent = () => (Array.isArray(S.watch) ? S.watch.filter((w) => watchInfo(w, watchToday()).urgent).length : 0);
const watchKey = (g) => `${g.date}|${normalize(g.name)}`;
const watchSaved = (g) => (Array.isArray(S.watch) ? S.watch.find((w) => watchKey(w) === watchKey(g)) : null);

/** Selector de arriba de «Mi temporada»: Mi temporada | Por valorar. */
const miTabs = (cur) => {
  const live = Array.isArray(S.watch) ? S.watch.filter((w) => !watchInfo(w, watchToday()).past).length : 0, u = watchUrgent();
  return `<div class="seg2 mi-seg" role="tablist" aria-label="Mi temporada"><a href="#/mi" class="${cur === 'mi' ? 'on' : ''}" role="tab" aria-selected="${cur === 'mi'}">${ico('calcheck')}Mi temporada</a>
    <a href="#/mi/valorar" class="${cur === 'valorar' ? 'on' : ''}" role="tab" aria-selected="${cur === 'valorar'}">${ico('star')}Por valorar${live ? `<b>${live}</b>` : ''}${u ? '<i class="seg-dot" title="Plazo de inscripción a punto de cerrarse"></i>' : ''}</a></div>`;
};

/** Tarjeta de una carrera guardada. */
function watchCard(w, i) {
  const regs = S.runnerData.registrations, g = watchMatch(w, regs), me = S.runnerData.me.id;
  const mine = g && (g.entries || []).some((e) => e.runner_id === me), others = g ? (g.entries || []).filter((e) => e.runner_id !== me) : [];
  const dl = i.deadline && { closed: ['bad', 'Plazo cerrado'], today: ['bad', '¡Último día para inscribirse!'], soon: ['bad', `Plazo: ${i.toDeadline} día${i.toDeadline === 1 ? '' : 's'}`],
    open: ['ok', `Plazo hasta el ${dayMon(w.deadline)}`] }[i.deadline];
  const dlShort = dl && { closed: 'Plazo cerrado', today: '¡Último día!', soon: `Plazo: ${i.toDeadline} d`, open: `Plazo ${dayMon(w.deadline)}` }[i.deadline];
  const side = dl ? `<span class="rc-chip ${dl[0] === 'bad' ? 'warn' : ''}">${ico('clock')}${dlShort}</span>` : '';
  const body = `
    ${watchTbc(w) || dl ? `<div class="wc-chips">${watchTbc(w) ? `<span class="wchip tbc">${ico('cal')}Fecha por confirmar</span>` : ''}${dl ? `<span class="wchip ${dl[0]}">${ico('clock')}${dl[1]}</span>` : ''}</div>` : ''}
    ${mine ? `<p class="wc-club ok">${ico('check')}<span>Ya estás apuntado. Puedes quitarla de aquí.</span></p>` : g ? `<p class="wc-club">${ico('users')}<span>${others.length ? `Ya está en Carreras: <b>${others.length}</b> apuntado${others.length === 1 ? '' : 's'} (${esc(others.map((e) => e.name).slice(0, 4).join(', '))}${others.length > 4 ? '…' : ''})` : 'Está en Carreras: nadie se ha apuntado todavía'}</span></p>` : ''}
    ${w.notes ? `<p class="notes">${esc(w.notes)}</p>` : ''}
    <div class="wc-acts">${i.past ? `<button class="btn primary small" data-act="w-repeat" data-id="${w.id}">${ico('star')}Repetir el año que viene</button>` : mine ? '' : `<button class="btn primary small" data-act="w-sign" data-id="${w.id}">${g ? 'Apuntarme' : 'Inscribirme'}</button>`}
      ${w.url ? `<a class="btn small" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">${ico('ext')}Web</a>` : ''}
      <a class="btn small ghost wc-edit" href="#/valorar/${w.id}" aria-label="Editar" title="Editar">${ico('pen')}</a>
      <button class="btn small ghost wc-edit" data-act="w-del" data-id="${w.id}" aria-label="${i.past || mine ? 'Quitar' : 'Descartar'}" title="${i.past || mine ? 'Quitar' : 'Descartar'}">${ico('trash')}</button></div>`;
  return raceFold(w, { key: `wv-${w.id}`, today: watchToday(), mine: !!mine, side, body, cls: `wcard${i.urgent ? ' urgent' : ''}` });
}

function viewWatch() {
  const w = S.watch, today = watchToday();
  let body;
  if (w === undefined) body = '<p class="empty">Cargando…</p>';
  else if (w === null) body = '<p class="card warn">Esta función aún no está activada: avisa a la dirección del club.</p>';
  else {
    const mode = S.watchSort === 'deadline' ? 'deadline' : 'date';
    const list = sortWatch(w, mode, today), live = list.filter((x) => !x.i.past), old = list.filter((x) => x.i.past);
    const next = live.filter((x) => x.i.toDeadline !== null && x.i.toDeadline >= 0).sort((a, b) => a.i.toDeadline - b.i.toDeadline)[0];
    const first = [...live].sort((a, b) => a.w.date.localeCompare(b.w.date))[0];
    body = !w.length ? `<section class="card wempty"><div class="we-ic">${ico('star')}</div><h2>Tu lista para decidir con calma</h2>
        <p>Guarda aquí las carreras que te gustan pero en las que aún <b>no</b> te inscribes: con su fecha, su web, el precio, el plazo de inscripción y tus notas. Cuando te decidas, un toque y te apuntas.</p>
        <p class="hint">La lista es solo tuya: tu precio, plazo y notas no los ve nadie. La carrera (con su web, sin tu nombre) se crea también en Carreras para que otros la encuentren y no se duplique.</p><a class="btn primary" href="#/valorar/nueva">${ico('plus')}Guardar una carrera</a>
        <p class="hint">Desde <a href="#/federaciones">Federaciones</a> también puedes guardarlas con la estrella ☆.</p></section>`
      : `<div class="wrow"><p class="wline"><b>${live.length}</b> por valorar${next ? ` · <span class="${next.i.urgent ? 'bad' : ''}">${ico('clock')}plazo <b>${next.i.toDeadline === 0 ? 'hoy' : `en ${next.i.toDeadline} d`}</b></span>` : ''}</p>${live.length > 1 ? `<button type="button" class="chip wsort-b" data-act="w-sort" data-m="${mode === 'date' ? 'deadline' : 'date'}" title="Cambiar el orden">⇅ ${mode === 'date' ? 'Por fecha' : 'Por plazo'}</button>` : ''}</div>
        <div class="wlist">${live.map((x) => watchCard(x.w, x.i)).join('') || '<p class="empty small">Nada próximo: todo lo guardado ya pasó.</p>'}</div>
        ${old.length ? `<details class="card wold"><summary><b>Ya pasaron (${old.length})</b> <span class="muted">· quítalas cuando quieras</span></summary>${old.map((x) => watchCard(x.w, x.i)).join('')}</details>` : ''}
        <p class="hint center">La lista es solo tuya. La carrera (sin tu nombre) está también en Carreras para que otros la encuentren.</p>`;
  }
  return frame(runnerTitle(), `${miTabs('valorar')}
    <div class="toolbar wtool"><h2 class="wtitle">${ico('star')}Por valorar</h2>${Array.isArray(w) ? `<a class="btn primary" href="#/valorar/nueva">${ico('plus')}Guardar carrera</a>` : ''}</div>
    ${body}`, { rtab: 'mi' });
}

/** Formulario para guardar o corregir una carrera por valorar. */
function viewWatchForm(id) {
  if (!Array.isArray(S.watch)) return frame('Por valorar', `<p class="card warn">Esta función aún no está activada: avisa a la dirección del club.</p>`, { back: '#/mi/valorar' });
  const item = id === 'nueva' ? null : S.watch.find((x) => x.id === id);
  if (id !== 'nueva' && !item) return frame('Por valorar', '<p class="empty">Esa carrera ya no está en tu lista.</p>', { back: '#/mi/valorar' });
  if (S.rdraft?.wk !== id) {
    S.rdraft = emptyRunnerDraft({ wk: id, name: item?.name || S.q.runner || '', date: item?.date || '', multi: !!item?.end_date, end_date: item?.end_date || '', place: item?.place || '', province: item?.province || '',
      country: item?.country || DEFAULT_COUNTRY, modality: item?.modality || 'Carretera', subtype: item?.subtype || '', km: item?.km ?? '', url: item?.url || '', price: item?.price ?? '', elevation: item?.elevation ?? '', deadline: item?.deadline || '', notes: item?.notes || '' });
  }
  const d = S.rdraft, editing = !!item;
  if (!S.fed && !editing) loadFed().then(() => updateSearch('rname'));
  const detail = `${SUBTYPES[d.modality] ? `<div class="disc-field"><span class="flabel">Disciplina de ${esc(d.modality)}</span>${radioChips('data-rf', 'subtype', [['', 'Sin decidir'], ...SUBTYPES[d.modality].map((x) => [x, esc(x)])], d.subtype)}</div>` : ''}
    <label class="flabel-l">Distancia (km)<input type="number" inputmode="decimal" step="0.1" min="0.1" max="1000" data-rf="km" value="${esc(d.km ?? '')}" placeholder="85"></label>`;
  return frame(editing ? 'Editar carrera guardada' : 'Guardar una carrera', `
    <form class="stack rform" data-form="w-save">
      ${fsecD('wf1', 1, 'flag', 'Qué carrera es', d.name, `<label class="flabel-l">Nombre de la carrera<input data-rf="name" value="${esc(d.name)}" required minlength="3" maxlength="120" autocomplete="off" placeholder="Gran Fondo…"></label>
        ${editing ? '' : `<div id="dup-list">${watchDupSuggestions(d.name)}</div><p class="hint">¿Está en el calendario de las federaciones? También la puedes guardar con la estrella ☆ desde <a href="#/federaciones">Federaciones</a>.</p>`}`, '#1f6fd1', !editing)}
      ${fsecD('wf2', 2, 'cal', 'Cuándo y dónde', [d.date ? formatDate(d.date) : '', d.place || d.province].filter(Boolean).join(' · '), `<label class="flabel-l">${d.multi ? 'Primer día' : 'Fecha'}<input type="date" data-rf="date" value="${esc(d.date)}" min="${pastLimit()}" required></label>
        <label class="check"><input type="checkbox" data-rf-multi ${d.multi ? 'checked' : ''}> Carrera de varios días (por etapas)</label>
        ${d.multi ? `<label class="flabel-l">Último día<input type="date" data-rf="end_date" value="${esc(d.end_date)}" min="${esc(d.date || pastLimit())}" required></label>` : ''}
        <label class="flabel-l">Lugar<input data-rf="place" value="${esc(d.place)}" maxlength="120" placeholder="Ciudad o pueblo"></label>
        <label class="flabel-l">Provincia<input data-rf="province" list="dl-prov" value="${esc(d.province)}" autocomplete="off"></label>`, '#0f9d8a', !editing)}
      ${fsecD('wf3', 3, 'bars', 'Qué tipo de carrera es', [d.modality, d.subtype, d.km ? kmText(d.km) : ''].filter(Boolean).join(' · '), `<div class="disc-field"><span class="flabel">Modalidad</span>${modalityChips(d, 'data-rf')}</div>${detail}`, '#e07800')}
      ${fsecD('wf4', 4, 'euro', 'Para decidir', [d.price !== '' && d.price != null ? (Number(d.price) === 0 ? 'Gratis' : euros(d.price)) : '', d.deadline ? `plazo ${formatDate(d.deadline)}` : '', d.notes ? 'con notas' : ''].filter(Boolean).join(' · '), `<label class="flabel-l">Web de la carrera<input type="text" inputmode="url" data-rf="url" value="${esc(d.url)}" maxlength="500" placeholder="https://…" autocomplete="off"></label>
        <p class="hint">La web, el precio y el desnivel se comparten: les saldrán a los demás en Carreras. El plazo y tus notas son solo tuyos.</p>
        <div class="grid2"><label class="flabel-l">Precio (€)<input type="number" inputmode="decimal" step="0.5" min="0" max="10000" data-rf="price" value="${esc(d.price ?? '')}" placeholder="25"></label>
          <label class="flabel-l">Desnivel positivo (m)<input type="text" inputmode="numeric" data-rf="elevation" value="${esc(d.elevation ?? '')}" maxlength="6" placeholder="1200" autocomplete="off"></label></div>
        <label class="flabel-l">Inscripciones hasta <small class="muted">(solo lo ves tú)</small><input type="date" data-rf="deadline" value="${esc(d.deadline)}" ${d.date ? `max="${esc(d.date)}"` : ''}></label>
        <label class="flabel-l">Notas<textarea data-rf="notes" rows="3" maxlength="500" placeholder="Qué te gusta, qué dudas tienes, con quién iría…">${esc(d.notes || '')}</textarea></label>`, '#8e44ad')}
      <button class="btn primary big-save">${editing ? 'Guardar cambios' : 'Guardar en «Por valorar»'}</button>
    </form>
    ${editing ? `<div class="wf-acts"><button class="btn" data-act="w-repeat" data-id="${item.id}" data-back="1" title="Si este año no vas: se guarda la misma carrera para el año que viene (52 semanas después, fecha por confirmar)">${ico('cal')}Pasar al año que viene</button>
      <button class="btn danger ghost wf-del" data-act="w-del" data-id="${item.id}" data-back="1" aria-label="Descartar esta carrera" title="Descartar esta carrera">${ico('trash')}</button></div>` : ''}`, { back: '#/mi/valorar', rtab: 'mi' });
}


/** Mientras se escribe el nombre en «Por valorar»: lo que ya está en Carreras o en los calendarios de las federaciones (para no duplicar). */
function watchDupSuggestions(name) {
  if (normalize(name).length < 3 || !S.runnerData) return '';
  const regs = S.runnerData.registrations, today = todayISO();
  const club = searchRaces(name, regs.filter((g) => g.date >= today && !g.suspended)).slice(0, 4);
  const fed = S.fed?.races ? fedMatches(name, regs, 4) : [];
  if (!club.length && !fed.length) return '';
  return `<div class="dup">${club.length ? `<p><b>⚠️ ¿Es alguna de estas? Ya están en Carreras:</b></p><ul class="mini-list">${club.map((g) => miniRow(g,
      watchSaved(g) ? '<span class="done">✓ Ya la tienes</span>' : `<button type="button" class="btn primary small" data-act="w-add-reg" data-id="${g.id}" data-go="1">Guardar esta</button>`)).join('')}</ul>` : ''}
    ${fed.length ? `<p><b>En el calendario de las federaciones</b> (rellena los datos con un toque):</p><ul class="mini-list">${fed.map((r) => miniRow(r,
      `<button type="button" class="btn small" data-act="fill-fed" data-i="${S.fed.races.indexOf(r)}">Usar estos datos</button>`)).join('')}</ul>` : ''}</div>`;
}

/** Estrella para guardar una carrera (calendario de las federaciones o inscripciones del club) en «Por valorar». */
function starBtn(r, kind, ref) {
  if (S.preview || !Array.isArray(S.watch)) return '';
  const saved = watchSaved(r);
  return saved ? `<a class="star-btn on" href="#/mi/valorar" title="Guardada en «Por valorar»" aria-label="Guardada en Por valorar: abrir la lista">${ico('star')}<span>Guardada</span></a>`
    : `<button type="button" class="star-btn" data-act="${kind}" data-${ref[0]}="${esc(ref[1])}" title="Guardar para valorar más adelante" aria-label="Guardar ${esc(r.name)} en Por valorar">${ico('star')}<span>Valorar</span></button>`;
}
/** Lo que se guarda al marcar una carrera con la estrella. */
const watchFrom = (r, note = '') => ({ name: r.name, date: r.date, end_date: r.end_date || '', place: r.place || '', province: r.province || '', country: r.country || DEFAULT_COUNTRY, modality: r.modality, subtype: r.subtype || '', km: r.km ?? '',
  elevation: r.elevation ?? '', price: r.price ?? '', url: /^https?:\/\/\S+$/i.test(r.url || '') ? r.url : '', notes: note });

/** «Contrato»: el contrato de la temporada (y otros documentos) y el bono que marca. */
function viewRunnerContract() {
  return frame(runnerTitle(), `
    ${previewBanner()}
    ${runnerBonusCard(S.runnerData)}
    ${myDocsCard()}
    ${clubLinksCard()}
    ${licenseCard()}`,
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
  const card = (g) => raceFold(g, { key: `ar-${g.id}`, today, side: `<span class="rc-n" title="Inscritos del club" aria-label="${g.entries.length} del club">${ico('users')}${g.entries.length}</span>${g.suspended ? `<span class="rc-chip off">${ico('ban')}Suspendida</span>` : ''}`, body: `
      ${typeTag(g)}${pubTags(g)}
      ${g.candidate && !g.entries.length ? '<p class="state-tag">⭐ Sin inscritos: algún corredor la está valorando</p>' : ''}
      ${g.suspended ? '<p class="state-tag">⛔ Carrera suspendida</p>' : g.date < today ? `<p class="state-tag">🏁 Ya disputada${g.entries.some((e) => e.self_position) ? ` · 📝 ${g.entries.filter((e) => e.self_position).length} de ${g.entries.length} han puesto su resultado` : ''}</p>` : ''}
      <p class="count">👥 ${g.entries.length} del club${g.entries.length ? ': ' +
        esc(g.entries.map((e) => runnerById(e.runner_id)?.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')).join(', ')) : ''}</p>
      ${g.created_by ? `<p class="count">Añadida por ${esc(runnerById(g.created_by)?.name || 'un corredor')}</p>` : ''}<a class="btn small ghost" href="#/inscripciones/${g.id}">${ico('pen')}Abrir y editar${ico('go')}</a>` });
  return frame('Carreras', `
    ${carTabs('inscripciones')}
    <div class="toolbar">
      ${searchBox('admin', 'Buscar inscripción…')}
      <a class="btn primary add-btn" href="#/inscripciones/nueva" aria-label="Nueva inscripción" title="Nueva inscripción">＋</a>
    </div>
    ${modFilterBar(S.data.registrations)}
    <div id="reg-list">${adminRegList(card)}</div>`,
  { actions: `${viewToggle()}<button class="icon-btn" data-act="insc-menu" aria-label="Más opciones" title="Más opciones">⋮</button>` });
}

let adminCard = null;
/** Lista (o calendario) de inscripciones, filtrada por la lupa si hay texto. */
function adminRegList(card = adminCard) {
  adminCard = card;
  const today = todayISO();
  const all = regFilter(S.data.registrations).sort((a, b) => a.date.localeCompare(b.date) || byName(a, b));
  const q = S.q.admin;
  const regs = normalize(q).length >= 2 ? searchRaces(q, all) : all;
  if (q && !regs.length) return `<p class="empty">Ninguna inscripción se parece a «${esc(q)}».</p>`;
  if (S.regView === 'cal' && !q) {
    return calendarView(regs, card, () => false, { done: byMod(S.data.races), doneCard: (r) => doneRaceCard(r, { admin: true }) });
  }
  const up = regs.filter((g) => g.date >= today), past = regs.filter((g) => g.date < today);
  return `${up.length ? `<h2 class="section">📅 Próximas (${up.length})</h2>${monthList(up, card)}` : `<p class="empty">No hay inscripciones próximas${filtersOn(null) ? ' con estos filtros. <button class="link" data-act="filters-clear">Quitar filtros</button>' : ''}.</p>`}
    ${past.length ? `<h2 class="section past-head">🏁 Ya disputadas (${past.length})</h2>${past.map(card).join('')}` : ''}`;
}

// ---------- Carreras de las federaciones (leídas cada semana por GitHub) ----------

const FED_DATA_URLS = [
  // el archivo del repositorio está siempre al día; la copia publicada con la app, de respaldo
  'https://raw.githubusercontent.com/jordixaviermp-commits/Club/main/data/calendarios.json',
  'data/calendarios.json',
];
const LEAGUE_URLS = [
  // ligas y circuitos escritos a mano (el lector de las federaciones no los toca)
  'https://raw.githubusercontent.com/jordixaviermp-commits/Club/main/data/ligas.json',
  'data/ligas.json',
];
const FED_NAMES = { FCC: 'Catalana', FAC: 'Aragonesa', LIGA: 'Liga' };
/** Si la carrera es de un circuito con general (liga), tipo y nombre del circuito ya puestos. */
const circuitOf = (r) => ({ ...(r.circuit ? { race_type: 'circuito', circuit: r.circuit } : {}), ...(r.subtype ? { subtype: r.subtype } : {}) });
const raceSrc = (r) => (r.source === 'LIGA' ? r.league || 'Liga' : `Federación ${FED_NAMES[r.source] || r.source}`);
const srcNote = (r) => raceSrc(r) + (r.url ? `: ${r.url}` : '');
const fedFilter = { source: 'all', modality: 'all', leisure: false };

async function loadJson(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data.races)) return data;
    } catch { /* probar la siguiente */ }
  }
  return null;
}

async function loadFed() {
  S.fed = { loading: true };
  const [fed, leagues] = await Promise.all([loadJson(FED_DATA_URLS), loadJson(LEAGUE_URLS)]);
  const extra = (leagues?.races || []).filter((r) => r.date && r.name);
  if (fed || extra.length) {
    const races = [...(fed?.races || []), ...extra, ...projectLeagueRaces(extra, todayISO())]   // las ligas se conservan de un año a otro
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'es'));
    S.fed = { ...(fed || { errors: [] }), races };
  } else S.fed = { failed: true };
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
    if (r.tbc) return '<span class="muted">📅 Fecha por confirmar</span>';   // sin fecha oficial no se crea ni se apunta nadie: solo se guarda en «Por valorar»
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
  const perMonth = new Map();
  for (const r of list) perMonth.set(r.date.slice(0, 7), (perMonth.get(r.date.slice(0, 7)) || 0) + 1);
  let month = '';
  const items = list.map((r, i) => {
    const ym = r.date.slice(0, 7);
    const head = ym !== month ? `<h2 class="section fed-month">${MONTH_NAMES[Number(ym.slice(5)) - 1][0].toUpperCase() + MONTH_NAMES[Number(ym.slice(5)) - 1].slice(1)} ${ym.slice(0, 4)}<small> · ${perMonth.get(ym)} carrera${perMonth.get(ym) === 1 ? '' : 's'}</small></h2>` : '';
    month = ym;
    return `${head}${raceFold(r, { key: `fd-${r.source}-${r.date}-${normalize(r.name).replace(/[^a-z0-9]/g, '').slice(0, 24)}`, today: todayISO(), cls: 'fed', side: `<span class="src src-${esc(r.source)}">${esc(r.source === 'LIGA' ? 'Liga' : FED_NAMES[r.source] || r.source)}</span>`, body: `
      <p class="fed-meta"><span class="src src-${esc(r.source)}">${esc(r.source === 'LIGA' ? 'Liga' : FED_NAMES[r.source] || r.source)}</span>
        ${esc(r.source === 'LIGA' ? '' : r.discipline || '')}${r.kind === 'Ocio' ? ' · ocio' : ''}${r.info ? `${r.source === 'LIGA' ? '' : ' · '}<span class="muted">${esc(r.info)}</span>` : ''}</p>
      <div class="row">
        ${r.url ? `<a class="btn small" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Ver en la web ↗</a>` : ''}
        ${action(r)}${runner ? starBtn(r, 'w-add-fed', ['i', f.races.indexOf(r)]) : ''}
      </div>` })}`;
  }).join('');
  const updated = f.updated_at ? new Date(f.updated_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return frame('Federaciones', `
    ${runner ? previewBanner() : ''}
    <div class="years fed-tabs" role="tablist">${[['all', 'Todas'], ['FCC', 'Catalana'], ['FAC', 'Aragonesa'], ['LIGA', 'Ligas']].map(([v, l]) =>
      `<button class="chip${fedFilter.source === v ? ' on' : ''}" role="tab" aria-selected="${fedFilter.source === v}" data-act="fed-source" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="fed-row2">
      <label class="fed-mod"><select data-fed="modality" aria-label="Modalidad">${opt('all', 'Modalidad', fedFilter.modality)}${mods.map((m) => opt(m, m, fedFilter.modality)).join('')}</select></label>
      <button type="button" class="chip fed-chip${fedFilter.leisure ? ' on' : ''}" data-act="fed-leisure" aria-pressed="${fedFilter.leisure}" title="Incluir también las marchas y pruebas de ocio">Incluir marchas</button>
    </div>
    ${items || '<p class="empty">No hay carreras con estos filtros.</p>'}
    ${f.errors?.length ? `<p class="card warn">Aviso de la última lectura: ${esc(f.errors.join(' · '))}</p>` : ''}
    <p class="hint">${runner
      ? 'Si ya está en el club, pulsa «Apuntarme». Si no, «Añadir y apuntarme» la crea con los datos ya rellenados.'
      : 'Pulsa «Crear inscripción» para añadirla con nombre, fecha y lugar ya rellenados.'}</p>
    <p class="hint center">Datos de las webs de las federaciones${updated ? `, leídos el ${updated}` : ''}. Comprueba siempre los detalles en su web.</p>
    ${fedLinks()}`, { ...opts, actions: `<span class="fed-total" title="${list.length} carrera${list.length === 1 ? '' : 's'} con estos filtros" aria-label="${list.length} carreras">${list.length}</span>` });
}

function draftRegistration(id) {
  if (id === 'nueva') {
    const pre = S.prefill; S.prefill = null;   // viene de «Carreras de las federaciones»
    return { kind: 'reg', id: null, name: '', date: '', place: '', province: '', country: DEFAULT_COUNTRY, modality: 'Carretera', race_type: 'suelta', circuit: '', subtype: '', km: '', url: '', elevation: '', price: '', notes: '', people: [], ...pre };
  }
  const g = S.data.registrations.find((x) => x.id === id);
  if (!g) return null;
  return { kind: 'reg', ...g, multi: !!g.end_date, people: g.entries.map((e) => ({ runner_id: e.runner_id, runner_name: runnerById(e.runner_id)?.name || '?', category: e.category || '', self_position: e.self_position || null })).sort((a, b) => a.runner_name.localeCompare(b.runner_name, 'es')) };
}

function raceFields(d) {
  const pv = racePreview(d), open = !d.id;
  return `
    ${fsecD('af1', 1, 'flag', 'Qué carrera es', pv[0], `<label class="flabel-l">Nombre<input data-f="name" value="${esc(d.name)}" required></label>`, '#1f6fd1', open)}
    ${fsecD('af2', 2, 'cal', 'Cuándo y dónde', pv[1], `<label class="flabel-l">${d.multi ? 'Primer día' : 'Fecha'}<input type="date" data-f="date" value="${esc(d.date)}" required></label>
      <label class="check"><input type="checkbox" data-act-change="multi" ${d.multi ? 'checked' : ''}> Carrera de varios días (por etapas)</label>
      ${d.multi ? `<label class="flabel-l">Último día<input type="date" data-f="end_date" value="${esc(d.end_date || '')}" min="${esc(d.date || '')}" required></label>` : ''}
      <label class="flabel-l">Lugar<input data-f="place" value="${esc(d.place || '')}"></label>
      <div class="grid2"><label class="flabel-l">Provincia<input data-f="province" list="dl-prov" value="${esc(d.province || '')}" autocomplete="off"></label>
        <label class="flabel-l">País<input data-f="country" list="dl-country" value="${esc(d.country || '')}"></label></div>`, '#0f9d8a', open)}
    ${fsecD('af3', 3, 'bars', 'Qué tipo de carrera es', pv[2], `<div class="disc-field"><span class="flabel">Modalidad</span>${modalityChips(d, 'data-f')}</div>
      ${detailInputs(d, 'data-f')}
      ${typeFields(d, 'data-f')}`, '#e07800', open)}
    ${fsecD('af4', 4, 'link', 'Web, desnivel y precio', pv[3], `<div class="grid2"><label class="flabel-l">Desnivel positivo (m)<input type="text" inputmode="numeric" data-f="elevation" value="${esc(d.elevation ?? '')}" maxlength="6" placeholder="1200" autocomplete="off"></label>
      <label class="flabel-l">Precio inscripción (€)<input type="text" inputmode="decimal" data-f="price" value="${esc(d.price ?? '')}" maxlength="8" placeholder="25" autocomplete="off"></label></div>
      <label class="flabel-l">Dirección de la web<input type="text" inputmode="url" data-f="url" value="${esc(d.url || '')}" maxlength="500" placeholder="https://…" autocomplete="off"></label>
      <p class="hint">Les sale a todos los corredores con un botón «Web de la carrera». ${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">Abrirla ↗</a>` : 'Si la dejas vacía, cualquier corredor que la conozca podrá ponerla.'}</p>`, '#2f6fd6')}`;
}

function addRunnerSelect(d) {
  const taken = new Set(d.people.map((p) => p.runner_id));
  const free = S.data.runners.filter((r) => !taken.has(r.id)).sort(byName);
  if (!free.length) return S.data.runners.length ? '' : '<p class="muted">Primero da de alta corredores en «Corredores».</p>';
  return `<select data-act-change="add-person"><option value="">+ Añadir corredor…</option>${free.map((r) => opt(r.id, r.name)).join('')}</select>
    ${free.length > 1 ? `<details class="multi-add"><summary>+ Añadir varios corredores</summary>
      <div class="multi-list">${free.map((r) => `<label class="check"><input type="checkbox" data-many="${r.id}"> ${esc(r.name)}${r.category ? ` <small class="muted">${esc(r.category)}</small>` : ''}</label>`).join('')}</div>
      <button type="button" class="btn" data-act="add-many">Añadir los marcados</button></details>` : ''}`;
}

/** Al editar una carrera abierta desde la ficha de un corredor (#/carreras/<id>/<corredor>), «atrás» vuelve a esa ficha. */
const editBack = (def) => { const rid = parseRoute().rest; return rid && runnerById(rid) ? `#/corredor/${rid}` : def; };
/** Quién añadió la carrera (si fue un corredor). */
const createdByLine = (d) => (d.created_by ? `<p class="hint">➕ Añadida por <b>${esc(runnerById(d.created_by)?.name || 'un corredor')}</b>: también puede editarla o borrarla desde su enlace.</p>` : '');

function viewRegistrationEdit() {
  const d = S.draft;
  if (!d) return frame('Inscripción', '<p class="empty">Esta inscripción ya no existe.</p>', { back: editBack('#/inscripciones') });
  return frame(d.id ? 'Editar inscripción' : 'Nueva inscripción', `
    ${d.id ? createdByLine(d) + pubsBlock(d, false) : ''}
    <form class="card stack" data-form="save-reg">
      ${raceFields(d)}
      ${d.id ? '' : `<div id="dup-admin">${dupSuggestions(d.name, S.data.registrations, false)}</div>`}
      <label>Notas<textarea data-f="notes" rows="2">${esc(d.notes || '')}</textarea></label>
      <label class="check"><input type="checkbox" data-act-change="suspended" ${d.suspended ? 'checked' : ''}> ⛔ Carrera suspendida</label>
      <h3>Inscritos (${d.people.length})</h3>
      <ul class="edit-list">${d.people.map((p, i) => `<li>
        <span class="name">${esc(p.runner_name)}${p.self_position ? ` <small class="self-res">📝 puso ${p.self_position}º</small>` : ''}</span>
        ${catSelect(`data-p="${i}" data-pf="category" aria-label="Categoría"`, p.category)}
        <button type="button" class="icon-btn" data-act="del-person" data-i="${i}" aria-label="Quitar">✕</button></li>`).join('')}</ul>
      ${addRunnerSelect(d)}
      <div class="save-bar"><button class="btn primary block">Guardar</button></div>
    </form>
    ${d.id ? `<div class="stack">
      ${d.suspended ? '' : '<button class="btn" data-act="promote">Pasar a resultados</button>'}
      <button class="btn danger ghost" data-act="del-reg">Borrar inscripción</button></div>` : ''}`,
  { back: editBack('#/inscripciones') });
}

/** Corredor: noticias de la dirección. Se marcan como leídas al abrir la pantalla. */
async function enterNews() {
  await loadNews();
  S.newsFresh = new Set(unreadNews().map((n) => n.id));
  markNewsSeen();
  if (S.runnerData) render();
}
/** Bloque «¿Vienes?» de una noticia que pide confirmación. */
function rsvpBlock(n) {
  const yes = Number(n.yes_count) || 0;
  const who = n.yes_list || [];
  const counts = who.length
    ? `<details class="rsvp-who" data-open-key="who-${esc(n.id)}"${S.open?.[`who-${n.id}`] ? ' open' : ''}><summary><span>${ico('users')}<b>${yes} apuntado${yes === 1 ? '' : 's'}</b>${n.no_count ? ` <small class="muted">· ${n.no_count} no van</small>` : ''}</span>${ico('chevd', 'desp-chev')}</summary>
        <ul class="who-list">${who.map((x) => `<li>${esc(x.name)}${x.guests ? ` <small class="muted">+${x.guests} acompañante${x.guests === 1 ? '' : 's'}</small>` : ''}</li>`).join('')}</ul></details>`
    : `<p class="count">${ico('users')} ${yes} apuntado${yes === 1 ? '' : 's'}${n.no_count ? ` · ${n.no_count} no van` : ''}</p>`;
  if (S.preview) return `<div class="rsvp"><p class="muted small">Esta noticia pide confirmación («Me apunto / No voy»).</p>${counts}</div>`;
  const mine = n.my_answer === 'si' ? `✅ Te has apuntado${n.my_guests ? ` con ${n.my_guests} acompañante${n.my_guests === 1 ? '' : 's'}` : ''}`
    : n.my_answer === 'no' ? '❌ Has dicho que no vas' : '';
  return `<div class="rsvp ${n.my_answer ? 'answered' : 'todo'}">${counts}
    <p>${mine ? `<b>${mine}</b> · puedes cambiarlo:` : '<b>¿Vienes?</b> Responde para que la dirección sepa cuántos sois.'}</p>
    <div class="row"><label class="inline">Acompañantes <select data-guests="${n.id}">${[0, 1, 2, 3, 4, 5].map((k) => opt(String(k), String(k), String(n.my_guests ?? 0))).join('')}</select></label>
      <button class="btn primary small" data-act="news-reply" data-id="${n.id}" data-a="si">Me apunto</button>
      <button class="btn ghost small" data-act="news-reply" data-id="${n.id}" data-a="no">No voy</button></div></div>`;
}

function viewNews() {
  const list = S.news;
  return frame('Noticias del club', `
    ${previewBanner()}
    ${list === null ? '<p class="card warn">Las noticias aún no están activadas: la dirección tiene que ejecutar un cambio en la base de datos.</p>'
      : list.length ? list.map((n) => `<article class="card news${S.newsFresh.has(n.id) ? ' fresh' : ''}">
        <div class="race-head"><h3>${esc(n.title)}</h3>${S.newsFresh.has(n.id) ? '<span class="tag t-new">Nueva</span>' : ''}</div>
        <p class="muted">${formatDate(String(n.created_at).slice(0, 10))}${n.expires_at ? ` · hasta el ${formatDate(n.expires_at, false)}` : ''}</p>
        ${n.body ? `<p class="news-body">${newsText(n.body)}</p>` : ''}${n.rsvp ? rsvpBlock(n) : ''}</article>`).join('')
      : '<p class="empty">No hay noticias por ahora. Cuando el club tenga algo que contaros (quedadas, pedidos de ropa…), lo verás aquí.</p>'}`, { rtab: 'noticias' });
}

// ======================================================================
//  Encargado de redes (entra con un enlace propio y solo ve esto)
// ======================================================================
async function loadSocial() {
  const code = store.get(SOCIAL_KEY);
  if (!code) return;
  try { S.socialData = await api.socialView(code); }
  catch (e) {
    if (/enlace_no_valido/.test(String(e?.message))) { store.del(SOCIAL_KEY); S.socialData = null; toast('Este enlace ya no es válido. Pide uno nuevo a la dirección.', true); return go('#/'); }
    toast(friendlyError(e), true);
  }
  if (parseRoute().view === 'redes') render();
}
const socialLink = (code) => `${location.origin}${location.pathname}#/r/${code}`;
function socialUpcoming() {
  const d = S.socialData, days = S.socDays || 14;
  const lim = (() => { const x = new Date(d.today + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + days); return x.toISOString().slice(0, 10); })();
  return d.upcoming.filter((g) => g.date <= lim);
}
function socialText(list, days) {
  return `🚴 CC Monzón · carreras de los próximos ${days} días\n\n${list.map((g) => `📅 ${when(g)} · ${g.name}\n${place(g) || g.modality ? `📍 ${[place(g), [g.modality, g.subtype].filter(Boolean).join(' '), g.km ? kmText(g.km) : ''].filter(Boolean).join(' · ')}\n` : ''}👥 ${(g.people_cat || g.people).join(', ')}`).join('\n\n')}\n\n📸 Crónica y foto con la equipación, en las 48 h siguientes a la prueba.`;
}
function resultText(x) {
  return `🏁 ${x.name} · ${when(x)}${place(x) ? ' · ' + place(x) : ''}\n${x.podium.map((p) => `${medal(p.position)} ${p.name}${p.category ? ` (${p.category})` : ''}`).join('\n')}\n${x.participants} del club ${x.participants === 1 ? 'participó' : 'participaron'} 💪`;
}
function viewSocial() {
  const d = S.socialData, days = S.socDays || 14;
  if (!d) return frame('Redes · CC Monzón', '<p class="empty">Cargando…</p>', { actions: '' });
  const posted = new Set(d.posted);
  const up = socialUpcoming(), todo = up.filter((g) => !posted.has(postKey(g)));
  const chk = (g, k = postKey(g)) => `<label class="check post-check"><input type="checkbox" data-act-change="socpost" data-key="${esc(k)}" ${posted.has(k) ? 'checked' : ''}> ✓ ${k.startsWith('res|') ? 'Resultados publicados' : 'Aviso publicado'}</label>`;
  const head = (g) => `${raceHead(g)}${typeTag(g)}`;
  return frame('Redes · CC Monzón', `
    <p class="hint">Hola 👋 Estas son las carreras del club para publicar. Marca ✓ las que ya has publicado: la dirección lo verá.</p>
    <div class="years">${[7, 14, 30].map((n) => `<button class="chip${n === days ? ' on' : ''}" data-act="soc-days" data-n="${n}">${n} días</button>`).join('')}</div>
    <h2 class="section">📅 Próximas (${up.length}) · ${todo.length} sin publicar</h2>
    ${todo.length ? `<div class="row"><button class="btn primary" data-act="soc-copy">📋 Copiar texto</button><button class="btn" data-act="soc-wa">WhatsApp</button></div>` : ''}
    ${up.length ? up.map((g) => `<article class="card race ${modClass(g.modality)}${posted.has(postKey(g)) ? ' gone' : ''}">${head(g)}
      <p class="count">👥 ${esc((g.people_cat || g.people).join(', '))}</p><div class="row">${chk(g)}</div></article>`).join('') : `<p class="empty">No hay carreras con inscritos en los próximos ${days} días.</p>`}
    <h2 class="section">🏁 Resultados recientes (${d.recent.length})</h2>
    ${d.recent.length ? d.recent.map((x) => `<article class="card race done-race ${modClass(x.modality)}${posted.has(resKey(x)) ? ' gone' : ''}">${head(x)}
      ${x.podium.length ? `<p class="pods">${x.podium.map((p) => `${medal(p.position)} ${esc(p.name)}${p.category ? ` <small>${esc(p.category)}</small>` : ''}`).join(' · ')}</p>` : '<p class="muted small">Sin podio.</p>'}
      <p class="count">${x.participants} del club</p>
      <div class="row">${chk(x, resKey(x))}<button class="btn small" data-act="soc-copy-res" data-key="${esc(resKey(x))}">📋 Copiar</button></div></article>`).join('') : '<p class="empty">No hay resultados de las últimas semanas.</p>'}`,
  { actions: '<button class="icon-btn" data-act="soc-refresh" aria-label="Actualizar">↻</button>' });
}
async function copyText(t, okMsg) { try { await navigator.clipboard.writeText(t); toast(okMsg); } catch { prompt('Copia el texto:', t); } }

/** Dirección: todo lo del encargado de redes en un solo desplegable pequeño (avisarle de las próximas carreras y su enlace). */
function socialAdminCard() {
  const code = S.data.settings?.social?.code;
  const a = adminAlerts();
  return `<details class="card enc-det" data-open-key="encargado"${S.open?.encargado ? ' open' : ''}>
    <summary>👤 Encargado de redes <small class="muted">· avisarle y su enlace${a.weekTodo.length ? ` · ${a.weekTodo.length} por avisar` : ''}</small></summary>
    <p class="net-sub"><b>Avisarle de las próximas carreras</b> <small class="muted">(cláusula 8: con una semana de antelación)</small></p>
    ${a.week.length ? `<p class="hint">Próximos 7 días: <b>${a.week.length}</b> carrera${a.week.length === 1 ? '' : 's'} con inscritos, ${a.weekTodo.length} sin publicar.</p>
      ${a.weekTodo.length ? `<div class="row"><button class="btn primary small" data-act="alert-week-copy">📋 Copiar texto</button><button class="btn small" data-act="alert-week-wa">WhatsApp</button><button class="btn small ghost" data-act="post-all">✓ Marcar todas</button></div>` : '<p class="pen ok">✅ Todas avisadas.</p>'}`
      : '<p class="hint">No hay carreras con inscritos en los próximos 7 días.</p>'}
    <p class="net-sub"><b>Su enlace</b> <small class="muted">(verá solo las próximas carreras con quién va y los resultados recientes; lo que marque lo ves tú)</small></p>
    ${S.data.socialPosts === null ? '<p class="warn card">Falta ejecutar en Supabase <code>supabase/cambios/2026-11-12-redes.sql</code>.</p>'
      : code ? `<p><code class="break">${esc(socialLink(code))}</code></p>
        <div class="row"><button class="btn primary small" data-act="soc-link-copy">Copiar enlace</button><button class="btn small" data-act="soc-link-wa">WhatsApp</button>
          <button class="btn small danger ghost" data-act="soc-link-off">Anular enlace</button></div>`
      : '<button class="btn primary small" data-act="soc-link-new">Crear enlace para el encargado de redes</button>'}</details>`;
}

/** Pestañas de la zona de redes (se repiten arriba en Panel, Calendario y Publicaciones). */
function netTabs(on) {
  let pend = 0, due = 0; try { pend = socialPending(); due = pubDue(); } catch { /* sin datos aún */ }
  return `<nav class="net-tabs no-print" aria-label="Redes">${[['panel', '📋', 'Panel', '#/redes', pend], ['cal', '📅', 'Calendario', '#/semana', 0], ['pub', '📸', 'Publicar', '#/publicaciones', due], ['ig', '📈', 'Instagram', '#/instagram', 0]]
    .map(([k, i, l, h, n]) => `<a class="net-tab${on === k ? ' on' : ''}" href="${h}"><span aria-hidden="true">${i}</span><b>${l}</b>${n ? `<em>${n}</em>` : ''}</a>`).join('')}</nav>`;
}

/** Dirección: carreras de los próximos días con quién va, para avisar al encargado de redes (cláusula 8). */
function weekRaces(days) {
  const from = todayISO(), to = (() => { const d = new Date(from + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); })();
  return S.data.registrations.filter((g) => !g.suspended && g.date >= from && g.date <= to && g.entries.length)
    .sort((a, b) => a.date.localeCompare(b.date) || byName(a, b));
}
function weekText(days, list = weekRaces(days)) {
  if (!list.length) return '';
  const who = (g) => g.entries.map((e) => { const n = runnerById(e.runner_id)?.name; return n && (e.category ? `${n} (${e.category})` : n); }).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')).join(', ');
  return `🚴 CC Monzón · carreras de los próximos ${days} días\n\n${list.map((g) => `📅 ${when(g)} · ${g.name}\n${place(g) || g.modality ? `📍 ${[place(g), [g.modality, g.subtype].filter(Boolean).join(' '), g.km ? kmText(g.km) : ''].filter(Boolean).join(' · ')}\n` : ''}👥 ${who(g)}`).join('\n\n')}\n\n📸 Crónica y foto con la equipación, en las 48 h siguientes a la prueba.`;
}
/** Casilla «publicada en redes» (se guarda en este móvil). */
const postCheck = (g, k = postKey(g), label = 'Publicada en redes') => `<label class="check post-check"><input type="checkbox" data-act-change="post" data-key="${esc(k)}" ${postedSet().has(k) ? 'checked' : ''}> ✓ ${label}</label>`;
/** Tarjeta de una carrera con inscritos (inscripción o carrera ya con resultados) y su casilla de publicada. */
function postCard(g, done = false) {
  const names = (done ? (g.results || []).map((x) => x.runner_name) : (g.entries || []).map((e) => runnerById(e.runner_id)?.name)).filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'es'));
  const isDone = done || g.date < todayISO();
  const k = done ? resKey(g) : postKey(g);
  return `<article class="card race ${modClass(g.modality)}${postedSet().has(k) ? ' gone' : ''}">${raceHead(g)}${typeTag(g)}
    <p class="count">${isDone ? '🏁 Disputada · ' : ''}👥 ${esc(names.join(', '))}</p>
    ${g.suspended ? '<p class="state-tag">⛔ Suspendida</p>' : ''}
    <div class="row">${done ? postCheck(g, k, 'Resultados publicados') : postCheck(g, k, 'Aviso publicado')}<a class="btn small ghost" href="#/${done ? 'carreras' : 'inscripciones'}/${g.id}">Abrir</a></div></article>`;
}
function viewWeek() {
  const days = S.weekDays || 14, cal = S.weekView === 'cal';
  const views = `<div class="years"><button class="chip${cal ? '' : ' on'}" data-act="week-view" data-v="list">📋 Lista</button><button class="chip${cal ? ' on' : ''}" data-act="week-view" data-v="cal">📅 Calendario</button></div>`;
  if (cal) {
    const regs = S.data.registrations.filter((g) => g.entries.length && !g.suspended);
    const done = S.data.races.filter((r) => (r.results || []).length);
    return frame('Próximas carreras', `${netTabs('cal')}${views}
      <p class="hint">Todas las carreras del club, próximas y ya hechas. En cada día sale ✓ si está publicada en redes (½ si hay alguna sin publicar). Toca un día y marca las casillas.</p>
      ${calendarView(regs, (g) => postCard(g), () => false, { done, doneCard: (r) => postCard(r, true), isPosted: (g) => postedSet().has(g.results ? resKey(g) : postKey(g)) })}`, { back: '#/redes' });
  }
  const list = weekRaces(days), posted = postedSet(), todo = list.filter((g) => !posted.has(postKey(g)));
  return frame('Próximas carreras', `${netTabs('cal')}${views}
    <p class="hint">Para avisar al encargado de redes con una semana de antelación (cláusula 8 del contrato). Salen las carreras con algún inscrito, sin las suspendidas. Marca ✓ las que ya has publicado.</p>
    <div class="years">${[7, 14, 30].map((n) => `<button class="chip${n === days ? ' on' : ''}" data-act="week-days" data-n="${n}">${n} días</button>`).join('')}</div>
    ${list.length ? `<p class="hint"><b>${todo.length}</b> sin publicar de ${list.length}.</p>
      <div class="row">${todo.length ? `<button class="btn primary" data-act="week-copy">📋 Copiar texto</button><button class="btn" data-act="week-wa">WhatsApp</button>` : ''}
        <button class="btn ghost" data-act="week-all">${todo.length ? '✓ Marcar todas' : '↺ Desmarcar todas'}</button></div>
      ${list.map((g) => postCard(g)).join('')}
      <details class="card"><summary><b>Ver el texto que se copia</b></summary><pre class="week-pre">${esc(weekText(days, todo.length ? todo : list))}</pre></details>`
      : `<p class="empty">No hay carreras con inscritos en los próximos ${days} días.</p>`}
    `, { back: '#/redes' });
}

/** Dirección: marca o desmarca la crónica de uno o varios corredores en una carrera (clave «AAAA-MM-DD|nombre»). */
async function setChronicleFor(runnerIds, key, done) {
  const ok = await run(async () => {
    for (const id of runnerIds) await api.setChronicle(id, key, done);
    const list = (S.data.chronicles || []).filter((x) => !(runnerIds.includes(x.runner_id) && x.race_key === key));
    if (done) for (const id of runnerIds) list.push({ runner_id: id, race_key: key });
    S.data.chronicles = list; return true;
  }, done ? '✓ Crónica marcada' : 'Crónica desmarcada');
  render();
  return ok;
}

/** Estado de la historia previa (la publica la tarea automática 2 días antes) de una inscripción o carrera. */
const pubStory = (g) => (Array.isArray(g.entries) && !g.entries.length ? null : storyState(g, S.stories?.byKey ? S.stories : null, postedSet().has(postKey(g)), todayISO()));
const shortDate = (iso) => formatDate(iso, false);
const storyLabel = (s) => ({ ok: `Historia ✓ ${s.date ? shortDate(s.date) : ''}${s.n > 1 ? ` · ${s.n} páginas` : ''}`.trim(), manual: 'Historia ✓ (marcada a mano)', hoy: 'Historia: sale hoy',
  programada: `Historia: sale el ${s.date ? shortDate(s.date) : ''}`, falta: 'Historia: no consta' }[s.state]);
const storyTag = (g) => { const s = pubStory(g); return s ? `<span class="pub-tag ${s.state === 'ok' || s.state === 'manual' ? 'ok' : s.state === 'falta' ? 'bad' : ''}">📸 ${s.state === 'falta' ? '⚠️ ' : ''}${esc(storyLabel(s))}</span>` : ''; };
const postTag = (r) => ((r.results || []).length && (r.end_date || r.date) <= todayISO()
  ? `<span class="pub-tag ${postedSet().has(resKey(r)) ? 'ok' : ''}">🖼️ Post de resultados ${postedSet().has(resKey(r)) ? '✓' : 'pendiente'}</span>` : '');
const pubTags = (g, done = false) => { const t = storyTag(g) + (done ? postTag(g) : ''); return t ? `<p class="pub-tags">${t}</p>` : ''; };
/** Bloque «Redes» en la ficha de una carrera o inscripción: historia previa (automática) y post de resultados (a mano). */
function pubsBlock(d, done) {
  const g = (done ? S.data.races : S.data.registrations).find((x) => x.id === d.id);
  if (!g) return '';
  const s = pubStory(g);
  return `<section class="card pubs-card"><h3>📸 Redes</h3>
    <p><b>Historia previa</b> <small class="muted">(la publica la tarea automática 2 días antes)</small><br>${s ? storyTag(g) : '<span class="muted">No toca o aún no hay datos.</span>'}</p>
    ${s?.state === 'falta' ? `<button class="btn small" data-act="pub-story-manual" data-key="${esc(postKey(g))}">Marcar como publicada (a mano)</button>` : ''}
    ${done && (g.results || []).length ? `<p><b>Post de resultados</b> <small class="muted">(lo publicas tú)</small></p><div class="row">${postCheck(g, resKey(g), 'Post de resultados publicado')}</div>` : ''}</section>`;
}

/** Texto de la publicación de resultados de una carrera ya en resultados. */
const raceResultText = (r) => resultText({ name: r.name, date: r.date, end_date: r.end_date, place: r.place, province: r.province,
  podium: (r.results || []).filter((x) => x.position >= 1 && x.position <= 3).sort((a, b) => a.position - b.position).map((x) => ({ position: x.position, name: x.runner_name, category: x.category })),
  participants: (r.results || []).length });

/** Dirección: carpeta de publicaciones en redes: qué falta, qué está hecho y qué tiene alguna anomalía. */
function viewPublications() {
  const years = availableYears(S.data.races);
  if (!years.includes(S.year)) S.year = years[0];
  const a = pubAudit(S.year);
  const warn = S.data.socialPosts === null ? '<p class="warn card">Falta ejecutar en Supabase <code>supabase/cambios/2026-11-12-redes.sql</code>: sin él las marcas solo se guardan en este móvil.</p>' : '';
  const ago = (n) => (n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`);
  const open = (r) => `<a class="btn small ghost" href="#/carreras/${r.id}">Abrir</a>`;
  const resCard = (x, late = false) => { const r = x.race; return `<article class="card race ${modClass(r.modality)}${late ? ' late' : ''}">${raceHead(r, { side: `<span class="rc-cd${late ? ' now' : ''}">terminó ${ago(x.days)}</span>` })}
      <p class="pods">${(r.results || []).filter((y) => y.position >= 1 && y.position <= 3).sort((p, q) => p.position - q.position).map((y) => `${medal(y.position)} ${esc(y.runner_name)}${y.category ? ` <small>${esc(y.category)}</small>` : ''}`).join(' · ') || '<span class="muted small">Sin podio</span>'}</p>
      <p class="count">${(r.results || []).length} del club</p>
      <div class="row">${postCheck(r, x.key, 'Resultados publicados')}<button class="btn small" data-act="pub-copy" data-id="${r.id}">📋 Copiar texto</button>${open(r)}</div></article>`; };
  const anomalies = [
    ...a.resLate.map((x) => ({ icon: '⚠️', text: `Resultados sin publicar desde hace ${x.days} días: <b>${esc(x.race.name)}</b>`, card: resCard(x, true) })),
    ...a.noResults.map((x) => ({ icon: '❓', text: `<b>${esc(x.reg.name)}</b> terminó ${ago(x.days)} y nadie ha puesto su puesto (${x.people} inscrito${x.people === 1 ? '' : 's'}): no hay resultados que publicar`, link: `#/inscripciones/${x.reg.id}` })),
    ...a.suspendedPosted.map((x) => ({ icon: '⛔', text: `Se publicó el aviso de <b>${esc(x.name)}</b>, pero la carrera está suspendida: conviene publicar que se ha suspendido`, link: `#/inscripciones/${x.id}` })),
    ...a.storyMissing.map((g) => ({ icon: '📸', text: `No consta la historia previa de <b>${esc(g.name)}</b> (${esc(shortDate(g.date))}); debía salir el ${esc(shortDate(storyDateOf(g)))}. Si se publicó y no consta, márcala a mano`, link: `#/${g.results ? 'carreras' : 'inscripciones'}/${g.id}`, storyKey: postKey(g) })),
    ...(a.orphans.length ? [{ icon: '🔗', text: `<b>${a.orphans.length}</b> marca${a.orphans.length === 1 ? '' : 's'} de «publicada» sin carrera (se cambió el nombre o la fecha después de marcarla, o se borró): ${esc(a.orphans.slice(0, 3).map((o) => o.key.replace('res|', '').split('|')[1] || o.key).join(', '))}${a.orphans.length > 3 ? '…' : ''}`, orphan: true }] : []),
  ];
  return frame('Publicaciones en redes', `
    ${netTabs('pub')}
    ${yearPicker(years)}
    <div class="rr-kpis pub-kpis">
      <div class="rr-kpi good"><b>${a.done}</b><span>✅ hechas</span></div>
      <div class="rr-kpi warn${a.pending ? '' : ' zero'}"><b>${a.pending}</b><span>⏳ pendientes</span></div>
      <div class="rr-kpi bad${a.anomalies ? '' : ' zero'}"><b>${a.anomalies}</b><span>⚠️ anomalías</span></div>
    </div>
    <p class="hint">Cada carrera tiene <b>dos publicaciones</b>: el <b>aviso</b> antes y los <b>resultados</b> unos días después. Marca ✓ cada una cuando esté hecha (el encargado de redes también las marca desde su enlace).</p>
    ${warn}
    ${anomalies.length ? `<h2 class="section">⚠️ Anomalías (${a.anomalies})</h2>${anomalies.map((x) => x.card || `<article class="card pen bad-box"><p>${x.icon} ${x.text}</p>
      ${x.storyKey ? `<button class="btn small" data-act="pub-story-manual" data-key="${esc(x.storyKey)}">Marcar como publicada</button>` : ''}${x.link ? `<a class="btn small" href="${x.link}">Abrir</a>` : ''}${x.orphan ? '<button class="btn small danger ghost" data-act="pub-orphans-del">Quitar esas marcas</button>' : ''}</article>`).join('')}` : '<p class="card pen ok">✅ Sin anomalías.</p>'}
    ${a.resOld.length ? `<article class="card"><p>📦 <b>${a.resOld.length}</b> carrera${a.resOld.length === 1 ? '' : 's'} de hace más de 45 días sin marca de «resultados publicados». No se vigilan (son de antes de este control), así que no cuentan como pendientes ni anomalías.</p>
      <button class="btn small" data-act="pub-old-done">✓ Darlas por publicadas</button></article>` : ''}
    <h2 class="section">🏁 Resultados por publicar (${a.resPending.length})</h2>
    ${a.resPending.length ? `<p class="hint">Carreras ya disputadas con los resultados que han puesto los corredores. Copia el texto, publícalo y marca ✓. Pasados 7 días sin publicar, salen como anomalía.</p>
      ${a.resPending.length > 1 ? `<button class="btn ghost" data-act="pub-all-res">✓ Marcar todas como publicadas</button>` : ''}
      ${a.resPending.map((x) => resCard(x)).join('')}` : '<p class="empty small">No hay resultados pendientes de publicar. 🎉</p>'}
    ${a.waiting.length ? `<h2 class="section">🕓 A la espera de los resultados (${a.waiting.length})</h2>
      <p class="hint">Ya se han corrido, pero los corredores aún no han puesto su puesto (tienen una semana; luego pasan solas a resultados, y quien no lo puso lo puede poner después).</p>
      ${a.waiting.map((x) => `<article class="card"><p><b>${esc(x.reg.name)}</b> · ${esc(when(x.reg))}<br><small class="muted">terminó ${ago(x.days)} · ${x.people} inscrito${x.people === 1 ? '' : 's'}</small></p><a class="btn small ghost" href="#/inscripciones/${x.reg.id}">Abrir</a></article>`).join('')}` : ''}
    ${a.resDone.length ? `<details class="card"><summary><b>✅ Resultados ya publicados (${a.resDone.length})</b></summary><ul class="mini-list">${a.resDone.map((x) => `<li><div><b>${esc(x.race.name)}</b><small class="muted">${esc(when(x.race))}</small></div>
      <label class="check"><input type="checkbox" data-act-change="post" data-key="${esc(x.key)}" checked> ✓</label></li>`).join('')}</ul><p class="hint">Quita la marca si te equivocaste.</p></details>` : ''}
    <p class="hint">Las historias previas automáticas, el aviso y los resultados de cada carrera, de un vistazo, están en el <a href="#/redes">Panel</a>.</p>`, { back: '#/redes', actions: '<button class="icon-btn" data-act="pub-refresh" aria-label="Actualizar">↻</button>' });
}


// ======================================================================
//  Redes (dirección): panel de lo pendiente, en curso y hecho
// ======================================================================

const NET_ICON = { story: '📸', aviso: '📝', res: '🖼️', cro: '✍️' };
const NET_LABEL = { story: 'Historia previa', aviso: 'Aviso', res: 'Resultados', cro: 'Crónicas de los corredores' };
const NET_GLYPH = { ok: '✓', curso: '⏳', pend: '❗', late: '⚠️', na: '' };

function viewNetworks() {
  const wide = !!S.netAll;
  const b = netBoard(wide ? { back: 365, ahead: 365 } : undefined);
  const f = S.netFilter || (b.counts.pend ? 'pend' : b.counts.curso ? 'curso' : 'hecho');
  const shown = b.items.filter((x) => x.status === f);
  const cap = f === 'hecho' && !S.netMore ? 12 : 200;
  const warn = S.data.socialPosts === null ? '<p class="warn card">Falta ejecutar en Supabase <code>supabase/cambios/2026-11-12-redes.sql</code>: sin él las marcas solo se guardan en este móvil.</p>' : '';
  const posted = postedSet();
  const piece = (it, x) => {
    if (x.k === 'cro') {   // crónicas: desplegable con una casilla por corredor (la dirección marca si lo pasó y no lo marcó él)
      const ok = `net-cro:${x.key}`, missing = x.people.filter((q) => !q.done).map((q) => q.id);
      return `<li class="net-piece ${x.st}"><details class="net-cro" data-open-key="${esc(ok)}"${S.open?.[ok] ? ' open' : ''}><summary><span class="net-k" title="${NET_LABEL.cro}">${NET_ICON.cro}</span><span class="net-tx">${esc(x.text)}</span><span class="net-glyph" aria-hidden="true">${NET_GLYPH[x.st]}</span></summary>
        <ul class="net-people">${x.people.map((q) => `<li><label class="check"><input type="checkbox" data-act-change="chro-admin" data-runner="${esc(q.id)}" data-key="${esc(x.key)}" ${q.done ? 'checked' : ''}> ${esc(q.name)}</label></li>`).join('')}</ul>
        ${missing.length ? `<button class="btn small" data-act="chro-admin-all" data-ids="${esc(missing.join(','))}" data-key="${esc(x.key)}">✓ Todos la pasaron</button>` : ''}
        <p class="hint">Basta con que la pase uno: en cuanto alguien la marca, la crónica queda hecha para todos. Marca a quien ya la pasó aunque no lo haya marcado en su perfil.</p></details></li>`;
    }
    const isRes = x.k === 'res', canMark = x.key && (x.k === 'aviso' || isRes);
    if (isRes && x.people?.length) {   // resultados: desplegable para que la dirección ponga o corrija el puesto y el tiempo de cada uno
      const ok = `net-res:${x.rkind}:${x.rid}`;
      const act2 = canMark && (x.st !== 'curso') ? `<label class="check post-check"><input type="checkbox" data-act-change="post" data-key="${esc(x.key)}" ${posted.has(x.key) ? 'checked' : ''}> Publicado</label>` : '';
      const copy2 = it.kind === 'race' && x.st !== 'ok' && x.st !== 'curso' ? `<button class="btn small" data-act="pub-copy" data-id="${esc(it.id)}">📋 Copiar texto</button>` : '';
      return `<li class="net-piece ${x.st}"><details class="net-cro net-res" data-open-key="${esc(ok)}"${S.open?.[ok] ? ' open' : ''}><summary><span class="net-k" title="${NET_LABEL.res}">${NET_ICON.res}</span><span class="net-tx">${esc(x.text)}</span><span class="net-glyph" aria-hidden="true">${NET_GLYPH[x.st]}</span></summary>
        <ul class="rs-edit">${x.people.map((q) => `<li class="rs-row" data-runner="${esc(q.id)}" data-orig="${q.position || ''}|${q.time || ''}" data-podium="${esc(q.podium || '')}">
          <span class="rs-who"><b>${esc(q.name)}</b>${q.category ? `<small class="muted"> ${esc(q.category)}</small>` : ''}</span>
          <label class="rs-pos"><span>Puesto</span><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" data-rs="pos" value="${q.position || ''}" placeholder="—" aria-label="Puesto de ${esc(q.name)}"></label>
          ${timeFields(q.time, 'data-rs="time"')}</li>`).join('')}</ul>
        <div class="rs-actions"><button type="button" class="btn small primary" data-act="res-admin-save" data-kind="${esc(x.rkind)}" data-id="${esc(x.rid)}">Guardar puestos</button><small class="muted">Vale como si lo hubiera puesto el corredor. Vacío = sin puesto.</small></div></details>
        ${act2 || copy2 ? `<span class="net-act">${act2}${copy2}</span>` : ''}</li>`;
    }
    const act = x.k === 'story' ? (x.st === 'pend' ? `<button class="btn small" data-act="pub-story-manual" data-key="${esc(x.key)}">Marcar a mano</button>` : '')
      : canMark && (x.st !== 'curso' || x.k === 'aviso' && posted.has(x.key)) ? `<label class="check post-check"><input type="checkbox" data-act-change="post" data-key="${esc(x.key)}" ${posted.has(x.key) ? 'checked' : ''}> Publicado</label>` : '';
    const copy = isRes && it.kind === 'race' && x.st !== 'ok' && x.st !== 'curso' ? `<button class="btn small" data-act="pub-copy" data-id="${esc(it.id)}">📋 Copiar texto</button>` : '';
    return `<li class="net-piece ${x.st}"><span class="net-k" title="${NET_LABEL[x.k]}">${NET_ICON[x.k]}</span><span class="net-tx">${esc(x.text)}</span><span class="net-glyph" aria-hidden="true">${NET_GLYPH[x.st]}</span>${act || copy ? `<span class="net-act">${act}${copy}</span>` : ''}</li>`;
  };
  const card = (it) => `<article class="card net-card ${it.status}${it.suspended ? ' gone' : ''}">${raceHead(it.g || { name: it.name, date: it.date, modality: it.modality })}
      <ul class="net-pieces">${it.pieces.map((x) => piece(it, x)).join('')}</ul>
      <div class="row"><a class="btn small ghost" href="#/${it.kind === 'race' ? 'carreras' : 'inscripciones'}/${esc(it.id)}">Abrir</a></div></article>`;
  const kpi = (k, icon, label) => `<button class="net-kpi ${k}${f === k ? ' on' : ''}${b.counts[k] ? '' : ' zero'}" data-act="net-filter" data-f="${k}"><b>${b.counts[k]}</b><span>${icon} ${label}</span></button>`;
  // tarea automática de historias
  const log = S.stories, lastPub = log?.byKey ? [...log.byKey.values()].map((x) => x.publicada).filter(Boolean).sort().pop() : null;
  const auto = !log ? 'Comprobando la tarea automática de historias…'
    : log.none ? 'Tarea automática de historias: aún no hay ninguna registrada.'
    : `Tarea automática de historias: última registrada el <b>${esc(lastPub ? formatDate(lastPub, false) : '—')}</b> · ${log.byKey.size} carrera${log.byKey.size === 1 ? '' : 's'} desde el ${esc(log.desde ? formatDate(log.desde, false) : '—')}.`;
  const next = b.nextStory ? `Próxima historia automática: <b>${esc(b.nextStory.item.name)}</b> · ${esc(b.nextStory.text.replace('Historia: ', ''))}.` : 'No hay ninguna historia programada de momento.';
  const a = adminAlerts();
  const audit = pubAudit();
  return frame('Redes', `
    ${netTabs('panel')}
    ${warn}
    <div class="net-kpis" role="tablist" aria-label="Estado de las publicaciones">${kpi('pend', '❗', 'Pendiente')}${kpi('curso', '⏳', 'En curso')}${kpi('hecho', '✅', 'Hecho')}</div>
    <p class="hint net-auto">${auto}<br>${next}</p>
    <div class="years"><button class="chip${wide ? '' : ' on'}" data-act="net-range" data-w="0">Próximas y recientes</button><button class="chip${wide ? ' on' : ''}" data-act="net-range" data-w="1">Toda la temporada</button></div>
    ${shown.length ? shown.slice(0, cap).map(card).join('') : `<p class="empty">${f === 'pend' ? 'Nada pendiente. 🎉' : f === 'curso' ? 'Nada en curso.' : 'Todavía no hay nada hecho en este rango.'}</p>`}
    ${shown.length > cap ? `<button class="btn block ghost" data-act="net-more">Ver las ${shown.length}</button>` : ''}
    ${audit.orphans.length ? `<a class="card pen bad-box net-orph" href="#/publicaciones">🔗 ${audit.orphans.length} marca${audit.orphans.length === 1 ? '' : 's'} de «publicada» sin carrera: revisar en el control detallado</a>` : ''}
    ${socialAdminCard()}`, { actions: '<button class="icon-btn" data-act="pub-refresh" aria-label="Actualizar">↻</button>' });
}

/** Dirección: historial de cambios (quién cambió qué y cuándo). */
async function loadChanges() {
  S.changes = undefined;
  try { S.changes = await api.listChanges(); } catch { S.changes = null; }
  if (parseRoute().view === 'historial') render();
}
const timeAgo = (iso) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(m)) return '';
  if (m < 2) return 'ahora mismo'; if (m < 60) return `hace ${m} min`;
  if (m < 1440) return `hace ${Math.round(m / 60)} h`;
  if (m < 2880) return 'ayer'; return formatDate(String(iso).slice(0, 10), false);
};
// ---------- Movimientos de la app (dirección): quién hace qué ----------
const MOV = { inscripcion: ['calplus', 'Inscripciones'], baja: ['trash', 'Bajas'], pago: ['euro', 'Pagos'], cronica: ['pen', 'Crónicas'], carrera: ['flag', 'Carreras'], resultado: ['trophy', 'Resultados'], otro: ['info', 'Otros'] };
async function loadMovements() {
  try { S.movs = await api.adminMovements(300); } catch { S.movs = null; }
  if (S.session?.isAdmin && ['', 'hoy', 'movimientos'].includes(parseRoute().view) && !S.draft) render();
}
const movRow = (m) => `<li class="mv-row mvk-${esc(m.kind)}"><span class="mv-ic">${ico(MOV[m.kind]?.[0] || 'info')}</span><span class="mv-t"><b>${esc(m.who)}</b> ${esc(m.text)}</span><time class="mv-when" title="${esc(new Date(m.at).toLocaleString('es-ES'))}">${esc(timeAgo(m.at))}</time></li>`;
/** Tarjeta de Hoy con los últimos movimientos. */
function movementsCard() {
  const l = S.movs;
  if (l === undefined) return '';
  if (l === null) return `<section class="card warn"><h2>Movimientos de la app</h2><p class="hint">Falta ejecutar en Supabase <code>supabase/cambios/2026-11-22-movimientos.sql</code>.</p></section>`;
  // plegado por defecto: una línea con lo último; al tocar se abren los 6 más recientes y el enlace a todos
  const t = todayISO(), hoy = l.filter((m) => String(m.at).slice(0, 10) === t).length, first = l[0];
  return `<details class="card mv-fold" data-open-key="mov"${S.open?.mov ? ' open' : ''}><summary><span class="mv-fold-t">${ico('clock')}<b>Movimientos</b>${hoy ? `<span class="mv-n">${hoy} hoy</span>` : ''}</span>
      <span class="mv-fold-s">${first ? `<b>${esc(first.who)}</b> ${esc(first.text)} · ${esc(timeAgo(first.at))}` : 'Todavía no hay movimientos'}</span><span class="pulse-chev" aria-hidden="true">${ico('chevd')}</span></summary>
    ${l.length ? `<ul class="mv-list">${l.slice(0, 6).map(movRow).join('')}</ul><p class="center"><a class="btn small" href="#/movimientos">Ver todos los movimientos${ico('go')}</a></p>` : ''}</details>`;
}
function viewMovements() {
  const l = S.movs, f = S.movFilter || 'all', shown = (l || []).filter((m) => f === 'all' || m.kind === f);
  const day = (iso) => { const d = String(iso).slice(0, 10), t = todayISO(), y = new Date(Date.now() - 864e5).toISOString().slice(0, 10); return d === t ? 'Hoy' : d === y ? 'Ayer' : formatDate(d, true); };
  let last = '';
  const items = shown.map((m) => { const d = day(m.at); const h = d !== last ? `<li class="mv-day">${esc(d)}</li>` : ''; last = d; return h + movRow(m); }).join('');
  const counts = Object.fromEntries(Object.keys(MOV).map((k) => [k, (l || []).filter((m) => m.kind === k).length]));
  return frame('Movimientos', `
    <p class="hint">Todo lo que hacen los corredores en la app, en orden: inscripciones, pagos, crónicas, carreras creadas o cambiadas, resultados y bajas. Para ver el detalle de los datos que se han cambiado, mira el <a href="#/historial">historial de cambios</a>.</p>
    ${l === undefined ? '<p class="empty">Cargando…</p>' : l === null ? '<p class="card warn">Falta ejecutar en Supabase <code>supabase/cambios/2026-11-22-movimientos.sql</code>.</p>' : `
    <div class="years">${[['all', 'Todo', (l || []).length], ...Object.entries(MOV).filter(([k]) => counts[k]).map(([k, [, n]]) => [k, n, counts[k]])].map(([k, n, c]) => `<button class="chip${f === k ? ' on' : ''}" data-act="mov-filter" data-f="${k}">${n} <small>${c}</small></button>`).join('')}</div>
    ${shown.length ? `<ul class="mv-list">${items}</ul>` : '<p class="empty">No hay movimientos de este tipo.</p>'}`}`, { back: '#/' });
}
function viewHistory() {
  const list = S.changes;
  const f = S.histFilter || 'all';
  const who = (c) => (c.actor === 'Dirección' ? 'dir' : c.actor === 'Sistema' ? 'sis' : 'cor');
  const shown = (list || []).filter((c) => f === 'all' || who(c) === f);
  return frame('Historial de cambios', `
    <p class="hint">Quién ha cambiado qué y cuándo. Te sirve para delegar con tranquilidad: si un dato está mal, aquí ves quién lo puso.</p>
    ${list === undefined ? '<p class="empty">Cargando…</p>' : list === null ? '<p class="card warn">Falta ejecutar en Supabase el SQL del historial: <code>supabase/cambios/2026-11-12-historial-1.sql</code>, <code>…-2.sql</code> y <code>…-3.sql</code>.</p>' : `
    <div class="years">${[['all', 'Todo'], ['cor', 'Corredores'], ['dir', 'Dirección'], ['sis', 'Automático']].map(([k, l]) => `<button class="chip${f === k ? ' on' : ''}" data-act="hist-filter" data-f="${k}">${l}</button>`).join('')}</div>
    ${shown.length ? `<ul class="hist-list">${shown.map((c) => `<li class="hist-${who(c)}"><div><b>${esc(c.actor)}</b> <span class="muted">${timeAgo(c.at)}</span></div><p>${esc(c.summary)}</p></li>`).join('')}</ul>`
      : '<p class="empty">Todavía no hay cambios apuntados.</p>'}`}`, { back: '#/resumen' });
}

/** Dirección: quién ha respondido a una noticia que pide confirmación. */
function rsvpAdmin(n) {
  const reps = (S.data.announcementReplies || []).filter((x) => x.announcement_id === n.id);
  const yes = reps.filter((x) => x.answer === 'si'), no = reps.filter((x) => x.answer === 'no');
  const answered = new Set(reps.map((x) => x.runner_id));
  const pend = S.data.runners.filter((x) => !answered.has(x.id)).sort(byName);
  const total = yes.reduce((c, x) => c + 1 + (x.guests || 0), 0);
  const nm = (x) => esc(runnerById(x.runner_id)?.name || '?');
  return `<details class="rsvp-admin" open><summary><b>👥 ${total} apuntado${total === 1 ? '' : 's'}</b>${total !== yes.length ? ` (${yes.length} corredor${yes.length === 1 ? '' : 'es'} + ${total - yes.length} acompañante${total - yes.length === 1 ? '' : 's'})` : ''} · ❌ ${no.length} · ⏳ ${pend.length} sin responder</summary>
    <p><b>Sí:</b> ${yes.length ? yes.map((x) => nm(x) + (x.guests ? ` (+${x.guests})` : '')).join(', ') : '—'}</p>
    <p><b>No:</b> ${no.length ? no.map(nm).join(', ') : '—'}</p>
    <p><b>Sin responder:</b> ${pend.length ? pend.map((x) => esc(x.name)).join(', ') : '—'}</p></details>`;
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
      <label class="check"><input type="checkbox" name="rsvp" ${e?.rsvp ? 'checked' : ''}> Pedir confirmación («Me apunto / No voy» y acompañantes)</label>
      ${S.data.announcementReplies === null ? '<p class="hint">Para pedir confirmación hay que ejecutar en Supabase <code>supabase/cambios/2026-11-12-correcciones-quedadas-2.sql</code>.</p>' : ''}
      <label>Mostrar hasta (opcional)<input type="date" name="expires_at" value="${esc(e?.expires_at || '')}" min="${today}"></label>
      <p class="hint">Si pones fecha, la noticia desaparece sola al pasar ese día. Sin fecha se queda hasta que la borres.</p>
      <div class="row"><button class="btn primary">${e ? 'Guardar cambios' : 'Publicar'}</button>${e ? '<button type="button" class="btn ghost" data-act="ann-cancel">Cancelar</button>' : ''}</div>
    </form>
    <h2 class="section">Publicadas (${sorted.length})</h2>
    ${sorted.length ? sorted.map((n) => { const gone = n.expires_at && n.expires_at < today;
      return `<article class="card news${gone ? ' gone' : ''}"><div class="race-head"><h3>${esc(n.title)}</h3>${gone ? '<span class="tag">Caducada</span>' : ''}</div>
        <p class="muted">${formatDate(String(n.created_at).slice(0, 10))}${n.expires_at ? ` · hasta el ${formatDate(n.expires_at, false)}` : ''}</p>
        ${n.body ? `<p class="news-body">${newsText(n.body)}</p>` : ''}
        ${n.rsvp ? rsvpAdmin(n) : ''}
        <div class="row"><button class="btn small" data-act="ann-edit" data-id="${n.id}">Editar</button>
          <button class="btn small danger ghost" data-act="ann-del" data-id="${n.id}">Borrar</button></div></article>`; }).join('')
      : '<p class="empty">Todavía no has publicado ninguna.</p>'}`, { back: '#/avisos' });
}

/** Corredor: «plus de bonificación» por podio en la general final de una liga o circuito (cláusula NOVENA): los comunica y la dirección los confirma. */
function circuitsCard(d) {
  if (!d.circuits) return ''; // base de datos aún sin actualizar
  const year = d.bonus?.year || new Date().getFullYear();
  const per = d.bonus?.config?.circuitExtra ?? 4;
  const mine = d.circuits.filter((c) => c.year >= year - 1);
  const ok = mine.filter((c) => c.status === 'confirmado').length, wait = mine.length - ok;
  // cerrado por defecto: título, una frase y el estado; todo lo demás (explicación, lista y formulario) se despliega
  return `<details class="card circ-card">
    <summary class="circ-sum"><span class="circ-t">🏆 Plus de bonificación</span>
      <span class="circ-chips">${ok ? `<span class="extra-chip">✅ ${ok} confirmado${ok === 1 ? '' : 's'}</span>` : ''}${wait ? `<span class="pending-chip">⏳ ${wait} pendiente${wait === 1 ? '' : 's'}</span>` : ''}</span>
      <small class="muted circ-one">Un extra por podio en la general de una liga: +${per} carreras para la bonificación, no para el mínimo.</small></summary>
    <p class="hint"><b>Un extra por ganar puestos en la general de una liga.</b> Ligas como la Xallenger, la Open Maxxis Marathon, las Copas o los Críteriums tienen una <b>clasificación general final</b>, al terminar todas sus pruebas. Si acabas entre los <b>3 primeros</b> (absoluta o de tu categoría), el club te da un plus de <b>+${per} carreras para tu bonificación</b> (cláusula 9).</p>
    <ul class="bullets">
      <li>✅ <b>Sí cuenta para la bonificación</b>: puede subirte de tramo y, con ello, el dinero.</li>
      <li>⛔ <b>No cuenta para el mínimo de ${d.bonus?.config?.minimum ?? 12}</b>: para evitar la penalización tienes que correr ${d.bonus?.config?.minimum ?? 12} carreras igualmente.</li>
      <li>Solo vale el podio de la <b>general final de la liga completa</b>, no el de una prueba suelta.</li>
      <li>Al terminar la liga, <b>comunícalo aquí</b>; la dirección lo confirma y entonces se suma.</li>
    </ul>
    <p class="hint">Ejemplo: corres ${(d.bonus?.config?.minimum ?? 12) - 2} carreras y quedas 2º en la general de una liga: para la bonificación cuentas ${(d.bonus?.config?.minimum ?? 12) - 2 + per}, pero para el mínimo siguen siendo ${(d.bonus?.config?.minimum ?? 12) - 2} (aún te faltarían 2).</p>
    ${mine.length ? `<ul class="mini-list">${mine.map((c) => `<li><div><b>${medal(c.position)} ${esc(c.circuit)}</b>
      <small class="muted">${c.year} · ${c.position}º · ${scopeLabel(c.scope)}</small></div>
      ${c.status === 'confirmado' ? `<span class="extra-chip">✅ Plus +${per}</span>`
        : `<span class="row-btns"><span class="pending-chip">⏳ Pendiente</span>${S.preview ? '' : `<button class="btn small ghost" data-act="circ-cancel" data-id="${c.id}">Retirar</button>`}</span>`}</li>`).join('')}</ul>` : ''}
    ${S.preview ? '' : `<details${mine.length ? '' : ' open'}><summary><b>+ Comunicar mi podio en la general de una liga</b></summary>
      <form class="stack" data-form="circ-propose">
        <label>Liga o circuito<input name="circuit" list="dl-circuit" placeholder="Open Maxxis Marathon" minlength="3" maxlength="120" required autocomplete="off"></label>${circuitList()}
        <div class="grid2">
          <label>Tu puesto final<select name="position"><option value="1">1º</option><option value="2">2º</option><option value="3">3º</option></select></label>
          <label>Clasificación<select name="scope">${CIRCUIT_SCOPES.map((x) => opt(x.id, x.label.replace('su ', 'mi '), 'categoria')).join('')}</select></label>
        </div>
        <label>Temporada<select name="year">${opt(String(year), String(year), String(year))}${opt(String(year - 1), String(year - 1), '')}</select></label>
        <button class="btn primary">Pedir el plus a la dirección</button>
      </form></details>`}
  </details>`;
}

// ======================================================================
//  Avisos de la dirección (campanita)
// ======================================================================

/** Cosas pendientes de la dirección. */
/** Días desde una fecha guardada (null si nunca). */
const daysSince = (key) => { const v = store.get(key); const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 864e5)) : null; };
const agoText = (d) => (d === null ? 'nunca desde este móvil' : d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`);
/** Copias de seguridad que tocan: datos cada 30 días, contratos cada 60 (si los hay). Se puede posponer 7 días. */
function backupDue() {
  const snooze = store.get(BACKUP_SNOOZE_KEY);
  if (snooze && Date.now() < Date.parse(snooze)) return [];
  const out = [], d = daysSince(BACKUP_KEY), c = daysSince(BACKUP_DOCS_KEY);
  if (d === null || d > 30) out.push({ kind: 'data', days: d });
  if ((S.docs || []).length && (c === null || c > 60)) out.push({ kind: 'docs', days: c });
  return out;
}
/** Clave estable de una carrera para la marca de «publicada» (no cambia al pasar de inscripción a resultados). */
const postKey = (g) => `${g.date}|${normalize(g.name)}`;
/** Clave de la publicación de resultados (el aviso previo y los resultados son dos publicaciones distintas). */
const resKey = resKeyOf;
/** Marcas de «publicada en redes»: compartidas en la base de datos (o, si falta el SQL, solo en este móvil). */
const postedSet = () => {
  if (Array.isArray(S.data?.socialPosts)) return new Set(S.data.socialPosts.map((x) => x.key));
  try { return new Set(JSON.parse(store.get(POSTED_KEY) || '[]')); } catch { return new Set(); }
};
const savePosted = (set) => store.set(POSTED_KEY, JSON.stringify([...set].slice(-300)));
async function setPostedKeys(keys, value) {
  if (Array.isArray(S.data?.socialPosts)) {
    const set = new Set(keys);
    S.data.socialPosts = S.data.socialPosts.filter((x) => !set.has(x.key));
    if (value) for (const k of keys) S.data.socialPosts.push({ key: k, posted_by: 'Dirección' });
    render();
    try { await api.setPosted(keys, value); } catch (e) { toast(friendlyError(e), true); await refreshPosts(true); }
  } else {
    const set = postedSet(); for (const k of keys) { if (value) set.add(k); else set.delete(k); } savePosted(set); render();
  }
}
/** Trae las marcas de la base de datos (las que pone el encargado de redes). */
async function refreshPosts(force = false) {
  if (!Array.isArray(S.data?.socialPosts)) return;
  try {
    const rows = await api.listPosts();
    if (!Array.isArray(rows)) return;
    const sig = (a) => a.map((x) => x.key).sort().join('\n');
    const changed = sig(rows) !== sig(S.data.socialPosts);
    S.data.socialPosts = rows;
    if ((changed || force) && ['semana', 'avisos', 'redes', 'inscripciones', '', 'hoy'].includes(parseRoute().view) && !S.draft) render();
  } catch { /* sin conexión */ }
}
function adminAlerts() {
  const posted = postedSet();
  const week = weekRaces(7);   // carreras de los próximos 7 días con inscritos (para publicar en redes)
  return {
    circuits: (S.data.circuitPodiums || []).filter((c) => c.status === 'pendiente'),
    week, weekTodo: week.filter((g) => !posted.has(postKey(g))),
    noContract: S.data.runners.filter((r) => !r.contract).sort(byName),
    backup: backupDue(),
    corrections: (S.data.corrections || []).filter((c) => c.status === 'pendiente'),
  };
}
const pubAudit = (year = new Date().getFullYear()) => socialAudit(year, S.data.races, S.data.registrations, Array.isArray(S.data.socialPosts) ? S.data.socialPosts : [...postedSet()].map((key) => ({ key })), todayISO(), S.stories?.byKey ? S.stories : null);
/** Publicaciones que la dirección tiene por hacer: resultados con 3 o más días sin publicar y anomalías. */
const pubDue = () => { const a = pubAudit(); return a.resPending.filter((x) => x.days >= 3).length + a.anomalies; };
const alertCount = () => { const a = adminAlerts(); return a.circuits.length + a.backup.length + a.corrections.length; };   // lo de redes está en la pestaña Redes
/** Estado de las publicaciones de cada carrera (panel de Redes) y cuántas tienen algo pendiente. */
const chronOpts = () => {
  if (!Array.isArray(S.data.chronicles)) return null;   // falta el SQL de crónicas
  const done = new Map();
  for (const x of S.data.chronicles) (done.get(x.race_key) || done.set(x.race_key, new Set()).get(x.race_key)).add(x.runner_id);
  return { done, nameOf: (id) => runnerById(id)?.name };
};
const netBoard = (opts) => socialBoard(S.data.races, S.data.registrations, postedSet(), todayISO(), S.stories?.byKey ? S.stories : null, { chron: chronOpts(), ...(opts || {}) });
const socialPending = () => { try { return netBoard().counts.pend; } catch { return 0; } };

function viewAlerts() {
  const a = adminAlerts();
  const per = bonusCfg(new Date().getFullYear()).circuitExtra ?? 4;
  const none = !a.circuits.length && !a.noContract.length && !a.backup.length && !a.corrections.length;
  return frame('Avisos', `
    <a class="btn primary block" href="#/noticias">📣 Noticias para los corredores${S.data.announcements ? ` (${S.data.announcements.length})` : ''}</a>
    <a class="btn block" href="#/redes">📱 Redes: historias, avisos y resultados${socialPending() ? ` · ${socialPending()} pendiente${socialPending() === 1 ? '' : 's'}` : ''}</a>
    ${none ? '<p class="card pen ok">✅ No tienes nada pendiente.</p>' : ''}
    ${a.corrections.length ? `<h2 class="section">✏️ Correcciones de puesto pedidas (${a.corrections.length})</h2>
      <p class="hint">Un corredor dice que se equivocó al poner su puesto. Si aceptas, se aplica el cambio al momento.</p>
      ${a.corrections.map((c) => `<article class="card"><h3>${esc(runnerById(c.runner_id)?.name || '?')}</h3>
        <p><b>${esc(c.race_name)}</b>${c.race_date ? ` · ${formatDate(c.race_date, false)}` : ''}</p>
        <p>${c.old_position}º → <b>${c.new_position}º</b>${c.new_category ? ` · ${esc(c.new_category)}` : ''}${c.new_position <= 3 ? ` · ${esc(podiumLabel(c.new_podium_type || 'suelta'))}` : ''}</p>
        ${c.note ? `<p class="muted">«${esc(c.note)}»</p>` : ''}
        <div class="row"><button class="btn primary" data-act="corr-accept" data-id="${c.id}">Aceptar</button>
          <button class="btn danger ghost" data-act="corr-reject" data-id="${c.id}">Rechazar</button></div></article>`).join('')}` : ''}
    ${a.circuits.length ? `<h2 class="section">🏆 Plus de bonificación por confirmar (${a.circuits.length})</h2>
      <p class="hint">Un corredor dice que ha hecho podio en la general final de una liga o circuito. Si lo confirmas, se le suma el plus: +${per} carreras para la bonificación (no para el mínimo).</p>
      ${a.circuits.map((c) => `<article class="card"><h3>${esc(runnerById(c.runner_id)?.name || '?')}</h3>
        <p>${medal(c.position)} <b>${c.position}º</b> en <b>${esc(c.circuit)}</b> · ${c.year} · clasificación ${scopeLabel(c.scope)}</p>
        <div class="row"><button class="btn primary" data-act="circ-confirm" data-id="${c.id}">Confirmar (+${per})</button>
          <button class="btn danger ghost" data-act="circ-del" data-id="${c.id}">Rechazar</button></div></article>`).join('')}` : ''}
    ${a.backup.length ? `<h2 class="section">💾 Copia de seguridad</h2>
      <p class="hint">Tus datos solo están en Supabase: una copia tuya es la mejor seguridad. Guárdala en tu Drive o correo.</p>
      ${a.backup.map((b) => `<article class="card"><p>${b.kind === 'data' ? '<b>Datos</b> (corredores, inscripciones, carreras y resultados)' : '<b>Contratos y documentos</b> subidos'}: última copia <b>${agoText(b.days)}</b>.</p>
        <button class="btn primary" data-act="${b.kind === 'data' ? 'backup' : 'backup-docs'}">Descargar ahora</button></article>`).join('')}
      <button class="btn ghost block" data-act="backup-snooze">Recordármelo en 7 días</button>` : ''}
    ${a.noContract.length ? `<h2 class="section">📄 Corredores sin tipo de contrato (${a.noContract.length})</h2>
      <p class="hint">Sin contrato indicado se les aplican los bonos y la penalización de renovación: ${esc(a.noContract.map((r) => r.name).join(', '))}.</p>
      <a class="btn block" href="#/bonos">Indicarlo en Bonos</a>` : ''}`, { back: '#/hoy' });
}


// ======================================================================
//  Hoy: el panel de la dirección (qué hacer ahora, quién falta, qué viene)
// ======================================================================

const board = () => directorBoard({ races: S.data.races, registrations: S.data.registrations, runners: S.data.runners }, todayISO());
/** Lo urgente que marca la pestaña Hoy. */
const todayCount = () => { try { return alertCount() + board().pendingResults.length; } catch { return 0; } };
/** Iniciales con un color propio por nombre (siempre el mismo). */
function avatar(name, cls = '') {
  const n = cleanName(name) || '?';
  const ini = n.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `<span class="av ${cls}" style="--h:${h}" aria-hidden="true">${esc(ini)}</span>`;
}
const avatars = (ids, max = 5) => { const names = ids.map((id) => runnerById(id)?.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
  return `<span class="avs">${names.slice(0, max).map((n) => avatar(n)).join('')}${names.length > max ? `<span class="av more">+${names.length - max}</span>` : ''}</span>`; };
const namesOf = (ids) => ids.map((id) => runnerById(id)?.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
const MON3 = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
/** Fecha en bloque (día grande, mes corto) con el color de la disciplina. */
const seenDot = (r) => (r && Object.prototype.hasOwnProperty.call(r, 'last_seen') ? (() => { const d = seenDays(r.last_seen); return `<i class="seen s-${seenLevel(d)}" title="${esc(seenText(d))}"></i>`; })() : '');
const agoDays = (n) => (n === 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`);

/** Una tarea del panel Hoy: icono de color, qué pasa y qué hacer. */
function task({ tone, icon: ic, title, sub = '', href = '', acts = '' }) {
  const main = `<span class="tc-ico">${ico(ic)}</span><span class="tc-body"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${href ? `<span class="tc-go">${ico('go')}</span>` : ''}`;
  return `<article class="tcard t-${tone}">${href ? `<a class="tc-main" href="${esc(href)}">${main}</a>` : `<div class="tc-main">${main}</div>`}${acts ? `<div class="tc-acts">${acts}</div>` : ''}</article>`;
}
const msgBtn = (kind, ref = '', label = 'Recordar por WhatsApp') => `<a class="btn small wa" href="#/mensajes/${kind}${ref ? '/' + ref : ''}">${ico('msg')}${label}</a>`;

function viewToday() {
  const b = board(), a = adminAlerts(), year = new Date().getFullYear();
  const per = bonusCfg(year).circuitExtra ?? 4;
  const rows = rosterRows(), low = rows.filter((x) => x.low);
  const social = socialPending();
  const tasks = [];
  if (a.corrections.length) tasks.push(task({ tone: 'red', icon: 'pen', title: `${a.corrections.length} corrección${a.corrections.length === 1 ? '' : 'es'} de puesto por revisar`, sub: esc(a.corrections.map((c) => runnerById(c.runner_id)?.name).filter(Boolean).join(', ')), href: '#/avisos' }));
  if (a.circuits.length) tasks.push(task({ tone: 'red', icon: 'trophy', title: `${a.circuits.length} plus de circuito por confirmar`, sub: `+${per} carreras para el bono si lo confirmas`, href: '#/avisos' }));
  for (const x of b.pendingResults.slice(0, 4)) {
    const miss = namesOf(x.missing);
    tasks.push(task({ tone: x.days > 7 ? 'red' : 'amber', icon: 'flag', title: `Faltan ${miss.length} resultado${miss.length === 1 ? '' : 's'} · ${esc(x.reg.name)}`,
      sub: `Terminó ${agoDays(x.days)} · ${esc(miss.join(', '))}`, href: `#/inscripciones/${x.reg.id}`, acts: msgBtn('results', x.reg.id) }));
  }
  if (b.pendingResults.length > 4) tasks.push(task({ tone: 'amber', icon: 'flag', title: `Y ${b.pendingResults.length - 4} carreras más sin todos los resultados`, href: '#/mensajes/results' }));
  if (social) tasks.push(task({ tone: 'pink', icon: 'share', title: `${social} ${social === 1 ? 'publicación' : 'publicaciones'} de redes pendiente${social === 1 ? '' : 's'}`, sub: 'Historias, avisos, resultados y crónicas', href: '#/redes' }));
  for (const x of a.backup) tasks.push(task({ tone: 'amber', icon: 'db', title: `Copia de seguridad de ${x.kind === 'data' ? 'datos' : 'documentos'}`, sub: `Última: ${agoText(x.days)}`,
    acts: `<button class="btn small primary" data-act="${x.kind === 'data' ? 'backup' : 'backup-docs'}">Descargar</button><button class="btn small ghost" data-act="backup-snooze">En 7 días</button>` }));
  if (b.activity && b.counts.never + b.counts.cold) tasks.push(task({ tone: 'violet', icon: 'act', title: `${b.counts.never + b.counts.cold} corredor${b.counts.never + b.counts.cold === 1 ? ' no usa' : 'es no usan'} la app`,
    sub: `${b.counts.never ? `${b.counts.never} no la ha${b.counts.never === 1 ? '' : 'n'} abierto nunca` : ''}${b.counts.never && b.counts.cold ? ' · ' : ''}${b.counts.cold ? `${b.counts.cold} hace más de un mes` : ''}`, href: '#/actividad', acts: msgBtn('inactive') }));
  if (low.length) tasks.push(task({ tone: 'amber', icon: 'alert', title: `${low.length} por debajo del mínimo de carreras`, sub: esc(low.map((x) => x.r.name).sort((p, q) => p.localeCompare(q, 'es')).slice(0, 6).join(', ') + (low.length > 6 ? '…' : '')), href: '#/corredores/bajo', acts: msgBtn('low') }));
  if (a.noContract.length) tasks.push(task({ tone: 'blue', icon: 'file', title: `${a.noContract.length} sin tipo de contrato`, sub: 'Sin él no se calcula bien el bono', href: '#/bonos' }));
  if (b.quality.length) tasks.push(task({ tone: 'blue', icon: 'list', title: `${b.quality.length} carrera${b.quality.length === 1 ? '' : 's'} con datos incompletos`, sub: 'Provincia, disciplina, km o puestos: para la memoria', href: '#/calidad' }));
  const urgent = todayCount();
  const active = b.activity ? b.activity.filter((x) => x.level === 'hot').length : null;
  const weekN = b.upcoming.filter((x) => x.days <= 7).length;
  const dt = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const races = S.data.races.filter((r) => yearOf(r.date) === year).length;
  const up = b.upcoming.map((x) => `<a class="up-row" href="#/inscripciones/${x.reg.id}">${raceTile(x.reg)}
      <span class="up-main"><b>${esc(x.reg.name)}</b><span class="rh-sub">${esc(raceSub(x.reg))}</span><span class="rc-meta">${raceMeta(x.reg)}</span>${avatars(x.ids)}</span>
      <span class="rc-side">${raceCd(x.reg)}<span class="rc-n" title="Inscritos del club">${ico('users')}${x.ids.length}</span></span></a>`).join('');
  return frame('Hoy', `
    <section class="hero-today">
      <p class="ht-date">${esc(dt)}</p>
      <h2>${tasks.length ? `Tienes <b>${tasks.length}</b> cosa${tasks.length === 1 ? '' : 's'} por mirar` : 'Todo al día ✅'}</h2>
      <p class="ht-sub">${urgent ? `${urgent} urgente${urgent === 1 ? '' : 's'} · ` : ''}${weekN ? `${weekN} carrera${weekN === 1 ? '' : 's'} esta semana` : 'Ninguna carrera esta semana'}</p>
      <div class="ht-kpis">
        <a href="#/corredores"><b>${S.data.runners.length}</b><span>corredores</span></a>
        <a href="#/actividad"><b>${active == null ? '—' : `${active}`}</b><span>activos 7 días</span></a>
        <a href="#/carreras"><b>${races}</b><span>carreras ${year}</span></a>
        <a href="#/inscripciones"><b>${b.upcoming.reduce((n, x) => n + x.ids.length, 0)}</b><span>inscritos 10 días</span></a>
      </div>
    </section>
    <h2 class="sec-h">${ico('check')} Por hacer</h2>
    ${tasks.length ? `<div class="tasks">${tasks.join('')}</div>` : '<p class="card ok-card">✅ No tienes nada pendiente. Buen trabajo.</p>'}
    <h2 class="sec-h">${ico('cal')} Próximos 10 días</h2>
    ${up ? `<div class="up-list">${up}</div>` : '<p class="empty small">No hay carreras con gente del club en los próximos 10 días.</p>'}
    ${b.upcoming.length ? `<p class="center">${msgBtn('next', b.upcoming[0].reg.id, `Animar a apuntarse a ${esc(b.upcoming[0].reg.name)}`)}</p>` : ''}
    ${movementsCard()}
    <h2 class="sec-h">${ico('layers')} Atajos</h2>
    <div class="qgrid">
      <a class="qtile q-cyan" href="#/noticias">${ico('msg')}<b>Noticia</b><small>a todo el equipo</small></a>
      <a class="qtile q-green" href="#/mensajes/all">${ico('send')}<b>WhatsApp</b><small>mensaje por grupos</small></a>
      <a class="qtile q-orange" href="#/inscripciones/nueva">${ico('calplus')}<b>Inscripción</b><small>nueva carrera</small></a>
      <a class="qtile q-violet" href="#/actividad">${ico('act')}<b>Actividad</b><small>quién usa la app</small></a>
      <a class="qtile q-blue" href="#/calidad">${ico('list')}<b>Datos</b><small>carreras incompletas</small></a>
      <a class="qtile q-pink" href="#/memoria">${ico('book')}<b>Memoria</b><small>para sponsors</small></a>
    </div>`, { actions: '' });
}

// ---------- Actividad: quién usa la app ----------
function viewActivity() {
  const b = board();
  if (!b.activity) return frame('Actividad', `<section class="card warn"><h2>Falta un cambio en Supabase</h2>
    <p>Para saber quién abre la app hay que ejecutar <b>supabase/cambios/2026-11-19-actividad.sql</b> en el editor SQL de Supabase. Desde ese momento se apunta la última vez que cada corredor entra con su enlace.</p></section>`, { back: '#/hoy' });
  const groups = [['hot', 'Activos esta semana', 'green'], ['warm', 'Este mes', 'blue'], ['cold', 'Hace más de un mes', 'amber'], ['never', 'No la han abierto nunca', 'red']];
  const by = (lv) => b.activity.filter((x) => x.level === lv).map((x) => ({ ...x, r: runnerById(x.id) })).filter((x) => x.r)
    .sort((p, q) => (p.days ?? 1e9) - (q.days ?? 1e9) || byName(p.r, q.r));
  const n = (lv) => b.activity.filter((x) => x.level === lv).length;
  const tot = b.activity.length || 1;
  return frame('Actividad', `
    <section class="card act-sum"><div class="act-bar">${groups.map(([lv, , tone]) => n(lv) ? `<span class="t-${tone}" style="flex:${n(lv)}">${n(lv)}</span>` : '').join('')}</div>
      <div class="act-leg">${groups.map(([lv, label, tone]) => `<span class="t-${tone}"><i></i>${label} <b>${n(lv)}</b></span>`).join('')}</div>
      <p class="hint">Cuenta cada vez que el corredor abre la app con su enlace personal. ${Math.round((n('hot') / tot) * 100)} % activos esta semana.</p></section>
    ${groups.map(([lv, label, tone]) => { const list = by(lv); if (!list.length) return '';
      return `<h2 class="sec-h t-${tone}"><i class="seen s-${lv}"></i> ${label} <span class="muted">(${list.length})</span></h2>
      <ul class="plist">${list.map((x) => `<li><a href="#/corredor/${x.r.id}">${avatar(x.r.name)}<span><b>${esc(x.r.name)}</b><small>${esc(seenText(x.days))}${x.r.category ? ' · ' + esc(x.r.category) : ''}</small></span>${ico('go')}</a></li>`).join('')}</ul>
      ${lv === 'cold' || lv === 'never' ? `<p class="center">${msgBtn('inactive')}</p>` : ''}`; }).join('')}`, { back: '#/hoy' });
}

// ---------- Calidad de datos: lo que le falta a cada carrera ----------
function viewQuality() {
  const b = board(), year = new Date().getFullYear();
  const all = S.data.races.filter((r) => yearOf(r.date) === year).length;
  const ok = all - b.quality.length, pct = all ? Math.round((ok / all) * 100) : 100;   // km, desnivel y precio no se exigen
  const everything = [...b.quality, ...b.soft];
  const count = (k) => everything.filter((x) => x.gaps.some((g) => g.includes(k))).length;
  const row = (x) => `<a class="mrow-card ${discClass(x.race.modality, x.race.subtype)}" href="#/carreras/${x.race.id}">${raceTile(x.race)}
      <span class="up-main"><b>${esc(x.race.name)}</b><span class="gaps">${x.gaps.map((g) => `<i${SOFT_GAPS.has(g) ? ' class="soft"' : ''}>${SOFT_GAPS.has(g) ? 'sin ' + esc(g) : esc(g)}</i>`).join('')}</span></span><span class="tc-go">${ico('go')}</span></a>`;
  return frame('Datos incompletos', `
    <section class="card q-head"><div class="ring" style="--p:${pct}"><b>${pct}%</b></div>
      <div><h2>${ok} de ${all} carreras completas</h2><p class="muted small">Temporada ${year}. Provincia, disciplina y puestos completos: así sale bien la memoria para los sponsors. Los km, el desnivel y el precio son opcionales, pero alimentan las estadísticas de subida, la carrera más larga o más dura y el coste de competir.</p></div></section>
    ${everything.length ? `<div class="q-chips">${[['provincia', 'Sin provincia'], ['disciplina', 'Sin disciplina'], ['sin puesto', 'Sin puesto'], ['km', 'Sin km'], ['desnivel', 'Sin desnivel'], ['precio', 'Sin precio'], ['ubicación', 'Sin ubicación']].map(([k, l]) => count(k) ? `<span class="qchip${SOFT_GAPS.has(k) ? ' soft' : ''}">${l} <b>${count(k)}</b></span>` : '').join('')}</div>` : ''}
    ${b.quality.length ? `<h2 class="sec-h">${ico('alert')} Les falta algo importante</h2><div class="mlist">${b.quality.map(row).join('')}</div>` : (everything.length ? '<p class="card ok-card">✅ Todas tienen provincia, disciplina y puestos.</p>' : '')}
    ${b.soft.length ? `<h2 class="sec-h">${ico('mountain')} Para completar (opcional)</h2><p class="hint">Cualquier corredor que participó puede completarlos desde la carrera («Faltan datos»); tú, desde su ficha.</p><div class="mlist">${b.soft.map(row).join('')}</div>` : ''}
    ${!everything.length ? '<p class="card ok-card">✅ Todas las carreras de la temporada tienen los datos completos.</p>' : ''}`, { back: '#/hoy' });
}

// ---------- Mensajes por grupos (WhatsApp) ----------
const MSG_KINDS = [['results', '🏁 Faltan resultados'], ['next', '📅 Próxima carrera'], ['idle', '💤 Sin carreras apuntadas'], ['inactive', '📲 No usan la app'], ['low', '⚠️ Bajo el mínimo'], ['all', '📣 Todo el equipo']];
function msgGroup(kind, ref) {
  const b = board();
  if (kind === 'results') {
    const list = b.pendingResults; const x = list.find((y) => y.reg.id === ref) || list[0];
    return { ids: x ? x.missing : [], extra: { race: x?.reg.name }, pick: list.map((y) => [y.reg.id, `${y.reg.name} (${y.missing.length})`]), ref: x?.reg.id, empty: 'No falta ningún resultado. 🎉' };
  }
  if (kind === 'next') {
    const today = todayISO();
    const list = S.data.registrations.filter((g) => !g.suspended && g.date >= today).sort((p, q) => p.date.localeCompare(q.date)).slice(0, 12);
    const g = list.find((y) => y.id === ref) || list[0];
    const inn = new Set((g?.entries || []).map((e) => e.runner_id));
    return { ids: g ? S.data.runners.filter((r) => !inn.has(r.id)).map((r) => r.id) : [], extra: { race: g?.name, when: g ? when(g) : '' }, pick: list.map((y) => [y.id, `${formatDate(y.date, false)} · ${y.name}`]), ref: g?.id,
      note: g ? `${inn.size} ya apuntado${inn.size === 1 ? '' : 's'}: el mensaje va a los que aún no.` : '', empty: 'No hay inscripciones próximas.' };
  }
  if (kind === 'idle') return { ids: b.idle, empty: 'Todos tienen alguna carrera apuntada. 🎉' };
  if (kind === 'inactive') return b.activity ? { ids: b.activity.filter((x) => x.level === 'never' || x.level === 'cold').map((x) => x.id), empty: 'Todos han entrado en el último mes. 🎉' }
    : { ids: [], empty: 'Falta el cambio de Supabase de actividad (2026-11-19-actividad.sql).' };
  if (kind === 'low') return { ids: rosterRows().filter((x) => x.low).map((x) => x.r.id), empty: 'Nadie está por debajo del mínimo. 🎉' };
  return { ids: [], all: true };
}
function viewMessages() {
  const { id, rest } = parseRoute();
  const kind = MSG_KINDS.some(([k]) => k === id) ? id : 'results';
  const g = msgGroup(kind, rest);
  const key = `${kind}|${g.ref || ''}`;
  if (S.msgKey !== key) { S.msgKey = key; S.msgOff = new Set(); }
  const on = g.ids.filter((x) => !S.msgOff.has(x));
  const text = groupMessage(kind, g.all ? [] : namesOf(on), g.extra || {});
  return frame('Mensaje al equipo', `
    <div class="msg-kinds">${MSG_KINDS.map(([k, l]) => `<a class="chip${k === kind ? ' on' : ''}" href="#/mensajes/${k}">${l}</a>`).join('')}</div>
    ${g.pick?.length > 1 ? `<label class="msg-pick">${kind === 'results' ? 'Carrera' : 'Inscripción'}<select data-msg-pick="${kind}">${g.pick.map(([v, l]) => opt(v, l, g.ref)).join('')}</select></label>` : ''}
    ${g.note ? `<p class="hint">${esc(g.note)}</p>` : ''}
    ${g.all ? '' : g.ids.length ? `<section class="card"><h3>Para ${on.length} de ${g.ids.length}</h3><p class="hint">Quita a quien no quieras nombrar.</p>
      <div class="who-chips">${namesOf(g.ids).map((n) => { const r = S.data.runners.find((x) => x.name === n); const off = S.msgOff.has(r.id);
        return `<button type="button" class="who${off ? ' off' : ''}" data-act="msg-who" data-id="${r.id}" aria-pressed="${!off}">${avatar(n)}${esc(n)}</button>`; }).join('')}</div></section>`
      : `<p class="card ok-card">${esc(g.empty || 'Nadie en este grupo.')}</p>`}
    ${g.all || on.length ? `<section class="card msg-box"><label>Mensaje <small class="muted">(puedes cambiarlo antes de enviar)</small><textarea id="msg-text" rows="8">${esc(text)}</textarea></label>
      <div class="row"><button class="btn primary wa-big" data-act="msg-wa">${ico('msg')}Enviar por WhatsApp</button><button class="btn" data-act="msg-copy">Copiar</button></div>
      <p class="hint">WhatsApp se abre para que elijas el chat (el grupo del equipo o una persona). Los nombres van con viñeta para que se vea a quién va.</p></section>` : ''}`, { back: '#/hoy' });
}

/** Pestañas de Carreras: próximas (inscripciones) y resultados. */
const carTabs = (cur) => { const today = todayISO(); const up = S.data.registrations.filter((g) => g.date >= today).length;
  return `<div class="seg2" role="tablist"><a href="#/inscripciones" class="${cur === 'inscripciones' ? 'on' : ''}">${ico('cal')}Próximas<b>${up}</b></a><a href="#/carreras" class="${cur === 'carreras' ? 'on' : ''}">${ico('trophy')}Resultados<b>${S.data.races.filter((r) => yearOf(r.date) === new Date().getFullYear()).length}</b></a></div>`; };

// ======================================================================
//  Carreras con resultados (dirección)
// ======================================================================

const medal = (p) => ['', '🥇', '🥈', '🥉'][p] || '';

/** Qué le falta a una carrera para que las estadísticas salgan bien. */
function raceIssues(r) {
  const out = [];
  if (!cleanName(r.province)) out.push('sin provincia');
  if (!cleanName(r.country)) out.push('sin país');
  const sinPuesto = r.results.filter((x) => x.position == null || x.position === '').length;
  if (sinPuesto) out.push(`${sinPuesto} sin puesto`);
  if (!r.results.length) out.push('sin participantes');
  return out;
}

/** Lista de carreras (con filtros). Se redibuja sola al escribir en el buscador. */
function raceListHtml() {
  const q = S.q.races || '';
  const searching = normalize(q).length >= 2;
  const pool = searching ? searchRaces(q, S.data.races) : S.data.races.filter((r) => yearOf(r.date) === S.year);
  const mods = MODALITIES.filter((m) => pool.some((r) => r.modality === m));
  if (S.raceMod && S.raceMod !== 'all' && !mods.includes(S.raceMod)) S.raceMod = 'all';
  const byMod = S.raceMod && S.raceMod !== 'all' ? pool.filter((r) => r.modality === S.raceMod) : pool;
  const todo = byMod.filter((r) => raceIssues(r).length);
  const shown = (S.raceTodo ? todo : byMod).sort((a, b) => b.date.localeCompare(a.date) || byName(a, b));
  const pods = shown.reduce((n, r) => n + r.results.filter((x) => isPodium(x.position)).length, 0);
  const card = (r) => {
    const res = r.results.filter((x) => isPodium(x.position)).sort((a, b) => a.position - b.position);
    const n = (k) => res.filter((x) => x.position === k).length;
    const medals = [n(1) ? `🥇${n(1)}` : '', n(2) ? `🥈${n(2)}` : '', n(3) ? `🥉${n(3)}` : ''].filter(Boolean).join(' ');
    const issues = raceIssues(r);
    const st = podiumsOf(r.results.map((x) => ({ race: r, res: x }))).filter((p) => p.stage);
    return raceFold(r, { key: `ac-${r.id}`, noPast: true, side: `<span class="rc-n" title="Participantes del club" aria-label="${r.results.length} participantes">${ico('users')}${r.results.length}</span>${issues.length ? `<span class="rc-chip warn" title="${esc(issues.join(', '))}">${ico('alert')}${issues.length}</span>` : ''}`, body: `
      ${typeTag(r)}${pubTags(r, true)}
      <p class="count">${r.results.length} participante${r.results.length === 1 ? '' : 's'}${medals ? ` · ${medals}` : ''}${r.stages?.length ? ` · ${r.stages.length} etapas${st.length ? `, ${st.length} podio${st.length === 1 ? '' : 's'} de etapa` : ''}` : ''}</p>
      ${res.length ? `<p class="pods">${res.map((x) => `${medal(x.position)} ${esc(x.runner_name)}${x.category ? ` <small>${esc(x.category)}</small>` : ''}`).join(' · ')}</p>` : ''}
      ${issues.length ? `<p class="issues">${issues.map((x) => `<span class="issue">⚠️ ${esc(x)}</span>`).join('')}</p>` : ''}<a class="btn small ghost" href="#/carreras/${r.id}">${ico('pen')}Abrir y editar${ico('go')}</a>` });
  };
  return `
    ${mods.length > 1 || S.raceMod !== 'all' ? `<div class="years mod-chips" role="tablist" aria-label="Modalidad">
      <button class="chip${!S.raceMod || S.raceMod === 'all' ? ' on' : ''}" data-act="race-mod" data-m="all">Todas</button>
      ${mods.map((m) => `<button class="chip mchip ${modClass(m)}${S.raceMod === m ? ' on' : ''}" data-act="race-mod" data-m="${esc(m)}"><i class="dot"></i>${esc(m)}</button>`).join('')}</div>` : ''}
    <div class="row race-sum"><span class="muted">${searching ? `Resultados de «${esc(q)}» (todos los años)` : `${S.year}`}: <b>${shown.length}</b> carrera${shown.length === 1 ? '' : 's'} · ${pods} podio${pods === 1 ? '' : 's'}</span>
      ${todo.length || S.raceTodo ? `<button class="chip${S.raceTodo ? ' on' : ''}" data-act="race-todo">⚠️ Por completar (${todo.length})</button>` : ''}</div>
    ${shown.length ? shown.map(card).join('')
      : `<p class="empty">${S.raceTodo ? 'No hay carreras por completar. 🎉' : searching ? `Ninguna carrera se parece a «${esc(q)}».` : `No hay carreras en ${S.year}.`}</p>`}`;
}

function viewRaces() {
  const years = availableYears(S.data.races);
  if (!years.includes(S.year)) S.year = years[0];
  return frame('Carreras', `
    ${carTabs('carreras')}
    ${normalize(S.q.races || '').length >= 2 ? '' : yearPicker(years)}
    <div class="toolbar">
      ${searchBox('races', 'Buscar carrera o lugar…')}
      <a class="btn primary add-btn" href="#/carreras/nueva" aria-label="Nueva carrera" title="Nueva carrera">＋</a>
    </div>
    <div id="race-list">${raceListHtml()}</div>`);
}

function yearPicker(years) {
  return `<div class="years" role="tablist">${years.map((y) =>
    `<button class="chip${y === S.year ? ' on' : ''}" data-act="year" data-y="${y}">${y}</button>`).join('')}</div>`;
}

function draftRace(id) {
  if (id === 'nueva') return { kind: 'race', id: null, name: '', date: '', place: '', province: '', country: DEFAULT_COUNTRY, modality: 'Carretera', race_type: 'suelta', circuit: '', subtype: '', km: '', url: '', elevation: '', price: '', notes: '', people: [], stages: [] };
  const r = S.data.races.find((x) => x.id === id);
  if (!r) return null;
  const stages = (r.stages || []).map((_, i) => stageName(r, i));
  return { kind: 'race', ...r, stages, multi: !!r.end_date, people: r.results.map((x) => ({ runner_id: x.runner_id, runner_name: x.runner_name, category: x.category || '',
    position: x.position ?? '', podium_type: x.podium_type || 'suelta', self_reported: !!x.self_reported, origPosition: x.position ?? '', time: x.time_seconds ? formatTime(x.time_seconds) : '',
    stage_positions: stages.map((_, i) => x.stage_positions?.[i] ?? '') }))
    .sort((a, b) => (a.position || 9999) - (b.position || 9999) || a.runner_name.localeCompare(b.runner_name, 'es')) };
}

/** Al crear una carrera: avisa si ya hay una parecida (en resultados o como inscripción). */
function raceDupes(name) {
  if (normalize(name).length < 3) return '';
  const races = searchRaces(name, S.data.races).slice(0, 4);
  const regs = searchRaces(name, S.data.registrations).slice(0, 3);
  if (!races.length && !regs.length) return '';
  return `<div class="dup"><p><b>⚠️ ¿Ya existe? Míralo antes de crearla:</b></p><ul class="mini-list">
    ${races.map((x) => miniRow(x, `<a class="btn small" href="#/carreras/${x.id}">Abrir</a>`)).join('')}
    ${regs.map((g) => miniRow(g, `<a class="btn small" href="#/inscripciones/${g.id}">Inscripción</a>`)).join('')}</ul></div>`;
}

function viewRaceEdit() {
  const d = S.draft;
  if (!d) return frame('Carrera', '<p class="empty">Esta carrera ya no existe.</p>', { back: editBack('#/carreras') });
  return frame(d.id ? 'Editar carrera' : 'Nueva carrera', `
    ${d.id ? createdByLine(d) + pubsBlock(d, true) : ''}
    <form class="card stack" data-form="save-race">
      ${raceFields(d)}
      ${d.id ? '' : `<div id="dup-race">${raceDupes(d.name)}</div>`}
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
            ${PODIUM_TYPES.map((t) => opt(t.id, { suelta: 'Suelta', general: 'General', campeonato: 'Campeonato' }[t.id] || t.label, p.podium_type)).join('')}</select>
        </div>
        <div class="res-time"><span class="flabel">⏱️ Tiempo</span>${timeFields(p.time, `data-p="${i}" data-pf="time"`)}</div>
        ${d.stages.length ? `<div class="stage-pos">${d.stages.map((n, j) => `<label><span data-stage-label="${j}">${esc(n)}</span>
          <input type="number" inputmode="numeric" min="1" data-p="${i}" data-sp="${j}" value="${esc(p.stage_positions?.[j] ?? '')}"></label>`).join('')}</div>` : ''}
        </li>`;
      }).join('')}</ul>
      ${addRunnerSelect(d)}
      <div class="save-bar"><button class="btn primary block">Guardar</button></div>
    </form>
    ${d.id ? `<button class="btn block" data-act="race-repeat">📋 Repetir el año que viene</button>
    <button class="btn danger ghost block" data-act="del-race">Borrar carrera</button>` : ''}`,
  { back: editBack('#/carreras') });
}

// ======================================================================
//  Resumen anual
// ======================================================================

/** Resumen del equipo en la pantalla Equipo del corredor: filtros simples, cifras grandes, líderes con icono, modalidades, mes + formatos y clasificación compacta. */
function summaryRunner({ years, all, s, mod, cls, me, people, names, cats, pods, places, maxOf, reach = '', board = '' }) {
  const T = s.totals;
  const modLabel = !mod ? '' : mod.includes('|') ? mod.split('|').filter(Boolean).join(' · ') : mod;
  const filterOn = !!mod || S.year !== years[0];
  const tab = RES_TABS.some(([k]) => k === S.eqTab) ? S.eqTab : 'pan';
  const filters = `<div class="eq-bar"><nav class="rs-tabs" role="tablist" aria-label="Apartados del resumen del equipo">${RES_TABS.map(([k, l, ic]) => `<button type="button" class="${k === tab ? 'on' : ''}" data-act="eq-tab" data-t="${k}" role="tab" aria-selected="${k === tab}">${ico(ic)}<span>${l}</span></button>`).join('')}</nav>
      <button type="button" class="eq-fbtn${filterOn ? ' on' : ''}" data-act="eq-filters" aria-label="Filtros${filterOn ? ' (activos)' : ''}" title="Filtros">${icon(ICON_FILTER)}${filterOn ? '<i class="fdot"></i>' : ''}</button></div>
    ${filterOn ? `<div class="eq-active"><span>${S.year}${mod ? ` · ${esc(modLabel)}` : ''}</span><button type="button" class="link" data-act="eq-clear">Quitar filtros ✕</button></div>` : ''}`;
  const big = (n, label, c) => `<div class="b-${c}"><b>${n}</b><span>${label}</span></div>`;
  const mini = (icon, v, l, c) => `<div class="m-${c}"><i>${ico(icon)}</i><b>${v}</b><small>${l}</small></div>`;
  const hero = `<section class="sum-hero eq-hero ${cls}">
    <p class="sum-hero-t">${ico('flag')}${mod ? esc(modLabel) : 'Todo el equipo'} · Temporada ${S.year}</p>
    <div class="sum-big">${big(T.races, 'Carreras', 'r')}${big(T.runners, 'Corredores', 'c')}${big(T.podiums, 'Podios', 'p')}${big(T.wins, 'Victorias', 'w')}</div>
    <div class="eq-mini${T.elevation ? ' eq-mini5' : ''}">${mini('ruler', T.km ? kmText(T.km) : '—', 'totales', 'km')}${T.elevation ? mini('mountain', elevText(T.elevation), 'de subida', 'el') : ''}${mini('clock', T.timed ? formatTime(T.time, true) : '—', 'en carrera', 'tm')}${mini('users', T.participations, 'particip.', 'pt')}${mini('bars', T.podiums ? `${Math.round((T.podiums / Math.max(1, T.participations)) * 100)} %` : '—', 'podios', 'pc')}</div>
    ${T.travelKm ? `<p class="eq-trip">${ico('compass')}<b>${esc(kmText(T.travelKm))}</b> de viaje entre todos <small>(ida y vuelta, aprox.)</small></p>` : ''}
  </section>`;
  // tarjetas de líderes: nombre de quien lidera y su cifra; las de «récord» llevan su propio texto
  const lead = (icon, label, score, fmt, cls = icon) => {
    const top = Math.max(0, ...people.map(score));
    if (!top) return '';
    return `<div class="lead l-${cls}"><span class="lead-i">${ico(icon)}</span><small>${label}</small><b>${names(people.filter((r) => score(r) === top), 2)}</b><em>${fmt(top)}</em></div>`;
  };
  const plu = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const L = s.longest;
  const longestCard = L ? `<div class="lead l-ruler"><span class="lead-i">${ico('ruler')}</span><small>Carrera más larga</small><b>${esc(kmText(L.km))}</b><em class="lead-race">${esc(L.race)}</em><em>${esc(L.runners.slice(0, 2).join(', '))}${L.runners.length > 2 ? ` y ${L.runners.length - 2} más` : ''}</em></div>` : '';
  const LT = s.longestTime;
  const timeCard = LT ? `<div class="lead l-hours"><span class="lead-i">${ico('timer')}</span><small>Carrera que más horas costó</small><b>${esc(formatTime(LT.seconds, true))}</b><em class="lead-race">${esc(LT.race)}</em><em>${esc(LT.runner)}</em></div>` : '';
  const H = s.hardest;
  const F = s.farthest;
  const farCard = F ? `<div class="lead l-compass"><span class="lead-i">${ico('compass')}</span><small>Carrera más lejana</small><b>${esc(kmText(F.value))}</b><em class="lead-race">${esc(F.race)}</em><em>${esc(F.place || '')}</em></div>` : '';
  const hardestCard = H ? `<div class="lead l-mountain"><span class="lead-i">${ico('mountain')}</span><small>Carrera más dura</small><b>${esc(elevText(H.elevation))}</b><em class="lead-race">${esc(H.race)}</em><em>${esc(H.runners.slice(0, 2).join(', '))}${H.runners.length > 2 ? ` y ${H.runners.length - 2} más` : ''}</em></div>` : '';
  const leaders = [
    lead('flag', 'Más carreras', (r) => r.races, (n) => plu(n, 'carrera', 'carreras')),
    lead('trophy', 'Más podios', (r) => r.p1 + r.p2 + r.p3, (n) => plu(n, 'podio', 'podios')),
    lead('medal', 'Más victorias', (r) => r.p1, (n) => plu(n, 'victoria', 'victorias')),
    longestCard,
    timeCard,
    lead('route', 'Más kilómetros', (r) => r.km, (n) => kmText(n), 'route'),
    lead('route', 'Más km por día', (r) => (r.kmDays ? Math.round((r.km / r.kmDays) * 10) / 10 : 0), (n) => perDayText(n), 'route'),
    lead('timer', 'Más rápido (km/h)', (r) => (r.secTimed ? Math.round((r.kmTimed / (r.secTimed / 3600)) * 10) / 10 : 0), (n) => speedText(n), 'timer'),
    lead('ruler', 'Carreras más largas', (r) => (r.kmRaces ? Math.round(r.km / r.kmRaces) : 0), (n) => `${kmText(n)} de media por carrera`, 'ruler'),
    lead('compass', 'Aprovecha el viaje', (r) => (r.tripBoth ? Math.round((r.kmBoth / r.tripBoth) * 100) / 100 : 0), (n) => `${ratioX(n)} km de carrera por km de viaje`, 'compass'),
    lead('mountain', 'Más desnivel', (r) => r.elev, (n) => elevText(n), 'mountain'),
    hardestCard,
    lead('compass', 'Se desplaza más', (r) => r.trip, (n) => `${kmText(n)} de viaje`, 'compass'),
    farCard,
    lead('timer', 'Más tiempo en carrera', (r) => r.time, (n) => formatTime(n, true), 'timer'),
    lead('layers', 'Más versátil', (r) => Object.keys(r.discs || {}).length, (n) => plu(n, 'disciplina distinta', 'disciplinas distintas')),
    lead('calcheck', 'Más constante', (r) => r.months?.size || 0, (n) => plu(n, 'mes con carrera', 'meses con carrera'), 'calcheck'),
  ].filter(Boolean).join('');
  // participación del equipo, compacta: una barra repartida (por disciplina o por categoría) y globos debajo
  const pview = S.partView === 'cat' ? 'cat' : 'disc';
  const partItems = pview === 'disc'
    ? modalityTree(all).flatMap((m) => (m.children.length ? m.children : [{ modality: m.modality, subtype: '', key: disciplineKey(m.modality, ''), label: m.modality, participations: m.participations, runners: m.runners, races: m.races }])).map((x) => ({ key: x.key, mod: x.modality, cls: discClass(x.modality, x.subtype), label: x.label, n: x.participations, tip: `${x.runners} corredor${x.runners === 1 ? '' : 'es'} · ${x.races} carrera${x.races === 1 ? '' : 's'}` })).filter((x) => x.n)
    : s.byCategory.map((c) => ({ key: '', cls: `d-cat-${slug(c.category) || 'sin'}`, label: c.category || 'Sin categoría', n: c.participations, tip: `${c.runners} corredor${c.runners === 1 ? '' : 'es'}${c.km ? ` · ${kmText(c.km)}` : ''}` }));
  const partTot = partItems.reduce((n, x) => n + x.n, 0) || 1;
  const byMod = `<section class="card eq-mod"><div class="part-head"><h2>Participación</h2>
      <div class="seg-sw part-sw" role="group" aria-label="Ver la participación por"><button type="button" class="${pview === 'disc' ? 'on' : ''}" data-act="part-view" data-v="disc">Disciplina</button><button type="button" class="${pview === 'cat' ? 'on' : ''}" data-act="part-view" data-v="cat">Categoría</button></div></div>
    <div class="part-bar" role="img" aria-label="Participaciones del equipo por ${pview === 'disc' ? 'disciplina' : 'categoría'}">${partItems.map((x) => `<span class="${x.cls}" style="flex:${x.n}" title="${esc(x.label)}: ${x.n} (${x.tip})">${x.n / partTot >= 0.09 ? x.n : ''}</span>`).join('')}</div>
    <div class="part-chips">${partItems.map((x, i) => `${pview === 'disc' && SUBTYPES[x.mod] && (i === 0 || partItems[i - 1].mod !== x.mod) ? `<span class="part-mod ${modClass(x.mod)}"><i></i>${esc(x.mod)} <b>${partItems.filter((y) => y.mod === x.mod).reduce((n, y) => n + y.n, 0)}</b></span>` : pview === 'disc' && i > 0 && partItems[i - 1].mod !== x.mod ? '<span class="part-brk"></span>' : ''}${(x.key
      ? `<button type="button" class="part-chip ${x.cls}${mod === x.key ? ' sel' : ''}" data-act="sum-mod" data-m="${esc(x.key)}" title="${esc(x.tip)}"><i></i>${esc(x.label)} <b>${x.n}</b></button>`
      : `<span class="part-chip ${x.cls}" title="${esc(x.tip)}"><i></i>${esc(x.label)} <b>${x.n}</b></span>`)}`).join('')}</div>
</section>`;
  // carreras por mes + formatos más comunes
  const maxMonth = maxOf(s.byMonth.map((m) => m.total));
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const discOrder = (k) => s.disciplines.findIndex((d) => d.key === k);
  const months = `<section class="card eq-months"><h2>Carreras por mes</h2>
    <div class="mchart" role="img" aria-label="Carreras de cada mes, por disciplina">${s.byMonth.map((m) => `<div class="mc${m.total ? '' : ' none'}"><div class="mc-area"><em>${m.total || ''}</em>
      <div class="mc-stack" style="height:${m.total ? (m.total / maxMonth) * 100 : 0}%">${Object.entries(m.discs).sort(([x], [y]) => discOrder(y) - discOrder(x)).map(([k, n]) => { const [dm, ds] = k.split('|');
        return `<span class="${discClass(dm, ds)}" style="flex:${n}" title="${esc(discLabel(dm, ds))}: ${n}"></span>`; }).join('')}</div></div><b>${MES[m.month]}</b></div>`).join('')}</div>
    <h3>Carreras por modalidad y disciplina</h3>${discLegend(s.disciplines, true)}</section>`;
  // clasificación: cuatro primeros y el resto desplegado
  const active = people.filter((r) => r.races > 0), idle = people.filter((r) => !r.races && r.current);
  const maxR = maxOf(active.map((r) => r.races));
  const hue = (k) => [...String(k)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const ini = (n) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const row = (r, i) => `<li class="${me && r.key === me ? 'me-row' : ''}${r.current ? ' tappable' : ''}"${r.current ? ` data-act="mate-open" data-id="${esc(r.key)}"` : ''}>
      <span class="avatar" style="--h:${hue(r.key)}">${esc(ini(r.name))}</span>
      <div class="rk"><div class="rk-h"><b>${i + 1}. ${esc(r.name)}</b>${r.km ? `<small class="muted">${kmText(r.km)}</small>` : ''}</div>
        <div class="bar seg" style="width:${(r.races / maxR) * 100}%">${all.disciplines.filter((d) => r.discs?.[d.key]).map((d) => `<span class="${discClass(d.modality, d.subtype)}" style="flex:${r.discs[d.key]}" title="${esc(discLabel(d.modality, d.subtype))}: ${r.discs[d.key]}"></span>`).join('')}</div></div>
      <span class="rk-n n${Math.min(i + 1, 3)}">${r.races}</span></li>`;
  const rest = active.slice(4);
  const rank = `<section class="card eq-rank"><h2>Clasificación de corredores${mod ? ` · ${esc(modLabel)}` : ''}</h2>
    ${active.length ? `<ol class="rank rank2">${active.slice(0, 4).map(row).join('')}</ol>
      ${rest.length || idle.length ? `<details class="rank-more"><summary>+ ${rest.length + idle.length} corredores más</summary>
        ${rest.length ? `<ol class="rank rank2" start="5">${rest.map((r, i) => row(r, i + 4)).join('')}</ol>` : ''}
        ${idle.length ? `<p class="muted small">Sin carreras todavía: ${names(idle, 40)}.</p>` : ''}</details>` : ''}`
      : '<p class="muted">Todavía no hay carreras este año.</p>'}</section>`;
  // --- podios: por categoría y por disciplina, y cada podio dicho con todas las letras («1º de M40 · BTT · XCO · general final»)
  const pl = s.podiumList;
  const medalsOf = (list) => [1, 2, 3].map((k) => list.filter((x) => x.position === k).length);
  const mchips = (m) => m.map((n, i) => (n ? `<span class="pm m${i + 1}"><i class="medal m${i + 1}"></i>${n}</span>` : '')).join('');
  const groupBy = (keyFn) => { const g = new Map(); for (const x of pl) { const k = keyFn(x); (g.get(k) || g.set(k, []).get(k)).push(x); } return [...g].map(([k, list]) => ({ k, list, m: medalsOf(list) })).sort((x, y) => y.list.length - x.list.length || y.m[0] - x.m[0] || y.m[1] - x.m[1]); };
  const view = S.podView === 'disc' ? 'disc' : 'cat';
  const rowsCat = groupBy((x) => x.category || 'Sin categoría');
  const rowsDisc = groupBy((x) => disciplineKey(x.modality, x.subtype));
  const grpRow = (label, m, total, cls = '') => `<li class="pg-row ${cls}"><b>${label}</b><span class="pg-m">${mchips(m)}</span><span class="pg-n">${total}</span></li>`;
  const medalNames = ['1º', '2º', '3º'];
  const typeLabel = (x) => (x.type === 'etapa' ? `Etapa${x.stage ? `: ${esc(x.stage)}` : ''}` : x.type === 'general' ? 'General final' : x.type === 'campeonato' ? 'Campeonato' : 'Carrera suelta');
  const items = [...pl].sort((x, y) => y.date.localeCompare(x.date) || x.position - y.position);
  const podItem = (x) => `<li class="pod-item m${x.position}">
      <i class="medal m${x.position}"></i>
      <div class="pod-main"><div class="pod-l1"><b>${esc(x.runner)}</b><span class="pod-pos m${x.position}">${medalNames[x.position - 1]} ${x.category ? `de ${esc(x.category)}` : 'sin categoría'}</span></div>
        <div class="pod-l2"><b class="rname">${esc(x.race)}</b> <span class="muted">· ${esc(formatDate(x.date, false))}</span></div>
        <div class="pod-l3">${modTag(x.modality, x.subtype)}<span class="tag t-type">${typeLabel(x)}</span></div></div></li>`;
  const SHOWN = 5;
  const podRunner = `<section class="card eq-pods"><h2>Podios${mod ? ` · ${esc(modLabel)}` : ' del año'}</h2>
    ${pl.length ? `<div class="pod-tot">${[1, 2, 3].map((k) => { const n = pl.filter((x) => x.position === k).length; return n ? `<span class="pod-pill m${k}"><i class="medal m${k}"></i>${n} ${['Oro', 'Plata', 'Bronce'][k - 1]}${n === 1 ? '' : 's'}</span>` : ''; }).join('')}</div>
      <div class="seg-sw pod-sw" role="group" aria-label="Ver los podios por"><button type="button" class="${view === 'cat' ? 'on' : ''}" data-act="pod-view" data-v="cat">Por categoría</button><button type="button" class="${view === 'disc' ? 'on' : ''}" data-act="pod-view" data-v="disc">Por modalidad</button></div>
      <p class="hint">${view === 'cat' ? 'El puesto es el de su <b>categoría</b>: un 1º de M40 es el primero entre los M40.' : 'Podios de cada modalidad y, debajo, de sus disciplinas (suman todas las categorías).'}</p>
      <ul class="pg-list">${view === 'cat' ? rowsCat.map((g) => grpRow(esc(g.k), g.m, g.list.length)).join('')
        : [...new Set(rowsDisc.map((g) => g.k.split('|')[0]))].map((dm) => { const ch = rowsDisc.filter((g) => g.k.split('|')[0] === dm), all3 = ch.flatMap((g) => g.list);
            return grpRow(`<b>${esc(dm)}</b>`, medalsOf(all3), all3.length, `pg-mod ${modClass(dm)}`) + (SUBTYPES[dm] ? ch.map((g) => { const ds = g.k.split('|')[1]; return grpRow(esc(subLabel(dm, ds)), g.m, g.list.length, `pg-sub ${discClass(dm, ds)}`); }).join('') : ''); }).join('')}</ul>
      <h3>Últimos podios</h3><ul class="pod-items">${items.slice(0, SHOWN).map(podItem).join('')}</ul>
      ${items.length > SHOWN ? `<details class="pod-more"><summary>Ver los ${items.length - SHOWN} anteriores</summary><ul class="pod-items">${items.slice(SHOWN).map(podItem).join('')}</ul></details>` : ''}`
      : '<p class="muted">Sin podios este año.</p>'}</section>`;
  const leadsBlock = leaders ? `<div class="eq-leads-wrap"><div class="leads eq-leads" role="list" aria-label="Líderes y récords del equipo">${leaders}</div><p class="leads-hint">Desliza para ver más récords ›</p></div>` : '';
  const body = { pan: `${hero}${leadsBlock}${streakBoard(S.runnerData?.me?.id)}${months}${byMod}`, pod: podRunner, eq: `${board}${idle.length ? `<p class="muted small">Sin carreras todavía${mod ? ` de ${esc(modLabel)}` : ''}: ${names(idle, 40)}.</p>` : ''}`, alc: reach }[tab];
  return `<div class="eq">${filters}${body}</div>`;
}

/**
 * Contenido del resumen anual. `admin`: enlaces a las carreras, avisos de datos que faltan y CSV.
 * `me`: id del corredor que mira (se resalta su fila).
 */
function summaryBody(races, runners, { admin = false, me = null } = {}) {
  const years = availableYears(races);
  if (!years.includes(S.year)) S.year = years[0];
  const all = yearSummary(S.year, races, runners);          // todas las modalidades (para los selectores)
  // el filtro puede ser una modalidad («BTT») o, en la pantalla del corredor, una disciplina («BTT|XCO»)
  if (S.sumMod && S.sumMod !== 'all' && !all.byModality.some((m) => m.modality === S.sumMod)
    && !(!admin && S.sumMod.includes('|') && all.disciplines.some((d) => d.key === S.sumMod))) S.sumMod = 'all';
  const mod = S.sumMod && S.sumMod !== 'all' ? S.sumMod : null;
  const isDisc = !!mod && mod.includes('|');
  const s = mod ? yearSummary(S.year, races.filter((r) => (isDisc ? disciplineKey(r.modality, r.subtype) === mod : r.modality === mod)), runners) : all;  // lo que se ve, filtrado
  const cls = mod && !isDisc ? modClass(mod) : '';
  const raceLink = (id, name) => admin ? `<a class="rname" href="#/carreras/${id}">${esc(name)}</a>` : `<b class="rname">${esc(name)}</b>`;
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
    <p class="sum-hero-s">${s.totals.km ? `📏 ${kmText(s.totals.km)} recorridos entre todos · ` : ''}${s.totals.timed ? `⏱️ ${formatTime(s.totals.time, true)} en carrera (${s.totals.timed} de ${s.totals.participations} con tiempo) · ` : ''}${s.totals.participations} participaciones${s.totals.podiums ? ` · ${Math.round((s.totals.podiums / Math.max(1, s.totals.participations)) * 100)} % acaban en podio` : ''}</p>
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

  // --- por formato (Critérium, XCM…)
  const fmt = s.bySubtype.length ? `<section class="card"><h2>Por formato</h2><div class="pills">${s.bySubtype.map((x) =>
    `<span class="pill ${modClass(x.modality)}"><i class="dot"></i>${mod ? '' : `${esc(x.modality)} · `}${esc(x.subtype)} <b>${x.races}</b></span>`).join('')}</div></section>` : '';

  // --- por categoría
  const maxCat = maxOf(s.byCategory.map((c) => c.participations));
  const cats = s.byCategory.length ? `<section class="card"><h2>Por categoría${mod ? ` de ${esc(mod)}` : ''}</h2>
    <ul class="cat-stats">${s.byCategory.map((c) => `<li><div class="cs-head"><b>${c.category ? esc(c.category) : 'Sin categoría'}</b>
        <small class="muted">${c.runners} corredor${c.runners === 1 ? '' : 'es'} · ${c.participations} ${c.participations === 1 ? 'participación' : 'participaciones'}${c.km ? ` · ${kmText(c.km)}` : ''}</small>
        <span class="cs-pod">${c.podiums ? `${c.p1 ? '🥇' + c.p1 + ' ' : ''}${c.p2 ? '🥈' + c.p2 + ' ' : ''}${c.p3 ? '🥉' + c.p3 : ''}` : ''}</span></div>
      <div class="bar"><span style="width:${(c.participations / maxCat) * 100}%"></span></div></li>`).join('')}</ul></section>` : '';

  // --- clasificación de corredores
  const active = people.filter((r) => r.races > 0);
  const idle = people.filter((r) => !r.races && r.current);
  const maxR = maxOf(active.map((r) => r.races));
  const rank = `<section class="card"><h2>Corredores${mod ? ` de ${esc(mod)}` : ''}</h2>
    ${active.length ? `${!admin && active.some((r) => r.current) ? '<p class="hint">Toca un corredor para ver dónde ha participado.</p>' : ''}<ol class="rank">${active.map((r, i) => `<li class="${me && r.key === me ? 'me-row' : ''}${r.current ? ' tappable' : ''}"${r.current && !admin ? ` data-act="mate-open" data-id="${esc(r.key)}"` : ''}>
      <span class="pos">${i + 1}</span>
      <div class="rk"><div class="rk-h">${!r.current ? `<b>${esc(r.name)}</b>` : admin ? `<a class="rk-name" href="#/corredor/${esc(r.key)}"><b>${esc(r.name)}</b></a>` : `<button type="button" class="rk-name" data-act="mate-open" data-id="${esc(r.key)}"><b>${esc(r.name)}</b></button>`}${r.km ? ` <small class="muted">${kmText(r.km)}</small>` : ''}${r.timed ? ` <small class="muted" title="Suma de los tiempos puestos${r.timed < r.races ? ` (${r.timed} de ${r.races} carreras)` : ''}">⏱️ ${formatTime(r.time, true)}${r.timed < r.races ? ` · ${r.timed}/${r.races}` : ''}</small>` : ''}${r.current ? '' : ' <small class="muted">(baja)</small>'}
          <span class="rk-m">${r.p1 ? `🥇${r.p1} ` : ''}${r.p2 ? `🥈${r.p2} ` : ''}${r.p3 ? `🥉${r.p3}` : ''}</span></div>
        <div class="bar seg" style="width:${(r.races / maxR) * 100}%">${MODALITIES.filter((x) => r.mods[x]).map((x) => `<span class="${modClass(x)}" style="flex:${r.mods[x]}" title="${esc(x)}: ${r.mods[x]}"></span>`).join('')}</div></div>
      <span class="rk-n">${r.races}</span></li>`).join('')}</ol>`
      : `<p class="muted">Todavía no hay carreras${mod ? ` de ${esc(mod)}` : ''} este año.</p>`}
    ${idle.length ? `<p class="muted small">Sin carreras${mod ? ` de ${esc(mod)}` : ''} todavía: ${names(idle, 30)}.</p>` : ''}</section>`;

  // --- podios: totales, tipos y los últimos por carrera (no una lista larga de personas)
  const types = s.byPodiumType.filter((t) => t.podiums);
  const medals = [1, 2, 3].map((k) => [k, s.podiumList.filter((p) => p.position === k).length]);
  const byRace = new Map();
  for (const p of s.podiumList) { const k = p.raceId + '|' + p.date; (byRace.get(k) || byRace.set(k, { ...p, items: [] }).get(k)).items.push(p); }
  const raceRows = [...byRace.values()].sort((x, y) => y.date.localeCompare(x.date));
  const raceRow = (r) => `<li class="${modClass(r.modality)}"><div class="pr-head">${raceLink(r.raceId, r.race)} <span class="muted">· ${formatDate(r.date, false)}</span> ${modTag(r.modality, r.subtype)}</div>
      <p class="pr-who">${r.items.sort((a, b) => a.position - b.position).map((p) => `${medal(p.position)} ${esc(p.runner)}${p.category ? ` <small class="muted">${esc(p.category)}</small>` : ''}${p.stage ? ` <small class="muted">(${esc(p.stage)})</small>` : ''}`).join(' · ')}</p></li>`;
  const SHOWN = 4;
  const pods = `<section class="card"><h2>Podios${mod ? ` de ${esc(mod)}` : ' del año'}</h2>
    ${s.podiumList.length ? `<div class="pod-totals">${medals.map(([k, n]) => `<span><b>${medal(k)} ${n}</b></span>`).join('')}<small class="muted">en ${raceRows.length} carrera${raceRows.length === 1 ? '' : 's'}</small></div>` : ''}
    ${types.length ? `<div class="pills">${types.map((t) => `<span class="pill">${esc(t.label)} <b>${t.podiums}</b>${t.wins ? ` · 🥇 ${t.wins}` : ''}</span>`).join('')}</div>` : ''}
    ${raceRows.length ? `<p class="hint pod-sub">Últimos podios del equipo</p><ul class="podium-list podium-races">${raceRows.slice(0, SHOWN).map(raceRow).join('')}</ul>
      ${raceRows.length > SHOWN ? `<details class="pod-more"><summary>Ver las ${raceRows.length - SHOWN} carrera${raceRows.length - SHOWN === 1 ? '' : 's'} anteriores</summary><ul class="podium-list podium-races">${raceRows.slice(SHOWN).map(raceRow).join('')}</ul></details>` : ''}`
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

  const pkR = resPack(S.year, mod, { races, runners, registrations: S.runnerData?.registrations || [] });
  return summaryRunner({ years, all, s, mod, cls, me, people, names, cats, pods, places, maxOf, reach: resReach(pkR), board: rankingBoard(pkR, { me }) });
}

// ======================================================================
//  Estadísticas de Instagram (Redes → Instagram)
// ======================================================================

const nf = (n) => (n == null ? '—' : Number(n).toLocaleString('de-DE'));   // 5.200 (el «es-ES» no pone el punto en 4 cifras)
const IG_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const igShort = (iso) => `${Number(iso.slice(8))} ${IG_MES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;
const igMonthName = (ym) => `${IG_MES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
const IG_AGES_UI = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const IG_COUNTRY = { ES: 'España', FR: 'Francia', AD: 'Andorra', AR: 'Argentina', US: 'EE. UU.', GB: 'Reino Unido', PK: 'Pakistán', EC: 'Ecuador', DE: 'Alemania', PT: 'Portugal', IT: 'Italia' };

/** Periodos que se pueden elegir: devuelve [desde, hasta] (AAAA-MM-DD; '' = sin límite). */
function igRange(p) {
  const today = todayISO(), d = new Date(today + 'T12:00:00');
  if (p === '30') { const a = new Date(d); a.setDate(a.getDate() - 29); return [todayISO(a), today]; }
  if (p === 'month') return [today.slice(0, 8) + '01', today];
  if (p === 'year') return [`${S.year}-01-01`, `${S.year}-12-31`];
  return ['', ''];
}
async function loadIg(force = false) {
  if (S.ig && !force) return;
  S.ig = { loading: true };
  try { const rows = await api.listIg(); S.ig = rows ? { rows } : { missing: true }; }
  catch (e) { S.ig = { failed: friendlyError(e) }; }
  if (['instagram', 'memoria', 'dossier'].includes(parseRoute().view)) render();
}

function viewInstagram() {
  if (!S.ig) loadIg();
  const head = (inner) => frame('Redes', `${netTabs('ig')}${inner}`);
  if (!S.ig || S.ig.loading) return head('<p class="empty">Cargando…</p>');
  if (S.ig.missing) return head('<p class="card warn">Aún no está activado: falta ejecutar en Supabase <code>supabase/cambios/2026-11-14-instagram.sql</code> (ver docs/instagram-captura.md).</p>');
  if (S.ig.failed) return head(`<p class="card warn">${esc(S.ig.failed)}</p>`);
  const period = S.igPeriod || 'all', sort = S.igSort || 'views';
  const [from, to] = igRange(period);
  const g = igSummary(S.ig.rows, from, to), t = g.totals, prev = igPrevTotals(S.ig.rows, from, to), P = igPeriods(S.ig.rows, from, to);
  const tab = S.igTab || (g.nDays || !P.list.length ? 'res' : 'per');   // por defecto el Diario (la captura automática); Periodos solo si aún no hay datos diarios
  const periods = [['all', 'Todo lo guardado'], ['30', 'Últimos 30 días'], ['month', 'Este mes'], ['year', `Año ${S.year}`]];
  const label = g.nDays ? `${dateEs(g.first)} – ${dateEs(g.last)}` : 'sin datos en este periodo';
  const periodName = (periods.find(([k]) => k === period) || periods[0])[1];
  const noData = !g.nDays && !g.account && !g.audience && !g.posts.length;

  const dlt = (cur, old) => (prev && old ? `${cur >= old ? '+' : '−'}${Math.round((Math.abs(cur - old) / old) * 100)} % vs periodo anterior` : '');
  const kpi = (v, l, note = '', cls = '') => `<div class="rp-kpi ${cls}"><b>${v}</b><span>${l}</span>${note ? `<em class="rp-d">${note}</em>` : ''}</div>`;
  const rep = (inner) => `<section class="card rs-card ig-sec">${inner}</section>`;
  const maxOf = (a) => Math.max(1, ...a);
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
  const bar = (name, v, max, suffix = '') => `<li class="ig-row"><span class="ig-name">${esc(name)}</span><span class="ig-track"><i style="width:${Math.max(2, (v / max) * 100)}%"></i></span><b>${nf(v)}${suffix}</b></li>`;
  const kindName = (p) => (p.type === 'CAROUSEL_ALBUM' ? 'Carrusel' : p.product === 'REELS' ? 'Reel' : p.type === 'VIDEO' ? 'Vídeo' : 'Foto');
  const acc = g.account, a = g.audience;

  // ---------------- RESUMEN ----------------
  const useDays = g.nDays <= 62;
  const series = useDays ? g.days.map((d) => ({ name: d.date.slice(8) + '/' + d.date.slice(5, 7), v: d.views || 0 })) : g.byMonth.map((m) => ({ name: igMonthName(m.ym), v: m.views }));
  const smax = maxOf(series.map((x) => x.v));
  const chart = (ser, title, note = '') => `<h2>${title}</h2><div class="ig-bars${useDays ? ' dense' : ''}" role="img" aria-label="${esc(title)}">${ser.map((x, i) => `<div class="ig-col" title="${esc(x.name)}: ${nf(x.v)}"><i style="height:${Math.max(2, (x.v / smax) * 100)}%"></i>${!useDays || (i % 7 === 0 && ser.length - 1 - i > 3) || i === ser.length - 1 ? `<small>${esc(x.name)}</small>` : '<small></small>'}</div>`).join('')}</div>${note}`;
  const hero = rep(`<h2>@hinacoclubciclistamonzon <small class="muted">· ${esc(label)}</small></h2><div class="rp-kpis">
    ${acc ? kpi(nf(acc.followers), 'Seguidores', acc.delta != null ? `${acc.delta >= 0 ? '+' : '−'}${Math.abs(acc.delta)} desde ${igShort(acc.since)}` : `a ${igShort(acc.until)}`) : ''}
    ${g.nDays ? kpi(nf(t.views), 'Visualizaciones', dlt(t.views, prev?.views), 'in-hero') : ''}${g.nDays && t.reachAvg ? kpi(nf(t.reachAvg), 'Alcance medio diario', 'personas distintas', 'in-hero') : ''}
    ${g.nDays ? kpi(nf(t.interactions), 'Interacciones', dlt(t.interactions, prev?.interactions), 'in-hero') : ''}${g.nDays ? kpi(nf(t.follows), 'Nuevos seguidores', dlt(t.follows, prev?.follows), 'in-hero') : ''}
    ${t.taps ? kpi(nf(t.taps), 'Toques en el perfil') : ''}${g.nDays ? kpi(nf(Math.round(t.views / g.nDays)), 'Visualizaciones por día', 'media') : ''}</div>
    ${acc?.media != null ? `<p class="rp-note" style="margin:0">${nf(acc.media)} publicaciones en total · siguiendo a ${nf(acc.following)}.</p>` : ''}`);
  const evo = g.nDays ? rep(chart(series, `Visualizaciones ${useDays ? 'por día' : 'por mes'}`, g.nDays < 30 ? `<p class="rp-note">Solo hay ${g.nDays} día${g.nDays === 1 ? '' : 's'} guardado${g.nDays === 1 ? '' : 's'}: el histórico crece cada día que la captura se ejecuta.</p>` : '')) : '';
  const split = t.pctNonFollowers != null ? rep(`<h2>¿Quién nos ve?</h2>
    <div class="ig-split"><i style="width:${100 - t.pctNonFollowers}%"></i><i class="nf" style="width:${t.pctNonFollowers}%"></i></div>
    <p class="ig-legend"><span><i class="dot a"></i>Seguidores ${nf(t.viewsF)} (${100 - t.pctNonFollowers} %)</span><span><i class="dot b"></i>No seguidores ${nf(t.viewsNF)} (${t.pctNonFollowers} %)</span></p>
    <p class="rp-note">Las visualizaciones de no seguidores indican hasta dónde llega el club fuera de su círculo.</p>`) : '';
  const eng = t.interactions || t.likes ? rep(`<h2>Interacciones</h2><div class="rp-kpis">
    ${kpi(nf(t.likes), 'Me gusta')}${kpi(nf(t.comments), 'Comentarios')}${kpi(nf(t.shares), 'Compartidos')}${kpi(nf(t.saves), 'Guardados')}${t.reposts ? kpi(nf(t.reposts), 'Reposts') : ''}${t.taps ? kpi(nf(t.taps), 'Toques en enlaces') : ''}</div>`) : '';
  const pv = g.posts.reduce((n, p) => n + (p.views || 0), 0), sv = g.stories.views;
  const mix = [['Publicaciones', pv, g.posts.length], ['Historias', sv, g.stories.n]].filter((x) => x[1]);
  const mixMax = maxOf(mix.map((x) => x[1]));
  const byType = mix.length ? rep(`<h2>Visualizaciones por tipo de contenido</h2><ul class="ig-list tight">${mix.map(([n, v, c]) => bar(`${n} (${c})`, v, mixMax)).join('')}</ul>
    <p class="rp-note">Las historias solo cuentan desde que se activó el guardado automático (Instagram las borra a las 24 h). Las visualizaciones por contenido pueden no sumar el total de la cuenta.</p>`) : '';
  const resumen = `${hero}${evo}${split}${eng}${byType}`;

  // ---------------- CONTENIDO ----------------
  const SORTS = [['views', 'Visualizaciones'], ['reach', 'Alcance'], ['likes', 'Me gusta'], ['comments', 'Comentarios'], ['shares', 'Compartidos'], ['saves', 'Guardados'], ['visits', 'Visitas al perfil'], ['er', 'Interacción %']];
  const ranked = [...g.posts].sort((x, y) => (y[sort] || 0) - (x[sort] || 0));
  const maxPost = maxOf(ranked.map((p) => p[sort] || 0));
  const shown = S.igAll ? ranked : ranked.slice(0, 10);
  const posts = ranked.length ? rep(`<h2>Publicaciones (${ranked.length})</h2>
    <div class="years no-print">${SORTS.map(([k, l]) => `<button class="chip small${k === sort ? ' on' : ''}" data-act="ig-sort" data-s="${k}">${l}</button>`).join('')}</div>
    <ul class="ig-list">${shown.map((p, i) => `<li><span class="ig-rank">${i + 1}</span><div class="ig-post"><div><b>${esc(p.title || kindName(p))}</b></div><small>${dateEs(p.date)} · ${kindName(p)}${p.link ? ` · <a class="no-print" href="${esc(p.link)}" target="_blank" rel="noopener">Ver en Instagram ↗</a>` : ''}</small>
      <span class="ig-track"><i style="width:${Math.max(2, ((p[sort] || 0) / maxPost) * 100)}%"></i></span>
      <small>${nf(p.views)} visualizaciones · ${nf(p.reach)} personas · ${nf(p.likes)} ♥ · ${nf(p.comments)} 💬 · ${nf(p.shares)} ↗ · ${nf(p.saves)} 🔖 · ${nf(p.visits)} visitas al perfil${p.er != null ? ` · interacción ${p.er} %` : ''}</small></div></li>`).join('')}</ul>
    ${ranked.length > 10 ? `<button class="btn block no-print" data-act="ig-all">${S.igAll ? 'Ver solo las 10 primeras' : `Ver las ${ranked.length}`}</button>` : ''}
    <p class="rp-note">«Interacción %» = (me gusta + comentarios + compartidos + guardados) ÷ personas alcanzadas.</p>`) : '';
  const kinds = g.byKind.length ? rep(`<h2>Por tipo de publicación</h2><div class="pills">${g.byKind.map((k) => `<span class="pill">${esc(k.kind)} <b>${k.n}</b> · ${nf(Math.round(k.views / k.n))} visualizaciones de media · ${nf(Math.round(k.likes / k.n))} ♥ de media</span>`).join('')}</div>`) : '';
  const DAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const wdRows = g.byWeekday.filter((d) => d.n), wdMax = maxOf(wdRows.map((d) => d.views / d.n));
  const when = g.posts.length >= 3 ? rep(`<h2>¿Cuándo funcionan mejor?</h2><p class="rp-note" style="margin:0 0 .5rem">Visualizaciones medias según cuándo se publicó (hora de Madrid; mañana 6–14 h, tarde 14–20 h, noche 20–6 h).</p>
    <ul class="ig-list tight">${wdRows.map((d) => bar(`${DAYS_ES[d.d]} (${d.n})`, Math.round(d.views / d.n), wdMax)).join('')}</ul>
    <ul class="ig-list tight" style="margin-top:.6rem">${g.bySlot.filter((x) => x.n).map((x) => bar(`${x.name} (${x.n})`, Math.round(x.views / x.n), maxOf(g.bySlot.filter((y) => y.n).map((y) => y.views / y.n)))).join('')}</ul>
    ${g.posts.length < 10 ? '<p class="rp-note">Con pocas publicaciones es solo orientativo.</p>' : ''}`) : '';
  const stories = g.stories.n ? rep(`<h2>Historias</h2><div class="rp-kpis">${kpi(nf(g.stories.n), 'Historias')}${kpi(nf(g.stories.views), 'Visualizaciones')}${kpi(nf(g.stories.avg), 'De media por historia')}${g.stories.replies ? kpi(nf(g.stories.replies), 'Respuestas') : ''}${g.stories.shares ? kpi(nf(g.stories.shares), 'Compartidos') : ''}</div>
    <ul class="ig-list tight" style="margin-top:.6rem">${g.storyList.slice(0, S.igAll ? 200 : 8).map((x) => `<li class="ig-row"><span class="ig-name">${igShort(x.date)}</span><span class="ig-track"><i style="width:${Math.max(2, ((x.views || 0) / maxOf(g.storyList.map((y) => y.views || 0))) * 100)}%"></i></span><b>${nf(x.views)}</b></li>`).join('')}</ul>
    <p class="rp-note">Instagram solo conserva las historias 24 horas: aquí cuentan las capturadas desde que se activó el guardado automático.</p>`) : '';
  const contenido = `${posts || '<p class="empty">No hay publicaciones guardadas en este periodo.</p>'}${kinds}${when}${stories}`;

  // ---------------- AUDIENCIA ----------------
  const fol = g.followerSeries.length >= 2 ? rep(`<h2>Evolución de seguidores</h2><div class="ig-bars" role="img" aria-label="Seguidores">${(() => { const lo = Math.min(...g.followerSeries.map((x) => x.v)), hi = Math.max(...g.followerSeries.map((x) => x.v)); return g.followerSeries.map((x) => `<div class="ig-col" title="${esc(igShort(x.date))}: ${nf(x.v)}"><i style="height:${hi === lo ? 60 : 15 + ((x.v - lo) / (hi - lo)) * 85}%"></i><small>${g.followerSeries.length <= 8 ? esc(igShort(x.date)) : ''}</small></div>`).join(''); })()}</div>
    <p class="rp-note">Un punto por cada día en que se ha guardado la cuenta (de ${nf(g.followerSeries[0].v)} a ${nf(g.followerSeries[g.followerSeries.length - 1].v)}).</p>`) : '';
  const maxAge = a ? maxOf(a.ages.map((x) => x.v)) : 1;
  const gen = a ? rep(`<h2>Audiencia</h2><p class="rp-note" style="margin:0 0 .6rem">Seguidores a ${dateEs(a.date)} (${nf(a.total)} con datos).</p>
    <div class="rp-kpis">${kpi(`${a.pctMen} %`, 'Hombres', nf(a.gender.M))}${kpi(`${a.pctWomen} %`, 'Mujeres', nf(a.gender.F))}${a.gender.U ? kpi(`${pct(a.gender.U, a.total)}`, 'Sin indicar', nf(a.gender.U)) : ''}</div>
    <h3 class="ig-h">Edad y género</h3><ul class="ig-list tight">${IG_AGES_UI.map((ag) => { const x = a.genderAge[ag], tot = x.F + x.M + x.U; return `<li class="ig-row wide"><span class="ig-name">${ag}</span><span class="ig-track gstack"><i class="m" style="width:${(x.M / maxAge) * 100}%"></i><i class="f" style="width:${(x.F / maxAge) * 100}%"></i><i class="u" style="width:${(x.U / maxAge) * 100}%"></i></span><b>${nf(tot)}</b></li>`; }).join('')}</ul>
    <p class="ig-legend"><span><i class="dot a"></i>Hombres</span><span><i class="dot b"></i>Mujeres</span><span><i class="dot c"></i>Sin indicar</span></p>`) : '';
  const geo = a ? rep(`<h2>Dónde viven</h2><h3 class="ig-h">Ciudades</h3><ul class="ig-list tight">${a.cities.map((x) => bar(x.name.split(',')[0], x.v, a.cities[0].v, ` <small>${pct(x.v, a.total)}</small>`)).join('')}</ul>
    <h3 class="ig-h">Países</h3><ul class="ig-list tight">${a.countries.map((x) => bar(IG_COUNTRY[x.name] || x.name, x.v, a.countries[0].v)).join('')}</ul>`) : '';
  const audiencia = `${fol}${gen}${geo}` || '<p class="empty">Sin datos de audiencia todavía.</p>';

  // ---------------- PERIODOS (resúmenes de Insights que vuelca Claude desde las capturas) ----------------
  const pl = P.list, pt = P.totals;
  const plabel = (x) => `${Number(x.from.slice(8))} ${IG_MES[Number(x.from.slice(5, 7)) - 1]}–${igShort(x.to)}`;
  const signed = (n) => (n >= 0 ? '+' : '−') + nf(Math.abs(n));
  const maxPerViews = maxOf(pl.map((x) => x.views || 0));
  const TYPES = [['v_story', 'Historias', 'm'], ['v_feed', 'Publicaciones', 'f'], ['v_reel', 'Reels', 'u']];
  const perBlock = !pl.length ? '<p class="empty">Aún no hay periodos. Mándale a Claude una captura de Instagram → Insights (con el periodo elegido, por ejemplo «30 días») y vuelca los números aquí.</p>' : [
    rep(`<h2>Total <small class="muted">· ${pl.length} periodo${pl.length === 1 ? '' : 's'}, ${nf(pt.days)} días</small></h2><div class="rp-kpis">
      ${pt.views != null ? kpi(nf(pt.views), 'Reproducciones', pt.days ? `${nf(Math.round(pt.views / pt.days))} al día` : '') : ''}
      ${pt.interactions != null ? kpi(nf(pt.interactions), 'Interacciones') : ''}
      ${pt.net_follows != null ? kpi(signed(pt.net_follows), 'Seguidores netos') : ''}
      ${pt.viewersMax != null ? kpi(nf(pt.viewersMax), 'Espectadores', pl.length > 1 ? 'el mayor de un periodo' : 'del periodo') : ''}
      ${pt.likes != null ? kpi(nf(pt.likes), 'Me gusta') : ''}${pt.shares != null ? kpi(nf(pt.shares), 'Compartidos') : ''}${pt.saves != null ? kpi(nf(pt.saves), 'Guardados') : ''}${pt.profile_visits != null ? kpi(nf(pt.profile_visits), 'Visitas al perfil') : ''}${pt.link_taps != null ? kpi(nf(pt.link_taps), 'Toques en el enlace') : ''}</div>
      <p class="rp-note" style="margin:0">Los espectadores son personas distintas y no se suman entre periodos. ${pl.some((x) => (x.approx || []).length) ? 'Las cifras marcadas con ≈ vienen redondeadas («6,9 mil»).' : ''}</p>`),
    P.overlaps.length ? `<p class="card warn">⚠️ Estos periodos se pisan: ${P.overlaps.map(([a, b]) => `${plabel(a)} y ${plabel(b)}`).join('; ')}. Los totales cuentan dos veces los días repetidos; dime cuál quitar.</p>` : '',
    pl.some((x) => x.views != null) ? rep(`<h2>Reproducciones por periodo</h2>${pl.length < 2 ? '' : `<div class="ig-bars" role="img" aria-label="Reproducciones por periodo">${pl.map((x) => `<div class="ig-col" title="${esc(plabel(x))}: ${nf(x.views)}"><i style="height:${Math.max(2, ((x.views || 0) / maxPerViews) * 100)}%"></i><small>${esc(plabel(x))}</small></div>`).join('')}</div>`}
      <ul class="ig-list tight" style="margin-top:.5rem">${pl.map((x) => bar(plabel(x), x.views || 0, maxPerViews, x.days ? ` <small>${nf(Math.round((x.views || 0) / x.days))}/d</small>` : '')).join('')}</ul>`) : '',
    pl.some((x) => TYPES.some(([k]) => x[k] != null)) ? rep(`<h2>Por tipo de contenido</h2>${pl.length === 1 ? (() => { const x = pl[0], tot = TYPES.reduce((n, [k]) => n + (x[k] || 0), 0) || 1;
        return `<div class="ig-hstack" role="img" aria-label="Reproducciones por tipo de contenido">${TYPES.filter(([k]) => x[k]).map(([k, , c]) => `<i class="${c}" style="width:${(x[k] / tot) * 100}%"></i>`).join('')}</div>`; })() : `<div class="ig-bars" role="img" aria-label="Reproducciones por tipo de contenido">${pl.map((x) => { const tot = TYPES.reduce((n, [k]) => n + (x[k] || 0), 0), mx = maxOf(pl.map((y) => TYPES.reduce((n, [k]) => n + (y[k] || 0), 0)));
        return `<div class="ig-col" title="${esc(plabel(x))}"><div class="ig-stackcol" style="height:${Math.max(2, (tot / mx) * 100)}%">${TYPES.filter(([k]) => x[k]).map(([k, , c]) => `<i class="${c}" style="flex:${x[k]}"></i>`).join('')}</div><small>${esc(plabel(x))}</small></div>`; }).join('')}</div>`}
      <p class="ig-legend">${TYPES.map(([, l, c]) => `<span><i class="dot ${c === 'm' ? 'a' : c === 'f' ? 'b' : 'c'}"></i>${l}</span>`).join('')}</p>
      <ul class="ig-list tight">${pl.map((x) => `<li class="ig-post"><small><b>${esc(plabel(x))}</b>: ${TYPES.filter(([k]) => x[k] != null).map(([k, l]) => `${l} ${(x.approx || []).includes(k) ? '≈' : ''}${nf(x[k])}`).join(' · ')}</small></li>`).join('')}</ul>`) : '',
    pl.some((x) => x.net_follows != null) ? rep(`<h2>Seguidores netos por periodo</h2><ul class="ig-list tight">${pl.filter((x) => x.net_follows != null).map((x) => bar(plabel(x), Math.abs(x.net_follows), maxOf(pl.map((y) => Math.abs(y.net_follows || 0))), '').replace(`<b>${nf(Math.abs(x.net_follows))}</b>`, `<b>${signed(x.net_follows)}</b>`)).join('')}</ul>`) : '',
    rep(`<h2>Detalle por periodo</h2><ul class="ig-list">${[...pl].reverse().map((x) => `<li><div class="ig-post"><div><b>${esc(plabel(x))}</b> · ${x.days} días</div>
      <small>${[x.views != null ? `${nf(x.views)} reproducciones` : '', x.viewers != null ? `${nf(x.viewers)} espectadores` : '', x.interactions != null ? `${nf(x.interactions)} interacciones` : '', x.net_follows != null ? `${signed(x.net_follows)} seguidores netos` : '', x.views_f_pct != null ? `${x.views_f_pct} % de seguidores` : ''].filter(Boolean).join(' · ')}</small>
      ${x.note ? `<small>${esc(x.note)}</small>` : ''}<button class="link no-print" data-act="ig-per-del" data-key="${esc(x.key)}">🗑️ Quitar este periodo</button></div></li>`).join('')}</ul>`),
  ].join('');
  const per = perBlock;
  const noDataMsg = '<p class="empty">No hay cifras guardadas todavía. Las capturas de la pestaña «Capturas» sirven para el dossier; esta parte se rellena con datos guardados.</p>';
  // contenido destacado y audiencia según Insights (periodos)
  const postsP = P.posts.length ? rep(`<h2>Contenido destacado según Insights</h2><ul class="ig-list">${P.posts.slice(0, 10).map((x, i) => `<li><span class="ig-rank">${i + 1}</span><div class="ig-post"><div><b>${esc(x.t || 'Publicación')}</b></div><small>${x.d ? dateEs(x.d) + ' · ' : ''}${[x.v != null ? `${nf(x.v)} reproducciones` : '', x.l != null ? `${nf(x.l)} ♥` : '', x.c != null ? `${nf(x.c)} 💬` : '', x.s != null ? `${nf(x.s)} ↗` : '', x.k != null ? `${nf(x.k)} 🔖` : ''].filter(Boolean).join(' · ')}</small></div></li>`).join('')}</ul>`) : '';
  const A = P.audience;
  const pctList = (o, n = 10) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).slice(0, n);
  const audP = A ? rep(`<h2>Audiencia según Insights <small class="muted">· ${esc(plabel(A))}</small></h2>
    ${A.gender ? `<div class="rp-kpis">${Object.entries(A.gender).map(([k, v]) => kpi(`${v} %`, k === 'M' ? 'Hombres' : k === 'F' ? 'Mujeres' : k)).join('')}</div>` : ''}
    ${A.ages ? `<h3 class="ig-h">Edad</h3><ul class="ig-list tight">${Object.entries(A.ages).map(([k, v]) => bar(k, v, maxOf(Object.values(A.ages)), ' %')).join('')}</ul>` : ''}
    ${A.cities ? `<h3 class="ig-h">Ciudades</h3><ul class="ig-list tight">${pctList(A.cities).map(([k, v], i, arr) => bar(k.split(',')[0], v, arr[0][1], ' %')).join('')}</ul>` : ''}
    ${A.countries ? `<h3 class="ig-h">Países</h3><ul class="ig-list tight">${pctList(A.countries, 6).map(([k, v], i, arr) => bar(IG_COUNTRY[k] || k, v, arr[0][1], ' %')).join('')}</ul>` : ''}`) : '';
  const hoursP = P.topHours ? rep(`<h2>¿Cuándo están más activos los seguidores?</h2><ul class="ig-list tight">${P.topHours.list.map((h) => `<li class="ig-post"><b>${esc(h)}</b></li>`).join('')}</ul><p class="rp-note">Según Insights (${esc(plabel(P.topHours))}), hora de España. Para publicar cuando más gente está conectada.</p>`) : '';
  const panels = { per, res: noData ? noDataMsg : resumen, con: (noData && !postsP) ? noDataMsg : `${postsP}${noData ? '' : contenido}`, aud: (noData && !audP && !hoursP) ? noDataMsg : `${audP}${hoursP}${noData || audP ? '' : audiencia}` };
  const tabs = [['per', 'Periodos', 'cal'], ['res', 'Diario', 'bars'], ['con', 'Contenido', 'list'], ['aud', 'Audiencia', 'users']];
  const filterOn = period !== 'all';
  const big = (v, l) => `<div class="rs-big"><b>${v}</b><span>${l}</span></div>`;
  // cuándo se actualizó por última vez (la captura automática): para ver de un vistazo si sigue funcionando
  const igUpdLine = () => {
    const u = igLastUpdate(S.ig.rows); if (!u) return '';
    const when = new Date(u.at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const d = Math.floor(u.hours / 24), ago = u.hours < 1 ? 'hace menos de 1 hora' : u.hours < 24 ? `hace ${Math.round(u.hours)} h` : `hace ${d} ${d === 1 ? 'día' : 'días'}`;
    return `<div class="ig-upd ${u.level}" role="status">${ico(u.level === 'ok' ? 'check' : 'alert')}<span><b>Última actualización: ${esc(when)}</b> · ${ago}${u.lastDay ? `<small>Datos hasta el ${esc(formatDate(u.lastDay, false))}</small>` : ''}${u.level === 'ok' ? '' : `<small class="ig-upd-w">${u.level === 'late' ? 'Lleva unos días sin actualizarse.' : 'Lleva más de 4 días sin actualizarse: revisa la tarea automática.'}</small>`}</span></div>`;
  };
  const H = igHeadline(S.ig.rows, from, to);
  const igHero = H.source ? `<section class="rs-hero ig-hero no-print"><p class="rs-hero-t">Instagram · ${esc(periodName)}</p>
      <div class="rs-bigs">${big(nf(H.views), 'visualiz.')}${big(H.viewers ? nf(H.viewers) : '—', H.viewersKind === 'unique' ? 'personas' : 'alcance/día')}${big(nf(H.interactions), 'interacc.')}${big(H.follows != null ? (H.follows > 0 ? '+' : '') + nf(H.follows) : '—', H.source === 'period' ? 'seg. netos' : 'nuevos seg.')}</div>
      <p class="rs-hero-s">${esc(`${dateEs(H.from)} – ${dateEs(H.to)}`)}${H.periods ? ` · incluye ${H.periods} periodo${H.periods === 1 ? '' : 's'} de Insights para los días sin captura diaria` : ''}${acc?.media != null ? ` · ${nf(acc.media)} publicaciones` : ''}${H.nonF != null ? ` · ${H.nonF} % de no seguidores` : ''}</p></section>` : '';
  return head(`
    <div class="no-print">${igHero}${igUpdLine()}
      <div class="eq-bar"><nav class="rs-tabs" role="tablist" aria-label="Apartados de Instagram">${tabs.map(([k, l, ic]) => `<button type="button" class="${k === tab ? 'on' : ''}" data-act="ig-tab" data-t="${k}" role="tab" aria-selected="${k === tab}">${ico(ic)}<span>${l}</span></button>`).join('')}</nav>
        <button type="button" class="eq-fbtn${filterOn ? ' on' : ''}" data-act="ig-filters" aria-label="Periodo${filterOn ? ' (filtrado)' : ''}" title="Periodo">${icon(ICON_FILTER)}${filterOn ? '<i class="fdot"></i>' : ''}</button></div>
      ${filterOn ? `<div class="eq-active"><span>${esc(periodName)}</span><button type="button" class="link" data-act="ig-period" data-p="all">Quitar filtro ✕</button></div>` : ''}
      <div class="ig-tools"><a class="btn primary" href="#/dossier">${ico('file')} Dossier PDF</a><button class="btn" data-act="print-report">${ico('printer')} Todo</button><button class="btn" data-act="ig-csv">${ico('db')} Excel</button></div>
      <details class="ig-help"><summary>${ico('info')} Cómo se añaden datos</summary><p class="hint">Mándale a Claude la captura de Instagram → Insights y él los vuelca aquí: se suman y salen en gráficos. «Dossier PDF» es el documento para colaboradores (portada, resumen, alcance, contenido, audiencia y el club); «Todo» imprime las cuatro pestañas tal cual. En el cuadro de imprimir elige «Guardar como PDF».</p></details></div>
    <div class="print-only ig-title"><b>Club Ciclista Monzón · Estadísticas de Instagram</b><span>${esc(label)}</span></div>
    ${tabs.map(([k, l]) => `<div class="ig-panel${k === tab ? '' : ' off'}"><h2 class="print-only ig-part">${l}</h2>${panels[k]}</div>`).join('')}
    <p class="rp-note">Fuente: Instagram (estadísticas de la cuenta profesional del club). Alcance = personas distintas que vieron el contenido; las visualizaciones cuentan también las repeticiones.</p>`);
}

/** € por cada 1.000 visualizaciones: solo para estimar cuánto costaría comprar ese alcance en publicidad (orientativo, se dice en el dossier). */
const IG_CPM = 6;
/** Dossier de Instagram para colaboradores: un documento propio (portada, resumen, alcance, contenido, audiencia y el club detrás), listo para PDF. */
function viewIgDossier() {
  if (!S.ig) loadIg();
  if (!S.ig || S.ig.loading) return frame('Dossier de Instagram', '<p class="empty">Cargando…</p>', { back: '#/instagram' });
  if (!S.ig.rows) return frame('Dossier de Instagram', `<p class="card warn">${esc(S.ig.failed || 'Instagram aún no está activado.')}</p>`, { back: '#/instagram' });
  const [from, to] = igRange(S.igPeriod || 'all');
  const g = igSummary(S.ig.rows, from, to), P = igPeriods(S.ig.rows, from, to), pl = P.list, pt = P.totals, gt = g.totals;
  const H = igHeadline(S.ig.rows, from, to);
  const first = H.from, last = H.to, days = H.days;
  if (!H.source && !H.followers) return frame('Dossier de Instagram', '<p class="empty">Todavía no hay cifras de Instagram guardadas para este periodo.</p>', { back: '#/instagram' });
  const views = H.views, inter = H.interactions, viewers = H.viewers, follows = H.follows, followers = H.followers, nonF = H.nonF;
  const perDay = days && views ? Math.round(views / days) : null;
  const er = views && inter ? Math.round((inter / views) * 1000) / 10 : null;
  const value = views ? Math.round((views / 1000) * IG_CPM) : null;
  const range = first && last ? `${dateEs(first)} – ${dateEs(last)}` : '';
  const plabel = (x) => `${Number(x.from.slice(8))} ${IG_MES[Number(x.from.slice(5, 7)) - 1]} – ${igShort(x.to)}`;
  const signed = (n) => (n >= 0 ? '+' : '−') + nf(Math.abs(n));
  const box = (title, html) => (html ? `<div class="mem-box">${title ? `<h3>${title}</h3>` : ''}${html}</div>` : '');
  const tile = (ic, label, val, sub = '') => `<div class="rs-tile">${ico(ic)}<small>${label}</small><b>${val}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
  const hbars = (rows, suffix = '') => { const mx = Math.max(1, ...rows.map(([, v]) => v)); return `<ul class="ig-list tight">${rows.map(([n, v]) => `<li class="ig-row"><span class="ig-name">${esc(n)}</span><span class="ig-track"><i style="width:${Math.max(2, (v / mx) * 100)}%"></i></span><b>${nf(v)}${suffix}</b></li>`).join('')}</ul>`; };
  const CH = [];
  const ch = (id, ic, title, lead, body) => { if (body) CH.push({ id, ic, title, lead, body }); };

  // 01 · Resumen
  const facts = [
    views ? `📈 El contenido del club se ha reproducido <b>${nf(views)} veces</b>${perDay ? ` (≈ ${nf(perDay)} al día)` : ''}.` : '',
    viewers ? (H.viewersKind === 'unique' ? `👥 Ha llegado a <b>${nf(viewers)} personas distintas</b>${pl.length > 1 ? ' en un solo periodo' : ''}.` : `👥 Cada día llega de media a <b>${nf(viewers)} personas distintas</b>.`) : '',
    nonF != null ? `🌍 El <b>${nonF} %</b> de las reproducciones son de gente que <b>no sigue</b> al club: llegamos más allá de nuestro círculo.` : '',
    er != null ? `💬 <b>${String(er).replace('.', ',')} interacciones</b> por cada 100 reproducciones (me gusta, comentarios, compartidos y guardados).` : '',
    follows != null ? `➕ <b>${signed(follows)}</b> seguidores netos${followers ? `, hasta <b>${nf(followers)}</b>` : ''}.` : '',
    value ? `💶 Comprar ese alcance en publicidad costaría unos <b>${esc(euros(value))}</b> <small class="muted">(a ${IG_CPM} € por cada 1.000 visualizaciones)</small>.` : '',
  ].filter(Boolean);
  ch('resumen', 'star', 'Resumen', range ? `Instagram del club del ${esc(range)} (${nf(days)} días).` : '', `<div class="rs-tiles">
      ${views ? tile('act', 'Reproducciones', nf(views), perDay ? `${nf(perDay)} al día` : '') : ''}
      ${viewers ? tile('users', H.viewersKind === 'unique' ? 'Personas alcanzadas' : 'Alcance diario', nf(viewers), H.viewersKind === 'unique' ? 'cuentas distintas' : 'personas al día, de media') : ''}
      ${inter ? tile('msg', 'Interacciones', nf(inter), er != null ? `${String(er).replace('.', ',')} por 100 reprod.` : '') : ''}
      ${followers ? tile('users', 'Seguidores', nf(followers), follows != null ? `${signed(follows)} en el periodo` : '') : follows != null ? tile('users', 'Seguidores netos', signed(follows)) : ''}
      ${nonF != null ? tile('compass', 'Fuera de nuestro círculo', `${nonF} %`, 'de no seguidores') : ''}
      ${value ? tile('money', 'Valor publicitario', esc(euros(value)), 'estimado') : ''}</div>
    ${facts.length ? `<ul class="mem-best">${facts.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}`);

  // 02 · Alcance y crecimiento
  const hasDays = g.nDays > 0;
  const perBars = !hasDays && pl.length > 1 && pl.some((x) => x.views) ? hbars(pl.map((x) => [plabel(x), x.views || 0])) : '';
  const daySeries = hasDays && g.byMonth.length > 1 ? (() => { const mx = Math.max(1, ...g.byMonth.map((m) => m.views));
    return `<div class="rs-wk rs-elev dos-bars" role="img" aria-label="Visualizaciones por mes">${g.byMonth.map((m) => `<div><em>${kmShort(m.views)}</em><span style="height:${(m.views / mx) * 100}%"></span><b>${esc(igMonthName(m.ym).slice(0, 3))}</b></div>`).join('')}</div>`; })() : '';
  const monthTbl = hasDays && g.byMonth.length ? `<div class="tp-scroll"><table class="tp-table"><thead><tr><th class="l">Mes</th><th class="num">Días</th><th class="num">Reprod.</th><th class="num">Interacc.</th></tr></thead><tbody>${g.byMonth.map((m) => `<tr><td class="l nw">${esc(igMonthName(m.ym))}</td><td class="num">${m.days}</td><td class="num">${nf(m.views)}</td><td class="num">${nf(m.interactions)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const perTbl = !hasDays && pl.length ? `<div class="tp-scroll"><table class="tp-table"><thead><tr><th class="l">Periodo</th><th class="num">Días</th><th class="num">Reprod.</th><th class="num">Personas</th><th class="num">Interacc.</th><th class="num">Seg. netos</th></tr></thead><tbody>${pl.map((x) => `<tr><td class="l nw">${esc(plabel(x))}</td><td class="num">${x.days}</td><td class="num">${x.views != null ? nf(x.views) : '—'}</td><td class="num">${x.viewers != null ? nf(x.viewers) : '—'}</td><td class="num">${x.interactions != null ? nf(x.interactions) : '—'}</td><td class="num">${x.net_follows != null ? signed(x.net_follows) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '';
  const split = nonF != null ? `<div class="ig-split"><i style="width:${100 - nonF}%"></i><i class="nf" style="width:${nonF}%"></i></div><p class="ig-legend"><span><i class="dot a"></i>Seguidores ${100 - nonF} %</span><span><i class="dot b"></i>No seguidores ${nonF} %</span></p>` : '';
  ch('alcance', 'act', 'Alcance y crecimiento', views ? `<b>${nf(views)}</b> reproducciones${follows != null ? ` y <b>${signed(follows)}</b> seguidores` : ''}.` : '',
    `${box('Reproducciones', perBars || daySeries)}${box('¿Quién nos ve?', split)}${box(hasDays ? 'Mes a mes' : 'Periodo a periodo', monthTbl || perTbl)}`);

  // 03 · Contenido
  const TYPES = [['v_story', 'Historias'], ['v_feed', 'Publicaciones'], ['v_reel', 'Reels']];
  const pv0 = g.posts.reduce((n, p) => n + (p.views || 0), 0), sv0 = g.stories.views;
  const mixD = [{ name: 'Publicaciones', races: pv0 }, { name: 'Historias', races: sv0 }].filter((x) => x.races);
  const mixP = TYPES.map(([k, l]) => ({ name: l, races: pl.reduce((n, x) => n + (x[k] || 0), 0) })).filter((x) => x.races);
  const mix = mixD.length ? mixD : mixP;
  const top = P.posts.length ? P.posts.slice(0, 8).map((x) => ({ t: x.t || 'Publicación', d: x.d, v: x.v, l: x.l, c: x.c, s: x.s }))
    : g.posts.slice(0, 8).map((p) => ({ t: p.title || 'Publicación', d: p.date, v: p.views, l: p.likes, c: p.comments, s: p.shares }));
  const topHtml = top.length ? `<ol class="dos-top">${top.map((x, i) => `<li><span class="pos">${i + 1}</span><div><b>${esc(x.t)}</b><small class="muted">${x.d ? esc(dateEs(x.d)) : ''}</small></div><span class="dos-v"><b>${nf(x.v)}</b><small>reprod.</small></span><small class="dos-m">${[x.l != null ? `♥ ${nf(x.l)}` : '', x.c != null ? `💬 ${nf(x.c)}` : '', x.s != null ? `↗ ${nf(x.s)}` : ''].filter(Boolean).join(' · ')}</small></li>`).join('')}</ol>` : '';
  ch('contenido', 'image', 'Contenido', mix.length ? `Las historias, las publicaciones y los reels del club, y lo que mejor ha funcionado.` : '',
    `${mix.length ? box('Reproducciones por formato', (() => { const tot = mix.reduce((n, x) => n + x.races, 0) || 1, C = ['m', 'f', 'u'];
      return `<div class="ig-hstack dos-mix">${mix.map((x, i) => `<i class="${C[i]}" style="width:${(x.races / tot) * 100}%"></i>`).join('')}</div><ul class="dos-leg">${mix.map((x, i) => `<li><i class="dot ${C[i]}"></i><span>${esc(x.name)}</span><b>${nf(x.races)}</b><em>${Math.round((x.races / tot) * 100)} %</em></li>`).join('')}</ul>`; })()) : ''}${box('Lo más visto', topHtml)}${g.byKind.length ? box('Por tipo de publicación', hbars(g.byKind.map((k) => [`${k.kind} (${k.n})`, Math.round(k.views / k.n)]), ' de media')) : ''}`);

  // 04 · Audiencia
  const A = P.audience, a = g.audience;
  const pctRows = (o, n = 8) => Object.entries(o || {}).sort((x, y) => y[1] - x[1]).slice(0, n);
  const genderTxt = A?.gender ? Object.entries(A.gender).map(([k, v]) => [k === 'M' ? 'Hombres' : k === 'F' ? 'Mujeres' : 'Sin indicar', v]) : a ? [['Hombres', a.pctMen], ['Mujeres', a.pctWomen]] : null;
  const ages = A?.ages ? Object.entries(A.ages) : a ? IG_AGES_UI.map((ag) => { const x = a.genderAge[ag]; return [ag, Math.round(((x.F + x.M + x.U) / Math.max(1, a.total)) * 100)]; }) : null;
  const cities = A?.cities ? pctRows(A.cities).map(([k, v]) => [k.split(',')[0], v]) : a ? a.cities.slice(0, 8).map((x) => [x.name.split(',')[0], Math.round((x.v / Math.max(1, a.total)) * 100)]) : null;
  const countries = A?.countries ? pctRows(A.countries, 5).map(([k, v]) => [IG_COUNTRY[k] || k, v]) : a ? a.countries.slice(0, 5).map((x) => [IG_COUNTRY[x.name] || x.name, Math.round((x.v / Math.max(1, a.total)) * 100)]) : null;
  const topAge = ages?.length ? [...ages].sort((x, y) => y[1] - x[1])[0] : null, topCity = cities?.[0];
  ch('audiencia', 'users', 'Nuestra audiencia', [topAge ? `La franja más numerosa es la de <b>${esc(topAge[0])} años</b> (${topAge[1]} %)` : '', topCity ? `la ciudad con más seguidores, <b>${esc(topCity[0])}</b> (${topCity[1]} %)` : ''].filter(Boolean).join(' y ') + (topAge || topCity ? '.' : ''),
    `<div class="mem-two">${genderTxt ? box('Género', hbars(genderTxt, ' %')) : ''}${ages ? box('Edad', hbars(ages, ' %')) : ''}${cities ? box('Ciudades', hbars(cities, ' %')) : ''}${countries ? box('Países', hbars(countries, ' %')) : ''}</div>
    ${P.topHours ? box('Cuándo están conectados', `<ul class="mem-best">${P.topHours.list.map((h) => `<li>🕘 ${esc(h)}</li>`).join('')}</ul>`) : ''}`);

  // 05 · El club detrás de la cuenta
  const yr = Number((last || todayISO()).slice(0, 4)), pk = resPack(yr, null), t = pk.s.totals;
  const posted = [...postedSet()].filter((k) => k.replace(/^res\|/, '').startsWith(String(yr)));
  const nStory = posted.filter((k) => !k.startsWith('res|')).length, nRes = posted.filter((k) => k.startsWith('res|')).length;
  ch('club', 'flag', 'El club detrás de la cuenta', `Cada carrera del equipo se convierte en contenido: una historia antes de la salida y los resultados después.`,
    `<div class="rs-tiles">${tile('flag', `Carreras ${yr}`, nf(t.races), `${nf(t.participations)} participaciones`)}${tile('users', 'Corredores', nf(t.runners), 'en competición')}${tile('trophy', 'Podios', nf(t.podiums), t.wins ? `${nf(t.wins)} victorias` : '')}${tile('pin', 'Provincias', nf(pk.s.provinces.length), pk.s.countries.length > 1 ? `${pk.s.countries.length} países` : '')}${nStory ? tile('camera', 'Historias de carrera', nf(nStory), 'publicadas') : ''}${nRes ? tile('image', 'Posts de resultados', nf(nRes), 'publicados') : ''}</div>
    <p class="rp-note">Un colaborador del club aparece en todo este contenido: en el maillot de cada carrera y en las publicaciones que genera.</p>`);

  const num = (k) => String(k + 1).padStart(2, '0');
  return frame('Dossier de Instagram', `
    <div class="no-print"><div class="row-btns rp-actions"><button class="btn primary" data-act="print-report">🖨️ Imprimir o guardar PDF</button><a class="btn" href="#/instagram">‹ Instagram</a></div>
      <p class="hint">Usa el periodo elegido en Instagram (${esc((IG_PERIODS(S.year).find(([k]) => k === (S.igPeriod || 'all')) || [, 'Todo lo guardado'])[1])}). Sin nombres de usuarios: solo cifras del club.</p></div>
    <article class="report memoria dossier" data-nofold>
      <header class="mem-cover dos-cover"><img src="icons/logo.png" alt=""><p class="mem-kick">Club Ciclista Monzón · dossier para colaboradores</p><h2>Instagram</h2><p class="dos-handle">@hinacoclubciclistamonzon</p>${range ? `<p class="mem-span">${esc(range)}</p>` : ''}
        <div class="mem-cover-n">${views ? `<div><b>${kmShort(views)}</b><span>reproducciones</span></div>` : ''}${viewers ? `<div><b>${kmShort(viewers)}</b><span>${H.viewersKind === 'unique' ? 'personas' : 'alcance/día'}</span></div>` : ''}${inter ? `<div><b>${kmShort(inter)}</b><span>interacciones</span></div>` : ''}${followers ? `<div><b>${kmShort(followers)}</b><span>seguidores</span></div>` : ''}</div></header>
      ${CH.map((c, k) => `<section class="mem-ch" id="dos-${c.id}"><header class="mem-ch-h"><span class="mem-n">${num(k)}</span>${ico(c.ic)}<h2>${esc(c.title)}</h2></header>${c.lead ? `<p class="mem-lead">${c.lead}</p>` : ''}${c.body}</section>`).join('')}
      <footer class="mem-foot"><img src="icons/logo.png" alt=""><p><b>Club Ciclista Monzón</b> · @hinacoclubciclistamonzon<br>Fuente: estadísticas de Instagram de la cuenta del club, a ${dateEs(todayISO())}. El valor publicitario es una estimación (${IG_CPM} € por cada 1.000 visualizaciones).</p></footer>
    </article>`, { back: '#/instagram' });
}

// ======================================================================
//  Temporada: panel de fin de año (dirección) y memoria para sponsors
// ======================================================================

/** Cifras de una temporada ya calculadas, con la anterior para comparar. */
function seasonPack(year) {
  const s = yearSummary(year, S.data.races, S.data.runners);
  const prev = yearSummary(year - 1, S.data.races, S.data.runners);
  const hasPrev = prev.totals.races > 0;
  return { s, prev, hasPrev, year };
}
/** «▲ +4 vs 2025» (verde si sube, rojo si baja); vacío si no hay año anterior con datos. */
const seasonDelta = (pk, cur, old, fmt = (n) => n) => (!pk.hasPrev ? '' : `<em class="rp-d ${cur > old ? 'up' : cur < old ? 'down' : ''}">${cur > old ? '▲ +' : cur < old ? '▼ −' : '= '}${cur === old ? '' : fmt(Math.abs(cur - old))} vs ${pk.year - 1}</em>`);
const seasonKpis = (pk) => {
  const t = pk.s.totals, o = pk.prev.totals, k = (v, l, d = '') => `<div class="rp-kpi"><b>${v}</b><span>${l}</span>${d}</div>`;
  return `<div class="rp-kpis">
    ${k(t.races, 'carreras', seasonDelta(pk, t.races, o.races))}
    ${k(t.runners, 'corredores', seasonDelta(pk, t.runners, o.runners))}
    ${k(t.participations, 'participaciones', seasonDelta(pk, t.participations, o.participations))}
    ${k(t.podiums, 'podios', seasonDelta(pk, t.podiums, o.podiums))}
    ${k(t.wins, 'victorias', seasonDelta(pk, t.wins, o.wins))}
    ${k(t.km ? kmText(Math.round(t.km)) : '—', 'km recorridos', seasonDelta(pk, Math.round(t.km), Math.round(o.km), (n) => kmText(n)))}
    ${t.elevation || o.elevation ? k(t.elevation ? elevText(t.elevation) : '—', 'desnivel positivo', seasonDelta(pk, t.elevation, o.elevation, (n) => elevText(n))) : ''}
    ${t.travelKm || o.travelKm ? k(t.travelKm ? kmText(t.travelKm) : '—', 'de desplazamiento (aprox.)', seasonDelta(pk, t.travelKm, o.travelKm, (n) => kmText(n))) : ''}
    ${k(t.timed ? formatTime(t.time, true) : '—', 'tiempo en carrera')}</div>`;
};
const disciplineName = (x) => fullLabel(x.modality, x.subtype);
/** Filas de un grupo (de modalidades o de disciplinas): barra de color, carreras, participaciones, corredores y podios. */
const statRows = (list, { cost = false, byMod = false } = {}) => {
  const mx = Math.max(1, ...list.map((x) => x.races));
  const xtra = (x) => [x.elevation ? `${ico('mountain')}${elevText(x.elevation)}${x.avgElev ? ` · media ${elevText(x.avgElev)}` : ''}` : '', x.trip ? `${ico('compass')}${kmText(x.trip)} de viaje` : '', cost && x.avgPrice ? `${ico('euro')}inscripción media ${euros(x.avgPrice)}` : '',
    cost && byMod && x.cost ? `${ico('money')}${euros(Math.round(x.cost))} en inscripciones` : ''].filter(Boolean);
  return `<ul class="tp-disc${byMod ? ' md-mod' : ''}">${list.map((x) => `<li class="${byMod ? modClass(x.modality) : discClass(x.modality, x.subtype)}"><i class="tp-dot"></i><b>${esc(byMod ? x.modality : x.label || subLabel(x.modality, x.subtype))}</b>
    <span class="tp-track"><i style="width:${(x.races / mx) * 100}%"></i></span>
    <span class="tp-n"><b>${x.races}</b> carr.</span><span class="tp-n">${x.participations} part.</span><span class="tp-n">${x.runners} corr.</span><span class="tp-n tp-pod">🏆 ${x.podiums}${x.wins ? ` · 🥇 ${x.wins}` : ''}</span>${xtra(x).length ? `<span class="tp-xtra">${xtra(x).map((t) => `<i>${t}</i>`).join('')}</span>` : ''}</li>`).join('') || '<li class="muted">Sin carreras este año.</li>'}</ul>`;
};
/** Nivel 1: las modalidades (BTT, Carretera, Gravel…), una barra repartida y sus cifras. Las disciplinas NO salen aquí: cuelgan de cada modalidad. */
const modalityOverview = (pk, opts = {}) => {
  const tree = modalityTree(pk.s), tot = tree.reduce((n, m) => n + m.races, 0) || 1;
  return `${tree.length ? `<div class="rs-stack">${tree.map((m) => `<span class="${modClass(m.modality)}" style="flex:${m.races}" title="${esc(m.modality)}: ${m.races}">${m.races / tot > 0.08 ? m.races : ''}</span>`).join('')}</div>` : ''}${statRows(tree, { ...opts, byMod: true })}`;
};
/** Nivel 2: una por modalidad con formatos, con sus disciplinas dentro (BTT → XCO, XCM, Rally…; Carretera → Critérium, Ciclodeportiva…). */
const disciplineBlocks = (pk, opts = {}) => modalityTree(pk.s).filter((m) => m.children.length).map((m) => {
  const tot = m.children.reduce((n, d) => n + d.races, 0) || 1;
  return { modality: m.modality, html: `<div class="rs-stack">${m.children.map((d) => `<span class="${discClass(d.modality, d.subtype)}" style="flex:${d.races}" title="${esc(d.label)}: ${d.races}">${d.races / tot > 0.08 ? d.races : ''}</span>`).join('')}</div>${statRows(m.children, opts)}` };
});
/** Leyenda agrupada: cada modalidad con sus disciplinas debajo, nunca todas mezcladas al mismo nivel. */
const discLegend = (disciplines, counts = false) => {
  const g = new Map(); for (const d of disciplines) (g.get(d.modality) || g.set(d.modality, []).get(d.modality)).push(d);
  return `<div class="dl-groups">${[...g].map(([m, list]) => `<span class="dl-g"><b class="${modClass(m)}"><i class="dot"></i>${esc(m)}${counts ? ` <em>${list.reduce((n, d) => n + d.races, 0)}</em>` : ''}</b>${SUBTYPES[m] ? list.map((d) => `<span class="${discClass(d.modality, d.subtype)}"><i class="dot"></i>${esc(subLabel(m, d.subtype))}${counts ? ` <em>${d.races}</em>` : ''}</span>`).join('') : ''}</span>`).join('')}</div>`;
};
/** Podios por categoría y por disciplina (tablas cortas con medallas). */
const seasonPodiums = (pk) => {
  const pl = pk.s.podiumList, medalsOf = (l) => [1, 2, 3].map((k) => l.filter((x) => x.position === k).length);
  const group = (keyFn) => { const g = new Map(); for (const x of pl) { const k = keyFn(x); (g.get(k) || g.set(k, []).get(k)).push(x); } return [...g].map(([k, list]) => ({ k, list, m: medalsOf(list) })).sort((a, b) => b.list.length - a.list.length || b.m[0] - a.m[0]); };
  const tbl = (rows, lab) => `<table class="tp-table"><thead><tr><th>${lab}</th><th>🥇</th><th>🥈</th><th>🥉</th><th>Total</th></tr></thead><tbody>${rows.map((g) => `<tr><td>${g.label}</td><td>${g.m[0]}</td><td>${g.m[1]}</td><td>${g.m[2]}</td><td><b>${g.list.length}</b></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin podios</td></tr>'}</tbody></table>`;
  const cat = group((x) => x.category || 'Sin categoría').map((g) => ({ ...g, label: esc(g.k) }));
  // por modalidad y, dentro, por disciplina (la fila de la modalidad suma las de sus disciplinas)
  const sum = (list) => ({ list, m: medalsOf(list) });
  const discRows = [];
  for (const [m, mlist] of [...pl.reduce((g, x) => (g.get(x.modality) || g.set(x.modality, []).get(x.modality)).push(x) && g, new Map())].sort((a, b) => b[1].length - a[1].length)) {
    discRows.push({ ...sum(mlist), label: `<b>${esc(m)}</b>`, cls: 'tp-mod' });
    if (SUBTYPES[m]) {
      const g = new Map(); for (const x of mlist) (g.get(x.subtype || '') || g.set(x.subtype || '', []).get(x.subtype || '')).push(x);
      for (const [sub, l] of [...g].sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || b[1].length - a[1].length)) discRows.push({ ...sum(l), label: esc(subLabel(m, sub)), cls: 'tp-sub' });
    }
  }
  const tblD = (rows) => `<table class="tp-table"><thead><tr><th>Modalidad y disciplina</th><th>🥇</th><th>🥈</th><th>🥉</th><th>Total</th></tr></thead><tbody>${rows.map((g) => `<tr class="${g.cls}"><td>${g.label}</td><td>${g.m[0]}</td><td>${g.m[1]}</td><td>${g.m[2]}</td><td><b>${g.list.length}</b></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin podios este año.</td></tr>'}</tbody></table>`;
  return `<div class="tp-two"><div><h3>Por categoría</h3>${tbl(cat, 'Categoría')}</div><div><h3>Por modalidad y disciplina</h3>${tblD(discRows)}</div></div>
    <p class="hint">El puesto es el de la categoría del corredor (un 1º de M40 es el primero entre los M40).</p>`;
};
/** Récords del equipo (quién lidera cada cosa). */
const seasonRecords = (pk) => {
  const s = pk.s, people = s.perRunner, who = (score) => { const top = Math.max(0, ...people.map(score)); return top ? { top, names: people.filter((r) => score(r) === top).map((r) => r.name) } : null; };
  const row = (label, w, fmt) => (w ? `<tr><td>${label}</td><td><b>${esc(w.names.slice(0, 3).join(', '))}${w.names.length > 3 ? ` y ${w.names.length - 3} más` : ''}</b></td><td>${fmt(w.top)}</td></tr>` : '');
  const L = s.longest;
  return `<table class="tp-table"><tbody>
    ${row('Más carreras', who((r) => r.races), (n) => `${n}`)}${row('Más podios', who((r) => r.p1 + r.p2 + r.p3), (n) => `${n}`)}${row('Más victorias', who((r) => r.p1), (n) => `${n}`)}
    ${L ? `<tr><td>Carrera más larga</td><td><b>${esc(L.race)}</b></td><td>${esc(kmText(L.km))}</td></tr>` : ''}
    ${s.longestTime ? `<tr><td>Carrera que más horas costó</td><td><b>${esc(s.longestTime.race)}</b> <small class="muted">${esc(s.longestTime.runner)}</small></td><td>${esc(formatTime(s.longestTime.seconds, true))}</td></tr>` : ''}
    ${s.hardest ? `<tr><td>Carrera más dura (desnivel)</td><td><b>${esc(s.hardest.race)}</b></td><td>${esc(elevText(s.hardest.elevation))}</td></tr>` : ''}
    ${s.steepest && s.steepest.race !== s.hardest?.race ? `<tr><td>Carrera más empinada</td><td><b>${esc(s.steepest.race)}</b></td><td>${Math.round(s.steepest.value)} m/km</td></tr>` : ''}
    ${row('Más metros de subida', who((r) => r.elev), (n) => elevText(n))}
    ${s.farthest ? `<tr><td>Carrera más lejana</td><td><b>${esc(s.farthest.race)}</b></td><td>${esc(kmText(s.farthest.value))}</td></tr>` : ''}
    ${row('Más desplazamientos', who((r) => r.trip), (n) => kmText(n))}
    ${row('Más kilómetros', who((r) => r.km), (n) => kmText(n))}${row('Más tiempo en carrera', who((r) => r.time), (n) => formatTime(n, true))}
    ${row('Más km por día de competición', who((r) => (r.kmDays ? Math.round((r.km / r.kmDays) * 10) / 10 : 0)), (n) => perDayText(n))}${row('Más rápido (km/h)', who((r) => (r.secTimed ? Math.round((r.kmTimed / (r.secTimed / 3600)) * 10) / 10 : 0)), (n) => speedText(n))}
    ${row('Carreras más largas (media de km)', who((r) => (r.kmRaces ? Math.round(r.km / r.kmRaces) : 0)), (n) => kmText(n))}${row('Aprovecha más el viaje (km de carrera por km de viaje)', who((r) => (r.tripBoth ? Math.round((r.kmBoth / r.tripBoth) * 100) / 100 : 0)), (n) => ratioX(n))}
    ${row('Más versátil (disciplinas distintas)', who((r) => Object.keys(r.discs || {}).length), (n) => `${n}`)}${row('Más constante (meses con carrera)', who((r) => r.months?.size || 0), (n) => `${n}`)}
    </tbody></table>`;
};
/** Metros de subida (de todos los participantes) mes a mes. */
const seasonElevMonths = (pk) => {
  const m = pk.s.byMonth, mx = Math.max(1, ...m.map((x) => x.elev));
  return `<div class="rs-wk rs-elev" role="img" aria-label="Desnivel positivo de cada mes">${m.map((x) => `<div><em>${x.elev ? (x.elev >= 1000 ? `${(x.elev / 1000).toFixed(1).replace('.', ',')}k` : x.elev) : ''}</em><span style="height:${(x.elev / mx) * 100}%"></span><b>${MES3[x.month].slice(0, 1).toUpperCase()}</b></div>`).join('')}</div>`;
};
/** Dónde se ha competido: provincias y países. */
const seasonReach = (pk) => {
  const pr = pk.s.provinces.slice(0, 10), co = pk.s.countries.slice(0, 6);
  const chips = (rows) => rows.map((c) => `<span class="tp-chip">${esc(c.name)} <b>${c.races}</b></span>`).join('') || '<span class="muted">—</span>';
  return `<div class="tp-two"><div><h3>Provincias (${pk.s.provinces.length})</h3><div class="tp-chips">${chips(pr)}</div></div><div><h3>Países (${pk.s.countries.length})</h3><div class="tp-chips">${chips(co)}</div></div></div>`;
};
/** Carreras por mes, con el color de cada disciplina. */
const seasonMonths = (pk) => {
  const s = pk.s, mx = Math.max(1, ...s.byMonth.map((m) => m.total)), MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const order = (k) => s.disciplines.findIndex((d) => d.key === k);
  return `<div class="mchart tp-months" role="img" aria-label="Carreras por mes">${s.byMonth.map((m) => `<div class="mc${m.total ? '' : ' none'}"><div class="mc-area"><em>${m.total || ''}</em>
    <div class="mc-stack" style="height:${m.total ? (m.total / mx) * 100 : 0}%">${Object.entries(m.discs).sort(([x], [y]) => order(y) - order(x)).map(([k, n]) => { const [dm, ds] = k.split('|');
      return `<span class="${discClass(dm, ds)}" style="flex:${n}" title="${esc(discLabel(dm, ds))}: ${n}"></span>`; }).join('')}</div></div><b>${MES[m.month]}</b></div>`).join('')}</div>`;
};
/** Filas de la tabla de corredores del año (con las columnas de cada disciplina para el Excel). */
function seasonRunnerRows(pk) {
  return pk.s.perRunner.filter((r) => r.races > 0).map((r) => {
    const rn = S.data.runners.find((x) => x.id === r.key);
    return { ...r, cat: rn?.category || '', contract: rn?.contract ? contractLabel(rn.contract) : '', nd: Object.keys(r.discs || {}).length, nm: r.months?.size || 0, pod: r.p1 + r.p2 + r.p3 };
  });
}
const TP_COLS = [['name', 'Corredor', 'text'], ['races', 'Carr.'], ['km', 'Km'], ['elev', 'Desn.'], ['trip', 'Viaje'], ['cost', '€ insc.'], ['time', 'Tiempo'], ['nd', 'Disc.'], ['p1', '🥇'], ['p2', '🥈'], ['p3', '🥉'], ['nm', 'Meses']];
/** €/km del kilometraje exento en España: solo para estimar lo que cuesta ir a las carreras. */
const KM_EUR = 0.26;
const nfEs = (n) => Number(n || 0).toLocaleString('de-DE');   // 2.552 (el «es-ES» no pone el punto en 4 cifras)
/** Memoria para sponsors: un informe único, capítulo tras capítulo, con todas las cifras de la temporada (sin bonos, contratos ni datos personales). */
function viewMemoria() {
  const years = availableYears(S.data.races);
  if (!years.includes(S.year)) S.year = years[0];
  if (!S.ig) loadIg();
  const year = S.year, pk = resPack(year, null), s = pk.s, t = s.totals, i = pk.ins, cal = i.cal;
  const plural = (n, a, b = `${a}s`) => `${nfEs(n)} ${n === 1 ? a : b}`;
  const tile = (ic, label, val, sub = '') => `<div class="rs-tile">${ico(ic)}<small>${label}</small><b>${val}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
  const box = (title, html) => (html ? `<div class="mem-box">${title ? `<h3>${title}</h3>` : ''}${html}</div>` : '');
  const rank = (rows, key, fmt, n = 5) => { const l = rows.filter((r) => r[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, n), mx = Math.max(1, ...l.map((r) => r[key]));
    return l.length ? `<ol class="rs-rank">${l.map((r, k) => `<li><span class="pos">${k + 1}</span><div><b>${esc(r.name)}</b>${bar((r[key] / mx) * 100)}</div><span class="rk-m">${fmt(r[key])}</span></li>`).join('')}</ol>` : ''; };
  // ---- datos por carrera (para la tabla completa y los destacados)
  const podBy = new Map(); for (const p of s.podiumList) (podBy.get(p.raceId) || podBy.set(p.raceId, []).get(p.raceId)).push(p);
  const races = [...cal].sort((a, b) => a.date.localeCompare(b.date));
  const crowd = [...cal].sort((a, b) => b.n - a.n)[0];
  const tripOne = Math.round(cal.reduce((n, r) => n + (r.dist != null ? 2 * r.dist : 0), 0));   // un coche por carrera
  const span = i.first && i.last ? `${formatDate(i.first, false)} – ${formatDate(i.last, false)}` : '';
  // ---- capítulos
  const CH = [];
  const ch = (id, ic, title, lead, body) => { if (body) CH.push({ id, ic, title, lead, body }); };

  ch('cifras', 'bars', 'La temporada en cifras',
    `${year}: <b>${plural(t.races, 'carrera')}</b>${i.days > t.races ? ` (${i.days} días de competición)` : ''}, <b>${plural(t.runners, 'corredor', 'corredores')}</b> del club y <b>${plural(t.participations, 'participación', 'participaciones')}</b>. <b>${plural(t.podiums, 'podio')}</b>${t.wins ? `, ${plural(t.wins, 'victoria')}` : ''}.`,
    `${seasonKpis(pk)}${pk.hasPrev ? box(`Frente a ${year - 1}`, resCompare(pk)) : ''}`);

  const best = [
    t.wins ? `🥇 <b>${plural(t.wins, 'victoria')}</b> y ${plural(t.podiums, 'podio')} (${i.podiumRate} % de las participaciones)` : t.podiums ? `🏆 <b>${plural(t.podiums, 'podio')}</b>` : '',
    crowd?.n ? `👥 La carrera con más gente del club: <b>${esc(crowd.name)}</b> (${crowd.n} corredores)` : '',
    s.longest ? `📏 La más larga: <b>${esc(s.longest.race)}</b> (${esc(kmText(s.longest.km))})` : '',
    s.hardest ? `⛰️ La más dura: <b>${esc(s.hardest.race)}</b> (${esc(elevText(s.hardest.elevation))})` : '',
    s.farthest ? `🧭 La más lejana: <b>${esc(s.farthest.race)}</b> (${esc(kmText(s.farthest.value))} de ida)` : '',
    s.longestTime ? `⏱️ La que más horas costó: <b>${esc(s.longestTime.race)}</b> (${esc(formatTime(s.longestTime.seconds, true))})` : '',
    i.bestMonth ? `📅 El mes más intenso: <b>${cap1(MONTH_NAMES[i.bestMonth.month])}</b> (${plural(i.bestMonth.total, 'carrera')})` : '',
    s.provinces.length ? `📍 <b>${plural(s.provinces.length, 'provincia')}</b>${s.countries.length > 1 ? ` y ${plural(s.countries.length, 'país', 'países')}` : ''}` : '',
  ].filter(Boolean);
  ch('destacados', 'star', 'Lo más destacado', '', best.length ? `<ul class="mem-best">${best.map((x) => `<li>${x}</li>`).join('')}</ul>` : '');

  // Equipo y participación (sin contratos ni bonos)
  const pct = pctOf(i.activeCount, i.rosterSize), hmx = Math.max(1, ...i.hist.map((h) => h.runners));
  const cats = s.byCategory.filter((c) => c.participations);
  const catTbl = cats.length ? `<div class="tp-scroll"><table class="tp-table"><thead><tr><th class="l">Categoría</th><th>Corredores</th><th>Particip.</th><th>🥇</th><th>🥈</th><th>🥉</th></tr></thead><tbody>${cats.map((c) => `<tr><td class="l"><b>${esc(c.category || 'Sin categoría')}</b></td><td>${c.runners}</td><td>${c.participations}</td><td>${c.p1 || ''}</td><td>${c.p2 || ''}</td><td>${c.p3 || ''}</td></tr>`).join('')}</tbody></table></div>` : '';
  const rows = seasonRunnerRows(pk).sort((a, b) => b.races - a.races || b.pod - a.pod || a.name.localeCompare(b.name, 'es'));
  const cols = [['races', 'Carr.', (n) => n], ['km', 'Km', (n) => (n ? nfEs(Math.round(n)) : '')], ['elev', 'Desn. m', (n) => (n ? nfEs(n) : '')], ['trip', 'Viaje km', (n) => (n ? nfEs(Math.round(n)) : '')], ['time', 'Tiempo', (n) => (n ? formatTime(n, true) : '')], ['nd', 'Disc.', (n) => n || ''], ['p1', '🥇', (n) => n || ''], ['p2', '🥈', (n) => n || ''], ['p3', '🥉', (n) => n || '']];
  const runTbl = rows.length ? `<div class="tp-scroll"><table class="tp-table mem-runners"><thead><tr><th class="l">#</th><th class="l">Corredor</th>${cols.map(([, l]) => `<th class="num">${l}</th>`).join('')}</tr></thead><tbody>${rows.map((r, k) => `<tr><td class="l muted">${k + 1}</td><td class="l"><b>${esc(r.name)}</b>${r.cat ? ` <small class="muted">${esc(r.cat)}</small>` : ''}</td>${cols.map(([key, , f]) => `<td class="num">${f(r[key])}</td>`).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr><td></td><td class="l"><b>Equipo</b></td><td class="num"><b>${t.participations}</b></td><td class="num"><b>${t.km ? nfEs(Math.round(t.km)) : ''}</b></td><td class="num"><b>${t.elevation ? nfEs(rows.reduce((n, r) => n + r.elev, 0)) : ''}</b></td><td class="num"><b>${t.travelKm ? nfEs(Math.round(t.travelKm)) : ''}</b></td><td class="num"><b>${t.timed ? formatTime(t.time, true) : ''}</b></td><td></td><td class="num"><b>${s.podiumList.filter((p) => p.position === 1).length || ''}</b></td><td class="num"><b>${s.podiumList.filter((p) => p.position === 2).length || ''}</b></td><td class="num"><b>${s.podiumList.filter((p) => p.position === 3).length || ''}</b></td></tr></tfoot></table></div>` : '';
  ch('equipo', 'users', 'El equipo',
    `<b>${i.activeCount} de ${i.rosterSize}</b> corredores de la plantilla han competido (${pct} %). De media, <b>${String(i.avgPart).replace('.', ',')}</b> corredores del club en cada carrera.`,
    `<div class="mem-two">${box('Participación', `<div class="rs-part"><div class="ring" style="--p:${pct}"><b>${pct}%</b></div><div><p><b>${plural(t.participations, 'participación', 'participaciones')}</b> en ${plural(t.races, 'carrera')}.</p><p class="muted small">${plural(i.activeCount, 'corredor', 'corredores')} en activo.</p></div></div>`)}
      ${box('Carreras por corredor', `<div class="rs-hist">${i.hist.map((h) => `<div><em>${h.runners || ''}</em><span style="height:${(h.runners / hmx) * 100}%"></span><b>${h.label}</b></div>`).join('')}</div><p class="rp-note">Cuántos corredores han hecho 1, 2–3, 4–6… carreras.</p>`)}</div>
    ${box('Por categoría', catTbl)}${box(`Todos los corredores (${rows.length})`, runTbl)}`);

  // Calendario
  ch('calendario', 'cal', 'Calendario y ritmo',
    `${span ? `De ${esc(span)}. ` : ''}${i.multiDay ? `${plural(i.multiDay, 'prueba', 'pruebas')} de varios días. ` : ''}${i.bestMonth ? `El mes con más carreras fue ${MONTH_NAMES[i.bestMonth.month]}.` : ''}`,
    `${box('Carreras por mes', seasonMonths(pk))}${box(`Ritmo del año${pk.hasPrev ? ` frente a ${year - 1}` : ''}`, resPace(pk))}${box('Calendario', resHeat(pk))}${box('Día de la semana', resWeekdays(pk))}`);

  // Disciplinas
  const blocks = disciplineBlocks(pk, { cost: false });
  ch('disciplinas', 'layers', 'Modalidades y disciplinas',
    `${plural(s.byModality.filter((m) => m.races).length, 'modalidad', 'modalidades')} y ${plural(s.disciplines.length, 'disciplina')} distintas.`,
    `${box('Por modalidad', modalityOverview(pk))}${blocks.map((b) => box(`${esc(b.modality)}: por disciplina`, b.html)).join('')}`);

  // Resultados
  const n = (k) => s.podiumList.filter((x) => x.position === k).length;
  const medals = `<div class="rs-medals"><div class="m1"><b>${n(1)}</b><span>🥇 Oros</span></div><div class="m2"><b>${n(2)}</b><span>🥈 Platas</span></div><div class="m3"><b>${n(3)}</b><span>🥉 Bronces</span></div></div>`;
  const hunters = s.perRunner.map((r) => ({ ...r, pod: r.p1 + r.p2 + r.p3 })).filter((r) => r.pod);
  const podRaces = races.filter((r) => podBy.has(r.id)).reverse();
  const podList = podRaces.length ? `<ul class="mem-pods">${podRaces.map((r) => `<li><span class="mp-d">${esc(formatDate(r.date, false))}</span><b>${esc(r.name)}</b><span class="mp-w">${podBy.get(r.id).sort((a, b) => a.position - b.position).map((p) => `${medal(p.position)} ${esc(p.runner)}${p.category ? ` <small class="muted">${esc(p.category)}</small>` : ''}${p.stage ? ` <small class="muted">(${esc(p.stage)})</small>` : ''}`).join(' · ')}</span></li>`).join('')}</ul>` : '';
  ch('resultados', 'trophy', 'Resultados',
    t.podiums ? `<b>${plural(t.podiums, 'podio')}</b> en ${plural(podRaces.length, 'carrera')}: ${i.podiumRate} % de las participaciones acaban en el podio.` : 'Esta temporada todavía no hay podios.',
    t.podiums ? `${medals}<div class="mem-two">${box('Los que más suben al podio', rank(hunters, 'pod', (v) => v, 8))}${box('Récords del equipo', seasonRecords(pk).replace('class="tp-table"', 'class="tp-table mem-rec"'))}</div>${box('Por categoría y disciplina', seasonPodiums(pk))}${box(`Todos los podios (${podRaces.length} carreras)`, podList)}` : box('Récords del equipo', seasonRecords(pk).replace('class="tp-table"', 'class="tp-table mem-rec"')));

  // Dónde
  ch('lugares', 'pin', 'Dónde hemos competido',
    `${plural(s.provinces.length, 'provincia')}${s.countries.length ? ` y ${plural(s.countries.length, 'país', 'países')}` : ''}.`,
    `<div class="mem-two">${box('', placeDonut(s.provinces, { title: 'Provincias', max: 6 }))}${s.countries.length > 1 ? box('', placeDonut(s.countries, { title: 'Países', max: 5 })) : ''}</div>${box('Mapa de desplazamientos', resTripMap(pk))}`);

  // Desplazamientos
  ch('viajes', 'compass', 'Desplazamientos',
    t.travelKm ? `Los corredores han recorrido unos <b>${esc(kmText(Math.round(t.travelKm)))}</b> para ir a las carreras (ida y vuelta)${tripOne ? `; como club, a razón de un viaje por carrera, <b>${esc(kmText(tripOne))}</b>` : ''}.` : '',
    box('', resTravel(pk)));

  // Km, tiempo y desnivel
  const pr = s.perRunner;
  ch('kilometros', 'ruler', 'Kilómetros, tiempo y desnivel',
    `${t.km ? `<b>${esc(kmText(Math.round(t.km)))}</b> de competición entre todos` : ''}${t.elevation ? ` · <b>${esc(elevText(t.elevation))}</b> de subida` : ''}${t.timed ? ` · <b>${esc(formatTime(t.time, true))}</b> en carrera` : ''}.`,
    `<div class="rs-tiles">
      ${tile('ruler', 'Km recorridos', t.km ? esc(kmText(Math.round(t.km))) : '—', 'entre todos')}
      ${tile('flag', 'Km por carrera', i.avgRaceKm ? esc(kmText(i.avgRaceKm)) : '—', `${i.withKm} de ${t.races} con km`)}
      ${tile('timer', 'Velocidad media', t.secTimed ? esc(speedText(t.kmTimed / (t.secTimed / 3600))) : '—', 'en carrera')}
      ${tile('clock', 'Tiempo total', t.timed ? esc(formatTime(t.time, true)) : '—', `${t.timed} de ${t.participations} con tiempo`)}
      ${tile('mountain', 'Desnivel positivo', t.elevation ? esc(elevText(t.elevation)) : '—', 'entre todos')}
      ${tile('mountain', 'Subida por km', i.climb ? `${String(i.climb).replace('.', ',')} m` : '—', 'de media')}</div>
    ${t.km ? box('Km del equipo, mes a mes', monthBars(pk, 'km', (v) => kmShort(v))) : ''}
    ${t.elevation ? box('Metros de subida, mes a mes', seasonElevMonths(pk)) : ''}
    ${t.timed ? box('Horas de carrera, mes a mes', monthBars(pk, 'time', (v) => `${Math.round(v / 3600)}h`)) : ''}
    <div class="mem-two">${box('Quién ha recorrido más', rank(pr, 'km', (v) => esc(kmText(Math.round(v)))))}${box('Quién ha subido más', rank(pr, 'elev', (v) => esc(elevText(v))))}${box('Más tiempo en carrera', rank(pr, 'time', (v) => formatTime(v, true)))}${box('Las carreras más duras', cal.some((r) => r.elevation) ? resHardest(pk) : '')}</div>
    ${cal.filter((r) => r.km && r.elevation).length > 1 ? box('Km frente a desnivel', resScatter(pk)) : ''}`);

  // Coste
  const tripCostLo = Math.round(tripOne * KM_EUR), tripCostHi = Math.round(t.travelKm * KM_EUR);
  ch('coste', 'money', 'Lo que cuesta competir',
    t.cost || tripOne ? `Inscripciones: <b>${esc(euros(Math.round(t.cost)))}</b>${tripOne ? ` · desplazamientos (estimado): <b>${esc(euros(tripCostLo))} – ${esc(euros(tripCostHi))}</b>` : ''}.` : '',
    `${t.pricedRaces ? box('Inscripciones', resCost(pk)) : ''}${tripOne ? box('Desplazamientos (estimación)', `<div class="rs-money"><div><small>Un coche por carrera</small><b>${esc(euros(tripCostLo))}</b></div><div><small>Cada corredor en su coche</small><b>${esc(euros(tripCostHi))}</b></div><div><small>Total con inscripciones</small><b>${esc(euros(Math.round(t.cost) + tripCostLo))} – ${esc(euros(Math.round(t.cost) + tripCostHi))}</b></div></div>
      <p class="rp-note">A ${String(KM_EUR).replace('.', ',')} €/km (kilometraje exento) sobre los km de ida y vuelta estimados. El gasto real queda entre los dos extremos según cuántos compartan coche.</p>`) : ''}`);

  // Todas las carreras
  const raceTbl = races.length ? `<div class="tp-scroll"><table class="tp-table mem-races"><thead><tr><th class="l">Fecha</th><th class="l">Carrera</th><th class="num">Club</th><th class="num">Km</th><th class="num">Desn.</th><th class="l">Podios</th></tr></thead><tbody>${races.map((r) => { const pd = podBy.get(r.id) || [];
    return `<tr><td class="l nw">${Number(r.date.slice(8))} ${MES3[Number(r.date.slice(5, 7)) - 1]}</td><td class="l"><b>${esc(r.name)}</b><small class="muted mr-sub">${esc(discLabel(r.modality, r.subtype))}${r.place ? ` · ${esc(r.place)}` : ''}</small></td><td class="num">${r.n || ''}</td><td class="num">${r.km ? nfEs(r.km) : ''}</td><td class="num">${r.elevation ? nfEs(r.elevation) : ''}</td><td class="l nw">${[1, 2, 3].map((k) => { const c = pd.filter((p) => p.position === k).length; return c ? `${medal(k)}${c > 1 ? `×${c}` : ''}` : ''; }).join(' ')}</td></tr>`; }).join('')}</tbody></table></div>` : '';
  ch('carreras', 'list', 'Todas las carreras', `Las ${plural(races.length, 'carrera')} de ${year}, una a una, con los corredores del club que fueron.`, raceTbl);

  // Redes
  const igOk = S.ig?.rows, g = igOk ? igSummary(S.ig.rows, `${year}-01-01`, `${year}-12-31`) : null, acc = g?.account, it = g?.totals;
  const nf2 = (v) => (v == null ? '—' : nfEs(v));
  if (g && (g.nDays || acc)) ch('redes', 'image', 'Presencia en redes', `Instagram @hinacoclubciclistamonzon${g.nDays ? ` · ${g.nDays} días de datos en ${year}` : ''}.`,
    `<div class="rp-kpis">${acc ? `<div class="rp-kpi"><b>${nf2(acc.followers)}</b><span>seguidores</span></div>` : ''}${g.nDays ? `<div class="rp-kpi"><b>${nf2(it.views)}</b><span>visualizaciones</span></div><div class="rp-kpi"><b>${nf2(it.interactions)}</b><span>interacciones</span></div>` : ''}${g.nDays && it.reachAvg ? `<div class="rp-kpi"><b>${nf2(it.reachAvg)}</b><span>alcance medio diario</span></div>` : ''}</div>`);

  const num = (k) => String(k + 1).padStart(2, '0');
  return frame('Memoria de la temporada', `
    <div class="no-print">${yearPicker(years)}<div class="row-btns rp-actions"><button class="btn primary" data-act="print-report">🖨️ Imprimir o guardar PDF</button><a class="btn" href="#/resumen">‹ Resumen</a></div></div>
    <article class="report memoria" data-nofold>
      <header class="mem-cover"><img src="icons/logo.png" alt=""><p class="mem-kick">Club Ciclista Monzón · equipo de competición</p><h2>Memoria de la temporada ${year}</h2>${span ? `<p class="mem-span">${esc(span)}</p>` : ''}
        <div class="mem-cover-n"><div><b>${t.races}</b><span>carreras</span></div><div><b>${t.runners}</b><span>corredores</span></div><div><b>${t.podiums}</b><span>podios</span></div><div><b>${t.km ? kmShort(t.km) : '—'}</b><span>km</span></div></div></header>
      <nav class="mem-toc no-print-links" aria-label="Índice"><h3>Índice</h3><ol>${CH.map((c, k) => `<li><a href="#" data-act="goto-sec" data-to="mem-${c.id}"><span>${num(k)}</span>${esc(c.title)}</a></li>`).join('')}</ol></nav>
      ${CH.map((c, k) => `<section class="mem-ch" id="mem-${c.id}"><header class="mem-ch-h"><span class="mem-n">${num(k)}</span>${ico(c.ic)}<h2>${esc(c.title)}</h2></header>${c.lead ? `<p class="mem-lead">${c.lead}</p>` : ''}${c.body}</section>`).join('')}
      <footer class="mem-foot"><img src="icons/logo.png" alt=""><p><b>Club Ciclista Monzón</b> · Memoria ${year}<br>Datos del club a ${dateEs(todayISO())}. Desplazamientos y costes de viaje son estimaciones.</p></footer>
    </article>`, { back: '#/resumen' });
}


// ======================================================================
//  Ubicación de las carreras (desplazamientos): la dirección busca sola las poblaciones que no están en el listado de la app
// ======================================================================

const GEO_MISS_KEY = 'monzon-geo-miss';
/** Busca una población en Open-Meteo (sin clave) y devuelve la que mejor encaja con su provincia y país, o null. */
async function geocodePlace(place, province, country) {
  const name = String(place).replace(/\(.*?\)/g, '').split(/[,;/]/)[0].trim();
  if (name.length < 2) return null;
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=8&language=es&format=json`);
  if (!res.ok) throw new Error('geocodificador');
  return pickGeocode((await res.json()).results, province, country);
}
/** Las carreras cuya población no está en el listado (y no tienen ya coordenadas guardadas) son las que hay que buscar. */
function geoPending() {
  let miss = {}; try { miss = JSON.parse(store.get(GEO_MISS_KEY) || '{}'); } catch { miss = {}; }
  const out = [];
  for (const [kind, list] of [['race', S.data?.races || []], ['reg', S.data?.registrations || []]]) for (const r of list) {
    if (!cleanName(r.place) || (r.lat != null && r.geo_key === geoKey(r))) continue;
    if (placeCoords(r.place, '')?.src === 'town') continue;
    if (miss[geoKey(r)]) continue;
    out.push({ kind, r });
  }
  return out;
}
let geoBusy = false;
async function geocodeMissing(max = 12) {
  if (geoBusy || !S.session?.isAdmin || !S.data || api.mode === 'demo' || !navigator.onLine) return;
  const todo = geoPending().slice(0, max);
  if (!todo.length) return;
  geoBusy = true;
  let miss = {}; try { miss = JSON.parse(store.get(GEO_MISS_KEY) || '{}'); } catch { miss = {}; }
  let found = 0;
  try {
    for (const { kind, r } of todo) {
      const key = geoKey(r);
      if (r.lat != null && r.geo_key === key) continue;
      try {
        const c = await geocodePlace(r.place, r.province, r.country);
        if (c) { const geo = { ...c, geo_key: key }; await api.saveGeo(kind, r.id, geo); Object.assign(r, geo); found++; } else miss[key] = Date.now();
      } catch { break; }   // sin conexión o servicio caído: se reintenta otro día
      await new Promise((ok) => setTimeout(ok, 300));
    }
  } finally {
    store.set(GEO_MISS_KEY, JSON.stringify(miss)); geoBusy = false;
  }
  if (found && ['resumen', 'temporada', 'calidad', 'memoria'].includes(parseRoute().view)) render();
}

// ======================================================================
//  Resumen de la dirección: panel de temporada en cuatro pestañas
//  Panorama · Podios · Equipo · Alcance (todo filtrable por modalidad y con el año anterior al lado)
// ======================================================================

/** ¿Mira la dirección (con enlaces a fichas) o un corredor (o la vista previa de uno)? */
const viewerIsAdmin = () => !!S.session?.isAdmin && !S.preview;
const raceHref = (id) => (viewerIsAdmin() ? `#/carreras/${id}` : `${runnerHref('carrera')}/race_${id}`);
/** Nombre de un corredor en un ranking: la dirección va a su ficha; un corredor abre «dónde ha participado» (si es de la plantilla). */
const mateIds = () => new Set([...teamRoster().map((x) => x.id), S.runnerData?.me?.id].filter(Boolean));
const personTag = (key, name) => (viewerIsAdmin() ? `<a href="#/corredor/${esc(key)}"><b>${esc(name)}</b></a>`
  : S.runnerData && mateIds().has(key) ? `<button type="button" class="mate-link" data-act="mate-open" data-id="${esc(key)}" aria-label="Ver en qué carreras ha participado ${esc(name)}"><b>${esc(name)}</b></button>` : `<b>${esc(name)}</b>`);
const RES_TABS = [['pan', 'Panorama', 'bars'], ['pod', 'Podios', 'trophy'], ['eq', 'Equipo', 'users'], ['alc', 'Alcance', 'flag']];
const cap1 = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);
const pctOf = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const bar = (pct, cls = '') => `<span class="rs-bar ${cls}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span>`;
/** «▲ 4» o «▼ 2» (sobre fondo claro u oscuro) frente al año anterior; vacío si no hay año anterior. */
const rsDelta = (pk, cur, old, fmt = (n) => n) => (!pk.hasPrev || (cur === 0 && old === 0) ? '' : `<em class="rs-d ${cur > old ? 'up' : cur < old ? 'down' : ''}" title="frente a ${pk.year - 1}">${cur > old ? '▲' : cur < old ? '▼' : '='}${cur === old ? '' : ' ' + fmt(Math.abs(cur - old))}</em>`);

function resPack(year, mod, src = null) {
  const base = src || { races: S.data.races, runners: S.data.runners, registrations: S.data.registrations };
  const keep = (r) => !mod || (mod.includes('|') ? disciplineKey(r.modality, r.subtype) === mod : r.modality === mod);   // modalidad («BTT») o, en la pantalla del corredor, disciplina («BTT|XCO»)
  const races = base.races.filter(keep), regs = base.registrations.filter(keep);
  const ins = yearInsights(year, races, base.runners, regs, todayISO());
  const pins = yearInsights(year - 1, races, base.runners, regs, todayISO());
  return { s: ins.summary, prev: pins.summary, hasPrev: pins.summary.totals.races > 0, year, ins, pins, mod };
}

/** Cabecera verde con las cifras grandes y la variación frente al año anterior. */
function resHero(pk) {
  const t = pk.s.totals, o = pk.prev.totals, i = pk.ins;
  const big = (n, l, d) => `<div class="rs-big"><b>${n}</b><span>${l}</span>${d}</div>`;
  const sub = [i.summary.totals.participations ? `${t.participations} participaciones` : '', i.podiumRate ? `${i.podiumRate} % acaban en podio` : '', i.days > t.races ? `${i.days} días de competición` : '',
    t.km ? `📏 ${kmText(Math.round(t.km))}` : '', t.elevation ? `⛰️ ${elevText(t.elevation)}` : '', t.travelKm ? `🧭 ${kmText(t.travelKm)} de viaje` : '', t.timed ? `⏱️ ${formatTime(t.time, true)}` : ''].filter(Boolean);
  return `<section class="rs-hero">
    <p class="rs-hero-t">${pk.mod ? esc(pk.mod.split('|').filter(Boolean).join(' · ')) : 'Todo el equipo'} · temporada ${pk.year}</p>
    <div class="rs-bigs">${big(t.races, 'carreras', rsDelta(pk, t.races, o.races))}${big(t.runners, 'corredores', rsDelta(pk, t.runners, o.runners))}${big(t.podiums, 'podios', rsDelta(pk, t.podiums, o.podiums))}${big(t.wins, 'victorias', rsDelta(pk, t.wins, o.wins))}</div>
    ${sub.length ? `<p class="rs-hero-s">${sub.map(esc).join(' · ')}</p>` : ''}
    ${pk.hasPrev ? `<p class="rs-hero-p">Flechas: frente a ${pk.year - 1}</p>` : ''}</section>`;
}

/** Cuatro datos destacados del año en fichas pequeñas. */
function resHighlights(pk) {
  const i = pk.ins, L = pk.s.longest, t = pk.s.totals;
  const tile = (ic, label, val, sub = '', href = '') => `<${href ? `a href="${esc(href)}"` : 'div'} class="rs-tile">${ico(ic)}<small>${label}</small><b>${val}</b>${sub ? `<em>${sub}</em>` : ''}</${href ? 'a' : 'div'}>`;
  const up = i.upcoming;
  return `<div class="rs-tiles">
    ${tile('cal', 'Mejor mes', i.bestMonth ? cap1(MONTH_NAMES[i.bestMonth.month]) : '—', i.bestMonth ? `${i.bestMonth.total} carrera${i.bestMonth.total === 1 ? '' : 's'}` : '')}
    ${tile('users', 'Media por carrera', i.avgPart ? `${String(i.avgPart).replace('.', ',')}` : '—', 'corredores del club')}
    ${tile('ruler', 'La más larga', L ? esc(kmText(L.km)) : '—', L ? esc(L.race) : 'sin km indicados', L ? `#/carreras/${L.raceId}` : '')}
    ${tile('calplus', 'Por venir', up.races ? `${up.races} carrera${up.races === 1 ? '' : 's'}` : 'Nada más', up.races ? `${up.entries} inscripcion${up.entries === 1 ? '' : 'es'}` : 'este año', up.races ? '#/inscripciones' : '')}
    ${tile('timer', 'Más horas', pk.s.longestTime ? esc(formatTime(pk.s.longestTime.seconds, true)) : '—', pk.s.longestTime ? esc(pk.s.longestTime.race) : 'sin tiempos indicados', pk.s.longestTime ? `#/carreras/${pk.s.longestTime.raceId}` : '')}
    ${tile('mountain', 'La más dura', pk.s.hardest ? esc(elevText(pk.s.hardest.elevation)) : '—', pk.s.hardest ? esc(pk.s.hardest.race) : 'sin desnivel indicado', pk.s.hardest ? `#/carreras/${pk.s.hardest.raceId}` : '')}
    ${tile('money', 'Coste de competir', t.cost ? esc(euros(Math.round(t.cost))) : '—', t.cost ? `${esc(euros(Math.round((t.cost / Math.max(1, t.participations)) * 10) / 10))} por inscripción` : 'sin precios indicados')}
    ${tile('compass', 'Viaje del equipo', t.travelKm ? esc(kmText(t.travelKm)) : '—', t.travelKm ? 'ida y vuelta, aprox.' : 'sin ubicación de las carreras')}
    ${tile('route', 'La más lejana', pk.s.farthest ? esc(kmText(pk.s.farthest.value)) : '—', pk.s.farthest ? esc(pk.s.farthest.race) : 'sin ubicación', pk.s.farthest ? `#/carreras/${pk.s.farthest.raceId}` : '')}
  </div>`;
}

/** Acumulado de carreras mes a mes: este año frente al anterior. */
function resPace(pk) {
  const cum = (s) => { let n = 0; return s.byMonth.map((m) => (n += m.total)); };
  const a = cum(pk.s), b = cum(pk.prev), W = 300, H = 90, P = 6;
  const mx = Math.max(1, ...a, ...(pk.hasPrev ? b : []));
  const pt = (arr) => arr.map((v, k) => `${(P + (k / 11) * (W - 2 * P)).toFixed(1)},${(H - P - (v / mx) * (H - 2 * P)).toFixed(1)}`);
  const cur = pt(a), area = `${P},${H - P} ${cur.join(' ')} ${W - P},${H - P}`;
  const nowM = pk.year === new Date().getFullYear() ? new Date().getMonth() : 11;
  return `<svg class="rs-pace" viewBox="0 0 ${W} ${H}" role="img" aria-label="Carreras acumuladas mes a mes">
    <polygon points="${area}" class="pa-area"/>${pk.hasPrev ? `<polyline points="${pt(b).join(' ')}" class="pa-prev"/>` : ''}<polyline points="${cur.slice(0, nowM + 1).join(' ')}" class="pa-cur"/>
    <circle cx="${cur[nowM].split(',')[0]}" cy="${cur[nowM].split(',')[1]}" r="4" class="pa-dot"/></svg>
    <div class="rs-pace-x">${MES3.map((m) => `<span>${m}</span>`).join('')}</div>
    <p class="rs-pace-l"><i class="l-cur"></i>${pk.year}: <b>${a[nowM]}</b>${pk.hasPrev ? ` &nbsp; <i class="l-prev"></i>${pk.year - 1}: <b>${b[nowM]}</b> a estas alturas · <b>${b[11]}</b> en total` : ''}</p>`;
}

/** Calendario del año: una fila por mes, una casilla por día; las carreras llevan el color de su disciplina. */
function resHeat(pk) {
  const year = pk.year, today = todayISO(), byDay = new Map();
  for (const r of pk.ins.cal) for (const d of daysOf(r.date, r.end_date)) if (d.startsWith(String(year))) (byDay.get(d) || byDay.set(d, []).get(d)).push(r);
  const rows = MES3.map((m, mi) => {
    const n = new Date(year, mi + 1, 0).getDate();
    const cells = Array.from({ length: 31 }, (_, k) => {
      const day = k + 1;
      if (day > n) return '<i class="hc gone"></i>';
      const iso = `${year}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const wd = (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7, rs = byDay.get(iso);
      const cls = `hc${wd >= 5 ? ' we' : ''}${iso === today ? ' today' : ''}`;
      if (!rs) return `<i class="${cls}"></i>`;
      const r = rs[0];
      return `<a class="${cls} on ${discClass(r.modality, r.subtype)}" href="#/carreras/${r.id}" title="${esc(`${day} ${m} · ${rs.map((x) => x.name).join(' + ')}`)}"></a>`;
    }).join('');
    return `<div class="hrow"><b>${m}</b><div class="hcells">${cells}</div></div>`;
  }).join('');
  return `<div class="rs-heat">${rows}</div>${discLegend(pk.s.disciplines)}<div class="mod-legend"><span class="hl-we"><i class="dot"></i>fin de semana</span></div>`;
}

/** Reparto de carreras por día de la semana. */
function resWeekdays(pk) {
  const w = pk.ins.weekdays, mx = Math.max(1, ...w);
  return `<div class="rs-wk">${w.map((n, k) => `<div class="${k >= 5 ? 'we' : ''}"><em>${n || ''}</em><span style="height:${(n / mx) * 100}%"></span><b>${WEEKDAYS[k].slice(0, 1).toUpperCase()}</b></div>`).join('')}</div>
    <p class="hint">Las carreras empiezan en ${(() => { const k = w.indexOf(mx); return mx ? WEEKDAYS[k] + (w.filter((x) => x === mx).length > 1 ? ' (y otros días igual)' : '') : '—'; })()} sobre todo.</p>`;
}

/** Barra apilada con el reparto por disciplina + la lista con sus cifras. */
/** Año actual frente al anterior, métrica a métrica. */
function resCompare(pk) {
  if (!pk.hasPrev) return `<p class="hint">Todavía no hay datos de ${pk.year - 1} para comparar.</p>`;
  const t = pk.s.totals, o = pk.prev.totals, ci = pk.ins, oi = pk.pins;
  const row = (l, a, b, fmt = (n) => n) => `<tr><td>${l}</td><td class="num"><b>${fmt(a)}</b></td><td class="num muted">${fmt(b)}</td><td class="num">${rsDelta(pk, a, b, fmt) || '—'}</td></tr>`;
  return `<div class="tp-scroll"><table class="tp-table rs-cmp"><thead><tr><th class="l"></th><th class="num">${pk.year}</th><th class="num">${pk.year - 1}</th><th class="num">Δ</th></tr></thead><tbody>
    ${row('Carreras', t.races, o.races)}${row('Días de competición', ci.days, oi.days)}${row('Corredores que han corrido', t.runners, o.runners)}${row('Participaciones', t.participations, o.participations)}
    ${row('Podios', t.podiums, o.podiums)}${row('Victorias', t.wins, o.wins)}${row('% de podios', ci.podiumRate, oi.podiumRate, (n) => `${n}\u00a0%`)}${row('Km recorridos', Math.round(t.km), Math.round(o.km), (n) => kmText(n))}
    ${ci.summary.totals.elevation || oi.summary.totals.elevation ? row('Desnivel positivo', ci.summary.totals.elevation, oi.summary.totals.elevation, (n) => elevText(n)) : ''}${t.cost || o.cost ? row('Coste de las inscripciones', Math.round(t.cost), Math.round(o.cost), (n) => euros(n)) : ''}${t.travelKm || o.travelKm ? row('Desplazamiento (ida y vuelta)', t.travelKm, o.travelKm, (n) => kmText(n)) : ''}
    ${row('Provincias distintas', pk.s.provinces.length, pk.prev.provinces.length)}${row('Disciplinas distintas', pk.s.disciplines.length, pk.prev.disciplines.length)}</tbody></table></div>`;
}

function resPanorama(pk) {
  return `${resHero(pk)}${resHighlights(pk)}
    <section class="card rs-card"><h2>Ritmo del año</h2>${resPace(pk)}</section>
    <section class="card rs-card"><h2>Carreras por mes</h2>${seasonMonths(pk)}</section>
    ${pk.s.totals.elevation ? `<section class="card rs-card"><h2>Metros de subida por mes</h2>${seasonElevMonths(pk)}<p class="hint">Desnivel positivo sumado de todos los participantes en cada mes.</p></section>` : ''}
    <section class="card rs-card"><h2>Calendario del año</h2><p class="hint">Cada casilla es un día. Toca una carrera para abrirla.</p>${resHeat(pk)}</section>
    <section class="card rs-card"><h2>Por modalidad</h2>${modalityOverview(pk, { cost: true })}</section>
    ${disciplineBlocks(pk, { cost: true }).map((b) => `<section class="card rs-card"><h2><i class="dot ${modClass(b.modality)}"></i>${esc(b.modality)}: por disciplina</h2>${b.html}</section>`).join('')}
    <section class="card rs-card"><h2>Días de la semana</h2>${resWeekdays(pk)}</section>
    <section class="card rs-card"><h2>Frente a ${pk.year - 1}</h2>${resCompare(pk)}</section>`;
}

// ---------- Podios ----------
function resPodiums(pk) {
  const s = pk.s, pl = s.podiumList, n = (k) => pl.filter((x) => x.position === k).length;
  const t = s.totals, i = pk.ins;
  const medals = `<div class="rs-medals"><div class="m1"><b>${n(1)}</b><span>🥇 Oros</span></div><div class="m2"><b>${n(2)}</b><span>🥈 Platas</span></div><div class="m3"><b>${n(3)}</b><span>🥉 Bronces</span></div></div>
    <p class="rs-medal-s"><b>${pl.length}</b> podio${pl.length === 1 ? '' : 's'} en <b>${new Set(pl.map((x) => x.raceId)).size}</b> carrera${new Set(pl.map((x) => x.raceId)).size === 1 ? '' : 's'} · <b>${i.podiumRate} %</b> de las ${t.participations} participaciones acaban en podio${pk.hasPrev ? ` ${rsDelta(pk, pl.length, pk.prev.podiumList.length)}` : ''}</p>`;
  const types = s.byPodiumType.filter((x) => x.podiums);
  const hunters = s.perRunner.filter((r) => r.p1 + r.p2 + r.p3 > 0).sort((a, b) => b.p1 - a.p1 || (b.p1 + b.p2 + b.p3) - (a.p1 + a.p2 + a.p3) || b.p2 - a.p2 || a.name.localeCompare(b.name, 'es'));
  const topP = Math.max(1, ...hunters.map((r) => r.p1 + r.p2 + r.p3));
  const byRace = new Map();
  for (const p of pl) { const k = `${p.raceId}|${p.date}`; (byRace.get(k) || byRace.set(k, { ...p, items: [] }).get(k)).items.push(p); }
  const races = [...byRace.values()].sort((a, b) => b.date.localeCompare(a.date));
  const raceRow = (r) => `<li class="${discClass(r.modality, r.subtype)}">${raceTile({ date: r.date, modality: r.modality, subtype: r.subtype })}<div class="pr-body"><a class="rname" href="#/carreras/${r.raceId}">${esc(r.race)}</a>
    <p class="pr-who">${r.items.sort((a, b) => a.position - b.position).map((p) => `${medal(p.position)} ${esc(p.runner)}${p.category ? ` <small class="muted">${esc(p.category)}</small>` : ''}${p.stage ? ` <small class="muted">(${esc(p.stage)})</small>` : ''}`).join(' · ')}</p></div></li>`;
  return `<section class="card rs-card rs-gold"><h2>Podios ${pk.year}</h2>${medals}
      ${types.length ? `<div class="pills">${types.map((x) => `<span class="pill">${esc(x.label)} <b>${x.podiums}</b>${x.wins ? ` · 🥇 ${x.wins}` : ''}</span>`).join('')}</div>` : ''}</section>
    ${hunters.length ? `<section class="card rs-card"><h2>Los que más suben al podio</h2><ol class="rs-rank">${hunters.slice(0, 10).map((r, k) => `<li><span class="pos">${k + 1}</span><div><a href="#/corredor/${esc(r.key)}"><b>${esc(r.name)}</b></a>
      <small class="muted">${r.races} carrera${r.races === 1 ? '' : 's'} · ${pctOf(r.p1 + r.p2 + r.p3, r.races)} % en podio</small>${bar(((r.p1 + r.p2 + r.p3) / topP) * 100, 'gold')}</div><span class="rk-m">${r.p1 ? `🥇${r.p1} ` : ''}${r.p2 ? `🥈${r.p2} ` : ''}${r.p3 ? `🥉${r.p3}` : ''}</span></li>`).join('')}</ol></section>` : ''}
    <section class="card rs-card"><h2>Por categoría y disciplina</h2>${seasonPodiums(pk)}</section>
    <section class="card rs-card"><h2>Récords del equipo</h2>${seasonRecords(pk)}</section>
    <section class="card rs-card"><h2>Todos los podios (${races.length} carrera${races.length === 1 ? '' : 's'})</h2>
      ${races.length ? `<ul class="podium-list rs-pods">${races.slice(0, 6).map(raceRow).join('')}</ul>${races.length > 6 ? `<details class="pod-more"><summary>Ver las ${races.length - 6} anteriores</summary><ul class="podium-list rs-pods">${races.slice(6).map(raceRow).join('')}</ul></details>` : ''}` : '<p class="muted">Sin podios este año.</p>'}</section>`;
}

// ---------- Equipo ----------
function resTeam(pk) {
  const i = pk.ins, s = pk.s, year = pk.year;
  const pct = pctOf(i.activeCount, i.rosterSize), mx = Math.max(1, ...i.hist.map((h) => h.runners));
  const part = `<section class="card rs-card"><h2>Participación</h2><div class="rs-part"><div class="ring" style="--p:${pct}"><b>${pct}%</b></div>
      <div><p><b>${i.activeCount} de ${i.rosterSize}</b> corredores han corrido${pk.mod ? ` ${esc(pk.mod.split('|').filter(Boolean).join(' · '))}` : ''} en ${year}.</p>
      <p class="muted small">${s.totals.participations} participaciones: <b>${i.avgPart ? String(i.avgPart).replace('.', ',') : 0}</b> corredores por carrera.</p></div></div>
    <div class="rs-hist">${i.hist.map((h) => `<div><em>${h.runners || ''}</em><span style="height:${(h.runners / mx) * 100}%"></span><b>${h.label}</b></div>`).join('')}</div><p class="hint">Cuántos corredores han hecho cada número de carreras.</p>
    ${i.idle.length ? `<p class="small"><b>Sin ninguna carrera (${i.idle.length}):</b> ${i.idle.sort(byName).map((r) => `<a href="#/corredor/${r.key}">${esc(r.name)}</a>`).join(', ')}.</p>` : '<p class="small">✅ Todos han corrido alguna vez este año.</p>'}</section>`;
  let money = '';
  if (!pk.mod) {
    const cfg = bonusCfg(year), bs = yearBonuses(year, S.data.races, S.data.registrations, S.data.runners, cfg, S.data.circuitPodiums || []);
    const amount = bs.reduce((n, b) => n + b.amount, 0), pen = bs.reduce((n, b) => n + b.penalty, 0);
    const ok = bs.filter((b) => b.reachesMinimum).length, low = bs.length - ok, withTier = bs.filter((b) => b.tier).length;
    const tiers = new Map(); for (const b of bs) { const k = b.tier ? b.tier.races : 0; tiers.set(k, (tiers.get(k) || 0) + 1); }
    const order = [...tiers.keys()].sort((a, b) => a - b), tmx = Math.max(1, ...tiers.values());
    money = `<section class="card rs-card"><h2>Bonos y mínimo (${year})</h2>
      <div class="rs-bonus"><div class="good"><b>${ok}</b><span>cumplen el mínimo</span></div><div class="bad"><b>${low}</b><span>por debajo</span></div><div class="gold"><b>${withTier}</b><span>con bono</span></div></div>
      <div class="rs-money"><div><small>Bonos que correspondería pagar</small><b>${euros(amount)}</b></div><div><small>Penalizaciones</small><b>${euros(pen)}</b></div><div><small>Saldo</small><b class="${amount - pen >= 0 ? 'pos' : 'neg'}">${signEuros(amount - pen)}</b></div></div>
      <div class="rs-tiers">${order.map((k) => `<div><span>${k ? `Tramo ${k} carreras` : 'Sin tramo'}</span>${bar((tiers.get(k) / tmx) * 100, k ? 'ok' : 'low')}<b>${tiers.get(k)}</b></div>`).join('')}</div>
      <p class="hint">Con las carreras ya hechas hasta hoy (sin contar las inscritas). Detalle por corredor en <a href="#/computo">Cómputo</a> y <a href="#/bonos">Bonos</a>.</p></section>`;
  }
  const roster = S.data.runners;
  const catRow = (c) => { const rs = roster.filter((r) => (r.category || '') === c); const st = s.byCategory.find((x) => x.category === c);
    return rs.length || st ? `<li><div class="cs-head"><b>${c ? esc(c) : 'Sin categoría'}</b><small class="muted">${rs.length} en plantilla · ${st ? `${st.runners} corrieron · ${st.participations} part.${st.km ? ` · ${kmText(st.km)}` : ''}${st.elev ? ` · ▲ ${elevText(st.elev)}` : ''}` : 'sin carreras'}</small>
      <span class="cs-pod">${st && st.podiums ? `${st.p1 ? '🥇' + st.p1 + ' ' : ''}${st.p2 ? '🥈' + st.p2 + ' ' : ''}${st.p3 ? '🥉' + st.p3 : ''}` : ''}</span></div>${bar(pctOf(st?.participations || 0, Math.max(1, ...s.byCategory.map((x) => x.participations))))}</li>` : ''; };
  const cats = `<section class="card rs-card"><h2>Por categoría</h2><ul class="cat-stats">${[...CATEGORIES, ''].map(catRow).join('')}</ul></section>`;
  const cn = CONTRACTS.map((c) => [c.label, roster.filter((r) => r.contract === c.id).length]).concat([['Sin indicar', roster.filter((r) => !CONTRACTS.some((c) => c.id === r.contract)).length]]).filter(([, n]) => n);
  const contracts = `<section class="card rs-card"><h2>Plantilla por contrato</h2><div class="pills">${cn.map(([l, n]) => `<span class="pill">${esc(l)} <b>${n}</b></span>`).join('')}</div></section>`;
  const bonusBy = new Map(yearBonuses(year, S.data.races, S.data.registrations, S.data.runners, bonusCfg(year), S.data.circuitPodiums || []).map((b) => [b.runner.id, b]));
  const sort = S.tsort || { k: 'races', dir: -1 };
  const rows = seasonRunnerRows(pk).map((r) => ({ ...r, bc: bonusBy.get(r.key)?.bonusCount || 0, bok: bonusBy.get(r.key)?.reachesMinimum }))
    .sort((a, b) => (sort.k === 'name' ? a.name.localeCompare(b.name, 'es') * -sort.dir : (b[sort.k] - a[sort.k]) * -sort.dir || a.name.localeCompare(b.name, 'es')));
  const cols = [...TP_COLS, ...(pk.mod ? [] : [['bc', 'Bono']])];
  const th = ([k, l, t]) => `<th class="${t === 'text' ? 'l' : 'num'}"><button type="button" class="tp-sort${sort.k === k ? ' on' : ''}" data-act="tp-sort" data-k="${k}">${l}${sort.k === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button></th>`;
  const table = `<section class="card rs-card"><h2>Corredores (${rows.length})</h2><div class="tp-scroll"><table class="tp-table tp-runners"><thead><tr>${cols.map(th).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr><td class="l"><a href="#/corredor/${esc(r.key)}"><b>${esc(r.name)}</b></a>${r.cat ? ` <small class="muted">${esc(r.cat)}</small>` : ''}</td><td class="num">${r.races}</td><td class="num">${r.km ? esc(kmText(r.km)) : '—'}</td><td class="num">${r.elev ? esc(elevText(r.elev)) : '—'}</td><td class="num">${r.trip ? esc(kmText(r.trip)) : '—'}</td><td class="num">${r.cost ? esc(euros(r.cost)) : '—'}</td><td class="num">${r.timed ? formatTime(r.time, true) : '—'}</td><td class="num">${r.nd}</td><td class="num">${r.p1 || '·'}</td><td class="num">${r.p2 || '·'}</td><td class="num">${r.p3 || '·'}</td><td class="num">${r.nm}</td>${pk.mod ? '' : `<td class="num">${r.bc}${r.bok === false ? ' ⚠️' : ''}</td>`}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="muted">Sin carreras este año.</td></tr>`}</tbody></table></div>
    <p class="hint">Toca una columna para ordenar. ⚠️ = por debajo del mínimo de carreras.</p></section>`;
  return `${rankingBoard(pk)}${part}${money}${cats}${contracts}${table}`;
}

// ---------- Alcance: dónde, cuánto y qué formatos ----------
/** Km frente a desnivel de cada carrera (un punto por carrera, con el color de su disciplina). */
function resScatter(pk) {
  const pts = pk.ins.cal.filter((r) => r.km && r.elevation);
  if (pts.length < 2) return '<p class="hint">Hacen falta al menos dos carreras con km y desnivel indicados para dibujarlo.</p>';
  const W = 320, H = 190, L = 38, B = 26, T = 8, R = 10, mx = Math.max(...pts.map((r) => r.km)) * 1.08, my = Math.max(...pts.map((r) => r.elevation)) * 1.08;
  const X = (v) => L + (v / mx) * (W - L - R), Y = (v) => H - B - (v / my) * (H - B - T);
  const tick = (max, n) => Array.from({ length: n + 1 }, (_, i) => Math.round((max / n) * i / 10) * 10);
  return `<svg class="rs-scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kilómetros frente a desnivel de cada carrera">
    ${tick(my, 4).map((v) => `<g><line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="sc-grid"/><text x="${L - 4}" y="${Y(v) + 3}" class="sc-t" text-anchor="end">${v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : v}</text></g>`).join('')}
    ${tick(mx, 4).map((v) => `<text x="${X(v)}" y="${H - 8}" class="sc-t" text-anchor="middle">${v}</text>`).join('')}
    <text x="${L}" y="9" class="sc-l">m de subida</text><text x="${W - R}" y="${H - B - 4}" class="sc-l" text-anchor="end">km →</text>
    ${pts.map((r) => `<a href="${raceHref(r.id)}"><circle cx="${X(r.km)}" cy="${Y(r.elevation)}" r="${Math.min(9, 4 + r.n * 1.2)}" class="sc-dot ${discClass(r.modality, r.subtype)}"><title>${esc(`${r.name}: ${r.km} km, ${elevText(r.elevation)}`)}</title></circle></a>`).join('')}</svg>
    <p class="hint">Cada punto es una carrera; el tamaño crece con los corredores del club que la corrieron. Arriba a la derecha, las más largas y duras.</p>`;
}
/** Las carreras con más desnivel del año. */
function resHardest(pk) {
  const list = pk.ins.cal.filter((r) => r.elevation).sort((a, b) => b.elevation - a.elevation).slice(0, 6), mx = Math.max(1, ...list.map((r) => r.elevation));
  return list.length ? `<ol class="rs-rank">${list.map((r, k) => `<li><span class="pos">${k + 1}</span><div><a href="${raceHref(r.id)}"><b>${esc(r.name)}</b></a>
    <small class="muted">${esc(formatDate(r.date, false))}${r.km ? ` · ${esc(kmText(r.km))} · ${Math.round((r.elevation / r.km) * 10) / 10} m/km` : ''}${r.n ? ` · ${r.n} del club` : ''}</small>${bar((r.elevation / mx) * 100, 'warm')}</div><span class="rk-m">${esc(elevText(r.elevation))}</span></li>`).join('')}</ol>`
    : '<p class="hint">Todavía no hay carreras con desnivel indicado. Se completa desde cada carrera («Faltan datos») o al crearla.</p>';
}
/** Cuánto cuesta competir: total, medias, por disciplina y por mes (solo dirección). */
function resCost(pk) {
  const t = pk.s.totals;
  if (!t.pricedRaces) return '<p class="hint">Todavía no hay carreras con precio indicado. Se completa desde cada carrera («Faltan datos») o al crearla.</p>';
  const ds = pk.s.disciplines.filter((d) => d.avgPrice), dmx = Math.max(1, ...ds.map((d) => d.avgPrice));
  const mon = pk.s.byMonth, mmx = Math.max(1, ...mon.map((m) => m.cost));
  const per = Math.round((t.cost / Math.max(1, t.participations)) * 10) / 10;
  return `<div class="rs-money rs-cost"><div><small>Gasto en inscripciones</small><b>${esc(euros(Math.round(t.cost)))}</b></div><div><small>Precio medio de carrera</small><b>${esc(euros(t.avgPrice))}</b></div><div><small>Por participación</small><b>${esc(euros(per))}</b></div></div>
    <h3>Precio medio por disciplina</h3>${ds.map((d) => `<div class="hbar"><span>${esc(disciplineName(d))}</span>${bar((d.avgPrice / dmx) * 100, 'warm')}<b>${esc(euros(d.avgPrice))}</b></div>`).join('')}
    <h3>Gasto por mes</h3><div class="rs-wk rs-elev rs-costm" role="img" aria-label="Gasto en inscripciones de cada mes">${mon.map((m) => `<div><em>${m.cost ? Math.round(m.cost) : ''}</em><span style="height:${(m.cost / mmx) * 100}%"></span><b>${MES3[m.month].slice(0, 1).toUpperCase()}</b></div>`).join('')}</div>
    <p class="hint">Suma el precio de la inscripción de cada participación del club (${t.pricedRaces} de ${t.races} carreras con precio indicado). Es lo que costaría inscribirse, no lo que se haya pagado.</p>`;
}

/** Mapa de desplazamientos: cada carrera según su rumbo y su distancia desde el punto de salida (anillos cada 50/100/200 km). */
function resTripMap(pk) {
  const pts = pk.ins.cal.filter((r) => r.dist != null && r.bearing != null);
  if (!pts.length) return '<p class="hint">Todavía no se sabe dónde son las carreras: se buscan solas al abrir el Resumen.</p>';
  const W = 320, C = W / 2, maxD = Math.max(...pts.map((r) => r.dist), 40), step = maxD > 260 ? 100 : maxD > 110 ? 50 : 25, top = Math.ceil((maxD * 1.05) / step) * step, R = C - 18;
  const pos = (r) => ({ x: C + (r.dist / top) * R * Math.sin((r.bearing * Math.PI) / 180), y: C - (r.dist / top) * R * Math.cos((r.bearing * Math.PI) / 180) });
  const rings = Array.from({ length: top / step }, (_, i) => (i + 1) * step);
  return `<svg class="rs-trip" viewBox="0 0 ${W} ${W}" role="img" aria-label="Mapa de las carreras según su distancia y dirección desde el punto de salida">
    ${rings.map((d) => `<circle cx="${C}" cy="${C}" r="${(d / top) * R}" class="tr-ring"/><text x="${C + 3}" y="${C - (d / top) * R + 10}" class="tr-t">${d} km</text>`).join('')}
    <line x1="${C}" y1="${C - R - 6}" x2="${C}" y2="${C + R + 6}" class="tr-axis"/><line x1="${C - R - 6}" y1="${C}" x2="${C + R + 6}" y2="${C}" class="tr-axis"/>
    <text x="${C}" y="10" class="tr-n" text-anchor="middle">N</text><text x="${W - 4}" y="${C + 4}" class="tr-n" text-anchor="end">E</text><text x="${C}" y="${W - 3}" class="tr-n" text-anchor="middle">S</text><text x="4" y="${C + 4}" class="tr-n">O</text>
    ${pts.map((r) => { const q = pos(r); return `<a href="${raceHref(r.id)}"><circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${Math.min(9, 4 + r.n * 1.1)}" class="tr-dot ${discClass(r.modality, r.subtype)}${r.src === 'province' ? ' approx' : ''}"><title>${esc(`${r.name} (${r.place || 'sin lugar'}): ${r.dist} km${r.src === 'province' ? ' · aprox. por provincia' : ''}`)}</title></circle></a>`; }).join('')}
    <circle cx="${C}" cy="${C}" r="5" class="tr-home"/><text x="${C + 8}" y="${C + 14}" class="tr-t">salida</text></svg>
    <p class="hint">El centro es el punto de salida (${esc(ORIGEN.nombre)}). Cada punto es una carrera: cuanto más lejos del centro, más km; el tamaño crece con los corredores del club que fueron. Los puntos huecos solo se conocen por su provincia.</p>`;
}
/** Cuánto se desplaza el equipo: totales, quién más y las carreras más lejanas. */
function resTravel(pk) {
  const t = pk.s.totals, s = pk.s;
  if (!t.travelRaces) return '<p class="hint">Todavía no se sabe dónde son las carreras. Se busca la población de cada una al abrir el Resumen; si alguna no aparece, revisa su lugar y provincia.</p>';
  const people = s.perRunner.filter((r) => r.trip > 0).sort((a, b) => b.trip - a.trip), mx = Math.max(1, ...people.map((r) => r.trip));
  const far = pk.ins.cal.filter((r) => r.dist != null).sort((a, b) => b.dist - a.dist).slice(0, 5), fmx = Math.max(1, ...far.map((r) => r.dist));
  const pend = S.session?.isAdmin ? geoPending().length : 0;
  return `<div class="rs-tiles">
      <div class="rs-tile">${ico('compass')}<small>Viaje del equipo</small><b>${esc(kmText(t.travelKm))}</b><em>ida y vuelta${pk.hasPrev ? ` ${rsDelta(pk, t.travelKm, pk.prev.totals.travelKm, (n) => kmText(n))}` : ''}</em></div>
      <div class="rs-tile">${ico('route')}<small>Distancia media</small><b>${esc(kmText(t.avgDist))}</b><em>de ida a cada carrera</em></div></div>
    <h3>Quién se desplaza más</h3>
    <ol class="rs-rank">${people.slice(0, 8).map((r, k) => `<li><span class="pos">${k + 1}</span><div>${personTag(r.key, r.name)}
      <small class="muted">${r.tripN} carrera${r.tripN === 1 ? '' : 's'} · media ${esc(kmText(Math.round(r.trip / 2 / r.tripN)))}${r.tripRace ? ` · la más lejos: ${esc(kmText(r.tripMax))} (${esc(r.tripRace)})` : ''}</small>${bar((r.trip / mx) * 100, 'warm')}</div><span class="rk-m">${esc(kmText(r.trip))}</span></li>`).join('')}</ol>
    <h3>Km de viaje del equipo, mes a mes</h3>${monthBars(pk, 'trip', kmShort)}
    <h3>Las carreras más lejanas</h3>
    <ol class="rs-rank">${far.map((r, k) => `<li><span class="pos">${k + 1}</span><div><a href="${raceHref(r.id)}"><b>${esc(r.name)}</b></a><small class="muted">${esc(r.place || '—')}${r.src === 'province' ? ' · aprox. (solo se sabe la provincia)' : ''}${r.n ? ` · ${r.n} del club` : ''}</small>${bar((r.dist / fmx) * 100, 'warm')}</div><span class="rk-m">${esc(kmText(r.dist))}</span></li>`).join('')}</ol>
    <p class="hint">Cálculo orientativo: línea recta desde el punto de salida (${esc(ORIGEN.nombre)}) hasta la población de cada carrera, × ${String(FACTOR_CARRETERA).replace('.', ',')} para estimar la carretera, ida y vuelta, por cada corredor que participó. No cuenta coches compartidos ni el domicilio real de cada uno. ${t.travelRaces} de ${t.races} carreras con ubicación${t.travelApprox ? ` (${t.travelApprox} solo por su provincia)` : ''}${pend ? `; faltan ${pend} por buscar` : ''}.</p>`;
}

/** Rosco de reparto: cada porción un color, con el total en el centro y la leyenda al lado (nombre, carreras y %). */
const PLACE_COLORS = ['#15906a', '#2f6fd6', '#d8601a', '#6a4fd6', '#cf2f68', '#0a8fc0', '#9aa7b0'];
function placeDonut(rows, { title, max = 6, unit = 'carreras' }) {
  if (!rows.length) return `<div><h3>${title}</h3><p class="muted small">Sin datos</p></div>`;
  const top = rows.slice(0, max), rest = rows.slice(max).reduce((n, c) => n + c.races, 0);
  const items = [...top.map((c) => ({ name: c.name, n: c.races })), ...(rest ? [{ name: `Otras (${rows.length - max})`, n: rest, other: true }] : [])];
  const tot = items.reduce((n, x) => n + x.n, 0) || 1, R = 38, C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = items.map((x, i) => { const len = (x.n / tot) * C, o = -acc; acc += len; return `<circle cx="50" cy="50" r="${R}" fill="none" stroke="${x.other ? PLACE_COLORS[6] : PLACE_COLORS[i % 6]}" stroke-width="16" stroke-dasharray="${Math.max(0, len - 1.2).toFixed(2)} ${(C - Math.max(0, len - 1.2)).toFixed(2)}" stroke-dashoffset="${o.toFixed(2)}" transform="rotate(-90 50 50)"><title>${esc(x.name)}: ${x.n}</title></circle>`; }).join('');
  return `<div class="pd"><h3>${title} <small class="muted">(${rows.length})</small></h3>
    <div class="pd-wrap"><svg class="pd-svg" viewBox="0 0 100 100" role="img" aria-label="${esc(title)}: reparto de ${unit}">${arcs}<text x="50" y="49" text-anchor="middle" class="pd-n">${tot}</text><text x="50" y="60" text-anchor="middle" class="pd-u">${unit}</text></svg>
      <ul class="pd-leg">${items.map((x, i) => `<li><i style="background:${x.other ? PLACE_COLORS[6] : PLACE_COLORS[i % 6]}"></i><span>${esc(x.name)}</span><b>${x.n}</b><em>${Math.round((x.n / tot) * 100)} %</em></li>`).join('')}</ul></div></div>`;
}
function resReach(pk) {
  const s = pk.s, i = pk.ins, t = s.totals, L = s.longest;
  const km = s.perRunner.filter((r) => r.km > 0).sort((a, b) => b.km - a.km).slice(0, 5), kmx = Math.max(1, ...km.map((r) => r.km));
  const tm = s.perRunner.filter((r) => r.timed > 0).sort((a, b) => b.time - a.time).slice(0, 5), tmx = Math.max(1, ...tm.map((r) => r.time));
  const figs = `<div class="rs-tiles">
    <div class="rs-tile">${ico('ruler')}<small>Km recorridos</small><b>${t.km ? esc(kmText(Math.round(t.km))) : '—'}</b><em>entre todos${pk.hasPrev ? ` ${rsDelta(pk, Math.round(t.km), Math.round(pk.prev.totals.km), (n) => kmText(n))}` : ''}</em></div>
    <div class="rs-tile">${ico('flag')}<small>Km por carrera</small><b>${i.avgRaceKm ? esc(kmText(i.avgRaceKm)) : '—'}</b><em>${i.withKm} de ${t.races} con km</em></div>
    <div class="rs-tile">${ico('route')}<small>Km por día de competición</small><b>${t.kmDays ? esc(perDayText(t.km / t.kmDays)) : '—'}</b><em>${t.kmDays ? `${esc(kmText(Math.round(t.km)))} en ${t.kmDays} ${t.kmDays === 1 ? 'día' : 'días'}` : 'sin km indicados'}</em></div>
    <div class="rs-tile">${ico('timer')}<small>Velocidad media</small><b>${t.secTimed ? esc(speedText(t.kmTimed / (t.secTimed / 3600))) : '—'}</b><em>${t.secTimed ? `${esc(kmText(Math.round(t.kmTimed)))} en ${esc(formatTime(t.secTimed, true))}` : 'faltan tiempos'}</em></div>
    <div class="rs-tile">${ico('clock')}<small>Tiempo por km</small><b>${t.secTimed && t.kmTimed ? esc(paceText(t.secTimed / t.kmTimed)) : '—'}</b><em>${t.secTimed ? 'de media en carrera' : 'faltan tiempos'}</em></div>
    <div class="rs-tile">${ico('compass')}<small>Carrera frente a viaje</small><b>${t.tripBoth ? esc(ratioX(t.kmBoth / t.tripBoth)) : '—'}</b><em>${t.tripBoth ? `${esc(kmText(Math.round(t.kmBoth)))} de carrera · ${esc(kmText(t.tripBoth))} de viaje` : 'faltan km o ubicación'}</em></div>
    <div class="rs-tile">${ico('timer')}<small>Tiempo en carrera</small><b>${t.timed ? formatTime(t.time, true) : '—'}</b><em>${t.timed} de ${t.participations} con tiempo</em></div>
    <div class="rs-tile">${ico('layers')}<small>Pruebas de varios días</small><b>${i.multiDay}</b><em>${i.days} días de competición</em></div>
    <div class="rs-tile">${ico('mountain')}<small>Desnivel positivo</small><b>${t.elevation ? esc(elevText(t.elevation)) : '—'}</b><em>entre todos${pk.hasPrev ? ` ${rsDelta(pk, t.elevation, pk.prev.totals.elevation, (n) => elevText(n))}` : ''}</em></div>
    <div class="rs-tile">${ico('mountain')}<small>Media por carrera</small><b>${i.avgElev ? esc(elevText(i.avgElev)) : '—'}</b><em>${i.withElev} de ${t.races} con desnivel</em></div></div>`;
  const people = (rows, key, fmt, mx) => rows.map((r, k) => `<li><span class="pos">${k + 1}</span><div>${personTag(r.key, r.name)}${bar((r[key] / mx) * 100)}</div><span class="rk-m">${fmt(r[key])}</span></li>`).join('');
  return `${figs}
    <section class="card rs-card"><h2>Dónde se ha competido</h2>${placeDonut(s.provinces, { title: 'Provincias', max: 6 })}${s.countries.length > 1 ? placeDonut(s.countries, { title: 'Países', max: 5 }) : s.countries.length ? `<p class="hint">Todas las carreras han sido en ${esc(s.countries[0].name)}.</p>` : ''}
      ${viewerIsAdmin() && s.missingPlace.length ? `<div class="warn"><b>Faltan datos en ${s.missingPlace.length} carrera${s.missingPlace.length === 1 ? '' : 's'}:</b><ul>${s.missingPlace.map((m) => `<li><a href="#/carreras/${m.id}">${esc(m.name)}</a>: sin ${m.missing.join(' ni ')}</li>`).join('')}</ul></div>` : ''}</section>
    <section class="card rs-card"><h2>Las carreras más duras</h2>${resHardest(pk)}${i.climb ? `<p class="hint">De media, ${String(i.climb).replace('.', ',')} metros de subida por kilómetro.</p>` : ''}</section>
    ${pk.ins.cal.filter((r) => r.km && r.elevation).length > 1 ? `<section class="card rs-card"><h2>Km frente a desnivel</h2>${resScatter(pk)}</section>` : ''}
    ${(() => { const el = s.perRunner.filter((r) => r.elev > 0).sort((a, b) => b.elev - a.elev).slice(0, 5), ex = Math.max(1, ...el.map((r) => r.elev));
      return el.length ? `<section class="card rs-card"><h2>Quién ha subido más</h2><ol class="rs-rank">${people(el, 'elev', (n) => esc(elevText(n)), ex)}</ol></section>` : ''; })()}
    ${resTimeCard(pk)}
    <section class="card rs-card"><h2>Desplazamientos</h2>${resTravel(pk)}</section>
    <section class="card rs-card"><h2>Mapa de desplazamientos</h2>${resTripMap(pk)}</section>
    <section class="card rs-card"><h2>Cuánto cuesta competir</h2>${resCost(pk)}</section>
    ${km.length ? `<section class="card rs-card"><h2>Quién ha recorrido más</h2><ol class="rs-rank">${people(km, 'km', (n) => esc(kmText(n)), kmx)}</ol></section>` : ''}
    ${tm.length ? `<section class="card rs-card"><h2>Más tiempo en carrera</h2><ol class="rs-rank">${people(tm, 'time', (n) => formatTime(n, true), tmx)}</ol></section>` : ''}
    ${L ? `<section class="card rs-card"><h2>La carrera más larga</h2><p><a class="rname" href="#/carreras/${L.raceId}"><b>${esc(L.race)}</b></a> · <b>${esc(kmText(L.km))}</b></p><p class="muted small">La corrieron: ${esc(L.runners.join(', '))}.</p></section>` : ''}
    ${s.longestTime ? `<section class="card rs-card"><h2>La carrera que más horas costó</h2><p><a class="rname" href="#/carreras/${s.longestTime.raceId}"><b>${esc(s.longestTime.race)}</b></a> · <b>${esc(formatTime(s.longestTime.seconds, true))}</b></p><p class="muted small">${esc(s.longestTime.runner)}${s.longestTime.km ? ` · ${esc(kmText(s.longestTime.km))}` : ''}. En BTT se hacen menos km pero muchas más horas: por eso va aparte de la más larga.</p></section>` : ''}
    ${s.bySubtype.length ? `<section class="card rs-card"><h2>Formatos</h2><div class="pills">${s.bySubtype.map((x) => `<span class="pill ${modClass(x.modality)}"><i class="dot"></i>${pk.mod ? '' : `${esc(x.modality)} · `}${esc(x.subtype)} <b>${x.races}</b></span>`).join('')}</div></section>` : ''}`;
}


/** Contenido de la ventana de filtros del Resumen del equipo (temporada, modalidad y, si la hay, disciplina). */
const eqSource = () => (S.session?.isAdmin && !S.preview ? { races: S.data?.races || [], runners: S.data?.runners || [] } : { races: S.team?.races || [], runners: S.team?.runners || [] });
function eqFilterHtml() {
  const { races, runners } = eqSource();
  const years = availableYears(races), mods = yearSummary(S.year, races, runners).byModality.filter((m) => m.races > 0);
  const cur = S.sumMod && S.sumMod !== 'all' ? S.sumMod : null, curMod = cur ? cur.split('|')[0] : null;
  const discs = curMod ? yearSummary(S.year, races.filter((r) => r.modality === curMod), runners).disciplines.filter((d) => d.subtype) : [];
  const chip = (on, kind, val, label) => `<button type="button" class="chip${on ? ' on' : ''}" data-eqf="${kind}:${esc(val)}">${label}</button>`;
  return `<form method="dialog" class="dlg eqdlg"><h2>Filtros</h2>
    <h3>Temporada</h3><div class="eqd-chips">${years.map((y) => chip(y === S.year, 'year', y, y)).join('')}</div>
    <h3>Modalidad</h3><div class="eqd-chips">${chip(!cur, 'mod', 'all', 'Todas')}${mods.map((m) => chip(curMod === m.modality, 'mod', m.modality, esc(m.modality))).join('')}</div>
    ${discs.length ? `<h3>Disciplina de ${esc(curMod)}</h3><div class="eqd-chips">${chip(cur === curMod, 'mod', curMod, 'Todas')}${discs.map((d) => chip(cur === d.key, 'mod', d.key, esc(d.subtype))).join('')}</div>` : ''}
    <div class="dlg-actions"><button type="button" class="btn" data-eqf="clear">Quitar filtros</button><button value="" class="btn primary">Listo</button></div></form>`;
}
{
  const dlg = document.getElementById('dialog');
  dlg.addEventListener('click', (ev) => {
    const b = ev.target.closest('.eqdlg [data-eqf]'); if (!b) return;
    ev.preventDefault();
    const [kind, ...rest] = b.dataset.eqf.split(':'), val = rest.join(':');
    if (kind === 'year') { S.year = Number(val); if (S.sumMod && S.sumMod !== 'all' && !eqSource().races.some((r) => yearOf(r.date) === S.year && r.modality === S.sumMod.split('|')[0])) S.sumMod = 'all'; }
    else if (kind === 'mod') S.sumMod = val;
    else if (kind === 'clear') { S.sumMod = 'all'; S.year = availableYears(eqSource().races)[0]; }
    render(); dlg.innerHTML = eqFilterHtml();
  });
}

// ---------- Instagram: periodo en el cuadradito de filtros ----------
const IG_PERIODS = (year) => [['all', 'Todo lo guardado'], ['30', 'Últimos 30 días'], ['month', 'Este mes'], ['year', `Año ${year}`]];
function igFilterHtml() {
  const cur = S.igPeriod || 'all';
  return `<form method="dialog" class="dlg eqdlg"><h2>Periodo</h2><div class="eqd-chips">${IG_PERIODS(S.year).map(([k, l]) => `<button type="button" class="chip${k === cur ? ' on' : ''}" data-igp="${k}">${l}</button>`).join('')}</div>
    <div class="dlg-actions"><button type="button" class="btn" data-igp="all">Quitar filtro</button><button value="" class="btn primary">Listo</button></div></form>`;
}
document.getElementById('dialog').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-igp]'); if (!b) return;
  ev.preventDefault(); S.igPeriod = b.dataset.igp; render(); document.getElementById('dialog').innerHTML = igFilterHtml();
});

// ---------- Clasificaciones: quién lidera cada cosa, con gráfico mes a mes ----------
const hoursOf = (sec) => formatTime(sec, true);
const EQ_METRICS = [
  { k: 'races', label: 'Carreras', ico: 'flag', val: (r) => r.races, fmt: (n) => `${n}`, month: 'parts', mfmt: (n) => `${n}`, sum: true, unit: 'carreras',
    det: (r) => `${r.months?.size || 0} mes${(r.months?.size || 0) === 1 ? '' : 'es'} con carrera`, hint: 'Carreras en las que ha participado este año (cada una cuenta una vez).' },
  { k: 'pod', label: 'Podios', ico: 'trophy', val: (r) => r.p1 + r.p2 + r.p3, fmt: (n) => `${n}`, month: 'pod', mfmt: (n) => `${n}`, sum: true, unit: 'podios',
    det: (r) => `${r.p1 ? `🥇${r.p1} ` : ''}${r.p2 ? `🥈${r.p2} ` : ''}${r.p3 ? `🥉${r.p3}` : ''}`.trim(), hint: 'Podios (1º, 2º o 3º) de su categoría, también en etapas.' },
  { k: 'wins', label: 'Victorias', ico: 'medal', val: (r) => r.p1, fmt: (n) => `${n}`, month: 'wins', mfmt: (n) => `${n}`, sum: true, unit: 'victorias',
    det: (r) => `${r.p1 + r.p2 + r.p3} podio${r.p1 + r.p2 + r.p3 === 1 ? '' : 's'} en total`, hint: 'Primeros puestos de su categoría.' },
  { k: 'km', label: 'Km', ico: 'ruler', val: (r) => r.km, fmt: (n) => kmText(Math.round(n)), month: 'km', mfmt: (n) => kmShort(n), sum: true, unit: 'km',
    det: (r) => `${r.races} carrera${r.races === 1 ? '' : 's'}`, hint: 'Kilómetros de las carreras en las que ha participado (solo las que tienen distancia indicada).' },
  { k: 'kmday', label: 'Km/día', ico: 'route', val: (r) => (r.kmDays ? r.km / r.kmDays : 0), fmt: (n) => perDayText(n), sum: false,
    det: (r) => `${kmText(Math.round(r.km))} en ${r.kmDays} ${r.kmDays === 1 ? 'día' : 'días'} de competición`, hint: 'Km por día de competición: los km de sus carreras entre los días de cada prueba (solo las que tienen distancia). Una prueba de 3 días con 240 km son 80 km/día.' },
  { k: 'speed', label: 'Km/h', ico: 'timer', val: (r) => (r.secTimed ? r.kmTimed / (r.secTimed / 3600) : 0), fmt: (n) => speedText(n), sum: false,
    det: (r) => `${kmText(Math.round(r.kmTimed))} en ${formatTime(r.secTimed, true)}`, hint: 'Velocidad media: km entre horas de competición (solo carreras con distancia y tiempo). Compara mejor dentro de una misma modalidad: usa el filtro de arriba.' },
  { k: 'kmrace', label: 'Km/carrera', ico: 'ruler', val: (r) => (r.kmRaces ? r.km / r.kmRaces : 0), fmt: (n) => kmText(Math.round(n)), sum: false,
    det: (r) => `${kmText(Math.round(r.km))} en ${r.kmRaces} ${r.kmRaces === 1 ? 'carrera' : 'carreras'}`, hint: 'Distancia media de sus carreras: los km totales entre el número de carreras (solo las que tienen distancia).' },
  { k: 'kmtrip', label: 'Carrera/viaje', ico: 'compass', val: (r) => (r.tripBoth ? r.kmBoth / r.tripBoth : 0), fmt: (n) => ratioX(n), sum: false,
    det: (r) => `${kmText(Math.round(r.kmBoth))} de carrera · ${kmText(r.tripBoth)} de viaje`, hint: 'Km que compite por cada km que se desplaza (ida y vuelta; solo carreras con distancia y ubicación). 2 ultras de 800 km cerca de casa compensan tanto como muchas carreras cortas muy lejos.' },
  { k: 'elev', label: 'Desnivel', ico: 'mountain', val: (r) => r.elev, fmt: (n) => elevText(n), month: 'elev', mfmt: (n) => kmShort(n), sum: true, unit: 'm',
    det: (r) => `media ${elevText(Math.round(r.elev / Math.max(1, r.races)))} por carrera`, hint: 'Desnivel positivo de las carreras en las que ha participado (solo las que lo tienen indicado).' },
  { k: 'trip', label: 'Viaje', ico: 'compass', val: (r) => r.trip, fmt: (n) => kmText(n), month: 'trip', mfmt: (n) => kmShort(n), sum: true, unit: 'km',
    det: (r) => `media ${kmText(Math.round(r.trip / 2 / Math.max(1, r.tripN)))} de ida por carrera`, hint: 'Km de desplazamiento (ida y vuelta, estimados desde un punto a medio camino entre Monzón y Lleida). Orientativo.' },
  { k: 'time', label: 'Tiempo', ico: 'timer', val: (r) => r.time, fmt: (n) => hoursOf(n), month: 'time', mfmt: (n) => `${Math.round(n / 3600)}h`, sum: true, unit: 'tiempo',
    det: (r) => `${r.timed} de ${r.races} carrera${r.races === 1 ? '' : 's'} con tiempo`, hint: 'Horas encima de la bici en carrera con el maillot del club: el tiempo total de las carreras en las que se puso el tiempo. Quien hace 2 carreras de 60 h suma más que quien hace 10 de 1 h.' },
  { k: 'cost', label: 'Gasto', ico: 'money', val: (r) => r.cost, fmt: (n) => euros(n), month: 'cost', mfmt: (n) => `${Math.round(n)}`, sum: true, unit: '€',
    det: (r) => `media ${euros(Math.round((r.cost / Math.max(1, r.races)) * 10) / 10)} por carrera`, hint: 'Lo que costarían las inscripciones de las carreras en las que ha participado (precios indicados; no lo que haya pagado).' },
  { k: 'disc', label: 'Versátil', ico: 'layers', val: (r) => Object.keys(r.discs || {}).length, fmt: (n) => `${n}`, sum: false,
    det: (r) => Object.keys(r.discs || {}).map((k) => { const [m, sub] = k.split('|'); return sub || m; }).slice(0, 4).join(', '), hint: 'Disciplinas distintas en las que ha corrido.' },
  { k: 'mon', label: 'Meses', ico: 'calcheck', val: (r) => r.months?.size || 0, fmt: (n) => `${n}`, sum: false,
    det: (r) => `${r.races} carreras`, hint: 'Meses distintos del año con alguna carrera.' },
];
/** Cifra compacta para las barras de cada mes: 4,3k, 840… */
/** Formatos de los ratios: «7:35/km», «28,6 km/h», «67,5 km/día», «1,6×», «80 km». */
const paceText = (secPerKm) => { const t = Math.round(secPerKm), m = Math.floor(t / 60), x = t % 60; return `${m}:${String(x).padStart(2, '0')}/km`; };
const speedText = (n) => `${(Math.round(n * 10) / 10).toLocaleString('es-ES')} km/h`;
const perDayText = (n) => `${(Math.round(n * 10) / 10).toLocaleString('es-ES')} km/día`;
const ratioX = (n) => `${(n < 1 ? Math.round(n * 100) / 100 : Math.round(n * 10) / 10).toLocaleString('es-ES')}×`;
const kmShort = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')}k` : `${Math.round(n)}`);
/** Barras de un dato mes a mes (suma de todo el equipo). */
function monthBars(pk, key, mfmt, cls = '') {
  const m = pk.s.byMonth, mx = Math.max(1, ...m.map((x) => x[key] || 0));
  return `<div class="rs-wk rs-elev rb-months ${cls}" role="img" aria-label="Evolución mes a mes">${m.map((x) => `<div><em>${x[key] ? mfmt(x[key]) : ''}</em><span style="height:${((x[key] || 0) / mx) * 100}%"></span><b>${MES3[x.month].slice(0, 1).toUpperCase()}</b></div>`).join('')}</div>`;
}
/** Clasificación del equipo: eliges un dato (carreras, desnivel, viaje, tiempo…) y ves quién lidera, con barras y cómo va el equipo mes a mes. */
function rankingBoard(pk, { me = null } = {}) {
  const m = EQ_METRICS.find((x) => x.k === S.eqMetric) || EQ_METRICS[0];
  const rows = pk.s.perRunner.map((r) => ({ r, v: m.val(r) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v || a.r.name.localeCompare(b.r.name, 'es'));
  const mx = rows[0]?.v || 1, total = rows.reduce((n, x) => n + x.v, 0);
  const tabs = `<div class="rb-tabs" role="tablist" aria-label="Qué clasificar">${EQ_METRICS.map((x) => `<button type="button" class="rb-tab${x.k === m.k ? ' on' : ''}" data-act="eq-metric" data-k="${x.k}" role="tab" aria-selected="${x.k === m.k}">${ico(x.ico)}<span>${x.label}</span></button>`).join('')}</div>`;
  const row = ({ r, v }, i) => `<li class="rb-row${me && r.key === me ? ' me' : ''}"><span class="rb-pos p${Math.min(i + 1, 4)}">${i + 1}</span>${avatar(r.name)}<div class="rb-main"><span class="rb-name">${personTag(r.key, r.name)}${me && r.key === me ? '<i class="rb-you">tú</i>' : ''}</span><small>${m.det(r)}</small><span class="rs-bar warm"><i style="width:${(v / mx) * 100}%"></i></span></div><b class="rb-val">${m.fmt(v)}</b></li>`;
  const top = rows.slice(0, 8), rest = rows.slice(8);
  const sum = !rows.length ? '' : m.sum ? `Entre todos <b>${m.fmt(total)}</b> · media por corredor <b>${['races', 'pod', 'wins'].includes(m.k) ? String(Math.round((total / rows.length) * 10) / 10).replace('.', ',') : m.fmt(Math.round(total / rows.length))}</b> · ${rows.length} corredor${rows.length === 1 ? '' : 'es'}` : `Lidera <b>${esc(rows[0].r.name)}</b> con <b>${m.fmt(rows[0].v)}</b>`;
  return `<section class="card rs-card rb"><h2>Clasificaciones</h2>${tabs}
    ${rows.length ? `<p class="rb-sum">${sum}</p>${m.month ? `<h3>Todo el equipo, mes a mes</h3>${monthBars(pk, m.month, m.mfmt)}` : ''}
      <h3>${esc(m.label)}: quién lidera</h3><ol class="rb-list">${top.map(row).join('')}</ol>
      ${rest.length ? `<details class="rb-more"><summary>Ver los ${rest.length} restantes</summary><ol class="rb-list" start="9">${rest.map((x, i) => row(x, i + 8)).join('')}</ol></details>` : ''}`
      : `<p class="empty">Todavía no hay datos de «${esc(m.label)}» este año.</p>`}
    <p class="hint">${esc(m.hint)}</p></section>`;
}
/** Tiempo en carrera del equipo: totales y cobertura (la clasificación y el gráfico mes a mes están en «Clasificaciones»). */
function resTimeCard(pk) {
  const t = pk.s.totals;
  if (!t.timed) return '';
  const per = Math.round(t.time / t.timed);
  return `<section class="card rs-card"><h2>${ico('timer')} Tiempo en carrera</h2>
    <div class="rs-tiles"><div class="rs-tile">${ico('timer')}<small>Tiempo total</small><b>${esc(hoursOf(t.time))}</b><em>entre todos${pk.hasPrev && pk.prev.totals.time ? ` ${rsDelta(pk, t.time, pk.prev.totals.time, (n) => hoursOf(n))}` : ''}</em></div>
      <div class="rs-tile">${ico('timer')}<small>Media por carrera</small><b>${esc(hoursOf(per))}</b><em>${t.timed} de ${t.participations} participaciones con tiempo</em></div></div>
    <h3>Tiempo del equipo, mes a mes</h3>${monthBars(pk, 'time', (n) => `${Math.round(n / 3600)}h`)}
    <p class="hint">Solo cuentan las carreras en las que el corredor puso su tiempo. Quién ha estado más tiempo, en «Clasificaciones» (Tiempo).</p></section>`;
}

function viewSummary() {
  const years = availableYears(S.data.races);
  if (!years.includes(S.year)) S.year = years[0];
  const base = yearSummary(S.year, S.data.races, S.data.runners);
  const mods = base.byModality.filter((m) => m.races > 0);
  if (S.sumMod && S.sumMod !== 'all' && !mods.some((m) => m.modality === S.sumMod.split('|')[0])) S.sumMod = 'all';
  const mod = S.sumMod && S.sumMod !== 'all' ? S.sumMod : null;
  const modLabel = mod ? mod.split('|').filter(Boolean).join(' · ') : '';
  const tab = RES_TABS.some(([k]) => k === S.resTab) ? S.resTab : 'pan';
  const pk = resPack(S.year, mod);
  const body = { pan: resPanorama, pod: resPodiums, eq: resTeam, alc: resReach }[tab](pk);
  const filterOn = !!mod || S.year !== years[0];
  return frame('Resumen', `<div class="eq-bar"><nav class="rs-tabs" role="tablist" aria-label="Apartados del resumen">${RES_TABS.map(([k, l, ic]) => `<button type="button" class="${k === tab ? 'on' : ''}" data-act="res-tab" data-t="${k}" role="tab" aria-selected="${k === tab}">${ico(ic)}<span>${l}</span></button>`).join('')}</nav>
      <button type="button" class="eq-fbtn${filterOn ? ' on' : ''}" data-act="eq-filters" aria-label="Filtros${filterOn ? ' (activos)' : ''}" title="Filtros">${icon(ICON_FILTER)}${filterOn ? '<i class="fdot"></i>' : ''}</button></div>
    ${filterOn ? `<div class="eq-active"><span>${S.year}${mod ? ` · ${esc(modLabel)}` : ''}</span><button type="button" class="link" data-act="eq-clear">Quitar filtros ✕</button></div>` : ''}
    ${body}
    <section class="card rs-card rs-links"><h2>Informes y exportar</h2>
      <a class="rs-link" href="#/memoria">${ico('book')}<span><b>Memoria para sponsors</b><small>Una página limpia para imprimir o PDF, sin bonos ni contratos</small></span>${ico('go')}</a>
      <a class="rs-link" href="#/computo">${ico('money')}<span><b>Cómputo de la temporada</b><small>Bonos, control antes de cerrar e informe por corredor</small></span>${ico('go')}</a>
      <a class="rs-link" href="#/calidad">${ico('list')}<span><b>Datos incompletos</b><small>Carreras a las que les falta algo</small></span>${ico('go')}</a>
      <div class="row-btns"><button class="btn" data-act="csv-year">📊 Resultados ${S.year} (Excel)</button><button class="btn" data-act="tp-csv-runners">📊 Corredores</button><button class="btn" data-act="tp-csv-disc">📊 Disciplinas</button></div></section>
    <details class="card data-det" data-open-key="datos"${S.open?.datos ? ' open' : ''}><summary>⚙️ Datos y copias <small class="muted">· copia de seguridad, restaurar, aspecto, versión y cerrar sesión</small></summary>${dataBody()}</details>`);
}

/** Resumen del equipo para los corredores (solo lectura). */
function viewTeam() {
  const t = S.team;
  if (!t) return frame('Resumen del equipo', `${previewBanner()}<p class="empty">Cargando…</p>`, { rtab: 'equipo' });
  if (t.failed) return frame('Resumen del equipo', `${previewBanner()}<p class="card warn">${esc(t.failed)}</p>`, { rtab: 'equipo' });
  return frame('Resumen del equipo', `${previewBanner()}<h2 class="eq-title">Resumen del equipo ${ico('bars')}</h2>
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

const euros = (n) => `${Number(n || 0).toLocaleString('es-ES')}\u00a0€`;
const bonusCfg = (year) => bonusConfigFor(S.data?.settings?.bonus, year);

/** Barra de progreso con las marcas de los tramos y del mínimo. */
function bonusBar(st, cfg, planned = 0) {
  const tiers = st.tiers || tiersFor(cfg, st.contract);
  const extra = st.extra || 0, total = st.count + extra;
  const max = Math.max(...tiers.map((t) => t.races), cfg.minimum || 0, total + planned, 1);
  const pct = (n) => `${Math.min(100, (n / max) * 100).toFixed(1)}%`;
  return `<div class="bbar" role="img" aria-label="${st.count} carreras${extra ? ` más ${extra} de plus por podio en una general` : ''}, de ${max}">
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
  if (st.extra) parts.push(`<span class="extra-chip">🏆 plus +${st.extra} por podio en una general = <b>${st.bonusCount}</b> para el bono</span>`);
  if (st.suspended) parts.push(`<span class="extra-chip">⛔ +${st.suspended} suspendida${st.suspended === 1 ? '' : 's'}</span>`);
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
    <p class="hint">🏆 Plus de bonificación: un podio en la general final de una liga suma +${cfg.circuitExtra ?? 4} carreras para la bonificación, pero no cuenta para el mínimo de ${cfg.minimum}. Una carrera suspendida cuenta para el mínimo, no para el bono.</p>
    <p class="hint">💶 <b>Saldo</b> = bono − penalización (si la temporada acabara hoy). El contrato permite descontar la penalización de lo que el club deba al corredor. Saldo total: <b>${balanceText(totalPay - totalPen)}</b>.</p>
    <p class="hint">Cuentan las carreras con resultados de ${S.year} y las ya disputadas en las que el corredor puso su puesto, aunque aún no las hayas pasado a resultados; una carrera de varios días cuenta un día cada uno. La parte clara de la barra suma las inscripciones de ${S.year} pendientes.</p>
    <ul class="bonus-list">${rows.map((r) => `<li>
      <div class="bonus-head"><span class="name"><a class="name-link" href="#/corredor/${r.runner.id}">${esc(r.runner.name)} ›</a></span>
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
          <label>Carreras de plus por podio en una general<input type="number" min="0" name="circuit_extra" value="${esc(cfg.circuitExtra ?? 4)}" required></label>
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
    <summary><b>🏆 Plus de bonificación: podios en la general final (${list.length})</b></summary>
    <p class="hint">Cláusula 9: cada podio en la clasificación general final de una liga o circuito completo (absoluta o de categoría) da el <b>plus de bonificación: +${per} carreras para el bono</b>. No cuentan para el mínimo.</p>
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
      <button class="btn">Añadir plus por podio ${S.year}</button>
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
function adminRunnerRaces(r, year, forceOpen = false) {
  const today = todayISO();
  const races = S.data.races.filter((x) => yearOf(x.date) === year && x.results.some((y) => y.runner_id === r.id))
    .sort((a, b) => b.date.localeCompare(a.date));
  const regs = S.data.registrations.filter((g) => g.entries.some((e) => e.runner_id === r.id)).sort((a, b) => a.date.localeCompare(b.date));
  const pending = regs.filter((g) => g.date < today && !g.suspended), upcoming = regs.filter((g) => g.date >= today || g.suspended);
  const upcomingYear = upcoming.filter((g) => yearOf(g.date) === year);
  const days = races.reduce((n, x) => n + numDays(x.date, x.end_date), 0);
  const key = 'rr-' + r.id;
  const res = (x) => { const y = x.results.find((z) => z.runner_id === r.id);
    return y.position ? `${isPodium(y.position) ? medal(y.position) + ' ' : ''}${y.position}º` : '<span class="muted">sin puesto</span>'; };
  return `<details class="runner-races"${forceOpen || S.open?.[key] ? ' open' : ''} data-open-key="${key}">
    <summary>Carreras ${year}: <b>${races.length}</b>${days !== races.length ? ` (${days} días)` : ''} · apuntado a ${upcomingYear.length} próxima${upcomingYear.length === 1 ? '' : 's'}${upcoming.length !== upcomingYear.length ? ` (+${upcoming.length - upcomingYear.length} de otros años)` : ''}${pending.length ? ` · ${pending.length} ya disputada${pending.length === 1 ? '' : 's'} sin pasar a resultados` : ''}</summary>
    <p class="hint">Toca una carrera para abrirla y editarla o borrarla.</p>
    ${races.length ? `<ul class="mini-list">${races.map((x) => miniRow(x, `<a class="pos" href="#/carreras/${x.id}/${r.id}">${res(x)} ✏️</a>`, `#/carreras/${x.id}/${r.id}`)).join('')}</ul>` : `<p class="hint">Sin carreras con resultados en ${year}.</p>`}
    ${pending.length ? `<p class="hint"><b>Ya disputadas, aún sin pasar a resultados</b> (le cuentan para el bono si puso su puesto):</p><ul class="mini-list">${pending.map((g) => miniRow(g, `<a class="btn small" href="#/inscripciones/${g.id}/${r.id}">✏️ Editar</a>`, `#/inscripciones/${g.id}/${r.id}`)).join('')}</ul>` : ''}
    ${upcoming.length ? `<p class="hint"><b>Próximas:</b></p><ul class="mini-list">${upcoming.map((g) => miniRow(g, `<a class="btn small" href="#/inscripciones/${g.id}/${r.id}">✏️ Editar</a>`, `#/inscripciones/${g.id}/${r.id}`)).join('')}</ul>` : ''}
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
  try { S.myTpl = await api.runnerContractTemplate(S.code || S.previewCode); } catch { S.myTpl = null; }
  if (S.runnerData) render();
}

function myDocsCard() {
  const docs = S.myDocs, tpl = S.myTpl;
  if (!docs) return '';
  const row = (x, kind, act, idAttr) => `<li class="file-row"><span class="file-ic ${/pdf/.test(x.mime) ? 'pdf' : 'img'}">${ico('file')}</span>
    <span class="file-tx"><b>${esc(x.title)}</b><small class="muted">(${kind} · ${fmtSize(x.size)})</small></span>
    <button class="btn ghost small" data-act="${act}"${idAttr}>Ver</button></li>`;
  const list = [
    tpl ? row(tpl, esc(contractLabel(tpl.contract)), 'my-tpl-open', '') : '',
    ...docs.map((x) => row(x, `Temporada ${x.year}`, 'my-doc-open', ` data-id="${x.id}"`)),
  ].filter(Boolean);
  return `<section class="card docs-block"><h2>${ico('folder')}Mi contrato y documentos</h2>
    ${list.length ? `<ul class="file-list">${list.join('')}</ul>` : '<p class="empty small">La dirección aún no ha subido tu contrato.</p>'}
  </section>`;
}

/** Ficha del corredor (dirección): todo lo suyo en una pantalla. */
function viewRunnerCard(id) {
  const r = runnerById(id);
  if (!r) return frame('Corredor', '<p class="empty">Este corredor no existe.</p>', { back: '#/corredores' });
  const years = availableYears(S.data.races);
  if (!years.includes(S.year)) S.year = years[0];
  const cfg = bonusCfg(S.year);
  const row = yearBonuses(S.year, S.data.races, S.data.registrations, S.data.runners, cfg, S.data.circuitPodiums || []).find((b) => b.runner.id === r.id);
  const sum = yearSummary(S.year, S.data.races, S.data.runners).perRunner.find((x) => x.key === r.id);
  const docs = (S.docs || []).filter((x) => x.runner_id === r.id);
  const circuits = (S.data.circuitPodiums || []).filter((c) => c.runner_id === r.id && c.year === S.year);
  const tot = S.data.races.reduce((n, x) => n + x.results.filter((y) => y.runner_id === r.id).length, 0);
  const today = todayISO();
  const mine = (g) => (g.entries || []).some((e) => e.runner_id === r.id);
  const pendRes = board().pendingResults.filter((x) => x.missing.includes(r.id));
  const next = S.data.registrations.filter((g) => !g.suspended && g.date >= today && mine(g)).sort((p, q) => p.date.localeCompare(q.date));
  const tracked = Object.prototype.hasOwnProperty.call(r, 'last_seen'), sd = tracked ? seenDays(r.last_seen) : null;
  const yb = yearBonuses(new Date().getFullYear(), S.data.races, S.data.registrations, S.data.runners, bonusCfg(new Date().getFullYear()), S.data.circuitPodiums || []).find((x) => x.runner.id === r.id);
  return frame(r.name, `
    <section class="rc-hero">${avatar(r.name, 'big')}<div><h2>${esc(r.name)}</h2><p>${[r.category, contractLabel(r.contract)].filter(Boolean).map(esc).join(' · ')}</p></div></section>
    <div class="rc-stats">
      <div class="${tracked ? 's-' + seenLevel(sd) : ''}"><i class="seen s-${tracked ? seenLevel(sd) : 'none'}"></i><b>${tracked ? (sd == null ? 'Nunca' : sd === 0 ? 'Hoy' : `${sd} d`) : '—'}</b><span>${tracked ? 'última vez en la app' : 'actividad (falta SQL)'}</span></div>
      <div class="${yb && !yb.reachesMinimum ? 'bad' : yb?.tier ? 'good' : ''}"><b>${yb ? yb.bonusCount : 0}</b><span>${yb ? (yb.reachesMinimum ? (yb.tier ? `bono ${euros(yb.amount)}` : 'mínimo hecho') : `faltan ${yb.missingToMinimum}`) : 'carreras'}</span></div>
      <a class="${pendRes.length ? 'warn' : ''}" href="${pendRes.length ? `#/inscripciones/${pendRes[0].reg.id}` : '#/corredor/' + r.id}"><b>${pendRes.length}</b><span>sin resultado</span></a>
      <div><b>${next.length}</b><span>próximas${next[0] ? `: ${formatDate(next[0].date, false)}` : ''}</span></div>
    </div>
    ${pendRes.length ? `<p class="card warn small">🏁 Le falta poner su resultado en: <b>${pendRes.map((x) => esc(x.reg.name)).join(', ')}</b>.</p>` : ''}
    <section class="card stack">
      <label>Categoría${catSelect(`data-runner-cat="${r.id}"`, r.category || '')}</label>
      <label>Contrato${contractSelect(`data-runner-contract="${r.id}"`, r.contract || '')}</label>
      <label>Turnos (escamot)<select data-runner-shift="${r.id}" aria-label="Turnos de ${esc(r.name)}"><option value="">No lo usa</option><option value="on"${r.shift_enabled && !r.shift_group ? ' selected' : ''}>Lo elige él en su perfil</option>${USPAC_GROUPS.map((g) => `<option value="${g}"${r.shift_group === g ? ' selected' : ''}>Escamot ${g.slice(1)}</option>`).join('')}</select></label>
      <p class="muted small">${tot} carrera${tot === 1 ? '' : 's'} en total${r.created_at ? ` · en el club desde ${formatDate(String(r.created_at).slice(0, 10), false)}` : ''}</p>
      <div class="row"><button class="btn primary" data-act="runner-menu" data-id="${r.id}">${ico('share')} Enlace</button>
        <button class="btn" data-act="runner-do" data-a="preview" data-id="${r.id}">Ver su pantalla</button></div>
    </section>
    ${yearPicker(years)}
    ${row ? `<section class="card bonus-card"><h2>Bono ${S.year}</h2>
      ${penaltyAlert(row, cfg, S.year, { who: 'Le' })}
      ${bonusBar(row, cfg, row.planned)}
      <p class="bonus-text">${bonusText(row, 'Lleva')}${row.planned ? ` · <span class="muted">con sus ${row.planned} inscrita${row.planned === 1 ? '' : 's'}: ${row.projected.bonusCount}</span>` : ''}</p>
      ${balanceLine(row)}
      ${circuits.length ? `<p class="hint">🏆 Plus por podio en la general: ${circuits.map((c) => `${medal(c.position)} ${esc(c.circuit)}${c.status === 'confirmado' ? '' : ' (pendiente)'}`).join(' · ')}</p>` : ''}
      <a class="btn small ghost" href="#/bonos">Ver todos los bonos</a></section>` : ''}
    ${sum ? `<section class="card"><h2>${S.year} en cifras</h2>
      <div class="sum-big sum-mini"><div><b>${sum.races}</b><span>carreras</span></div><div><b>${sum.p1}</b><span>🥇</span></div><div><b>${sum.p2}</b><span>🥈</span></div><div><b>${sum.p3}</b><span>🥉</span></div></div>
      ${sum.km ? `<p class="muted small">📏 ${kmText(sum.km)} recorridos en ${S.year}</p>` : ''}
      ${sum.timed ? `<p class="muted small">⏱️ ${formatTime(sum.time, true)} en carrera${sum.timed < sum.races ? ` (con tiempo: ${sum.timed} de ${sum.races} carreras)` : ''}</p>` : ''}
      ${sum.races ? `<div class="bar seg">${MODALITIES.filter((x) => sum.mods[x]).map((x) => `<span class="${modClass(x)}" style="flex:${sum.mods[x]}" title="${esc(x)}: ${sum.mods[x]}"></span>`).join('')}</div>
        <div class="mod-legend">${MODALITIES.filter((x) => sum.mods[x]).map((x) => `<span class="${modClass(x)}"><i class="dot"></i>${esc(x)} ${sum.mods[x]}</span>`).join('')}</div>` : '<p class="muted small">Sin carreras este año.</p>'}</section>` : ''}
    <h2 class="section">Carreras ${S.year}</h2>
    ${adminRunnerRaces(r, S.year, true)}
    <section class="card"><h2>📄 Contrato y documentos</h2>
      ${S.docs === null ? '<p class="muted">Aún no están activados los documentos.</p>'
        : docs.length ? `<ul class="mini-list">${docs.map((x) => `<li><div><b>${docIcon(x.mime)} ${esc(x.title)}</b><small class="muted">Temporada ${x.year} · ${fmtSize(x.size)}</small></div>
          <button class="btn small" data-act="doc-open" data-id="${x.id}">Ver</button></li>`).join('')}</ul>` : '<p class="empty small">Todavía no hay documentos.</p>'}
      <a class="btn small" href="#/docs/${r.id}">Subir o borrar documentos</a></section>
    <details class="card more-det"><summary><b>Más opciones</b> <span class="muted">· cambiar nombre, descargar sus datos, borrar</span></summary>
      <div class="stack"><button class="btn" data-act="runner-do" data-a="rename" data-id="${r.id}">Cambiar nombre</button>
        <button class="btn" data-act="runner-do" data-a="export" data-id="${r.id}">Descargar sus datos</button>
        <button class="btn danger ghost" data-act="runner-do" data-a="delete" data-id="${r.id}">Borrar corredor</button></div></details>`, { back: '#/corredores' });
}

/** Una línea, arriba de Corredores, que abre la hoja con las respuestas del pedido de ropa. El enlace se guarda en los ajustes, que solo ve la dirección. */
function clothingLine() {
  const cur = S.data?.settings?.enlaces_direccion?.ropa_respuestas || '';
  return cur
    ? `<div class="line-link"><a class="btn" href="${esc(cur)}" target="_blank" rel="noopener noreferrer" title="Respuestas del pedido de ropa">📋 Pedidos de ropa ↗</a>
        <button class="icon-btn" data-act="dir-link-edit" aria-label="Cambiar el enlace de las respuestas" title="Cambiar el enlace">✏️</button></div>`
    : '<button class="btn block ghost" data-act="dir-link-edit">📋 Poner el enlace de los pedidos de ropa</button>';
}

/** Pregunta un enlace en una ventana. Devuelve el texto escrito, '' si se pide quitarlo, o null si se cancela. */
function askLink(title, text, current) {
  return new Promise((resolve) => {
    const dlg = document.getElementById('dialog');
    dlg.innerHTML = `<form method="dialog" class="dlg"><h2>${esc(title)}</h2><p>${esc(text)}</p>
      <label>Enlace<input name="url" type="url" inputmode="url" placeholder="https://docs.google.com/spreadsheets/d/…" value="${esc(current)}" autocomplete="off"></label>
      <p class="hint">🔒 Solo lo verá la dirección. La hoja lleva datos personales: en Google, déjala con acceso restringido.</p>
      <div class="dlg-actions"><button value="save" class="btn primary">Guardar</button>${current ? '<button value="clear" class="btn danger ghost">Quitar el enlace</button>' : ''}<button value="" class="btn ghost">Cancelar</button></div></form>`;
    dlg.onclose = () => { const v = dlg.returnValue; resolve(v === 'save' ? dlg.querySelector('input[name="url"]').value.trim() : v === 'clear' ? '' : null); };
    dlg.returnValue = '';
    dlg.showModal();
  });
}

/** Ventana para elegir la categoría con la que se apunta alguien (obligatoria). Devuelve la categoría o null si cancela. */
/** Ventana «Pago de la inscripción»: importe opcional; devuelve {paid, amount} o null. */
function askPaid(name, mine) {
  return new Promise((resolve) => {
    const dlg = document.getElementById('dialog');
    dlg.innerHTML = `<form method="dialog" class="dlg"><h2>Pago de la inscripción</h2><p><b>${esc((name || '').toLocaleUpperCase('es'))}</b></p>
      <p class="hint">Anota que ya la has pagado en la web de la carrera. Tus compañeros verán que la tienes pagada; <b>el importe y el día solo los ves tú</b>.</p>
      <label>Importe pagado (opcional)<input name="amount" type="number" inputmode="decimal" step="0.01" min="0" max="10000" placeholder="Ej.: 25" value="${mine?.paid_amount ?? ''}"></label>
      <label>Día del pago<input name="date" type="date" max="${todayISO()}" value="${mine?.paid_on || todayISO()}"></label>
      <div class="dlg-actions"><button value="ok" class="btn primary">${mine?.paid ? 'Guardar' : 'Ya la he pagado'}</button>${mine?.paid ? '<button value="no" class="btn danger" formnovalidate>Quitar el pago</button>' : ''}<button value="" class="btn ghost" formnovalidate>Cancelar</button></div></form>`;
    dlg.onclose = () => {
      const v = dlg.returnValue;
      if (v === 'no') return resolve({ paid: false, amount: null });
      if (v !== 'ok') return resolve(null);
      const raw = dlg.querySelector('input[name="amount"]').value.trim().replace(',', '.');
      resolve({ paid: true, amount: raw === '' || !(Number(raw) >= 0) ? null : Math.round(Number(raw) * 100) / 100, date: dlg.querySelector('input[name="date"]').value || null });
    };
    dlg.returnValue = '';
    dlg.showModal();
  });
}

/** Editar mi nota de una inscripción (privada). Devuelve el texto (vacío = borrar) o null si se cancela. */
function askNote(name, current = '') {
  return new Promise((resolve) => {
    const dlg = document.getElementById('dialog');
    dlg.innerHTML = `<form method="dialog" class="dlg"><h2>Mis notas</h2><p><b>${esc(name || '')}</b></p>
      <p class="hint">Apunta lo que quieras de esta carrera: hotel, alquiler de coche, horarios… <b>Solo la ves tú</b>: ni la dirección ni tus compañeros.</p>
      <label>Nota<textarea name="note" rows="6" maxlength="1000" placeholder="Hotel Plaza, reserva 12–13 ene (ref. 4821)…">${esc(current)}</textarea></label>
      <div class="dlg-actions"><button value="ok" class="btn primary">Guardar</button>${current ? '<button value="del" class="btn danger" formnovalidate>Borrar la nota</button>' : ''}<button value="" class="btn" formnovalidate>Cancelar</button></div></form>`;
    dlg.onclose = () => { const v = dlg.returnValue; if (v === 'del') return resolve(''); if (v !== 'ok') return resolve(null); resolve(dlg.querySelector('textarea[name="note"]').value); };
    dlg.returnValue = '';
    dlg.showModal();
    dlg.querySelector('textarea')?.focus();
  });
}

function askCategory(name, okLabel = 'Apuntarme', current = '') {
  return new Promise((resolve) => {
    const dlg = document.getElementById('dialog');
    dlg.innerHTML = `<form method="dialog" class="dlg"><h2>¿En qué categoría?</h2><p><b>${esc((name || '').toLocaleUpperCase('es'))}</b></p>
      <label>Tu categoría${catSelect('name="cat" required', current, 'Elige tu categoría')}</label>
      <div class="dlg-actions"><button value="ok" class="btn primary">${esc(okLabel)}</button><button value="" class="btn ghost" formnovalidate>Cancelar</button></div></form>`;
    dlg.onclose = () => resolve(dlg.returnValue === 'ok' ? dlg.querySelector('select[name="cat"]').value || null : null);
    dlg.returnValue = '';
    dlg.showModal();
  });
}

/** Pestañas de arriba de Corredores: plantilla y contratos por tipo. */
const runnersTabs = (cur) => `<div class="years subtabs">${[['corredores', '👥 Plantilla'], ['contratos', '📄 Contratos'], ['computo', '📊 Cómputo']].map(([v, l]) =>
  `<a class="chip${cur === v ? ' on' : ''}" href="#/${v}" aria-current="${cur === v}">${l}</a>`).join('')}${(() => { const u = S.data?.settings?.enlaces_direccion?.ropa_respuestas; return u ? `<a class="chip ext" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="Respuestas del pedido de ropa (se abre en otra pestaña)">👕 Ropa ↗</a>` : ''; })()}</div>`;

/** Cómputo de fin de temporada: lo que ha hecho cada corredor y descarga para Excel. */
function viewSeasonCount() {
  const years = availableYears(S.data.races);
  if (!years.includes(S.year)) S.year = years[0];
  const rows = seasonByRunner(S.year, S.data.races, S.data.runners, contractLabel);
  const detail = seasonDetail(S.year, S.data.races);
  const ix = (name) => SEASON_COLUMNS.indexOf(name);
  const list = rows.filter((r) => r[ix('Carreras')] > 0);
  const idle = rows.filter((r) => r[ix('Carreras')] === 0 && !String(r[0]).endsWith('(baja)'));
  return frame('Corredores', `${runnersTabs('computo')}
    ${yearPicker(years)}
    <section class="card stack"><h2>✅ Control antes de cerrar ${S.year}</h2>
      <ul class="chk-list">${seasonChecks(S.year).map((c) => `<li class="${c.info ? 'info' : c.bad ? 'bad' : 'ok'}">${c.info ? 'ℹ️' : c.bad ? '⚠️' : '✅'} ${c.bad ? `<a href="${c.href}">${esc(c.text)} ›</a>` : esc(c.text)}</li>`).join('')}</ul>
    </section>
    <section class="card stack"><h2>📥 Cómputo de la temporada ${S.year}</h2>
      <p class="hint">Descarga los datos de participación para hacer el cómputo final. Se abren en Excel o Hojas de cálculo.</p>
      <a class="btn primary block" href="#/informe">🖨️ Informe visual de la temporada (para imprimir o PDF)</a>
      <p class="hint">Una página clara con el <b>bono</b>, las penalizaciones, el saldo y lo que ha hecho cada corredor, para pasar los números a final de temporada.</p>
      <button class="btn block" data-act="season-csv">📊 Resumen por corredor, con bono (Excel)</button>
      <p class="hint">Una fila por corredor: carreras, días, modalidades, podios, km, tiempo total, provincias, países y bono (tramo, bono, penalización y saldo).</p>
      <button class="btn block" data-act="season-detail-csv" ${detail.length ? '' : 'disabled'}>🗺️ Dónde ha ido cada uno (${detail.length})</button>
      <p class="hint">Una fila por carrera de cada corredor: fecha, lugar, provincia, modalidad, km, puesto y tiempo.</p>
      <p class="hint">Solo cuenta lo que ya está en <b>Carreras</b> (con resultados). Las inscripciones aún no pasadas a resultados no salen. El tiempo y los km salen solo donde se han puesto.</p>
    </section>
    <section class="card"><h2>Vista rápida · ${S.year}</h2>
      ${list.length ? `<ul class="mini-list">${list.map((r) => {
        const id = S.data.runners.find((x) => x.name === r[0])?.id;
        return `<li class="mini"><${id ? `a class="mini-main" href="#/corredor/${id}"` : 'div class="mini-main"'}><b>${esc(r[0])}</b>
          <small class="muted">${r[ix('Carreras')]} carrera${r[ix('Carreras')] === 1 ? '' : 's'} · ${r[ix('Días de carrera')]} día${r[ix('Días de carrera')] === 1 ? '' : 's'}${r[ix('Km')] ? ` · ${kmText(r[ix('Km')])}` : ''}${r[ix('Tiempo total (h:mm:ss)')] ? ` · ⏱️ ${r[ix('Tiempo total (h:mm:ss)')]}` : ''}${r[ix('Podios')] ? ` · 🏅 ${r[ix('Podios')]}` : ''}${r[ix('Provincias')] ? `<br>📍 ${esc(r[ix('Provincias')])}` : ''}</small></${id ? 'a' : 'div'}></li>`; }).join('')}</ul>`
        : '<p class="empty">Todavía no hay carreras con resultados este año.</p>'}
      ${idle.length ? `<p class="muted small">Sin carreras: ${esc(idle.map((r) => r[0]).join(', '))}.</p>` : ''}
    </section>`);
}

/** Cifras de una temporada: filas por corredor y totales. Es lo que se guarda al congelar el cierre. */
function seasonTotals(rows, year) {
  const t = rows.reduce((n, r) => ({ races: n.races + r.races, p: [n.p[0] + r.p[0], n.p[1] + r.p[1], n.p[2] + r.p[2]], km: n.km + r.km, time: n.time + r.time, timed: n.timed + r.timed,
    pay: n.pay + (r.b?.amount || 0), pen: n.pen + (r.b?.penalty || 0) }), { races: 0, p: [0, 0, 0], km: 0, time: 0, timed: 0, pay: 0, pen: 0 });
  return { ...t, podiums: t.p[0] + t.p[1] + t.p[2], bal: t.pay - t.pen, clubRaces: S.data.races.filter((r) => yearOf(r.date) === year).length,
    runners: rows.filter((r) => r.id).length, raced: rows.filter((r) => r.races).length };
}
function seasonModel(year) {
  const cfg = bonusCfg(year);
  const bonus = yearBonuses(year, S.data.races, S.data.registrations, S.data.runners, cfg, S.data.circuitPodiums || []);
  const bOf = new Map(bonus.map((b) => [b.runner.id, b]));
  const rows = seasonStats(year, S.data.races, S.data.runners, contractLabel).map((r) => { const b = bOf.get(r.id);
    return { id: r.id, name: r.name, cat: r.cat, contract: r.contract, races: r.races, days: r.days, p: r.p, podiums: r.podiums, km: r.km, time: r.time, timed: r.timed, provinces: r.provinces,
      b: b ? { count: b.bonusCount, extra: b.extra, reach: b.reachesMinimum, missing: b.missingToMinimum, tier: b.tier ? b.tier.races : null, top: b.tiers.at(-1)?.races || 1,
        amount: b.amount, penalty: b.penalty, planned: b.planned } : null }; });
  return { year, date: todayISO(), minimum: cfg.minimum, rows, tot: seasonTotals(rows, year) };
}

/** Control antes de cerrar: lo que puede falsear los números. */
function seasonChecks(year) {
  const today = todayISO(), yr = S.data.races.filter((r) => yearOf(r.date) === year);
  const names = (arr, n = 6) => arr.slice(0, n).join(', ') + (arr.length > n ? `… (+${arr.length - n})` : '');
  const noContract = S.data.runners.filter((r) => !CONTRACTS.some((c) => c.id === r.contract));
  const pending = S.data.registrations.filter((g) => !g.suspended && (g.end_date || g.date) < today && yearOf(g.date) === year);
  const noPos = yr.flatMap((r) => (r.results || []).filter((x) => x.position == null).map((x) => `${x.runner_name} (${r.name})`));
  const missing = yr.filter((r) => missingFields(r).length);
  const results = yr.flatMap((r) => r.results || []);
  const noTime = results.filter((x) => !(Number(x.time_seconds) > 0)).length;
  const pl = (n, a, b) => (n === 1 ? a : b);
  return [
    { bad: noContract.length, href: '#/corredores', text: noContract.length ? `${noContract.length} corredor${pl(noContract.length, '', 'es')} sin tipo de contrato (cambia el bono y la penalización): ${names(noContract.map((r) => r.name))}` : 'Todos los corredores tienen tipo de contrato' },
    { bad: pending.length, href: '#/inscripciones', text: pending.length ? `${pending.length} inscripci${pl(pending.length, 'ón', 'ones')} ya disputada${pl(pending.length, '', 's')} sin pasar a resultados: ${names(pending.map((g) => g.name))}` : 'No hay inscripciones disputadas pendientes de pasar a resultados' },
    { bad: noPos.length, href: '#/carreras', text: noPos.length ? `${noPos.length} participaci${pl(noPos.length, 'ón', 'ones')} sin puesto: ${names(noPos)}` : 'Todas las participaciones tienen puesto' },
    { bad: missing.length, href: '#/carreras', text: missing.length ? `${missing.length} carrera${pl(missing.length, '', 's')} sin provincia, km o formato (afecta a «dónde ha ido» y a los km): ${names(missing.map((r) => r.name))}` : 'Todas las carreras tienen provincia, km y formato' },
    { info: true, text: results.length ? `${results.length - noTime} de ${results.length} participaciones tienen tiempo (dato opcional)` : '' },
  ].filter((c) => c.text);
}

/** Cambios desde el cierre congelado (por corredor). */
function sinceClosing(live, frozen) {
  const old = new Map(frozen.rows.map((r) => [r.id || r.name, r]));
  const out = [];
  for (const r of live.rows) {
    const o = old.get(r.id || r.name);
    if (!o) { if (r.races) out.push(`${r.name}: nuevo (${r.races} carreras)`); continue; }
    const d = [];
    if (o.races !== r.races) d.push(`carreras ${o.races} → ${r.races}`);
    if ((o.b?.amount || 0) !== (r.b?.amount || 0)) d.push(`bono ${euros(o.b?.amount || 0)} → ${euros(r.b?.amount || 0)}`);
    if ((o.b?.penalty || 0) !== (r.b?.penalty || 0)) d.push(`penalización ${euros(o.b?.penalty || 0)} → ${euros(r.b?.penalty || 0)}`);
    if (d.length) out.push(`${r.name}: ${d.join(', ')}`);
  }
  return out;
}

const signEuros = (n) => (n > 0 ? `+${euros(n)}` : n < 0 ? `−${euros(-n)}` : euros(0));
const dateEs = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const podText = (r) => (r.podiums ? `${r.p[0] ? '🥇' + r.p[0] + ' ' : ''}${r.p[1] ? '🥈' + r.p[1] + ' ' : ''}${r.p[2] ? '🥉' + r.p[2] : ''}` : '—');
const barOf = (b) => `<div class="rp-bar ${b.reach ? (b.tier ? 'ok' : 'mid') : 'low'}"><i style="width:${Math.min(100, Math.round((b.count / b.top) * 100))}%"></i></div>`;
const barText = (b) => `${b.count}${b.extra ? ` (+${b.extra} plus)` : ''} · ${b.reach ? '✅ mínimo' : `⚠️ faltan ${b.missing}`}${b.tier ? ` · tramo ${b.tier}` : ''}${b.planned ? ` · ${b.planned} inscrita${b.planned === 1 ? '' : 's'}` : ''}`;

/** Hoja de un corredor: su bono y todas sus carreras de la temporada. */
function runnerSheet(r, year, minimum) {
  const list = S.data.races.filter((x) => yearOf(x.date) === year).flatMap((x) => (x.results || []).filter((y) => y.runner_id === r.id).map((y) => ({ x, y })))
    .sort((a, b) => a.x.date.localeCompare(b.x.date));
  const planned = S.data.registrations.filter((g) => yearOf(g.date) === year && !g.suspended && (g.entries || []).some((e) => e.runner_id === r.id && !e.self_position))
    .sort((a, b) => a.date.localeCompare(b.date));
  const b = r.b, sal = b ? b.amount - b.penalty : 0;
  return `<article class="report sheet">
    <header class="rp-head"><img src="icons/logo.png" alt=""><div><h2>${esc(r.name)}</h2><p>CC Monzón · Temporada ${year} · ${esc(r.contract)}${r.cat ? ' · ' + esc(r.cat) : ''}</p></div></header>
    <div class="rp-kpis">
      <div class="rp-kpi"><b>${r.races}</b><span>carreras${r.days !== r.races ? ` · ${r.days} días` : ''}</span></div>
      <div class="rp-kpi"><b>${podText(r)}</b><span>podios</span></div>
      <div class="rp-kpi"><b>${r.km ? kmText(r.km) : '—'}</b><span>km</span></div>
      <div class="rp-kpi"><b>${r.elev ? elevText(r.elev) : '—'}</b><span>desnivel</span></div>
      <div class="rp-kpi"><b>${r.timed ? formatTime(r.time, true) : '—'}</b><span>tiempo en carrera</span></div>
      ${b ? `<div class="rp-kpi good"><b>${euros(b.amount)}</b><span>bono</span></div><div class="rp-kpi bad"><b>${euros(b.penalty)}</b><span>penalización</span></div>
      <div class="rp-kpi ${sal > 0 ? 'good' : sal < 0 ? 'bad' : ''}"><b>${signEuros(sal)}</b><span>${sal > 0 ? 'el club debe' : sal < 0 ? 'a favor del club' : 'saldo'}</span></div>` : ''}
    </div>
    ${b ? `<div class="rp-box"><b>Camino al bono · mínimo ${minimum}</b>${barOf(b)}<small>${barText(b)}</small></div>` : ''}
    ${list.length ? `<div class="rp-scroll"><table class="rp-table"><thead><tr><th>Fecha</th><th>Carrera</th><th>Lugar</th><th>Modalidad</th><th>Km</th><th>Puesto</th><th>Tiempo</th></tr></thead><tbody>
      ${list.map(({ x, y }) => `<tr><td class="num">${esc(formatRange(x.date, x.end_date))}</td><td><b>${esc(x.name)}</b>${x.race_type === 'circuito' && x.circuit ? `<small>${esc(x.circuit)}</small>` : ''}</td>
        <td>${esc([x.place, x.province].filter(Boolean).join(', ') || '—')}</td><td>${esc(x.modality)}${x.subtype ? `<small>${esc(x.subtype)}</small>` : ''}</td><td class="num">${x.km ? kmText(x.km) : '—'}</td>
        <td class="num">${y.position ? `${isPodium(y.position) ? medal(y.position) + ' ' : ''}${y.position}º` : '—'}</td><td class="num">${y.time_seconds ? formatTime(y.time_seconds) : '—'}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="empty">Sin carreras con resultado esta temporada.</p>'}
    ${planned.length ? `<p class="rp-note"><b>Inscrito, pendiente:</b> ${esc(planned.map((g) => `${g.name} (${formatRange(g.date, g.end_date)})`).join(' · '))}.</p>` : ''}
    <p class="rp-note">Cifras registradas a fecha de ${dateEs(todayISO())}. El saldo es el bono menos la penalización, si la hubiera.</p>
  </article>`;
}

/** Informe de fin de temporada: bono, penalizaciones, saldo y participación de cada corredor, en una página para imprimir o guardar en PDF. */
function viewSeasonReport() {
  const years = availableYears(S.data.races);
  if (!years.includes(S.year)) S.year = years[0];
  const { id } = parseRoute();
  const cfg = bonusCfg(S.year);
  const live = seasonModel(S.year);
  const frozen = S.data.settings?.[`cierre_${S.year}`] || null;
  const m = S.repFrozen && frozen ? frozen : live;
  if (id) { // hoja de un corredor, o de todos
    const rs = id === 'todos' ? m.rows.filter((r) => r.id && r.races) : m.rows.filter((r) => r.id === id);
    return frame(id === 'todos' ? 'Hojas de los corredores' : (rs[0]?.name || 'Hoja del corredor'), `
      <div class="no-print"><div class="row-btns rp-actions"><button class="btn primary" data-act="print-report">🖨️ Imprimir o guardar PDF</button></div>
        <p class="hint">${id === 'todos' ? `Una hoja por corredor (${rs.length}), cada una en su página.` : 'Hoja individual para enviar o archivar.'}${S.repFrozen && frozen ? ' Con las cifras del cierre.' : ''}</p></div>
      ${rs.map((r) => runnerSheet(r, S.year, m.minimum)).join('') || '<p class="empty">No hay datos.</p>'}`, { back: '#/informe' });
  }
  const t = m.tot;
  const prev = S.year > 0 ? seasonModel(S.year - 1).tot : null, hasPrev = prev && prev.clubRaces > 0;
  const dl = (cur, old, f = (n) => n) => (!hasPrev ? '' : `<em class="rp-d ${cur > old ? 'up' : cur < old ? 'down' : ''}">${cur >= old ? '+' : '−'}${f(Math.abs(cur - old))} vs ${S.year - 1}</em>`);
  const kpi = (v, l, cls = '', d = '') => `<div class="rp-kpi ${cls}"><b>${v}</b><span>${l}</span>${d}</div>`;
  const rows = m.rows.filter((r) => r.races || r.b?.planned || r.b?.penalty);
  const changes = frozen && !S.repFrozen ? sinceClosing(live, frozen) : [];
  const stamp = S.repFrozen && frozen ? `Cierre guardado el ${dateEs(frozen.date)}` : dateEs(todayISO());
  return frame('Informe de temporada', `
    <div class="no-print">${yearPicker(years)}
      <div class="row-btns rp-actions"><button class="btn primary" data-act="print-report">🖨️ Imprimir o guardar PDF</button>
        <button class="btn" data-act="season-csv">📊 Excel</button><a class="btn" href="#/informe/todos">📄 Hoja de cada corredor</a></div>
      <p class="hint">En el cuadro de imprimir elige «Guardar como PDF». Mejor con el móvil en horizontal.</p>
      ${frozen ? `<div class="years subtabs"><button class="chip${S.repFrozen ? '' : ' on'}" data-act="rep-frozen" data-v="0">Hoy</button><button class="chip${S.repFrozen ? ' on' : ''}" data-act="rep-frozen" data-v="1">🧊 Cierre del ${esc(dateEs(frozen.date))}</button></div>` : ''}
      <button class="btn small ghost" data-act="rep-freeze">🧊 ${frozen ? 'Actualizar' : 'Guardar'} el cierre de ${S.year}</button>
      <p class="hint">El cierre es una <b>foto</b> de las cifras de hoy: aunque luego cambies datos, podrás volver a verla.</p>
      ${changes.length ? `<div class="pen bad-box">⚠️ Desde el cierre han cambiado ${changes.length} corredor${changes.length === 1 ? '' : 'es'}:<br>${esc(changes.slice(0, 8).join(' · '))}${changes.length > 8 ? '…' : ''}</div>` : ''}</div>
    <article class="report">
      <header class="rp-head"><img src="icons/logo.png" alt=""><div><h2>CC Monzón · Temporada ${S.year}</h2><p>Informe de participación y bonos · ${stamp}</p></div></header>
      <div class="rp-kpis">
        ${kpi(`${t.raced} / ${t.runners}`, 'corredores con carreras')}
        ${kpi(t.clubRaces, 'carreras del club', '', dl(t.clubRaces, prev?.clubRaces))}
        ${kpi(t.races, 'participaciones', '', dl(t.races, prev?.races))}
        ${kpi(`🥇${t.p[0]} 🥈${t.p[1]} 🥉${t.p[2]}`, 'podios', '', dl(t.podiums, prev?.podiums))}
        ${kpi(t.km ? kmText(Math.round(t.km)) : '—', 'km recorridos', '', dl(Math.round(t.km), Math.round(prev?.km || 0), (n) => kmText(n)))}
        ${kpi(t.timed ? formatTime(t.time, true) : '—', 'tiempo en carrera')}
        ${kpi(euros(t.pay), 'en bonos', 'good', dl(t.pay, prev?.pay, euros))}
        ${kpi(euros(t.pen), 'en penalizaciones', 'bad', dl(t.pen, prev?.pen, euros))}
        ${kpi(signEuros(t.bal), t.bal > 0 ? 'el club debe (neto)' : t.bal < 0 ? 'a favor del club (neto)' : 'saldo neto', t.bal > 0 ? 'good' : t.bal < 0 ? 'bad' : '', dl(t.bal, prev?.bal, euros))}
      </div>
      <div class="rp-scroll"><table class="rp-table">
        <thead><tr><th>Corredor</th><th>Contrato</th><th>Carreras</th><th class="rp-bar-h">Camino al bono · mínimo ${m.minimum}</th><th>Bono</th><th>Penaliz.</th><th>Saldo</th><th>Podios</th><th>Km</th><th>Tiempo</th><th>Dónde ha ido</th></tr></thead>
        <tbody>${rows.map((r) => { const b = r.b, sal = b ? b.amount - b.penalty : 0;
          return `<tr><td>${r.id ? `<a class="rp-name" href="#/informe/${esc(r.id)}"><b>${esc(r.name)}</b></a>` : `<b>${esc(r.name)}</b>`}${r.cat ? `<small>${esc(r.cat)}</small>` : ''}</td>
            <td><span class="rp-chip">${esc(r.contract)}</span></td>
            <td class="num">${r.races}${r.days !== r.races ? `<small>${r.days} días</small>` : ''}</td>
            <td>${b ? `${barOf(b)}<small>${barText(b)}</small>` : ''}</td>
            <td class="num good">${b && b.amount ? euros(b.amount) : '—'}</td>
            <td class="num bad">${b && b.penalty ? euros(b.penalty) : '—'}</td>
            <td class="num sal ${sal > 0 ? 'good' : sal < 0 ? 'bad' : ''}">${b ? signEuros(sal) : '—'}</td>
            <td class="num">${podText(r)}</td>
            <td class="num">${r.km ? kmText(r.km) : '—'}</td>
            <td class="num">${r.timed ? formatTime(r.time, true) : '—'}${r.timed && r.timed < r.races ? `<small>${r.timed}/${r.races}</small>` : ''}</td>
            <td><small>${esc(r.provinces.join(', ') || '—')}</small></td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td colspan="2"><b>Total</b></td><td class="num"><b>${t.races}</b></td><td></td><td class="num good"><b>${euros(t.pay)}</b></td><td class="num bad"><b>${euros(t.pen)}</b></td>
          <td class="num sal ${t.bal > 0 ? 'good' : t.bal < 0 ? 'bad' : ''}"><b>${signEuros(t.bal)}</b></td><td class="num">${t.podiums}</td><td class="num">${t.km ? kmText(Math.round(t.km)) : '—'}</td><td class="num">${t.timed ? formatTime(t.time, true) : '—'}</td><td></td></tr></tfoot>
      </table></div>
      <p class="rp-note"><b>Cómo leerlo.</b> <b>Bono</b>: según el tramo alcanzado por contrato (${tiersByContractLine(cfg)}). <b>Penalización</b>: solo si no llega al mínimo de ${m.minimum} carreras (${penaltiesLine(cfg)}). <b>Saldo</b> = bono − penalización; en verde lo que debe el club al corredor, en rojo lo que se descuenta. Los plus de liga (+${cfg.circuitExtra ?? 4}) suben el tramo pero no cuentan para el mínimo; una carrera suspendida cuenta para el mínimo, no para el bono. ${hasPrev ? `Las flechas comparan con ${S.year - 1} (con la plantilla actual). ` : ''}Cifras ${S.repFrozen && frozen ? 'del cierre guardado el ' + dateEs(frozen.date) : 'registradas a fecha de ' + dateEs(todayISO())}. Tiempo y km solo donde se han anotado.</p>
    </article>`, { back: '#/computo' });
}

/** Contratos por tipo: se sube uno de cada y cada corredor ve el de su tipo (el que se le asignó en su ficha). */
function viewContracts() {
  const runners = S.data.runners;
  const body = S.tpls === null
    ? `<p class="card warn">Falta activar los contratos por tipo: ejecuta en Supabase el SQL <code>supabase/cambios/2026-11-13-contratos-tipo.sql</code>.</p>`
    : `<p class="hint">Sube <b>un contrato por tipo</b>. Cada corredor verá en su pestaña «Contrato» el de su tipo, el que le hayas asignado en su ficha. Si vuelves a subir uno, <b>sustituye</b> al anterior (del mismo tipo). Los documentos que se subieron antes a cada corredor, uno a uno, no se borran solos: están más abajo.</p>
      ${CONTRACTS.map((c) => {
        const t = (S.tpls || []).find((x) => x.contract === c.id), n = runners.filter((r) => r.contract === c.id).length;
        return `<section class="card stack tpl-card"><h2>${esc(c.label)} <small class="muted">· ${n} corredor${n === 1 ? '' : 'es'}</small></h2>
          ${t ? `<div class="tpl-cur"><b>${docIcon(t.mime)} ${esc(t.title)}</b><small class="muted">${esc(t.filename)} · ${fmtSize(t.size)} · subido ${formatDate(String(t.updated_at).slice(0, 10), false)}</small>
            <span class="row-btns"><button class="btn small" data-act="tpl-open" data-c="${c.id}">Ver</button><button class="btn small danger ghost" data-act="tpl-del" data-c="${c.id}" aria-label="Borrar">🗑️</button></span></div>`
            : '<p class="empty small">Todavía no hay contrato de este tipo: estos corredores no ven ninguno.</p>'}
          <form class="stack" data-form="tpl-upload" data-contract="${c.id}">
            <label class="btn file">📎 ${t ? 'Sustituir por otro' : 'Elegir archivo'} (PDF o foto)<input type="file" name="file" accept="application/pdf,image/*" hidden required></label>
            <p class="hint doc-chosen">Ningún archivo elegido. Máximo 5 MB.</p>
            <label>Título<input name="title" value="${esc(t?.title || 'Contrato ' + c.label.toLowerCase())}" maxlength="120"></label>
            <button class="btn primary">${t ? 'Sustituir' : 'Subir'}</button>
          </form></section>`; }).join('')}
      ${(() => { // contratos antiguos subidos uno a uno a cada corredor (ficha → Subir documentos)
        const old = (S.docs || []).filter((x) => /contrato/i.test(x.title)), rest = (S.docs || []).length - old.length;
        if (!old.length) return '';
        const who = new Set(old.map((x) => x.runner_id)).size;
        return `<section class="card stack old-docs"><h2>🧹 Contratos antiguos de cada corredor</h2>
          <p class="hint">Antes se subía un contrato a cada corredor, uno a uno. Esos <b>siguen en su ficha y los corredores los ven</b> junto al contrato nuevo de su tipo. Hay <b>${old.length}</b> en <b>${who}</b> corredor${who === 1 ? '' : 'es'}.${rest ? ` Otros ${rest} documento${rest === 1 ? '' : 's'} (que no se llaman «contrato») no se tocan.` : ''}</p>
          <details><summary>Ver cuáles son</summary><ul class="mini-list">${old.map((x) => `<li><div><b>${esc(runnerById(x.runner_id)?.name || 'Corredor')}</b><small class="muted">${esc(x.title)} · ${x.year} · ${esc(x.filename)}</small></div></li>`).join('')}</ul></details>
          <button class="btn" data-act="backup-docs">⬇️ Descargar una copia antes</button>
          <button class="btn danger" data-act="docs-old-del">🗑️ Borrar los ${old.length} contratos antiguos</button>
          <p class="hint">Así cada corredor verá solo el contrato de su tipo, el que subes arriba. No se puede deshacer: descarga antes la copia.</p></section>`; })()}
      ${(() => { const sin = runners.filter((r) => !CONTRACTS.some((c) => c.id === r.contract)); return sin.length
        ? `<p class="card warn">⚠️ <b>${sin.length}</b> corredor${sin.length === 1 ? '' : 'es'} sin tipo de contrato asignado, y no verán ninguno: ${esc(sin.slice(0, 12).map((r) => r.name).join(', '))}${sin.length > 12 ? '…' : ''}. Asígnalo en la ficha de cada uno (campo «Contrato»).</p>` : ''; })()}`;
  return frame('Corredores', `${runnersTabs('contratos')}${body}`);
}

/** Datos de cada corredor para la lista de la plantilla (bono de este año, carreras, estado). */
function rosterRows() {
  const year = new Date().getFullYear();
  const counts = new Map();
  for (const r of S.data.races) for (const x of r.results) if (x.runner_id) counts.set(x.runner_id, (counts.get(x.runner_id) || 0) + 1);
  const bonusBy = new Map(yearBonuses(year, S.data.races, S.data.registrations, S.data.runners, bonusCfg(year), S.data.circuitPodiums || []).map((b) => [b.runner.id, b]));
  return S.data.runners.map((r) => { const b = bonusBy.get(r.id);
    const seen = Object.prototype.hasOwnProperty.call(r, 'last_seen') ? seenLevel(seenDays(r.last_seen)) : null;
    return { r, b, total: counts.get(r.id) || 0, noContract: !CONTRACTS.some((c) => c.id === r.contract), low: !!b && !b.reachesMinimum, withBonus: !!b?.tier, noApp: seen === 'never' || seen === 'cold' }; });
}
const RFILTERS = [['todos', 'Corredores', ''], ['sincontrato', 'Sin contrato', 'warn'], ['bajo', 'Bajo el mínimo', 'bad'], ['bono', 'Con bono', 'good'], ['app', 'Sin usar la app', 'violet']];
const rfilters = () => RFILTERS.filter(([id]) => id !== 'app' || S.data.runners.some((r) => Object.prototype.hasOwnProperty.call(r, 'last_seen')));

/** Lista filtrable de la plantilla: se repinta sola al escribir en el buscador. */
function runnersListHtml() {
  const year = new Date().getFullYear();
  const q = S.q.rlist || '';
  let rows = rosterRows();
  const f = S.rfilter || 'todos';
  if (f === 'sincontrato') rows = rows.filter((x) => x.noContract);
  else if (f === 'bajo') rows = rows.filter((x) => x.low);
  else if (f === 'bono') rows = rows.filter((x) => x.withBonus);
  else if (f === 'app') rows = rows.filter((x) => x.noApp);
  if (normalize(q).length >= 1) { const ids = new Set(matchPeople(q, rows.map((x) => x.r)).map((m) => m.id)); rows = rows.filter((x) => ids.has(x.r.id)); }
  const sort = S.rsort || 'nombre';
  if (sort === 'carreras') rows.sort((a, b) => (b.b?.count || 0) - (a.b?.count || 0) || byName(a.r, b.r));
  else if (sort === 'bono') rows.sort((a, b) => (b.b?.amount || 0) - (a.b?.amount || 0) || (b.b?.count || 0) - (a.b?.count || 0) || byName(a.r, b.r));
  else rows.sort((a, b) => byName(a.r, b.r));
  if (!rows.length) return `<p class="empty">${q ? `Ningún corredor se parece a «${esc(q)}».` : f === 'todos' ? 'Todavía no hay corredores.' : 'Nadie en esta lista. 🎉'}</p>`;
  const row = ({ r, b, total, noContract, low }) => {
    const top = b?.tiers.at(-1)?.races || 1, pct = b ? Math.min(100, Math.round((b.bonusCount / top) * 100)) : 0;
    const tracked = Object.prototype.hasOwnProperty.call(r, 'last_seen'), sd = tracked ? seenDays(r.last_seen) : null;
    const sels = `<div class="roster-sel">
        ${catSelect(`data-runner-cat="${r.id}" aria-label="Categoría habitual de ${esc(r.name)}"`, r.category || '')}
        <span class="sel-wrap${noContract ? ' needs' : ''}">${contractSelect(`data-runner-contract="${r.id}" aria-label="Tipo de contrato de ${esc(r.name)}"`, r.contract || '')}</span>
      </div>`;
    return `<li class="rr rr2 ${low ? 'low' : b?.tier ? 'ok' : ''}${noContract ? ' nocon' : ''}">
      <div class="rr-top"><a class="rr-who" href="#/corredor/${r.id}">${avatar(r.name)}${tracked ? `<i class="seen s-${seenLevel(sd)}" title="${esc(seenText(sd))}"></i>` : ''}
        <span class="rr-name"><b>${esc(r.name)}</b><span class="rr-tags">${r.category ? `<i class="rt cat">${esc(r.category)}</i>` : '<i class="rt warn">sin categoría</i>'}${noContract ? '<i class="rt warn">sin contrato</i>' : `<i class="rt">${esc(contractLabel(r.contract))}</i>`}${(S.docs || []).some((x) => x.runner_id === r.id && x.year === year) ? '<i class="rt ok">📄 contrato</i>' : ''}</span>
        <small class="muted">${total} carrera${total === 1 ? '' : 's'} en total${tracked ? ` · ${esc(seenText(sd))}` : ''}</small></span>${ico('go', 'rr-go')}</a>
        <button class="icon-btn link-btn" data-act="runner-menu" data-id="${r.id}" aria-label="Enviar o copiar el enlace de ${esc(r.name)}" title="Enlace personal">${ico('share')}</button></div>
      ${b ? `<div class="rr-bono"><div class="rp-bar ${b.reachesMinimum ? (b.tier ? 'ok' : 'mid') : 'low'}"><i style="width:${pct}%"></i></div>
        <small><b>${b.bonusCount}</b> en ${year} · ${b.reachesMinimum ? (b.tier ? `✅ bono ${euros(b.amount)}` : '✅ mínimo') : `<span class="bad-txt">⚠️ faltan ${b.missingToMinimum}</span>`}</small></div>` : ''}
      ${noContract || !r.category ? sels : `<details class="rr-edit"><summary>Cambiar categoría o contrato</summary>${sels}</details>`}
      ${adminRunnerRaces(r, year)}</li>`;
  };
  return `<p class="hint rr-count">${rows.length} corredor${rows.length === 1 ? '' : 'es'}${q || f !== 'todos' ? ' (filtrado)' : ''}</p><ul class="roster">${rows.map(row).join('')}</ul>`;
}

function viewRunners() {
  const year = new Date().getFullYear();
  const all = rosterRows();
  const n = { todos: all.length, sincontrato: all.filter((x) => x.noContract).length, bajo: all.filter((x) => x.low).length, bono: all.filter((x) => x.withBonus).length, app: all.filter((x) => x.noApp).length };
  const f = S.rfilter || 'todos';
  return frame(`Equipo (${all.length})`, `
    ${runnersTabs('corredores')}
    <div class="rr-kpis" style="grid-template-columns:repeat(${rfilters().length},1fr)">${rfilters().map(([id, label, cls]) => `<button class="rr-kpi ${cls}${f === id ? ' on' : ''}${id !== 'todos' && !n[id] ? ' zero' : ''}" data-act="r-filter" data-f="${id}" aria-pressed="${f === id}"><b>${n[id]}</b><span>${label}</span></button>`).join('')}</div>
    <div class="toolbar">
      ${searchBox('rlist', 'Buscar corredor…')}
      <button class="btn primary add-btn" data-act="r-manage" aria-label="Añadir corredores" title="Añadir corredores">＋</button>
    </div>
    <div class="rr-sort"><span class="muted">Ordenar:</span>${[['nombre', 'A–Z'], ['carreras', 'Más carreras'], ['bono', 'Más bono']].map(([id, l]) => `<button class="chip${(S.rsort || 'nombre') === id ? ' on' : ''}" data-act="r-sort" data-s="${id}">${l}</button>`).join('')}</div>
    <div id="runner-list">${runnersListHtml()}</div>
    <details class="card manage" id="manage" data-open-key="rmanage"${all.length && !S.open?.rmanage ? '' : ' open'}>
      <summary><b>⚙️ Gestionar plantilla</b> <span class="muted">· añadir, renovar, enlaces, bonos</span></summary>
      <div class="stack">
        <div class="quick"><a class="btn" href="#/bonos">💶 Bonos ${year}</a>${all.length ? '<button class="btn" data-act="all-links">🔗 Copiar todos los enlaces</button>' : ''}</div>
        ${clothingLine()}
        <details class="card">
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
      </div>
    </details>`);
}

// ======================================================================
//  Datos: copias, migración, privacidad
// ======================================================================

/** Contenido de «Datos»: copias, restaurar, historial, privacidad, aspecto, versión y cerrar sesión. */
const dataBody = () => `
    <section class="card stack"><h2>Copia de seguridad</h2>
      <p>Descarga todos los datos (corredores, inscripciones, carreras y resultados) en un archivo. Guárdalo en tu Drive o correo una vez al mes.</p>
      <button class="btn primary" data-act="backup">Descargar copia de datos</button>
      <p class="hint">Última copia de datos: <b>${agoText(daysSince(BACKUP_KEY))}</b>.</p>
      <p>Los contratos y documentos subidos no van en esa copia: se descargan aparte, en otro archivo.</p>
      <button class="btn" data-act="backup-docs">Descargar contratos y documentos${S.docs ? ` (${S.docs.length})` : ''}</button>
      <p class="hint">${S.docs === null ? 'Aún no están activados los documentos.' : `Última copia de documentos: <b>${agoText(daysSince(BACKUP_DOCS_KEY))}</b>.`}</p>
      <button class="btn" data-act="csv-all">Exportar todos los resultados a CSV</button>
    </section>
    <section class="card stack"><h2>Restaurar o migrar</h2>
      <label class="btn file">Restaurar copia completa (.json)<input type="file" accept=".json,application/json" data-file="restore" hidden></label>
      <p class="hint">Sustituye <b>todos</b> los datos actuales por los de la copia.</p>
      <label class="btn file">Restaurar contratos y documentos (.json)<input type="file" accept=".json,application/json" data-file="restore-docs" hidden></label>
      <p class="hint">Añade los documentos de la copia a sus corredores. Los que ya existen (mismo corredor, temporada y título) se saltan. Restaura antes los datos, para que los corredores existan.</p>
      <label class="btn file">Importar resultados desde CSV<input type="file" accept=".csv,text/csv,text/plain" data-file="csv" hidden></label>
      <p class="hint">Columnas: Fecha, Carrera, Lugar, Provincia, País, Modalidad, Corredor, Categoría, Puesto y Tipo de podio (las mismas que la exportación). Se añaden a lo que ya hay; las carreras que ya existan (misma fecha y nombre) se saltan.</p>
    </section>
    <a class="btn block" href="#/historial">🕘 Historial de cambios</a>
    <section class="card"><h2>Privacidad</h2>
      <p>Solo se guarda el nombre, la categoría y las carreras de cada corredor. Los datos están en un servidor de la UE (Frankfurt).
      Para dar a un corredor sus datos o borrarlos: «Corredores» → ⋯ junto a su nombre.</p></section>
    ${api.mode === 'demo' ? `<button class="btn ghost block" data-act="demo-reset">Reiniciar datos de demostración</button>` : ''}
    ${themeLine()}${versionLine()}
    <p class="muted center">Sesión: ${esc(S.session?.email)}</p>
    <button class="btn ghost block" data-act="logout">Cerrar sesión</button>`;
function viewData() { return frame('Datos', dataBody()); }

// ======================================================================
//  Acciones
// ======================================================================

function draftPayload() {
  const d = S.draft;
  const base = { id: d.id, name: cleanName(d.name), date: d.date, place: cleanName(d.place), province: cleanName(d.province),
    country: cleanName(d.country), modality: d.modality, notes: String(d.notes || '').trim(),
    end_date: d.multi && d.end_date ? d.end_date : null,
    race_type: d.race_type || 'suelta', circuit: d.race_type === 'circuito' ? cleanName(d.circuit) : null,
    suspended: d.kind === 'reg' && !!d.suspended,
    subtype: SUBTYPES[d.modality]?.includes(d.subtype) ? d.subtype : null, km: parseKm(d.km), url: cleanWeb(d.url),
    elevation: parseElev(d.elevation), price: parsePrice(d.price) };
  if (String(d.elevation ?? '').trim() !== '' && base.elevation === null) throw new Error('El desnivel tiene que ser un número entre 1 y 10 000 metros.');
  if (String(d.price ?? '').trim() !== '' && base.price === null) throw new Error('El precio tiene que ser un número entre 0 y 10 000 euros (0 = gratis).');
  if (base.url === '!') throw new Error('La web no parece una dirección válida. Pon algo como https://nombre-de-la-carrera.com o déjala vacía.');
  if (String(d.km ?? '').trim() !== '' && base.km === null) throw new Error('La distancia tiene que estar entre 0 y 1000 km.');
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
/** Guarda el formato y los km de una carrera creada por el corredor (se ignora si falta el SQL o no es suya). */
async function setMyDetails(id, d) {
  const subtype = SUBTYPES[d.modality]?.includes(d.subtype) ? d.subtype : null, km = parseKm(d.km);
  if (!subtype && km === null && !d.id) return;
  try { await api.runnerSetDetails(S.code, id, subtype, km); } catch (e) { console.warn(e); }
}
async function setMyRaceType(id, d) {
  if (!S.runnerData?.circuits) return; // base de datos sin el cambio de circuitos
  try { await api.runnerSetType(S.code, id, d.race_type || 'suelta', d.race_type === 'circuito' ? cleanName(d.circuit) : null); } catch (e) { console.warn(e); }
}

/** Acciones sobre un corredor (enlace, vista previa, cambiar nombre, descargar datos, borrar). */
async function runnerDo(choice, r) {
  const link = linkFor(r.code);
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
    S.runnerData = view; S.myOpen = true; await loadNews(); await loadChron();
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

}

const actions = {
  'msg-who'(el) { const id = el.dataset.id; S.msgOff = S.msgOff || new Set(); if (S.msgOff.has(id)) S.msgOff.delete(id); else S.msgOff.add(id); render(); },
  'msg-wa'() { const t = document.getElementById('msg-text')?.value || ''; if (t.trim()) window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank', 'noopener'); },
  'msg-copy'() { copyText(document.getElementById('msg-text')?.value || '', 'Mensaje copiado: pégalo en el chat'); },
  async install() { S.installEvt?.prompt(); S.installEvt = null; render(); },
  async 'demo-admin'() { await api.signIn(); S.session = await api.session(); await run(reload); go('#/hoy'); },
  async 'demo-reset'() {
    if (!await confirmAction('Reiniciar demostración', 'Se borran los cambios de prueba y se cargan los datos de ejemplo.', 'Reiniciar')) return;
    await api.resetDemo(); await run(reload, 'Demostración reiniciada'); render();
  },
  async logout() { await api.signOut(); S.session = null; S.data = null; go('#/'); },

  // corredor
  async 'doc-open'(el) { const doc = await run(() => api.getDocument(el.dataset.id)); if (doc) openDoc(doc); },
  async 'my-doc-open'(el) { const doc = await run(() => api.runnerGetDocument(S.code || S.previewCode, el.dataset.id)); if (doc) openDoc(doc); },
  async 'my-tpl-open'() { const doc = await run(() => api.runnerGetContractTemplate(S.code || S.previewCode)); if (doc) openDoc(doc); },
  async 'tpl-open'(el) { const doc = await run(() => api.getContractTemplate(el.dataset.c)); if (doc) openDoc(doc); },
  async 'docs-old-del'() {
    const old = (S.docs || []).filter((x) => /contrato/i.test(x.title));
    if (!old.length) return;
    const who = new Set(old.map((x) => x.runner_id)).size;
    if (!await confirmAction('Borrar contratos antiguos', `Se borrarán <b>${old.length}</b> contrato${old.length === 1 ? '' : 's'} subido${old.length === 1 ? '' : 's'} a <b>${who}</b> corredor${who === 1 ? '' : 'es'}. Los corredores solo verán el contrato de su tipo. <b>No se puede deshacer.</b> ¿Descargaste antes la copia?`, 'Borrar', 'danger')) return;
    const n = await run(async () => { let done = 0; for (const x of old) { toast(`Borrando ${done + 1} de ${old.length}…`); await api.deleteDocument(x.id); done++; } await reload(); return done; });
    if (n) { toast(`${n} contrato${n === 1 ? '' : 's'} antiguo${n === 1 ? '' : 's'} borrado${n === 1 ? '' : 's'}`); render(); }
  },
  async 'tpl-del'(el) {
    const c = el.dataset.c;
    if (!await confirmAction('Borrar contrato', `Se borrará el contrato «${esc(contractLabel(c))}». Los corredores de ese tipo dejarán de verlo.`, 'Borrar')) return;
    await run(async () => { await api.deleteContractTemplate(c); await reload(); }, 'Contrato borrado'); render();
  },
  async 'doc-del'(el) {
    const x = (S.docs || []).find((y) => y.id === el.dataset.id);
    if (!await confirmAction('Borrar documento', `Se borrará «${esc(x?.title || '')}». El corredor dejará de verlo.`, 'Borrar')) return;
    await run(async () => { await api.deleteDocument(el.dataset.id); await reload(); }, 'Documento borrado'); render();
  },
  async 'r-delete-mine'() {
    const d = S.rdraft;
    const isRace = d.kind === 'race';
    if (!await confirmAction('Borrar carrera', `Se borrará «${esc(d.name)}» y ${isRace ? 'tu resultado' : 'tu inscripción'} en ella.`, 'Borrar')) return;
    const ok = await run(async () => { await (isRace ? api.runnerDeleteRace(S.code, d.id) : api.runnerDelete(S.code, d.id)); await loadRunner(); return true; }, 'Carrera borrada');
    if (ok) { S.rdraft = null; go(isRace ? runnerHref('mi') : '#/'); }
  },
  async 'r-new'() { S.rdraft = null; if (!S.fed) loadFed(); go('#/nueva'); },
  async 'r-web'(el) {
    const g = S.runnerData.registrations.find((x) => x.id === el.dataset.id); if (!g) return;
    const v = await askWeb(g.name, g.url || ''); if (v === null) return;
    const u = cleanWeb(v); if (u === '!') return toast('Esa dirección no parece una web. Pon algo como https://nombre-de-la-carrera.com', true);
    const ok = await run(async () => { await api.runnerSetUrl(S.code, g.id, u); await loadRunner(); return true; }, u ? 'Web guardada: ya la ven todos' : 'Web quitada');
    if (ok) render();
  },
  async 'w-sign'(el) {
    const w = (S.watch || []).find((x) => x.id === el.dataset.id); if (!w) return;
    const g = watchMatch(w, S.runnerData.registrations);
    if (g) {   // ya existe en el club: solo apuntarse
      const cat = await askCategory(g.name); if (!cat) return;
      const ok = await run(async () => { await api.runnerJoin(S.code, g.id, cat); await api.runnerWatchDelete(S.code, w.id).catch(() => {}); await loadWatch(); await loadRunner(); return true; }, '¡Apuntado! La he quitado de «Por valorar»');
      if (ok) go('#/');
      return;
    }
    S.rdraft = emptyRunnerDraft({ name: w.name, date: w.date, multi: !!w.end_date, end_date: w.end_date || '', place: w.place || '', province: w.province || '', country: w.country || DEFAULT_COUNTRY, modality: w.modality,
      subtype: w.subtype || '', km: w.km ?? '', url: w.url || '', elevation: w.elevation ?? '', price: w.price ?? '', watchId: w.id });
    go('#/nueva');
  },
  async 'w-del'(el) {
    const w = (S.watch || []).find((x) => x.id === el.dataset.id); if (!w) return;
    if (!await confirmAction('Quitar de «Por valorar»', `Se quita <b>${esc(w.name)}</b> de tu lista. Si te lo piensas mejor, tendrás que volver a guardarla.`, 'Quitar', 'danger')) return;
    const ok = await run(async () => { await api.runnerWatchDelete(S.code, w.id); await loadWatch(); return true; }, 'Quitada de la lista');
    if (!ok) return;
    S.rdraft = null; if (el.dataset.back) go('#/mi/valorar'); else render();
  },
  'w-sort'(el) { S.watchSort = el.dataset.m; render(); },
  async 'w-repeat'(el) {
    const w = (S.watch || []).find((x) => x.id === el.dataset.id); if (!w) return;
    const next = nextYearWatch(w);
    const ok = await run(async () => { await api.runnerWatchSave(S.code, null, next); await api.runnerWatchDelete(S.code, w.id); await loadWatch(); return true; },
      `Guardada para el año que viene: ${dayMon(next.date)} (por confirmar)`);
    if (ok && el.dataset.back) { S.rdraft = null; go('#/mi/valorar'); return; }
    if (ok) render();
  },
  async 'w-add-fed'(el) {
    const r = S.fed?.races[Number(el.dataset.i)]; if (!r) return;
    const g = watchMatch(r, S.runnerData.registrations);   // si ya está en Carreras (aunque con otro nombre), se guarda esa para no duplicarla
    const note = `${r.tbc ? WATCH_TBC + ': es la de la edición anterior + 52 semanas, hasta que salga la oficial.\n' : ''}Calendario: ${srcNote(r)}`.slice(0, 500);
    const data = g ? { ...watchFrom(g, note), url: watchFrom(r).url } : watchFrom(r, note);
    const ok = await run(async () => { await api.runnerWatchSave(S.code, null, data); await loadWatch(); return true; }, 'Guardada en «Por valorar»');
    if (ok) render();
  },
  async 'w-add-reg'(el) {
    const g = S.runnerData.registrations.find((x) => x.id === el.dataset.id); if (!g) return;
    const ok = await run(async () => { await api.runnerWatchSave(S.code, null, watchFrom(g, String(g.notes || '').slice(0, 500))); await loadWatch(); return true; }, 'Guardada en «Por valorar»');
    if (!ok) return;
    if (el.dataset.go) { S.rdraft = null; go('#/mi/valorar'); } else render();
  },
  async 'r-new-fed'(el) {
    const r = S.fed.races[Number(el.dataset.i)];
    S.rdraft = emptyRunnerDraft({ name: r.name, date: r.date, place: r.place || '', province: r.province || '', country: r.country || DEFAULT_COUNTRY, modality: r.modality, url: /^https?:\/\/\S+$/i.test(r.url || '') ? r.url : '', ...circuitOf(r) });
    go('#/nueva');
  },
  'fill-fed'(el) {
    const r = S.fed.races[Number(el.dataset.i)];
    const vals = { name: r.name, date: r.date, place: r.place || '', province: r.province || '', country: r.country || DEFAULT_COUNTRY, modality: r.modality, ...circuitOf(r) };
    const web = /^https?:\/\/\S+$/i.test(r.url || '') ? r.url : '';
    if (S.rdraft && S.rdraft.wk != null && parseRoute().view === 'valorar') Object.assign(S.rdraft, vals, { subtype: vals.subtype || S.rdraft.subtype, url: S.rdraft.url || web });
    else if (S.rdraft && parseRoute().view === 'nueva') Object.assign(S.rdraft, vals, { url: S.rdraft.url || web });
    else if (S.draft) Object.assign(S.draft, vals, { url: S.draft.url || web, notes: S.draft.notes || srcNote(r) });
    render();
  },
  async 'r-join-go'(el) {
    const g = S.runnerData.registrations.find((x) => x.id === el.dataset.id);
    const cat = S.rdraft?.category || await askCategory(g?.name);
    if (!cat) return;
    const wid = S.rdraft?.watchId;
    const ok = await run(async () => { await api.runnerJoin(S.code, el.dataset.id, cat); if (wid) { await api.runnerWatchDelete(S.code, wid).catch(() => {}); await loadWatch(); } await loadRunner(); return true; }, '¡Apuntado!');
    S.rdraft = null; go(ok && isPastReg(el.dataset.id) ? resultHref(el.dataset.id) : '#/');
  },
  async 'r-join'(el) {
    const sel = el.closest('#search-results') ? null : $app.querySelector(`select[data-cat="${el.dataset.id}"]`);
    let cat = sel ? sel.value : null;
    if (!cat) { // la categoría es obligatoria: se elige aquí o en una ventana (si se apunta desde el buscador)
      if (sel) { sel.classList.add('needs'); sel.focus(); return toast('Elige tu categoría para apuntarte.', true); }
      const g = S.runnerData.registrations.find((x) => x.id === el.dataset.id);
      cat = await askCategory(g?.name); if (!cat) return;
    }
    const gname = S.runnerData.registrations.find((x) => x.id === el.dataset.id)?.name;
    const ok = await run(async () => { await api.runnerJoin(S.code, el.dataset.id, cat); await loadRunner(); return true; }, '¡Apuntado!');
    if (ok && isPastReg(el.dataset.id)) { await chronicleReminder(gname); return go(resultHref(el.dataset.id)); }
    render();
  },
  // «La hice y no salgo»: añadirse a una carrera que ya está en resultados y poner el puesto
  async 'r-join-race'(el) {
    const ok = await run(async () => { await api.runnerJoinRace(S.code, el.dataset.id, S.rdraft?.category || S.runnerData.me.category || null); await loadRunner(); return true; }, 'Añadido: ahora pon tu resultado');
    if (!ok) return;
    S.rdraft = null; S.team = null; await chronicleReminder(S.runnerData.my_results?.find((x) => x.race_id === el.dataset.id)?.name); go(resultHref(el.dataset.id));
  },
  async 'chro-toggle'(el) {
    const done = el.dataset.done === '1';
    await run(async () => { await api.runnerSetChronicle(S.code, el.dataset.key, done); await loadChron(); }, done ? '✓ Crónica pasada' : 'Crónica pendiente otra vez (para todos)');
    render();
  },
  async 'chro-all'() {
    const c = chronicleStatus(S.runnerData, S.chron, S.runnerData.today || todayISO(), S.myYear || new Date().getFullYear());
    if (!c.pending.length || !await confirmAction('Marcar todas', `Vas a marcar <b>${c.pending.length}</b> crónicas como pasadas. ¿Las has enviado todas?`, 'Sí, todas pasadas', 'primary')) return;
    await run(async () => { for (const x of c.pending) await api.runnerSetChronicle(S.code, x.key, true); await loadChron(); }, 'Crónicas marcadas');
    render();
  },
  async 'r-leave'(el) {
    if (!await confirmAction('Borrar inscripción', '¿Seguro que quieres borrarte de esta carrera?', 'Sí, borrarme')) return;
    await run(async () => { await api.runnerLeave(S.code, el.dataset.id); await loadRunner(); }, 'Te has borrado');
    render();
  },
  // Pago de la inscripción: lo marca el corredor (con el importe, opcional); los compañeros ven solo «pagada»
  async 'note-edit'(el) {
    const g = S.runnerData.registrations.find((x) => x.id === el.dataset.id); if (!g || S.preview) return;
    const t = await askNote(g.name, noteOf(g));
    if (t === null) return;
    const ok = await run(async () => { await api.runnerNoteSet(S.code, g.id, t); await loadNotes(); return true; }, t.trim() ? '✓ Nota guardada' : 'Nota borrada');
    if (ok) render();
  },
  async 'r-paid'(el) {
    const g = S.runnerData.registrations.find((x) => x.id === el.dataset.id); if (!g) return;
    const mine = g.entries.find((e) => e.runner_id === S.runnerData.me.id); if (!mine) return;
    const r = await askPaid(g.name, mine);
    if (!r) return;
    await run(async () => { await api.runnerSetPaid(S.code, g.id, r.paid, r.amount, r.date); await loadRunner(); }, r.paid ? '✓ Pago anotado' : 'Pago quitado');
    render();
  },
  // Botón verde «✓ Inscrito (M40)»: cambiar la categoría o borrarse
  async 'r-joined'(el) {
    const g = S.runnerData.registrations.find((x) => x.id === el.dataset.id); if (!g) return;
    const mine = g.entries.find((e) => e.runner_id === S.runnerData.me.id);
    const pick = await choose(g.name.toLocaleUpperCase('es'), `Estás inscrito${mine?.category ? ' en <b>' + esc(mine.category) + '</b>' : ''}.`, [
      { label: 'Cambiar mi categoría', value: 'cat', kind: 'primary' },
      { label: 'Borrarme de esta carrera', value: 'leave', kind: 'danger' }]);
    if (pick === 'leave') return actions['r-leave'](el);
    if (pick !== 'cat') return;
    const cat = await askCategory(g.name, 'Guardar', mine?.category || '');
    if (!cat || cat === mine?.category) return;
    await run(async () => { await api.runnerJoin(S.code, g.id, cat); await loadRunner(); }, 'Categoría cambiada');
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
  'fed-leisure'() { fedFilter.leisure = !fedFilter.leisure; render(); },
  'fed-create'(el) {
    const r = S.fed.races[Number(el.dataset.i)];
    S.prefill = { name: r.name, date: r.date, place: r.place || '', province: r.province || '', country: r.country || DEFAULT_COUNTRY,
      modality: r.modality, url: /^https?:\/\/\S+$/i.test(r.url || '') ? r.url : '', ...circuitOf(r), notes: srcNote(r) };
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
  'reg-view'(el) {
    S.regView = el?.dataset?.v || (S.regView === 'cal' ? 'list' : 'cal'); S.calDay = null; store.set(VIEW_KEY, S.regView);
    if (S.regView === 'cal' && S.runnerData && !S.team && (S.code || S.previewCode)) loadTeam();
    render();
  },
  'fed-seguro'(el) { S.fedSeguro = el.dataset.f; store.set(FED_KEY, S.fedSeguro); render(); },
  'mate-open'(el) { openMate(el.dataset.id); },
  async 'dir-link-edit'() {
    const prev = S.data?.settings?.enlaces_direccion || {};
    const r = await askLink('Respuestas del pedido de ropa', 'Pega el enlace de la hoja de Google donde caen las respuestas del formulario del pedido de ropa.', prev.ropa_respuestas || '');
    if (r === null) return;
    const url = r ? cleanGoogleLink(r) : '';
    if (r && !url) return toast('Pega un enlace de Google (docs.google.com), que empiece por https://', true);
    await run(async () => { await api.saveSetting('enlaces_direccion', { ...prev, ropa_respuestas: url || null }); await reload(); }, url ? 'Enlace guardado' : 'Enlace quitado');
    render();
  },
  'copy-text'(el) { copyText(el.dataset.text, el.dataset.msg || 'Copiado'); },
  'mod-filter'(el) {
    S.mod = el.dataset.m; S.sub = 'all'; S.calDay = null; store.set(MOD_KEY, S.mod); render();
  },
  'sub-filter'(el) { S.sub = el.dataset.s; render(); },
  'fsub-filter'(el) { S.fsub = el.dataset.s; render(); },
  'kind-filter'(el) { S.kind = el.dataset.k; render(); },
  'who-filter'(el) { S.who = el.dataset.w; render(); },
  'filters-clear'() { clearFilters(); render(); },
  'gsearch'() { openGlobalSearch(); },
  'profile'() { openProfile(); },
  'r-filters'() {
    const dlg = document.getElementById('dialog');
    dlg.innerHTML = `<form method="dialog" class="dlg fdlg"><h2>Filtros</h2>
      ${S.fd?.html || ''}
      <div class="dlg-actions">${S.fd?.active ? '<button type="button" class="btn" data-act="filters-clear">Quitar filtros</button>' : ''}<button value="" class="btn ghost">Cerrar</button></div></form>`;
    dlg.onclose = null; dlg.showModal();
  },
  'pulse-month'(el) {
    const ym = el.dataset.m;
    S.fold.delete(ym);
    if (S.regView === 'cal') { S.regView = 'list'; store.set(VIEW_KEY, 'list'); }
    render();
    const head = $app.querySelector(`.month-head[data-m="${ym}"]`);
    if (head) head.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  'month-fold'(el) { const m = el.dataset.m; S.fold.has(m) ? S.fold.delete(m) : S.fold.add(m); render(); },
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
    if (await run(async () => { await api.deleteRegistration(S.draft.id); await reload(); return true; }, 'Inscripción borrada')) go(editBack('#/inscripciones'));
  },
  async 'del-race'() {
    if (!await confirmAction('Borrar carrera', `Se borrará «${esc(S.draft.name)}» con todos sus resultados.`, 'Borrar')) return;
    if (await run(async () => { await api.deleteRace(S.draft.id); await reload(); return true; }, 'Carrera borrada')) go(editBack('#/carreras'));
  },

  // Menú del icono de enlace: solo lo que tiene que ver con el enlace personal
  async 'runner-menu'(el) {
    const r = runnerById(el.dataset.id);
    const link = linkFor(r.code);
    const choice = await choose(`Enlace de ${r.name}`, `<code class="break">${esc(link)}</code>`, [
      { label: 'Enviar por WhatsApp', value: 'wa', kind: 'primary' },
      { label: 'Copiar enlace', value: 'copy' },
      { label: 'Crear enlace nuevo (anula el anterior)', value: 'regen', kind: 'ghost' },
    ]);
    if (choice) await runnerDo(choice, r);
  },
  // Resto de acciones sobre un corredor, desde su ficha
  async 'runner-do'(el) { const r = runnerById(el.dataset.id); if (r) await runnerDo(el.dataset.a, r); },

  async 'all-links'() {
    const text = [...S.data.runners].sort(byName).map((r) => `${r.name}: ${linkFor(r.code)}`).join('\n');
    try { await navigator.clipboard.writeText(text); toast(`${S.data.runners.length} enlaces copiados: pégalos en tus notas y envía a cada uno el suyo`); }
    catch { download('enlaces-corredores.txt', text, 'text/plain;charset=utf-8'); }
  },
  async backup() {
    const data = await run(() => api.exportAll());
    if (!data) return;
    download(`monzon-copia-${todayISO()}.json`, JSON.stringify(data, null, 1), 'application/json');
    store.set(BACKUP_KEY, new Date().toISOString()); render();
  },
  async 'backup-docs'() {
    const docs = S.docs || [];
    if (!docs.length) return toast(S.docs === null ? 'Los documentos aún no están activados.' : 'Todavía no hay contratos subidos.', true);
    const parts = [];
    const ok = await run(async () => {
      for (const [i, d] of docs.entries()) {
        toast(`Descargando documento ${i + 1} de ${docs.length}…`);
        const x = await api.getDocument(d.id);
        parts.push(JSON.stringify({ runner_id: d.runner_id, runner: runnerById(d.runner_id)?.name || null, year: d.year, title: d.title, filename: x.filename, mime: x.mime, b64: x.b64 }));
      }
      return true;
    });
    if (!ok) return;
    download(`monzon-documentos-${todayISO()}.json`, `{"app":"cc-monzon-documentos","version":1,"exported_at":"${new Date().toISOString()}","documentos":[\n${parts.join(',\n')}\n]}`, 'application/json');
    store.set(BACKUP_DOCS_KEY, new Date().toISOString()); toast(`${docs.length} documento${docs.length === 1 ? '' : 's'} descargado${docs.length === 1 ? '' : 's'}`); render();
  },
  'backup-snooze'() { store.set(BACKUP_SNOOZE_KEY, new Date(Date.now() + 7 * 864e5).toISOString()); toast('Te lo recordaré en 7 días'); render(); },
  'csv-year'() { download(`monzon-resultados-${S.year}.csv`, toCsv(csvRows(S.data.races.filter((r) => yearOf(r.date) === S.year))), 'text/csv;charset=utf-8'); },
  'bonus-csv'() {
    const cfg = bonusCfg(S.year);
    const rows = yearBonuses(S.year, S.data.races, S.data.registrations, S.data.runners, cfg, S.data.circuitPodiums || []).map((r) => [
      r.runner.name, contractLabel(r.contract), r.count, r.extra, r.suspended, r.bonusCount, r.amount, r.reachesMinimum ? 'Sí' : 'No', r.penalty, r.amount - r.penalty,
      r.next ? r.next.races : '', r.next ? r.missingToNext : '', r.planned, r.projected.count]);
    download(`monzon-bonos-${S.year}.csv`, toCsv(rows, ['Corredor', 'Contrato', 'Carreras', 'Extra por circuitos', 'Suspendidas (solo mínimo)', 'Total para el bono', 'Bono actual (€)', 'Llega al mínimo',
      'Penalización (€)', 'Saldo (€, + el club debe)', 'Siguiente tramo', 'Faltan', 'Inscritas pendientes', 'Previsión']), 'text/csv;charset=utf-8');
  },
  'season-csv'() { download(`monzon-computo-${S.year}.csv`, toCsv(seasonByRunner(S.year, S.data.races, S.data.runners, contractLabel, yearBonuses(S.year, S.data.races, S.data.registrations, S.data.runners, bonusCfg(S.year), S.data.circuitPodiums || [])), [...SEASON_COLUMNS, ...SEASON_BONUS_COLUMNS]), 'text/csv;charset=utf-8'); },
  'season-detail-csv'() { download(`monzon-participaciones-${S.year}.csv`, toCsv(seasonDetail(S.year, S.data.races), SEASON_DETAIL_COLUMNS), 'text/csv;charset=utf-8'); },
  'r-filter'(el) { S.rfilter = S.rfilter === el.dataset.f ? 'todos' : el.dataset.f; render(); },
  'r-sort'(el) { S.rsort = el.dataset.s; render(); },
  'r-manage'() { (S.open ||= {}).rmanage = true; render(); document.getElementById('manage')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  'theme'(el) { store.set(THEME_KEY, el.dataset.t); applyTheme(el.dataset.t); render(); },
  'r-ics'(el) {
    const g = S.runnerData.registrations.find((x) => x.id === el.dataset.id);
    if (g) download(`${normalize(g.name).replace(/\W+/g, '-')}.ics`, icsEvent(g), 'text/calendar;charset=utf-8');
  },
  async 'pub-copy'(el) { const r = S.data.races.find((x) => x.id === el.dataset.id); if (r) await copyText(raceResultText(r), 'Texto copiado'); },
  async 'pub-all-res'() {
    const a = pubAudit(S.year);
    if (!await confirmAction('Marcar como publicadas', `Se marcarán <b>${a.resPending.length}</b> publicaciones de resultados como hechas. Úsalo si ya las habías publicado antes de tener esta pantalla.`, 'Marcar todas', 'primary')) return;
    await setPostedKeys(a.resPending.map((x) => x.key), true);
  },
  async 'pub-old-done'() {
    const a = pubAudit(S.year);
    if (!await confirmAction('Marcar como publicadas', `Se marcarán <b>${a.resOld.length}</b> carreras antiguas como «resultados publicados». Así dejan de aparecer.`, 'Marcar', 'primary')) return;
    await setPostedKeys(a.resOld.map((x) => x.key), true);
  },
  async 'pub-refresh'() { await Promise.all([refreshPosts(true), loadStories()]); toast('Actualizado'); },
  async 'pub-story-manual'(el) { await setPostedKeys([el.dataset.key], true); toast('Marcada como publicada'); },
  async 'pub-orphans-del'() { await setPostedKeys(pubAudit(S.year).orphans.map((o) => o.key), false); toast('Marcas quitadas'); },
  'print-report'() { window.print(); },
  'ig-period'(el) { S.igPeriod = el.dataset.p; render(); },
  'net-filter'(el) { S.netFilter = el.dataset.f; S.netMore = false; render(); },
  'net-range'(el) { S.netAll = el.dataset.w === '1'; S.netMore = false; render(); },
  'net-more'() { S.netMore = true; render(); },
  async 'info-next'() { await choose('Mis próximas inscripciones', 'Carreras a las que estás apuntado y que aún no se han corrido. <b>Toca una</b> para abrirla: ves quién va, puedes borrarte y, si la añadiste tú, editarla.', [{ label: 'Entendido', value: true, kind: 'primary' }]); },
  async 'res-admin-save'(el) {
    const box = el.closest('.net-res'); if (!box) return;
    const changes = [];
    for (const row of box.querySelectorAll('.rs-row')) {
      const posTxt = row.querySelector('[data-rs="pos"]').value.trim(), timeTxt = row.querySelector('input[data-rs="time"]').value.trim();
      const position = posTxt ? Number(posTxt) : null, time = timeTxt ? parseTime(timeTxt) : null;
      if (posTxt && !(Number.isInteger(position) && position >= 1 && position <= 999)) return toast(`Puesto no válido: ${row.querySelector('.rs-who b').textContent}.`, true);
      if (timeTxt && !time) return toast(`Revisa el tiempo de ${row.querySelector('.rs-who b').textContent}: los minutos van de 0 a 59.`, true);
      if (`${position || ''}|${time || ''}` !== row.dataset.orig) changes.push({ id: row.dataset.runner, position, time, podium: row.dataset.podium });
    }
    if (!changes.length) return toast('No has cambiado nada.');
    const ok = await run(async () => { for (const c of changes) await api.adminSetResult(el.dataset.kind, el.dataset.id, c.id, c.position, c.podium, c.time); await reload(); return true; },
      `Guardado: ${changes.length} ${changes.length === 1 ? 'puesto' : 'puestos'}`);
    if (ok) render();
  },
  'chro-tab'(el) { S.chroTab = el.dataset.t === 'imp' ? 'imp' : 'cro'; S.open = { ...(S.open || {}), chro: true }; render(); },
  async 'r-suspend'(el) {
    const susp = el.dataset.v === '1', g = (S.runnerData?.registrations || []).find((x) => x.id === el.dataset.id);
    if (!await confirmAction(susp ? 'Carrera suspendida' : 'Se vuelve a celebrar',
      susp ? `¿Marcar <b>${esc(g?.name || 'esta carrera')}</b> como suspendida? Se puede deshacer.` : `¿<b>${esc(g?.name || 'Esta carrera')}</b> vuelve a celebrarse?`, susp ? 'Sí, suspendida' : 'Sí, se celebra', 'primary')) return;
    await run(async () => { await api.runnerSetSuspended(S.code, el.dataset.id, susp); await loadRunner(); return true; }, susp ? '⛔ Carrera suspendida' : 'Carrera activa otra vez');
    render();
  },
  async 'chro-admin-all'(el) { await setChronicleFor(el.dataset.ids.split(','), el.dataset.key, true); },
  'ig-tab'(el) { S.igTab = el.dataset.t; render(); },
  async 'ig-per-del'(el) {
    if (!await confirmAction('Quitar periodo', 'Se borra este resumen de periodo (no toca el resto de datos).', 'Quitar')) return;
    await run(async () => { await api.deleteIgPeriod(el.dataset.key); await loadIg(true); }, 'Periodo quitado');
  },
  'ig-sort'(el) { S.igSort = el.dataset.s; render(); },
  'ig-all'() { S.igAll = !S.igAll; render(); },
  'ig-csv'() {
    const [from, to] = igRange(S.igPeriod || 'all'), g = igSummary(S.ig?.rows || [], from, to), tag = `${from || g.first || 'todo'}_${to || g.last || ''}`.replace(/_$/, '');
    const days = toCsv(g.days.map((d) => [d.date, d.views ?? '', d.reach ?? '', d.interactions ?? '', d.likes ?? '', d.comments ?? '', d.shares ?? '', d.saves ?? '', d.follows ?? '', d.views_f ?? '', d.views_nf ?? '']),
      ['Fecha', 'Visualizaciones', 'Personas alcanzadas', 'Interacciones', 'Me gusta', 'Comentarios', 'Compartidos', 'Guardados', 'Nuevos seguidores', 'Visualizaciones de seguidores', 'Visualizaciones de no seguidores']);
    const posts = toCsv(g.posts.map((p) => [p.date, p.title || '', p.type || '', p.link || '', p.views ?? '', p.reach ?? '', p.likes ?? '', p.comments ?? '', p.shares ?? '', p.saves ?? '', p.visits ?? '']),
      ['Fecha', 'Título', 'Tipo', 'Enlace', 'Visualizaciones', 'Personas alcanzadas', 'Me gusta', 'Comentarios', 'Compartidos', 'Guardados', 'Visitas al perfil']);
    const P = igPeriods(S.ig?.rows || [], from, to);
    if (P.list.length) {
      const per = toCsv(P.list.map((x) => [x.from, x.to, x.days, x.views ?? '', x.viewers ?? '', x.interactions ?? '', x.net_follows ?? '', x.v_story ?? '', x.v_feed ?? '', x.v_reel ?? '', x.likes ?? '', x.comments ?? '', x.shares ?? '', x.saves ?? '', x.profile_visits ?? '']),
        ['Desde', 'Hasta', 'Días', 'Reproducciones', 'Espectadores', 'Interacciones', 'Seguidores netos', 'Reproducciones de historias', 'Reproducciones de publicaciones', 'Reproducciones de reels', 'Me gusta', 'Comentarios', 'Compartidos', 'Guardados', 'Visitas al perfil']);
      download(`monzon-instagram-periodos-${tag}.csv`, per, 'text/csv;charset=utf-8');
    }
    setTimeout(() => download(`monzon-instagram-dias-${tag}.csv`, days, 'text/csv;charset=utf-8'), 400);
    setTimeout(() => download(`monzon-instagram-publicaciones-${tag}.csv`, posts, 'text/csv;charset=utf-8'), 800);
  },
  'rep-frozen'(el) { S.repFrozen = el.dataset.v === '1'; render(); },
  async 'rep-freeze'() {
    const had = !!S.data.settings?.[`cierre_${S.year}`];
    if (!await confirmAction('Guardar cierre', `Se guardará una <b>foto de las cifras de hoy</b> de la temporada ${S.year}${had ? ', sustituyendo al cierre anterior' : ''}. Podrás volver a verla aunque luego cambies datos.`, 'Guardar', 'primary')) return;
    await run(async () => { await api.saveSetting(`cierre_${S.year}`, seasonModel(S.year)); await reload(); }, 'Cierre guardado'); render();
  },
  'sum-mod'(el) { S.sumMod = el.dataset.m; render(); },
  'eq-tab'(el) { S.eqTab = el.dataset.t; render(); window.scrollTo({ top: 0 }); },
  'eq-metric'(el) { S.eqMetric = el.dataset.k; render(); },
  'ig-filters'() {
    const dlg = document.getElementById('dialog'); dlg.innerHTML = igFilterHtml(); dlg.onclose = null; dlg.showModal();
  },
  'eq-filters'() { const dlg = document.getElementById('dialog'); dlg.innerHTML = eqFilterHtml(); dlg.onclose = null; dlg.showModal(); },
  'eq-clear'() { S.sumMod = 'all'; S.year = availableYears(eqSource().races)[0]; render(); },
  'res-tab'(el) { S.resTab = el.dataset.t; render(); window.scrollTo({ top: 0 }); },
  'pod-view'(el) { S.podView = el.dataset.v; render(); },
  'tp-sort'(el) { const k = el.dataset.k, cur = S.tsort || { k: 'races', dir: -1 }; S.tsort = { k, dir: cur.k === k ? -cur.dir : (k === 'name' ? 1 : -1) }; render(); },
  'tp-csv-runners'() {
    const pk = seasonPack(S.year), rows = seasonRunnerRows(pk), ds = pk.s.disciplines;
    const head = ['Corredor', 'Categoría', 'Carreras', 'Km', 'Desnivel (m)', 'Desplazamiento (km, ida y vuelta)', 'Coste inscripciones (€)', 'Tiempo (h)', 'Disciplinas distintas', 'Meses con carrera', 'Oros', 'Platas', 'Bronces', 'Podios', ...ds.map((d) => disciplineName(d))];
    download(`monzon-corredores-${S.year}.csv`, toCsv(rows.sort((a, b) => b.races - a.races).map((r) => [r.name, r.cat, r.races, r.km || 0, r.elev || 0, r.trip || 0, r.cost || 0, Math.round((r.time || 0) / 36) / 100, r.nd, r.nm, r.p1, r.p2, r.p3, r.pod, ...ds.map((d) => r.discs[d.key] || 0)]), head), 'text/csv;charset=utf-8');
  },
  'tp-csv-disc'() {
    const pk = seasonPack(S.year);
    download(`monzon-disciplinas-${S.year}.csv`, toCsv(pk.s.disciplines.map((d) => [d.modality, d.subtype || '', d.races, d.participations, d.runners, d.podiums, d.wins, d.elevation || 0, d.avgElev || '', d.avgPrice || '']), ['Modalidad', 'Disciplina', 'Carreras', 'Participaciones', 'Corredores', 'Podios', 'Victorias', 'Desnivel total (m)', 'Desnivel medio (m)', 'Precio medio inscripción (€)']), 'text/csv;charset=utf-8');
  },
  'part-view'(el) { S.partView = el.dataset.v; render(); },
  'race-mod'(el) { S.raceMod = el.dataset.m; render(); },
  'race-todo'() { S.raceTodo = !S.raceTodo; render(); },
  'race-repeat'() {
    const d = S.draft; if (!d?.id) return;
    const next = (iso) => { if (!iso) return ''; const [y, m, dd] = iso.split('-'); return `${Number(y) + 1}-${m}-${m === '02' && dd === '29' ? '28' : dd}`; };
    S.prefill = { name: d.name, date: next(d.date), place: d.place || '', province: d.province || '', country: d.country || DEFAULT_COUNTRY, modality: d.modality,
      race_type: d.race_type || 'suelta', circuit: d.circuit || '', multi: !!d.end_date, end_date: next(d.end_date) };
    toast('Inscripción nueva con los datos de esta carrera: ajusta la fecha si hace falta');
    go('#/inscripciones/nueva');
  },
  'add-many'() {
    const ids = [...$app.querySelectorAll('input[data-many]:checked')].map((el) => el.dataset.many);
    if (!ids.length) return toast('Marca al menos un corredor.', true);
    for (const id of ids) {
      const rn = runnerById(id); if (!rn || S.draft.people.some((x) => x.runner_id === id)) continue;
      S.draft.people.push({ runner_id: rn.id, runner_name: rn.name, category: rn.category || '', position: '',
        podium_type: S.draft.race_type === 'campeonato' ? 'campeonato' : S.draft.stages?.length ? 'general' : 'suelta', stage_positions: (S.draft.stages || []).map(() => '') });
    }
    render();
    toast(`${ids.length} corredor${ids.length === 1 ? '' : 'es'} añadido${ids.length === 1 ? '' : 's'}`);
  },
  async 'corr-accept'(el) {
    await run(async () => { await api.resolveCorrection(el.dataset.id, true, null); await reload(); }, 'Corrección aceptada y aplicada'); render();
  },
  async 'corr-reject'(el) {
    const reply = prompt('Motivo del rechazo (opcional, lo verá el corredor):', '');
    if (reply === null) return;
    await run(async () => { await api.resolveCorrection(el.dataset.id, false, reply); await reload(); }, 'Corrección rechazada'); render();
  },
  async 'news-reply'(el) {
    const guests = Number($app.querySelector(`select[data-guests="${el.dataset.id}"]`)?.value || 0);
    await run(async () => { await api.runnerReplyNews(S.code, el.dataset.id, el.dataset.a, guests); await loadNews(); }, el.dataset.a === 'si' ? '¡Apuntado!' : 'Anotado: no vienes');
    render();
  },
  'goto-sec'(el) { const t = document.getElementById(el.dataset.to); if (t) { const dt = t.matches('details') ? t : t.querySelector('details'); if (dt) { dt.open = true; S.open = { ...(S.open || {}), [dt.dataset.openKey]: true }; } for (let a = t.parentElement; a; a = a.parentElement) if (a.tagName === 'DETAILS' && !a.open) { a.open = true; if (a.dataset.openKey) S.open = { ...(S.open || {}), [a.dataset.openKey]: true }; } t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } else toast('No tienes carreras en este apartado.'); },
  'mov-filter'(el) { S.movFilter = el.dataset.f; render(); },
  'hist-filter'(el) { S.histFilter = el.dataset.f; render(); },
  'week-view'(el) { S.weekView = el.dataset.v; render(); },
  'week-all'() { const set = postedSet(), list = weekRaces(S.weekDays || 14); setPostedKeys(list.map(postKey), !list.every((g) => set.has(postKey(g)))); },
  'post-all'() { setPostedKeys(adminAlerts().week.map(postKey), true); },
  async 'alert-week-copy'() {
    const t = weekText(7, adminAlerts().weekTodo);
    try { await navigator.clipboard.writeText(t); toast('Texto copiado: pégalo en WhatsApp'); } catch { prompt('Copia el texto:', t); }
  },
  'alert-week-wa'() { window.open('https://wa.me/?text=' + encodeURIComponent(weekText(7, adminAlerts().weekTodo)), '_blank'); },
  'soc-days'(el) { S.socDays = Number(el.dataset.n) || 14; render(); },
  'soc-refresh'() { loadSocial(); },
  async 'soc-copy'() { const up = socialUpcoming().filter((g) => !new Set(S.socialData.posted).has(postKey(g))); await copyText(socialText(up, S.socDays || 14), 'Texto copiado: pégalo donde publiques'); },
  'soc-wa'() { const up = socialUpcoming().filter((g) => !new Set(S.socialData.posted).has(postKey(g))); window.open('https://wa.me/?text=' + encodeURIComponent(socialText(up, S.socDays || 14)), '_blank'); },
  async 'soc-copy-res'(el) { const x = S.socialData.recent.find((r) => resKey(r) === el.dataset.key); if (x) await copyText(resultText(x), 'Texto copiado'); },
  async 'soc-link-new'() {
    await run(async () => { await api.saveSetting('social', { code: newCode() }); await reload(); }, 'Enlace creado: envíaselo al encargado de redes'); render();
  },
  async 'soc-link-copy'() { await copyText(socialLink(S.data.settings.social.code), 'Enlace copiado'); },
  'soc-link-wa'() {
    const msg = `Hola! Este es tu enlace para ver las carreras del Club Ciclista Monzón que hay que publicar en redes (próximas con quién va, y resultados recientes). Marca ✓ lo que ya hayas publicado:\n${socialLink(S.data.settings.social.code)}\n\nEs solo tuyo: no lo reenvíes.`;
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
  },
  async 'soc-link-off'() {
    if (!await confirmAction('Anular el enlace', 'El enlace actual dejará de funcionar. Podrás crear uno nuevo cuando quieras.', 'Anular enlace')) return;
    await run(async () => { await api.saveSetting('social', { code: null }); await reload(); }, 'Enlace anulado'); render();
  },
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
  async 'circ-confirm'(el) { await run(async () => { await api.confirmCircuitPodium(el.dataset.id); await reload(); }, 'Plus de bonificación confirmado'); render(); },
  async 'circ-del'(el) {
    if (!await confirmAction('Quitar el plus de bonificación', 'Dejará de sumar carreras extra para el bono.', 'Quitar')) return;
    await run(async () => { await api.deleteCircuitPodium(el.dataset.id); await reload(); }, 'Quitado'); render();
  },
  async 'circ-cancel'(el) {
    if (!await confirmAction('Retirar', '¿Retirar este plus que pediste?', 'Retirar')) return;
    await run(async () => {
      try { await api.runnerCancelCircuit(S.code, el.dataset.id); }
      catch (e) { // solo se retiran los pendientes: si la dirección lo confirmó mientras tanto, la base de datos no lo borra
        await loadRunner();
        throw new Error(/no_es_tuya/.test(String(e?.message)) ? 'plus_confirmado' : e?.message);
      }
      await loadRunner();
    }, 'Retirado'); render();
  },
  'csv-all'() { download(`monzon-resultados-todos.csv`, toCsv(csvRows(S.data.races)), 'text/csv;charset=utf-8'); },
};

const forms = {
  async 'r-complete'(f) {
    if (S.preview) return toast('Vista previa: aquí no se puede cambiar nada.', true);
    const data = { province: cleanName(f.province?.value || ''), km: f.km?.value || '', subtype: f.subtype?.value || '', elevation: parseElev(f.elevation?.value) ?? '', price: parsePrice(f.price?.value) ?? '' };
    if ((f.elevation?.value.trim() && data.elevation === '') || (f.price?.value.trim() && data.price === '')) return toast('Revisa el desnivel (1 a 10 000 m) y el precio (0 a 10 000 €).', true);
    if (!data.province && !parseKm(data.km) && !data.subtype && data.elevation === '' && data.price === '') return toast('Rellena al menos un dato.', true);
    const ok = await run(async () => { await api.runnerComplete(S.code, f.dataset.kind, f.dataset.id, data); await loadRunner(); S.team = null; await loadTeam(); return true; }, '¡Gracias! Datos guardados');
    if (ok) render();
  },
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
    S.data = null; go('#/hoy');
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
  async 'w-save'() {
    const d = S.rdraft; if (!d || d.wk == null) return;
    let name = cleanName(d.name);
    if (name.length < 3) return toast('Pon el nombre de la carrera.', true);
    if (!d.date) return toast('Falta la fecha.', true);
    if (d.multi && !d.end_date) return toast('Falta el último día.', true);
    if (d.wk === 'nueva') {   // ¿ya está en Carreras con otro nombre? Se usa esa para no duplicarla
      const same = watchMatch({ name, date: d.date, end_date: d.multi ? d.end_date : null }, S.runnerData.registrations);
      const sameName = same && normalize(same.name).replace(/[^a-z0-9]/g, '') === normalize(name).replace(/[^a-z0-9]/g, '');
      if (sameName) { name = same.name; d.name = same.name; }   // es la misma escrita distinto: se usa el nombre de Carreras
      else if (same) {
        const c = await choose('¿Es esta carrera?', `Ya hay <b>${esc(same.name)}</b> en Carreras esos días (${esc(when(same))}).`, [
          { label: 'Sí, guardar esa', value: 'use', kind: 'primary' }, { label: 'No, es otra: guardar la mía', value: 'mine' }]);
        if (!c) return;
        if (c === 'use') { name = same.name; d.date = same.date; d.name = same.name; }
      }
    }
    if (d.deadline && d.deadline > d.date) return toast('El plazo de inscripción no puede ser después de la carrera.', true);
    if (String(d.km ?? '').trim() !== '' && parseKm(d.km) === null) return toast('La distancia tiene que estar entre 0 y 1000 km.', true);
    if (String(d.elevation ?? '').trim() !== '' && parseElev(d.elevation) === null) return toast('El desnivel tiene que ser un número entre 1 y 10 000 metros.', true);
    let url = String(d.url || '').trim(); if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    const data = { name, date: d.date, end_date: d.multi ? d.end_date : '', place: cleanName(d.place), province: cleanName(d.province), country: d.country, modality: d.modality,
      subtype: SUBTYPES[d.modality]?.includes(d.subtype) ? d.subtype : '', km: parseKm(d.km), url, price: String(d.price ?? '').trim(), elevation: parseElev(d.elevation) ?? '', deadline: d.deadline || '', notes: d.notes || '' };
    const ok = await run(async () => { await api.runnerWatchSave(S.code, d.wk === 'nueva' ? null : d.wk, data); await loadWatch(); return true; }, 'Guardada en «Por valorar»');
    if (ok) { S.rdraft = null; S.q.runner = ''; go('#/mi/valorar'); }
  },
  async 'r-create'() {
    const d = S.rdraft;
    const name = cleanName(d.name);
    if (d.multi && !d.end_date) return toast('Falta el último día.', true);
    if (!d.id && !d.category) return toast('Elige tu categoría para apuntarte.', true);
    if (d.race_type === 'circuito' && !cleanName(d.circuit)) return toast('Falta el nombre del circuito.', true);
    if (String(d.elevation ?? '').trim() !== '' && parseElev(d.elevation) === null) return toast('El desnivel tiene que ser un número entre 1 y 10 000 metros.', true);
    if (String(d.price ?? '').trim() !== '' && parsePrice(d.price) === null) return toast('El precio tiene que ser un número entre 0 y 10 000 euros (0 = gratis).', true);
    if (!d.kind && cleanWeb(d.url) === '!') return toast('La web no parece una dirección válida. Pon algo como https://nombre-de-la-carrera.com o déjala vacía.', true);
    if (d.id && d.kind === 'race') { // editar una carrera propia que ya está en resultados
      const subtype = SUBTYPES[d.modality]?.includes(d.subtype) ? d.subtype : null;
      if (String(d.km ?? '').trim() !== '' && parseKm(d.km) === null) return toast('La distancia tiene que estar entre 0 y 1000 km.', true);
      const ok = await run(async () => {
        await api.runnerUpdateRace(S.code, d.id, { name, date: d.date, end_date: d.multi ? d.end_date : null, place: cleanName(d.place),
          province: cleanName(d.province), country: d.country, modality: d.modality, notes: d.notes || '',
          race_type: d.race_type || 'suelta', circuit: d.race_type === 'circuito' ? cleanName(d.circuit) : null, subtype, km: parseKm(d.km), elevation: parseElev(d.elevation) ?? '', price: parsePrice(d.price) ?? '' });
        await loadRunner(); if (S.team) await loadTeam(); return true;
      }, 'Carrera actualizada');
      if (ok) { S.rdraft = null; go(runnerHref('mi')); }
      return;
    }
    if (d.id) { // editar una carrera propia
      const ok = await run(async () => {
        await api.runnerUpdate(S.code, d.id, { name, date: d.date, end_date: d.multi ? d.end_date : null, place: cleanName(d.place),
          province: cleanName(d.province), country: d.country, modality: d.modality, notes: d.notes || '', elevation: parseElev(d.elevation) ?? '', price: parsePrice(d.price) ?? '' });
        await setMyRaceType(d.id, d); await setMyDetails(d.id, d);
        const cur = S.runnerData.registrations.find((x) => x.id === d.id)?.url || '';
        if (cleanWeb(d.url) !== '!' && (cleanWeb(d.url) || '') !== cur) await api.runnerSetUrl(S.code, d.id, cleanWeb(d.url));
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
      if (choice === 'join') {
        if (cleanWeb(d.url) && cleanWeb(d.url) !== '!' && !same.url) await api.runnerSetUrl(S.code, same.id, cleanWeb(d.url)).catch(() => {});
        const extra = { elevation: !same.elevation ? parseElev(d.elevation) ?? '' : '', price: same.price == null ? parsePrice(d.price) ?? '' : '' };
        if (extra.elevation !== '' || extra.price !== '') await api.runnerComplete(S.code, 'reg', same.id, extra).catch(() => {});
        return actions['r-join-go']({ dataset: { id: same.id } });
      }
    }
    const past = d.date < todayISO();
    const id = await run(async () => {
      const newId = await api.runnerCreate(S.code, { name, date: d.date, end_date: d.multi ? d.end_date : null, place: cleanName(d.place),
        province: cleanName(d.province), country: d.country, modality: d.modality, url: cleanWeb(d.url) || '', elevation: parseElev(d.elevation) ?? '', price: parsePrice(d.price) ?? '' }, d.category || null);
      if (newId && d.race_type && d.race_type !== 'suelta') await setMyRaceType(newId, d);
      if (newId) await setMyDetails(newId, d);
      if (d.watchId) { await api.runnerWatchDelete(S.code, d.watchId).catch(() => {}); await loadWatch(); }   // ya no está «por valorar»
      await loadRunner(); return newId || true;
    }, past ? 'Carrera añadida: ahora pon tu resultado' : 'Carrera añadida y te has apuntado');
    if (id) { S.rdraft = null; S.q.runner = ''; go(past ? resultHref(id) : '#/'); }
  },
  async 'r-report'(f) {
    const position = Number(f.position.value);
    if (!Number.isInteger(position) || position < 1) return toast('Pon un puesto válido (1, 2, 3…).', true);
    const cat = f.category.value || null, pod = f.podium.value;
    const rawTime = f.time.value.trim(), time = rawTime ? parseTime(rawTime) : null;
    if (rawTime && !time) return toast('Revisa el tiempo: minutos y segundos van de 0 a 59. Déjalo vacío si no lo sabes.', true);
    const txt = `${position}º${cat ? ' en ' + cat : ''}${time ? ' · ⏱️ ' + formatTime(time) : ''}${position <= 3 && pod === 'campeonato' ? ` · ${podiumLabel(pod)}` : ''}`;
    if (!await confirmAction('Guardar resultado', `Vas a guardar: <b>${esc(txt)}</b>.<br>Si te equivocas, lo puedes cambiar después.`, 'Guardar', 'primary')) return;
    const ok = await run(async () => { await api.runnerReport(S.code, f.dataset.kind, f.dataset.id, position, cat, pod, time); await loadRunner(); return true; },
      position <= 3 ? `${medal(position)} ¡Enhorabuena! Resultado enviado` : 'Resultado enviado');
    if (ok) go(runnerHref('mi'));
  },
  async 'tpl-upload'(f) {
    const file = f.file.files?.[0];
    if (!file) return toast('Elige un archivo.', true);
    if (!/^(application\/pdf|image\/)/.test(file.type)) return toast('Solo PDF o fotos (JPG, PNG, WEBP).', true);
    const ok = await run(async () => {
      const { b64, mime } = await fileToB64(file);
      await api.uploadContractTemplate(f.dataset.contract, f.title.value.trim(), file.name, mime, b64);
      await reload(); return true;
    }, 'Contrato subido: ya lo ven los corredores de ese tipo');
    if (ok) render();
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
    const ok = await run(async () => { await api.saveAnnouncement({ id: S.annEdit, title, body: f.body.value.trim(), expires_at: f.expires_at.value || null, rsvp: f.rsvp.checked }); await reload(); return true; },
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
      'Plus de bonificación añadido');
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
    if (id) go(editBack('#/inscripciones'));
  },
  async 'save-race'() {
    const d = S.draft;
    if (!d.id) { // misma fecha y mismo nombre: casi seguro es un duplicado
      const same = S.data.races.find((x) => x.date === d.date && normalize(x.name) === normalize(cleanName(d.name)));
      if (same) {
        const c = await choose('Esta carrera ya existe', `Ya hay <b>${esc(same.name)}</b> el mismo día (${esc(when(same))}).`, [
          { label: 'Abrir la que ya existe', value: 'open', kind: 'primary' }, { label: 'Crear otra igualmente', value: 'create' }]);
        if (!c) return;
        if (c === 'open') return go('#/carreras/' + same.id);
      }
    }
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
        const rawTime = String(p.time || '').trim(), time_seconds = rawTime ? parseTime(rawTime) : null;
        if (rawTime && !time_seconds) throw new Error(`Tiempo no válido para ${p.runner_name}: usa horas:minutos:segundos (2:05:30).`);
        return { runner_id: p.runner_id, runner_name: p.runner_name, category: p.category || null, position, time_seconds,
          podium_type: isPodium(position) ? p.podium_type || 'suelta' : 'suelta',
          stage_positions: stage_positions.some((x) => x !== null) ? stage_positions : null,
          self_reported: !!p.self_reported && String(p.position) === String(p.origPosition) };
      });
      race.stages = d.stages.length ? d.stages.map((n, j) => cleanName(n) || `Etapa ${j + 1}`) : null;
      const r = await api.saveRace(race, results); await reload(); return r;
    }, 'Carrera guardada');
    if (id) go(editBack('#/carreras'));
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
  async 'restore-docs'(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { return toast('El archivo no es una copia válida.', true); }
    if (data?.app !== 'cc-monzon-documentos' || !Array.isArray(data.documentos)) return toast('El archivo no es una copia de documentos de esta app.', true);
    const have = new Set((S.docs || []).map((x) => `${x.runner_id}|${x.year}|${x.title}`));
    const todo = data.documentos.filter((x) => runnerById(x.runner_id) && !have.has(`${x.runner_id}|${x.year}|${x.title}`));
    const missing = data.documentos.filter((x) => !runnerById(x.runner_id)).length;
    if (!todo.length) return toast(missing ? 'Ninguno de los corredores de esa copia existe ahora: restaura antes los datos.' : 'Todos esos documentos ya están.', true);
    if (!await confirmAction('Restaurar documentos', `Se añadirán <b>${todo.length}</b> documento${todo.length === 1 ? '' : 's'}${missing ? ` (${missing} se saltan porque su corredor ya no existe)` : ''}.`, 'Restaurar', 'primary')) return;
    const n = await run(async () => {
      let done = 0;
      for (const x of todo) { toast(`Subiendo documento ${done + 1} de ${todo.length}…`); await api.uploadDocument(x.runner_id, x.year, x.title, x.filename, x.mime, x.b64); done++; }
      await reload(); return done;
    });
    if (n) { toast(`${n} documento${n === 1 ? '' : 's'} restaurado${n === 1 ? '' : 's'}`); render(); }
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

const RUNNER_ACTIONS = new Set(['r-web', 'note-edit', 'w-sign', 'w-del', 'w-repeat', 'w-add-fed', 'w-add-reg', 'chro-toggle', 'chro-all', 'r-join', 'r-leave', 'r-new', 'r-new-fed', 'r-forget', 'r-refresh', 'r-joined', 'r-paid', 'r-join-go', 'r-delete-mine', 'r-join-race', 'circ-cancel', 'news-reply']);
// los enlaces de la ventana emergente (p. ej. las carreras de un compañero) cierran la ventana al navegar
document.getElementById('dialog').addEventListener('click', (ev) => { if (ev.target.closest('a[href^="#/"]')) ev.currentTarget.close(); });
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
    if (t.dataset.search === 'runner') ensureTeamQuiet();
    if (t.dataset.search === 'runner') syncSearchMode();
    updateSearch(t.dataset.search);
    return;
  }
  if (t.dataset.tpart) {
    const w = t.closest('.tinput'), v = (k) => w.querySelector(`[data-tpart="${k}"]`);
    t.value = t.value.replace(/\D/g, '');
    if (t.dataset.tpart !== 'h' && t.value.length === 2 && Number(t.value) > 59) t.value = '59';
    const hid = w.querySelector('[data-tvalue]'), [h, m] = ['h', 'm'].map((k) => v(k).value), x = Number(w.dataset.sec || 0);   // los segundos que ya hubiera se conservan
    hid.value = h || m ? `${Number(h || 0)}:${String(Number(m || 0)).padStart(2, '0')}:${String(x).padStart(2, '0')}` : '';
    if (t.dataset.tpart === 'h' && t.value.length === 2 && ev.inputType !== 'deleteContentBackward') v('m').focus();
    hid.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  if (t.dataset.rf && S.rdraft) {
    S.rdraft[t.dataset.rf] = t.value;
    if (t.dataset.rf === 'name' && !S.rdraft.subtype) {
      const g = guessSubtype(t.value, S.rdraft.modality);
      if (g) { S.rdraft.subtype = g; const sel = [...$app.querySelectorAll('input[data-rf="subtype"]')].find((x) => x.value === g); if (sel) sel.checked = true; }
    }
    if (t.dataset.rf === 'name') updateSearch('rname');
    return;
  }
  if (!S.draft) return;
  if (t.dataset.f === 'name' && !S.draft.subtype) { // el nombre da pistas del formato (XCM, Critérium…)
    const g = guessSubtype(t.value, S.draft.modality);
    if (g) { S.draft.subtype = g; const sel = [...$app.querySelectorAll('input[data-f="subtype"]')].find((x) => x.value === g); if (sel) sel.checked = true; }
  }
  if (S.draft.kind === 'reg' && !S.draft.id && t.dataset.f === 'name') {
    S.draft.name = t.value;
    if (!S.fed) loadFed();
    const box = $app.querySelector('#dup-admin');
    if (box) box.innerHTML = dupSuggestions(t.value, S.data.registrations, false);
  }
  if (S.draft.kind === 'race' && !S.draft.id && t.dataset.f === 'name') {
    S.draft.name = t.value;
    const box = $app.querySelector('#dup-race');
    if (box) box.innerHTML = raceDupes(t.value);
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
  if (t.dataset.yearSel !== undefined) { S.year = Number(t.value); render(); return; }
  if (t.dataset.msgPick) { go(`#/mensajes/${t.dataset.msgPick}/${t.value}`); return; }
  if (t.dataset.filter) { actions[{ mod: 'mod-filter', sub: 'sub-filter', who: 'who-filter' }[t.dataset.filter]]({ dataset: { m: t.value, s: t.value, w: t.value } }); return; }
  if (t.dataset.f === 'modality' && S.draft) { // cambia la modalidad: el formato depende de ella
    S.draft.modality = t.value; if (!SUBTYPES[t.value]?.includes(S.draft.subtype)) S.draft.subtype = guessSubtype(S.draft.name, t.value); render(); return;
  }
  if (t.dataset.rf === 'modality' && S.rdraft) {
    S.rdraft.modality = t.value; if (!SUBTYPES[t.value]?.includes(S.rdraft.subtype)) S.rdraft.subtype = guessSubtype(S.rdraft.name, t.value); render(); return;
  }
  if ('retype' in t.dataset) { // cambia el tipo de carrera: mostrar u ocultar el nombre del circuito
    const d = t.dataset.rf ? S.rdraft : S.draft;
    if (d) { d.race_type = t.value; render(); $app.querySelector('[list="dl-circuit"]')?.focus(); }
    return;
  }
  if ('rfMulti' in t.dataset && S.rdraft) {
    S.rdraft.multi = t.checked; if (!t.checked) S.rdraft.end_date = ''; render(); return;
  }
  if (t.dataset.actChange === 'socpost') { // el encargado de redes marca lo publicado
    const key = t.dataset.key, v = t.checked, d = S.socialData;
    d.posted = v ? [...new Set([...d.posted, key])] : d.posted.filter((k) => k !== key); render();
    try { await api.socialMark(store.get(SOCIAL_KEY), key, v); } catch (e) { toast(friendlyError(e), true); loadSocial(); }
    return;
  }
  if (t.dataset.actChange === 'post') { setPostedKeys([t.dataset.key], t.checked); return; }
  if (t.dataset.actChange === 'chro-admin') { setChronicleFor([t.dataset.runner], t.dataset.key, t.checked); return; }
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
  } else if (t.dataset.runnerShift) {
    const id = t.dataset.runnerShift;
    const patch = t.value === '' ? { shift_enabled: false, shift_group: null } : t.value === 'on' ? { shift_enabled: true, shift_group: null } : { shift_enabled: true, shift_group: t.value };
    await run(async () => { await api.updateRunner(id, patch); Object.assign(runnerById(id), patch); }, t.value === '' ? 'Turnos quitados' : t.value === 'on' ? 'Podrá elegir su escamot' : 'Escamot guardado');
  } else if (t.dataset.runnerCat) {
    const id = t.dataset.runnerCat;
    await run(async () => { await api.updateRunner(id, { category: t.value || null }); runnerById(id).category = t.value || null; }, 'Categoría guardada');
  } else if (t.name === 'file' && t.closest('[data-form="doc-upload"], [data-form="tpl-upload"]')) {
    const f = t.files?.[0]; const p = t.closest('form').querySelector('#doc-chosen, .doc-chosen');
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
  if (ev.target.classList?.contains('fsec-d') && /^(rf|af)\d$/.test(o || '')) {   // al plegar una sección de carrera, los resúmenes se ponen al día con lo escrito
    const dr = o.startsWith('rf') ? S.rdraft : S.draft, pv = dr && racePreview(dr);
    if (pv) pv.forEach((t, i) => { const el = ev.target.parentElement.querySelector(`[data-open-key="${o.slice(0, 2)}${i + 1}"] .fsec-p`); if (el) el.textContent = t; });
  }
}, true);
// ---------- Textos explicativos plegados ----------
// Los párrafos de ayuda («hint») no se ven como bloques de texto: quedan en una «i» pequeña que se toca para leerlos. Se hace aquí, una sola vez
// y para toda la app (pantallas y cuadros), observando lo que se pinta; así cualquier texto de ayuda nuevo sale plegado sin tener que acordarse.
const EMOJI_ICON = { '⚠': 'alert', '✅': 'ok', '🏁': 'flag', '🏆': 'trophy', '📅': 'cal', '👥': 'users', '👤': 'user', '📊': 'bars', '📸': 'camera', '⏱': 'timer',
  '📄': 'file', '📋': 'list', '📝': 'pen', '⛔': 'ban', '🗑': 'trash', '✏': 'pen', '⏳': 'clock', '🖼': 'image', '🖨': 'printer', '📣': 'msg', '💶': 'money', '🔗': 'link',
  '💬': 'msg', '📈': 'act', '🗺': 'map', '⬇': 'download', '📥': 'download', '📍': 'pin', '📏': 'ruler', '🏠': 'home', '🔔': 'bell', '🕘': 'clock', '⭐': 'star',
  '⛰': 'mountain', '👕': 'shirt', '⚙': 'settings', '📎': 'clip', '✍': 'pen' };
/** Los emojis decorativos al principio de títulos, botones y etiquetas se pintan como iconos de línea (los de medallas, fiesta y similares se dejan). */
function iconize(root) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll('h2, h3, h4, summary, .btn, button, .chip, .pill, .tag, .desp-t, .chro-t, .issue, .pen-chip, .pub-tag, .extra-chip, .pending-chip, .imp-pub, .bad-txt, .bad-box, .rc-chip, .wchip, .badge, .state-tag, .flabel, .done').forEach((el) => {
    if (el.closest('[data-keep-emoji], svg')) return;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.trim() && !n.parentElement.closest('svg, .ei') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
    const n = w.nextNode(); if (!n) return;
    const t = n.nodeValue, lead = t.length - t.trimStart().length, ch = [...t.slice(lead, lead + 4)][0];
    const key = ch && EMOJI_ICON[ch]; if (!key) return;
    const rest = t.slice(lead + ch.length).replace(/^\ufe0f/, '');
    const span = document.createElement('span'); span.className = 'ei'; span.innerHTML = ico(key);
    n.nodeValue = rest; n.parentNode.insertBefore(span, n); if (lead) n.parentNode.insertBefore(document.createTextNode(t.slice(0, lead)), span);
  });
}
const TIP_MIN = 60;
function foldHints(root) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll('p.hint:not(.tip-body)').forEach((p) => {
    if (p.id || p.className.replace(/\b(hint|center)\b/g, '').trim()) return;                 // los que tienen otra función (estado, contador…) se dejan
    if (p.closest('details.tip, summary, label, .print-only, .rform-help, .ig-help, [data-nofold]')) return;
    const text = p.textContent.replace(/\s+/g, ' ').trim();
    if (text.length < TIP_MIN) return;                                                            // una frase corta se lee de un vistazo
    let h = 0; for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    const key = `tip:${(h >>> 0).toString(36)}`;
    const prev = p.previousElementSibling, head = prev && /^H[1-4]$/.test(prev.tagName) && !prev.querySelector('.tip-btn') ? prev : null;
    p.classList.add('tip-body');
    if (head) {   // detrás de un título: la «i» va al final de la propia línea del título y el texto cae justo debajo
      const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'tip-btn'; bt.dataset.tip = key; bt.title = 'Más información'; bt.setAttribute('aria-label', 'Más información'); bt.innerHTML = ico('info');
      head.classList.add('has-tip'); head.append(bt); p.dataset.tipKey = key; p.hidden = !S.open?.[key]; bt.setAttribute('aria-expanded', String(!p.hidden)); bt.classList.toggle('on', !p.hidden);
    } else {      // suelta: la «i» queda siempre en el borde derecho, en la misma vertical que las demás
      const d = document.createElement('details'); d.className = 'tip'; d.dataset.openKey = key; if (S.open?.[key]) d.open = true;
      const lab = p.closest('.chro-card');   // en Sin resultado y Crónicas la «i» lleva su etiqueta, a la izquierda, para que se entienda qué explica
      if (lab) d.classList.add('tip-lab');
      const sm = document.createElement('summary'); sm.setAttribute('aria-label', 'Más información'); sm.title = 'Más información'; sm.innerHTML = lab ? `${ico('info')}<span>Cómo funciona</span>` : ico('info');
      p.replaceWith(d); d.append(sm, p);
    }
  });
}
document.addEventListener('click', (ev) => {
  const bt = ev.target.closest?.('.tip-btn'); if (!bt) return;
  const body = bt.closest('h1,h2,h3,h4')?.nextElementSibling; if (!body?.classList.contains('tip-body')) return;
  ev.preventDefault(); body.hidden = !body.hidden; bt.setAttribute('aria-expanded', String(!body.hidden)); bt.classList.toggle('on', !body.hidden); (S.open ||= {})[bt.dataset.tip] = !body.hidden;
});
{
  let queued = false;
  const run = () => { queued = false; foldHints(document.getElementById('app')); iconize(document.getElementById('app')); document.querySelectorAll('dialog[open]').forEach((d) => { foldHints(d); iconize(d); }); };
  new MutationObserver(() => { if (!queued) { queued = true; queueMicrotask(run); } }).observe(document.body, { childList: true, subtree: true });
  run();
  window.addEventListener('beforeprint', () => document.querySelectorAll('details.tip, p.tip-body[data-tip-key]').forEach((d) => { if (d.tagName === 'P') { d.dataset.wasHidden = d.hidden ? '1' : ''; d.hidden = false; } else { d.dataset.wasOpen = d.open ? '1' : ''; d.open = true; } }));
  window.addEventListener('afterprint', () => document.querySelectorAll('details.tip, p.tip-body[data-tip-key]').forEach((d) => { if (d.tagName === 'P') d.hidden = d.dataset.wasHidden === '1'; else d.open = d.dataset.wasOpen === '1'; }));
}
document.addEventListener('invalid', (ev) => { const d = ev.target.closest?.('details.fsec-d'); if (d && !d.open) d.open = true; }, true);
// Buscador de carreras del corredor: al activarlo (tocar la lupa o escribir) se esconden el aviso de la próxima carrera del equipo y el pulso del equipo,
// y el buscador sube arriba: así los resultados quedan justo debajo, a la vista, y no tapados por el teclado del móvil.
const searchActive = () => normalize(S.q.runner || '').length >= 2 || document.activeElement?.dataset?.search === 'runner';
const syncSearchMode = () => document.body.classList.toggle('rsearch', searchActive());
document.addEventListener('focusin', (ev) => {
  if (ev.target.dataset?.search !== 'runner') return;
  syncSearchMode();
  const bar = ev.target.closest('.toolbar'); if (bar) setTimeout(() => bar.scrollIntoView({ block: 'start', behavior: 'smooth' }), 120);
});
document.addEventListener('focusout', (ev) => { if (ev.target.dataset?.search === 'runner') setTimeout(syncSearchMode, 150); });
// los botones de año del diálogo «dónde ha participado» (el diálogo está fuera de #app)
document.getElementById('dialog').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-mate-y]'); if (!b) return;
  ev.preventDefault(); openMate(b.dataset.mateId, b.dataset.mateY);
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

// Deslizar hacia abajo para actualizar (en el móvil del corredor, estando arriba del todo)
{
  let y0 = null;
  document.addEventListener('touchstart', (ev) => { y0 = window.scrollY <= 0 && !document.getElementById('dialog')?.open && ev.touches.length === 1 ? ev.touches[0].clientY : null; }, { passive: true });
  document.addEventListener('touchend', (ev) => {
    const y = y0; y0 = null;
    if (y === null || !S.runnerData || S.preview || S.session?.isAdmin || window.scrollY > 0) return;
    if (ev.changedTouches[0].clientY - y > 110) actions['r-refresh']();
  }, { passive: true });
}
