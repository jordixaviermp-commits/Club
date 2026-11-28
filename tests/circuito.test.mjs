import test from 'node:test';
import assert from 'node:assert/strict';
import { LAP_SUBTYPES, isLapRace, circuitTotals } from '../js/logic.js';

test('formatos de circuito cerrado: XCO y Critérium', () => {
  assert.deepEqual(LAP_SUBTYPES, ['XCO', 'Critérium']);
  assert.equal(isLapRace('XCO'), true); assert.equal(isLapRace('Critérium'), true);
  assert.equal(isLapRace('XCM'), false); assert.equal(isLapRace(''), false);
});
test('circuitTotals: vuelta × vueltas', () => {
  assert.deepEqual(circuitTotals('10', '50', '8'), { laps: 8, km: 80, elevation: 400 });
  assert.deepEqual(circuitTotals('4,5', '120', '6'), { laps: 6, km: 27, elevation: 720 });
  assert.deepEqual(circuitTotals('1,3', '', '7'), { laps: 7, km: 9.1, elevation: null });
});
test('circuitTotals: sin vueltas válidas no hay totales', () => {
  for (const laps of ['', '0', '-2', '2,5', 'abc', '501']) assert.deepEqual(circuitTotals('10', '50', laps), { laps: null, km: null, elevation: null });
});
test('circuitTotals: límites de km y desnivel', () => {
  assert.equal(circuitTotals('300', '10', '4').km, null);       // 1200 km
  assert.equal(circuitTotals('1', '3000', '4').elevation, null); // 12 000 m
});
