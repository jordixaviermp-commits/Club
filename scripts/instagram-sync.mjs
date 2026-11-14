#!/usr/bin/env node
// Captura de estadísticas de Instagram → ig_snapshots (Supabase). Se ejecuta a diario con GitHub Actions
// (.github/workflows/instagram.yml). Sin dependencias. Detalles y puesta en marcha: docs/instagram-api.md
//
//   node scripts/instagram-sync.mjs                 captura normal (últimos 3 días + publicaciones de los últimos 45 días)
//   node scripts/instagram-sync.mjs --dias 90       rellena hasta 90 días hacia atrás (Meta guarda 90)
//   node scripts/instagram-sync.mjs --historico     además, todas las publicaciones de la cuenta
//   node scripts/instagram-sync.mjs --prueba        no guarda nada: enseña lo que guardaría (resumen, sin datos personales)
//
// Variables: IG_SAVE_TOKEN (obligatoria, la clave de ig_save), IG_API_VERSION (opcional).
// El token de Instagram NO se imprime nunca: vive en la tabla ig_token_store y se renueva aquí.
import { readFile } from 'node:fs/promises';
import { unixDay, daysBefore, parseTotals, parseSeries, dayData, demographics, onlineHours, mediaData } from './instagram-lib.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const DIAS = Math.min(90, Math.max(1, Number(val('--dias', 3)) || 3));
const HISTORICO = flag('--historico'), PRUEBA = flag('--prueba');
const V = process.env.IG_API_VERSION || 'v27.0';
const HOST = process.env.IG_HOST_OVERRIDE || 'https://graph.instagram.com';   // solo para las pruebas
const SAVE_TOKEN = process.env.IG_SAVE_TOKEN || '';
const warns = [];
const warn = (m) => { warns.push(m); console.log('  ⚠️ ' + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

const cfg = await readFile(new URL('../js/config.js', import.meta.url), 'utf8');
const SB_URL = process.env.SB_URL_OVERRIDE || /SUPABASE_URL:\s*'([^']+)'/.exec(cfg)?.[1], SB_KEY = /SUPABASE_KEY:\s*'([^']+)'/.exec(cfg)?.[1];
if (!SB_URL || !SB_KEY) { console.error('No encuentro SUPABASE_URL / SUPABASE_KEY en js/config.js'); process.exit(1); }
if (!SAVE_TOKEN) { console.error('Falta el secreto IG_SAVE_TOKEN (ver docs/instagram-api.md, paso 5).'); process.exit(1); }

async function rpc(name, body) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'x-ig-token': SAVE_TOKEN }, body: JSON.stringify(body || {}) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${name}: ${r.status} ${t.slice(0, 200)}`);
  try { return JSON.parse(t); } catch { return t; }
}

let TOKEN = '';
/** Llamada a la API de Instagram. El mensaje de error nunca incluye el token. */
async function ig(path, params = {}, full = false) {
  const url = full ? path : `${HOST}/${V}/${path}?${new URLSearchParams({ ...params, access_token: TOKEN })}`;
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${j.error?.message || 'error ' + r.status}`.replace(/access_token=[^&\s]+/g, 'access_token=…').slice(0, 220));
  return j;
}

/** Pide varias métricas juntas; si alguna no existe/falla, las pide una a una para quedarse con las que sí valen. */
async function metrics(id, list, params) {
  try { return await ig(`${id}/insights`, { metric: list.join(','), ...params }); }
  catch (e) {
    if (list.length === 1) { warn(`${list[0]}: ${e.message}`); return { data: [] }; }
    const data = [];
    for (const m of list) { try { data.push(...(await ig(`${id}/insights`, { metric: m, ...params })).data); } catch (e2) { warn(`${m}: ${e2.message}`); } await sleep(120); }
    return { data };
  }
}

// ---------- 1. token de Instagram (se guarda y se renueva en la base) ----------
TOKEN = await rpc('ig_token_get').catch((e) => { console.error('No puedo leer el token de Instagram: ' + e.message + '\n¿Has ejecutado el SQL 2026-11-14-instagram-api.sql y guardado el token? (docs/instagram-api.md)'); process.exit(1); });
if (!TOKEN) { console.error('Todavía no hay token de Instagram guardado (docs/instagram-api.md, paso 4).'); process.exit(1); }
if (!PRUEBA) {
  try {   // renovar a diario: Meta solo lo permite si el token tiene más de 24 h; si no, seguimos con el actual
    const r = await ig(`${HOST}/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: TOKEN })}`, {}, true);
    if (r.access_token && r.access_token !== TOKEN) { await rpc('ig_token_set', { p_token: r.access_token }); TOKEN = r.access_token; console.log(`Token renovado (caduca en ~${Math.round((r.expires_in || 0) / 86400)} días).`); }
  } catch (e) { console.log('Token sin renovar hoy: ' + e.message); }
}

const rows = [];
const add = (kind, key, data) => { if (Object.keys(data).length) rows.push({ kind, key: String(key), data }); };

// ---------- 2. cuenta ----------
const me = await ig('me', { fields: 'user_id,username,followers_count,follows_count,media_count' }).catch((e) => { console.error('La API de Instagram rechaza el token: ' + e.message); process.exit(1); });
const UID = me.user_id || me.id;
console.log(`Cuenta conectada: ${me.username} (${me.followers_count} seguidores)`);
add('account', today, { followers: me.followers_count, following: me.follows_count, media: me.media_count });

