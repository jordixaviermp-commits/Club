import test from 'node:test';
import assert from 'node:assert/strict';
import { demoApi } from '../js/api.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('limpieza (modo demo): borra hasta el año elegido y conserva lo posterior y lo que se prolonga', async () => {
  const st = memory(), api = demoApi(st);
  await api.signIn();
  const me = (await api.loadAll()).runners[0];
  const d = JSON.parse(st.getItem('monzon-demo-v1'));
  d.races.push({ id: 'a', name: 'Antigua 2023', date: '2023-05-01' }, { id: 'b', name: 'Continua', date: '2024-12-30', end_date: '2025-01-02' }, { id: 'c', name: 'De 2025', date: '2025-06-01' });
  d.results.push({ id: 'ra', race_id: 'a', runner_id: me.id, runner_name: me.name, position: 3 }, { id: 'rb', race_id: 'b', runner_id: me.id, runner_name: me.name, position: 2 }, { id: 'rc', race_id: 'c', runner_id: me.id, runner_name: me.name, position: 1 });
  d.registrations.push({ id: 'g', name: 'Insc 2024', date: '2024-03-01' });
  d.registration_entries.push({ registration_id: 'g', runner_id: me.id });
  d.car_offers = [{ id: 'o', registration_id: 'g', driver_id: me.id, seats: 2 }]; d.runner_notes = [{ runner_id: me.id, registration_id: 'g', note: 'hotel' }];
  d.chronicles = [{ runner_id: me.id, race_key: '2024-12-10|x' }, { runner_id: me.id, race_key: '2025-06-01|de 2025' }];
  d.social_posts = [{ key: '2024-12-10|x' }, { key: 'res|2024-12-10|x' }, { key: '2025-06-01|de 2025' }];
  d.change_log = [{ id: 'l1', at: '2024-05-05T10:00:00Z', summary: 'vieja' }, { id: 'l2', at: new Date().toISOString(), summary: 'reciente' }];
  st.setItem('monzon-demo-v1', JSON.stringify(d));
  const api2 = demoApi(st); await api2.signIn();

  const n = await api2.adminPurgeCounts(2024);
  assert.equal(n.races, 1); assert.equal(n.results, 1); assert.equal(n.regs, 1); assert.equal(n.cars, 1); assert.equal(n.notes, 1); assert.equal(n.marks, 3); assert.equal(n.log, 1);
  await assert.rejects(() => api2.adminPurge(2024, ['todo']), /datos_no_validos/);
  await assert.rejects(() => api2.adminPurgeCounts(1800), /datos_no_validos/);
  await api2.adminPurge(2024, ['marks']);                                                    // solo marcas: las carreras siguen
  let now = JSON.parse(st.getItem('monzon-demo-v1'));
  assert.ok(now.races.some((r) => r.id === 'a')); assert.equal(now.chronicles.length, 1); assert.equal(now.social_posts.length, 1);
  const r = await api2.adminPurge(2024, ['races', 'regs', 'marks', 'log']);
  now = JSON.parse(st.getItem('monzon-demo-v1'));
  assert.ok(!now.races.some((x) => x.id === 'a')); assert.ok(now.races.some((x) => x.id === 'b'), 'la que se prolonga a 2025 se conserva'); assert.ok(now.races.some((x) => x.id === 'c'));
  assert.deepEqual(now.results.filter((x) => ['ra', 'rb', 'rc'].includes(x.id)).map((x) => x.id).sort(), ['rb', 'rc']);
  assert.ok(!now.registrations.some((g) => g.id === 'g')); assert.equal(now.car_offers.length, 0); assert.equal(now.runner_notes.length, 0);
  assert.ok(!now.change_log.some((x) => x.summary === 'vieja')); assert.ok(now.change_log.some((x) => x.summary === 'reciente')); assert.ok(now.change_log.some((x) => /borró datos hasta 2024/.test(x.summary)));
  assert.equal(r.upto, 2024); assert.equal(r.counts.races, 1);
});
