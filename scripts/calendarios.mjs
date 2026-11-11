#!/usr/bin/env node
// Lee los calendarios públicos de la Federació Catalana de Ciclisme (FCC) y de la
// Federación Aragonesa de Ciclismo (FAC) y los guarda en data/calendarios.json.
// Lo ejecuta GitHub cada semana (.github/workflows/calendarios.yml).
//
//   node scripts/calendarios.mjs                 # descarga y escribe data/calendarios.json
//   node scripts/calendarios.mjs --html DIR      # usa DIR/fcc-*.html y DIR/fac.html (pruebas)
//
// Si una web cambia de formato o no responde, se conservan sus carreras de la
// última lectura buena y se avisa en «errors»: nunca se vacía el archivo por un fallo.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'calendarios.json');
const FCC = 'https://www.ciclisme.cat';
const FCC_LIST = `${FCC}/calendari/tot`;
const FAC = 'https://aragonciclismo.com';
const FAC_LIST = `${FAC}/es/smartweb/seccion/seccion/aragon/CALENDARIO_GLOBAL`;
const UA = 'Mozilla/5.0 (compatible; calendario-club-ciclista/1.0)';

// ---------- utilidades ----------

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export const text = (h) => String(h ?? '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENT[e.toLowerCase()] ?? m;
  })
  .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');