// ---------- 3. días ----------
for (let i = 1; i <= DIAS; i++) {   // ayer y anteriores: el día en curso aún no está cerrado
  const d = daysBefore(today, i), since = unixDay(d), until = since + 86400, base = { metric_type: 'total_value', period: 'day', since, until };
  const q = async (list, extra = {}) => parseTotals(await metrics(UID, list, { ...base, ...extra }));
  const plain = await q(['views', 'reach', 'accounts_engaged', 'total_interactions', 'likes', 'comments', 'shares', 'saves', 'reposts', 'replies', 'profile_links_taps']);
  const viewsFollow = await q(['views'], { breakdown: 'follow_type' });
  const viewsProduct = await q(['views'], { breakdown: 'media_product_type' });
  const reachFollow = await q(['reach'], { breakdown: 'follow_type' });
  const follows = await q(['follows_and_unfollows'], { breakdown: 'follow_type' });
  add('day', d, dayData({ plain, viewsFollow, viewsProduct, reachFollow, follows }));
  await sleep(200);
}
// nuevos seguidores por día (serie de hasta 30 días)
try {
  const s = parseSeries(await ig(`${UID}/insights`, { metric: 'follower_count', period: 'day', since: unixDay(daysBefore(today, Math.min(DIAS, 30))), until: unixDay(today) }));
  for (const p of s.follower_count || []) if (p.date) { const k = daysBefore(p.date, 1); const r = rows.find((x) => x.kind === 'day' && x.key === k); if (r && typeof p.value === 'number') r.data.follows = p.value; }
} catch (e) { warn('follower_count: ' + e.message); }

// ---------- 4. publicaciones ----------
const sinceMedia = daysBefore(today, HISTORICO ? 4000 : 45);
let mediaN = 0;
try {
  let page = await ig(`${UID}/media`, { fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count', limit: 50 });
  loop: for (;;) {
    for (const it of page.data || []) {
      if (String(it.timestamp).slice(0, 10) < sinceMedia) break loop;
      const set = it.media_product_type === 'REELS'
        ? ['views', 'reach', 'saved', 'shares', 'total_interactions', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time']
        : ['views', 'reach', 'saved', 'shares', 'total_interactions', 'profile_visits', 'follows'];
      add('media', it.id, mediaData(it, await metrics(it.id, set, {}))); mediaN++;
      await sleep(150);
    }
    if (!page.paging?.next) break;
    page = await ig(page.paging.next, {}, true);
  }
} catch (e) { warn('publicaciones: ' + e.message); }
console.log(`Publicaciones leídas: ${mediaN}`);

// ---------- 5. historias (solo viven 24 h) ----------
try {
  const st = await ig(`${UID}/stories`, { fields: 'id,timestamp' });
  for (const it of st.data || []) {
    const ins = await metrics(it.id, ['views', 'reach', 'replies', 'shares', 'total_interactions'], {});
    const d = mediaData({ timestamp: it.timestamp }, ins);
    try {
      const nav = parseTotals(await ig(`${it.id}/insights`, { metric: 'navigation', breakdown: 'story_navigation_action_type', metric_type: 'total_value' })).navigation?.by || {};
      for (const [k, to] of Object.entries({ tap_forward: 'taps_fwd', tap_back: 'taps_back', tap_exit: 'exits', swipe_forward: 'swipe_fwd' })) if (typeof nav[k] === 'number') d[to] = nav[k];
    } catch { /* la navegación es opcional */ }
    add('story', it.id, d);
  }
  console.log(`Historias vivas: ${(st.data || []).length}`);
} catch (e) { warn('historias: ' + e.message); }

// ---------- 6. audiencia ----------
try {
  const A = { timeframe: 'this_month', metric_type: 'total_value', period: 'lifetime' };
  const aud = {};
  const dem = async (metric, breakdown) => demographics(await ig(`${UID}/insights`, { metric, breakdown, ...A }));
  for (const [k, metric, br] of [['gender_age', 'follower_demographics', 'age,gender'], ['city', 'follower_demographics', 'city'], ['country', 'follower_demographics', 'country'],
    ['engaged_gender_age', 'engaged_audience_demographics', 'age,gender'], ['engaged_city', 'engaged_audience_demographics', 'city'], ['engaged_country', 'engaged_audience_demographics', 'country']]) {
    try { const v = await dem(metric, br); if (Object.keys(v).length) aud[k] = v; } catch (e) { warn(`${metric} (${br}): ${e.message}`); }
    await sleep(150);
  }
  try { const h = onlineHours(await ig(`${UID}/insights`, { metric: 'online_followers', period: 'lifetime' })); if (h) aud.online_hours = h; } catch (e) { warn('online_followers: ' + e.message); }
  add('audience', today, aud);
} catch (e) { warn('audiencia: ' + e.message); }

// ---------- 7. guardar ----------
const count = (k) => rows.filter((r) => r.kind === k).length;
console.log(`Filas preparadas: ${rows.length} (días ${count('day')}, publicaciones ${count('media')}, historias ${count('story')}, cuenta ${count('account')}, audiencia ${count('audience')})`);
if (PRUEBA) {
  const sample = rows.find((r) => r.kind === 'day');
  console.log('PRUEBA: no se guarda nada. Campos de un día:', sample ? Object.keys(sample.data).join(', ') : '(ninguno)');
  console.log('Campos de audiencia:', Object.keys(rows.find((r) => r.kind === 'audience')?.data || {}).join(', ') || '(ninguno)');
} else {
  let saved = 0;
  for (let i = 0; i < rows.length; i += 200) saved += Number(await rpc('ig_save', { p_rows: rows.slice(i, i + 200) }));
  console.log(`Filas guardadas en la base: ${saved}`);
  if (!saved) { console.error('No se guardó nada.'); process.exit(1); }
}
console.log(warns.length ? `Terminado con ${warns.length} aviso(s).` : 'ESTADÍSTICAS GUARDADAS: ok');
