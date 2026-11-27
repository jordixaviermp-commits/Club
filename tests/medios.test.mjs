import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonRaces, mediaStats, MEDIA_KINDS, postKeyOf } from '../js/logic.js';

const races = [{ id: 'r1', name: 'Marxa del Montseny', date: '2026-03-09', place: 'Sant Celoni' }, { id: 'r2', name: 'Gravel Pirineus', date: '2026-06-08' }, { id: 'r0', name: 'Vieja', date: '2025-05-01' }];
const regs = [{ id: 'g1', name: 'Prova 3', date: '2026-11-24', suspended: false, entries: [{ runner_id: 'a' }] },
  { id: 'g2', name: 'Futura', date: '2027-01-10', entries: [{ runner_id: 'a' }] },
  { id: 'g3', name: 'Suspendida', date: '2026-10-10', suspended: true, entries: [{ runner_id: 'a' }] },
  { id: 'g4', name: 'Sin gente', date: '2026-10-12', entries: [] },
  { id: 'g5', name: 'Gravel Pirineus', date: '2026-06-08', entries: [{ runner_id: 'a' }] }];

test('las carreras de la temporada: con resultados + ya disputadas sin pasar a resultados, sin repetir', () => {
  const l = seasonRaces(races, regs, 2026, '2026-11-27');
  assert.deepEqual(l.map((r) => r.name), ['Marxa del Montseny', 'Gravel Pirineus', 'Prova 3']);
  assert.equal(l[0].key, postKeyOf(races[0]));
});

test('estadística de medios: apariciones, medios distintos, por tipo y por mes', () => {
  const l = seasonRaces(races, regs, 2026, '2026-11-27');
  const m = [
    { race_key: l[0].key, race_name: 'Marxa del Montseny', race_date: '2026-03-09', medium: 'Diario del Alto Aragón', kind: 'prensa', published_on: '2026-03-11' },
    { race_key: l[0].key, race_name: 'Marxa del Montseny', race_date: '2026-03-09', medium: 'Radio Monzón', kind: 'radio', published_on: '2026-03-10' },
    { race_key: l[1].key, race_name: 'Gravel Pirineus', race_date: '2026-06-08', medium: 'diario del alto aragon ', kind: 'prensa', published_on: '2026-06-10' },
    { race_key: '2025-05-01|vieja', race_name: 'Vieja', race_date: '2025-05-01', medium: 'Otro año', kind: 'tv', published_on: '2025-05-02' },
  ];
  const s = mediaStats(m, l, 2026);
  assert.equal(s.total, 3);
  assert.equal(s.media, 2, 'el mismo diario escrito distinto cuenta una vez');
  assert.deepEqual(s.byMedium.map((x) => [x.name, x.n]), [['Diario del Alto Aragón', 2], ['Radio Monzón', 1]]);
  assert.equal(s.byKind.prensa, 2); assert.equal(s.byKind.radio, 1); assert.equal(s.byKind.tv, 0);
  assert.equal(s.byMonth[2], 2); assert.equal(s.byMonth[5], 1);
  assert.equal(s.coveredN, 2); assert.equal(s.racesN, 3); assert.equal(s.pct, 67);
  assert.deepEqual(s.uncovered.map((r) => r.name), ['Prova 3']);
  assert.equal(s.rows[0].published_on, '2026-06-10', 'lo más reciente primero');
});

test('sin datos: todo a cero y todas las carreras sin medios', () => {
  const l = seasonRaces(races, regs, 2026, '2026-11-27');
  const s = mediaStats([], l, 2026);
  assert.equal(s.total, 0); assert.equal(s.pct, 0); assert.equal(s.uncovered.length, 3);
  assert.equal(mediaStats(null, [], 2026).pct, 0);
  assert.equal(MEDIA_KINDS.length, 5);
});
