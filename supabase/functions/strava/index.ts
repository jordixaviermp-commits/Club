// Edge Function «strava»: puente entre la página Planificar ruta y Strava.
// Guarda el secreto de la app de Strava (que no puede estar en la web pública) y:
//   - action "token":   cambia el código de la autorización por los tokens del usuario
//   - action "refresh": renueva el token caducado (dura 6 h)
//   - action "get":     lee de la API de Strava SOLO las rutas, actividades y segmentos del propio usuario
//   - action "deauth":  desconecta la cuenta
// No guarda nada: los tokens se quedan en el móvil de cada usuario.
// Secretos (Supabase > Edge Functions > Secrets): STRAVA_CLIENT_ID y STRAVA_CLIENT_SECRET.
// Desplegar con «Verify JWT» DESACTIVADO (la llama la web sin sesión de Supabase).

const CLIENT_ID = Deno.env.get('STRAVA_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('STRAVA_CLIENT_SECRET') ?? '';
const ORIGINS = ['https://jordixaviermp-commits.github.io', 'http://localhost:8000', 'http://localhost:8765'];
// Solo lectura y solo de estos recursos
const PATHS = [
  /^\/athlete$/,
  /^\/athlete\/activities\?page=\d+&per_page=\d+$/,
  /^\/athletes\/\d+\/routes\?page=\d+&per_page=\d+$/,
  /^\/segments\/starred\?page=\d+&per_page=\d+$/,
  /^\/routes\/\d+\/streams$/,
  /^\/activities\/\d+\/streams\?keys=latlng,altitude&key_by_type=true$/,
  /^\/segments\/\d+\/streams\?keys=latlng,altitude&key_by_type=true$/,
];

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const cors = {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  if (!ORIGINS.includes(origin)) return json({ error: 'Origen no permitido' }, 403);
  if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: 'Faltan STRAVA_CLIENT_ID y STRAVA_CLIENT_SECRET en los secretos' }, 500);

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return json({ error: 'Petición no válida' }, 400); }

  try {
    if (body.action === 'token' || body.action === 'refresh') {
      const params = new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
      if (body.action === 'token') { params.set('grant_type', 'authorization_code'); params.set('code', String(body.code ?? '')); }
      else { params.set('grant_type', 'refresh_token'); params.set('refresh_token', String(body.refresh_token ?? '')); }
      const r = await fetch('https://www.strava.com/oauth/token', { method: 'POST', body: params });
      const d = await r.json();
      if (!r.ok) return json({ error: d.message ?? 'Strava no ha aceptado la autorización' }, r.status);
      return json({
        access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at,
        athlete: d.athlete ? { id: d.athlete.id, firstname: d.athlete.firstname, lastname: d.athlete.lastname } : undefined,
      });
    }
    if (body.action === 'get') {
      const path = String(body.path ?? '');
      if (!PATHS.some((re) => re.test(path))) return json({ error: 'Ruta de la API no permitida' }, 400);
      const r = await fetch(`https://www.strava.com/api/v3${path}`, { headers: { Authorization: `Bearer ${body.token ?? ''}` } });
      const text = await r.text();
      return new Response(text, { status: r.status, headers: { ...cors, 'content-type': 'application/json' } });
    }
    if (body.action === 'deauth') {
      const r = await fetch('https://www.strava.com/oauth/deauthorize', { method: 'POST', headers: { Authorization: `Bearer ${body.token ?? ''}` } });
      return json({ ok: r.ok }, r.ok ? 200 : r.status);
    }
    return json({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    return json({ error: `No se ha podido hablar con Strava: ${(e as Error).message}` }, 502);
  }
});
