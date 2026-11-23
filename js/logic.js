// Reglas de negocio puras (sin pantalla ni red). Se prueban con `node --test tests/`.
import { distanceKm } from './viajes.js';

export const CATEGORIES = ['Sub-23', 'Élite', 'M30', 'M40', 'M50', 'M60'];
export const MODALITIES = ['Carretera', 'BTT', 'Gravel', 'Ciclocross', 'Pista', 'Otra'];
export const PODIUM_TYPES = [
  { id: 'suelta', label: 'Carrera suelta' },
  { id: 'general', label: 'General de varias pruebas' },
  { id: 'campeonato', label: 'Campeonato' },
];
/** Tipo de carrera. «circuito» = puntuable de una Copa, Open, Critérium… (lleva el nombre del circuito). */
export const RACE_TYPES = [
  { id: 'suelta', label: 'Carrera normal' },
  { id: 'campeonato', label: 'Campeonato' },
  { id: 'circuito', label: 'Puntuable de un circuito (Copa, Open, Critérium…)' },
];
/** Formato de la carrera según la modalidad (el resto de modalidades no lo piden). */
export const SUBTYPES = {
  Carretera: ['Critérium', 'Ciclodeportiva', 'Máster', 'Contrarreloj', 'Ultradistancia', 'Otra'],
  BTT: ['XCO', 'XCM', 'UXCM', 'Rally', 'Descenso', 'Otra'],
};
/** Km de un valor de formulario: número entre 0 y 1000 con un decimal, o null. */
export function parseKm(v) {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n <= 1000 ? Math.round(n * 10) / 10 : null;
}
/** Formato que sugiere el nombre de la carrera («Open XCM Graus» → XCM), o '' si no hay pista. */
export function guessSubtype(name, modality) {
  const n = String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (modality === 'BTT') {
    if (/\buxcm\b|\bultra\b/.test(n)) return 'UXCM';
    if (/\bxcm\b|maraton|marathon|maratona/.test(n)) return 'XCM';
    if (/\bxco\b/.test(n)) return 'XCO';
    if (/\brally\b|\brallye\b/.test(n)) return 'Rally';
    if (/\bdescenso\b|\bdownhill\b|\bdescens\b|\bdhi?\b/.test(n)) return 'Descenso';
  } else if (modality === 'Carretera') {
    if (/criterium/.test(n)) return 'Critérium';
    if (/contrarreloj|contrarellotge|\bcri\b|cronoescalada/.test(n)) return 'Contrarreloj';
    if (/ciclodeportiva|cicloturista|cicloturisme|gran ?fondo|\bmarxa\b/.test(n)) return 'Ciclodeportiva';
    if (/\bmaster\b/.test(n)) return 'Máster';
    if (/ultra ?distancia|ultra ?cycling|\bultra\b/.test(n)) return 'Ultradistancia';
  }
  return '';
}
/** Desnivel positivo (m) de un valor de formulario: entero entre 1 y 10000 («1.250», «1250 m»…), o null. */
export function parseElev(v) {
  const t = String(v ?? '').replace(/[^\d]/g, '');
  if (!t || t.length > 5) return null;
  const n = Number(t);
  return n >= 1 && n <= 10000 ? n : null;
}
/** Precio de la inscripción (€) de un valor de formulario: «27,5», «30 €», «0» (gratis)…; entre 0 y 10000, o null si está vacío o no vale. */
export function parsePrice(v) {
  const t = String(v ?? '').replace(/[€\s]/g, '').replace(',', '.');
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n >= 0 && n <= 10000 ? n : null;
}
export const elevText = (m) => `${Number(m).toLocaleString('de-DE')} m`;
/** Datos que le faltan a una carrera: provincia, km y (si la modalidad lo pide) formato; con `extra`, también desnivel y precio. */
export function missingFields(x, { extra = false } = {}) {
  const out = [];
  if (!String(x?.province ?? '').trim()) out.push('province');
  if (!(Number(x?.km) > 0)) out.push('km');
  if (SUBTYPES[x?.modality] && !String(x?.subtype ?? '').trim()) out.push('subtype');
  if (extra) {
    if (!(Number(x?.elevation) > 0)) out.push('elevation');
    if (x?.price == null || x.price === '') out.push('price');
  }
  return out;
}
/** «2:05:30», «45:10» o «1h 5m» → segundos (entero), o null si no es un tiempo válido (máx. 1.000 h). */
export function parseTime(text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t) return null;
  let sec = null;
  let m = t.match(/^(\d{1,4}):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (m) sec = m[3] === undefined ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  else if ((m = t.match(/^(\d{1,4})\s*h(?:\s*(\d{1,2})\s*(?:m|min)?)?$/))) sec = Number(m[1]) * 3600 + Number(m[2] || 0) * 60;
  return sec >= 1 && sec <= 3600000 ? sec : null;
}
/** Segundos → «2:05:30». Con `short`, un total: «12 h 05 min». */
export function formatTime(sec, short = false) {
  const s = Math.round(Number(sec));
  if (!(s > 0)) return '';
  const h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), se = s % 60;
  if (short) return h ? `${h} h ${String(mi).padStart(2, '0')} min` : `${mi} min`;
  return `${h}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')}`;
}
export const kmText = (km) => `${Number(km).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`;
export const CIRCUIT_SCOPES = [{ id: 'categoria', label: 'De su categoría' }, { id: 'absoluta', label: 'Absoluta (scratch)' }];
export const DEFAULT_COUNTRY = 'España';
export const PROVINCES = [
  'A Coruña', 'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Barcelona',
  'Bizkaia', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ceuta', 'Ciudad Real', 'Córdoba',
  'Cuenca', 'Gipuzkoa', 'Girona', 'Granada', 'Guadalajara', 'Huelva', 'Huesca', 'Illes Balears', 'Jaén',
  'La Rioja', 'Las Palmas', 'León', 'Lleida', 'Lugo', 'Madrid', 'Málaga', 'Melilla', 'Murcia', 'Navarra',
  'Ourense', 'Palencia', 'Pontevedra', 'Salamanca', 'Santa Cruz de Tenerife', 'Segovia', 'Sevilla',
  'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid', 'Zamora', 'Zaragoza',
];

/** Tipo especial para los podios de etapa (no se elige en el desplegable: sale de los puestos por etapa). */
export const STAGE_TYPE = { id: 'etapa', label: 'Etapa' };
export const podiumLabel = (id) => (id === STAGE_TYPE.id ? STAGE_TYPE : PODIUM_TYPES.find((p) => p.id === id) || PODIUM_TYPES[0]).label;
/** Nombre de la etapa i (0 = primera) de una carrera. */
export const stageName = (race, i) => String(race?.stages?.[i] ?? '').trim() || `Etapa ${i + 1}`;

/**
 * Todos los podios de una lista de participaciones: los de la general/carrera (con su tipo)
 * y los de cada etapa (tipo «etapa», con el nombre de la etapa).
 */
export function podiumsOf(parts) {
  const out = [];
  for (const { race, res } of parts) {
    if (isPodium(res.position)) out.push({ race, res, position: res.position, type: res.podium_type || 'suelta', stage: null });
    (res.stage_positions || []).forEach((pos, i) => {
      if (i < (race.stages || []).length && isPodium(pos)) out.push({ race, res, position: pos, type: STAGE_TYPE.id, stage: stageName(race, i) });
    });
  }
  return out;
}

/** Minúsculas, sin tildes y sin espacios sobrantes: para comparar nombres. */
export function normalize(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

const CATEGORY_ALIASES = new Map([
  ...CATEGORIES.map((c) => [normalize(c).replace(/[^a-z0-9]/g, ''), c]),
  ['sub', 'Sub-23'], ['u23', 'Sub-23'], ['elit', 'Élite'], ['master30', 'M30'], ['master40', 'M40'],
  ['master50', 'M50'], ['master60', 'M60'],
]);
/** Devuelve la categoría oficial («m40» → «M40») o null si no se reconoce. */
export function matchCategory(s) {
  const k = normalize(s).replace(/[^a-z0-9]/g, '');
  return k ? CATEGORY_ALIASES.get(k) ?? null : null;
}

/** Nombre con espacios limpios y sin comillas sobrantes. */
export const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Alta masiva: un corredor por línea, «Nombre, categoría» (categoría opcional).
 * Ignora duplicados (con la plantilla y dentro de la propia lista) sin distinguir mayúsculas ni tildes.
 */
export function parseBulkRunners(text, existingNames = []) {
  const seen = new Set(existingNames.map(normalize));
  const toAdd = [], duplicates = [], unknownCategory = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [first, ...rest] = line.split(/[,;\t]/);
    const name = cleanName(first);
    if (!name) continue;
    const key = normalize(name);
    if (seen.has(key)) { duplicates.push(name); continue; }
    seen.add(key);
    // campos opcionales, en cualquier orden: categoría («M40») y tipo de contrato («nuevo», «renovación sin licencia»)
    let category = null, contract = null;
    for (const f of rest.map((x) => x.trim()).filter(Boolean)) {
      const c = matchCategory(f), k = c ? null : matchContract(f);
      if (c) category = c; else if (k) contract = k; else unknownCategory.push({ name, text: f });
    }
    toAdd.push({ name, category, contract });
  }
  return { toAdd, duplicates, unknownCategory };
}

/**
 * Renovación anual de la plantilla: compara la lista nueva con la actual.
 * - keep: siguen (conservan su enlace); `category` cambia solo si la lista trae una.
 * - add: nuevos.
 * - remove: ya no están (se dan de baja; su historial se conserva).
 */
export function planRosterRenewal(text, runners) {
  const { toAdd: list, duplicates, unknownCategory } = parseBulkRunners(text, []);
  const current = new Map(runners.map((r) => [normalize(r.name), r]));
  const keep = [], add = [];
  for (const item of list) {
    const r = current.get(normalize(item.name));
    if (r) {
      // Al empezar temporada, quien era «nuevo» pasa a «renovación» salvo que la lista diga otra cosa.
      const contract = item.contract || (r.contract === 'nuevo' ? 'renovacion' : null);
      keep.push({ runner: r, category: item.category && item.category !== r.category ? item.category : null,
        contract: contract && contract !== r.contract ? contract : null });
      current.delete(normalize(item.name));
    } else add.push({ ...item, contract: item.contract || 'nuevo' });
  }
  return { keep, add, remove: [...current.values()], duplicates, unknownCategory };
}

/** Clave de una disciplina: modalidad + formato («BTT|XCO»; sin formato, «BTT|»). */
export const disciplineKey = (modality, subtype) => `${modality || ''}|${subtype || ''}`;
export const isPodium = (position) => Number.isInteger(position) && position >= 1 && position <= 3;
export const yearOf = (date) => Number(String(date).slice(0, 4));

/** Años con carreras, más el actual, de más reciente a más antiguo. */
export function availableYears(races, today = new Date()) {
  const ys = new Set(races.map((r) => yearOf(r.date)));
  ys.add(today.getFullYear());
  return [...ys].filter(Boolean).sort((a, b) => b - a);
}

const byText = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' });

/**
 * Resumen anual. `races` lleva `results` dentro; `runners` es la plantilla actual.
 */
