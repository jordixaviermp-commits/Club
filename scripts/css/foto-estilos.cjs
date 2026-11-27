// Fotografía el estilo calculado de TODOS los elementos de muchas pantallas. Uso: SP=... OUT=archivo.json node snap.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:8125/';
const MODES = [
  { id: 'c360', w: 360, h: 780, scheme: 'light' },
  { id: 'd360', w: 360, h: 780, scheme: 'dark' },
  { id: 'c320', w: 320, h: 700, scheme: 'light' },
  { id: 'c768', w: 768, h: 900, scheme: 'light' },
];
const ADMIN = ['hoy', 'inscripciones', 'corredores', 'resumen', 'redes', 'cronicas', 'medios', 'contratos', 'memoria', 'avisos', 'mensajes', 'calidad', 'actividad', 'semana', 'instagram', 'publicaciones', 'computo', 'historia', 'movimientos', 'noticias', 'carreras', 'federaciones', 'inscripciones/nueva'];
const RUNNER = ['', 'federaciones', 'mi', 'mi#hechas', 'mi/valorar', 'contrato', 'equipo', 'equipo#imp', 'noticias', 'resultado/reg_ux-1', 'carrera/ux-1', 'nueva', 'dlg:profile', 'dlg:cronica', 'dlg:pago', 'dlg:apuntado'];

const hashFn = `(() => {
  const cyrb = (s) => { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36); };
  const names = Array.from(getComputedStyle(document.body)).sort();
  const out = [];
  document.querySelectorAll('body *').forEach((el, i) => {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
    const cs = getComputedStyle(el); let s = '';
    for (const k of names) s += cs.getPropertyValue(k) + '|';
    for (const ps of ['::before', '::after']) { const b = getComputedStyle(el, ps); s += b.content + b.display + b.width + b.height + b.backgroundColor + b.color + b.position + b.borderTopWidth + b.top + b.left + b.right + b.bottom + b.transform; }
    const r = el.getBoundingClientRect(); s += Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + ',' + Math.round(r.height);
    out.push([i + ':' + el.tagName.toLowerCase() + '.' + String(el.getAttribute('class') || '').slice(0, 60), cyrb(s), window.__KEEP ? s : '']);
  });
  return out;
})()`;

