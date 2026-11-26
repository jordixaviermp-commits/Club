import test from 'node:test';
import assert from 'node:assert/strict';
import { yearSummary, importantOf, generalOf, IMPORTANT_KINDS } from '../js/logic.js';

const runners = [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Bernat' }];
const races = [
  { id: 'r1', name: 'Open Osona', date: '2026-03-01', modality: 'BTT', race_type: 'circuito', circuit: 'Open BTT', results: [
    { runner_id: 'a', runner_name: 'Anna', category: 'M40', position: 1, general_position: 2, podium_type: 'suelta' },
    { runner_id: 'b', runner_name: 'Bernat', category: 'M30', position: 5, general_position: 14, podium_type: 'suelta' }] },
  { id: 'r2', name: 'Campionat de Catalunya', date: '2026-05-10', modality: 'Carretera', race_type: 'campeonato', results: [
    { runner_id: 'a', runner_name: 'Anna', category: 'M40', position: 3, general_position: 9, podium_type: 'campeonato' },
    { runner_id: 'b', runner_name: 'Bernat', category: 'M30', position: 2, general_position: 3, podium_type: 'campeonato' }] },
  { id: 'r3', name: 'Marxa', date: '2026-06-01', modality: 'BTT', race_type: 'suelta', results: [
    { runner_id: 'a', runner_name: 'Anna', category: 'M40', position: 8, general_position: null, podium_type: 'suelta' }] },
  { id: 'r4', name: 'Cursa 2025', date: '2025-06-01', modality: 'BTT', results: [{ runner_id: 'a', runner_name: 'Anna', category: 'M40', position: 1, general_position: 1, podium_type: 'suelta' }] },
];

test('general: puesto válido o null', () => {
  assert.equal(generalOf({ general_position: 12 }), 12);
  assert.equal(generalOf({ general_position: 0 }), null); assert.equal(generalOf({}), null); assert.equal(generalOf(null), null);
});

test('podios importantes: campeonato, circuito y podio absoluto (sin contar dos veces una participación)', () => {
  const parts = races.slice(0, 3).flatMap((race) => race.results.map((res) => ({ race, res })));
  const im = importantOf(parts);
  assert.equal(im.length, 3);                                                         // Anna en el Open (circuito + absoluto), Anna y Bernat en el campeonato (Bernat también absoluto)
  const find = (race, runner) => im.find((x) => x.race.id === race && x.res.runner_id === runner);
  assert.deepEqual(find('r1', 'a').kinds, ['circuito', 'absoluto']);                   // 1º M40 en un circuito y 2º absoluto
  assert.deepEqual(find('r2', 'a').kinds, ['campeonato']);                             // 3º de categoría en el campeonato, 9º absoluto
  assert.deepEqual(find('r2', 'b').kinds, ['campeonato', 'absoluto']);                 // 2º de categoría y 3º absoluto
  assert.equal(find('r1', 'b'), undefined); assert.equal(find('r3', 'a'), undefined);  // ni podio ni circuito ni absoluto
  assert.ok(IMPORTANT_KINDS.every((k) => k.label && k.short));
});

test('estadísticas del año con la clasificación general', () => {
  const s = yearSummary(2026, races, runners);
  assert.equal(s.totals.participations, 5);
  assert.equal(s.totals.genRecorded, 4); assert.equal(s.totals.genPodiums, 2); assert.equal(s.totals.genWins, 0);
  assert.equal(s.totals.genTop10, 3); assert.equal(s.totals.genBest, 2); assert.equal(s.totals.important, 3);
  const a = s.perRunner.find((r) => r.key === 'a'), b = s.perRunner.find((r) => r.key === 'b');
  assert.deepEqual([a.gen, a.genPod, a.top10, a.genBest, a.imp], [3 - 1, 1, 2, 2, 2]);
  assert.deepEqual([b.gen, b.genPod, b.top10, b.genBest, b.imp], [2, 1, 1, 3, 1]);
  assert.equal(s.podiumList.find((p) => p.runner === 'Anna' && p.raceId === 'r1').general, 2);
  assert.equal(yearSummary(2025, races, runners).totals.genWins, 1);                   // el año anterior no se mezcla
  assert.equal(yearSummary(2024, races, runners).totals.genBest, null);
});

test('CSV: el puesto general viaja en la exportación y se lee al importar (y no rompe los CSV antiguos)', async () => {
  const { csvRows, toCsv, importResultsCsv } = await import('../js/logic.js');
  const csv = toCsv(csvRows([races[0]]));
  assert.match(csv, /;Puesto general\r\n/); assert.match(csv, /;2\r\n/);                // Anna: 2º en la general
  const back = importResultsCsv(csv);
  assert.deepEqual(back.errors, []);
  const anna = back.races[0].results.find((x) => x.runner_name === 'Anna'), bernat = back.races[0].results.find((x) => x.runner_name === 'Bernat');
  assert.equal(anna.general_position, 2); assert.equal(bernat.general_position, 14);
  // CSV antiguo (sin la columna) sigue entrando
  const old = 'Fecha;Carrera;Corredor;Puesto\n2026-03-01;Open;Anna;1\n';
  const o = importResultsCsv(old);
  assert.deepEqual(o.errors, []); assert.equal(o.races[0].results[0].general_position, undefined);
  // general menor que su categoría: se ignora con aviso
  const bad = importResultsCsv('Fecha;Carrera;Corredor;Puesto;Puesto general\n2026-03-01;Open;Anna;5;2\n');
  assert.equal(bad.races[0].results[0].general_position, undefined); assert.equal(bad.errors.length, 1);
});
