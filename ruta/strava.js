// Conexión con Strava para Planificar ruta. El secreto vive en la Edge Function «strava» de Supabase
// (supabase/functions/strava); aquí solo está el Client ID, que es público.
import { CONFIG } from '../js/config.js';

// Client ID de la app de Strava (strava.com/settings/api). Vacío = no se muestra el botón de Strava.
export const STRAVA_CLIENT_ID = '';
const FN = CONFIG.SUPABASE_URL ? `${CONFIG.SUPABASE_URL}/functions/v1/strava` : '';
export const stravaReady = () => !!(STRAVA_CLIENT_ID && FN);

const K_TOK = 'ruta-strava', K_STATE = 'ruta-strava-state';
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } },
};

/** Sesión guardada en este dispositivo: { access_token, refresh_token, expires_at, athlete } o null. */
export const session = () => store.get(K_TOK);
const redirectUri = () => `${location.origin}${location.pathname}`;

/** Lleva al usuario a Strava para que autorice. Vuelve a esta misma página con ?code=… */
export function connect() {
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  try { sessionStorage.setItem(K_STATE, state); } catch { /* sin almacenamiento */ }
  const q = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID, redirect_uri: redirectUri(), response_type: 'code',
    approval_prompt: 'auto', scope: 'read,read_all,activity:read_all', state,
  });
  location.assign(`https://www.strava.com/oauth/mobile/authorize?${q}`);
}

async function call(body) {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: CONFIG.SUPABASE_KEY },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* respuesta vacía */ }
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * Al cargar la página: si venimos de Strava con ?code=…, se cambia por los tokens y se limpia la URL.
 * Devuelve 'connected', 'denied', 'error:<mensaje>' o null si no venía de Strava.
 */
export async function handleRedirect() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return null;
  history.replaceState(null, '', location.pathname + location.hash);
  if (q.get('error')) return 'denied';
  let expected = null;
  try { expected = sessionStorage.getItem(K_STATE); sessionStorage.removeItem(K_STATE); } catch { /* sin almacenamiento */ }
  if (expected && q.get('state') !== expected) return 'error:la respuesta de Strava no coincide; vuelve a intentarlo';
  try {
    const t = await call({ action: 'token', code: q.get('code') });
    store.set(K_TOK, { ...t, scope: q.get('scope') || '' });
    return 'connected';
  } catch (e) { return `error:${e.message}`; }
}

async function token() {
  const s = session();
  if (!s) throw Object.assign(new Error('No has conectado Strava'), { status: 401 });
  if (s.expires_at * 1000 > Date.now() + 60000) return s.access_token;
  const t = await call({ action: 'refresh', refresh_token: s.refresh_token });
  store.set(K_TOK, { ...s, ...t, athlete: s.athlete });
  return t.access_token;
}

/** GET a la API de Strava (a través de la función). Si el permiso se ha retirado, se olvida la sesión. */
export async function get(path) {
  try { return await call({ action: 'get', path, token: await token() }); }
  catch (e) { if (e.status === 401) store.del(K_TOK); throw e; }
}

export async function disconnect() {
  const s = session();
  store.del(K_TOK);
  if (s) try { await call({ action: 'deauth', token: s.access_token }); } catch { /* ya está desconectado en este móvil */ }
}

const PER_PAGE = 50;
/** Una página de la lista elegida: 'routes', 'activities' o 'segments'. Devuelve elementos ya normalizados. */
/** `items`: los de esta página con recorrido; `last`: true si ya no hay más páginas. */
export async function listPage(kind, page) {
  const path = kind === 'routes' ? `/athletes/${session()?.athlete?.id}/routes`
    : kind === 'segments' ? '/segments/starred' : '/athlete/activities';
  const raw = await get(`${path}?page=${page}&per_page=${PER_PAGE}`);
  return { items: raw.map((r) => toItem(kind, r)).filter((x) => x.hasMap), last: raw.length < PER_PAGE };
}

/** Elemento de la lista con lo que se enseña: nombre, distancia (m), desnivel (m), fecha y si tiene recorrido GPS. */
export function toItem(kind, r) {
  if (kind === 'routes') return { kind, id: r.id_str || String(r.id), name: r.name || 'Ruta sin nombre', distance: r.distance, gain: r.elevation_gain, date: r.created_at, hasMap: true, url: `https://www.strava.com/routes/${r.id_str || r.id}` };
  if (kind === 'segments') return { kind, id: String(r.id), name: r.name || 'Segmento', distance: r.distance, gain: Math.max(0, (r.elevation_high ?? 0) - (r.elevation_low ?? 0)), date: null, hasMap: true, url: `https://www.strava.com/segments/${r.id}`, extra: r.average_grade !== undefined ? `${r.average_grade} %` : '' };
  return { kind, id: String(r.id), name: r.name || 'Actividad', distance: r.distance, gain: r.total_elevation_gain, date: r.start_date_local || r.start_date, hasMap: !!(r.map?.summary_polyline || r.start_latlng?.length), url: `https://www.strava.com/activities/${r.id}`, extra: r.sport_type || r.type || '' };
}

/** Trae el recorrido (lat, lon, altitud) de un elemento. */
export async function loadTrack(item) {
  const path = item.kind === 'routes' ? `/routes/${item.id}/streams`
    : `/${item.kind}/${item.id}/streams?keys=latlng,altitude&key_by_type=true`;
  return streamsToPoints(await get(path));
}

/** Los «streams» de Strava llegan como lista [{type, data}] o como objeto {latlng: {data}}: se pasan a puntos. */
export function streamsToPoints(streams) {
  const by = {};
  if (Array.isArray(streams)) for (const s of streams) by[s.type] = s.data;
  else for (const [k, v] of Object.entries(streams || {})) by[k] = v?.data;
  const ll = by.latlng || [];
  const alt = by.altitude || [];
  return ll.map(([lat, lon], i) => ({ lat, lon, ele: Number.isFinite(alt[i]) ? alt[i] : null }));
}

/** Búsqueda sin tildes ni mayúsculas: todas las palabras tienen que estar en el nombre. */
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const matches = (q, name) => { const w = norm(q).split(/\s+/).filter(Boolean); const n = norm(name); return w.every((x) => n.includes(x)); };
