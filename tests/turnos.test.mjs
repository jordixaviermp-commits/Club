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
  // fuera del calendario no hay turnos (empieza el 1 de diciembre de 2026)
  assert.equal(uspacShift('E4', '2026-11-30'), null); assert.equal(uspacShift('E4', '2028-02-01'), null);
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

test('turnos USPAC: desde el 1 de diciembre de 2026 el mismo ciclo sigue hacia atrás sin saltos', () => {
  const c = (d) => uspacShift('E4', d)?.code;
  // 1/12/2026 es martes (semana del lunes 30/11); el primer día con turno es el 1/12
  assert.ok(uspacShift('E4', '2026-12-01'));
  // la semana anterior al 1/2/2027 (lunes 25/1) es la 1.ª del ciclo: para el escamot 4, fiesta
  assert.deepEqual(['2027-01-25', '2027-01-29', '2027-01-30', '2027-01-31'].map(c), ['F', 'F', 'F', 'F']);
  // el ciclo se repite cada 5 semanas: 1/2/2027 menos 5 semanas (28/12/2026) = igual que 1/2/2027
  assert.equal(c('2026-12-28'), c('2027-02-01')); assert.equal(uspacShift('E4', '2026-12-28').week, uspacShift('E4', '2027-02-01').week);
  // fin de semana correcto antes del ancla: el sábado 5/12 y el domingo 6/12 siguen la regla (semana N → TN, M → D, resto F)
  for (const d of ['2026-12-05', '2026-12-06']) { const sh = uspacShift('E4', d), wk = uspacShift('E4', '2026-12-04'); assert.equal(sh.week, wk.week); assert.equal(sh.code, wk.week === 'N' ? 'TN' : wk.week === 'M' ? 'D' : 'F'); }
  // cada semana desde diciembre los 5 escamots siguen cubriendo M, T, N y dos de fiesta
  for (let w = 0; w < 9; w++) {
    const d = new Date(Date.UTC(2026, 11, 1 + w * 7, 12)).toISOString().slice(0, 10);
    assert.equal(USPAC_GROUPS.map((g) => uspacShift(g, d).week).sort().join(''), 'FFMNT', `semana del ${d}`);
  }
});
