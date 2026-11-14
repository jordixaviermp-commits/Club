import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { parseTotals, dayData, demographics, onlineHours, mediaData, titleOf, unixDay, daysBefore } from '../scripts/instagram-lib.mjs';

const total = (name, value, breakdown) => ({ name, period: 'day', total_value: { value, ...(breakdown ? { breakdowns: [{ dimension_keys: ['follow_type'], results: Object.entries(breakdown).map(([k, v]) => ({ dimension_values: [k], value: v })) }] } : {}) } });

test('fechas y títulos', () => {
  assert.equal(unixDay('2026-11-14'), Date.UTC(2026, 10, 14) / 1000);
  assert.equal(daysBefore('2026-11-01', 1), '2026-10-31');
  assert.equal(titleOf('\n  Hola mundo \nsegunda línea'), 'Hola mundo');
  assert.equal(titleOf('x'.repeat(200)).length, 90);
  assert.equal(titleOf(null), '');
});

test('un día: métricas simples, seguidores/no seguidores, tipo de contenido y altas/bajas', () => {
  const plain = parseTotals({ data: [total('views', 870), total('reach', 360), total('total_interactions', 21), total('accounts_engaged', 14), total('profile_links_taps', 0)] });
  const viewsFollow = parseTotals({ data: [total('views', 870, { FOLLOWER: 492, NON_FOLLOWER: 378 })] });
  const viewsProduct = parseTotals({ data: [{ name: 'views', total_value: { value: 870, breakdowns: [{ dimension_keys: ['media_product_type'], results: [{ dimension_values: ['STORY'], value: 600 }, { dimension_values: ['POST'], value: 200 }, { dimension_values: ['CAROUSEL_CONTAINER'], value: 70 }] }] } }] });
  const d = dayData({ plain, viewsFollow, viewsProduct, follows: parseTotals({ data: [total('follows_and_unfollows', 3, { FOLLOWER: 2, NON_FOLLOWER: 1 })] }) });
  assert.deepEqual(d, { views: 870, reach: 360, engaged: 14, interactions: 21, taps: 0, views_f: 492, views_nf: 378, v_story: 600, v_feed: 270, fu_f: 2, fu_nf: 1 });
  assert.deepEqual(dayData({}), {});                          // sin respuestas no inventa nada
});

test('demografía: edad+género y una dimensión', () => {
  const two = { data: [{ name: 'follower_demographics', total_value: { breakdowns: [{ dimension_keys: ['age', 'gender'], results: [{ dimension_values: ['35-44', 'M'], value: 164 }, { dimension_values: ['F', '25-34'], value: 25 }, { dimension_values: ['65+', 'U'], value: 7 }] }] } }] };
  assert.deepEqual(demographics(two), { 'M.35-44': 164, 'F.25-34': 25, 'U.65+': 7 });
  const one = { data: [{ name: 'follower_demographics', total_value: { breakdowns: [{ dimension_keys: ['city'], results: [{ dimension_values: ['Monzón, Aragón'], value: 226 }] }] } }] };
  assert.deepEqual(demographics(one), { 'Monzón, Aragón': 226 });
});

test('horas con más seguidores conectados', () => {
  const r = { data: [{ name: 'online_followers', values: [{ value: { 0: 10, 1: 20 }, end_time: '2026-11-13T08:00:00+0000' }, { value: { 0: 30, 1: 20 } }] }] };
  assert.deepEqual(onlineHours(r), { 0: 20, 1: 20 });
  assert.equal(onlineHours({ data: [] }), null);
});