const elevOf = (r) => (Number(r?.elevation) > 0 ? Number(r.elevation) : 0);
const priceOf = (r) => (r?.price != null && r.price !== '' && Number(r.price) >= 0 ? Number(r.price) : null);
const distOf = (r) => distanceKm(r);   // km por carretera (solo ida) desde el punto de salida común, o null
export function yearSummary(year, races, runners) {
  const yr = races.filter((r) => yearOf(r.date) === year)
    .sort((a, b) => a.date.localeCompare(b.date) || byText(a.name, b.name));
  const parts = yr.flatMap((race) => (race.results || []).map((res) => ({ race, res })));
  const podiums = podiumsOf(parts);
  const personKey = (res) => res.runner_id || 'n:' + normalize(res.runner_name);

  const totals = {
    races: yr.length,
    runners: new Set(parts.map((p) => personKey(p.res))).size,
    participations: parts.length,
    podiums: podiums.length,
    wins: podiums.filter((p) => p.position === 1).length,
    km: Math.round(parts.reduce((n, p) => n + (Number(p.race.km) || 0), 0) * 10) / 10, // km recorridos entre todos
    // ratios (solo con las carreras que tienen los datos necesarios): días de competición con km, km con tiempo, carreras con km, km con ubicación frente al viaje
    kmDays: parts.reduce((n, p) => n + (Number(p.race.km) > 0 ? numDays(p.race.date, p.race.end_date) : 0), 0),
    kmTimed: Math.round(parts.reduce((n, p) => n + (Number(p.race.km) > 0 && Number(p.res.time_seconds) > 0 ? Number(p.race.km) : 0), 0) * 10) / 10,
    secTimed: parts.reduce((n, p) => n + (Number(p.race.km) > 0 && Number(p.res.time_seconds) > 0 ? Number(p.res.time_seconds) : 0), 0),
    kmRaces: parts.filter((p) => Number(p.race.km) > 0).length,
    kmBoth: Math.round(parts.reduce((n, p) => n + (Number(p.race.km) > 0 && distOf(p.race) ? Number(p.race.km) : 0), 0) * 10) / 10,
    tripBoth: Math.round(parts.reduce((n, p) => n + (Number(p.race.km) > 0 ? 2 * (distOf(p.race)?.km ?? 0) : 0), 0)),
    time: parts.reduce((n, p) => n + (Number(p.res.time_seconds) || 0), 0), // segundos de los que tienen tiempo
    timed: parts.filter((p) => Number(p.res.time_seconds) > 0).length,
    // desnivel positivo (m) que han subido entre todos (cada participación suma el de su carrera) y lo que cuestan las inscripciones (€)
    elevation: parts.reduce((n, p) => n + elevOf(p.race), 0),
    cost: Math.round(parts.reduce((n, p) => n + (priceOf(p.race) ?? 0), 0) * 100) / 100,
    elevRaces: yr.filter((r) => elevOf(r) > 0).length,       // carreras con desnivel indicado
    pricedRaces: yr.filter((r) => priceOf(r) != null).length, // carreras con precio indicado
    avgPrice: (() => { const l = yr.map(priceOf).filter((x) => x != null); return l.length ? Math.round((l.reduce((a, b) => a + b, 0) / l.length) * 100) / 100 : 0; })(),
    // desplazamientos (orientativos): ida y vuelta de cada participación desde el punto de salida común
    travelKm: parts.reduce((n, p) => n + 2 * (distOf(p.race)?.km ?? 0), 0),
    travelRaces: yr.filter((r) => distOf(r)).length,                      // carreras de las que se sabe dónde son
    travelApprox: yr.filter((r) => distOf(r)?.src === 'province').length,  // de ellas, solo por su provincia
    avgDist: (() => { const l = yr.map((r) => distOf(r)?.km).filter((x) => x != null); return l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : 0; })(),
  };
  // Carreras por formato (Critérium, XCM…), para el resumen.
  const bySubtype = [];
  for (const r of yr) if (r.subtype) {
    const e = bySubtype.find((x) => x.modality === r.modality && x.subtype === r.subtype);
    if (e) e.races++; else bySubtype.push({ modality: r.modality, subtype: r.subtype, races: 1 });
  }
  bySubtype.sort((a, b) => b.races - a.races || byText(a.subtype, b.subtype));

  const byModality = MODALITIES.map((m) => ({
    modality: m,
    races: yr.filter((r) => r.modality === m).length,
    participations: parts.filter((p) => p.race.modality === m).length,
    podiums: podiums.filter((p) => p.race.modality === m).length,
    wins: podiums.filter((p) => p.race.modality === m && p.position === 1).length,
    runners: new Set(parts.filter((p) => p.race.modality === m).map((p) => personKey(p.res))).size,
    elevation: parts.filter((p) => p.race.modality === m).reduce((n, p) => n + elevOf(p.race), 0),
    trip: parts.filter((p) => p.race.modality === m).reduce((n, p) => n + 2 * (distOf(p.race)?.km ?? 0), 0),
    cost: Math.round(parts.filter((p) => p.race.modality === m).reduce((n, p) => n + (priceOf(p.race) ?? 0), 0) * 100) / 100,
    km: Math.round(parts.filter((p) => p.race.modality === m).reduce((n, p) => n + (Number(p.race.km) || 0), 0) * 10) / 10,
  })).filter((x) => x.modality === 'Carretera' || x.modality === 'BTT' || x.races > 0);

  // Carreras de cada mes, repartidas por modalidad (para el gráfico de barras del resumen).
  // `discs`: lo mismo por disciplina (modalidad + formato: «BTT|XCO»), para colorear las barras por formato.
  const byMonth = Array.from({ length: 12 }, (_, month) => ({ month, total: 0, mods: {}, discs: {}, elev: 0, cost: 0, trip: 0, parts: 0, km: 0, time: 0, pod: 0, wins: 0 }));
  const byDiscipline = new Map();
  for (const r of yr) {
    const mo = byMonth[Number(String(r.date).slice(5, 7)) - 1];
    const dk = disciplineKey(r.modality, r.subtype);
    const nRes = (r.results || []).length;
    if (mo) { mo.total++; mo.mods[r.modality] = (mo.mods[r.modality] || 0) + 1; mo.discs[dk] = (mo.discs[dk] || 0) + 1; mo.elev += elevOf(r) * nRes; mo.cost += (priceOf(r) ?? 0) * nRes; mo.trip += 2 * (distOf(r)?.km ?? 0) * nRes; }
    if (mo) { mo.parts += nRes; mo.km += (Number(r.km) || 0) * nRes; mo.time += (r.results || []).reduce((n, x) => n + (Number(x.time_seconds) || 0), 0); }
    const e = byDiscipline.get(dk) || { key: dk, modality: r.modality, subtype: r.subtype || '', races: 0, elevRaces: 0, elevSum: 0, priceRaces: 0, priceSum: 0 };
    e.races++; if (elevOf(r) > 0) { e.elevRaces++; e.elevSum += elevOf(r); } if (priceOf(r) != null) { e.priceRaces++; e.priceSum += priceOf(r); }
    byDiscipline.set(dk, e);
  }
  for (const pd of podiums) { const mo = byMonth[Number(String(pd.race.date).slice(5, 7)) - 1]; if (mo) { mo.pod++; if (pd.position === 1) mo.wins++; } }
  const disciplines = [...byDiscipline.values()].map((d) => {
    const mine = (x) => disciplineKey(x.race.modality, x.race.subtype) === d.key;
    const { elevSum, priceSum, ...base } = d;
    return { ...base, participations: parts.filter(mine).length, podiums: podiums.filter(mine).length, wins: podiums.filter((p) => mine(p) && p.position === 1).length,
      runners: new Set(parts.filter(mine).map((p) => personKey(p.res))).size,
      trip: parts.filter(mine).reduce((n, p) => n + 2 * (distOf(p.race)?.km ?? 0), 0), elevation: parts.filter(mine).reduce((n, p) => n + elevOf(p.race), 0), cost: Math.round(parts.filter(mine).reduce((n, p) => n + (priceOf(p.race) ?? 0), 0) * 100) / 100,
      avgElev: d.elevRaces ? Math.round(elevSum / d.elevRaces) : 0, avgPrice: d.priceRaces ? Math.round((priceSum / d.priceRaces) * 100) / 100 : 0 };
  }).sort((a, b) => b.races - a.races || byText(a.key, b.key));

  const countBy = (keyFn) => {
    const m = new Map();
    for (const r of yr) { const k = keyFn(r); if (k) m.set(k, (m.get(k) || 0) + 1); }
    return [...m].map(([name, races]) => ({ name, races })).sort((a, b) => b.races - a.races || byText(a.name, b.name));
  };
  const countries = countBy((r) => cleanName(r.country));
  const provinces = countBy((r) => cleanName(r.province));
  const missingPlace = yr.filter((r) => !cleanName(r.province) || !cleanName(r.country))
    .map((r) => ({ id: r.id, name: r.name, date: r.date, missing: [!cleanName(r.province) && 'provincia', !cleanName(r.country) && 'país'].filter(Boolean) }));

  // Participaciones por corredor: toda la plantilla (también con 0) y quien ya no está pero corrió ese año.
  const rows = new Map();
  for (const rn of runners) rows.set(rn.id, { key: rn.id, name: rn.name, current: true, races: 0, road: 0, btt: 0, p1: 0, p2: 0, p3: 0, mods: {}, discs: {}, months: new Set(), km: 0, elev: 0, cost: 0, trip: 0, tripN: 0, tripMax: 0, tripRace: '', kmDays: 0, kmTimed: 0, secTimed: 0, kmRaces: 0, kmBoth: 0, tripBoth: 0, time: 0, timed: 0 });
  for (const { race, res } of parts) {
    const k = personKey(res);
    if (!rows.has(k)) rows.set(k, { key: k, name: res.runner_name, current: false, races: 0, road: 0, btt: 0, p1: 0, p2: 0, p3: 0, mods: {}, discs: {}, months: new Set(), km: 0, elev: 0, cost: 0, trip: 0, tripN: 0, tripMax: 0, tripRace: '', kmDays: 0, kmTimed: 0, secTimed: 0, kmRaces: 0, kmBoth: 0, tripBoth: 0, time: 0, timed: 0 });
    const row = rows.get(k);
    row.races++;
    row.km = Math.round((row.km + (Number(race.km) || 0)) * 10) / 10;
    if (Number(race.km) > 0) {
      row.kmDays += numDays(race.date, race.end_date); row.kmRaces++;
      if (Number(res.time_seconds) > 0) { row.kmTimed = Math.round((row.kmTimed + Number(race.km)) * 10) / 10; row.secTimed += Number(res.time_seconds); }
      const dd = distOf(race); if (dd) { row.kmBoth = Math.round((row.kmBoth + Number(race.km)) * 10) / 10; row.tripBoth += 2 * dd.km; }
    }
    row.elev += elevOf(race); row.cost = Math.round((row.cost + (priceOf(race) ?? 0)) * 100) / 100;
    { const dd = distOf(race); if (dd) { row.trip += 2 * dd.km; row.tripN++; if (dd.km > row.tripMax) { row.tripMax = dd.km; row.tripRace = race.name; } } }
    if (Number(res.time_seconds) > 0) { row.time += Number(res.time_seconds); row.timed++; }
    row.mods[race.modality] = (row.mods[race.modality] || 0) + 1;
    { const dk = disciplineKey(race.modality, race.subtype); row.discs[dk] = (row.discs[dk] || 0) + 1; }
    row.months.add(String(race.date).slice(0, 7));
    if (race.modality === 'Carretera') row.road++;
    if (race.modality === 'BTT') row.btt++;
  }
  for (const p of podiums) {
    const row = rows.get(personKey(p.res));
    row['p' + p.position]++;
  }
  const perRunner = [...rows.values()].sort((a, b) => b.races - a.races || b.p1 - a.p1 || byText(a.name, b.name));

  // Estadística por categoría: corredores distintos, participaciones, podios y km (los resultados sin categoría, al final).
  const catMap = new Map();
  for (const { race, res } of parts) {
    const c = cleanName(res.category) || '';
    const e = catMap.get(c) || { category: c, runners: new Set(), participations: 0, p1: 0, p2: 0, p3: 0, km: 0, elev: 0 };
    e.runners.add(personKey(res)); e.participations++; e.km += Number(race.km) || 0; e.elev += elevOf(race);
    catMap.set(c, e);
  }
  for (const pd of podiums) { const e = catMap.get(cleanName(pd.res.category) || ''); e['p' + pd.position]++; }
  const rankCat = (c) => { const i = CATEGORIES.indexOf(c); return c === '' ? 999 : i === -1 ? 500 : i; };
  const byCategory = [...catMap.values()].map((e) => ({ ...e, runners: e.runners.size, podiums: e.p1 + e.p2 + e.p3, km: Math.round(e.km * 10) / 10 }))
    .sort((a, b) => rankCat(a.category) - rankCat(b.category) || byText(a.category, b.category));

  const byPodiumType = [...PODIUM_TYPES, STAGE_TYPE].map((t) => ({
    type: t.id, label: t.label,
    podiums: podiums.filter((p) => p.type === t.id).length,
    wins: podiums.filter((p) => p.type === t.id && p.position === 1).length,
  }));

  const podiumList = podiums.map(({ race, res, position, type, stage }) => ({
    date: race.date, race: race.name, raceId: race.id, modality: race.modality, subtype: race.subtype || null, km: race.km ?? null, runner: res.runner_name, category: res.category || '',
    type, stage, position,
  }));

  // Carrera más larga (km) y quién la corrió
  let longest = null;
  for (const { race } of parts) { const km = Number(race.km) || 0; if (km > 0 && (!longest || km > longest.km)) longest = { km, race: race.name, raceId: race.id, runners: [] }; }
  if (longest) longest.runners = parts.filter((x) => x.race.id === longest.raceId).map((x) => x.res.runner_name).sort(byText);
  // la carrera que más horas costó: el mayor tiempo de un corredor en una carrera (el MTB suma menos km pero muchas más horas)
  let longestTime = null;
  for (const { race, res } of parts) { const t = Number(res.time_seconds) || 0; if (t > 0 && (!longestTime || t > longestTime.seconds)) longestTime = { seconds: t, race: race.name, raceId: race.id, runner: res.runner_name, km: Number(race.km) || null, modality: race.modality }; }
  // la carrera más dura (más desnivel), la más empinada (metros por km) y la más cara
  const pick = (score) => { let best = null; for (const { race } of parts) { const v = score(race); if (v > 0 && (!best || v > best.value)) best = { value: v, race: race.name, raceId: race.id, km: Number(race.km) || null, elevation: elevOf(race) || null, price: priceOf(race), place: race.place || '' }; }
    if (best) best.runners = parts.filter((x) => x.race.id === best.raceId).map((x) => x.res.runner_name).sort(byText); return best; };
  const farthest = pick((r) => distOf(r)?.km ?? 0), hardest = pick(elevOf), steepest = pick((r) => (Number(r.km) > 0 && elevOf(r) > 0 ? elevOf(r) / Number(r.km) : 0)), priciest = pick((r) => priceOf(r) ?? 0);
  return { year, totals, longest, longestTime, hardest, steepest, priciest, farthest, byModality, byMonth, bySubtype, disciplines, byCategory, countries, provinces, missingPlace, perRunner, byPodiumType, podiumList };
}

// ---------- CSV ----------

