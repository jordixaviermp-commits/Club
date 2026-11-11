// ====================================================================
//  CONFIGURACIÓN: lo único que hay que tocar al montar la app.
//  Los dos valores salen de Supabase > Project Settings > API
//  (o «Connect»). Ver docs/GUIA.md, paso 3.
//
//  Si se dejan vacíos, la app funciona en MODO DEMOSTRACIÓN
//  (datos de prueba guardados solo en el propio móvil).
//
//  La clave «publishable» / «anon» es pública por diseño: la seguridad
//  la ponen las reglas de supabase/schema.sql. NUNCA pongas aquí la
//  clave «secret» / «service_role».
// ====================================================================
export const CONFIG = {
  SUPABASE_URL: '',   // p. ej. 'https://abcdefgh.supabase.co'
  SUPABASE_KEY: '',   // p. ej. 'sb_publishable_...' o 'eyJhbGciOi...'
};
