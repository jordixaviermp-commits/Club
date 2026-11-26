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

test('API de Supabase: mezcla los puestos generales en runner_view y runner_team (y sigue valiendo sin el SQL)', async () => {
  const { supabaseApi } = await import('../js/api.js');
  const calls = [];
  const view = { me: { id: 'me' }, my_results: [{ race_id: 'r1' }, { race_id: 'r2' }], registrations: [{ id: 'g1', my_result: { position: 3 } }, { id: 'g2', my_result: null }] };
  const team = { races: [{ id: 'r1', results: [{ runner_id: 'me' }, { runner_id: 'otro' }] }, { id: 'r2', results: [{ runner_id: 'otro' }] }] };
  let generals = { regs: { g1: 9 }, results: [['r1', 'me', 12], ['r1', 'otro', 4], ['r2', 'me', 30]] };
  globalThis.window = { supabase: { createClient: () => ({ auth: {}, rpc: async (name, args) => { calls.push(name); if (name === 'runner_generals') { if (!generals) return { data: null, error: { message: 'Could not find the function public.runner_generals' } }; return { data: generals, error: null }; }
    return { data: name === 'runner_view' ? JSON.parse(JSON.stringify(view)) : JSON.parse(JSON.stringify(team)), error: null }; } }) } };
  const api = supabaseApi('https://x.supabase.co', 'k');
  const v = await api.runnerView('c');
  assert.deepEqual(v.my_results.map((r) => r.general_position), [12, 30]);               // solo los suyos
  assert.equal(v.registrations[0].my_result.general_position, 9); assert.equal(v.registrations[1].my_result, null);
  const t = await api.runnerTeam('c');
  assert.deepEqual(t.races[0].results.map((x) => x.general_position), [12, 4]); assert.equal(t.races[1].results[0].general_position, undefined);
  generals = null;                                                                        // sin el SQL: todo igual que antes
  const v2 = await api.runnerView('c'); assert.equal(v2.my_results[0].general_position, undefined); assert.equal(v2.me.id, 'me');
  delete globalThis.window;
});

test('datos incompletos: desde la fecha de corte, un resultado sin tiempo o sin puesto general deja la carrera incompleta', async () => {
  const { raceGaps, FULL_RESULTS_FROM, SOFT_GAPS } = await import('../js/logic.js');
  const base = { province: 'Lleida', modality: 'Carretera', subtype: 'Ciclodeportiva', km: 90, elevation: 1000, price: 20, lat: 41.6, lon: 0.6 };
  const full = { runner_name: 'A', position: 3, general_position: 12, time_seconds: 9000 };
  const after = { ...base, date: FULL_RESULTS_FROM, results: [full, { runner_name: 'B', position: 5, general_position: null, time_seconds: null }, { runner_name: 'C', position: 7, general_position: 20, time_seconds: 0 }] };
  const gaps = raceGaps(after).filter((g) => !SOFT_GAPS.has(g));
  assert.ok(gaps.includes('2 sin tiempo')); assert.ok(gaps.includes('1 sin puesto general'));
  assert.deepEqual(raceGaps({ ...after, results: [full] }).filter((g) => !SOFT_GAPS.has(g)), []);        // completa: nada que pedir
  const before = { ...after, date: '2026-11-26' };                                                        // anteriores a la regla: no se marcan por eso
  assert.ok(!raceGaps(before).some((g) => /sin tiempo|sin puesto general/.test(g)));
});