export const CSV_COLUMNS = ['Fecha', 'Fecha fin', 'Carrera', 'Lugar', 'Provincia', 'País', 'Modalidad', 'Corredor',
  'Categoría', 'Puesto', 'Podio', 'Tipo de podio', 'Disciplina', 'Km', 'Desnivel (m)', 'Precio inscripción (€)'];

/** Filas de exportación (una por participación). */
export function csvRows(races) {
  const sorted = [...races].sort((a, b) => a.date.localeCompare(b.date) || byText(a.name, b.name));
  const out = [];
  for (const r of sorted) {
    for (const res of [...(r.results || [])].sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999) || byText(a.runner_name, b.runner_name))) {
      const pod = isPodium(res.position);
      out.push([r.date, r.end_date || '', r.name, r.place || '', r.province || '', r.country || '', r.modality, res.runner_name,
        res.category || '', res.position ?? '', pod ? 'Sí' : 'No', pod ? podiumLabel(res.podium_type) : '', r.subtype || '', r.km ?? '', r.elevation ?? '', r.price ?? '']);
      (res.stage_positions || []).forEach((pos, i) => {
        if (i < (r.stages || []).length && isPodium(pos)) {
          out.push([r.date, r.end_date || '', r.name, r.place || '', r.province || '', r.country || '', r.modality, res.runner_name,
            res.category || '', pos, 'Sí', `${STAGE_TYPE.label}: ${stageName(r, i)}`, r.subtype || '', r.km ?? '', r.elevation ?? '', r.price ?? '']);
        }
      });
    }
  }
  return out;
}

/** Días que faltan para una fecha (ISO) desde hoy: 0 = hoy, 1 = mañana… (negativo si ya pasó). */
export function daysTo(iso, today = new Date()) {
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - t) / 86400000);
}
/** «hoy», «mañana», «en 6 días»… */
/** La próxima carrera del equipo: la primera (o la que está en curso) no suspendida con algún inscrito, aunque quien mira no participe. */
export function nextTeamRace(registrations, today) {
  const last = (g) => g.end_date || g.date;
  return (registrations || []).filter((g) => !g.suspended && (g.entries || []).length && last(g) >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (b.entries.length - a.entries.length) || String(a.name).localeCompare(String(b.name), 'es'))[0] || null;
}
export const daysToText = (n) => (n === 0 ? 'hoy' : n === 1 ? 'mañana' : n > 1 ? `en ${n} días` : '');

/** Archivo de calendario (.ics) con una carrera como evento de día completo (o de varios días). */
export function icsEvent(g, now = new Date()) {
  const esc = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const ymd = (iso) => String(iso).slice(0, 10).replace(/-/g, '');
  const last = new Date(String(g.end_date || g.date).slice(0, 10) + 'T12:00:00Z'); last.setUTCDate(last.getUTCDate() + 1);
  const where = [g.place, g.province].filter(Boolean).join(', ');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CC Monzon//Carreras//ES', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${g.id || ymd(g.date) + '-' + esc(g.name).slice(0, 20)}@ccmonzon`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(g.date)}`, `DTEND;VALUE=DATE:${last.toISOString().slice(0, 10).replace(/-/g, '')}`,
    `SUMMARY:${esc('🚴 ' + g.name)}`, ...(where ? [`LOCATION:${esc(where)}`] : []),
    `DESCRIPTION:${esc([g.modality, g.km ? `${g.km} km` : '', 'Carrera del CC Monzón'].filter(Boolean).join(' · '))}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

// ---------- Publicaciones en redes (control de la dirección) ----------

/** Clave del aviso previo de una carrera y de la publicación de sus resultados (no cambian al pasar a resultados). */
export const postKeyOf = (g) => `${g.date}|${normalize(g.name)}`;
export const resKeyOf = (g) => 'res|' + postKeyOf(g);
/** Día en que se publica la historia previa (automática): dos días antes de la carrera. */
export const storyDateOf = (g) => { const d = new Date(String(g.date).slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 2); return d.toISOString().slice(0, 10); };
/** Interpreta el registro de historias publicadas (lo escribe la tarea automática): { desde, byKey: Map(clave → {n, publicada, ids}) }. */
export function parseStoryLog(json) {
  const byKey = new Map();
  for (const h of Array.isArray(json?.historias) ? json.historias : []) {
    if (!h?.carrera || !h?.fecha) continue;
    const k = postKeyOf({ date: String(h.fecha).slice(0, 10), name: h.carrera });
    const e = byKey.get(k) || { n: 0, publicada: null, ids: [] };
    e.n++; if (h.publicada && (!e.publicada || h.publicada < e.publicada)) e.publicada = String(h.publicada).slice(0, 10); if (h.media_id) e.ids.push(String(h.media_id));
    byKey.set(k, e);
  }
  return { desde: /^\d{4}-\d{2}-\d{2}$/.test(json?.desde || '') ? json.desde : null, byKey };
}
/**
 * Estado de la historia previa de una carrera: { state: 'ok'|'manual'|'hoy'|'programada'|'falta', text, date, n } o null si no toca.
 * `log`: resultado de parseStoryLog (o null si aún no hay registro); `marked`: la dirección la marcó a mano.
 */
export function storyState(g, log, marked, today) {
  const hit = log?.byKey.get(postKeyOf(g));
  if (hit) return { state: 'ok', date: hit.publicada, n: hit.n };
  if (marked) return { state: 'manual' };
  if (g.suspended) return null;
  const sd = storyDateOf(g);
  const made = String(g.created_at || '').slice(0, 10);
  if (made && made > sd) return null;           // se creó después del día de la historia: no pudo haberla
  if (sd > today) return { state: 'programada', date: sd };
  if (sd === today) return { state: 'hoy', date: sd };
  if (log?.desde && sd >= log.desde) return { state: 'falta', date: sd };  // debía publicarse y no consta
  return null;                                   // de antes de que existiera el registro: no se sabe
}

/**
 * Qué publicaciones hay hechas, pendientes y con anomalía. Cada carrera tiene dos: el aviso (antes) y los resultados (unos días después).
 * `posts`: filas {key, posted_at?} marcadas. `today`: 'AAAA-MM-DD'.
 */
export function socialAudit(year, races, registrations, posts, today, log = null) {
  const dayDiff = (a, b) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000);
  const posted = new Set(posts.map((x) => x.key));
  const last = (g) => g.end_date || g.date;
  const inYear = (g) => yearOf(g.date) === year;
  const people = (g) => (g.entries || []).length;

  // resultados: carreras ya en resultados con corredores del club
  const finished = races.filter((r) => inYear(r) && (r.results || []).length && last(r) <= today)
    .map((r) => ({ race: r, key: resKeyOf(r), days: dayDiff(today, last(r)) })).sort((a, b) => b.days - a.days);
  const resDone = finished.filter((x) => posted.has(x.key));
  const resTodo = finished.filter((x) => !posted.has(x.key));
  const HORIZON = 45; // lo más antiguo no se vigila: quedó de antes de existir este control
  const resPending = resTodo.filter((x) => x.days <= 7), resLate = resTodo.filter((x) => x.days > 7 && x.days <= HORIZON), resOld = resTodo.filter((x) => x.days > HORIZON);

  // inscripciones ya disputadas que aún no han pasado a resultados
  const past = registrations.filter((g) => inYear(g) && !g.suspended && people(g) && last(g) < today).map((g) => ({ reg: g, days: dayDiff(today, last(g)), people: people(g) }));
  const waiting = past.filter((x) => x.days < 3);
  const noResults = past.filter((x) => x.days >= 3 && x.days <= HORIZON && !(x.reg.entries || []).some((e) => e.self_position));

  // avisos previos
  const avisoPending = registrations.filter((g) => !g.suspended && people(g) && g.date >= today && dayDiff(g.date, today) <= 14 && !posted.has(postKeyOf(g)) && !log?.byKey.has(postKeyOf(g)))
    .map((g) => ({ reg: g, inDays: dayDiff(g.date, today) })).sort((a, b) => a.inDays - b.inDays);
  const suspendedPosted = registrations.filter((g) => g.suspended && people(g) && posted.has(postKeyOf(g)));

  // historias previas que debían salir y no constan (solo carreras con inscritos o con resultados, de los últimos 45 días)
  const storyMissing = [...registrations.filter((g) => people(g)), ...races.filter((r) => (r.results || []).length)]
    .filter((g) => dayDiff(today, g.date) <= HORIZON && storyState(g, log, posted.has(postKeyOf(g)), today)?.state === 'falta');

  // marcas que ya no corresponden a ninguna carrera (se cambió el nombre o la fecha, o se borró)
  const valid = new Set([...races.flatMap((r) => [postKeyOf(r), resKeyOf(r)]), ...registrations.map(postKeyOf)]);
  const cutoff = Date.parse(today + 'T12:00:00Z') - 120 * 86400000;
  const orphans = posts.filter((x) => !valid.has(x.key) && (!x.posted_at || Date.parse(x.posted_at) >= cutoff));

  // publicadas en esta temporada
  const marks = new Set();
  for (const g of [...races, ...registrations]) if (inYear(g) && (posted.has(postKeyOf(g)) || log?.byKey.has(postKeyOf(g)))) marks.add(postKeyOf(g));
  for (const r of races) if (inYear(r) && posted.has(resKeyOf(r))) marks.add(resKeyOf(r));

  const pending = resPending.length + waiting.length + avisoPending.length;
  const anomalies = resLate.length + noResults.length + suspendedPosted.length + orphans.length + storyMissing.length;
  return { done: marks.size, pending, anomalies, resDone, resPending, resLate, resOld, storyMissing, waiting, noResults, avisoPending, suspendedPosted, orphans };
}

// ---------- Cómputo de temporada (dirección) ----------

export const SEASON_COLUMNS = ['Corredor', 'Categoría', 'Contrato', 'Carreras', 'Días de carrera', ...MODALITIES, 'Oros', 'Platas', 'Bronces', 'Podios',
  'Km', 'Desnivel (m)', 'Desplazamiento (km, ida y vuelta)', 'Tiempo total (h:mm:ss)', 'Carreras con tiempo', 'Provincias', 'Países'];
export const SEASON_BONUS_COLUMNS = ['Carreras para el bono', 'Llega al mínimo', 'Tramo alcanzado (carreras)', 'Bono (€)', 'Penalización (€)', 'Saldo (€, + el club debe)', 'Inscritas pendientes'];
export const SEASON_DETAIL_COLUMNS = ['Corredor', 'Fecha', 'Fecha fin', 'Carrera', 'Lugar', 'Provincia', 'País', 'Modalidad', 'Formato', 'Km', 'Desnivel (m)', 'Precio inscripción (€)', 'Distancia desde la salida (km, ida)', 'Circuito',
  'Categoría', 'Puesto', 'Podio', 'Tipo de podio', 'Tiempo', 'Días', 'Etapas en podio'];

/** Una fila por corredor con lo que ha hecho en la temporada (también quien no ha corrido, con ceros). */
export function seasonStats(year, races, runners, contractName = (c) => c || '') {
  const yr = races.filter((r) => yearOf(r.date) === year);
  const parts = yr.flatMap((race) => (race.results || []).map((res) => ({ race, res })));
  const key = (res) => res.runner_id || 'n:' + normalize(res.runner_name);
  const mk = (name, cat, contract, id = null) => ({ id, name, cat, contract, races: 0, days: 0, mods: {}, p: [0, 0, 0], km: 0, elev: 0, trip: 0, time: 0, timed: 0, prov: new Set(), ctry: new Set() });
  const rows = new Map(runners.map((r) => [r.id, mk(r.name, r.category || '', contractName(r.contract), r.id)]));
  for (const { race, res } of parts) {
    const k = key(res);
    if (!rows.has(k)) rows.set(k, mk(res.runner_name + ' (baja)', res.category || '', ''));
    const row = rows.get(k);
    row.races++; row.days += numDays(race.date, race.end_date);
    row.mods[race.modality] = (row.mods[race.modality] || 0) + 1;
    row.km += Number(race.km) || 0; row.elev += elevOf(race); row.trip += 2 * (distOf(race)?.km ?? 0);
    if (Number(res.time_seconds) > 0) { row.time += Number(res.time_seconds); row.timed++; }
    if (cleanName(race.province)) row.prov.add(cleanName(race.province));
    if (cleanName(race.country)) row.ctry.add(cleanName(race.country));
  }
  for (const pd of podiumsOf(parts)) rows.get(key(pd.res)).p[pd.position - 1]++;
  return [...rows.values()].sort((a, b) => b.races - a.races || byText(a.name, b.name)).map((r) => ({
    ...r, km: Math.round(r.km * 10) / 10, provinces: [...r.prov].sort(byText), countries: [...r.ctry].sort(byText), podiums: r.p[0] + r.p[1] + r.p[2] }));
}

/** Filas del CSV de resumen (con el bono si se pasan los datos de `yearBonuses`). */
export function seasonByRunner(year, races, runners, contractName = (c) => c || '', bonuses = null) {
  const bonusOf = new Map((bonuses || []).map((b) => [b.runner.id, b]));
  return seasonStats(year, races, runners, contractName).map((r) => {
    const b = bonusOf.get(r.id);
    return [r.name, r.cat, r.contract, r.races, r.days, ...MODALITIES.map((m) => r.mods[m] || 0), r.p[0], r.p[1], r.p[2], r.podiums,
      r.km, r.elev || '', r.trip || '', r.timed ? formatTime(r.time) : '', r.timed, r.provinces.join(', '), r.countries.join(', '),
      ...(bonuses ? (b ? [b.bonusCount, b.reachesMinimum ? 'Sí' : 'No', b.tier ? b.tier.races : '', b.amount, b.penalty, b.amount - b.penalty, b.planned] : ['', '', '', '', '', '', '']) : [])];
  });
}

/** Una fila por participación (corredor + carrera) de la temporada: dónde ha ido cada uno. */
export function seasonDetail(year, races) {
  const out = [];
  for (const r of races.filter((x) => yearOf(x.date) === year)) {
    for (const res of r.results || []) {
      const pod = isPodium(res.position);
      const stagePods = (res.stage_positions || []).filter((pos, i) => i < (r.stages || []).length && isPodium(pos)).length;
      out.push([res.runner_name, r.date, r.end_date || '', r.name, r.place || '', r.province || '', r.country || '', r.modality, r.subtype || '', r.km ?? '', r.elevation ?? '', r.price ?? '', distOf(r)?.km ?? '',
        r.race_type === 'circuito' ? (r.circuit || 'Circuito') : r.race_type === 'campeonato' ? 'Campeonato' : '', res.category || '', res.position ?? '',
        pod ? 'Sí' : 'No', pod ? podiumLabel(res.podium_type) : '', res.time_seconds ? formatTime(res.time_seconds) : '', numDays(r.date, r.end_date), stagePods || '']);
    }
  }
  return out.sort((a, b) => byText(a[0], b[0]) || a[1].localeCompare(b[1]));
}

/** CSV con «;» (lo que espera Excel en español) y BOM para que respete tildes. */
export function toCsv(rows, header = CSV_COLUMNS) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[;"\r\n,]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

/** Lee CSV separado por «;» o «,» (lo detecta), con comillas. */
export function parseCsv(text) {
  const s = String(text ?? '').replace(/^﻿/, '');
  const first = s.split(/\r?\n/, 1)[0] || '';
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

/** «14/06/2027», «14-6-2027» o «2027-06-14» → «2027-06-14». */
export function parseDate(s) {
  const t = String(s ?? '').trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function matchPodiumType(s) {
  const n = normalize(s);
  if (!n) return 'suelta';
  if (n.startsWith('gen')) return 'general';
  if (n.startsWith('camp')) return 'campeonato';
  return 'suelta';
}

function matchModality(s) {
  const n = normalize(s).replace(/[^a-z]/g, '');
  return MODALITIES.find((m) => normalize(m).replace(/[^a-z]/g, '') === n) || (n ? 'Otra' : 'Carretera');
}

/**
 * Importa el CSV de resultados (mismas columnas que la exportación) para migrar datos.
 * Agrupa filas en carreras por fecha+nombre+lugar+modalidad.
 * Devuelve { races: [{...race, results:[{runner_name, category, position, podium_type}]}], errors: [] }.
 */
export function importResultsCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { races: [], errors: ['El archivo está vacío.'] };
  const head = rows[0].map(normalize);
  const col = (...names) => head.findIndex((h) => names.some((n) => h === normalize(n)));
  const ix = {
    date: col('Fecha'), end: col('Fecha fin'), race: col('Carrera'), place: col('Lugar'), province: col('Provincia'),
    country: col('País', 'Pais'), modality: col('Modalidad'), runner: col('Corredor'),
    category: col('Categoría', 'Categoria'), position: col('Puesto'), type: col('Tipo de podio', 'Tipo'),
    subtype: col('Disciplina', 'Formato'), km: col('Km'), elevation: col('Desnivel (m)', 'Desnivel'), price: col('Precio inscripción (€)', 'Precio inscripcion', 'Precio'),
  };
  const errors = [];
  if (ix.date < 0 || ix.race < 0 || ix.runner < 0) {
    return { races: [], errors: ['Faltan columnas obligatorias: Fecha, Carrera y Corredor.'] };
  }
  const races = new Map();
  rows.slice(1).forEach((r, n) => {
    const get = (i) => (i >= 0 ? cleanName(r[i]) : '');
    const line = n + 2;
    const date = parseDate(get(ix.date));
    if (!date) { errors.push(`Línea ${line}: fecha no válida («${get(ix.date)}»).`); return; }
    const name = get(ix.race);
    if (!name) { errors.push(`Línea ${line}: falta el nombre de la carrera.`); return; }
    const modality = matchModality(get(ix.modality));
    const key = [date, normalize(name), normalize(get(ix.place)), modality].join('|');
    if (!races.has(key)) {
      const end = parseDate(get(ix.end));
      const sub = get(ix.subtype), km = parseKm(get(ix.km)), elev = parseElev(get(ix.elevation)), price = get(ix.price) === '' ? null : parsePrice(get(ix.price));
      races.set(key, { name, date, end_date: end && end > date ? end : null, place: get(ix.place), province: get(ix.province),
        country: ix.country >= 0 ? get(ix.country) : DEFAULT_COUNTRY, modality, notes: '', results: [],
        ...(SUBTYPES[modality]?.includes(sub) ? { subtype: sub } : {}), ...(km ? { km } : {}), ...(elev ? { elevation: elev } : {}), ...(price != null ? { price } : {}) });
    }
    const runner = get(ix.runner);
    if (!runner) return; // carrera sin participantes
    const race = races.get(key);
    const typeText = get(ix.type);
    const stageMatch = typeText.match(/^etapa\s*:?\s*(.*)$/i);
    if (stageMatch) {
      const pos = Number(get(ix.position));
      if (!Number.isInteger(pos) || pos < 1) { errors.push(`Línea ${line}: puesto de etapa no válido; se ignora.`); return; }
      race.stages = race.stages || [];
      const sName = stageMatch[1].trim() || `Etapa ${race.stages.length + 1}`;
      let i = race.stages.findIndex((x) => normalize(x) === normalize(sName));
      if (i < 0) i = race.stages.push(sName) - 1;
      let res = race.results.find((x) => normalize(x.runner_name) === normalize(runner));
      if (!res) { res = { runner_name: runner, category: matchCategory(get(ix.category)), position: null, podium_type: 'general', _stageOnly: true }; race.results.push(res); }
      res.stage_positions = res.stage_positions || [];
      res.stage_positions[i] = pos;
      return;
    }
    const prev = race.results.find((x) => normalize(x.runner_name) === normalize(runner) && x._stageOnly);
    if (prev) { // ya había llegado una fila de etapa de este corredor: completar la general
      const posText = get(ix.position);
      prev.position = /^\d+$/.test(posText) && Number(posText) > 0 ? Number(posText) : null;
      prev.podium_type = matchPodiumType(typeText);
      delete prev._stageOnly;
      return;
    }
    if (race.results.some((x) => normalize(x.runner_name) === normalize(runner))) {
      errors.push(`Línea ${line}: ${runner} aparece dos veces en «${name}»; se ignora la repetición.`);
      return;
    }
    const posText = get(ix.position);
    const position = /^\d+$/.test(posText) && Number(posText) > 0 ? Number(posText) : null;
    if (posText && position === null) errors.push(`Línea ${line}: puesto «${posText}» no es un número; se deja vacío.`);
    race.results.push({ runner_name: runner, category: matchCategory(get(ix.category)),
      position, podium_type: matchPodiumType(get(ix.type)) });
  });
  for (const race of races.values()) {
    for (const res of race.results) {
      delete res._stageOnly;
      if (res.stage_positions) res.stage_positions = Array.from({ length: race.stages.length }, (_, i) => res.stage_positions[i] ?? null);
    }
  }
  return { races: [...races.values()], errors };
}

// ---------- Enlaces personales ----------

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin letras/números que se confunden
/** Código aleatorio de 12 caracteres (~59 bits): imposible de adivinar probando. */
export function newCode(len = 12) {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
/** Saca el código de un enlace pegado («…#/c/ABCD…») o del código suelto. */
export function extractCode(s) {
  const t = String(s ?? '').trim();
  const m = t.match(/#\/c\/([A-Za-z0-9]+)/) || t.match(/^([A-Za-z0-9]{10,})$/);
  return m ? m[1].toUpperCase() : null;
}

// ---------- Fechas ----------

export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Primer día en que un corredor puede apuntar una carrera ya pasada que se olvidó: 1 de enero del año anterior. */
export function pastLimit(d = new Date()) { return `${d.getFullYear() - 1}-01-01`; }
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
/** «2027-06-14» → «lun 14 jun 2027». */
export function formatDate(iso, withDay = true) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso ?? '');
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${withDay ? DAYS[wd] + ' ' : ''}${d} ${MONTHS[m - 1]} ${y}`;
}