test('publicación: datos del listado + insights', () => {
  const item = { id: '1', caption: 'Título\nresto del texto con @marcas', media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED', permalink: 'https://www.instagram.com/p/x/', timestamp: '2026-10-15T06:02:33+0000', like_count: 17, comments_count: 0 };
  const ins = { data: [{ name: 'views', values: [{ value: 615 }] }, { name: 'reach', values: [{ value: 295 }] }, { name: 'saved', values: [{ value: 2 }] }, { name: 'total_interactions', values: [{ value: 18 }] }] };
  assert.deepEqual(mediaData(item, ins), { ts: item.timestamp, type: 'CAROUSEL_ALBUM', product: 'FEED', link: item.permalink, title: 'Título', likes: 17, comments: 0, views: 615, reach: 295, saves: 2, engagement: 18 });
});

// ---- el script entero contra un Instagram y un Supabase simulados ----
test('instagram-sync: renueva el token, lee la API y guarda las filas', async () => {
  const saved = [], calls = [];
  let token = 'IGAA-token-inicial-de-prueba-1234567890';
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'); let body = ''; for await (const c of req) body += c;
    const json = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    calls.push(u.pathname);
    if (u.pathname === '/rest/v1/rpc/ig_token_get') return req.headers['x-ig-token'] === 'CLAVE' ? json(token) : json({ message: 'token_no_valido' }, 403);
    if (u.pathname === '/rest/v1/rpc/ig_token_set') { token = JSON.parse(body).p_token; return json(null); }
    if (u.pathname === '/rest/v1/rpc/ig_save') { const rows = JSON.parse(body).p_rows; saved.push(...rows); return json(rows.length); }
    if (u.pathname === '/refresh_access_token') return json({ access_token: 'IGAA-token-renovado-de-prueba-0987654321', expires_in: 5184000 });
    if (u.searchParams.get('access_token') !== token) return json({ error: { message: 'Invalid OAuth access token' } }, 400);
    if (u.pathname.endsWith('/me')) return json({ user_id: '99', username: 'club', followers_count: 944, follows_count: 670, media_count: 587 });
    if (u.pathname.endsWith('/99/media')) return json({ data: [{ id: 'm1', caption: 'Primera\nresto', media_type: 'IMAGE', media_product_type: 'FEED', permalink: 'https://i/p/1', timestamp: new Date().toISOString(), like_count: 5, comments_count: 1 }] });
    if (u.pathname.endsWith('/99/stories')) return json({ data: [] });
    if (u.pathname.endsWith('/m1/insights')) return json({ data: [{ name: 'views', values: [{ value: 100 }] }, { name: 'reach', values: [{ value: 60 }] }] });
    if (u.pathname.endsWith('/99/insights')) {
      const m = (u.searchParams.get('metric') || '').split(',');
      if (m.includes('reposts')) return json({ error: { message: 'metric reposts no soportada' } }, 400);   // fuerza el reintento métrica a métrica
      if (u.searchParams.get('breakdown') === 'follow_type') return json({ data: m.map((n) => ({ name: n, total_value: { value: 10, breakdowns: [{ results: [{ dimension_values: ['FOLLOWER'], value: 6 }, { dimension_values: ['NON_FOLLOWER'], value: 4 }] }] } })) });
      if (u.searchParams.get('breakdown') === 'media_product_type') return json({ data: [{ name: 'views', total_value: { value: 10, breakdowns: [{ results: [{ dimension_values: ['STORY'], value: 10 }] }] } }] });
      if (u.searchParams.get('metric') === 'follower_count') return json({ data: [{ name: 'follower_count', values: [] }] });
      if (u.searchParams.get('timeframe')) return json({ data: [{ name: m[0], total_value: { breakdowns: [{ results: [{ dimension_values: u.searchParams.get('breakdown') === 'country' ? ['ES'] : ['25-34', 'M'], value: 3 }] }] } }] });
      if (m[0] === 'online_followers') return json({ data: [] });
      return json({ data: m.map((n) => ({ name: n, total_value: { value: 7 } })) });
    }
    json({ error: { message: 'ruta no simulada ' + u.pathname } }, 404);
  });
  srv.listen(0); await once(srv, 'listening');
  const port = srv.address().port;
  const child = spawn(process.execPath, ['scripts/instagram-sync.mjs', '--dias', '2'], { cwd: new URL('..', import.meta.url), env: { ...process.env, IG_SAVE_TOKEN: 'CLAVE', IG_HOST_OVERRIDE: `http://localhost:${port}`, SB_URL_OVERRIDE: `http://localhost:${port}` } });
  let out = ''; child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (out += d));
  const [code] = await once(child, 'close'); srv.close();
  assert.equal(code, 0, out);
  assert.ok(!out.includes('IGAA-token'), 'el token nunca se imprime');
  assert.equal(token, 'IGAA-token-renovado-de-prueba-0987654321', 'el token renovado se guarda en la base');
  const kinds = (k) => saved.filter((r) => r.kind === k);
  assert.equal(kinds('day').length, 2);
  assert.equal(kinds('day')[0].data.views, 7); assert.equal(kinds('day')[0].data.views_f, 6); assert.equal(kinds('day')[0].data.v_story, 10);
  assert.equal(kinds('media').length, 1); assert.equal(kinds('media')[0].data.title, 'Primera'); assert.equal(kinds('media')[0].data.views, 100);
  assert.equal(kinds('account')[0].data.followers, 944);
  assert.deepEqual(kinds('audience')[0].data.gender_age, { 'M.25-34': 3 }); assert.deepEqual(kinds('audience')[0].data.country, { ES: 3 });
  assert.match(out, /Filas guardadas en la base/);
});
