// Reglas de negocio puras (sin pantalla ni red). Se prueban con `node --test tests/`.

export const CATEGORIES = ['Sub-23', 'Élite', 'M30', 'M40', 'M50', 'M60'];
export const MODALITIES = ['Carretera', 'BTT', 'Gravel', 'Ciclocross', 'Pista', 'Otra'];
export const PODIUM_TYPES = [
  { id: 'suelta', label: 'Carrera suelta' },
  { id: 'general', label: 'General de varias pruebas' },
  { id: 'campeonato', label: 'Campeonato' },
];
export const DEFAULT_COUNTRY = 'España';
export const PROVINCES = [
  'A Coruña', 'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Barcelona',
  'Bizkaia', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ceuta', 'Ciudad Real', 'Córdoba',
  'Cuenca', 'Gipuzkoa', 'Girona', 'Granada', 'Guadalajara', 'Huelva', 'Huesca', 'Illes Balears', 'Jaén',
  'La Rioja', 'Las Palmas', 'León', 'Lleida', 'Lugo', 'Madrid', 'Málaga', 'Melilla', 'Murcia', 'Navarra',
  'Ourense', 'Palencia', 'Pontevedra', 'Salamanca', 'Santa Cruz de Tenerife', 'Segovia', 'Sevilla',
  'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid', 'Zamora', 'Zaragoza',
];

export const podiumLabel = (id) => (PODIUM_TYPES.find((p) => p.id === id) || PODIUM_TYPES[0]).label;

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
    const i = line.search(/[,;\t]/);
    const name = cleanName(i < 0 ? line : line.slice(0, i));
    const catText = i < 0 ? '' : line.slice(i + 1).trim();
    if (!name) continue;
    const key = normalize(name);
    if (seen.has(key)) { duplicates.push(name); continue; }
    seen.add(key);
    const category = catText ? matchCategory(catText) : null;
    if (catText && !category) unknownCategory.push({ name, text: catText });
    toAdd.push({ name, category });
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
      keep.push({ runner: r, category: item.category && item.category !== r.category ? item.category : null });
      current.delete(normalize(item.name));
    } else add.push(item);
  }
  return { keep, add, remove: [...current.values()], duplicates, unknownCategory };
}

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
export function yearSummary(year, races, runners) {
  const yr = races.filter((r) => yearOf(r.date) === year)
    .sort((a, b) => a.date.localeCompare(b.date) || byText(a.name, b.name));
  const parts = yr.flatMap((race) => (race.results || []).map((res) => ({ race, res })));
  const podiums = parts.filter((p) => isPodium(p.res.position));
  const personKey = (res) => res.runner_id || 'n:' + normalize(res.runner_name);

  const totals = {
    races: yr.length,
    runners: new Set(parts.map((p) => personKey(p.res))).size,
    participations: parts.length,
    podiums: podiums.length,
    wins: podiums.filter((p) => p.res.position === 1).length,
  };

  const byModality = MODALITIES.map((m) => ({
    modality: m,
    races: yr.filter((r) => r.modality === m).length,
    participations: parts.filter((p) => p.race.modality === m).length,
    podiums: podiums.filter((p) => p.race.modality === m).length,
  })).filter((x) => x.modality === 'Carretera' || x.modality === 'BTT' || x.races > 0);

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
  for (const rn of runners) rows.set(rn.id, { key: rn.id, name: rn.name, current: true, races: 0, road: 0, btt: 0, p1: 0, p2: 0, p3: 0 });
  for (const { race, res } of parts) {
    const k = personKey(res);
    if (!rows.has(k)) rows.set(k, { key: k, name: res.runner_name, current: false, races: 0, road: 0, btt: 0, p1: 0, p2: 0, p3: 0 });
    const row = rows.get(k);
    row.races++;
    if (race.modality === 'Carretera') row.road++;
    if (race.modality === 'BTT') row.btt++;
    if (res.position === 1) row.p1++;
    if (res.position === 2) row.p2++;
    if (res.position === 3) row.p3++;
  }
  const perRunner = [...rows.values()].sort((a, b) => b.races - a.races || b.p1 - a.p1 || byText(a.name, b.name));

  const byPodiumType = PODIUM_TYPES.map((t) => ({
    type: t.id, label: t.label,
    podiums: podiums.filter((p) => (p.res.podium_type || 'suelta') === t.id).length,
    wins: podiums.filter((p) => (p.res.podium_type || 'suelta') === t.id && p.res.position === 1).length,
  }));

  const podiumList = podiums.map(({ race, res }) => ({
    date: race.date, race: race.name, raceId: race.id, runner: res.runner_name, category: res.category || '',
    type: res.podium_type || 'suelta', position: res.position,
  }));

  return { year, totals, byModality, countries, provinces, missingPlace, perRunner, byPodiumType, podiumList };
}

// ---------- CSV ----------

export const CSV_COLUMNS = ['Fecha', 'Carrera', 'Lugar', 'Provincia', 'País', 'Modalidad', 'Corredor',
  'Categoría', 'Puesto', 'Podio', 'Tipo de podio'];

/** Filas de exportación (una por participación). */
export function csvRows(races) {
  const sorted = [...races].sort((a, b) => a.date.localeCompare(b.date) || byText(a.name, b.name));
  const out = [];
  for (const r of sorted) {
    for (const res of [...(r.results || [])].sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999) || byText(a.runner_name, b.runner_name))) {
      const pod = isPodium(res.position);
      out.push([r.date, r.name, r.place || '', r.province || '', r.country || '', r.modality, res.runner_name,
        res.category || '', res.position ?? '', pod ? 'Sí' : 'No', pod ? podiumLabel(res.podium_type) : '']);
    }
  }
  return out;
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
    date: col('Fecha'), race: col('Carrera'), place: col('Lugar'), province: col('Provincia'),
    country: col('País', 'Pais'), modality: col('Modalidad'), runner: col('Corredor'),
    category: col('Categoría', 'Categoria'), position: col('Puesto'), type: col('Tipo de podio', 'Tipo'),
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
      races.set(key, { name, date, place: get(ix.place), province: get(ix.province),
        country: ix.country >= 0 ? get(ix.country) : DEFAULT_COUNTRY, modality, notes: '', results: [] });
    }
    const runner = get(ix.runner);
    if (!runner) return; // carrera sin participantes
    const race = races.get(key);
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