// ---------- Calendario ----------

export const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Semanas (de lunes a domingo) del mes «AAAA-MM»; los huecos fuera del mes son null. */
export function monthGrid(ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // 0 = lunes
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [...Array(first).fill(null),
    ...Array.from({ length: days }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Suma `n` meses a «AAAA-MM». */
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ---------- Carreras de varios días ----------

/** «lun 14 jun 2027», o un intervalo: «sáb 12 – lun 14 jun 2027», «sáb 30 may – lun 1 jun 2027». */
export function formatRange(start, end, withDay = true) {
  if (!end || end <= start) return formatDate(start, withDay);
  const [y1, m1] = start.split('-'), [y2, m2] = end.split('-');
  const a = formatDate(start, withDay).split(' '), b = formatDate(end, withDay);
  // a = [día_semana?, día, mes, año]
  const cut = y1 !== y2 ? a.length : m1 !== m2 ? a.length - 1 : a.length - 2;
  return `${a.slice(0, cut).join(' ')} – ${b}`;
}

/** Días (AAAA-MM-DD) entre el primero y el último, ambos incluidos (máximo 60). */
export function daysOf(start, end) {
  const out = [start];
  if (!end || end <= start) return out;
  const d = new Date(start + 'T12:00:00Z');
  while (out.length < 60) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    if (iso > end) break;
    out.push(iso);
  }
  return out;
}

/** Número de días de una carrera. */
export const numDays = (start, end) => daysOf(start, end).length;
/**
 * Cuándo se actualizaron por última vez las estadísticas de Instagram (la captura automática escribe `captured_at = now()` en cada pasada).
 * Devuelve { at, hours, lastDay, level }: `level` = 'ok' (≤ 2 días), 'late' (≤ 4 días) o 'stale' (más); null si no hay filas con fecha.
 */
export function igLastUpdate(rows, now = new Date()) {
  let at = 0, lastDay = '';
  for (const r of rows || []) {
    const t = Date.parse(r?.captured_at); if (Number.isFinite(t) && t > at) at = t;
    if (r?.kind === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(r.key || '') && r.key > lastDay) lastDay = r.key;
  }
  if (!at) return null;
  const hours = Math.max(0, (now.getTime() - at) / 36e5);
  return { at: new Date(at).toISOString(), hours, lastDay: lastDay || null, level: hours <= 48 ? 'ok' : hours <= 96 ? 'late' : 'stale' };
}

/** Tiempo por km y velocidad media de una lista de carreras ({ km, time_seconds }): solo cuentan las que tienen distancia y tiempo. */
export function avgSpeed(items) {
  let km = 0, sec = 0;
  for (const r of items || []) { const k = Number(r?.km), t = Number(r?.time_seconds); if (k > 0 && t > 0) { km += k; sec += t; } }
  return { km: Math.round(km * 10) / 10, sec, kmh: sec ? Math.round((km / (sec / 3600)) * 10) / 10 : 0, pace: km ? Math.round(sec / km) : 0 };
}

// ---------- Bonos por carreras de la temporada ----------

/** Bono según los contratos (2026 y 2027); los años sin configurar copian el último configurado. */
export const DEFAULT_BONUS = {
  tiers: [{ races: 12, amount: 50 }, { races: 17, amount: 100 }, { races: 22, amount: 150 }], // nuevo y renovación
  // tramos propios por tipo de contrato (los que no aparecen usan `tiers`)
  tiersByContract: { renovacion_sin_licencia: [{ races: 12, amount: 100 }, { races: 17, amount: 150 }, { races: 22, amount: 200 }] },
  minimum: 12,
  circuitExtra: 4, // carreras extra para el bono por cada podio en la general final de un circuito (cláusula NOVENA)
  penalty: { renovado: 100, nuevo: 175, sin_licencia: 0 }, // renovación sin licencia: sin penalización
  nuevos: [],
};

/** Tramos que la app traía por error (150/200/250 €): si se guardaron tal cual, se sustituyen por los del contrato. */
const WRONG_OLD_TIERS = '12:150,17:200,22:250';
const tiersKey = (t) => [...(t || [])].sort((a, b) => a.races - b.races).map((x) => `${x.races}:${x.amount}`).join(',');

/** Tipos de contrato del corredor (temporada actual). */
export const CONTRACTS = [
  { id: 'nuevo', label: 'Nuevo', penalty: 'nuevo' },
  { id: 'renovacion', label: 'Renovación', penalty: 'renovado' },
  { id: 'renovacion_sin_licencia', label: 'Renovación sin licencia', penalty: 'sin_licencia' },
];
export const contractLabel = (id) => CONTRACTS.find((c) => c.id === id)?.label || 'Sin indicar';
/** Acepta «nuevo», «Renovación sin licencia», «renov s/l»… → id del contrato, o null. */
export function matchContract(s) {
  const n = normalize(s).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return null;
  if (n.startsWith('nuev')) return 'nuevo';
  if (n.startsWith('renov')) return /sin|s l|sl\b/.test(n.slice(5)) ? 'renovacion_sin_licencia' : 'renovacion';
  return null;
}

function withDefaults(cfg, nuevos) {
  const wrongTiers = tiersKey(cfg.tiers) === WRONG_OLD_TIERS;
  return {
    ...DEFAULT_BONUS, ...cfg,
    tiers: wrongTiers || !cfg.tiers?.length ? DEFAULT_BONUS.tiers : cfg.tiers,
    // una configuración guardada antes de los tramos por contrato no los trae: se usan los del contrato
    tiersByContract: { ...DEFAULT_BONUS.tiersByContract, ...(wrongTiers ? {} : cfg.tiersByContract || {}) },
    penalty: { ...DEFAULT_BONUS.penalty, ...cfg.penalty },
    nuevos,
  };
}

export function bonusConfigFor(all, year) {
  const cfg = all?.[year];
  if (cfg) return withDefaults(cfg, cfg.nuevos || []);
  const prev = Object.keys(all || {}).map(Number).filter((y) => y < year).sort((a, b) => b - a)[0];
  // de un año a otro se copian tramos, mínimo y penalizaciones, pero no quién es nuevo
  return prev ? withDefaults(all[prev], []) : withDefaults({}, []);
}

/** Tramos de bono que corresponden a un tipo de contrato. */
/** Tramos de bonificación como rangos de carreras: 12/17/22 → «12 a 16», «17 a 21», «22 o más» (cada tramo empieza al llegar a su número). */
export const tierRanges = (tiers) => {
  const t = [...(tiers || [])].filter((x) => x.races > 0).sort((a, b) => a.races - b.races);
  return t.map((x, i) => ({ from: x.races, to: t[i + 1] ? t[i + 1].races - 1 : null, amount: x.amount, text: t[i + 1] ? `${x.races} a ${t[i + 1].races - 1}` : `${x.races} o más` }));
};
export const tiersFor = (cfg, contract) =>
  [...((cfg.tiersByContract || {})[contract] || cfg.tiers || [])].filter((t) => t.races > 0).sort((a, b) => a.races - b.races);

/** Carreras que cuentan para el bono: cada día de competición es una (una de 3 días = 3). */
export const bonusRacesOf = (race) => numDays(race.date, race.end_date);

/**
 * Situación de un corredor: { count, minimum, reachesMinimum, penalty, amount, tier, next, missingToNext, missingToMinimum }.
 * `amount` es lo que cobra con lo hecho; `penalty`, lo que pagaría si acabara la temporada así.
 */
export function bonusStatus(count, cfg, contract, extra = 0, suspended = 0) {
  // `extra`: carreras adicionales por podios de circuito. Suben el tramo del bono, pero NO cuentan para el mínimo.
  // `suspended`: carreras suspendidas en las que estaba apuntado (cláusula 6): cuentan para el mínimo, NO para el bono.
  const susp = Number(suspended) || 0;
  const raced = count;
  count = raced + (Number(extra) || 0);
  // `contract`: id de CONTRACTS (o true/false de versiones antiguas: true = nuevo)
  const c = contract === true ? 'nuevo' : contract === false || contract == null ? 'renovacion' : contract;
  const penaltyKey = CONTRACTS.find((x) => x.id === c)?.penalty || 'renovado';
  const pen = { ...DEFAULT_BONUS.penalty, ...(cfg.penalty || {}) };
  const tiers = tiersFor(cfg, c);
  const reached = tiers.filter((t) => count >= t.races);
  const tier = reached.at(-1) || null;
  const next = tiers.find((t) => count < t.races) || null;
  const minimum = Number(cfg.minimum) || 0;
  const minCount = raced + susp;
  const reachesMinimum = minCount >= minimum;
  return {
    count: raced, extra: count - raced, suspended: susp, bonusCount: count, minimum, reachesMinimum,
    penalty: reachesMinimum ? 0 : Number(pen[penaltyKey] ?? pen.renovado) || 0,
    amount: tier ? tier.amount : 0,
    tier, next,
    missingToNext: next ? next.races - count : 0,
    missingToMinimum: reachesMinimum ? 0 : minimum - minCount,
    isNew: c === 'nuevo', contract: c, tiers,
  };
}

/** Bonos de toda la plantilla en un año, a partir de las carreras (con resultados) y las inscripciones. */
export function yearBonuses(year, races, registrations, runners, cfg, circuitPodiums = []) {
  const per = Number(cfg.circuitExtra ?? DEFAULT_BONUS.circuitExtra) || 0;
  const circuits = new Map();
  for (const c of circuitPodiums) if (c.year === year && c.status === 'confirmado') circuits.set(c.runner_id, [...(circuits.get(c.runner_id) || []), c]);
  const done = new Map(), planned = new Map(), susp = new Map();
  for (const r of races) if (yearOf(r.date) === year) for (const x of r.results || []) {
    if (x.runner_id) done.set(x.runner_id, (done.get(x.runner_id) || 0) + bonusRacesOf(r));
  }
  // inscripción ya disputada con el puesto puesto por el corredor: cuenta como hecha (aunque no esté en resultados)
  for (const g of registrations) if (yearOf(g.date) === year) for (const e of g.entries || []) {
    const m = g.suspended ? susp : e.self_position ? done : planned;
    m.set(e.runner_id, (m.get(e.runner_id) || 0) + bonusRacesOf(g));
  }
  const nuevos = new Set(cfg.nuevos || []); // lista antigua: solo si el corredor no tiene contrato indicado
  return runners.map((rn) => {
    const count = done.get(rn.id) || 0;
    const plan = planned.get(rn.id) || 0;
    const c = rn.contract || (nuevos.has(rn.id) ? 'nuevo' : null);
    const mine = circuits.get(rn.id) || [];
    const extra = mine.length * per;
    const sp = susp.get(rn.id) || 0;
    return { runner: rn, planned: plan, circuits: mine, ...bonusStatus(count, cfg, c, extra, sp), projected: bonusStatus(count + plan, cfg, c, extra, sp) };
  }).sort((a, b) => b.count - a.count || a.runner.name.localeCompare(b.runner.name, 'es'));
}

// ---------- Buscador de carreras (para no duplicar) ----------

const STOP = new Set(['de', 'del', 'la', 'el', 'les', 'los', 'las', 'i', 'y', 'a', 'en', 'cursa', 'carrera', 'prueba', 'trofeo', 'trofeu', 'marxa', 'marcha',
  'btt', 'mtb', 'cx', 'xco', 'gravel', 'ciclocross', 'ciclocros', 'open', 'copa', 'gran', 'premi', 'premio', 'memorial', 'campionat', 'campeonato', 'escolar']);
const words = (s) => normalize(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((w) => w.length > 1);
/** ¿Se parecen dos palabras largas salvo por una letra? («cerdana» ~ «cerdanya», «garriges» ~ «garrigues») */
function oneEditAway(a, b) {
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Otras formas de escribir la modalidad o el formato al buscar (BTT = MTB = mountain bike…). */
const MOD_ALIASES = {
  BTT: 'btt mtb mountain bike bicicleta montana', Carretera: 'carretera ruta road', Gravel: 'gravel grava', Ciclocross: 'ciclocross cx cyclocross', Pista: 'pista velodromo',
  XCO: 'xco cross country olimpico', XCM: 'xcm maraton marathon', UXCM: 'uxcm ultra maraton', Descenso: 'descenso dh downhill', Rally: 'rally', Critérium: 'criterium', Contrarreloj: 'contrarreloj cri',
  Ciclodeportiva: 'ciclodeportiva cicloturista marxa', Máster: 'master', Ultradistancia: 'ultradistancia ultra',
};
/**
 * Puntuación de parecido entre lo buscado y una carrera (nombre y lugar). 0 = nada que ver.
 * Cada palabra buscada cuenta si aparece (o empieza) en el nombre o el lugar; las palabras
 * genéricas («cursa», «trofeo»…) cuentan poco para no sacar todas las carreras.
 */
export function raceMatchScore(query, race) {
  const q = words(query);
  if (!q.length) return 0;
  const name = words([race.name, race.league].filter(Boolean).join(' ')), place = words([race.place, race.province].filter(Boolean).join(' '));
  const tags = words([MOD_ALIASES[race.modality], MOD_ALIASES[race.subtype], race.modality, race.subtype].filter(Boolean).join(' '));
  let score = 0, hits = 0;
  for (const w of q) {
    const inTag = w.length >= 2 && tags.some((t) => t === w || (w.length >= 3 && t.startsWith(w)));
    const inName = name.some((n) => n.startsWith(w) || (w.length >= 4 && n.includes(w)) || oneEditAway(w, n));
    const exact = name.includes(w);
    const inPlace = place.some((n) => n.startsWith(w));
    if (inName || inPlace) hits++;
    const weight = STOP.has(w) ? 0.3 : 1;
    const base = weight * (exact ? 3 : inName ? 2 : inPlace ? 1 : 0);
    if (inTag) hits += inName || inPlace ? 0 : 1;   // «btt», «mtb», «mountain bike», «xco»…: por modalidad o formato
    score += inTag ? Math.max(base, 1.5) : base;
  }
  if (!hits) return 0;
  return score * (hits / q.length); // premia que coincidan todas las palabras
}

/**
 * Personas (objetos con `name`) que encajan con lo escrito: cada palabra escrita tiene que empezar una palabra del nombre
 * (sin tildes ni mayúsculas) o, si tiene 3 letras o más, estar dentro del nombre. Devuelve todas, por orden alfabético.
 */
export function matchPeople(query, people) {
  const toks = normalize(query).split(/\s+/).filter(Boolean);
  if (!toks.length || toks.join('').length < 2) return [];
  return people.filter((p) => {
    const n = normalize(p.name), words = n.split(/\s+/);
    return toks.every((t) => words.some((w) => w.startsWith(t)) || (t.length >= 3 && n.includes(t)));
  }).sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
}

/**
 * Valida y limpia un enlace de Google (hoja de cálculo, formulario, documento…): solo https y docs.google.com / drive.google.com.
 * Quita los parámetros de compartir («usp», «ouid» —que lleva el identificador de la cuenta de quien lo creó—, «resourcekey» no se toca).
 * Devuelve la dirección limpia o null si no vale.
 */
export function cleanGoogleLink(text) {
  let u;
  try { u = new URL(String(text || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || !['docs.google.com', 'drive.google.com'].includes(u.hostname)) return null;
  if (u.username || u.password || u.pathname.length < 5) return null;
  for (const k of ['usp', 'ouid']) u.searchParams.delete(k);
  return u.toString();
}

/** Carreras parecidas a lo buscado, de más a menos parecidas. */
export function searchRaces(query, races, min = 1) {
  return races.map((r) => ({ race: r, score: raceMatchScore(query, r) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score || a.race.date.localeCompare(b.race.date))
    .map((x) => x.race);
}

// ======================================================================
//  Estadísticas de Instagram (filas de ig_snapshots: {kind, key, data})
// ======================================================================

const sumOf = (arr, k) => arr.reduce((n, d) => n + (Number(d[k]) || 0), 0);
const IG_AGES = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];

/**
 * Resume las cifras guardadas de Instagram entre dos fechas (AAAA-MM-DD, inclusive; vacías = sin límite).
 * Devuelve solo lo que hay: si no hay datos de algo, ese bloque viene vacío (nunca inventa).
 */
export function igSummary(rows, from = '', to = '') {
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const of = (kind) => (rows || []).filter((r) => r.kind === kind);
  const days = of('day').filter((r) => inRange(r.key)).sort((a, b) => a.key.localeCompare(b.key));
  const dd = days.map((r) => r.data || {});
  const t = {
    views: sumOf(dd, 'views'), interactions: sumOf(dd, 'interactions'), likes: sumOf(dd, 'likes'), comments: sumOf(dd, 'comments'),
    shares: sumOf(dd, 'shares'), saves: sumOf(dd, 'saves'), taps: sumOf(dd, 'taps'), follows: sumOf(dd, 'follows'),
    viewsF: sumOf(dd, 'views_f'), viewsNF: sumOf(dd, 'views_nf'),
  };
  const reachDays = dd.filter((d) => Number(d.reach) > 0);
  t.reachAvg = reachDays.length ? Math.round(sumOf(reachDays, 'reach') / reachDays.length) : 0;
  const split = t.viewsF + t.viewsNF;
  t.pctNonFollowers = split ? Math.round((t.viewsNF / split) * 100) : null;

  const byMonth = new Map();
  for (const r of days) {
    const m = byMonth.get(r.key.slice(0, 7)) || { ym: r.key.slice(0, 7), views: 0, interactions: 0, days: 0 };
    m.views += Number(r.data.views) || 0; m.interactions += Number(r.data.interactions) || 0; m.days++;
    byMonth.set(m.ym, m);
  }

  const posts = of('media').map((r) => ({ id: r.key, ...r.data, date: String(r.data?.ts || '').slice(0, 10) }))
    .filter((p) => p.date && inRange(p.date)).sort((a, b) => (b.views || 0) - (a.views || 0));
  // cuándo funcionan mejor las publicaciones (día de la semana y franja horaria, hora de Madrid)
  const wd = Array.from({ length: 7 }, (_, i) => ({ d: i, n: 0, views: 0 })), slot = [['Mañana', 6, 14], ['Tarde', 14, 20], ['Noche', 20, 30]].map(([name]) => ({ name, n: 0, views: 0 }));
  for (const p of posts) {
    const dt = new Date(p.ts); if (isNaN(dt)) continue;
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(dt);
    const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.find((x) => x.type === 'weekday').value), h = Number(parts.find((x) => x.type === 'hour').value);
    wd[day].n++; wd[day].views += p.views || 0;
    const k = h >= 6 && h < 14 ? 0 : h >= 14 && h < 20 ? 1 : 2; slot[k].n++; slot[k].views += p.views || 0;
    p.er = p.reach ? Math.round(((p.engagement ?? ((p.likes || 0) + (p.comments || 0) + (p.shares || 0) + (p.saves || 0))) / p.reach) * 1000) / 10 : null;
  }
  const kinds = new Map();
  for (const p of posts) {
    const k = p.product === 'REELS' ? 'Reels' : p.type === 'CAROUSEL_ALBUM' ? 'Carruseles' : p.type === 'VIDEO' ? 'Vídeos' : 'Fotos';
    const x = kinds.get(k) || { kind: k, n: 0, views: 0, likes: 0 };
    x.n++; x.views += p.views || 0; x.likes += p.likes || 0; kinds.set(k, x);
  }

  const stories = of('story').map((r) => ({ id: r.key, ...r.data, date: String(r.data?.ts || '').slice(0, 10) })).filter((s) => s.date && inRange(s.date));
  const st = { n: stories.length, views: sumOf(stories, 'views'), replies: sumOf(stories, 'replies'), shares: sumOf(stories, 'shares') };
  st.avg = st.n ? Math.round(st.views / st.n) : 0;

  const acc = of('account').filter((r) => inRange(r.key)).sort((a, b) => a.key.localeCompare(b.key));
  const last = acc[acc.length - 1]?.data || null, first = acc[0]?.data || null;
  const account = last ? { followers: last.followers ?? null, following: last.following ?? null, media: last.media ?? null,
    followersFrom: first?.followers ?? null, since: acc[0].key, until: acc[acc.length - 1].key,
    delta: acc.length > 1 && last.followers != null && first.followers != null ? last.followers - first.followers : null } : null;

  const aud = of('audience').filter((r) => inRange(r.key)).sort((a, b) => a.key.localeCompare(b.key)).pop();
  let audience = null;
  if (aud) {
    const ga = aud.data.gender_age || {}, g = { F: 0, M: 0, U: 0 }, ages = Object.fromEntries(IG_AGES.map((a) => [a, 0]));
    for (const [k, v] of Object.entries(ga)) { const [sex, age] = k.split('.'); if (sex in g) g[sex] += v; if (age in ages) ages[age] += v; }
    const top = (o, n) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, v]) => ({ name, v }));
    const tot = g.F + g.M + g.U;
    const ga2 = Object.fromEntries(IG_AGES.map((a) => [a, { F: ga['F.' + a] || 0, M: ga['M.' + a] || 0, U: ga['U.' + a] || 0 }]));
    audience = { genderAge: ga2, date: aud.key, total: tot, gender: g, ages: IG_AGES.map((a) => ({ age: a, v: ages[a] })), countries: top(aud.data.country, 6), cities: top(aud.data.city, 10),
      pctMen: tot ? Math.round((g.M / tot) * 100) : null, pctWomen: tot ? Math.round((g.F / tot) * 100) : null };
  }
  return { days: days.map((r) => ({ date: r.key, ...r.data })), nDays: days.length, first: days[0]?.key || '', last: days[days.length - 1]?.key || '',
    totals: t, byMonth: [...byMonth.values()], posts, byKind: [...kinds.values()].sort((a, b) => b.views - a.views), stories: st, storyList: stories.sort((a, b) => String(b.ts).localeCompare(String(a.ts))),
    byWeekday: wd, bySlot: slot, followerSeries: acc.filter((r) => r.data.followers != null).map((r) => ({ date: r.key, v: r.data.followers })), account, audience };
}

/** Totales del periodo anterior de la misma duración (para «+12 % vs periodo anterior»). null si no hay datos o el periodo no está acotado. */
export function igPrevTotals(rows, from, to) {
  if (!from || !to) return null;
  const a = new Date(from + 'T12:00:00'), b = new Date(to + 'T12:00:00'), n = Math.round((b - a) / 864e5) + 1;
  const pt = new Date(a); pt.setDate(pt.getDate() - 1); const pf = new Date(pt); pf.setDate(pf.getDate() - (n - 1));
  const g = igSummary(rows, todayISO(pf), todayISO(pt));
  return g.nDays >= Math.min(7, n) ? g.totals : null;
}

/**
 * Resúmenes por periodo de Insights (filas kind=period, key «AAAA-MM-DD_AAAA-MM-DD»), volcados por Claude desde una captura.
 * Devuelve los periodos que tocan [from,to] ordenados, los totales (suma solo de lo que se puede sumar), los solapes y lo más reciente de audiencia y contenido.
 */
export function igPeriods(rows, from = '', to = '') {
  const days = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5) + 1;
  const list = (rows || []).filter((r) => r.kind === 'period').map((r) => {
    const [a, b] = String(r.key).split('_');
    return a && b && /^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b) ? { key: r.key, from: a, to: b, days: days(a, b), ...r.data } : null;
  }).filter(Boolean).filter((p) => (!to || p.from <= to) && (!from || p.to >= from)).sort((x, y) => x.from.localeCompare(y.from));
  const overlaps = [];
  for (let i = 1; i < list.length; i++) if (list[i].from <= list[i - 1].to) overlaps.push([list[i - 1], list[i]]);
  const ADD = ['views', 'interactions', 'net_follows', 'follows', 'unfollows', 'v_story', 'v_feed', 'v_reel', 'likes', 'comments', 'shares', 'saves', 'profile_visits', 'link_taps'];
  const totals = { days: list.reduce((n, p) => n + p.days, 0) };
  for (const k of ADD) { const have = list.filter((p) => typeof p[k] === 'number'); if (have.length) totals[k] = have.reduce((n, p) => n + p[k], 0); }
  const viewers = list.map((p) => p.viewers ?? p.reach).filter((v) => typeof v === 'number');
  if (viewers.length) { totals.viewersMax = Math.max(...viewers); totals.viewersAvg = Math.round(viewers.reduce((n, v) => n + v, 0) / viewers.length); }
  const latest = (k) => [...list].reverse().find((p) => p[k] && Object.keys(p[k]).length);
  const audP = ['ages', 'gender', 'cities', 'countries'].map(latest).filter(Boolean).sort((a, b) => b.to.localeCompare(a.to))[0] || null;
  const hoursP = [...list].reverse().find((p) => Array.isArray(p.top_hours) && p.top_hours.length) || null;
  const seen = new Set(), posts = [];
  for (const p of list) for (const x of p.posts || []) { const id = `${x.d || ''}|${x.t || ''}`; if (!seen.has(id)) { seen.add(id); posts.push({ ...x, period: p.key }); } }
  posts.sort((a, b) => (b.v || 0) - (a.v || 0));
  return { list, totals, overlaps, posts, audience: audP ? { period: audP.key, from: audP.from, to: audP.to, gender: audP.gender || null, ages: audP.ages || null, cities: audP.cities || null, countries: audP.countries || null } : null, topHours: hoursP ? { from: hoursP.from, to: hoursP.to, list: hoursP.top_hours } : null };
}

// ======================================================================
//  Panel de redes (dirección): estado de las 3 publicaciones de cada carrera
// ======================================================================

/**
 * Para cada carrera con inscritos (o ya con resultados) cerca de hoy, el estado de sus tres publicaciones:
 *  - story: historia previa (automática, 2 días antes)   - aviso: post antes de la carrera   - res: post de resultados.
 * Cada pieza: { k, st: 'ok'|'curso'|'pend'|'late'|'na', text, key?, date?, days? }.
 * `status` de la carrera: 'pend' (hay algo por hacer), 'curso' (programado o a la espera) o 'hecho'.
 * `posted`: Set de claves marcadas como publicadas; `log`: parseStoryLog (o null).
 */
export function socialBoard(races, registrations, posted, today, log = null, { back = 45, ahead = 30, chron = null } = {}) {
  const dayDiff = (a, b) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000);
  const last = (g) => g.end_date || g.date;
  const short = (iso) => formatDate(iso, false);
  const people = (g) => (g.entries || []).length;
  const raceKeys = new Set(races.filter((r) => (r.results || []).length).map(postKeyOf));
  const events = [
    ...races.filter((r) => (r.results || []).length).map((r) => ({ g: r, kind: 'race' })),
    ...registrations.filter((g) => (people(g) || (g.suspended && posted.has(postKeyOf(g)))) && !raceKeys.has(postKeyOf(g))).map((g) => ({ g, kind: 'reg' })),
  ];
  const items = [];
  for (const { g, kind } of events) {
    const fromToday = dayDiff(g.date, today), lastDays = dayDiff(today, last(g));       // días hasta el inicio / desde el final
    if (fromToday > ahead || lastDays > back) continue;
    const pk = postKeyOf(g), rk = resKeyOf(g), past = last(g) < today;
    const pieces = [];
    if (g.suspended) {
      pieces.push({ k: 'aviso', st: posted.has(pk) ? 'pend' : 'na', text: posted.has(pk) ? 'Suspendida: conviene publicar que se ha suspendido' : 'Suspendida', key: pk });
    } else {
      // historia previa
      const s = storyState(g, log, posted.has(pk), today);
      if (s) pieces.push({ k: 'story', ...(
        s.state === 'ok' ? { st: 'ok', text: `Historia ✓ ${s.date ? short(s.date) : ''}${s.n > 1 ? ` · ${s.n} páginas` : ''}`.trim() }
        : s.state === 'manual' ? { st: 'ok', text: 'Historia ✓ (marcada a mano)' }
        : s.state === 'hoy' ? { st: 'curso', text: 'Historia: sale hoy', date: s.date }
        : s.state === 'programada' ? { st: 'curso', text: `Historia: sale el ${short(s.date)}`, date: s.date }
        : { st: 'pend', text: 'Historia: no consta', date: s.date }), key: pk });
      // aviso
      if (kind === 'reg') {
        if (posted.has(pk)) pieces.push({ k: 'aviso', st: 'ok', text: 'Aviso ✓', key: pk });
        else if (!past) pieces.push(fromToday <= 14 ? { k: 'aviso', st: 'pend', text: `Aviso: sin publicar (faltan ${Math.max(0, fromToday)} días)`, key: pk, days: fromToday } : { k: 'aviso', st: 'curso', text: 'Aviso: aún no toca', key: pk });
      } else if (posted.has(pk)) pieces.push({ k: 'aviso', st: 'ok', text: 'Aviso ✓', key: pk });
      // resultados
      if (past) {
        if (kind === 'race') {
          if (posted.has(rk)) pieces.push({ k: 'res', st: 'ok', text: 'Resultados ✓', key: rk });
          else if (lastDays <= 7) pieces.push({ k: 'res', st: 'pend', text: lastDays <= 0 ? 'Resultados: por publicar (hoy)' : `Resultados: por publicar (terminó hace ${lastDays} ${lastDays === 1 ? 'día' : 'días'})`, key: rk, days: lastDays });
          else if (lastDays <= 45) pieces.push({ k: 'res', st: 'late', text: `Resultados: sin publicar hace ${lastDays} días`, key: rk, days: lastDays });
        } else if (lastDays < 3 || (g.entries || []).some((e) => e.self_position)) pieces.push({ k: 'res', st: 'curso', text: 'Resultados: esperando los puestos de los corredores' });
        else pieces.push({ k: 'res', st: 'pend', text: 'Resultados: nadie ha puesto su puesto, no hay nada que publicar', days: lastDays });
      }
      // la dirección puede abrir la pieza de resultados y poner o corregir los puestos de cada corredor
      const resPiece = pieces.find((x) => x.k === 'res');
      if (resPiece) {
        const rows = kind === 'race'
          ? (g.results || []).filter((x) => x.runner_id).map((x) => ({ id: x.runner_id, name: x.runner_name || chron?.nameOf?.(x.runner_id) || '?', category: x.category || '', position: x.position ?? null, podium: x.podium_type || null, time: x.time_seconds || null }))
          : (g.entries || []).filter((x) => x.runner_id).map((x) => ({ id: x.runner_id, name: x.runner_name || chron?.nameOf?.(x.runner_id) || '?', category: x.category || '', position: x.self_position ?? null, podium: x.self_podium_type || null, time: x.self_time_seconds || null }));
        if (rows.length) resPiece.people = rows.sort((p, q) => p.name.localeCompare(q.name, 'es'));
        resPiece.rid = g.id; resPiece.rkind = kind;
      }
    }
    // crónicas: basta con que la pase uno de los que corrieron (solo si ya existe el SQL y la carrera ya se corrió)
    if (chron && past && !g.suspended) {
      const part = new Map();
      for (const x of kind === 'race' ? (g.results || []) : (g.entries || [])) if (x.runner_id && !part.has(x.runner_id)) part.set(x.runner_id, x.runner_name || chron.nameOf?.(x.runner_id) || '?');
      if (part.size) {
        // basta con que la pase UNO de los que corrieron: entonces la crónica de esa carrera está hecha para todos
        const ok = chron.done.get(pk) || new Set();
        const people = [...part].map(([id, name]) => ({ id, name, done: ok.has(id) })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
        const by = people.filter((x) => x.done).map((x) => x.name);
        pieces.push(ok.size ? { k: 'cro', st: 'ok', text: `Crónica ✓ (la pasó ${by.slice(0, 2).join(' y ') || chron.nameOf?.([...ok][0]) || 'un corredor'}${by.length > 2 ? ` y ${by.length - 2} más` : ''})`, key: pk, people }
          : { k: 'cro', st: lastDays > 7 ? 'late' : 'curso', text: `Crónica: nadie la ha pasado todavía (${part.size} ${part.size === 1 ? 'corredor' : 'corredores'})`, key: pk, people });
      }
    }
    if (!pieces.length) continue;
    const bad = pieces.some((x) => x.st === 'pend' || x.st === 'late'), run = pieces.some((x) => x.st === 'curso');
    items.push({ id: g.id, kind, g, name: g.name, date: g.date, end_date: g.end_date || null, place: g.place || '', modality: g.modality, suspended: !!g.suspended, pieces,
      status: bad ? 'pend' : run ? 'curso' : 'hecho', distance: Math.abs(fromToday > 0 ? fromToday : -lastDays) });
  }
  const rank = { pend: 0, curso: 1, hecho: 2 };
  items.sort((a, b) => rank[a.status] - rank[b.status] || a.distance - b.distance || a.date.localeCompare(b.date));
  const counts = { pend: 0, curso: 0, hecho: 0 };
  for (const it of items) counts[it.status]++;
  const nextStory = items.flatMap((it) => it.pieces.filter((x) => x.k === 'story' && x.st === 'curso').map((x) => ({ item: it, ...x }))).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  return { items, counts, nextStory };
}

// ======================================================================
//  Crónicas de carrera (contrato: crónica, resultados y fotos de cada carrera)
// ======================================================================

/**
 * «Impacto en redes» de un corredor: de cada una de sus carreras, qué se ha publicado gracias a ella.
 * Lo único que hace el corredor es poner su resultado y pasar la crónica; la historia sale sola (tarea automática) y los resultados los publica el club.
 * `items`: carreras con { key, date, name }; `posted`: Set de claves publicadas por el club (la clave de la carrera = historia/aviso, «res|…» = resultados);
 * `story`: registro de historias automáticas (parseStoryLog); `chron`: Set de crónicas pasadas; `mine`: Set de carreras en las que el corredor ya puso su resultado.
 */
export function raceImpact(items, { posted = new Set(), story = null, chron = null, mine = new Set() } = {}) {
  const rows = items.map((x) => ({ ...x, story: !!(story?.byKey?.has(x.key) || posted.has(x.key)), mine: mine.has(x.key), published: posted.has('res|' + x.key), cro: !!chron?.has(x.key) }));
  const totals = { races: rows.length, stories: rows.filter((r) => r.story).length, results: rows.filter((r) => r.mine).length, published: rows.filter((r) => r.published).length, chronicles: rows.filter((r) => r.cro).length };
  return { rows, totals, pieces: totals.stories + totals.published + totals.chronicles };
}

/**
 * Crónicas de un corredor: las carreras en las que ha participado (con resultado, o ya corridas estando inscrito) y cuáles ya pasó.
 * `d`: datos del corredor ({ me, my_results, registrations }); `done`: Set de claves «AAAA-MM-DD|nombre» pasadas; `year`: temporada (o null = todas).
 */
export function chronicleStatus(d, done, today, year = null) {
  const last = (g) => g.end_date || g.date;
  const seen = new Map();
  for (const r of d.my_results || []) seen.set(postKeyOf(r), { key: postKeyOf(r), id: r.race_id, kind: 'race', name: r.name, date: r.date, end_date: r.end_date || null, place: r.place || '' });
  for (const g of d.registrations || []) {
    if (g.suspended || last(g) >= today || !(g.entries || []).some((e) => e.runner_id === d.me?.id) || seen.has(postKeyOf(g))) continue;
    seen.set(postKeyOf(g), { key: postKeyOf(g), id: g.id, kind: 'reg', name: g.name, date: g.date, end_date: g.end_date || null, place: g.place || '' });
  }
  const all = [...seen.values()].filter((x) => year == null || yearOf(x.date) === year).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, 'es'));
  return { pending: all.filter((x) => !done.has(x.key)), done: all.filter((x) => done.has(x.key)), total: all.length };
}