async function newCtx(b, m) {
  const ctx = await b.newContext({ viewport: { width: m.w, height: m.h }, deviceScaleFactor: 1, colorScheme: m.scheme });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  await p.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await p.route('**/js/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'export const CONFIG={SUPABASE_URL:"",SUPABASE_KEY:""};' }));
  return { ctx, p };
}
async function seed(p) {
  await p.goto(BASE); await p.click('text=Entrar como dirección (demo)'); await p.waitForTimeout(700);
  return await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('monzon-demo-v1')); const me = d.runners[0];
    const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
    d.registrations.push({ id: 'ux-1', name: 'Marxa de Prova', date: day(2), place: 'Binéfar', province: 'Huesca', modality: 'Carretera', subtype: 'Ciclodeportiva', km: 95, elevation: 1100, price: 25, suspended: false, race_type: 'suelta' });
    d.registration_entries.push({ registration_id: 'ux-1', runner_id: me.id, category: 'M40', paid: true });
    d.registrations.push({ id: 'ux-2', name: 'Marxa Compartida', date: day(6), place: 'Binéfar', province: 'Huesca', modality: 'Carretera', subtype: 'Ciclodeportiva', km: 95, elevation: 1100, price: 25, suspended: false, race_type: 'suelta' });
    d.registration_entries.push({ registration_id: 'ux-2', runner_id: me.id, category: 'M40', paid: true, self_position: 3, self_general_position: 9, self_time_seconds: 6500, self_reported_at: new Date().toISOString() });
    d.chronicles = d.chronicles || []; d.chronicles.push({ runner_id: me.id, race_key: `${day(6)}|marxa compartida`, done_at: new Date().toISOString() });
    d.chronicle_posts = [{ id: 'cp-s1', runner_id: me.id, race_key: `${day(6)}|marxa compartida`, race_name: 'Marxa Compartida', race_date: day(6), body: 'Buena carrera.', final_text: '🏁 Marxa Compartida\n\nUna gran carrera.\n\n#CCMonzón', status: 'publicada', photos: 0, created_at: '2026-11-20T10:00:00Z', updated_at: '2026-11-20T10:00:00Z', published_at: '2026-11-21T10:00:00Z', post_url: 'https://www.instagram.com/p/X/' }];
    d.registrations.push({ id: 'ux-3', name: 'Prova Pagar', date: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), place: 'Lleida', province: 'Lleida', modality: 'Carretera', subtype: 'Ciclodeportiva', km: 70, elevation: 600, price: 25, suspended: false, race_type: 'suelta' });
    d.registration_entries.push({ registration_id: 'ux-3', runner_id: me.id, category: 'M40', paid: false });
    localStorage.setItem('monzon-demo-v1', JSON.stringify(d)); return me.code;
  });
}
async function snapPage(p, label, out) {
  await p.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' }).catch(() => {});
  await p.evaluate(() => document.fonts.ready); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(500); await p.evaluate(() => document.fonts.ready);
  if (process.env.DETAIL) await p.evaluate(() => { window.__KEEP = true; });
  out[label] = await p.evaluate(hashFn);
  if (process.env.DETAIL) out[label + '|detail'] = await p.evaluate(() => { const names = Array.from(getComputedStyle(document.body)).sort(); return [0, 1, 2, 3].map((idx) => { const el = document.querySelectorAll('body *')[idx]; const cs = getComputedStyle(el); const o = {}; for (const k of names) o[k] = cs.getPropertyValue(k); const rr = el.getBoundingClientRect(); o.__rect = [rr.x, rr.y, rr.width, rr.height].join(','); return o; }); });
}
(async () => {
  const b = await chromium.launch(); const out = {}; const errs = [];
  for (const m of MODES.filter((x) => !process.env.ONLY || process.env.ONLY.split(',').includes(x.id))) {
    // ---- dirección
    {
      const { ctx, p } = await newCtx(b, m); p.on('pageerror', (e) => errs.push(e.message));
      await seed(p);
      for (const v of (process.env.ADMIN_LIST !== undefined ? process.env.ADMIN_LIST.split(',').filter(Boolean) : ADMIN)) {
        try { await p.goto(BASE + '#/' + v); await p.waitForTimeout(1300); await snapPage(p, `${m.id}|admin|${v}`, out); } catch (e) { errs.push(`admin ${v}: ${e.message.slice(0, 80)}`); }
      }
      await ctx.close();
    }
    // ---- corredor
    {
      const { ctx, p } = await newCtx(b, m); p.on('pageerror', (e) => errs.push(e.message));
      const code = await seed(p);
      await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.endsWith('-admin')) localStorage.removeItem(k); });
      await p.goto(BASE + '#/c/' + code); await p.reload(); await p.waitForTimeout(1400);
      for (const v of (process.env.RUN_LIST !== undefined ? process.env.RUN_LIST.split(',') : RUNNER)) {
        try {
          const label = `${m.id}|run|${v}`;
          if (v.startsWith('dlg:')) {
            await p.goto(BASE + '#/mi'); await p.waitForTimeout(1300);
            if (v === 'dlg:profile') await p.click('.logo-btn');
            else if (v === 'dlg:cronica') { await p.click('[data-act="cal-tab"][data-t="hechas"]'); await p.waitForTimeout(300); await p.click('.mt-chip[data-t="cron"]'); }
            else if (v === 'dlg:pago') await p.click('.mt-chip[data-act="r-paid"]');
            else if (v === 'dlg:apuntado') { await p.goto(BASE + '#/'); await p.waitForTimeout(1200); const c = await p.$('details.rcard:has-text("Gran Fondo")'); await c.$eval('summary', (s) => s.click()); await p.waitForTimeout(300); await c.$eval('[data-act="r-join"]', (x) => x.click()); }
            await p.waitForTimeout(700); await snapPage(p, label, out); await p.keyboard.press('Escape'); await p.waitForTimeout(200); continue;
          }
          const [route, tab] = v.split('#');
          await p.goto(BASE + '#/' + route); await p.waitForTimeout(1500);
          if (tab === 'hechas') { await p.click('[data-act="cal-tab"][data-t="hechas"]'); await p.waitForTimeout(300); }
          if (tab === 'imp') { await p.click('[data-act="eq-tab"][data-t="imp"]'); await p.waitForTimeout(800); }
          await snapPage(p, label, out);
          if (route === '') { // una ficha abierta y los filtros
            const c = await p.$('details.rcard'); if (c) { await c.$eval('summary', (s) => s.click()); await p.waitForTimeout(300); await snapPage(p, `${label}|ficha`, out); }
          }
          if (route === 'mi') { await p.$$eval('#sec-cal details.rcard', (e) => e.forEach((x) => { x.open = true; })); await p.waitForTimeout(300); await snapPage(p, `${label}|abiertas`, out); }
        } catch (e) { errs.push(`run ${v}: ${e.message.slice(0, 80)}`); }
      }
      await ctx.close();
    }
  }
  fs.writeFileSync(process.env.OUT, JSON.stringify(out));
  console.log('pantallas:', Object.keys(out).length, '| elementos:', Object.values(out).reduce((n, a) => n + a.length, 0), '| avisos:', errs.length, errs.slice(0, 6));
  await b.close();
})();
