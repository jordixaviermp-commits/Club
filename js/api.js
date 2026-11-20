// Acceso a datos. Dos versiones con la misma interfaz:
//  - Supabase (real), cuando config.js tiene URL y clave.
//  - Demostración, guardada solo en este navegador, para probar la app sin montar nada.
import { newCode, todayISO, pastLimit, numDays, yearOf, SUBTYPES, parseKm, normalize, parseElev, parsePrice } from './logic.js';

const TABLES = ['runners', 'registrations', 'registration_entries', 'races', 'results', 'settings', 'circuit_podiums', 'announcements', 'announcement_replies', 'correction_requests', 'social_posts', 'chronicles'];
const OPTIONAL = new Set(['settings', 'circuit_podiums', 'announcements', 'announcement_replies', 'correction_requests', 'social_posts', 'chronicles']); // tablas que pueden faltar si aún no se ha ejecutado su SQL

/** Mensajes de error comprensibles. */
export function friendlyError(e) {
  const msg = String(e?.message || e || '');
  if (/enlace_no_valido/.test(msg)) return 'Este enlace ya no es válido. Pide uno nuevo a la dirección del club.';
  if (/resultado_ya_puesto/.test(msg)) return 'Para poder cambiar tu resultado falta activarlo en la base de datos. Avisa a la dirección del club.';
  if (/puesto_no_valido/.test(msg)) return 'Pon un puesto válido (1, 2, 3…).';
  if (/tiempo_no_valido/.test(msg)) return 'Pon un tiempo válido, por ejemplo 2:05:30 (horas:minutos:segundos).';
  if (/PGRST202|runner_report_result/.test(msg) && /tiempo|schema cache|Could not find/i.test(msg)) return 'Para guardar el tiempo falta activarlo en la base de datos. Avisa a la dirección (o guarda el resultado sin tiempo).';
  if (/carrera_suspendida/.test(msg)) return 'Esta carrera se ha suspendido: no se puede poner resultado ni pasarla a resultados.';
  if (/otros_apuntados/.test(msg)) return 'No puedes borrarla: hay más compañeros apuntados. Pídeselo a la dirección del club.';
  if (/plus_confirmado/.test(msg)) return 'La dirección ya ha confirmado este plus, así que no se puede retirar. Si hay un error, díselo a la dirección.';
  if (/PGRST202|Could not find/i.test(msg) && /runner_(update|delete)_race/.test(msg)) return 'Para editar carreras ya pasadas a resultados falta activarlo en la base de datos. Avisa a la dirección.';
  if (/no_es_tuya/.test(msg)) return 'Solo puedes cambiar las carreras que has añadido tú.';
  if (/ya_existe/.test(msg)) return 'Ya existe: otra carrera con ese nombre ese día, un circuito ya comunicado o una petición tuya pendiente.';
  if (/sin_cambios/.test(msg)) return 'Eso es lo mismo que ya pusiste: cambia el puesto, la categoría o el tipo de podio.';
  if (/nombre_no_valido/.test(msg)) return 'Pon un nombre de carrera de al menos 3 letras.';
  if (/fecha_no_valida/.test(msg)) return 'Revisa las fechas: desde el 1 de enero del año pasado hasta, como mucho, dentro de dos años.';
  if (/demasiadas_carreras/.test(msg)) return 'Hoy ya has añadido muchas carreras. Si necesitas más, pídeselo a la dirección.';
  if (/inscripcion_cerrada/.test(msg)) return 'Ya no se puede cambiar: es una carrera demasiado antigua o ya has puesto tu resultado. Pídeselo a la dirección del club.';
  if (/PGRST202|Could not find/i.test(msg) && /runner_set_paid/.test(msg)) return 'Para marcar el pago falta activarlo en la base de datos. Avisa a la dirección.';
  if (/importe_no_valido/.test(msg)) return 'Revisa el importe: entre 0 y 10 000 euros.';
  if (/no_inscrito/.test(msg)) return 'Primero tienes que estar apuntado a esa carrera.';
  if (/PGRST202|Could not find/i.test(msg) && /runner_watch/.test(msg)) return 'Esta función aún no está activada en la base de datos. Avisa a la dirección del club.';
  if (/desnivel_no_valido|registrations_extra_check|races_extra_check|runner_watch_elev_check/.test(msg)) return 'Revisa el desnivel (entre 1 y 10 000 m) y el precio (entre 0 y 10 000 €).';
  if (/web_ya_puesta/.test(msg)) return 'Esa carrera ya tiene web, puesta por otro compañero. Si está mal, díselo a la dirección.';
  if (/enlace_web_no_valido|runner_watch_url_check|registrations_url_check|races_url_check/.test(msg)) return 'La web tiene que empezar por http:// o https://';
  if (/precio_no_valido|runner_watch_price_check/.test(msg)) return 'Revisa el precio: entre 0 y 10 000 euros.';
  if (/plazo_no_valido/.test(msg)) return 'El plazo de inscripción no puede ser después de la carrera.';
  if (/km_no_validos|runner_watch_km_check/.test(msg)) return 'La distancia tiene que estar entre 0 y 1000 km.';
  if (/demasiadas_guardadas/.test(msg)) return 'Ya tienes 60 carreras guardadas. Descarta alguna para poder guardar más.';
  if (/no_encontrada/.test(msg)) return 'Esa carrera guardada ya no existe.';
  if (/solo_direccion|permission denied|42501/.test(msg)) return 'No tienes permiso para hacer esto.';
  if (/Invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.';
  if (/duplicate key|unique/i.test(msg)) return 'Hay un corredor repetido en la misma carrera.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sin conexión. Revisa la cobertura y vuelve a intentarlo.';
  return msg || 'Error desconocido.';
}

/** Formato (Critérium, XCM…) y km de la carrera, listos para guardar. */
/** Nombre para comparar: sin mayúsculas, tildes ni signos («Gran Fondo Monzón» = «gran fondo monzon»). */
/** Web de una carrera lista para guardar: añade https:// si falta; null si está vacía; '!' si no es una dirección válida. */
export const cleanWeb = (u) => { let t = String(u ?? '').trim(); if (!t) return null; if (!/^https?:\/\//i.test(t)) t = 'https://' + t; return /^https?:\/\/[^\s]+\.[^\s]+$/i.test(t) && t.length <= 500 ? t : '!'; };
const normName = (s) => normalize(String(s || '')).replace(/[^a-z0-9]/g, '');
const detailFields = (o) => ({ subtype: SUBTYPES[o.modality]?.includes(o.subtype) ? o.subtype : null, km: parseKm(o.km) });

/** Tipo de carrera y nombre del circuito, listos para guardar. */
const typeFields = (o) => {
  const t = ['campeonato', 'circuito'].includes(o.race_type) ? o.race_type : 'suelta';
  return { race_type: t, circuit: t === 'circuito' ? String(o.circuit || '').trim() || null : null };
};

function nest(data) {
  const entriesBy = new Map(), resultsBy = new Map();
  for (const e of data.registration_entries) (entriesBy.get(e.registration_id) || entriesBy.set(e.registration_id, []).get(e.registration_id)).push(e);
  for (const r of data.results) (resultsBy.get(r.race_id) || resultsBy.set(r.race_id, []).get(r.race_id)).push(r);
  return {
    runners: data.runners,
    registrations: data.registrations.map((g) => ({ ...g, entries: entriesBy.get(g.id) || [] })),
    races: data.races.map((r) => ({ ...r, results: resultsBy.get(r.id) || [] })),
    settings: Object.fromEntries((data.settings || []).map((x) => [x.key, x.value])),
    circuitPodiums: data.circuit_podiums || null, // null = falta el SQL de circuitos
    announcements: data.announcements || null,    // null = falta el SQL de noticias
    announcementReplies: data.announcement_replies || null,
    corrections: data.correction_requests || null,
    socialPosts: data.social_posts || null,       // null = falta el SQL de redes
    chronicles: data.chronicles || null,          // null = falta el SQL de crónicas
  };
}

// ======================================================================
//  Supabase
// ======================================================================
export function supabaseApi(url, key) {
  const sb = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  const ok = ({ data, error }) => { if (error) throw error; return data; };
  const all = async (t) => {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = ok(await sb.from(t).select('*').range(from, from + 999));
      out.push(...rows);
      if (rows.length < 1000) return out;
    }
  };
  const rawAll = async () => Object.fromEntries(await Promise.all(TABLES.map(async (t) => {
    try { return [t, await all(t)]; } catch (e) { if (OPTIONAL.has(t)) return [t, t === 'settings' ? [] : null]; throw e; } // antes de actualizar el SQL
  })));

  return {
    mode: 'supabase',
    async session() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return null;
      const isAdmin = ok(await sb.rpc('is_admin'));
      return { email: data.session.user.email, isAdmin };
    },
    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async signOut() { await sb.auth.signOut(); },

    async loadAll() { return nest(await rawAll()); },
    async addRunners(list) {
      ok(await sb.from('runners').insert(list.map((r) => ({ name: r.name, category: r.category || null, code: newCode(),
        ...(r.contract ? { contract: r.contract } : {}) }))));
    },
    async updateRunner(id, patch) { ok(await sb.from('runners').update(patch).eq('id', id)); },
    async saveSetting(key, value) { ok(await sb.from('settings').upsert({ key, value })); },
    async listDocuments() {
      return ok(await sb.from('runner_documents').select('id,runner_id,year,title,filename,mime,size,created_at').order('year', { ascending: false }));
    },
    async uploadDocument(runnerId, year, title, filename, mime, b64) {
      return ok(await sb.rpc('upload_document', { p_runner: runnerId, p_year: year, p_title: title, p_filename: filename, p_mime: mime, p_b64: b64 }));
    },
    async getDocument(id) { return ok(await sb.rpc('get_document', { p_id: id })); },
    async listContractTemplates() { return ok(await sb.from('contract_templates').select('contract,title,filename,mime,size,updated_at')); },
    async uploadContractTemplate(contract, title, filename, mime, b64) {
      ok(await sb.rpc('upload_contract_template', { p_contract: contract, p_title: title, p_filename: filename, p_mime: mime, p_b64: b64 }));
    },
    async getContractTemplate(contract) { return ok(await sb.rpc('get_contract_template', { p_contract: contract })); },
    async deleteContractTemplate(contract) { ok(await sb.from('contract_templates').delete().eq('contract', contract)); },
    async runnerContractTemplate(code) { return ok(await sb.rpc('runner_contract_template', { p_code: code })); },
    async runnerGetContractTemplate(code) { return ok(await sb.rpc('runner_get_contract_template', { p_code: code })); },
    async deleteDocument(id) { ok(await sb.from('runner_documents').delete().eq('id', id)); },
    async regenerateCode(id) { ok(await sb.from('runners').update({ code: newCode() }).eq('id', id)); },
    async deleteRunner(id, anonymize) { ok(await sb.rpc('delete_runner', { p_id: id, p_anonymize: anonymize })); },

    // el tipo de carrera se guarda aparte (así las funciones de guardar no cambian); si falta su SQL, se ignora
    async saveRegistration(reg, entries) {
      const id = ok(await sb.rpc('save_registration', { p_reg: reg, p_entries: entries }));
      await sb.from('registrations').update(typeFields(reg)).eq('id', id);
      await sb.from('registrations').update(detailFields(reg)).eq('id', id); // se ignora si aún falta su SQL
      await sb.from('registrations').update({ suspended: !!reg.suspended }).eq('id', id); // se ignora si aún falta su SQL
      if (reg.elevation !== undefined || reg.price !== undefined) await sb.from('registrations').update({ elevation: parseElev(reg.elevation), price: parsePrice(reg.price) }).eq('id', id); // se ignora si aún falta su SQL
      if (reg.url !== undefined) await sb.from('registrations').update({ url: cleanWeb(reg.url) === '!' ? null : cleanWeb(reg.url) }).eq('id', id); // la web (si falta su SQL, se ignora)
      return id;
    },
    async deleteRegistration(id) { ok(await sb.from('registrations').delete().eq('id', id)); },
    async promoteRegistration(id) { return ok(await sb.rpc('promote_registration', { p_id: id })); },
    /** La dirección pone o corrige el puesto (y el tiempo) de un corredor en una inscripción ('reg') o una carrera ('race'). position null = borrarlo. */
    async adminSetResult(kind, id, runnerId, position, podiumType, timeSeconds) {
      const pod = position && position <= 3 ? (podiumType || 'suelta') : null;
      if (kind === 'reg') ok(await sb.from('registration_entries').update({ self_position: position || null, self_podium_type: pod, self_time_seconds: position ? (timeSeconds || null) : null, self_reported_at: position ? new Date().toISOString() : null }).eq('registration_id', id).eq('runner_id', runnerId));
      else ok(await sb.from('results').update({ position: position || null, podium_type: pod || 'suelta', time_seconds: position ? (timeSeconds || null) : null }).eq('race_id', id).eq('runner_id', runnerId));
    },

    async saveRace(race, results) {
      const id = ok(await sb.rpc('save_race', { p_race: race, p_results: results }));
      await sb.from('races').update(typeFields(race)).eq('id', id);
      await sb.from('races').update(detailFields(race)).eq('id', id);
      if (race.elevation !== undefined || race.price !== undefined) await sb.from('races').update({ elevation: parseElev(race.elevation), price: parsePrice(race.price) }).eq('id', id);
      if (race.url !== undefined) await sb.from('races').update({ url: cleanWeb(race.url) === '!' ? null : cleanWeb(race.url) }).eq('id', id);
      return id;
    },
    async saveAnnouncement(a) {
      const row = { title: a.title, body: a.body || '', expires_at: a.expires_at || null, ...(a.rsvp || a.id ? { rsvp: !!a.rsvp } : {}) };
      if (a.id) ok(await sb.from('announcements').update(row).eq('id', a.id)); else ok(await sb.from('announcements').insert(row));
    },
    async deleteAnnouncement(id) { ok(await sb.from('announcements').delete().eq('id', id)); },
    async saveCircuitPodium(row) { ok(await sb.from('circuit_podiums').insert(row)); },
    async confirmCircuitPodium(id) { ok(await sb.from('circuit_podiums').update({ status: 'confirmado' }).eq('id', id)); },
    async deleteCircuitPodium(id) { ok(await sb.from('circuit_podiums').delete().eq('id', id)); },
    async deleteRace(id) { ok(await sb.from('races').delete().eq('id', id)); },

    async exportAll() { return { app: 'cc-monzon', version: 1, exported_at: new Date().toISOString(), ...(await rawAll()) }; },
    async importAll(data) { ok(await sb.rpc('import_backup', { p: data })); },

    async runnerView(code) { return ok(await sb.rpc('runner_view', { p_code: code })); },
    async runnerTeam(code) { return ok(await sb.rpc('runner_team', { p_code: code })); },
    /** Crónicas ya pasadas por el corredor (claves «AAAA-MM-DD|nombre»). null = falta el SQL. */
    async runnerChronicles(code) { try { return ok(await sb.rpc('runner_chronicles', { p_code: code })); } catch { return null; } },
    // crónicas ya pasadas por CUALQUIER compañero (para que baste con que la pase uno); null si falta el SQL
    // coordenadas de la población de una carrera (las busca la dirección); si falta su SQL, se ignora
    async saveGeo(kind, id, geo) { await sb.from(kind === 'reg' ? 'registrations' : 'races').update({ lat: geo.lat, lon: geo.lon, geo_key: geo.geo_key }).eq('id', id); },
    async runnerSetUrl(code, regId, url) { ok(await sb.rpc('runner_set_registration_url', { p_code: code, p_registration: regId, p_url: url || null })); },
    async runnerWatchList(code) { try { return ok(await sb.rpc('runner_watch_list', { p_code: code })); } catch (e) { if (/PGRST202|Could not find|runner_watch/.test(String(e?.message))) return null; throw e; } },
    async runnerWatchSave(code, id, data) { return ok(await sb.rpc('runner_watch_save', { p_code: code, p_id: id || null, p_data: data })); },
    async runnerWatchDelete(code, id) { ok(await sb.rpc('runner_watch_delete', { p_code: code, p_id: id })); },
    async runnerPing(code) { try { await sb.rpc('runner_ping', { p_code: code }); } catch { /* sin el SQL de actividad */ } },
    async runnerChroniclesTeam(code) { try { return ok(await sb.rpc('runner_chronicles_team', { p_code: code })); } catch { return null; } },
    // publicaciones del club y cifras agregadas de Instagram (30 días) para «Impacto en redes»; null si falta su SQL
    async runnerSocialImpact(code) { try { return ok(await sb.rpc('runner_social_impact', { p_code: code })); } catch { return null; } },
    async runnerSetChronicle(code, key, done) { ok(await sb.rpc('runner_chronicle_set', { p_code: code, p_key: key, p_done: !!done })); },
    /** Dirección: marca o desmarca la crónica de un corredor (por si la pasó y no la marcó en su perfil). */
    async setChronicle(runnerId, key, done) {
      if (done) ok(await sb.from('chronicles').upsert({ runner_id: runnerId, race_key: key }, { onConflict: 'runner_id,race_key', ignoreDuplicates: true }));
      else ok(await sb.from('chronicles').delete().eq('runner_id', runnerId).eq('race_key', key));
    },
    async runnerNews(code) { return ok(await sb.rpc('runner_news', { p_code: code })); },
    async runnerDocuments(code) { return ok(await sb.rpc('runner_documents_list', { p_code: code })); },
    async runnerGetDocument(code, id) { return ok(await sb.rpc('runner_get_document', { p_code: code, p_id: id })); },
    async runnerReport(code, kind, id, position, category, podiumType, timeSeconds) {
      const args = { p_code: code, p_kind: kind, p_id: id, p_position: position, p_category: category || null, p_podium_type: podiumType || null };
      if (timeSeconds) args.p_time = timeSeconds; // solo se envía si hay tiempo: así sigue funcionando antes de activar el cambio en la base
      ok(await sb.rpc('runner_report_result', args));
    },
    async runnerUpdate(code, id, reg) { ok(await sb.rpc('runner_update_registration', { p_code: code, p_id: id, p_reg: reg })); },
    async runnerDelete(code, id) { ok(await sb.rpc('runner_delete_registration', { p_code: code, p_id: id })); },
    async runnerUpdateRace(code, id, race) { ok(await sb.rpc('runner_update_race', { p_code: code, p_id: id, p_race: race })); },
    async runnerDeleteRace(code, id) { ok(await sb.rpc('runner_delete_race', { p_code: code, p_id: id })); },
    async runnerCreate(code, reg, category) { return ok(await sb.rpc('runner_create_registration', { p_code: code, p_reg: reg, p_category: category || null })); },
    async runnerJoin(code, regId, category) { ok(await sb.rpc('runner_join', { p_code: code, p_registration: regId, p_category: category || null })); },
    async runnerLeave(code, regId) { ok(await sb.rpc('runner_leave', { p_code: code, p_registration: regId })); },
    async runnerSetPaid(code, regId, paid, amount, date) { ok(await sb.rpc('runner_set_paid', { p_code: code, p_registration: regId, p_paid: !!paid, p_amount: amount ?? null, p_date: date || null })); },
    async runnerJoinRace(code, raceId, category) { ok(await sb.rpc('runner_join_race', { p_code: code, p_race: raceId, p_category: category || null })); },
    async autoPromote() { try { return ok(await sb.rpc('auto_promote_registrations')); } catch { return 0; } },
    async runnerComplete(code, kind, id, data) { ok(await sb.rpc('runner_complete_race', { p_code: code, p_kind: kind, p_id: id, p_data: data })); },
    async listChanges() { try { return ok(await sb.from('change_log').select('*').order('at', { ascending: false }).limit(300)); } catch { return null; } },
    async socialView(code) { return ok(await sb.rpc('social_view', { p_code: code })); },
    async socialMark(code, key, posted) { ok(await sb.rpc('social_mark', { p_code: code, p_key: key, p_posted: !!posted })); },
    async listPosts() { try { return ok(await sb.from('social_posts').select('key,posted_at,posted_by').limit(1000)); } catch { return null; } },
    /** Estadísticas de Instagram guardadas por la captura automática (solo dirección). null = falta ejecutar el SQL. */
    async deleteIgPeriod(key) { ok(await sb.from('ig_snapshots').delete().eq('kind', 'period').eq('key', key)); },
    async listIg() {
      try {
        const out = [];
        for (let from = 0; ; from += 1000) {
          const rows = ok(await sb.from('ig_snapshots').select('kind,key,data,captured_at').range(from, from + 999));
          out.push(...rows);
          if (rows.length < 1000) return out;
        }
      } catch { return null; }
    },
    async setPosted(keys, value) {
      if (!keys.length) return;
      if (value) ok(await sb.from('social_posts').upsert(keys.map((key) => ({ key })), { onConflict: 'key', ignoreDuplicates: true }));
      else ok(await sb.from('social_posts').delete().in('key', keys));
    },
    async runnerReplyNews(code, id, answer, guests) { ok(await sb.rpc('runner_reply_news', { p_code: code, p_id: id, p_answer: answer, p_guests: guests || 0 })); },
    async runnerRequestCorrection(code, kind, id, position, category, podiumType, note) {
      return ok(await sb.rpc('runner_request_correction', { p_code: code, p_kind: kind, p_id: id, p_position: position, p_category: category || null, p_podium_type: podiumType || null, p_note: note || null }));
    },
    async runnerCorrections(code) { return ok(await sb.rpc('runner_corrections', { p_code: code })); },
    async runnerCancelCorrection(code, id) { ok(await sb.rpc('runner_cancel_correction', { p_code: code, p_id: id })); },
    async resolveCorrection(id, accept, reply) { ok(await sb.rpc('resolve_correction', { p_id: id, p_accept: !!accept, p_reply: reply || null })); },
    async runnerSetDetails(code, id, subtype, km) { ok(await sb.rpc('runner_set_race_details', { p_code: code, p_id: id, p_subtype: subtype || null, p_km: parseKm(km) })); },
    async runnerSetType(code, id, type, circuit) { ok(await sb.rpc('runner_set_race_type', { p_code: code, p_id: id, p_type: type, p_circuit: circuit || null })); },
    async runnerProposeCircuit(code, circuit, year, position, scope) {
      return ok(await sb.rpc('runner_propose_circuit', { p_code: code, p_circuit: circuit, p_year: year, p_position: position, p_scope: scope }));
    },
    async runnerCancelCircuit(code, id) { ok(await sb.rpc('runner_cancel_circuit', { p_code: code, p_id: id })); },
  };
}

// ======================================================================
//  Demostración (localStorage). Imita las reglas de la base de datos.
// ======================================================================
const DEMO_KEY = 'monzon-demo-v1';
const uuid = () => globalThis.crypto.randomUUID();

function demoSeed() {
  const y = new Date().getFullYear();
  const mk = (name, category) => ({ id: uuid(), name, category, code: newCode(), created_at: new Date().toISOString() });
  const runners = [mk('Pere Soler', 'M40'), mk('Anna Puig', 'Élite'), mk('Jordi Vila', 'M50'),
    mk('Marta Roca', 'M30'), mk('Joan Ferrer', 'M60'), mk('Laia Serra', 'Sub-23')];
  const [pere, anna, jordi, marta, joan, laia] = runners;
  const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  pere.last_seen = ago(20); anna.last_seen = ago(3); jordi.last_seen = ago(24 * 40); marta.last_seen = ago(24 * 6);   // actividad de ejemplo
  const off = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const race = (name, date, place, province, modality, results) => ({
    id: uuid(), name, date, place, province, country: 'España', modality, notes: null, created_at: null, results });
  const res = (r, category, position, podium_type = 'suelta') => ({ id: uuid(), runner_id: r.id, runner_name: r.name, category, position, podium_type });
  const races = [
    race('Marxa del Montseny', `${y}-03-09`, 'Sant Celoni', 'Barcelona', 'Carretera', [res(pere, 'M40', 2), res(jordi, 'M50', 5), res(anna, 'Élite', 1)]),
    race('Open BTT Osona', `${y}-04-20`, 'Vic', 'Barcelona', 'BTT', [res(marta, 'M30', 3, 'general'), res(laia, 'Sub-23', 7)]),
    race('Campionat de Catalunya CRI', `${y}-05-18`, 'Lleida', 'Lleida', 'Carretera', [res(anna, 'Élite', 2, 'campeonato'), res(joan, 'M60', 1, 'campeonato')]),
    race('Gravel Pirineus', `${y}-06-08`, 'Bourg-Madame', '', 'Gravel', [res(pere, 'M40', 4)]),
    race('Trofeu de Tardor', `${y - 1}-10-12`, 'Reus', 'Tarragona', 'Carretera', [res(pere, 'M40', 1), res(jordi, 'M50', 3)]),
  ];
  const reg = (name, date, place, province, modality, ents) => ({
    id: uuid(), name, date, place, province, country: 'España', modality, notes: null, created_at: null,
    entries: ents.map(([r, c]) => ({ runner_id: r.id, category: c, created_at: null })) });
  const registrations = [
    reg('Volta a la Cerdanya', `${y + 1}-06-14`, 'Puigcerdà', 'Girona', 'Carretera', [[pere, 'M40'], [anna, 'Élite']]),
    reg('BTT Les Garrigues', `${y + 1}-02-22`, 'Les Borges Blanques', 'Lleida', 'BTT', [[marta, 'M30']]),
    reg('Cursa de la Segarra', off(4), 'Cervera', 'Lleida', 'Carretera', [[pere, 'M40'], [jordi, 'M50'], [laia, 'Sub-23']]),
    reg('XCO Montsec', off(-5), 'Àger', 'Lleida', 'BTT', [[marta, 'M30'], [anna, 'Élite']]),
  ];
  registrations[0].url = 'https://example.org/volta-cerdanya';   // una con web puesta (por la dirección)
  // datos de ejemplo de formato, km, desnivel (m) y precio de inscripción (€)
  const extras = { 'Marxa del Montseny': ['Ciclodeportiva', 96, 1450, 28], 'Open BTT Osona': ['XCM', 44, 1100, 22], 'Campionat de Catalunya CRI': ['Contrarreloj', 38, 220, 30],
    'Gravel Pirineus': [null, 120, 2300, 45], 'Trofeu de Tardor': ['Critérium', 60, 380, 18] };
  for (const r of races) { const e = extras[r.name]; if (e) { if (e[0]) r.subtype = e[0]; r.km = e[1]; r.elevation = e[2]; r.price = e[3]; } }
  const regExtras = { 'Volta a la Cerdanya': [95, 1800, 35], 'BTT Les Garrigues': [38, 900, 20], 'Cursa de la Segarra': [70, 650, 18], 'XCO Montsec': [32, 780, 15] };
  for (const g of registrations) { const e = regExtras[g.name]; if (e) { g.km = e[0]; g.elevation = e[1]; g.price = e[2]; } }
  return {
    runners,
    registrations: [...registrations.map(({ entries, ...g }) => g),
      // lo que Pere guarda en «Por valorar» también está en Carreras, sin inscritos ni dueño
      { id: uuid(), name: 'Gran Fondo Monzón', date: off(52), end_date: null, place: 'Monzón', province: 'Huesca', country: 'España', modality: 'Carretera', subtype: 'Ciclodeportiva', km: 120, notes: null, created_at: null, created_by: null, candidate: true, url: 'https://example.org/gran-fondo', url_by: pere.id, elevation: 2100, price: 32 }],
    registration_entries: registrations.flatMap((g) => g.entries.map((e) => ({ registration_id: g.id, ...e }))),
    races: races.map(({ results, ...r }) => r),
    results: races.flatMap((r) => r.results.map((x) => ({ race_id: r.id, ...x }))),
    runner_watch: [   // carreras «por valorar» de ejemplo (de Pere)
      { id: uuid(), runner_id: pere.id, name: 'Gran Fondo Monzón', date: off(52), end_date: null, place: 'Monzón', province: 'Huesca', country: 'España', modality: 'Carretera', subtype: 'Ciclodeportiva', km: 120,
        url: 'https://example.org/gran-fondo', price: 32, elevation: 2100, deadline: off(5), notes: 'Subida larga al final. Mirar si hay avituallamiento y si encaja con la preparación.', created_at: ago(24 * 9) },
      { id: uuid(), runner_id: pere.id, name: 'BTT Les Garrigues', date: `${y + 1}-02-22`, end_date: null, place: 'Les Borges Blanques', province: 'Lleida', country: 'España', modality: 'BTT', subtype: 'XCO', km: 38,
        url: 'https://example.org/open-btt', price: 20, deadline: off(70), notes: null, created_at: ago(24 * 3) },
      { id: uuid(), runner_id: pere.id, name: 'Volta a la Cerdanya', date: `${y + 1}-06-14`, end_date: null, place: 'Puigcerdà', province: 'Girona', country: 'España', modality: 'Carretera', subtype: 'Ciclodeportiva', km: 95,
        url: null, price: null, deadline: null, notes: 'Ya hay compañeros apuntados.', created_at: ago(24 * 20) },
      { id: uuid(), runner_id: pere.id, name: 'Cronoescalada Benasque', date: off(-10), end_date: null, place: 'Benasque', province: 'Huesca', country: 'España', modality: 'Carretera', subtype: 'Contrarreloj', km: 12,
        url: null, price: 15, deadline: off(-30), notes: null, created_at: ago(24 * 60) },
    ],
  };
}

export function demoApi(storage = globalThis.localStorage) {
  let mem = null;
  const load = () => {
    if (mem) return mem;
    try { mem = JSON.parse(storage.getItem(DEMO_KEY)); } catch { mem = null; }
    if (!mem || !Array.isArray(mem.runners)) { mem = demoSeed(); save(); }
    return mem;
  };
  const save = () => { try { storage.setItem(DEMO_KEY, JSON.stringify(mem)); } catch { /* sin almacenamiento */ } };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  let admin = false;
  try { admin = storage.getItem(DEMO_KEY + '-admin') === '1'; } catch { /* nada */ }
  const requireAdmin = () => { if (!admin) throw new Error('solo_direccion'); };
  /** Apunta una línea en el historial de la demostración. */
  const logc = (actor, action, summary) => {
    const d = load(); d.change_log = d.change_log || [];
    d.change_log.push({ id: uuid(), at: new Date().toISOString(), actor, entity: 'race', action, summary });
    d.change_log = d.change_log.slice(-300);
  };
  /** Pasa solas a resultados las inscripciones disputadas hace más de una semana con algún puesto puesto por un inscrito. */
  const autoPromote = () => {
    const d = load(); const t = new Date(); t.setDate(t.getDate() - 7); const limit = todayISO(t); let n = 0;
    for (const g of [...d.registrations]) {
      if (g.suspended || (g.end_date || g.date) >= limit) continue;
      const ents = d.registration_entries.filter((e) => e.registration_id === g.id && e.self_position);
      if (!ents.length) continue;
      const { created_at, ...rest } = g;
      const race = { ...rest, id: uuid(), created_at: new Date().toISOString() };
      d.races.push(race);
      for (const e of ents) {
        const rn = d.runners.find((r) => r.id === e.runner_id);
        d.results.push({ id: uuid(), race_id: race.id, runner_id: e.runner_id, runner_name: rn?.name || '?', category: e.category || null, position: e.self_position,
          podium_type: e.self_position <= 3 ? (e.self_podium_type || 'suelta') : 'suelta', time_seconds: e.self_time_seconds || null, self_reported: true });
      }
      d.registrations = d.registrations.filter((x) => x.id !== g.id);
      d.registration_entries = d.registration_entries.filter((e) => e.registration_id !== g.id);
      logc('Sistema', 'auto_resultados', `pasó sola a resultados: ${g.name} (${g.date})`); n++;
    }
    if (n) save();
    return n;
  };
  /** Lo guardado en «Por valorar» se crea también en Carreras (sin inscritos ni dueño) para que otros la encuentren y no se duplique. */
  const publishWatch = (d, r, runnerId) => {
    if (r.date < todayISO()) return;
    const have = d.registrations.find((g) => g.date === r.date && normName(g.name) === normName(r.name));
    if (have) { if (r.url && !have.url) { have.url = r.url; have.url_by = runnerId; } if (have.elevation == null && r.elevation) have.elevation = r.elevation; if (have.price == null && r.price != null) have.price = r.price; return; }   // ya existe: si no tenía web y este corredor la conoce, queda para todos
    d.registrations.push({ id: uuid(), name: r.name, date: r.date, end_date: r.end_date, place: r.place, province: r.province, country: r.country || 'España', modality: r.modality, subtype: r.subtype, km: r.km,
      notes: null, created_at: new Date().toISOString(), created_by: null, candidate: true, url: r.url || null, url_by: r.url ? runnerId : null, elevation: r.elevation || null, price: r.price ?? null });
  };
  /** Quita las candidatas sin inscritos que ya nadie valora o que ya pasaron. */
  const cleanCandidates = (d) => {
    const hasEntries = (g) => d.registration_entries.some((e) => e.registration_id === g.id);
    d.registrations = d.registrations.filter((g) => !(g.candidate && !hasEntries(g) && (g.date < todayISO() || !(d.runner_watch || []).some((w) => w.date === g.date && normName(w.name) === normName(g.name)))));
  };
  const fields = (o) => ({
    name: String(o.name || '').trim(), date: o.date, end_date: o.end_date && o.end_date > o.date ? o.end_date : null, place: o.place?.trim() || null, province: o.province?.trim() || null,
    country: o.country?.trim() || null, modality: o.modality || 'Carretera', notes: o.notes?.trim() || null,
    ...(o.race_type !== undefined ? typeFields(o) : {}),
    ...(o.suspended !== undefined ? { suspended: !!o.suspended } : {}),
    ...(o.url !== undefined ? { url: cleanWeb(o.url) === '!' ? null : cleanWeb(o.url) } : {}),
    ...(o.elevation !== undefined ? { elevation: parseElev(o.elevation) } : {}),
    ...(o.price !== undefined ? { price: parsePrice(o.price) } : {}),
    ...(o.subtype !== undefined || o.km !== undefined ? detailFields(o) : {}),
    ...(o.stages !== undefined ? { stages: o.stages?.length ? o.stages : null } : {}) });
  const byCode = (code) => {
    const r = load().runners.find((x) => x.code === code);
    if (!r) throw new Error('enlace_no_valido');
    return r;
  };
  const openReg = (id) => {
    const g = load().registrations.find((x) => x.id === id);
    if (!g || g.date < pastLimit()) throw new Error('inscripcion_cerrada');
    return g;
  };

  return {
    mode: 'demo',
    async session() { return admin ? { email: 'demo', isAdmin: true } : null; },
    async signIn() { admin = true; try { storage.setItem(DEMO_KEY + '-admin', '1'); } catch { /* nada */ } },
    async signOut() { admin = false; try { storage.removeItem(DEMO_KEY + '-admin'); } catch { /* nada */ } },
    async resetDemo() { mem = demoSeed(); save(); },

    async loadAll() { requireAdmin(); autoPromote(); const { runner_watch, ...d } = load(); return clone(nest({ circuit_podiums: [], announcements: [], announcement_replies: [], correction_requests: [], social_posts: [], chronicles: [], ...d })); },
    async autoPromote() { requireAdmin(); return autoPromote(); },
    async listChanges() { requireAdmin(); return clone([...(load().change_log || [])].sort((a, b) => b.at.localeCompare(a.at))); },
    async runnerComplete(code, kind, id, data) {
      const me = byCode(code); const d = load();
      const x = kind === 'reg' ? d.registrations.find((g) => g.id === id) : d.races.find((r) => r.id === id);
      const mine = kind === 'reg' ? true   // una inscripción la completa cualquier corredor (solo lo que falta)
        : d.results.some((r) => r.race_id === id && r.runner_id === me.id);
      if (!x || !mine) throw new Error('no_es_tuya');
      const done = [];
      const fill = (k, v) => { if (v === null || v === undefined || v === '') return; if (x[k] === null || x[k] === undefined || x[k] === '') { x[k] = v; done.push(`${k}: ${v}`); } };
      fill('place', String(data.place || '').trim()); fill('province', String(data.province || '').trim());
      fill('subtype', SUBTYPES[x.modality]?.includes(data.subtype) ? data.subtype : null); fill('km', parseKm(data.km));
      fill('elevation', parseElev(data.elevation)); fill('price', parsePrice(data.price));
      if (done.length) { logc(me.name, 'update', `cambió ${kind === 'reg' ? 'la inscripción' : 'la carrera'} ${x.name}: ${done.join('; ')}`); save(); }
    },
    async addRunners(list) {
      requireAdmin();
      for (const r of list) load().runners.push({ id: uuid(), name: r.name, category: r.category || null, code: newCode(), created_at: new Date().toISOString(), contract: r.contract || null });
      save();
    },
    async updateRunner(id, patch) { requireAdmin(); Object.assign(load().runners.find((r) => r.id === id), patch); save(); },
    async listDocuments() { requireAdmin(); return clone((load().documents || []).map(({ b64, ...m }) => m)); },
    async uploadDocument(runnerId, year, title, filename, mime, b64) {
      requireAdmin(); const d = load(); d.documents = d.documents || [];
      const doc = { id: uuid(), runner_id: runnerId, year, title: title || 'Contrato', filename, mime, size: Math.round(b64.length * 0.75), created_at: new Date().toISOString(), b64 };
      d.documents.push(doc); save(); return doc.id;
    },
    async getDocument(id) { requireAdmin(); const x = (load().documents || []).find((y) => y.id === id); if (!x) throw new Error('no_existe'); return { filename: x.filename, mime: x.mime, b64: x.b64 }; },
    async deleteDocument(id) { requireAdmin(); const d = load(); d.documents = (d.documents || []).filter((x) => x.id !== id); save(); },
    async listContractTemplates() { requireAdmin(); return clone((load().contract_templates || []).map(({ b64, ...m }) => m)); },
    async uploadContractTemplate(contract, title, filename, mime, b64) {
      requireAdmin(); const d = load();
      d.contract_templates = (d.contract_templates || []).filter((x) => x.contract !== contract).concat([{ contract, title: title || 'Contrato', filename, mime, size: Math.round(b64.length * 0.75), updated_at: new Date().toISOString(), b64 }]);
      save();
    },
    async getContractTemplate(contract) { requireAdmin(); const x = (load().contract_templates || []).find((y) => y.contract === contract); if (!x) throw new Error('no_existe'); return { filename: x.filename, mime: x.mime, b64: x.b64 }; },
    async deleteContractTemplate(contract) { requireAdmin(); const d = load(); d.contract_templates = (d.contract_templates || []).filter((x) => x.contract !== contract); save(); },
    async runnerContractTemplate(code) {
      const me = byCode(code); const x = (load().contract_templates || []).find((y) => y.contract === me.contract);
      if (!x) return null; const { b64, ...m } = x; return clone(m);
    },
    async runnerGetContractTemplate(code) {
      const me = byCode(code); const x = (load().contract_templates || []).find((y) => y.contract === me.contract);
      if (!x) throw new Error('no_existe'); return { filename: x.filename, mime: x.mime, b64: x.b64 };
    },
    async runnerDocuments(code) { const me = byCode(code); return clone((load().documents || []).filter((x) => x.runner_id === me.id).map(({ b64, runner_id, ...m }) => m)); },
    async runnerGetDocument(code, id) {
      const me = byCode(code); const x = (load().documents || []).find((y) => y.id === id && y.runner_id === me.id);
      if (!x) throw new Error('no_es_tuya'); return { filename: x.filename, mime: x.mime, b64: x.b64 };
    },
    async saveSetting(key, value) {
      requireAdmin(); const d = load(); d.settings = (d.settings || []).filter((x) => x.key !== key).concat([{ key, value: clone(value) }]); save();
    },
    async regenerateCode(id) { requireAdmin(); load().runners.find((r) => r.id === id).code = newCode(); save(); },
    async deleteRunner(id, anonymize) {
      requireAdmin(); const d = load();
      for (const r of d.results) if (r.runner_id === id) { r.runner_id = null; if (anonymize) r.runner_name = 'Corredor eliminado'; }
      d.registration_entries = d.registration_entries.filter((e) => e.runner_id !== id);
      d.runners = d.runners.filter((r) => r.id !== id);
      save();
    },

    async saveRegistration(reg, entries) {
      requireAdmin(); const d = load();
      let g = reg.id && d.registrations.find((x) => x.id === reg.id);
      if (!g) { g = { id: uuid(), created_at: new Date().toISOString() }; d.registrations.push(g); }
      Object.assign(g, fields(reg));
      const prev = new Map(d.registration_entries.filter((e) => e.registration_id === g.id).map((e) => [e.runner_id, e]));
      d.registration_entries = d.registration_entries.filter((e) => e.registration_id !== g.id) // como la base de datos: se conserva el resultado propio
        .concat(entries.map((e) => ({ ...(prev.get(e.runner_id) || { created_at: null }), registration_id: g.id, runner_id: e.runner_id, category: e.category || null })));
      save(); return g.id;
    },
    async deleteRegistration(id) {
      requireAdmin(); const d = load();
      d.registrations = d.registrations.filter((g) => g.id !== id);
      d.registration_entries = d.registration_entries.filter((e) => e.registration_id !== id);
      save();
    },
    async adminSetResult(kind, id, runnerId, position, podiumType, timeSeconds) {
      requireAdmin(); const d = load();
      const pod = position && position <= 3 ? (podiumType || 'suelta') : null;
      if (kind === 'reg') { const e = d.registration_entries.find((x) => x.registration_id === id && x.runner_id === runnerId); if (!e) throw new Error('no_existe');
        Object.assign(e, { self_position: position || null, self_podium_type: pod, self_time_seconds: position ? (timeSeconds || null) : null }); }
      else { const r = d.results.find((x) => x.race_id === id && x.runner_id === runnerId); if (!r) throw new Error('no_existe');
        Object.assign(r, { position: position || null, podium_type: pod || 'suelta', time_seconds: position ? (timeSeconds || null) : null }); }
      save();
    },
    async promoteRegistration(id) {
      requireAdmin(); const d = load();
      const g = d.registrations.find((x) => x.id === id);
      if (g?.suspended) throw new Error('carrera_suspendida');
      const race = { ...g, id: uuid() };
      d.races.push(race);
      for (const e of d.registration_entries.filter((x) => x.registration_id === id)) {
        const rn = d.runners.find((r) => r.id === e.runner_id);
        d.results.push({ id: uuid(), race_id: race.id, runner_id: e.runner_id, runner_name: rn.name, category: e.category,
          position: e.self_position || null, podium_type: e.self_position && e.self_position <= 3 ? (e.self_podium_type || 'suelta') : 'suelta',
          time_seconds: e.self_time_seconds || null, self_reported: !!e.self_position });
      }
      save(); await this.deleteRegistration(id); return race.id;
    },

    async saveRace(race, results) {
      requireAdmin(); const d = load();
      const ids = results.map((r) => r.runner_id).filter(Boolean);
      if (new Set(ids).size !== ids.length) throw new Error('duplicate key');
      let r = race.id && d.races.find((x) => x.id === race.id);
      if (!r) { r = { id: uuid(), created_at: new Date().toISOString() }; d.races.push(r); }
      Object.assign(r, fields(race));
      d.results = d.results.filter((x) => x.race_id !== r.id).concat(results.map((x) => ({
        id: uuid(), race_id: r.id, runner_id: x.runner_id || null, runner_name: x.runner_name, category: x.category || null,
        position: x.position ?? null, podium_type: x.podium_type || 'suelta', stage_positions: x.stage_positions || null, time_seconds: x.time_seconds || null, self_reported: !!x.self_reported })));
      save(); return r.id;
    },
    async deleteRace(id) {
      requireAdmin(); const d = load();
      d.races = d.races.filter((r) => r.id !== id);
      d.results = d.results.filter((r) => r.race_id !== id);
      save();
    },

    async saveAnnouncement(a) {
      requireAdmin(); const d = load(); d.announcements = d.announcements || [];
      const row = { title: String(a.title || '').trim(), body: String(a.body || ''), expires_at: a.expires_at || null, rsvp: !!a.rsvp };
      if (row.title.length < 3) throw new Error('Pon un título de al menos 3 letras.');
      const prev = a.id && d.announcements.find((x) => x.id === a.id);
      if (prev) Object.assign(prev, row); else d.announcements.push({ id: uuid(), created_at: new Date().toISOString(), ...row });
      save();
    },
    async deleteAnnouncement(id) { requireAdmin(); const d = load(); d.announcements = (d.announcements || []).filter((x) => x.id !== id); save(); },
    async runnerNews(code) {
      const me = byCode(code); const t = todayISO(); const reps = load().announcement_replies || [];
      return clone((load().announcements || []).filter((x) => !x.expires_at || x.expires_at >= t).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30).map((n) => {
        const mine = reps.find((r) => r.announcement_id === n.id && r.runner_id === me.id), all = reps.filter((r) => r.announcement_id === n.id);
        return { ...n, rsvp: !!n.rsvp, my_answer: mine?.answer || null, my_guests: mine?.guests ?? null,
          yes_count: all.filter((r) => r.answer === 'si').reduce((c, r) => c + 1 + r.guests, 0), no_count: all.filter((r) => r.answer === 'no').length,
          yes_list: all.filter((r) => r.answer === 'si').map((r) => ({ name: load().runners.find((x) => x.id === r.runner_id)?.name || '?', guests: r.guests || 0 })).sort((x, y) => x.name.localeCompare(y.name, 'es')) };
      }));
    },
    async socialView(code) {
      const d = load(); if (!code || (d.settings || []).find((x) => x.key === 'social')?.value?.code !== code) throw new Error('enlace_no_valido');
      const t = todayISO(); const a = new Date(); a.setDate(a.getDate() - 1); const lim1 = todayISO(a); const b = new Date(); b.setDate(b.getDate() + 45); const lim2 = todayISO(b);
      const c = new Date(); c.setDate(c.getDate() - 21); const lim3 = todayISO(c);
      const nm = (id) => d.runners.find((r) => r.id === id)?.name;
      const base = (x) => ({ name: x.name, date: x.date, end_date: x.end_date || null, place: x.place || null, province: x.province || null, country: x.country || null,
        modality: x.modality, subtype: x.subtype || null, km: x.km ?? null, race_type: x.race_type || 'suelta', circuit: x.circuit || null });
      return clone({ today: t,
        upcoming: d.registrations.filter((g) => !g.suspended && (g.end_date || g.date) >= lim1 && g.date <= lim2 && d.registration_entries.some((e) => e.registration_id === g.id))
          .sort((x, y) => x.date.localeCompare(y.date) || x.name.localeCompare(y.name))
          .map((g) => ({ ...base(g), people: d.registration_entries.filter((e) => e.registration_id === g.id).map((e) => nm(e.runner_id)).filter(Boolean).sort((p, q) => p.localeCompare(q)),
            people_cat: d.registration_entries.filter((e) => e.registration_id === g.id).map((e) => nm(e.runner_id) && `${nm(e.runner_id)}${e.category ? ` (${e.category})` : ''}`).filter(Boolean).sort((p, q) => p.localeCompare(q)) })),
        recent: d.races.filter((r) => r.date >= lim3 && r.date <= t && d.results.some((x) => x.race_id === r.id)).sort((x, y) => y.date.localeCompare(x.date))
          .map((r) => ({ ...base(r), participants: d.results.filter((x) => x.race_id === r.id).length,
            podium: d.results.filter((x) => x.race_id === r.id && x.position >= 1 && x.position <= 3).sort((p, q) => p.position - q.position).map((x) => ({ position: x.position, name: x.runner_name, category: x.category || null })) })),
        posted: (d.social_posts || []).map((x) => x.key) });
    },
    async socialMark(code, key, posted) {
      const d = load(); if (!code || (d.settings || []).find((x) => x.key === 'social')?.value?.code !== code) throw new Error('enlace_no_valido');
      d.social_posts = (d.social_posts || []).filter((x) => x.key !== key);
      if (posted) d.social_posts.push({ key, posted_at: new Date().toISOString(), posted_by: 'Redes' });
      save();
    },
    async listPosts() { requireAdmin(); return clone(load().social_posts || []); },
    async listIg() { requireAdmin(); return clone(load().ig_snapshots || []); },
    async deleteIgPeriod(key) { requireAdmin(); const d = load(); d.ig_snapshots = (d.ig_snapshots || []).filter((x) => !(x.kind === 'period' && x.key === key)); save(); },
    async setPosted(keys, value) {
      requireAdmin(); const d = load(); const set = new Set(keys);
      d.social_posts = (d.social_posts || []).filter((x) => !set.has(x.key));
      if (value) for (const key of keys) d.social_posts.push({ key, posted_at: new Date().toISOString(), posted_by: 'Dirección' });
      save();
    },
    async runnerReplyNews(code, id, answer, guests) {
      const me = byCode(code); const d = load(); const n = (d.announcements || []).find((x) => x.id === id);
      if (!n || !n.rsvp || (n.expires_at && n.expires_at < todayISO())) throw new Error('inscripcion_cerrada');
      if (!['si', 'no'].includes(answer)) throw new Error('tipo_no_valido');
      d.announcement_replies = (d.announcement_replies || []).filter((r) => !(r.announcement_id === id && r.runner_id === me.id));
      d.announcement_replies.push({ announcement_id: id, runner_id: me.id, answer, guests: answer === 'si' ? Math.max(0, Math.min(Number(guests) || 0, 10)) : 0 });
      save();
    },
    async runnerRequestCorrection(code, kind, id, position, category, podiumType, note) {
      const me = byCode(code); const d = load(); d.correction_requests = d.correction_requests || [];
      if (!Number.isInteger(position) || position < 1 || position > 999) throw new Error('puesto_no_valido');
      let old = null, name = '', date = null;
      if (kind === 'reg') { const e = d.registration_entries.find((x) => x.registration_id === id && x.runner_id === me.id); const g = d.registrations.find((x) => x.id === id); old = e?.self_position ?? null; name = g?.name; date = g?.date; }
      else { const x = d.results.find((r) => r.race_id === id && r.runner_id === me.id); const r = d.races.find((q) => q.id === id); old = x?.position ?? null; name = r?.name; date = r?.date; }
      if (old === null || old === undefined) throw new Error('no_es_tuya');
      if (old === position && !category && !podiumType) throw new Error('sin_cambios');
      if (d.correction_requests.some((c) => c.runner_id === me.id && c.target_id === id && c.status === 'pendiente')) throw new Error('ya_existe');
      const row = { id: uuid(), runner_id: me.id, kind, target_id: id, race_name: name, race_date: date, old_position: old, new_position: position, new_category: category || null,
        new_podium_type: position <= 3 ? (podiumType || 'suelta') : null, note: String(note || '').trim().slice(0, 300) || null, status: 'pendiente', reply: null, created_at: new Date().toISOString(), resolved_at: null };
      d.correction_requests.push(row);
      logc(me.name, 'correccion', `pidió corregir su puesto en ${name}: ${old}º → ${position}º`); save(); return row.id;
    },
    async runnerCorrections(code) {
      const me = byCode(code);
      return clone((load().correction_requests || []).filter((c) => c.runner_id === me.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20).map(({ runner_id, ...c }) => c));
    },
    async runnerCancelCorrection(code, id) {
      const me = byCode(code); const d = load();
      if (!(d.correction_requests || []).some((c) => c.id === id && c.runner_id === me.id && c.status === 'pendiente')) throw new Error('no_es_tuya');
      d.correction_requests = d.correction_requests.filter((c) => c.id !== id); save();
    },
    async resolveCorrection(id, accept, reply) {
      requireAdmin(); const d = load(); const c = (d.correction_requests || []).find((x) => x.id === id && x.status === 'pendiente');
      if (!c) throw new Error('no_existe');
      if (accept) {
        const pod = c.new_position <= 3 ? (c.new_podium_type || 'suelta') : null; let n = 0;
        if (c.kind === 'reg') { const e = d.registration_entries.find((x) => x.registration_id === c.target_id && x.runner_id === c.runner_id);
          if (e) { Object.assign(e, { self_position: c.new_position, self_podium_type: pod }); if (c.new_category) e.category = c.new_category; n = 1; } }
        if (!n) { const race = c.kind === 'race' ? d.races.find((r) => r.id === c.target_id) : d.races.find((r) => r.name === c.race_name && r.date === c.race_date);
          const x = race && d.results.find((r) => r.race_id === race.id && r.runner_id === c.runner_id);
          if (x) { Object.assign(x, { position: c.new_position, podium_type: pod || 'suelta', self_reported: true }); if (c.new_category) x.category = c.new_category; n = 1; } }
        if (!n) throw new Error('no_existe');
      }
      Object.assign(c, { status: accept ? 'aceptada' : 'rechazada', reply: String(reply || '').trim().slice(0, 300) || null, resolved_at: new Date().toISOString() });
      logc('Dirección', 'correccion', `${accept ? 'aceptó' : 'rechazó'} la corrección de ${d.runners.find((r) => r.id === c.runner_id)?.name} en ${c.race_name}: ${c.old_position}º → ${c.new_position}º`);
      save();
    },
    async saveCircuitPodium(row) {
      requireAdmin(); const d = load(); d.circuit_podiums = d.circuit_podiums || [];
      d.circuit_podiums.push({ id: uuid(), status: 'confirmado', by_runner: false, scope: 'categoria', created_at: new Date().toISOString(), ...row }); save();
    },
    async confirmCircuitPodium(id) { requireAdmin(); const c = (load().circuit_podiums || []).find((x) => x.id === id); if (c) c.status = 'confirmado'; save(); },
    async deleteCircuitPodium(id) { requireAdmin(); const d = load(); d.circuit_podiums = (d.circuit_podiums || []).filter((x) => x.id !== id); save(); },

    async exportAll() { requireAdmin(); const { runner_watch, ...rest } = clone(load()); return { app: 'cc-monzon', version: 1, exported_at: new Date().toISOString(), ...rest }; },   // lo «por valorar» es personal: no va en la copia
    async importAll(data) {
      requireAdmin();
      const keep = load().settings || [];
      mem = Object.fromEntries(TABLES.map((t) => [t, clone(data[t] || [])]));
      if (!data.settings) mem.settings = keep;
      save();
    },

    async runnerView(code) {
      const me = byCode(code); autoPromote(); const d = load();
      return clone({
        me: { id: me.id, name: me.name, category: me.category }, today: todayISO(),
        my_results: d.results.filter((x) => x.runner_id === me.id).map((x) => {
          const r = d.races.find((y) => y.id === x.race_id);
          return r && { race_id: r.id, name: r.name, date: r.date, end_date: r.end_date || null, place: r.place, province: r.province,
            country: r.country, modality: r.modality, stages: r.stages || null, race_type: r.race_type || 'suelta', circuit: r.circuit || null, subtype: r.subtype || null, km: r.km ?? null, elevation: r.elevation ?? null, price: r.price ?? null, lat: r.lat ?? null, lon: r.lon ?? null, geo_key: r.geo_key ?? null,
            notes: r.notes || null, mine_created: r.created_by === me.id, others: d.results.filter((y) => y.race_id === r.id && y.runner_id !== me.id).length,
            category: x.category, position: x.position,
            podium_type: x.podium_type, stage_positions: x.stage_positions || null, time_seconds: x.time_seconds || null, self_reported: !!x.self_reported };
        }).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name)),
        circuits: (d.circuit_podiums || []).filter((c) => c.runner_id === me.id).map(({ runner_id, created_at, ...c }) => c),
        bonus: (() => { // igual que runner_view en la base de datos
          const year = new Date().getFullYear();
          const cfg = (d.settings || []).find((x) => x.key === 'bonus')?.value?.[year] || null;
          const days = (x) => numDays(x.date, x.end_date);
          const { nuevos = [], ...pub } = cfg || {};
          return {
            extra: (d.circuit_podiums || []).filter((c) => c.runner_id === me.id && c.year === year && c.status === 'confirmado').length * (cfg?.circuitExtra ?? 4),
            year, config: cfg ? pub : null, contract: me.contract || null,
            nuevo: me.contract === 'nuevo' || (!me.contract && nuevos.includes(me.id)),
            done: d.results.filter((x) => x.runner_id === me.id).map((x) => d.races.find((r) => r.id === x.race_id))
              .filter((r) => r && yearOf(r.date) === year).reduce((n, r) => n + days(r), 0)
              + d.registration_entries.filter((e) => e.runner_id === me.id && e.self_position).map((e) => d.registrations.find((g) => g.id === e.registration_id))
                .filter((g) => g && !g.suspended && yearOf(g.date) === year).reduce((n, g) => n + days(g), 0),
            planned: d.registration_entries.filter((e) => e.runner_id === me.id && !e.self_position).map((e) => d.registrations.find((g) => g.id === e.registration_id))
              .filter((g) => g && !g.suspended && yearOf(g.date) === year).reduce((n, g) => n + days(g), 0),
            suspended: d.registration_entries.filter((e) => e.runner_id === me.id).map((e) => d.registrations.find((g) => g.id === e.registration_id))
              .filter((g) => g && g.suspended && yearOf(g.date) === year).reduce((n, g) => n + days(g), 0),
          };
        })(),
        registrations: [...d.registrations].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)).map((g) => ({
          ...g, mine_created: g.created_by === me.id, url_mine: !!g.url && g.url_by === me.id,
          my_result: (() => { const e = d.registration_entries.find((x) => x.registration_id === g.id && x.runner_id === me.id && x.self_position);
            return e ? { position: e.self_position, podium_type: e.self_podium_type, time_seconds: e.self_time_seconds || null } : null; })(),
          entries: d.registration_entries.filter((e) => e.registration_id === g.id).map((e) => {
            const rn = d.runners.find((r) => r.id === e.runner_id);
            return { runner_id: e.runner_id, name: rn?.name, category: e.category, paid: !!e.paid_at, paid_amount: e.runner_id === me.id ? (e.paid_amount ?? null) : null,
              paid_on: e.runner_id === me.id && e.paid_at ? String(e.paid_at).slice(0, 10) : null, joined_on: e.runner_id === me.id && e.created_at ? String(e.created_at).slice(0, 10) : null };
          }).sort((a, b) => a.name.localeCompare(b.name)),
        })),
      });
    },
    async runnerReport(code, kind, id, position, category, podiumType, timeSeconds) {
      const me = byCode(code); const d = load();
      if (!Number.isInteger(position) || position < 1) throw new Error('puesto_no_valido');
      if (timeSeconds != null && (!Number.isInteger(timeSeconds) || timeSeconds < 1 || timeSeconds > 3600000)) throw new Error('tiempo_no_valido');
      const pod = position <= 3 ? (podiumType || 'suelta') : null;
      if (kind === 'reg') {
        const e = d.registration_entries.find((x) => x.registration_id === id && x.runner_id === me.id);
        const g = d.registrations.find((x) => x.id === id);
        if (g?.suspended) throw new Error('carrera_suspendida');
        if (!e || !g || g.date > todayISO()) throw new Error('no_es_tuya');
        const old = e.self_position;
        Object.assign(e, { self_position: position, self_podium_type: pod, self_time_seconds: timeSeconds || null, self_reported_at: new Date().toISOString() });
        if (category) e.category = category;
        logc(me.name, 'resultado', old ? `cambió su resultado: ${old}º → ${position}º en ${g.name}` : `puso su resultado: ${position}º en ${g.name}`);
      } else {
        const r = d.results.find((x) => x.race_id === id && x.runner_id === me.id);
        if (!r) throw new Error('no_es_tuya');
        const old = r.position;
        Object.assign(r, { position, podium_type: pod || 'suelta', time_seconds: timeSeconds || null, self_reported: true });
        if (category) r.category = category;
        logc(me.name, 'resultado', old ? `cambió su resultado: ${old}º → ${position}º en ${d.races.find((x) => x.id === id)?.name}` : `puso su resultado: ${position}º en ${d.races.find((x) => x.id === id)?.name}`);
      }
      d.correction_requests = (d.correction_requests || []).filter((c) => !(c.runner_id === me.id && c.target_id === id && c.status === 'pendiente'));
      save();
    },
    async runnerUpdate(code, id, reg) {
      const me = byCode(code); const d = load();
      const g = d.registrations.find((x) => x.id === id && x.created_by === me.id);
      if (!g) throw new Error('no_es_tuya');
      const name = String(reg.name || '').replace(/\s+/g, ' ').trim();
      if (name.length < 3) throw new Error('nombre_no_valido');
      if (!reg.date) throw new Error('fecha_no_valida');
      if (d.registrations.some((x) => x.id !== id && x.date === reg.date && x.name.toLowerCase() === name.toLowerCase())) throw new Error('ya_existe');
      Object.assign(g, fields({ ...reg, name })); save();
    },
    async runnerDelete(code, id) {
      const me = byCode(code); const d = load();
      if (!d.registrations.some((x) => x.id === id && x.created_by === me.id)) throw new Error('no_es_tuya');
      if (d.registration_entries.some((e) => e.registration_id === id && e.runner_id !== me.id)) throw new Error('otros_apuntados');
      d.registrations = d.registrations.filter((x) => x.id !== id);
      d.registration_entries = d.registration_entries.filter((e) => e.registration_id !== id); save();
    },
    async runnerUpdateRace(code, id, race) {
      const me = byCode(code); const d = load();
      const r = d.races.find((x) => x.id === id && x.created_by === me.id);
      if (!r) throw new Error('no_es_tuya');
      const name = String(race.name || '').replace(/\s+/g, ' ').trim();
      if (name.length < 3 || name.length > 120) throw new Error('nombre_no_valido');
      if (!race.date || race.date < pastLimit() || race.date > todayISO()) throw new Error('fecha_no_valida');
      if (race.end_date && (race.end_date < race.date || numDays(race.date, race.end_date) > 31)) throw new Error('fecha_no_valida');
      if (d.races.some((x) => x.id !== id && x.date === race.date && x.name.toLowerCase() === name.toLowerCase())) throw new Error('ya_existe');
      Object.assign(r, fields({ ...race, name }));
      logc(me.name, 'update', `cambió la carrera ${name}`); save();
    },
    async runnerDeleteRace(code, id) {
      const me = byCode(code); const d = load();
      const r = d.races.find((x) => x.id === id && x.created_by === me.id);
      if (!r) throw new Error('no_es_tuya');
      if (d.results.some((x) => x.race_id === id && x.runner_id !== me.id)) throw new Error('otros_apuntados');
      d.races = d.races.filter((x) => x.id !== id);
      d.results = d.results.filter((x) => x.race_id !== id);
      logc(me.name, 'delete', `borró la carrera ${r.name} (${r.date})`); save();
    },
    async setChronicle(runnerId, key, done) {
      requireAdmin(); const d = load(); d.chronicles = (d.chronicles || []).filter((x) => !(x.runner_id === runnerId && x.race_key === key));
      if (done) d.chronicles.push({ runner_id: runnerId, race_key: key, done_at: new Date().toISOString() });
      save();
    },
    async saveGeo(kind, id, geo) { requireAdmin(); const d = load(); const x = (kind === 'reg' ? d.registrations : d.races).find((r) => r.id === id); if (x) { Object.assign(x, { lat: geo.lat, lon: geo.lon, geo_key: geo.geo_key }); save(); } },
    async runnerSetUrl(code, regId, url) {
      const me = byCode(code), d = load(), g = d.registrations.find((x) => x.id === regId);
      if (!g) throw new Error('no_existe');
      const u = cleanWeb(url); if (u === '!') throw new Error('enlace_web_no_valido');
      g.url = u; g.url_by = u ? me.id : null; save();
    },
    async runnerWatchList(code) { const me = byCode(code); return clone((load().runner_watch || []).filter((w) => w.runner_id === me.id).map(({ runner_id, ...w }) => w).sort((a, b) => a.date.localeCompare(b.date))); },
    async runnerWatchSave(code, id, data) {
      const me = byCode(code), d = load(); d.runner_watch = d.runner_watch || [];
      const name = String(data.name || '').replace(/\s+/g, ' ').trim();
      if (name.length < 3 || name.length > 120) throw new Error('nombre_no_valido');
      if (!data.date || data.date < pastLimit()) throw new Error('fecha_no_valida');
      if (data.end_date && data.end_date < data.date) throw new Error('fecha_no_valida');
      if (data.deadline && data.deadline > data.date) throw new Error('plazo_no_valido');
      if (data.url && !/^https?:\/\/\S+$/i.test(String(data.url).trim())) throw new Error('enlace_web_no_valido');
      const price = data.price === '' || data.price == null ? null : Number(data.price);
      if (price != null && !(price >= 0 && price <= 10000)) throw new Error('precio_no_valido');
      const km = parseKm(data.km);
      const row = { name, date: data.date, end_date: data.end_date && data.end_date !== data.date ? data.end_date : null, place: String(data.place || '').trim() || null, province: String(data.province || '').trim() || null,
        country: String(data.country || '').trim() || null, modality: data.modality || 'Carretera', subtype: data.subtype || null, km, url: String(data.url || '').trim() || null, price, deadline: data.deadline || null,
        notes: String(data.notes || '').trim().slice(0, 500) || null, elevation: parseElev(data.elevation) };
      if (!id) {
        const same = d.runner_watch.find((w) => w.runner_id === me.id && w.date === row.date && normName(w.name) === normName(name));
        if (same) return same.id;
        if (d.runner_watch.filter((w) => w.runner_id === me.id).length >= 60) throw new Error('demasiadas_guardadas');
        const w = { id: uuid(), runner_id: me.id, created_at: new Date().toISOString(), ...row }; d.runner_watch.push(w); publishWatch(d, row, me.id); save(); return w.id;
      }
      const w = d.runner_watch.find((x) => x.id === id && x.runner_id === me.id); if (!w) throw new Error('no_encontrada');
      Object.assign(w, row); publishWatch(d, row, me.id); cleanCandidates(d); save(); return w.id;
    },
    async runnerWatchDelete(code, id) { const me = byCode(code), d = load(); d.runner_watch = (d.runner_watch || []).filter((w) => !(w.id === id && w.runner_id === me.id)); cleanCandidates(d); save(); },
    async runnerPing(code) { const me = byCode(code); me.last_seen = new Date().toISOString(); save(); },
    async runnerChronicles(code) { const me = byCode(code); return clone((load().chronicles || []).filter((x) => x.runner_id === me.id).map((x) => x.race_key)); },
    async runnerSocialImpact(code) {
      byCode(code); const d = load(); const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const days = (d.ig_snapshots || []).filter((x) => x.kind === 'day' && x.key >= from);
      const sum = (k) => days.reduce((n, x) => n + (Number(x.data?.[k]) || 0), 0);
      const acc = (d.ig_snapshots || []).filter((x) => x.kind === 'account').sort((a, b) => b.key.localeCompare(a.key))[0];
      return { posted: (d.social_posts || []).map((x) => x.key), from, ig: (d.ig_snapshots || []).length ? { days: days.length, views: sum('views'), reach_avg: days.length ? Math.round(sum('reach') / days.length) : 0, interactions: sum('interactions'), follows: sum('follows'), followers: acc?.data?.followers ?? null } : null };
    },
    async runnerChroniclesTeam(code) {
      const me = byCode(code), d = load(), by = new Map();
      for (const x of d.chronicles || []) { const cur = by.get(x.race_key); const nm = d.runners.find((r) => r.id === x.runner_id)?.name || '?'; if (!cur || (x.runner_id === me.id && !cur.mine)) by.set(x.race_key, { key: x.race_key, by: nm, mine: x.runner_id === me.id || !!cur?.mine }); else if (x.runner_id === me.id) cur.mine = true; }
      return clone([...by.values()]);
    },
    async runnerSetChronicle(code, key, done) {
      const me = byCode(code), d = load(); d.chronicles = (d.chronicles || []).filter((x) => !(x.runner_id === me.id && x.race_key === key));
      if (done) d.chronicles.push({ runner_id: me.id, race_key: key, done_at: new Date().toISOString() });
      save();
    },
    async runnerTeam(code) {
      byCode(code); const d = load();
      return clone({
        runners: d.runners.map((r) => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name)),
        races: d.races.map((r) => ({ id: r.id, name: r.name, date: r.date, end_date: r.end_date || null, place: r.place, province: r.province,
          country: r.country, modality: r.modality, stages: r.stages || null, race_type: r.race_type || 'suelta', circuit: r.circuit || null, subtype: r.subtype || null, km: r.km ?? null, elevation: r.elevation ?? null, price: r.price ?? null, lat: r.lat ?? null, lon: r.lon ?? null, geo_key: r.geo_key ?? null,
          results: d.results.filter((x) => x.race_id === r.id).map((x) => ({ runner_id: x.runner_id, runner_name: x.runner_name,
            category: x.category, position: x.position, podium_type: x.podium_type, stage_positions: x.stage_positions || null, time_seconds: x.time_seconds || null })) })),
      });
    },
    async runnerCreate(code, reg, category) {
      const me = byCode(code); const d = load();
      const name = String(reg.name || '').replace(/\s+/g, ' ').trim();
      if (name.length < 3 || name.length > 120) throw new Error('nombre_no_valido');
      if (!reg.date || reg.date < pastLimit()) throw new Error('fecha_no_valida');
      if (reg.end_date && reg.end_date < reg.date) throw new Error('fecha_no_valida');
      const race = reg.date < todayISO() && d.races.find((x) => x.date === reg.date && normName(x.name) === normName(name));
      if (race) { // ya está en resultados: se le añade a esa
        if (!d.results.some((x) => x.race_id === race.id && x.runner_id === me.id)) d.results.push({ id: uuid(), race_id: race.id, runner_id: me.id, runner_name: me.name, category: category || null, position: null, podium_type: 'suelta' });
        save(); return race.id;
      }
      let g = d.registrations.find((x) => x.date === reg.date && normName(x.name) === normName(name));
      if (!g) {
        g = { id: uuid(), created_at: new Date().toISOString(), created_by: me.id, ...fields({ ...reg, name }) };
        if (g.url) g.url_by = me.id;
        d.registrations.push(g);
      }
      if (reg.url && cleanWeb(reg.url) !== '!' && !g.url) { g.url = cleanWeb(reg.url); g.url_by = me.id; }
      if (g.elevation == null && parseElev(reg.elevation)) g.elevation = parseElev(reg.elevation);
      if (g.price == null && parsePrice(reg.price) != null) g.price = parsePrice(reg.price);
      d.registration_entries = d.registration_entries.filter((e) => !(e.registration_id === g.id && e.runner_id === me.id));
      d.registration_entries.push({ registration_id: g.id, runner_id: me.id, category: category || null, created_at: new Date().toISOString() });
      g.candidate = false;
      if (g.created_by === me.id) logc(me.name, 'insert', `creó la inscripción ${g.name} (${g.date})`);
      save(); return g.id;
    },
    async runnerJoin(code, regId, category) {
      const me = byCode(code); openReg(regId); const d = load();
      const prev = d.registration_entries.find((e) => e.registration_id === regId && e.runner_id === me.id); // como la base de datos: solo cambia la categoría
      d.registration_entries = d.registration_entries.filter((e) => !(e.registration_id === regId && e.runner_id === me.id));
      d.registration_entries.push({ ...(prev || { created_at: new Date().toISOString() }), registration_id: regId, runner_id: me.id, category: category || null });
      const gj = d.registrations.find((x) => x.id === regId); if (gj) gj.candidate = false;
      save();
    },
    async runnerSetPaid(code, regId, paid, amount, date) {
      const me = byCode(code); const d = load();
      const e = d.registration_entries.find((x) => x.registration_id === regId && x.runner_id === me.id);
      if (!e) throw new Error('no_inscrito');
      if (amount != null && (!(amount >= 0) || amount > 10000)) throw new Error('importe_no_valido');
      if (paid) { e.paid_at = date ? `${date}T12:00:00.000Z` : (e.paid_at || new Date().toISOString()); e.paid_amount = amount ?? null; } else { e.paid_at = null; e.paid_amount = null; }
      save();
    },
    async runnerJoinRace(code, raceId, category) {
      const me = byCode(code); const d = load();
      const race = d.races.find((x) => x.id === raceId);
      if (!race || race.date > todayISO() || race.date < pastLimit()) throw new Error('inscripcion_cerrada');
      if (!d.results.some((x) => x.race_id === raceId && x.runner_id === me.id)) {
        d.results.push({ id: uuid(), race_id: raceId, runner_id: me.id, runner_name: me.name, category: category || null, position: null, podium_type: 'suelta' });
        logc(me.name, 'la_hizo', `se añadió a ${race.name} (la hizo)`);
      }
      save();
    },
    async runnerSetDetails(code, id, subtype, km) {
      const me = byCode(code); const g = load().registrations.find((x) => x.id === id && x.created_by === me.id);
      if (!g) throw new Error('no_es_tuya');
      Object.assign(g, detailFields({ modality: g.modality, subtype, km })); save();
    },
    async runnerSetType(code, id, type, circuit) {
      const me = byCode(code); const g = load().registrations.find((x) => x.id === id && x.created_by === me.id);
      if (!g) throw new Error('no_es_tuya');
      Object.assign(g, typeFields({ race_type: type, circuit })); save();
    },
    async runnerProposeCircuit(code, circuit, year, position, scope) {
      const me = byCode(code); const d = load(); d.circuit_podiums = d.circuit_podiums || [];
      const name = String(circuit || '').replace(/\s+/g, ' ').trim();
      if (name.length < 3) throw new Error('nombre_no_valido');
      if (![1, 2, 3].includes(position)) throw new Error('puesto_no_valido');
      if (d.circuit_podiums.some((c) => c.runner_id === me.id && c.year === year && c.circuit.toLowerCase() === name.toLowerCase())) throw new Error('ya_existe');
      const row = { id: uuid(), runner_id: me.id, year, circuit: name, position, scope: scope || 'categoria', status: 'pendiente', by_runner: true, created_at: new Date().toISOString() };
      d.circuit_podiums.push(row); save(); return row.id;
    },
    async runnerCancelCircuit(code, id) {
      const me = byCode(code); const d = load();
      if (!(d.circuit_podiums || []).some((c) => c.id === id && c.runner_id === me.id && c.status === 'pendiente')) throw new Error('no_es_tuya');
      d.circuit_podiums = d.circuit_podiums.filter((c) => c.id !== id); save();
    },
    async runnerLeave(code, regId) {
      const me = byCode(code); const g = openReg(regId); const d = load();
      if (g.date < todayISO() && d.registration_entries.some((e) => e.registration_id === regId && e.runner_id === me.id && e.self_position)) throw new Error('inscripcion_cerrada');
      d.registration_entries = d.registration_entries.filter((e) => !(e.registration_id === regId && e.runner_id === me.id));
      save();
    },
  };
}