// ======================================================================
//  Panel «Hoy» de la dirección: lo que hay que hacer, ordenado por urgencia
// ======================================================================

const isoPlus = (iso, n) => { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(String(b).slice(0, 10) + 'T12:00:00Z') - Date.parse(String(a).slice(0, 10) + 'T12:00:00Z')) / 864e5);
/** Días desde la última vez que abrió la app (null = nunca o sin datos). */
export function seenDays(lastSeen, now = new Date()) {
  if (!lastSeen) return null;
  const t = Date.parse(lastSeen);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / 864e5)) : null;
}
export const seenText = (days) => (days == null ? 'no ha abierto la app' : days === 0 ? 'activo hoy' : days === 1 ? 'activo ayer' : `hace ${days} días`);
/** Nivel de actividad: 'hot' (≤ 7 días), 'warm' (≤ 30), 'cold' (> 30), 'never'. */
export const seenLevel = (days) => (days == null ? 'never' : days <= 7 ? 'hot' : days <= 30 ? 'warm' : 'cold');

/** Huecos que no impiden la estadística básica: se piden, pero no cuentan como «datos incompletos». */
export const SOFT_GAPS = new Set(['km', 'desnivel', 'precio', 'ubicación']);
/** Qué le falta a una carrera con resultados para que la memoria y las estadísticas salgan completas. */
export function raceGaps(r) {
  const out = [];
  if (!String(r?.province ?? '').trim()) out.push('provincia');
  if (SUBTYPES[r?.modality] && !String(r?.subtype ?? '').trim()) out.push('disciplina');
  if (!(Number(r?.km) > 0)) out.push('km');
  if (!(Number(r?.elevation) > 0)) out.push('desnivel');
  if (r?.price == null || r.price === '') out.push('precio');
  if (!distanceKm(r)) out.push('ubicación');
  const noPos = (r?.results || []).filter((x) => x.position == null || x.position === '').length;
  if (noPos) out.push(`${noPos} sin puesto`);
  if (!(r?.results || []).length) out.push('sin participantes');
  return out;
}

