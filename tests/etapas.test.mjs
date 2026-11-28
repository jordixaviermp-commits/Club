import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultStages, cleanStages, stageTotals } from '../js/logic.js';

test('etapas: una por día como punto de partida', () => {
  assert.deepEqual(defaultStages('2027-03-08', '2027-03-11').map((e) => e.date), ['2027-03-08', '2027-03-09', '2027-03-10', '2027-03-11']);
  assert.equal(defaultStages('2027-03-08', '2027-03-11')[3].name, 'Etapa 4');
  assert.deepEqual(defaultStages('2027-03-08', null), []);                      // una carrera de un día no tiene etapas
});

test('etapas: limpieza y validación (mismas reglas que la base de datos)', () => {
  const ok = cleanStages([{ name: '  Prólogo ', date: '2027-03-08', km: '12,5', elevation: '1.200' }, { name: '', date: '2027-03-09' }], '2027-03-08', '2027-03-11');
  assert.deepEqual(ok, [{ name: 'Prólogo', date: '2027-03-08', km: 12.5, elevation: 1200 }, { name: 'Etapa 2', date: '2027-03-09' }]);
  assert.equal(cleanStages([], '2027-03-08', '2027-03-11'), null);
  assert.throws(() => cleanStages([{ date: '2027-03-12' }], '2027-03-08', '2027-03-11'));      // fuera de la carrera
  assert.throws(() => cleanStages([{ date: '2027-03-08' }], '2027-03-08', null));               // un solo día
  assert.equal(cleanStages([{ date: '2027-03-08', km: 5000, elevation: 90000 }], '2027-03-08', '2027-03-09')[0].km, undefined);   // valores absurdos se ignoran
});

test('etapas: el total solo existe si todas las etapas tienen el dato', () => {
  const full = [{ km: 80.5, elevation: 2100 }, { km: 75, elevation: 1900 }, { km: 90, elevation: 2500 }, { km: 65, elevation: 1500 }];
  assert.deepEqual(stageTotals(full), { n: 4, km: 310.5, elevation: 8000, withKm: 4, withElevation: 4 });
  const partial = [{ km: 80.5 }, { name: 'x' }];
  assert.equal(stageTotals(partial).km, null); assert.equal(stageTotals(partial).withKm, 1);
  assert.deepEqual(stageTotals(null), { n: 0, km: null, elevation: null, withKm: 0, withElevation: 0 });
});

test('cleanStages: se guardan siempre por orden de día (y a igual día, como llegaron)', () => {
  const out = cleanStages([{ name: 'C', date: '2027-03-10' }, { name: 'A', date: '2027-03-08' }, { name: 'B', date: '2027-03-08' }], '2027-03-08', '2027-03-11');
  assert.deepEqual(out.map((x) => x.name), ['A', 'B', 'C']);
});
