import test from 'node:test';
import assert from 'node:assert/strict';
import { uspacShift, USPAC_GROUPS } from '../js/logic.js';

test('turnos USPAC: ciclo de 5 semanas del escamot 4 (calendario 2027-28)', () => {
  const c = (d) => uspacShift('E4', d)?.code;
  // semana del 1/2/2027: mañana (lun-vie) y D el fin de semana
  assert.deepEqual(['2027-02-01', '2027-02-05', '2027-02-06', '2027-02-07'].map(c), ['M', 'M', 'D', 'D']);
  // 8/2 fiesta · 15/2 tarde · 22/2 noche (TN el fin de semana) · 1/3 fiesta · 8/3 vuelve la mañana
  assert.deepEqual(['2027-02-08', '2027-02-12', '2027-02-13'].map(c), ['F', 'F', 'F']);
  assert.deepEqual(['2027-02-15', '2027-02-19', '2027-02-20'].map(c), ['T', 'T', 'F']);
  assert.deepEqual(['2027-02-22', '2027-02-26', '2027-02-27', '2027-02-28'].map(c), ['N', 'N', 'TN', 'TN']);
  assert.deepEqual(['2027-03-01', '2027-03-08'].map(c), ['F', 'M']);
  // fuera del calendario no hay turnos
  assert.equal(uspacShift('E4', '2027-01-31'), null); assert.equal(uspacShift('E4', '2028-02-01'), null);
  assert.ok(uspacShift('E4', '2028-01-31'));                                // el último día sí tiene turno
  assert.equal(uspacShift('', '2027-03-01'), null); assert.equal(uspacShift('E9', '2027-03-01'), null);
});

test('turnos USPAC: cada semana los 5 escamots cubren M, T, N y dos de fiesta', () => {
  for (let w = 0; w < 52; w++) {
    const d = new Date(Date.UTC(2027, 1, 1 + w * 7, 12)).toISOString().slice(0, 10);
    const weeks = USPAC_GROUPS.map((g) => uspacShift(g, d).week).sort().join('');
    assert.equal(weeks, 'FFMNT', `semana ${w + 1} (${d})`);
  }
});