/**
 * Todo lo que la dirección tiene que mirar hoy.
 * - pendingResults: carreras ya disputadas (últimos 60 días) con inscritos que aún no han puesto su puesto.
 * - upcoming: carreras de los próximos `ahead` días con gente del club.
 * - activity: actividad de cada corredor (si la base de datos ya guarda `last_seen`).
 * - quality: carreras de la temporada con datos incompletos.
 * - idle: corredores sin ninguna inscripción próxima.
 */
export function directorBoard({ races = [], registrations = [], runners = [] }, today, { ahead = 10, back = 60, now = new Date() } = {}) {
  const last = (g) => g.end_date || g.date;
  const live = new Set(runners.map((r) => r.id));
  const pendingResults = registrations
    .filter((g) => !g.suspended && last(g) < today && last(g) >= isoPlus(today, -back))
    .map((g) => ({ reg: g, days: daysBetween(last(g), today), missing: (g.entries || []).filter((e) => !e.self_position && live.has(e.runner_id)).map((e) => e.runner_id),
      total: (g.entries || []).length }))
    .filter((x) => x.missing.length)
    .sort((a, b) => a.days - b.days || a.reg.name.localeCompare(b.reg.name, 'es'));
  const upcoming = registrations
    .filter((g) => !g.suspended && g.date >= today && g.date <= isoPlus(today, ahead) && (g.entries || []).length)
    .map((g) => ({ reg: g, days: daysBetween(today, g.date), ids: (g.entries || []).map((e) => e.runner_id) }))
    .sort((a, b) => a.days - b.days || a.reg.name.localeCompare(b.reg.name, 'es'));
  const tracked = runners.some((r) => Object.prototype.hasOwnProperty.call(r, 'last_seen'));
  const activity = tracked ? runners.map((r) => { const days = seenDays(r.last_seen, now); return { id: r.id, days, level: seenLevel(days) }; }) : null;
  const year = yearOf(today);
  const gapsOf = races.filter((r) => yearOf(r.date) === year).map((r) => ({ race: r, gaps: raceGaps(r) })).filter((x) => x.gaps.length)
    .sort((a, b) => b.race.date.localeCompare(a.race.date));
  const quality = gapsOf.filter((x) => x.gaps.some((g) => !SOFT_GAPS.has(g)));    // les falta provincia, disciplina o puestos
  const soft = gapsOf.filter((x) => !quality.includes(x));                         // solo km, desnivel o precio
  const signed = new Set(registrations.filter((g) => !g.suspended && g.date >= today).flatMap((g) => (g.entries || []).map((e) => e.runner_id)));
  const idle = runners.filter((r) => !signed.has(r.id)).map((r) => r.id);
  return { pendingResults, upcoming, activity, quality, soft, idle,
    counts: { results: pendingResults.reduce((n, x) => n + x.missing.length, 0), never: activity ? activity.filter((a) => a.level === 'never').length : 0,
      cold: activity ? activity.filter((a) => a.level === 'cold').length : 0, quality: quality.length, idle: idle.length } };
}

