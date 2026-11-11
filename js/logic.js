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
  const podiums = podiumsOf(parts);
  const personKey = (res) => res.runner_id || 'n:' + normalize(res.runner_name);

  const totals = {
    races: yr.length,
    runners: new Set(parts.map((p) => personKey(p.res))).size,
    participations: parts.length,
    podiums: podiums.length,
    wins: podiums.filter((p) => p.position === 1).length,
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
  }
  for (const p of podiums) {
    const row = rows.get(personKey(p.res));
    row['p' + p.position]++;
  }
  const perRunner = [...rows.values()].sort((a, b) => b.races - a.races || b.p1 - a.p1 || byText(a.name, b.name));

  const byPodiumType = [...PODIUM_TYPES, STAGE_TYPE].map((t) => ({
    type: t.id, label: t.label,
    podiums: podiums.filter((p) => p.type === t.id).length,
    wins: podiums.filter((p) => p.type === t.id && p.position === 1).length,
  }));

  const podiumList = podiums.map(({ race, res, position, type, stage }) => ({
    date: race.date, race: race.name, raceId: race.id, runner: res.runner_name, category: res.category || '',
    type, stage, position,
  }));

  return { year, totals, byModality, countries, provinces, missingPlace, perRunner, byPodiumType, podiumList };
}

// ---------- CSV ----------

export const CSV_COLUMNS = ['Fecha', 'Fecha fin', 'Carrera', 'Lugar', 'Provincia', 'País', 'Modalidad', 'Corredor',
  'Categoría', 'Puesto', 'Podio', 'Tipo de podio'];

/** Filas de exportación (una por participación). */
export function csvRows(races) {
  const sorted = [...races].sort((a, b) => a.date.localeCompare(b.date) || byText(a.name, b.name));
  const out = [];
  for (const r of sorted) {
    for (const res of [...(r.results || [])].sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999) || byText(a.runner_name, b.runner_name))) {
      const pod = isPodium(res.position);
      out.push([r.date, r.end_date || '', r.name, r.place || '', r.province || '', r.country || '', r.modality, res.runner_name,
        res.category || '', res.position ?? '', pod ? 'Sí' : 'No', pod ? podiumLabel(res.podium_type) : '']);
      (res.stage_positions || []).forEach((pos, i) => {
        if (i < (r.stages || []).length && isPodium(pos)) {
          out.push([r.date, r.end_date || '', r.name, r.place || '', r.province || '', r.country || '', r.modality, res.runner_name,
            res.category || '', pos, 'Sí', `${STAGE_TYPE.label}: ${stageName(r, i)}`]);
        }
      });
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
    date: col('Fecha'), end: col('Fecha fin'), race: col('Carrera'), place: col('Lugar'), province: col('Provincia'),
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
      const end = parseDate(get(ix.end));
      races.set(key, { name, date, end_date: end && end > date ? end : null, place: get(ix.place), province: get(ix.province),
        country: ix.country >= 0 ? get(ix.country) : DEFAULT_COUNTRY, modality, notes: '', results: [] });
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

// ---------- Bonos por carreras de la temporada ----------

/** Bono de la temporada 2026 según el contrato; los años sin configurar copian el último configurado. */
export const DEFAULT_BONUS = {
  tiers: [{ races: 12, amount: 150 }, { races: 17, amount: 200 }, { races: 22, amount: 250 }],
  minimum: 12,
  penalty: { renovado: 100, nuevo: 175 },
  nuevos: [],
};

export function bonusConfigFor(all, year) {
  const cfg = all?.[year];
  if (cfg) return { ...DEFAULT_BONUS, ...cfg, nuevos: cfg.nuevos || [] };
  const prev = Object.keys(all || {}).map(Number).filter((y) => y < year).sort((a, b) => b - a)[0];
  // de un año a otro se copian tramos, mínimo y penalizaciones, pero no quién es nuevo
  return prev ? { ...DEFAULT_BONUS, ...all[prev], nuevos: [] } : { ...DEFAULT_BONUS };
}

/** Carreras que cuentan para el bono: cada día de competición es una (una de 3 días = 3). */
export const bonusRacesOf = (race) => numDays(race.date, race.end_date);

/**
 * Situación de un corredor: { count, minimum, reachesMinimum, penalty, amount, tier, next, missingToNext, missingToMinimum }.
 * `amount` es lo que cobra con lo hecho; `penalty`, lo que pagaría si acabara la temporada así.
 */
export function bonusStatus(count, cfg, isNew) {
  const tiers = [...(cfg.tiers || [])].filter((t) => t.races > 0).sort((a, b) => a.races - b.races);
  const reached = tiers.filter((t) => count >= t.races);
  const tier = reached.at(-1) || null;
  const next = tiers.find((t) => count < t.races) || null;
  const minimum = Number(cfg.minimum) || 0;
  const reachesMinimum = count >= minimum;
  return {
    count, minimum, reachesMinimum,
    penalty: reachesMinimum ? 0 : Number(cfg.penalty?.[isNew ? 'nuevo' : 'renovado']) || 0,
    amount: tier ? tier.amount : 0,
    tier, next,
    missingToNext: next ? next.races - count : 0,
    missingToMinimum: reachesMinimum ? 0 : minimum - count,
    isNew: !!isNew,
  };
}

/** Bonos de toda la plantilla en un año, a partir de las carreras (con resultados) y las inscripciones. */
export function yearBonuses(year, races, registrations, runners, cfg) {
  const done = new Map(), planned = new Map();
  for (const r of races) if (yearOf(r.date) === year) for (const x of r.results || []) {
    if (x.runner_id) done.set(x.runner_id, (done.get(x.runner_id) || 0) + bonusRacesOf(r));
  }
  for (const g of registrations) if (yearOf(g.date) === year) for (const e of g.entries || []) {
    planned.set(e.runner_id, (planned.get(e.runner_id) || 0) + bonusRacesOf(g));
  }
  const nuevos = new Set(cfg.nuevos || []);
  return runners.map((rn) => {
    const count = done.get(rn.id) || 0;
    const plan = planned.get(rn.id) || 0;
    return { runner: rn, planned: plan, ...bonusStatus(count, cfg, nuevos.has(rn.id)), projected: bonusStatus(count + plan, cfg, nuevos.has(rn.id)) };
  }).sort((a, b) => b.count - a.count || a.runner.name.localeCompare(b.runner.name, 'es'));
}
