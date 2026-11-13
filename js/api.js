// Acceso a datos. Dos versiones con la misma interfaz:
//  - Supabase (real), cuando config.js tiene URL y clave.
//  - Demostración, guardada solo en este navegador, para probar la app sin montar nada.
import { newCode, todayISO, pastLimit, numDays, yearOf, SUBTYPES, parseKm } from './logic.js';

const TABLES = ['runners', 'registrations', 'registration_entries', 'races', 'results', 'settings', 'circuit_podiums', 'announcements', 'announcement_replies', 'correction_requests', 'social_posts'];
const OPTIONAL = new Set(['settings', 'circuit_podiums', 'announcements', 'announcement_replies', 'correction_requests', 'social_posts']); // tablas que pueden faltar si aún no se ha ejecutado su SQL

/** Mensajes de error comprensibles. */
export function friendlyError(e) {
  const msg = String(e?.message || e || '');
  if (/enlace_no_valido/.test(msg)) return 'Este enlace ya no es válido. Pide uno nuevo a la dirección del club.';
  if (/resultado_ya_puesto/.test(msg)) return 'Ya pusiste tu resultado en esta carrera. Si hay que corregirlo, pídeselo a la dirección del club.';
  if (/puesto_no_valido/.test(msg)) return 'Pon un puesto válido (1, 2, 3…).';
  if (/tiempo_no_valido/.test(msg)) return 'Pon un tiempo válido, por ejemplo 2:05:30 (horas:minutos:segundos).';
  if (/PGRST202|runner_report_result/.test(msg) && /tiempo|schema cache|Could not find/i.test(msg)) return 'Para guardar el tiempo falta activarlo en la base de datos. Avisa a la dirección (o guarda el resultado sin tiempo).';
  if (/carrera_suspendida/.test(msg)) return 'Esta carrera se ha suspendido: no se puede poner resultado ni pasarla a resultados.';
  if (/otros_apuntados/.test(msg)) return 'No puedes borrarla: hay más compañeros apuntados. Pídeselo a la dirección del club.';
  if (/plus_confirmado/.test(msg)) return 'La dirección ya ha confirmado este plus, así que no se puede retirar. Si hay un error, díselo a la dirección.';
  if (/no_es_tuya/.test(msg)) return 'Solo puedes cambiar las carreras que has añadido tú.';
  if (/ya_existe/.test(msg)) return 'Ya existe: otra carrera con ese nombre ese día, un circuito ya comunicado o una petición tuya pendiente.';
  if (/sin_cambios/.test(msg)) return 'Eso es lo mismo que ya pusiste: cambia el puesto, la categoría o el tipo de podio.';
  if (/nombre_no_valido/.test(msg)) return 'Pon un nombre de carrera de al menos 3 letras.';
  if (/fecha_no_valida/.test(msg)) return 'Revisa las fechas: desde el 1 de enero del año pasado hasta, como mucho, dentro de dos años.';
  if (/demasiadas_carreras/.test(msg)) return 'Hoy ya has añadido muchas carreras. Si necesitas más, pídeselo a la dirección.';
  if (/inscripcion_cerrada/.test(msg)) return 'Ya no se puede cambiar: es una carrera demasiado antigua o ya has puesto tu resultado. Pídeselo a la dirección del club.';
  if (/solo_direccion|permission denied|42501/.test(msg)) return 'No tienes permiso para hacer esto.';
  if (/Invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.';
  if (/duplicate key|unique/i.test(msg)) return 'Hay un corredor repetido en la misma carrera.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sin conexión. Revisa la cobertura y vuelve a intentarlo.';
  return msg || 'Error desconocido.';
}

/** Formato (Critérium, XCM…) y km de la carrera, listos para guardar. */
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
      return id;
    },
    async deleteRegistration(id) { ok(await sb.from('registrations').delete().eq('id', id)); },
    async promoteRegistration(id) { return ok(await sb.rpc('promote_registration', { p_id: id })); },

    async saveRace(race, results) {
      const id = ok(await sb.rpc('save_race', { p_race: race, p_results: results }));
      await sb.from('races').update(typeFields(race)).eq('id', id);
      await sb.from('races').update(detailFields(race)).eq('id', id);
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
    async runnerCreate(code, reg, category) { return ok(await sb.rpc('runner_create_registration', { p_code: code, p_reg: reg, p_category: category || null })); },
    async runnerJoin(code, regId, category) { ok(await sb.rpc('runner_join', { p_code: code, p_registration: regId, p_category: category || null })); },
    async runnerLeave(code, regId) { ok(await sb.rpc('runner_leave', { p_code: code, p_registration: regId })); },
    async runnerJoinRace(code, raceId, category) { ok(await sb.rpc('runner_join_race', { p_code: code, p_race: raceId, p_category: category || null })); },
    async autoPromote() { try { return ok(await sb.rpc('auto_promote_registrations')); } catch { return 0; } },
    async runnerComplete(code, kind, id, data) { ok(await sb.rpc('runner_complete_race', { p_code: code, p_kind: kind, p_id: id, p_data: data })); },
    async listChanges() { try { return ok(await sb.from('change_log').select('*').order('at', { ascending: false }).limit(300)); } catch { return null; } },
    async socialView(code) { return ok(await sb.rpc('social_view', { p_code: code })); },
    async socialMark(code, key, posted) { ok(await sb.rpc('social_mark', { p_code: code, p_key: key, p_posted: !!posted })); },
    async listPosts() { try { return ok(await sb.from('social_posts').select('key,posted_at,posted_by').limit(1000)); } catch { return null; } },
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
  ];
  return {
    runners,
    registrations: registrations.map(({ entries, ...g }) => g),
    registration_entries: registrations.flatMap((g) => g.entries.map((e) => ({ registration_id: g.id, ...e }))),
    races: races.map(({ results, ...r }) => r),
    results: races.flatMap((r) => r.results.map((x) => ({ race_id: r.id, ...x }))),
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
  /** Pasa solas a resultados las inscripciones disputadas hace más de 3 días con algún puesto puesto por un inscrito. */
  const autoPromote = () => {
    const d = load(); const t = new Date(); t.setDate(t.getDate() - 3); const limit = todayISO(t); let n = 0;
    for (const g of [...d.registrations]) {
      if (g.suspended || (g.end_date || g.date) >= limit) continue;
      const ents = d.registration_entries.filter((e) => e.registration_id === g.id && e.self_position);
      if (!ents.length) continue;
      const { created_by, created_at, ...rest } = g;
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
  const fields = (o) => ({
    name: String(o.name || '').trim(), date: o.date, end_date: o.end_date && o.end_date > o.date ? o.end_date : null, place: o.place?.trim() || null, province: o.province?.trim() || null,
    country: o.country?.trim() || null, modality: o.modality || 'Carretera', notes: o.notes?.trim() || null,
    ...(o.race_type !== undefined ? typeFields(o) : {}),
    ...(o.suspended !== undefined ? { suspended: !!o.suspended } : {}),
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

    async loadAll() { requireAdmin(); autoPromote(); return clone(nest({ circuit_podiums: [], announcements: [], announcement_replies: [], correction_requests: [], social_posts: [], ...load() })); },
    async autoPromote() { requireAdmin(); return autoPromote(); },
    async listChanges() { requireAdmin(); return clone([...(load().change_log || [])].sort((a, b) => b.at.localeCompare(a.at))); },
    async runnerComplete(code, kind, id, data) {
      const me = byCode(code); const d = load();
      const x = kind === 'reg' ? d.registrations.find((g) => g.id === id) : d.races.find((r) => r.id === id);
      const mine = kind === 'reg' ? (d.registration_entries.some((e) => e.registration_id === id && e.runner_id === me.id) || x?.created_by === me.id)
        : d.results.some((r) => r.race_id === id && r.runner_id === me.id);
      if (!x || !mine) throw new Error('no_es_tuya');
      const done = [];
      const fill = (k, v) => { if (v === null || v === undefined || v === '') return; if (x[k] === null || x[k] === undefined || x[k] === '') { x[k] = v; done.push(`${k}: ${v}`); } };
      fill('place', String(data.place || '').trim()); fill('province', String(data.province || '').trim());
      fill('subtype', SUBTYPES[x.modality]?.includes(data.subtype) ? data.subtype : null); fill('km', parseKm(data.km));
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
          yes_count: all.filter((r) => r.answer === 'si').reduce((c, r) => c + 1 + r.guests, 0), no_count: all.filter((r) => r.answer === 'no').length };
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
          .map((g) => ({ ...base(g), people: d.registration_entries.filter((e) => e.registration_id === g.id).map((e) => nm(e.runner_id)).filter(Boolean).sort((p, q) => p.localeCompare(q)) })),
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

    async exportAll() { requireAdmin(); return { app: 'cc-monzon', version: 1, exported_at: new Date().toISOString(), ...clone(load()) }; },
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
            country: r.country, modality: r.modality, stages: r.stages || null, race_type: r.race_type || 'suelta', circuit: r.circuit || null, subtype: r.subtype || null, km: r.km ?? null,
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
          ...g, mine_created: g.created_by === me.id,
          my_result: (() => { const e = d.registration_entries.find((x) => x.registration_id === g.id && x.runner_id === me.id && x.self_position);
            return e ? { position: e.self_position, podium_type: e.self_podium_type, time_seconds: e.self_time_seconds || null } : null; })(),
          entries: d.registration_entries.filter((e) => e.registration_id === g.id).map((e) => {
            const rn = d.runners.find((r) => r.id === e.runner_id);
            return { runner_id: e.runner_id, name: rn?.name, category: e.category };
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
        if (e.self_position) throw new Error('resultado_ya_puesto');
        Object.assign(e, { self_position: position, self_podium_type: pod, self_time_seconds: timeSeconds || null, self_reported_at: new Date().toISOString() });
        if (category) e.category = category;
        logc(me.name, 'resultado', `puso su resultado: ${position}º en ${g.name}`);
      } else {
        const r = d.results.find((x) => x.race_id === id && x.runner_id === me.id);
        if (!r) throw new Error('no_es_tuya');
        if (r.position) throw new Error('resultado_ya_puesto');
        Object.assign(r, { position, podium_type: pod || 'suelta', time_seconds: timeSeconds || null, self_reported: true });
        if (category) r.category = category;
        logc(me.name, 'resultado', `puso su resultado: ${position}º en ${d.races.find((x) => x.id === id)?.name}`);
      }
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
    async runnerTeam(code) {
      byCode(code); const d = load();
      return clone({
        runners: d.runners.map((r) => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name)),
        races: d.races.map((r) => ({ id: r.id, name: r.name, date: r.date, end_date: r.end_date || null, place: r.place, province: r.province,
          country: r.country, modality: r.modality, stages: r.stages || null, race_type: r.race_type || 'suelta', circuit: r.circuit || null, subtype: r.subtype || null, km: r.km ?? null,
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
      const race = reg.date < todayISO() && d.races.find((x) => x.date === reg.date && x.name.toLowerCase() === name.toLowerCase());
      if (race) { // ya está en resultados: se le añade a esa
        if (!d.results.some((x) => x.race_id === race.id && x.runner_id === me.id)) d.results.push({ id: uuid(), race_id: race.id, runner_id: me.id, runner_name: me.name, category: category || null, position: null, podium_type: 'suelta' });
        save(); return race.id;
      }
      let g = d.registrations.find((x) => x.date === reg.date && x.name.toLowerCase() === name.toLowerCase());
      if (!g) {
        g = { id: uuid(), created_at: new Date().toISOString(), created_by: me.id, ...fields({ ...reg, name }) };
        d.registrations.push(g);
      }
      d.registration_entries = d.registration_entries.filter((e) => !(e.registration_id === g.id && e.runner_id === me.id));
      d.registration_entries.push({ registration_id: g.id, runner_id: me.id, category: category || null, created_at: new Date().toISOString() });
      if (g.created_by === me.id) logc(me.name, 'insert', `creó la inscripción ${g.name} (${g.date})`);
      save(); return g.id;
    },
    async runnerJoin(code, regId, category) {
      const me = byCode(code); openReg(regId); const d = load();
      d.registration_entries = d.registration_entries.filter((e) => !(e.registration_id === regId && e.runner_id === me.id));
      d.registration_entries.push({ registration_id: regId, runner_id: me.id, category: category || null, created_at: new Date().toISOString() });
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