/** Texto de WhatsApp para un grupo de corredores (sin teléfonos: se pega en el chat del equipo o se reenvía). */
export function groupMessage(kind, names, extra = {}) {
  const list = names.length ? names.map((n) => `• ${n}`).join('\n') : '';
  const head = {
    results: `🏁 *${extra.race || 'Carrera'}*: falta vuestro resultado. Entrad en la app con vuestro enlace y poned el puesto (y el tiempo si lo tenéis). ¡Gracias!`,
    next: `📅 *${extra.race || 'Próxima carrera'}*${extra.when ? ` · ${extra.when}` : ''}: ¿quién se apunta? Apuntaos desde la app para que lo tengamos controlado.`,
    idle: '📅 No tenéis ninguna carrera apuntada en la app. Mirad el calendario y apuntaos a las próximas que vayáis a hacer.',
    inactive: '📲 Hace tiempo que no entráis en la app del club. Abrid vuestro enlace personal: ahí apuntáis carreras, ponéis resultados y veis el bono.',
    low: '⚠️ Vais por debajo del mínimo de carreras de la temporada. Revisad en la app (Contrato) cuántas os faltan.',
    all: extra.text || '📣 Mensaje de la dirección del CC Monzón.',
  }[kind] || extra.text || '';
  return `${head}${list ? `\n\n${list}` : ''}`;
}

// ======================================================================
//  Resumen de la dirección: datos extra para el panel de temporada
// ======================================================================

export const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const HIST_BUCKETS = [['0', 0, 0], ['1-2', 1, 2], ['3-5', 3, 5], ['6-10', 6, 10], ['11+', 11, 1e9]];
const monthOf = (iso) => Number(String(iso).slice(5, 7)) - 1;

/**
 * Cifras que completan `yearSummary` para el panel de la dirección:
 * ritmo (días de competición, media de participantes, mejor mes), reparto por día de la semana,
 * cuántos corredores han corrido (y cuántos de la plantilla no), histograma de carreras por corredor
 * y el calendario del año (una entrada por carrera, con su disciplina y participantes).
 */
export function yearInsights(year, races, runners, registrations = [], today = '') {
  const s = yearSummary(year, races, runners);
  const yr = races.filter((r) => yearOf(r.date) === year);
  const weekdays = Array(7).fill(0);
  let days = 0, multiDay = 0, withKm = 0;
  for (const r of yr) {
    const d = new Date(String(r.date).slice(0, 10) + 'T12:00:00Z');
    weekdays[(d.getUTCDay() + 6) % 7]++;
    const n = numDays(r.date, r.end_date); days += n; if (n > 1) multiDay++;
    if (Number(r.km) > 0) withKm++;
  }
  const best = s.byMonth.reduce((b, m) => (m.total > (b?.total ?? 0) ? m : b), null);
  const current = s.perRunner.filter((r) => r.current);
  const active = current.filter((r) => r.races > 0);
  const hist = HIST_BUCKETS.map(([label, lo, hi]) => ({ label, runners: current.filter((r) => r.races >= lo && r.races <= hi).length }));
  const cal = yr.map((r) => ({ id: r.id, name: r.name, date: r.date, end_date: r.end_date || null, modality: r.modality, subtype: r.subtype || '', n: (r.results || []).length,
    km: Number(r.km) > 0 ? Number(r.km) : null, elevation: elevOf(r) || null, price: priceOf(r),
    place: r.place || '', dist: distOf(r)?.km ?? null, src: distOf(r)?.src ?? null, bearing: distOf(r)?.bearing ?? null }));
  const withElev = yr.filter((r) => elevOf(r) > 0), both = yr.filter((r) => elevOf(r) > 0 && Number(r.km) > 0);
  const up = registrations.filter((g) => yearOf(g.date) === year && !g.suspended && today && g.date >= today && (g.entries || []).length);   // sin las candidatas de «Por valorar» (nadie apuntado)
  const rate = s.totals.participations ? Math.round((s.totals.podiums / s.totals.participations) * 100) : 0;
  return {
    summary: s, weekdays, days, multiDay, withKm,
    withElev: withElev.length, withPrice: s.totals.pricedRaces,
    avgElev: withElev.length ? Math.round(withElev.reduce((n, r) => n + elevOf(r), 0) / withElev.length) : 0,
    climb: both.length ? Math.round((both.reduce((n, r) => n + elevOf(r), 0) / both.reduce((n, r) => n + Number(r.km), 0)) * 10) / 10 : 0,   // metros de subida por km
    avgPart: s.totals.races ? Math.round((s.totals.participations / s.totals.races) * 10) / 10 : 0,
    avgRaceKm: withKm ? Math.round((yr.reduce((n, r) => n + (Number(r.km) > 0 ? Number(r.km) : 0), 0) / withKm) * 10) / 10 : 0,
    bestMonth: best && best.total ? { month: best.month, total: best.total } : null,
    rosterSize: current.length, activeCount: active.length, idle: current.filter((r) => !r.races), hist, cal, podiumRate: rate,
    upcoming: { races: up.length, entries: up.reduce((n, g) => n + (g.entries || []).length, 0) },
    first: yr.length ? yr[0].date : null, last: yr.length ? yr[yr.length - 1].date : null,
  };
}

