// Acceso a datos. Dos versiones con la misma interfaz:
//  - Supabase (real), cuando config.js tiene URL y clave.
//  - Demostración, guardada solo en este navegador, para probar la app sin montar nada.
import { newCode, todayISO, numDays, yearOf } from './logic.js';

const TABLES = ['runners', 'registrations', 'registration_entries', 'races', 'results', 'settings'];

/** Mensajes de error comprensibles. */
export function friendlyError(e) {
  const msg = String(e?.message || e || '');
  if (/enlace_no_valido/.test(msg)) return 'Este enlace ya no es válido. Pide uno nuevo a la dirección del club.';
  if (/otros_apuntados/.test(msg)) return 'No puedes borrarla: hay más compañeros apuntados. Pídeselo a la dirección del club.';
  if (/no_es_tuya/.test(msg)) return 'Solo puedes cambiar las carreras que has añadido tú.';
  if (/ya_existe/.test(msg)) return 'Ya hay otra carrera con ese nombre ese mismo día.';
  if (/nombre_no_valido/.test(msg)) return 'Pon un nombre de carrera de al menos 3 letras.';
  if (/fecha_no_valida/.test(msg)) return 'Revisa las fechas: tiene que ser una carrera de hoy en adelante (como mucho dentro de dos años).';
  if (/demasiadas_carreras/.test(msg)) return 'Hoy ya has añadido muchas carreras. Si necesitas más, pídeselo a la dirección.';
  if (/inscripcion_cerrada/.test(msg)) return 'Esta carrera ya ha pasado: no se puede cambiar la inscripción.';
  if (/solo_direccion|permission denied|42501/.test(msg)) return 'No tienes permiso para hacer esto.';
  if (/Invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.';
  if (/duplicate key|unique/i.test(msg)) return 'Hay un corredor repetido en la misma carrera.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sin conexión. Revisa la cobertura y vuelve a intentarlo.';
  return msg || 'Error desconocido.';
}

function nest(data) {
  const entriesBy = new Map(), resultsBy = new Map();
  for (const e of data.registration_entries) (entriesBy.get(e.registration_id) || entriesBy.set(e.registration_id, []).get(e.registration_id)).push(e);
  for (const r of data.results) (resultsBy.get(r.race_id) || resultsBy.set(r.race_id, []).get(r.race_id)).push(r);
  return {
    runners: data.runners,
    registrations: data.registrations.map((g) => ({ ...g, entries: entriesBy.get(g.id) || [] })),
    races: data.races.map((r) => ({ ...r, results: resultsBy.get(r.id) || [] })),
    settings: Object.fromEntries((data.settings || []).map((x) => [x.key, x.value])),
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
    try { return [t, await all(t)]; } catch (e) { if (t === 'settings') return [t, []]; throw e; } // antes de actualizar el SQL
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
    async regenerateCode(id) { ok(await sb.from('runners').update({ code: newCode() }).eq('id', id)); },
    async deleteRunner(id, anonymize) { ok(await sb.rpc('delete_runner', { p_id: id, p_anonymize: anonymize })); },

    async saveRegistration(reg, entries) { return ok(await sb.rpc('save_registration', { p_reg: reg, p_entries: entries })); },
    async deleteRegistration(id) { ok(await sb.from('registrations').delete().eq('id', id)); },
    async promoteRegistration(id) { return ok(await sb.rpc('promote_registration', { p_id: id })); },

    async saveRace(race, results) { return ok(await sb.rpc('save_race', { p_race: race, p_results: results })); },
    async deleteRace(id) { ok(await sb.from('races').delete().eq('id', id)); },

    async exportAll() { return { app: 'cc-monzon', version: 1, exported_at: new Date().toISOString(), ...(await rawAll()) }; },
    async importAll(data) { ok(await sb.rpc('import_backup', { p: data })); },

    async runnerView(code) { return ok(await sb.rpc('runner_view', { p_code: code })); },
    async runnerTeam(code) { return ok(await sb.rpc('runner_team', { p_code: code })); },
    async runnerUpdate(code, id, reg) { ok(await sb.rpc('runner_update_registration', { p_code: code, p_id: id, p_reg: reg })); },
    async runnerDelete(code, id) { ok(await sb.rpc('runner_delete_registration', { p_code: code, p_id: id })); },
    async runnerCreate(code, reg, category) { return ok(await sb.rpc('runner_create_registration', { p_code: code, p_reg: reg, p_category: category || null })); },
    async runnerJoin(code, regId, category) { ok(await sb.rpc('runner_join', { p_code: code, p_registration: regId, p_category: category || null })); },
    async runnerLeave(code, regId) { ok(await sb.rpc('runner_leave', { p_code: code, p_registration: regId })); },
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
  const fields = (o) => ({
    name: String(o.name || '').trim(), date: o.date, end_date: o.end_date && o.end_date > o.date ? o.end_date : null, place: o.place?.trim() || null, province: o.province?.trim() || null,
    country: o.country?.trim() || null, modality: o.modality || 'Carretera', notes: o.notes?.trim() || null,
    ...(o.stages !== undefined ? { stages: o.stages?.length ? o.stages : null } : {}) });
  const byCode = (code) => {
    const r = load().runners.find((x) => x.code === code);
    if (!r) throw new Error('enlace_no_valido');
    return r;
  };
  const openReg = (id) => {
    const g = load().registrations.find((x) => x.id === id);
    if (!g || g.date < todayISO()) throw new Error('inscripcion_cerrada');
    return g;
  };

  return {
    mode: 'demo',
    async session() { return admin ? { email: 'demo', isAdmin: true } : null; },
    async signIn() { admin = true; try { storage.setItem(DEMO_KEY + '-admin', '1'); } catch { /* nada */ } },
    async signOut() { admin = false; try { storage.removeItem(DEMO_KEY + '-admin'); } catch { /* nada */ } },
    async resetDemo() { mem = demoSeed(); save(); },

    async loadAll() { requireAdmin(); return clone(nest(load())); },
    async addRunners(list) {
      requireAdmin();
      for (const r of list) load().runners.push({ id: uuid(), name: r.name, category: r.category || null, code: newCode(), created_at: new Date().toISOString(), contract: r.contract || null });
      save();
    },
    async updateRunner(id, patch) { requireAdmin(); Object.assign(load().runners.find((r) => r.id === id), patch); save(); },
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
      d.registration_entries = d.registration_entries.filter((e) => e.registration_id !== g.id)
        .concat(entries.map((e) => ({ registration_id: g.id, runner_id: e.runner_id, category: e.category || null, created_at: null })));
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
      const race = { ...g, id: uuid() };
      d.races.push(race);
      for (const e of d.registration_entries.filter((x) => x.registration_id === id)) {
        const rn = d.runners.find((r) => r.id === e.runner_id);
        d.results.push({ id: uuid(), race_id: race.id, runner_id: e.runner_id, runner_name: rn.name, category: e.category, position: null, podium_type: 'suelta' });
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
        position: x.position ?? null, podium_type: x.podium_type || 'suelta', stage_positions: x.stage_positions || null })));
      save(); return r.id;
    },
    async deleteRace(id) {
      requireAdmin(); const d = load();
      d.races = d.races.filter((r) => r.id !== id);
      d.results = d.results.filter((r) => r.race_id !== id);
      save();
    },

    async exportAll() { requireAdmin(); return { app: 'cc-monzon', version: 1, exported_at: new Date().toISOString(), ...clone(load()) }; },
    async importAll(data) {
      requireAdmin();
      const keep = load().settings || [];
      mem = Object.fromEntries(TABLES.map((t) => [t, clone(data[t] || [])]));
      if (!data.settings) mem.settings = keep;
      save();
    },

    async runnerView(code) {
      const me = byCode(code); const d = load();
      return clone({
        me: { id: me.id, name: me.name, category: me.category }, today: todayISO(),
        my_results: d.results.filter((x) => x.runner_id === me.id).map((x) => {
          const r = d.races.find((y) => y.id === x.race_id);
          return r && { race_id: r.id, name: r.name, date: r.date, end_date: r.end_date || null, place: r.place, province: r.province,
            country: r.country, modality: r.modality, stages: r.stages || null, category: x.category, position: x.position,
            podium_type: x.podium_type, stage_positions: x.stage_positions || null };
        }).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name)),
        bonus: (() => { // igual que runner_view en la base de datos
          const year = new Date().getFullYear();
          const cfg = (d.settings || []).find((x) => x.key === 'bonus')?.value?.[year] || null;
          const days = (x) => numDays(x.date, x.end_date);
          const { nuevos = [], ...pub } = cfg || {};
          return {
            year, config: cfg ? pub : null, contract: me.contract || null,
            nuevo: me.contract === 'nuevo' || (!me.contract && nuevos.includes(me.id)),
            done: d.results.filter((x) => x.runner_id === me.id).map((x) => d.races.find((r) => r.id === x.race_id))
              .filter((r) => r && yearOf(r.date) === year).reduce((n, r) => n + days(r), 0),
            planned: d.registration_entries.filter((e) => e.runner_id === me.id).map((e) => d.registrations.find((g) => g.id === e.registration_id))
              .filter((g) => g && yearOf(g.date) === year).reduce((n, g) => n + days(g), 0),
          };
        })(),
        registrations: [...d.registrations].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)).map((g) => ({
          ...g, mine_created: g.created_by === me.id, entries: d.registration_entries.filter((e) => e.registration_id === g.id).map((e) => {
            const rn = d.runners.find((r) => r.id === e.runner_id);
            return { runner_id: e.runner_id, name: rn?.name, category: e.category };
          }).sort((a, b) => a.name.localeCompare(b.name)),
        })),
      });
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
          country: r.country, modality: r.modality, stages: r.stages || null,
          results: d.results.filter((x) => x.race_id === r.id).map((x) => ({ runner_id: x.runner_id, runner_name: x.runner_name,
            category: x.category, position: x.position, podium_type: x.podium_type, stage_positions: x.stage_positions || null })) })),
      });
    },
    async runnerCreate(code, reg, category) {
      const me = byCode(code); const d = load();
      const name = String(reg.name || '').replace(/\s+/g, ' ').trim();
      if (name.length < 3 || name.length > 120) throw new Error('nombre_no_valido');
      if (!reg.date || reg.date < todayISO()) throw new Error('fecha_no_valida');
      if (reg.end_date && reg.end_date < reg.date) throw new Error('fecha_no_valida');
      let g = d.registrations.find((x) => x.date === reg.date && x.name.toLowerCase() === name.toLowerCase());
      if (!g) {
        g = { id: uuid(), created_at: new Date().toISOString(), created_by: me.id, ...fields({ ...reg, name }) };
        d.registrations.push(g);
      }
      d.registration_entries = d.registration_entries.filter((e) => !(e.registration_id === g.id && e.runner_id === me.id));
      d.registration_entries.push({ registration_id: g.id, runner_id: me.id, category: category || null, created_at: new Date().toISOString() });
      save(); return g.id;
    },
    async runnerJoin(code, regId, category) {
      const me = byCode(code); openReg(regId); const d = load();
      d.registration_entries = d.registration_entries.filter((e) => !(e.registration_id === regId && e.runner_id === me.id));
      d.registration_entries.push({ registration_id: regId, runner_id: me.id, category: category || null, created_at: new Date().toISOString() });
      save();
    },
    async runnerLeave(code, regId) {
      const me = byCode(code); openReg(regId); const d = load();
      d.registration_entries = d.registration_entries.filter((e) => !(e.registration_id === regId && e.runner_id === me.id));
      save();
    },
  };
}
