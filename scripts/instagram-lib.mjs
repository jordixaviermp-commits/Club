// Funciones puras de la captura de Instagram (sin red): convierten las respuestas de la API en filas de ig_snapshots.
// Se prueban en tests/instagram-api.test.mjs. Ver docs/instagram-api.md.

/** Segundos Unix del inicio (UTC) del día AAAA-MM-DD. */
export const unixDay = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 1000);

/** «AAAA-MM-DD» de n días antes de la fecha dada. */
export function daysBefore(iso, n) {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Primera línea del texto de una publicación, máximo 90 caracteres (nunca el texto completo). */
export function titleOf(caption) {
  const first = String(caption || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
  return first.length <= 90 ? first : first.slice(0, 89).trimEnd() + '…';
}

/** Respuesta con total_value → { métrica: { total, by: { 'FOLLOWER': n, … } } }. */
export function parseTotals(resp) {
  const out = {};
  for (const m of resp?.data || []) {
    const tv = m.total_value || {};
    const by = {};
    for (const b of tv.breakdowns || []) for (const r of b.results || []) by[(r.dimension_values || []).join('|')] = r.value;
    out[m.name] = { total: typeof tv.value === 'number' ? tv.value : null, by };
  }
  return out;
}

/** Respuesta con values (series o valor de por vida) → { métrica: [ { date, value } ] }. */
export function parseSeries(resp) {
  const out = {};
  for (const m of resp?.data || []) out[m.name] = (m.values || []).map((v) => ({ date: String(v.end_time || '').slice(0, 10), value: v.value }));
  return out;
}

const put = (o, k, v) => { if (v !== null && v !== undefined && !Number.isNaN(v)) o[k] = v; };

/** Une las respuestas de un día en el objeto «data» de la fila kind=day (sin valores vacíos). */
export function dayData({ plain = {}, viewsFollow = {}, viewsProduct = {}, reachFollow = {}, follows = {} } = {}) {
  const d = {};
  const map = { views: 'views', reach: 'reach', accounts_engaged: 'engaged', total_interactions: 'interactions', likes: 'likes', comments: 'comments', shares: 'shares', saves: 'saves', reposts: 'reposts', replies: 'replies', profile_links_taps: 'taps' };
  for (const [k, to] of Object.entries(map)) put(d, to, plain[k]?.total);
  put(d, 'views_f', viewsFollow.views?.by?.FOLLOWER); put(d, 'views_nf', viewsFollow.views?.by?.NON_FOLLOWER);
  put(d, 'reach_f', reachFollow.reach?.by?.FOLLOWER); put(d, 'reach_nf', reachFollow.reach?.by?.NON_FOLLOWER);
  const vp = viewsProduct.views?.by || {};
  const sum = (...ks) => { const xs = ks.filter((k) => typeof vp[k] === 'number'); return xs.length ? xs.reduce((n, k) => n + vp[k], 0) : null; };
  put(d, 'v_story', sum('STORY')); put(d, 'v_reel', sum('REEL', 'REELS')); put(d, 'v_feed', sum('POST', 'CAROUSEL_CONTAINER', 'FEED')); put(d, 'v_ad', sum('AD'));
  // Altas y bajas tal como las da Meta (sin interpretar hasta comprobarlo): FOLLOWER / NON_FOLLOWER.
  const fu = follows.follows_and_unfollows?.by || {};
  put(d, 'fu_f', fu.FOLLOWER); put(d, 'fu_nf', fu.NON_FOLLOWER);
  return d;
}

const AGE = /^(\d{2}-\d{2}|\d{2}\+)$/;
/** Demografía → { 'F.25-34': n } si viene desglosada por edad y género; { 'Monzón, Aragón': n } si es de una sola dimensión. */
export function demographics(resp) {
  const m = Object.values(parseTotals(resp))[0];
  const out = {};
  for (const [k, v] of Object.entries(m?.by || {})) {
    const parts = k.split('|');
    if (parts.length === 2) {
      const age = parts.find((p) => AGE.test(p)), g = parts.find((p) => p !== age);
      if (age && g) out[`${String(g).toUpperCase().slice(0, 1)}.${age}`] = v;
    } else out[k] = v;
  }
  return out;
}

/** Horas con más seguidores conectados: { '0': n, … } (media si hay varios valores). */
export function onlineHours(resp) {
  const vals = (Object.values(parseSeries(resp))[0] || []).map((x) => x.value).filter((v) => v && typeof v === 'object');
  if (!vals.length) return null;
  const sum = {}, cnt = {};
  for (const o of vals) for (const [h, n] of Object.entries(o)) { sum[h] = (sum[h] || 0) + n; cnt[h] = (cnt[h] || 0) + 1; }
  return Object.fromEntries(Object.keys(sum).map((h) => [h, Math.round(sum[h] / cnt[h])]));
}

/** Fila kind=media a partir del elemento de /media y la respuesta de sus insights. */
export function mediaData(item, insightsResp) {
  const d = {};
  put(d, 'ts', item.timestamp); put(d, 'type', item.media_type); put(d, 'product', item.media_product_type); put(d, 'link', item.permalink);
  const t = titleOf(item.caption); if (t) d.title = t;
  put(d, 'likes', item.like_count); put(d, 'comments', item.comments_count);
  const get = (name) => { const s = parseSeries(insightsResp)[name]; const tot = parseTotals(insightsResp)[name]?.total; return tot ?? (s && s[0] ? s[0].value : undefined); };
  const map = { views: 'views', reach: 'reach', saved: 'saves', shares: 'shares', total_interactions: 'engagement', profile_visits: 'visits', follows: 'follows', replies: 'replies', ig_reels_avg_watch_time: 'reel_avg_ms', ig_reels_video_view_total_time: 'reel_total_ms' };
  for (const [k, to] of Object.entries(map)) { const v = get(k); if (typeof v === 'number') d[to] = v; }
  return d;
}