// ======================================================================
//  «Por valorar»: carreras que el corredor se guarda para decidir más adelante
// ======================================================================

/** Estado de una carrera guardada: días que faltan, si ya pasó y cómo va el plazo de inscripción. */
export function watchInfo(w, today) {
  const toRace = daysBetween(today, w.date);
  const past = (w.end_date || w.date) < today;
  const toDeadline = w.deadline ? daysBetween(today, w.deadline) : null;
  const deadline = toDeadline === null ? null : toDeadline < 0 ? 'closed' : toDeadline === 0 ? 'today' : toDeadline <= 7 ? 'soon' : 'open';
  return { toRace, past, toDeadline, deadline, urgent: !past && (deadline === 'soon' || deadline === 'today') };
}
/** Marca (al principio de las notas) de una carrera guardada para el año siguiente cuya fecha aún no es oficial. */
export const WATCH_TBC = '📅 Fecha por confirmar';
export const watchTbc = (w) => String(w?.notes || '').startsWith(WATCH_TBC);
const shiftDay = (iso, n) => new Date(Date.parse(String(iso).slice(0, 10) + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/**
 * Carrera guardada → la misma para el año siguiente: 52 semanas después (así cae el mismo día de la semana), con la marca
 * «fecha por confirmar», sin el plazo de inscripción (cambia cada año) y conservando web, precio, distancia y tus notas.
 */
export function nextYearWatch(w) {
  const old = String(w.notes || '').startsWith(WATCH_TBC) ? String(w.notes).split('\n').slice(1).join('\n') : String(w.notes || '');
  const head = `${WATCH_TBC}: es la del año pasado + 52 semanas, hasta que salga la oficial.`;
  return { name: w.name, date: shiftDay(w.date, 364), end_date: w.end_date ? shiftDay(w.end_date, 364) : '', place: w.place || '', province: w.province || '', country: w.country || '',
    modality: w.modality, subtype: w.subtype || '', km: w.km ?? '', elevation: w.elevation ?? '', price: w.price ?? '', url: w.url || '', deadline: '',
    notes: (old ? `${head}\n${old}` : head).slice(0, 500) };
}
/**
 * Las carreras de ligas (data/ligas.json) se conservan de un año a otro: si la última edición de una carrera ya pasó y todavía no se ha
 * escrito la siguiente, se proyecta a la edición que viene con 52 semanas más (mismo día de la semana) y la marca `tbc` (fecha por confirmar).
 * En cuanto se escribe la edición nueva en el archivo, deja de proyectarse. Devuelve solo las proyecciones (no toca la lista original).
 */
export function projectLeagueRaces(races, today) {
  const key = (r) => normalize(r.name).replace(/\b20\d\d\b/g, '').replace(/\s+/g, ' ').trim();
  const last = new Map();
  for (const r of races) {
    if (r.source !== 'LIGA' || !r.date || !r.name) continue;
    const k = key(r), cur = last.get(k);
    if (!cur || r.date > cur.date) last.set(k, r);
  }
  const out = [];
  for (const r of last.values()) {
    if ((r.end_date || r.date) >= today) continue;
    const k = Math.ceil(daysBetween(r.date, today) / 364) || 1;
    const date = shiftDay(r.date, 364 * k), year = date.slice(0, 4);
    const newYear = (t) => String(t || '').replace(/\b20\d\d\b/g, year);
    out.push({ ...r, date, end_date: r.end_date ? shiftDay(r.end_date, 364 * k) : undefined, name: newYear(r.name), league: newYear(r.league), tbc: true,
      info: `📅 Fecha por confirmar: la de la edición anterior (${r.date.split('-').reverse().join('/')}) + ${52 * k} semanas${r.info ? ' · ' + r.info : ''}` });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'es'));
}
/** Orden: primero las que aún no han pasado (por fecha, o por plazo de inscripción si se pide), luego las que ya pasaron. */
export function sortWatch(list, mode, today) {
  const rows = list.map((w) => ({ w, i: watchInfo(w, today) }));
  const byDate = (a, b) => a.w.date.localeCompare(b.w.date) || a.w.name.localeCompare(b.w.name, 'es');
  const live = rows.filter((x) => !x.i.past), old = rows.filter((x) => x.i.past).sort((a, b) => b.w.date.localeCompare(a.w.date));
  if (mode === 'deadline') {
    const open = live.filter((x) => x.i.toDeadline !== null && x.i.toDeadline >= 0).sort((a, b) => a.i.toDeadline - b.i.toDeadline || byDate(a, b));
    const rest = live.filter((x) => !open.includes(x)).sort(byDate);
    return [...open, ...rest, ...old];
  }
  return [...live.sort(byDate), ...old];
}
/** ¿Ya existe esa carrera como inscripción del club? (mismo día y nombre parecido) */
export function watchMatch(w, registrations) {
  const days = new Set(daysOf(w.date, w.end_date));
  const same = registrations.filter((g) => !g.suspended && (days.has(g.date) || g.date === w.date));
  return searchRaces(w.name, same, 1)[0] || null;
}

// ======================================================================
//  Modalidad → disciplina: dos niveles que no se mezclan en las estadísticas
// ======================================================================

/** Nombre de una disciplina dentro de su modalidad: «XCO», «Sin formato» (si la modalidad tiene formatos y no se indicó) o la propia modalidad si no los tiene (Gravel…). */
export const subLabel = (modality, subtype) => (subtype ? subtype : SUBTYPES[modality] ? 'Sin formato' : modality);
/** Nombre completo para listas planas: «BTT · XCO», «BTT · sin formato», «Gravel». Nunca «BTT» a secas si BTT tiene formatos. */
export const fullLabel = (modality, subtype) => (subtype ? `${modality} · ${subtype}` : SUBTYPES[modality] ? `${modality} · sin formato` : modality);
/**
 * Árbol de modalidades con sus disciplinas (BTT → XCO, XCM…; Carretera → Critérium, Ciclodeportiva…) a partir de `yearSummary`.
 * Cada modalidad lleva sus totales; las disciplinas (solo si la modalidad tiene formatos) quedan DENTRO, nunca al mismo nivel.
 */
export function modalityTree(s) {
  return s.byModality.filter((m) => m.races > 0).map((m) => {
    const kids = SUBTYPES[m.modality] ? s.disciplines.filter((d) => d.modality === m.modality) : [];
    const order = (d) => (d.subtype ? 0 : 1);
    return { ...m, children: kids.map((d) => ({ ...d, label: subLabel(d.modality, d.subtype) })).sort((a, b) => order(a) - order(b) || b.races - a.races || a.label.localeCompare(b.label, 'es')) };
  }).sort((a, b) => b.races - a.races || a.modality.localeCompare(b.modality, 'es'));
}

/**
 * Historial visual de inscripciones del equipo: las últimas inscripciones (más recientes primero), el número por semana
 * (las últimas `weeks` semanas, de lunes a domingo; la última barra es la semana en curso) y la tendencia
 * (inscripciones de las últimas 4 semanas frente a las 4 anteriores).
 */
export function teamMoves(moves, now = new Date(), weeks = 8) {
  const DAY = 864e5, t0 = now.getTime();
  const sod = (ts) => { const d = new Date(ts); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
  const monday = (ts) => sod(ts) - ((new Date(ts).getUTCDay() + 6) % 7) * DAY;
  const list = (moves || []).map((m) => ({ ...m, ts: Date.parse(m?.at) })).filter((m) => Number.isFinite(m.ts) && m.ts <= t0 + DAY)
    .sort((a, b) => b.ts - a.ts).map((m) => ({ ...m, ago: Math.max(0, Math.round((sod(t0) - sod(m.ts)) / DAY)) }));
  const last = monday(t0);
  const bars = Array.from({ length: weeks }, (_, i) => ({ start: last - (weeks - 1 - i) * 7 * DAY, n: 0 }));
  for (const m of list) { const b = bars.find((x) => m.ts >= x.start && m.ts < x.start + 7 * DAY); if (b) b.n++; }
  const recent = bars.slice(-4).reduce((n, b) => n + b.n, 0), before = bars.slice(-8, -4).reduce((n, b) => n + b.n, 0);
  return { list, bars, total: bars.reduce((n, b) => n + b.n, 0), recent, before, trend: recent - before };
}

/**
 * «Estar al día» del corredor: lo que le falta por hacer (resultados sin poner, crónicas sin pasar y pagos de inscripciones
 * que ya tocan), lo siguiente más urgente y la racha de carreras seguidas con todo hecho.
 *  · `d`: datos del corredor (me, registrations, my_results); `chronDone`: Set de crónicas pasadas por cualquiera; `year`: temporada de las crónicas.
 *  · Pagos: solo cuentan si la carrera es dentro de `payDays` días (una semana), para no poner rojo por carreras lejanas.
 *  · Racha: de la carrera más reciente hacia atrás, cuántas seguidas tienen resultado y crónica. Las de la última semana
 *    sin terminar no la rompen (hay una semana de plazo); la primera más antigua sin terminar sí.
 */
export function alDia(d, chronDone, today, year = null, { payDays = 7, graceDays = 7 } = {}) {
  const me = d.me?.id, diff = (a, b) => Math.round((Date.parse(String(a).slice(0, 10) + 'T12:00:00Z') - Date.parse(String(b).slice(0, 10) + 'T12:00:00Z')) / 864e5);
  const mineReg = (d.registrations || []).filter((g) => (g.entries || []).some((e) => e.runner_id === me));
  const out = [];
  for (const g of mineReg.filter((x) => x.date < today && !x.suspended && !x.my_result)) out.push({ type: 'result', id: g.id, kind: 'reg', name: g.name, date: g.date, age: diff(today, g.end_date || g.date) });
  for (const r of (d.my_results || []).filter((x) => !x.position)) out.push({ type: 'result', id: r.race_id, kind: 'race', name: r.name, date: r.date, age: diff(today, r.end_date || r.date) });
  const status = chronDone instanceof Set ? chronicleStatus(d, chronDone, today, year) : { pending: [] };
  for (const x of status.pending) out.push({ type: 'cron', id: x.id, kind: x.kind, name: x.name, date: x.date, age: diff(today, x.end_date || x.date) });
  for (const g of mineReg.filter((x) => x.date >= today && !x.suspended)) {
    const e = g.entries.find((y) => y.runner_id === me), n = diff(g.date, today);
    if (e && !e.paid && n <= payDays) out.push({ type: 'pay', id: g.id, kind: 'reg', name: g.name, date: g.date, in: n });
  }
  const counts = { result: out.filter((x) => x.type === 'result').length, cron: out.filter((x) => x.type === 'cron').length, pay: out.filter((x) => x.type === 'pay').length };
  // lo siguiente: primero lo que ya se ha pasado (la más antigua primero), luego los pagos más cercanos
  const rank = { result: 0, cron: 1, pay: 2 };
  const next = [...out].sort((a, b) => rank[a.type] - rank[b.type] || (a.type === 'pay' ? a.in - b.in : b.age - a.age))[0] || null;
  // racha
  const all = chronicleStatus(d, chronDone instanceof Set ? chronDone : new Set(), today, null);
  const items = [...all.pending, ...all.done].map((x) => {
    const hasResult = x.kind === 'race' ? !!(d.my_results || []).find((r) => r.race_id === x.id)?.position : !!(d.registrations || []).find((g) => g.id === x.id)?.my_result;
    return { date: x.end_date || x.date, complete: hasResult && !!chronDone?.has?.(x.key) };
  }).sort((a, b) => b.date.localeCompare(a.date));
  const streak = streakCount(items, today, graceDays);
  return { counts, total: counts.result + counts.cron + counts.pay, items: out, next, streak };
}

/** Racha: de la carrera más reciente hacia atrás, cuántas seguidas están completas. `items`: [{ date (último día), complete }]. Las de los últimos `graceDays` días sin terminar no la rompen. */
export function streakCount(items, today, graceDays = 7) {
  const diff = (a, b) => Math.round((Date.parse(String(a).slice(0, 10) + 'T12:00:00Z') - Date.parse(String(b).slice(0, 10) + 'T12:00:00Z')) / 864e5);
  let n = 0;
  for (const it of [...items].sort((a, b) => b.date.localeCompare(a.date))) {
    if (it.complete) { n++; continue; }
    if (diff(today, it.date) <= graceDays) continue;
    break;
  }
  return n;
}
