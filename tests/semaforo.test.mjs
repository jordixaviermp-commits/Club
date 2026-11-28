import test from 'node:test';
import assert from 'node:assert/strict';
import { preLight, postLight, lightRank, alDia } from '../js/logic.js';

test('semáforo antes de la carrera: rojo a 2 días o menos, naranja hasta 7, verde después', () => {
  assert.equal(preLight(0), 'red'); assert.equal(preLight(1), 'red'); assert.equal(preLight(2), 'red');
  assert.equal(preLight(3), 'amber'); assert.equal(preLight(7), 'amber'); assert.equal(preLight(8), 'green'); assert.equal(preLight(60), 'green');
  assert.equal(preLight(-1), 'red');   // la carrera ya ha empezado
});
test('semáforo antes: el pago sin marcar sube a rojo a 3 días o menos', () => {
  assert.equal(preLight(3, { paid: false }), 'red'); assert.equal(preLight(4, { paid: false }), 'amber'); assert.equal(preLight(3, { paid: true }), 'amber');
});
test('semáforo después: una semana desde la carrera; rojo cuando quedan 2 días o menos o ya pasó', () => {
  assert.equal(postLight(0), 'amber'); assert.equal(postLight(4), 'amber'); assert.equal(postLight(5), 'red'); assert.equal(postLight(7), 'red'); assert.equal(postLight(30), 'red');
  assert.equal(postLight(30, true), 'green');
});
test('orden del semáforo', () => {
  assert.deepEqual(['green', 'red', 'amber', null].sort((a, b) => lightRank(a) - lightRank(b)), ['red', 'amber', 'green', null]);
});
test('alDia: cada tarea trae su color', () => {
  const d = { me: { id: 'u1' }, registrations: [
    { id: 'r1', name: 'Pasada', date: '2026-11-20', suspended: false, my_result: null, entries: [{ runner_id: 'u1', paid: true }] },
    { id: 'r2', name: 'Pronto', date: '2026-12-01', suspended: false, entries: [{ runner_id: 'u1', paid: false }] },
    { id: 'r3', name: 'Lejos', date: '2026-12-05', suspended: false, entries: [{ runner_id: 'u1', paid: false }] }], my_results: [] };
  const out = alDia(d, null, '2026-11-28', 2026).items;
  assert.equal(out.find((x) => x.id === 'r1').light, 'red');    // hace 8 días: plazo pasado
  assert.equal(out.find((x) => x.id === 'r2').light, 'red');    // pago sin marcar, faltan 3 días
  assert.equal(out.find((x) => x.id === 'r3').light, 'amber');  // pago sin marcar, faltan 7 días
});