const LOWER = new Set(['de', 'del', 'dels', 'la', 'las', 'los', 'el', 'els', 'y', 'i', 'en', 'les', 'al', 'a']);
const ACRONYMS = new Set(['CX', 'BTT', 'BMX', 'XCO', 'XCM', 'XC', 'MTB', 'DH', 'DHI', 'EC', 'CC', 'CD', 'CE', 'UCI', 'FCC', 'RFEC', 'C1', 'C2']);
const ROMAN = /^(?=[IVXLC]+$)C{0,3}(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
/**
 * «MATARÓ» → «Mataró», «LOS FAYOS» → «Los Fayos», «V TROFEO CX» → «V Trofeo CX».
 * Lo que ya viene en mayúsculas y minúsculas se respeta (solo se pone mayúscula inicial).
 */
export function niceCase(s) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return t;
  if (t !== t.toUpperCase()) return t[0].toUpperCase() + t.slice(1);
  return t.split(' ').map((w, i) => {
    const bare = w.replace(/[^\p{L}\p{N}]/gu, '');
    if (ACRONYMS.has(bare) || (bare.length > 0 && ROMAN.test(bare) && bare !== 'DI' && bare !== 'MI')) return w;
    const lw = w.toLowerCase();
    if (i > 0 && LOWER.has(lw)) return lw;
    return lw.replace(/(^|[-'(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  }).join(' ');
}
/** «Franqueses del Vallès, Les» → «Les Franqueses del Vallès». */
const fixArticle = (s) => s.replace(/^(.*),\s*(El|La|Les|Els|L'|Los|Las)$/i, (m, a, b) => `${b} ${a}`.replace("' ", "'"));

const MOD_MAP = [
  [/^carretera|^ruta/i, 'Carretera'], [/^btt|^mtb|^xc|^xco|^maraton|^marató/i, 'BTT'], [/gravel/i, 'Gravel'],
  [/^ciclocr/i, 'Ciclocross'], [/^pista/i, 'Pista'],
];
export const mapModality = (s) => (MOD_MAP.find(([re]) => re.test(String(s).trim())) || [null, 'Otra'])[1];

const COUNTRY_BY_PROV = { 'FRANÇA': 'Francia', 'FRANCIA': 'Francia', 'ANDORRA': 'Andorra' };

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es,ca' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

// ---------- Federació Catalana ----------

export function parseFcc(html) {
  const out = [];
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1] || '';
  for (const row of tbody.split(/<tr[\s>]/i).slice(1)) {
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (tds.length < 4) continue;
    const date = (tds[0].match(/content="(\d{4}-\d{2}-\d{2})/) || [])[1];
    const a = tds[1].match(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!date || !a) continue;
    const [town = '', prov = ''] = text(tds[2]).split('\n');
    const [modality = '', sub = ''] = text(tds[3]).split('\n');
    const champs = [...tds[1].matchAll(/<li><a[^>]*>([\s\S]*?)<\/a><\/li>/gi)].map((m) => text(m[1]));
    const country = COUNTRY_BY_PROV[prov.toUpperCase()] || 'España';
    out.push({
      source: 'FCC', date, name: niceCase(text(a[2])),
      place: fixArticle(niceCase(town)), province: country === 'España' && !/^altres$/i.test(prov) ? niceCase(prov) : '',
      country, modality: mapModality(modality) === 'Otra' ? mapModality(sub) : mapModality(modality), discipline: [modality, sub].filter(Boolean).join(' · '),
      kind: /span-comp oci/.test(tds[4] || '') ? 'Ocio' : 'Competición',
      info: champs.join(' · '), url: FCC + a[1],
    });
  }
  return out;
}

const fccLastPage = (html) => Number((html.match(/pager-last[\s\S]*?\?page=(\d+)/) || [])[1] || 0);

async function fetchFcc() {
  const first = await get(FCC_LIST);
  const pages = [first];
  const last = Math.min(fccLastPage(first), 40);
  for (let p = 1; p <= last; p++) pages.push(await get(`${FCC_LIST}?page=${p}`));
  return pages;
}

// ---------- Federación Aragonesa ----------

/** Fecha local (Madrid) de una marca de tiempo Unix. */
const madridDate = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date(Number(ts) * 1000));

export function parseFac(html) {
  const out = [];
  const links = new Map([...html.matchAll(/inscripciones\/prueba\/(\d+)-[^"']*/g)].map((m) => [m[1], `${FAC}/index.php/smartweb/${m[0]}`]));
  const seen = new Set();
  for (const row of html.split(/<tr[\s>]/i).slice(1)) {
    const id = (row.match(/data-target="#prueba(\d+)"[^>]*class="td-calendario"/) || [])[1];
    if (!id || seen.has(id)) continue;
    const cells = [...row.matchAll(/<td[^>]*class="td-calendario"[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    const ts = (cells[0]?.match(/display:none;">\s*(\d{9,11})\s*</) || [])[1];
    if (!ts || cells.length < 7) continue;
    seen.add(id);
    const t = cells.map(text);
    const withCats = cells.length >= 8;
    const [modality, cats, , name, placeProv, club, obs] = withCats ? t.slice(1) : [t[1], '', ...t.slice(2)];
    const m = placeProv.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    out.push({
      source: 'FAC', date: madridDate(ts), name: niceCase(name),
      place: niceCase(m ? m[1] : placeProv), province: m ? niceCase(m[2]) : '', country: 'España',
      modality: mapModality(modality), discipline: modality,
      kind: 'Competición', info: [obs, club, cats].filter(Boolean).join(' · '),
      url: links.get(id) || FAC_LIST,
    });
  }
  return out;
}

// ---------- programa principal ----------

async function previous() {
  try { return JSON.parse(await readFile(OUT, 'utf8')); } catch { return { races: [] }; }
}

async function main() {
  const args = process.argv.slice(2);
  const dir = args[args.indexOf('--html') + 1];
  const local = args.includes('--html');
  const prev = await previous();
  const errors = [];
  const sources = {
    FCC: async () => (local
      ? await Promise.all((await readdir(dir)).filter((f) => /^fcc.*\.html$/.test(f)).sort().map((f) => readFile(join(dir, f), 'utf8')))
      : await fetchFcc()).flatMap(parseFcc),
    FAC: async () => parseFac(local ? await readFile(join(dir, 'fac.html'), 'utf8') : await get(FAC_LIST)),
  };
  const today = new Date().toISOString().slice(0, 10);
  let races = [];
  for (const [name, load] of Object.entries(sources)) {
    let got = [];
    try { got = await load(); } catch (e) { errors.push(`${name}: ${e.message}`); }
    if (!got.length) {
      const kept = prev.races.filter((r) => r.source === name && r.date >= today);
      if (!errors.some((e) => e.startsWith(name))) errors.push(`${name}: no se ha encontrado ninguna carrera (¿ha cambiado la web?)`);
      got = kept;
    }
    races.push(...got);
  }
  const key = (r) => `${r.source}|${r.date}|${r.name}`;
  races = [...new Map(races.map((r) => [key(r), r])).values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'es'));
  const data = { updated_at: new Date().toISOString(), sources: { FCC: FCC_LIST, FAC: FAC_LIST }, errors, races };
  await mkdir(dirname(OUT), { recursive: true });
  // Solo reescribe si cambian las carreras o los errores (así no hay commits vacíos cada semana).
  const same = JSON.stringify(prev.races) === JSON.stringify(races) && JSON.stringify(prev.errors) === JSON.stringify(errors);
  if (!same) await writeFile(OUT, JSON.stringify(data, null, 1) + '\n');
  console.log(`${races.length} carreras (FCC ${races.filter((r) => r.source === 'FCC').length}, FAC ${races.filter((r) => r.source === 'FAC').length})${same ? ', sin cambios' : ''}`);
  for (const e of errors) console.warn('AVISO', e);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
