// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nextYearWatch, watchTbc, WATCH_TBC,
  normalize, matchCategory, parseBulkRunners, yearSummary, csvRows, toCsv, parseCsv, importResultsCsv,
  parseDate, extractCode, newCode, formatDate, planRosterRenewal, monthGrid, addMonths, formatRange, daysOf, podiumsOf, bonusStatus, bonusConfigFor, yearBonuses, DEFAULT_BONUS, matchContract, searchRaces, pastLimit, SUBTYPES, parseKm, kmText, guessSubtype, missingFields, matchPeople, cleanGoogleLink } from '../js/logic.js';

test('normalize ignora mayúsculas y tildes', () => {
  assert.equal(normalize('  JOSÉ   Martínez '), 'jose martinez');
});

test('matchCategory', () => {
  assert.equal(matchCategory('m40'), 'M40');
  assert.equal(matchCategory('elite'), 'Élite');
  assert.equal(matchCategory('Sub23'), 'Sub-23');
  assert.equal(matchCategory('M45'), null);
});

test('alta masiva: categorías opcionales y duplicados', () => {
  const r = parseBulkRunners('Pere Soler, M40\n\nanna puig\nAnna Puig, elite\nJosé Ruiz, M99\nJOSE RUIZ', ['Pére soler']);
  assert.deepEqual(r.toAdd, [{ name: 'anna puig', category: null, contract: null }, { name: 'José Ruiz', category: null, contract: null }]);
  assert.deepEqual(r.duplicates, ['Pere Soler', 'Anna Puig', 'JOSE RUIZ']);
  assert.deepEqual(r.unknownCategory, [{ name: 'José Ruiz', text: 'M99' }]);
});

const runners = [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Biel' }, { id: 'c', name: 'Carla' }];
const races = [
  { id: 'r1', name: 'Uno', date: '2026-03-01', province: 'Girona', country: 'España', modality: 'Carretera', results: [
    { runner_id: 'a', runner_name: 'Anna', position: 1, podium_type: 'suelta', category: 'Élite' },
    { runner_id: 'b', runner_name: 'Biel', position: 4, category: 'M40' }] },
  { id: 'r2', name: 'Dos', date: '2026-05-01', province: '', country: 'Francia', modality: 'BTT', results: [
    { runner_id: 'a', runner_name: 'Anna', position: 3, podium_type: 'campeonato', category: 'Élite' },
    { runner_id: null, runner_name: 'Dani (baja)', position: 2, podium_type: 'general', category: 'M50' }] },
  { id: 'r3', name: 'Tres', date: '2026-06-01', province: 'Lleida', country: 'España', modality: 'Gravel', results: [] },
  { id: 'r0', name: 'Vieja', date: '2025-06-01', province: 'Lleida', country: 'España', modality: 'Pista', results: [
    { runner_id: 'c', runner_name: 'Carla', position: 1 }] },
];

test('resumen anual', () => {
  const s = yearSummary(2026, races, runners);
  { const { travelKm, travelRaces, travelApprox, avgDist, ...base } = s.totals;
  assert.deepEqual(base, { races: 3, runners: 3, participations: 4, podiums: 3, wins: 1, km: 0, kmBoth: 0, tripBoth: 0, time: 0, timed: 0, elevation: 0, cost: 0, elevRaces: 0, pricedRaces: 0, avgPrice: 0 }); }
  assert.deepEqual(s.byModality.map((m) => m.modality), ['Carretera', 'BTT', 'Gravel']); // Pista no aparece en 2026
  { const { elevation, trip, cost, km, ...base } = s.byModality[1];
  assert.deepEqual(base, { modality: 'BTT', races: 1, participations: 2, podiums: 2, wins: 0, runners: 2 }); }
  assert.deepEqual(s.countries, [{ name: 'España', races: 2 }, { name: 'Francia', races: 1 }]);
  assert.deepEqual(s.provinces, [{ name: 'Girona', races: 1 }, { name: 'Lleida', races: 1 }]);
  assert.deepEqual(s.missingPlace.map((m) => [m.name, m.missing]), [['Dos', ['provincia']]]);
  assert.deepEqual(s.perRunner.map((r) => [r.name, r.races, r.road, r.btt, r.p1, r.p2, r.p3]), [
    ['Anna', 2, 1, 1, 1, 0, 1], ['Biel', 1, 1, 0, 0, 0, 0], ['Dani (baja)', 1, 0, 1, 0, 1, 0], ['Carla', 0, 0, 0, 0, 0, 0]]);
  assert.deepEqual(s.byPodiumType.map((t) => [t.type, t.podiums, t.wins]), [['suelta', 1, 1], ['general', 1, 0], ['campeonato', 1, 0], ['etapa', 0, 0]]);
  assert.equal(s.podiumList.length, 3);
  assert.equal(yearSummary(2024, races, runners).byModality.length, 2); // Carretera y BTT siempre visibles
});

test('CSV ida y vuelta', () => {
  const csv = toCsv(csvRows(races.filter((r) => r.date.startsWith('2026'))));
  assert.ok(csv.startsWith('﻿Fecha;Fecha fin;Carrera;Lugar;Provincia;País;Modalidad;Corredor;Categoría;Puesto;Podio;Tipo de podio;Disciplina;Km;Desnivel (m);Precio inscripción (€)\r\n'));
  assert.match(csv, /2026-05-01;;Dos;;;Francia;BTT;Dani \(baja\);M50;2;Sí;General de varias pruebas/);
  const back = importResultsCsv(csv);
  assert.deepEqual(back.errors, []);
  assert.equal(back.races.length, 2); // «Tres» no tiene participantes y no genera filas
  const dos = back.races.find((r) => r.name === 'Dos');
  assert.deepEqual(dos.results.map((x) => [x.runner_name, x.position, x.podium_type, x.category]),
    [['Dani (baja)', 2, 'general', 'M50'], ['Anna', 3, 'campeonato', 'Élite']]);
});

test('parseCsv con comas, comillas y saltos', () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","di ""hola""\nadiós"\n'), [['a', 'b'], ['x, y', 'di "hola"\nadiós']]);
});

test('importar CSV con fechas españolas y errores', () => {
  const r = importResultsCsv('Fecha;Carrera;Corredor;Puesto\n14/6/2027;Volta;Pere;1º\nmal;Volta;Joan;2\n14/06/2027;Volta;pere;3');
  assert.equal(r.races.length, 1);
  assert.equal(r.races[0].date, '2027-06-14');
  assert.equal(r.races[0].country, 'España');
  assert.equal(r.errors.length, 3);
});

test('fechas y códigos', () => {
  assert.equal(parseDate('2027-6-4'), '2027-06-04');
  assert.equal(parseDate('4.6.2027'), '2027-06-04');
  assert.equal(formatDate('2027-06-14'), 'lun 14 jun 2027');
  const c = newCode();
  assert.match(c, /^[A-Z0-9]{12}$/);
  assert.equal(extractCode(`https://x.github.io/Club/#/c/${c}`), c);
  assert.equal(extractCode(c.toLowerCase()), c);
  assert.equal(extractCode('hola'), null);
});

test('renovación anual de la plantilla', () => {
  const cur = [{ id: '1', name: 'Pere Soler', category: 'M40' }, { id: '2', name: 'Anna Puig', category: 'Élite' }, { id: '3', name: 'Joan Vila', category: null }];
  const p = planRosterRenewal('pere soler, M50\nJoan Vila\nLaia Serra, Sub-23\nLAIA SERRA', cur);
  assert.deepEqual(p.keep.map((k) => [k.runner.id, k.category]), [['1', 'M50'], ['3', null]]);
  assert.deepEqual(p.add, [{ name: 'Laia Serra', category: 'Sub-23', contract: 'nuevo' }]);
  assert.deepEqual(p.remove.map((r) => r.id), ['2']);
  assert.deepEqual(p.duplicates, ['LAIA SERRA']);
});

test('calendario mensual', () => {
  const w = monthGrid('2027-06'); // 1 de junio de 2027 es martes
  assert.deepEqual(w[0], [null, '2027-06-01', '2027-06-02', '2027-06-03', '2027-06-04', '2027-06-05', '2027-06-06']);
  assert.equal(w.flat().filter(Boolean).length, 30);
  assert.equal(w.at(-1).at(-1), null);
  assert.equal(monthGrid('2027-02').length, 4); // febrero 2027 empieza en lunes: 4 semanas justas
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2027-01', -1), '2026-12');
});

test('carreras de varios días', () => {
  assert.equal(formatRange('2027-06-12', '2027-06-14'), 'sáb 12 – lun 14 jun 2027');
  assert.equal(formatRange('2027-05-30', '2027-06-01'), 'dom 30 may – mar 1 jun 2027');
  assert.equal(formatRange('2027-12-31', '2028-01-02', false), '31 dic 2027 – 2 ene 2028');
  assert.equal(formatRange('2027-06-12', null), 'sáb 12 jun 2027');
  assert.deepEqual(daysOf('2027-02-27', '2027-03-02'), ['2027-02-27', '2027-02-28', '2027-03-01', '2027-03-02']);
  const csv = toCsv(csvRows([{ id: 'x', name: 'Volta', date: '2027-06-12', end_date: '2027-06-14', modality: 'Carretera', country: 'España',
    results: [{ runner_name: 'Anna', position: 1, podium_type: 'general' }] }]));
  const back = importResultsCsv(csv);
  assert.equal(back.races[0].end_date, '2027-06-14');
});

test('podios de etapa: cuentan como tipo «Etapa»', () => {
  const runners2 = [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Biel' }];
  const races2 = [{ id: 'v', name: 'Volta', date: '2027-06-12', end_date: '2027-06-14', modality: 'Carretera', country: 'España', province: 'Girona',
    stages: ['Prólogo', '', 'Etapa 3'],
    results: [
      { runner_id: 'a', runner_name: 'Anna', position: 2, podium_type: 'general', stage_positions: [1, 5, 3] },
      { runner_id: 'b', runner_name: 'Biel', position: 7, podium_type: 'general', stage_positions: [null, 1, null, 1] }, // la 4.ª no existe
    ] }];
  const s = yearSummary(2027, races2, runners2);
  { const { travelKm, travelRaces, travelApprox, avgDist, ...base } = s.totals;
  assert.deepEqual(base, { races: 1, runners: 2, participations: 2, podiums: 4, wins: 2, km: 0, kmBoth: 0, tripBoth: 0, time: 0, timed: 0, elevation: 0, cost: 0, elevRaces: 0, pricedRaces: 0, avgPrice: 0 }); }
  assert.deepEqual(s.byPodiumType.map((t) => [t.type, t.podiums, t.wins]),
    [['suelta', 0, 0], ['general', 1, 0], ['campeonato', 0, 0], ['etapa', 3, 2]]);
  assert.deepEqual(s.perRunner.map((r) => [r.name, r.races, r.p1, r.p2, r.p3]), [['Anna', 1, 1, 1, 1], ['Biel', 1, 1, 0, 0]]);
  assert.deepEqual(s.podiumList.filter((p) => p.type === 'etapa').map((p) => [p.runner, p.stage, p.position]),
    [['Anna', 'Prólogo', 1], ['Anna', 'Etapa 3', 3], ['Biel', 'Etapa 2', 1]]);
  assert.equal(s.byModality[0].podiums, 4);
  // CSV de ida y vuelta conserva etapas
  const csv = toCsv(csvRows(races2));
  assert.match(csv, /Anna;;1;Sí;Etapa: Prólogo/);
  const back = importResultsCsv(csv).races[0];
  assert.deepEqual(back.stages, ['Prólogo', 'Etapa 3', 'Etapa 2']);
  const anna = back.results.find((r) => r.runner_name === 'Anna');
  assert.equal(anna.position, 2);
  assert.deepEqual(anna.stage_positions, [1, 3, null]);
  assert.equal(podiumsOf([{ race: back, res: anna }]).length, 3);
});

test('bonos por carreras', () => {
  const cfg = DEFAULT_BONUS;
  assert.deepEqual([0, 11, 12, 16, 17, 22, 30].map((n) => { const b = bonusStatus(n, cfg, false); return [b.amount, b.penalty, b.missingToNext]; }),
    [[0, 100, 12], [0, 100, 1], [50, 0, 5], [50, 0, 1], [100, 0, 5], [150, 0, 0], [150, 0, 0]]);
  assert.equal(bonusStatus(5, cfg, true).penalty, 175);
  assert.equal(bonusStatus(5, cfg, true).missingToMinimum, 7);
  // configuración por año: copia la anterior sin la lista de nuevos
  const all = { 2026: { ...DEFAULT_BONUS, minimum: 10, nuevos: ['x'] } };
  assert.equal(bonusConfigFor(all, 2027).minimum, 10);
  assert.deepEqual(bonusConfigFor(all, 2027).nuevos, []);
  assert.deepEqual(bonusConfigFor({}, 2026).tiers, DEFAULT_BONUS.tiers);
  // las carreras por etapas cuentan un día cada una; las inscripciones dan la previsión
  const rows = yearBonuses(2026,
    [{ date: '2026-03-01', results: [{ runner_id: 'a' }, { runner_id: 'b' }] },
     { date: '2026-06-12', end_date: '2026-06-14', results: [{ runner_id: 'a' }] },
     { date: '2025-06-12', results: [{ runner_id: 'a' }] }],
    [{ date: '2026-09-01', entries: [{ runner_id: 'b' }] }],
    [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Biel' }, { id: 'c', name: 'Carla' }],
    { ...DEFAULT_BONUS, nuevos: ['c'] });
  assert.deepEqual(rows.map((r) => [r.runner.name, r.count, r.planned, r.penalty, r.projected.count]),
    [['Anna', 4, 0, 100, 4], ['Biel', 1, 1, 100, 2], ['Carla', 0, 0, 175, 0]]);
});

test('tramos de bono por tipo de contrato', () => {
  // renovación sin licencia: 100/150/200 €; nuevo y renovación: 50/100/150 €
  assert.deepEqual([11, 12, 17, 22].map((n) => bonusStatus(n, DEFAULT_BONUS, 'renovacion_sin_licencia').amount), [0, 100, 150, 200]);
  assert.deepEqual([11, 12, 17, 22].map((n) => bonusStatus(n, DEFAULT_BONUS, 'nuevo').amount), [0, 50, 100, 150]);
  assert.equal(bonusStatus(11, DEFAULT_BONUS, 'renovacion_sin_licencia').penalty, 0);
  // configuración guardada con los tramos erróneos de antes (150/200/250): se usan los del contrato
  const old = { 2026: { tiers: [{ races: 12, amount: 150 }, { races: 17, amount: 200 }, { races: 22, amount: 250 }], minimum: 12, penalty: { renovado: 100, nuevo: 175 } } };
  assert.deepEqual(bonusConfigFor(old, 2026).tiers, DEFAULT_BONUS.tiers);
  assert.deepEqual(bonusConfigFor(old, 2027).tiers, DEFAULT_BONUS.tiers);
  assert.equal(bonusStatus(12, bonusConfigFor(old, 2027), 'renovacion_sin_licencia').amount, 100);
  // configuración propia: se respeta, y los tramos sin licencia vienen de los del contrato si no se guardaron
  const own = { 2027: { tiers: [{ races: 12, amount: 60 }], minimum: 12 } };
  assert.equal(bonusStatus(12, bonusConfigFor(own, 2027), 'renovacion').amount, 60);
  assert.equal(bonusStatus(12, bonusConfigFor(own, 2027), 'renovacion_sin_licencia').amount, 100);
  const ownSl = { 2027: { tiers: [{ races: 12, amount: 60 }], tiersByContract: { renovacion_sin_licencia: [{ races: 10, amount: 90 }] } } };
  assert.equal(bonusStatus(10, bonusConfigFor(ownSl, 2027), 'renovacion_sin_licencia').amount, 90);
});

test('tipos de contrato', () => {
  assert.equal(bonusStatus(3, DEFAULT_BONUS, 'nuevo').penalty, 175);
  assert.equal(bonusStatus(3, DEFAULT_BONUS, 'renovacion').penalty, 100);
  assert.equal(bonusStatus(3, DEFAULT_BONUS, 'renovacion_sin_licencia').penalty, 0);
  assert.equal(bonusStatus(3, { ...DEFAULT_BONUS, penalty: { renovado: 100, nuevo: 175, sin_licencia: 60 } }, 'renovacion_sin_licencia').penalty, 60);
  assert.equal(bonusStatus(3, { ...DEFAULT_BONUS, penalty: { renovado: 100, nuevo: 175 } }, 'renovacion_sin_licencia').penalty, 0); // config guardada antes: sin_licencia = 0
  assert.equal(bonusConfigFor({ 2026: { penalty: { renovado: 100, nuevo: 175 } } }, 2026).penalty.sin_licencia, 0);
  assert.equal(bonusStatus(3, DEFAULT_BONUS, null).penalty, 100);
  assert.equal(bonusStatus(3, DEFAULT_BONUS, true).penalty, 175);
  assert.equal(matchContract('Renovación sin licencia'), 'renovacion_sin_licencia');
  assert.equal(matchContract('renov s/l'), 'renovacion_sin_licencia');
  assert.equal(matchContract('renovación'), 'renovacion');
  assert.equal(matchContract('NUEVO'), 'nuevo');
  assert.equal(matchContract('M40'), null);
  // el contrato del corredor manda sobre la lista antigua de nuevos
  const rows = yearBonuses(2026, [], [], [{ id: 'a', name: 'A', contract: 'renovacion' }, { id: 'b', name: 'B' }], { ...DEFAULT_BONUS, nuevos: ['a', 'b'] });
  assert.deepEqual(rows.map((r) => [r.runner.id, r.contract, r.penalty]), [['a', 'renovacion', 100], ['b', 'nuevo', 175]]);
});

test('alta y renovación con tipo de contrato', () => {
  const r = parseBulkRunners('Pere Soler, M40, renovación\nAnna, renov sin licencia\nBiel, nuevo, Élite');
  assert.deepEqual(r.toAdd.map((x) => [x.name, x.category, x.contract]),
    [['Pere Soler', 'M40', 'renovacion'], ['Anna', null, 'renovacion_sin_licencia'], ['Biel', 'Élite', 'nuevo']]);
  const plan = planRosterRenewal('Ana\nBea, renovación sin licencia\nCris', [
    { id: '1', name: 'Ana', contract: 'nuevo' }, { id: '2', name: 'Bea', contract: 'renovacion' }, { id: '3', name: 'Cris', contract: 'renovacion_sin_licencia' }]);
  assert.deepEqual(plan.keep.map((k) => [k.runner.id, k.contract]), [['1', 'renovacion'], ['2', 'renovacion_sin_licencia'], ['3', null]]);
});

test('buscador de carreras', () => {
  const races = [
    { name: 'Volta a la Cerdanya', date: '2027-06-14', place: 'Puigcerdà', province: 'Girona' },
    { name: 'BTT Les Garrigues', date: '2027-02-22', place: 'Les Borges Blanques', province: 'Lleida' },
    { name: 'Trofeu de Tardor', date: '2027-10-12', place: 'Reus', province: 'Tarragona' },
    { name: 'Marxa del Montseny', date: '2027-03-09', place: 'Sant Celoni', province: 'Barcelona' },
  ];
  const names = (q) => searchRaces(q, races).map((r) => r.name);
  assert.deepEqual(names('cerdanya'), ['Volta a la Cerdanya']);
  assert.deepEqual(names('volta cerdaña'), ['Volta a la Cerdanya']); // sin tildes y con una palabra que no acaba igual
  assert.deepEqual(names('garrig'), ['BTT Les Garrigues']);
  assert.deepEqual(names('borges'), ['BTT Les Garrigues']); // por el lugar
  assert.deepEqual(names('MONTSENY'), ['Marxa del Montseny']);
  assert.deepEqual(names('trofeu'), []); // palabra genérica sola: no saca nada
  assert.deepEqual(names('trofeu tardor'), ['Trofeu de Tardor']);
  assert.deepEqual(names(''), []);
  assert.deepEqual(names('xyz'), []);
  assert.deepEqual(names('BTT Garrigues'), ['BTT Les Garrigues']);
  assert.deepEqual(searchRaces('BTT Garrigues', [{ name: 'Open Escolar BTT Cambrils', date: '2026-11-14' }]), []); // «BTT» sola no basta
});

test('pastLimit: carreras olvidadas desde el 1 de enero del año anterior', () => {
  assert.equal(pastLimit(new Date(2026, 11, 20)), '2025-01-01');
  assert.equal(pastLimit(new Date(2027, 0, 3)), '2026-01-01');
});

test('bono: las carreras extra por podio de circuito suben el tramo pero no cuentan para el mínimo', () => {
  const cfg = bonusConfigFor({}, 2026);
  const a = bonusStatus(13, cfg, 'renovacion', 4);
  assert.equal(a.count, 13); assert.equal(a.extra, 4); assert.equal(a.bonusCount, 17);
  assert.equal(a.amount, 100); assert.equal(a.reachesMinimum, true);
  const b = bonusStatus(10, cfg, 'nuevo', 4); // 14 para el bono, pero solo 10 corridas
  assert.equal(b.reachesMinimum, false); assert.equal(b.penalty, 175); assert.equal(b.missingToMinimum, 2);
  const runners = [{ id: 'a', name: 'Ana', contract: 'renovacion' }, { id: 'b', name: 'Bea', contract: 'renovacion' }];
  const races = Array.from({ length: 13 }, (_, i) => ({ date: `2026-03-${String(i + 1).padStart(2, '0')}`, results: [{ runner_id: 'a' }, { runner_id: 'b' }] }));
  const pods = [{ runner_id: 'a', year: 2026, status: 'confirmado', circuit: 'Copa' }, { runner_id: 'b', year: 2026, status: 'pendiente', circuit: 'Copa' },
    { runner_id: 'b', year: 2025, status: 'confirmado', circuit: 'Copa' }];
  const rows = yearBonuses(2026, races, [], runners, cfg, pods);
  assert.equal(rows.find((r) => r.runner.id === 'a').amount, 100);
  assert.equal(rows.find((r) => r.runner.id === 'b').amount, 50); // pendiente o de otro año: no suma
});

test('bono: una inscripción ya disputada con el puesto puesto por el corredor cuenta como hecha', () => {
  const cfg = bonusConfigFor({}, 2026);
  const runners = [{ id: 'a', name: 'Ana', contract: 'renovacion' }];
  const regs = [
    { date: '2026-03-01', end_date: '2026-03-03', entries: [{ runner_id: 'a', self_position: 5 }] },
    { date: '2026-04-01', entries: [{ runner_id: 'a', self_position: null }] },
  ];
  const [row] = yearBonuses(2026, [], regs, runners, cfg);
  assert.equal(row.count, 3); assert.equal(row.planned, 1);
});

test('resumen: carreras por mes y por modalidad, y por corredor', () => {
  const runners = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bea' }];
  const races = [
    { id: 'r1', name: 'A', date: '2026-03-01', modality: 'BTT', results: [{ runner_id: 'a', runner_name: 'Ana', position: 1, podium_type: 'suelta' }, { runner_id: 'b', runner_name: 'Bea', position: 9 }] },
    { id: 'r2', name: 'B', date: '2026-03-15', modality: 'Carretera', results: [{ runner_id: 'a', runner_name: 'Ana', position: 2, podium_type: 'suelta' }] },
    { id: 'r3', name: 'C', date: '2026-11-02', modality: 'BTT', results: [{ runner_id: 'a', runner_name: 'Ana', position: 5 }] },
  ];
  const s = yearSummary(2026, races, runners);
  assert.equal(s.byMonth.length, 12);
  assert.equal(s.byMonth[2].total, 2); assert.deepEqual(s.byMonth[2].mods, { BTT: 1, Carretera: 1 });
  assert.equal(s.byMonth[10].total, 1);
  const ana = s.perRunner.find((r) => r.key === 'a');
  assert.deepEqual(ana.mods, { BTT: 2, Carretera: 1 }); assert.equal(ana.p1 + ana.p2, 2);
  const btt = s.byModality.find((m) => m.modality === 'BTT');
  assert.equal(btt.races, 2); assert.equal(btt.wins, 1); assert.equal(btt.runners, 2);
  assert.equal(s.podiumList[0].modality, 'BTT');
});

test('bono: una carrera suspendida cuenta para el mínimo pero no para el bono', () => {
  const cfg = bonusConfigFor({}, 2026);
  const a = bonusStatus(11, cfg, 'nuevo', 0, 1);          // 11 corridas + 1 suspendida = 12 para el mínimo
  assert.equal(a.reachesMinimum, true); assert.equal(a.penalty, 0);
  assert.equal(a.count, 11); assert.equal(a.amount, 0);   // el bono no la cuenta
  const b = bonusStatus(10, cfg, 'nuevo', 0, 1);
  assert.equal(b.reachesMinimum, false); assert.equal(b.missingToMinimum, 1); assert.equal(b.penalty, 175);
  const runners = [{ id: 'a', name: 'Ana', contract: 'renovacion' }];
  const regs = [{ date: '2026-05-01', end_date: '2026-05-02', suspended: true, entries: [{ runner_id: 'a', self_position: null }] }];
  const [row] = yearBonuses(2026, [], regs, runners, cfg);
  assert.equal(row.suspended, 2); assert.equal(row.count, 0); assert.equal(row.planned, 0); assert.equal(row.missingToMinimum, 10);
});

test('formato y km: parseKm, kmText y resumen', () => {
  assert.equal(parseKm('85,46'), 85.5); assert.equal(parseKm('42'), 42);
  assert.equal(parseKm(''), null); assert.equal(parseKm('-3'), null); assert.equal(parseKm('5000'), null); assert.equal(parseKm('abc'), null);
  assert.ok(kmText(85.5).endsWith('km'));
  assert.deepEqual(SUBTYPES.BTT, ['XCO', 'XCM', 'UXCM', 'Rally', 'Descenso', 'Otra']); assert.ok(SUBTYPES.Carretera.includes('Critérium'));
  const runners = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bea' }];
  const races = [
    { id: 'r1', name: 'A', date: '2026-03-01', modality: 'BTT', subtype: 'XCM', km: 80, results: [{ runner_id: 'a', runner_name: 'Ana', position: 1 }, { runner_id: 'b', runner_name: 'Bea', position: 5 }] },
    { id: 'r2', name: 'B', date: '2026-04-01', modality: 'BTT', subtype: 'XCM', km: 60.5, results: [{ runner_id: 'a', runner_name: 'Ana', position: 2 }] },
    { id: 'r3', name: 'C', date: '2026-05-01', modality: 'Carretera', subtype: 'Critérium', km: 40, results: [{ runner_id: 'a', runner_name: 'Ana', position: 9 }] },
    { id: 'r4', name: 'D', date: '2026-06-01', modality: 'Carretera', results: [{ runner_id: 'b', runner_name: 'Bea', position: 3 }] },
  ];
  const s = yearSummary(2026, races, runners);
  assert.equal(s.totals.km, 80 + 80 + 60.5 + 40);   // cada participante suma los km de su carrera
  assert.equal(s.perRunner.find((r) => r.key === 'a').km, 180.5);
  assert.equal(s.perRunner.find((r) => r.key === 'b').km, 80);
  assert.deepEqual(s.bySubtype.map((x) => [x.modality, x.subtype, x.races]), [['BTT', 'XCM', 2], ['Carretera', 'Critérium', 1]]);
});

test('formato sugerido por el nombre y datos que faltan', () => {
  assert.equal(guessSubtype('Open XCM Graus', 'BTT'), 'XCM');
  assert.equal(guessSubtype('Ultra XCM Pirineus', 'BTT'), 'UXCM');
  assert.equal(guessSubtype('Gran Premi XCO Monzón', 'BTT'), 'XCO');
  assert.equal(guessSubtype('Maratón BTT de Aragón', 'BTT'), 'XCM');
  assert.equal(guessSubtype('Critérium de Barbastro', 'Carretera'), 'Critérium');
  assert.equal(guessSubtype('Marxa cicloturista Sallent', 'Carretera'), 'Ciclodeportiva');
  assert.equal(guessSubtype('Campionat de Catalunya CRI', 'Carretera'), 'Contrarreloj');
  assert.equal(guessSubtype('Open XCM Graus', 'Carretera'), '');   // el formato depende de la modalidad
  assert.equal(guessSubtype('Gravel Pirineus', 'Gravel'), '');
  assert.deepEqual(missingFields({ province: '', km: null, modality: 'BTT', subtype: '' }), ['province', 'km', 'subtype']);
  assert.deepEqual(missingFields({ province: 'Huesca', km: 42, modality: 'BTT', subtype: 'XCO' }), []);
  assert.deepEqual(missingFields({ province: 'Huesca', km: 0, modality: 'Gravel' }), ['km']);       // Gravel no pide formato
});

test('buscar compañeros por nombre: sin tildes, por el principio de cada palabra y en cualquier orden', () => {
  const gente = [{ id: 1, name: 'Joan Ferrer' }, { id: 2, name: 'Anna Puig' }, { id: 3, name: 'Jordi Vila' }, { id: 4, name: 'Marta Roca' }, { id: 5, name: 'Josep Maria Álvarez' }];
  const nombres = (q) => matchPeople(q, gente).map((p) => p.name);
  assert.deepEqual(nombres('jo'), ['Joan Ferrer', 'Jordi Vila', 'Josep Maria Álvarez']);
  assert.deepEqual(nombres('ferrer joan'), ['Joan Ferrer']);   // cualquier orden
  assert.deepEqual(nombres('alvarez'), ['Josep Maria Álvarez']); // sin tildes
  assert.deepEqual(nombres('MAR'), ['Josep Maria Álvarez', 'Marta Roca']); // sin mayúsculas, también la 2.ª palabra
  assert.deepEqual(nombres('rta'), ['Marta Roca']);              // dentro del nombre (3 letras o más)
  assert.deepEqual(nombres('a'), []);                            // una sola letra: demasiado corto
  assert.deepEqual(nombres('zzz'), []);
});

test('enlaces de Google: solo https y de Google, y sin los parámetros de compartir', () => {
  const hoja = 'https://docs.google.com/spreadsheets/d/ABC123/edit';
  assert.equal(cleanGoogleLink(hoja + '?usp=drivesdk'), hoja);
  assert.equal(cleanGoogleLink('  ' + hoja + '?usp=sharing&ouid=999  '), hoja);
  assert.equal(cleanGoogleLink(hoja + '?gid=5#gid=5'), hoja + '?gid=5#gid=5'); // lo demás se conserva
  assert.equal(cleanGoogleLink('https://docs.google.com/forms/d/e/XYZ/viewform?usp=sharing&ouid=1'), 'https://docs.google.com/forms/d/e/XYZ/viewform');
  assert.equal(cleanGoogleLink('http://docs.google.com/spreadsheets/d/ABC/edit'), null);  // sin https
  assert.equal(cleanGoogleLink('https://evil.example.com/docs.google.com/spreadsheets/d/ABC'), null);
  assert.equal(cleanGoogleLink('https://docs.google.com.evil.com/spreadsheets/d/ABC'), null);
  assert.equal(cleanGoogleLink('https://user:pass@docs.google.com/spreadsheets/d/ABC'), null);
  assert.equal(cleanGoogleLink('no es un enlace'), null);
  assert.equal(cleanGoogleLink(''), null);
});

test('parseTime y formatTime', async () => {
  const { parseTime, formatTime } = await import('../js/logic.js');
  assert.equal(parseTime('2:05:30'), 7530);
  assert.equal(parseTime('45:10'), 2710);
  assert.equal(parseTime('1h 5m'), 3900);
  assert.equal(parseTime('20:00:00'), 72000);
  assert.equal(parseTime(''), null);
  assert.equal(parseTime('abc'), null);
  assert.equal(parseTime('1:75:00'), null);
  assert.equal(parseTime('0:00:00'), null);
  assert.equal(formatTime(7530), '2:05:30');
  assert.equal(formatTime(43500, true), '12 h 05 min');
  assert.equal(formatTime(null), '');
});

test('yearSummary suma tiempos solo de quien los tiene', async () => {
  const { yearSummary } = await import('../js/logic.js');
  const runners = [{ id: 'a', name: 'Ana' }];
  const races = [
    { id: 'r1', name: 'Uno', date: '2026-03-01', modality: 'BTT', results: [{ runner_id: 'a', runner_name: 'Ana', position: 5, time_seconds: 3600 }] },
    { id: 'r2', name: 'Dos', date: '2026-04-01', modality: 'BTT', results: [{ runner_id: 'a', runner_name: 'Ana', position: 6 }] },
  ];
  const s = yearSummary(2026, races, runners);
  const row = s.perRunner.find((x) => x.key === 'a');
  assert.equal(row.time, 3600); assert.equal(row.timed, 1); assert.equal(row.races, 2);
  assert.equal(s.totals.time, 3600); assert.equal(s.totals.timed, 1);
});

test('cómputo de temporada: resumen por corredor y detalle', async () => {
  const { seasonByRunner, seasonDetail, SEASON_COLUMNS } = await import('../js/logic.js');
  const runners = [{ id: 'a', name: 'Ana', category: 'M30', contract: 'nuevo' }, { id: 'b', name: 'Beto' }];
  const races = [
    { id: 'r1', name: 'Uno', date: '2026-03-01', modality: 'BTT', province: 'Huesca', country: 'España', km: 50, elevation: 1200, price: 30, results: [{ runner_id: 'a', runner_name: 'Ana', position: 1, podium_type: 'suelta', time_seconds: 7200 }] },
    { id: 'r2', name: 'Dos', date: '2026-04-01', end_date: '2026-04-03', modality: 'Carretera', province: 'Lleida', country: 'España', results: [{ runner_id: 'a', runner_name: 'Ana', position: 8 }] },
    { id: 'r3', name: 'Vieja', date: '2025-04-01', modality: 'BTT', results: [{ runner_id: 'b', runner_name: 'Beto', position: 2 }] },
  ];
  const rows = seasonByRunner(2026, races, runners, (c) => c || '');
  const ix = (n) => SEASON_COLUMNS.indexOf(n);
  assert.equal(rows.length, 2);
  const ana = rows.find((r) => r[0] === 'Ana'), beto = rows.find((r) => r[0] === 'Beto');
  assert.equal(ana[ix('Carreras')], 2); assert.equal(ana[ix('Días de carrera')], 4); assert.equal(ana[ix('Oros')], 1);
  assert.equal(ana[ix('Km')], 50); assert.equal(ana[ix('Tiempo total (h:mm:ss)')], '2:00:00'); assert.equal(ana[ix('Provincias')], 'Huesca, Lleida');
  assert.equal(beto[ix('Carreras')], 0);
  const det = seasonDetail(2026, races);
  const { SEASON_DETAIL_COLUMNS: DC } = await import('../js/logic.js');
  assert.equal(det.length, 2); assert.equal(det[0][3], 'Uno'); assert.equal(det[0][DC.indexOf('Tiempo')], '2:00:00');
  assert.equal(det[0][DC.indexOf('Desnivel (m)')], 1200); assert.equal(det[0][DC.indexOf('Precio inscripción (€)')], 30); assert.equal(ana[ix('Desnivel (m)')], 1200);
});

test('daysTo, daysToText e icsEvent', async () => {
  const { daysTo, daysToText, icsEvent } = await import('../js/logic.js');
  const now = new Date(2026, 10, 13, 15, 0);
  assert.equal(daysTo('2026-11-13', now), 0); assert.equal(daysTo('2026-11-14', now), 1); assert.equal(daysTo('2026-11-20', now), 7); assert.equal(daysTo('2026-11-12', now), -1);
  assert.equal(daysToText(0), 'hoy'); assert.equal(daysToText(1), 'mañana'); assert.equal(daysToText(6), 'en 6 días'); assert.equal(daysToText(-2), '');
  const ics = icsEvent({ id: 'x1', name: 'Open, BTT; Graus', date: '2026-11-19', end_date: '2026-11-21', place: 'Graus', province: 'Huesca', modality: 'BTT', km: 45 }, new Date('2026-11-13T10:00:00Z'));
  assert.match(ics, /BEGIN:VCALENDAR/); assert.match(ics, /DTSTART;VALUE=DATE:20261119/); assert.match(ics, /DTEND;VALUE=DATE:20261122/);
  assert.ok(ics.includes('SUMMARY:🚴 Open\\, BTT\\; Graus')); assert.ok(ics.includes('LOCATION:Graus\\, Huesca')); assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.match(icsEvent({ id: 'x2', name: 'Uno', date: '2026-11-19' }), /DTEND;VALUE=DATE:20261120/);
});

test('yearSummary: estadística por categoría', async () => {
  const { yearSummary } = await import('../js/logic.js');
  const runners = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Beto' }];
  const races = [
    { id: 'r1', name: 'Uno', date: '2026-03-01', modality: 'BTT', km: 40, results: [
      { runner_id: 'a', runner_name: 'Ana', category: 'M40', position: 1, podium_type: 'suelta' }, { runner_id: 'b', runner_name: 'Beto', category: 'Élite', position: 5 }] },
    { id: 'r2', name: 'Dos', date: '2026-04-01', modality: 'BTT', results: [{ runner_id: 'a', runner_name: 'Ana', category: 'M40', position: 3, podium_type: 'suelta' }, { runner_id: 'b', runner_name: 'Beto', position: 9 }] },
  ];
  const c = yearSummary(2026, races, runners).byCategory;
  assert.deepEqual(c.map((x) => x.category), ['Élite', 'M40', '']);
  const m40 = c.find((x) => x.category === 'M40');
  assert.equal(m40.participations, 2); assert.equal(m40.runners, 1); assert.equal(m40.p1, 1); assert.equal(m40.p3, 1); assert.equal(m40.podiums, 2); assert.equal(m40.km, 40);
  assert.equal(c.find((x) => x.category === '').participations, 1);
});

test('socialAudit: hechas, pendientes y anomalías', async () => {
  const { socialAudit, postKeyOf, resKeyOf } = await import('../js/logic.js');
  const today = '2026-11-20';
  const race = (id, name, date, n = 1) => ({ id, name, date, results: Array.from({ length: n }, (_, i) => ({ runner_id: 'r' + i, runner_name: 'R' + i, position: i + 1 })) });
  const races = [race('a', 'Reciente', '2026-11-18'), race('b', 'Atrasada', '2026-11-05'), race('c', 'Publicada', '2026-11-01'), race('o', 'Antigua', '2026-03-01')];
  const regs = [
    { id: 'u1', name: 'Proxima', date: '2026-11-25', entries: [{ runner_id: 'r0' }] },
    { id: 'u2', name: 'Lejana', date: '2026-12-30', entries: [{ runner_id: 'r0' }] },
    { id: 'p1', name: 'Esperando', date: '2026-11-19', entries: [{ runner_id: 'r0' }] },
    { id: 'p2', name: 'Sin puestos', date: '2026-11-10', entries: [{ runner_id: 'r0' }] },
    { id: 's1', name: 'Suspendida', date: '2026-11-22', suspended: true, entries: [{ runner_id: 'r0' }] },
  ];
  const posts = [{ key: postKeyOf(races[2]) }, { key: resKeyOf(races[2]) }, { key: postKeyOf(regs[4]) }, { key: '2026-10-01|ya no existe' }];
  const a = socialAudit(2026, races, regs, posts, today);
  assert.equal(a.resPending.length, 1); assert.equal(a.resPending[0].race.id, 'a');
  assert.equal(a.resLate.length, 1); assert.equal(a.resLate[0].race.id, 'b');
  assert.equal(a.resDone.length, 1); assert.equal(a.resOld.length, 1);
  assert.equal(a.waiting.length, 1); assert.equal(a.noResults.length, 1);
  assert.equal(a.avisoPending.length, 1); assert.equal(a.avisoPending[0].reg.id, 'u1');
  assert.equal(a.suspendedPosted.length, 1); assert.equal(a.orphans.length, 1);
  assert.equal(a.pending, 3); assert.equal(a.anomalies, 4);
  assert.equal(a.done, 3);
});

test('historia previa automática: registro, estado y anomalía', async () => {
  const { parseStoryLog, storyState, storyDateOf, socialAudit, postKeyOf } = await import('../js/logic.js');
  assert.equal(storyDateOf({ date: '2026-11-15' }), '2026-11-13'); assert.equal(storyDateOf({ date: '2026-03-01' }), '2026-02-27');
  const log = parseStoryLog({ desde: '2026-11-14', historias: [
    { carrera: 'Open BTT', fecha: '2026-11-20', pagina: 1, publicada: '2026-11-18', media_id: '1' }, { carrera: 'Open BTT', fecha: '2026-11-20', pagina: 2, publicada: '2026-11-18', media_id: '2' }] });
  const today = '2026-11-20';
  const ok = storyState({ name: 'Open BTT', date: '2026-11-20' }, log, false, today);
  assert.equal(ok.state, 'ok'); assert.equal(ok.n, 2); assert.equal(ok.date, '2026-11-18');
  assert.equal(storyState({ name: 'Sin', date: '2026-11-25' }, log, false, today).state, 'programada');
  assert.equal(storyState({ name: 'Hoy', date: '2026-11-22' }, log, false, today).state, 'hoy');
  assert.equal(storyState({ name: 'Falta', date: '2026-11-19' }, log, false, today).state, 'falta');
  assert.equal(storyState({ name: 'Antes', date: '2026-11-10' }, log, false, today), null);            // anterior al registro
  assert.equal(storyState({ name: 'Falta', date: '2026-11-19' }, log, true, today).state, 'manual');   // marcada a mano
  assert.equal(storyState({ name: 'Falta', date: '2026-11-19', suspended: true }, log, false, today), null);
  assert.equal(storyState({ name: 'Tarde', date: '2026-11-19', created_at: '2026-11-18T10:00:00Z' }, log, false, today), null); // creada tras el día de la historia
  assert.equal(storyState({ name: 'Falta', date: '2026-11-19' }, null, false, today), null);           // aún no hay registro
  const regs = [{ id: 'f', name: 'Falta', date: '2026-11-19', entries: [{ runner_id: 'a' }] }, { id: 'o', name: 'Open BTT', date: '2026-11-20', entries: [{ runner_id: 'a' }] }];
  const a = socialAudit(2026, [], regs, [], today, log);
  assert.equal(a.storyMissing.length, 1); assert.equal(a.storyMissing[0].id, 'f'); assert.ok(a.anomalies >= 1);
  assert.equal(a.done, 1);                                                                              // la historia de Open BTT cuenta como hecha
});

test('Ultradistancia: es una disciplina de Carretera y se deduce del nombre', () => {
  assert.ok(SUBTYPES.Carretera.includes('Ultradistancia'));
  assert.equal(guessSubtype('Transpirenaica Ultradistancia', 'Carretera'), 'Ultradistancia');
  assert.equal(guessSubtype('Ultra Cycling Bajo Aragón', 'Carretera'), 'Ultradistancia');
  assert.equal(guessSubtype('Open Ultra Graus', 'BTT'), 'UXCM');
  assert.equal(guessSubtype('Campeonato de Europa Descenso La Molina', 'BTT'), 'Descenso'); assert.equal(guessSubtype('Copa Downhill', 'BTT'), 'Descenso');
});

test('Rally: es un formato de BTT y se deduce del nombre', () => {
  assert.ok(SUBTYPES.BTT.includes('Rally'));
  assert.equal(guessSubtype('Rally de Montserrat', 'BTT'), 'Rally');
  assert.equal(guessSubtype('Rally de Montserrat', 'Carretera'), '');
});

test('panel Hoy: resultados pendientes, próximas, actividad, calidad e inactivos', async () => {
  const { directorBoard, seenDays, seenLevel, groupMessage, raceGaps } = await import('../js/logic.js');
  const runners = [{ id: 'a', name: 'Anna', last_seen: '2026-11-17T10:00:00Z' }, { id: 'b', name: 'Bru', last_seen: null }, { id: 'c', name: 'Cesc', last_seen: '2026-09-01T10:00:00Z' }];
  const registrations = [
    { id: 'g1', name: 'Pasada', date: '2026-11-13', entries: [{ runner_id: 'a', self_position: 3 }, { runner_id: 'b' }] },
    { id: 'g2', name: 'Próxima', date: '2026-11-22', entries: [{ runner_id: 'a' }] },
    { id: 'g3', name: 'Lejana', date: '2027-02-01', entries: [{ runner_id: 'c' }] },
    { id: 'g4', name: 'Vieja', date: '2026-06-01', entries: [{ runner_id: 'b' }] },
    { id: 'g5', name: 'Suspendida', date: '2026-11-10', suspended: true, entries: [{ runner_id: 'c' }] },
  ];
  const races = [{ id: 'r1', name: 'Hecha', date: '2026-05-01', modality: 'BTT', province: '', km: 0, results: [{ position: null }] },
    { id: 'r2', name: 'Completa', date: '2026-04-01', modality: 'Carretera', subtype: 'Máster', province: 'Lleida', km: 80, results: [{ position: 2 }] }];
  const b = directorBoard({ races, registrations, runners }, '2026-11-18', { now: new Date('2026-11-18T12:00:00Z') });
  assert.deepEqual(b.pendingResults.map((x) => [x.reg.id, x.missing, x.days]), [['g1', ['b'], 5]]);
  assert.deepEqual(b.upcoming.map((x) => [x.reg.id, x.days]), [['g2', 4]]);
  assert.deepEqual(b.activity.map((x) => x.level), ['hot', 'never', 'cold']);
  assert.deepEqual(b.quality.map((x) => x.race.id), ['r1']);
  assert.deepEqual(raceGaps(races[0]), ['provincia', 'disciplina', 'km', 'desnivel', 'precio', 'ubicación', '1 sin puesto']);
  assert.deepEqual(b.soft.map((x) => x.race.id), ['r2'], 'r2 solo le falta desnivel y precio: aviso suave, no «incompleta»');
  assert.deepEqual(b.idle, ['b']);
  assert.equal(b.counts.results, 1);
  assert.equal(directorBoard({ races, registrations, runners: [{ id: 'a' }] }, '2026-11-18').activity, null, 'sin la columna no hay actividad');
  assert.equal(seenDays(null), null);
  assert.equal(seenLevel(12), 'warm');
  assert.match(groupMessage('results', ['Bru'], { race: 'Pasada' }), /Pasada[\s\S]*• Bru/);
});

test('yearInsights: ritmo, días de la semana, histograma y calendario', async () => {
  const { yearInsights } = await import('../js/logic.js');
  const runners = [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Bru' }, { id: 'c', name: 'Cesc' }];
  const res = (id, name, position) => ({ runner_id: id, runner_name: name, position, category: 'M40' });
  const races = [
    { id: 'r1', name: 'Uno', date: '2026-03-07', modality: 'Carretera', km: 80, results: [res('a', 'Anna', 1), res('b', 'Bru', 5)] },       // sábado
    { id: 'r2', name: 'Dos', date: '2026-03-14', end_date: '2026-03-15', modality: 'BTT', subtype: 'XCO', km: 40, results: [res('a', 'Anna', 2)] },   // 2 días
    { id: 'r3', name: 'Tres', date: '2026-05-02', modality: 'BTT', results: [res('a', 'Anna', 9)] },
    { id: 'r4', name: 'Otro año', date: '2025-05-02', modality: 'BTT', results: [res('c', 'Cesc', 1)] },
  ];
  const i = yearInsights(2026, races, runners, [{ id: 'g', date: '2026-12-01', entries: [{ runner_id: 'a' }, { runner_id: 'b' }] }, { id: 'h', date: '2026-01-10', entries: [{}] }], '2026-06-01');
  assert.equal(i.summary.totals.races, 3);
  assert.equal(i.weekdays[5], 3, 'las tres empiezan en sábado');
  assert.equal(i.days, 4);
  assert.equal(i.multiDay, 1);
  assert.deepEqual(i.bestMonth, { month: 2, total: 2 });
  assert.equal(i.avgPart, 1.3);
  assert.equal(i.rosterSize, 3);
  assert.equal(i.activeCount, 2);
  assert.deepEqual(i.idle.map((x) => x.name), ['Cesc']);
  assert.deepEqual(i.hist.map((h) => h.runners), [1, 1, 1, 0, 0]);   // Cesc 0, Bru 1, Anna 3
  assert.equal(i.podiumRate, 50);
  assert.equal(i.avgRaceKm, 60);
  assert.deepEqual(i.upcoming, { races: 1, entries: 2 });
  assert.equal(i.cal.length, 3);
  assert.equal(i.first, '2026-03-07');
});

test('por valorar: estado, orden y coincidencia con inscripciones del club', async () => {
  const { watchInfo, sortWatch, watchMatch } = await import('../js/logic.js');
  const today = '2026-11-19';
  const w = (name, date, extra = {}) => ({ id: name, name, date, ...extra });
  const items = [w('Lejana', '2027-03-01'), w('Plazo cerca', '2027-02-01', { deadline: '2026-11-24' }), w('Plazo hoy', '2027-01-10', { deadline: '2026-11-19' }),
    w('Plazo cerrado', '2026-12-20', { deadline: '2026-11-01' }), w('Ya pasó', '2026-10-01'), w('Plazo lejos', '2027-04-01', { deadline: '2027-02-01' })];
  const i = (n) => watchInfo(items.find((x) => x.name === n), today);
  assert.equal(i('Plazo cerca').deadline, 'soon'); assert.equal(i('Plazo cerca').toDeadline, 5); assert.ok(i('Plazo cerca').urgent);
  assert.equal(i('Plazo hoy').deadline, 'today'); assert.ok(i('Plazo hoy').urgent);
  assert.equal(i('Plazo cerrado').deadline, 'closed'); assert.ok(!i('Plazo cerrado').urgent);
  assert.equal(i('Plazo lejos').deadline, 'open'); assert.equal(i('Lejana').deadline, null);
  assert.ok(i('Ya pasó').past); assert.ok(!i('Ya pasó').urgent); assert.equal(i('Lejana').toRace, 102);
  assert.deepEqual(sortWatch(items, 'date', today).map((x) => x.w.name), ['Plazo cerrado', 'Plazo hoy', 'Plazo cerca', 'Lejana', 'Plazo lejos', 'Ya pasó']);
  assert.deepEqual(sortWatch(items, 'deadline', today).map((x) => x.w.name), ['Plazo hoy', 'Plazo cerca', 'Plazo lejos', 'Plazo cerrado', 'Lejana', 'Ya pasó']);
  const regs = [{ id: 'g1', name: 'Gran Fondo Monzón', date: '2027-03-01', entries: [] }, { id: 'g2', name: 'Otra cosa', date: '2027-03-01', entries: [] }, { id: 'g3', name: 'Gran Fondo Monzón', date: '2027-03-01', suspended: true, entries: [] }];
  assert.equal(watchMatch(w('Gran Fondo Monzon', '2027-03-01'), regs)?.id, 'g1');
  assert.equal(watchMatch(w('Gran Fondo Monzón', '2027-04-01'), regs), null);
});

test('desnivel y precio: lectura de formularios, estadísticas, CSV y datos que faltan', async () => {
  const { parseElev, parsePrice, elevText, yearSummary, yearInsights, raceGaps, missingFields, csvRows, toCsv, importResultsCsv } = await import('../js/logic.js');
  assert.equal(parseElev('1.250'), 1250); assert.equal(parseElev('1250 m'), 1250); assert.equal(parseElev('0'), null); assert.equal(parseElev(''), null); assert.equal(parseElev('20000'), null);
  assert.equal(parsePrice('27,5'), 27.5); assert.equal(parsePrice('30 €'), 30); assert.equal(parsePrice('0'), 0); assert.equal(parsePrice(''), null); assert.equal(parsePrice('-4'), null); assert.equal(parsePrice('12,345'), null);
  assert.equal(elevText(1250), '1.250 m');
  const runners = [{ id: 'a', name: 'Anna', category: 'M40' }, { id: 'b', name: 'Bru' }];
  const res = (id, n, pos) => ({ runner_id: id, runner_name: n, position: pos, category: 'M40' });
  const races = [
    { id: 'r1', name: 'Dura', date: '2026-03-07', modality: 'BTT', subtype: 'XCM', km: 60, elevation: 2400, price: 40, results: [res('a', 'Anna', 1), res('b', 'Bru', 5)] },
    { id: 'r2', name: 'Llana', date: '2026-04-11', modality: 'Carretera', km: 100, elevation: 300, price: 20, results: [res('a', 'Anna', 9)] },
    { id: 'r3', name: 'Sin datos', date: '2026-05-02', modality: 'BTT', results: [res('b', 'Bru', 3)] },
    { id: 'r4', name: 'Gratis', date: '2026-06-06', modality: 'Pista', price: 0, results: [res('a', 'Anna', 2)] },
  ];
  const s = yearSummary(2026, races, runners);
  assert.equal(s.totals.elevation, 2400 * 2 + 300);            // cada participación suma el desnivel de su carrera
  assert.equal(s.totals.cost, 40 * 2 + 20 + 0);                // y el precio de su inscripción
  assert.equal(s.totals.elevRaces, 2); assert.equal(s.totals.pricedRaces, 3); assert.equal(s.totals.avgPrice, 20);   // media por carrera con precio: (40+20+0)/3
  assert.equal(s.hardest.race, 'Dura'); assert.equal(s.hardest.elevation, 2400); assert.deepEqual(s.hardest.runners, ['Anna', 'Bru']);
  assert.equal(s.steepest.race, 'Dura'); assert.equal(s.steepest.value, 40);   // 2400 m / 60 km
  assert.equal(s.priciest.race, 'Dura'); assert.equal(s.priciest.price, 40);
  const anna = s.perRunner.find((r) => r.key === 'a'), bru = s.perRunner.find((r) => r.key === 'b');
  assert.equal(anna.elev, 2700); assert.equal(anna.cost, 60); assert.equal(bru.elev, 2400); assert.equal(bru.cost, 40);
  assert.equal(s.byMonth[2].elev, 4800); assert.equal(s.byMonth[3].elev, 300); assert.equal(s.byMonth[2].cost, 80);
  const xcm = s.disciplines.find((d) => d.key === 'BTT|XCM'); assert.equal(xcm.elevation, 4800); assert.equal(xcm.avgElev, 2400); assert.equal(xcm.avgPrice, 40);
  assert.equal(s.byCategory.find((c) => c.category === 'M40').elev, 2400 + 2400 + 300);   // Anna y Bru en la dura + Anna en la llana
  const i = yearInsights(2026, races, runners, [], '2026-01-01');
  assert.equal(i.withElev, 2); assert.equal(i.avgElev, 1350); assert.equal(i.climb, Math.round(((2400 + 300) / (60 + 100)) * 10) / 10);
  assert.deepEqual(raceGaps(races[2]), ['provincia', 'disciplina', 'km', 'desnivel', 'precio', 'ubicación']);
  assert.ok(!raceGaps(races[3]).includes('precio'), 'precio 0 (gratis) cuenta como indicado');
  assert.deepEqual(missingFields(races[2], { extra: true }).filter((k) => k === 'elevation' || k === 'price'), ['elevation', 'price']);
  assert.ok(!missingFields(races[2]).includes('elevation'), 'sin `extra` no se piden');
  const csv = toCsv(csvRows(races));
  const back = importResultsCsv(csv).races.find((r) => r.name === 'Dura');
  assert.equal(back.elevation, 2400); assert.equal(back.price, 40); assert.equal(back.km, 60); assert.equal(back.subtype, 'XCM');
  assert.equal(importResultsCsv(csv).races.find((r) => r.name === 'Gratis').price, 0);
});

test('desplazamientos: poblaciones, distancias desde el punto de salida y estadísticas', async () => {
  const { ORIGEN, haversineKm, placeCoords, coordsOf, distanceKm, geoKey } = await import('../js/viajes.js');
  const { yearSummary, yearInsights, raceGaps } = await import('../js/logic.js');
  const monzon = placeCoords('Monzón').lat ? { lat: 41.9166, lon: 0.199 } : null, lleida = { lat: 41.617, lon: 0.62 };
  assert.ok(Math.abs(haversineKm(monzon, lleida) - 48) < 3, 'Monzón–Lleida ≈ 48 km en línea recta');
  assert.ok(Math.abs(haversineKm(ORIGEN, lleida) - 24) < 3 && Math.abs(haversineKm(ORIGEN, monzon) - 24) < 3, 'el punto de salida está a medio camino');
  assert.equal(placeCoords('MONZON').src, 'town'); assert.equal(placeCoords('Les Borges Blanques').src, 'town'); assert.equal(placeCoords('Seo de Urgel').src, 'town');
  assert.equal(placeCoords('Sant Celoni (Barcelona)').src, 'town'); assert.equal(placeCoords('Salida y meta en Cervera, Lleida').src, 'town');
  assert.equal(placeCoords('Pueblo Inventado', 'Huesca').src, 'province'); assert.equal(placeCoords('Pueblo Inventado', 'Zzz'), null); assert.equal(placeCoords('', ''), null);
  const guardada = { place: 'Pueblo Inventado', province: 'Huesca', lat: 42.5, lon: 0.5 };
  assert.equal(coordsOf(guardada).src, 'province', 'las coordenadas guardadas solo valen si la clave coincide');
  assert.deepEqual(coordsOf({ ...guardada, geo_key: geoKey(guardada) }), { lat: 42.5, lon: 0.5, src: 'geo' });
  assert.equal(coordsOf({ ...guardada, geo_key: geoKey(guardada), place: 'Otro sitio' }).src, 'province', 'si cambia el lugar, vuelven las de la provincia');
  const bcn = distanceKm({ place: 'Barcelona' }), ll = distanceKm({ place: 'Lleida' });
  assert.ok(bcn.km > 180 && bcn.km < 200, `Barcelona ≈ 190 km por carretera (salió ${bcn.km})`); assert.ok(bcn.bearing > 90 && bcn.bearing < 125, 'Barcelona queda al este-sureste');
  assert.ok(ll.km >= 25 && ll.km <= 35); assert.equal(distanceKm({ place: '' }), null);
  const runners = [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Bru' }];
  const res = (id, n, p) => ({ runner_id: id, runner_name: n, position: p, category: 'M40' });
  const races = [
    { id: 'r1', name: 'Lejana', date: '2026-03-07', modality: 'Carretera', place: 'Barcelona', results: [res('a', 'Anna', 1), res('b', 'Bru', 5)] },
    { id: 'r2', name: 'Cerca', date: '2026-04-11', modality: 'BTT', place: 'Lleida', results: [res('a', 'Anna', 9)] },
    { id: 'r3', name: 'Provincia', date: '2026-05-02', modality: 'BTT', place: 'Pueblo Inventado', province: 'Huesca', results: [res('b', 'Bru', 3)] },
    { id: 'r4', name: 'Sin sitio', date: '2026-06-06', modality: 'Pista', results: [res('a', 'Anna', 2)] },
  ];
  const s = yearSummary(2026, races, runners);
  const dB = bcn.km, dL = ll.km, dP = distanceKm({ place: 'x', province: 'Huesca' }).km;
  assert.equal(s.totals.travelRaces, 3); assert.equal(s.totals.travelApprox, 1);
  assert.equal(s.totals.travelKm, 2 * (dB * 2 + dL + dP), 'ida y vuelta de cada participación');
  assert.equal(s.totals.avgDist, Math.round((dB + dL + dP) / 3));
  const anna = s.perRunner.find((r) => r.key === 'a'), bru = s.perRunner.find((r) => r.key === 'b');
  assert.equal(anna.trip, 2 * (dB + dL)); assert.equal(anna.tripN, 2); assert.equal(anna.tripMax, dB); assert.equal(anna.tripRace, 'Lejana');
  assert.equal(bru.trip, 2 * (dB + dP));
  assert.equal(s.farthest.race, 'Lejana'); assert.equal(s.farthest.value, dB); assert.deepEqual(s.farthest.runners, ['Anna', 'Bru']);
  assert.equal(s.byMonth[2].trip, 2 * dB * 2); assert.equal(s.disciplines.find((d) => d.key === 'Carretera|').trip, 2 * dB * 2);
  const i = yearInsights(2026, races, runners);
  assert.equal(i.cal.find((c) => c.id === 'r1').dist, dB); assert.equal(i.cal.find((c) => c.id === 'r4').dist, null);
  assert.ok(raceGaps(races[3]).includes('ubicación') && !raceGaps(races[0]).includes('ubicación'));
});

test('buscador de poblaciones: se elige la del país y la provincia de la carrera', async () => {
  const { pickGeocode } = await import('../js/viajes.js');
  const lista = [
    { name: 'Vic', latitude: 43.0, longitude: 1.0, country_code: 'FR', admin1: 'Occitania', admin2: 'Ariège', population: 900 },
    { name: 'Vic', latitude: 41.93012, longitude: 2.25456, country_code: 'ES', admin1: 'Cataluña', admin2: 'Barcelona', population: 47000 },
    { name: 'Vic', latitude: 39.5, longitude: -0.4, country_code: 'ES', admin1: 'Comunidad Valenciana', admin2: 'Valencia', population: 120 },
  ];
  assert.deepEqual(pickGeocode(lista, 'Barcelona', 'España'), { lat: 41.93012, lon: 2.25456 });
  assert.deepEqual(pickGeocode(lista, 'Valencia', 'España'), { lat: 39.5, lon: -0.4 }, 'la provincia pesa más que la población');
  assert.deepEqual(pickGeocode(lista, '', 'España'), { lat: 41.93012, lon: 2.25456 }, 'sin provincia, la más poblada de España');
  assert.deepEqual(pickGeocode(lista, '', 'Francia'), { lat: 43, lon: 1 });
  assert.deepEqual(pickGeocode(lista.slice(0, 1), 'Barcelona', 'España'), { lat: 43, lon: 1 }, 'si solo hay resultados de otro país (el país por defecto suele no estar cambiado), se usa ese');
  assert.equal(pickGeocode([], 'Huesca'), null); assert.equal(pickGeocode(undefined), null);
});

test('resumen por mes: participaciones, km, tiempo y podios de cada mes', async () => {
  const { yearSummary } = await import('../js/logic.js');
  const runners = [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Bru' }];
  const res = (id, n, pos, t) => ({ runner_id: id, runner_name: n, position: pos, time_seconds: t, category: 'M40' });
  const races = [
    { id: 'r1', name: 'Uno', date: '2026-03-07', modality: 'BTT', km: 50, results: [res('a', 'Anna', 1, 7200), res('b', 'Bru', 9, 8000)] },
    { id: 'r2', name: 'Dos', date: '2026-03-21', modality: 'BTT', km: 30, results: [res('a', 'Anna', 3, 4000)] },
    { id: 'r3', name: 'Tres', date: '2026-05-02', modality: 'Carretera', km: 100, results: [res('b', 'Bru', 2, null)] },
  ];
  const m = yearSummary(2026, races, runners).byMonth;
  assert.equal(m[2].parts, 3); assert.equal(m[2].km, 50 * 2 + 30); assert.equal(m[2].time, 7200 + 8000 + 4000); assert.equal(m[2].pod, 2); assert.equal(m[2].wins, 1);
  assert.equal(m[4].parts, 1); assert.equal(m[4].km, 100); assert.equal(m[4].time, 0); assert.equal(m[4].pod, 1);
  assert.equal(m[0].parts, 0);
});

test('modalidad → disciplina: las disciplinas cuelgan de su modalidad y «BTT» no es una disciplina más', async () => {
  const { yearSummary, modalityTree, subLabel, fullLabel } = await import('../js/logic.js');
  const runners = [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Bru' }];
  const res = (id, n, p) => ({ runner_id: id, runner_name: n, position: p, category: 'M40' });
  const races = [
    { id: 'r1', name: 'Uno', date: '2026-03-07', modality: 'BTT', subtype: 'XCO', elevation: 800, results: [res('a', 'Anna', 1), res('b', 'Bru', 5)] },
    { id: 'r2', name: 'Dos', date: '2026-03-14', modality: 'BTT', subtype: 'XCM', results: [res('a', 'Anna', 2)] },
    { id: 'r3', name: 'Tres', date: '2026-04-11', modality: 'BTT', results: [res('b', 'Bru', 9)] },                       // BTT sin disciplina indicada
    { id: 'r4', name: 'Cuatro', date: '2026-05-02', modality: 'Carretera', subtype: 'Critérium', results: [res('a', 'Anna', 3)] },
    { id: 'r5', name: 'Cinco', date: '2026-06-06', modality: 'Gravel', results: [res('b', 'Bru', 4)] },
  ];
  const t = modalityTree(yearSummary(2026, races, runners));
  assert.deepEqual(t.map((m) => [m.modality, m.races]), [['BTT', 3], ['Carretera', 1], ['Gravel', 1]], 'primer nivel: solo modalidades');
  const btt = t[0];
  assert.deepEqual(btt.children.map((d) => d.label).sort(), ['Sin formato', 'XCM', 'XCO']);
  assert.equal(btt.children.at(-1).label, 'Sin formato', 'lo que no tiene disciplina, al final y como hijo de BTT');
  assert.equal(btt.children.reduce((n, d) => n + d.races, 0), btt.races, 'los hijos suman lo de la modalidad');
  assert.equal(btt.children.reduce((n, d) => n + d.participations, 0), btt.participations);
  assert.equal(btt.participations, 4); assert.equal(btt.elevation, 800 * 2); assert.equal(btt.runners, 2);
  assert.deepEqual(t[2].children, [], 'Gravel no tiene formatos: sin hijos');
  assert.equal(subLabel('BTT', ''), 'Sin formato'); assert.equal(subLabel('BTT', 'XCO'), 'XCO'); assert.equal(subLabel('Gravel', ''), 'Gravel');
  assert.equal(fullLabel('BTT', ''), 'BTT · sin formato'); assert.equal(fullLabel('Carretera', 'Critérium'), 'Carretera · Critérium'); assert.equal(fullLabel('Pista', ''), 'Pista');
});

test('el tiempo de las tres casillas (h:mm:ss, con horas 0) se entiende', async () => {
  const { parseTime } = await import('../js/logic.js');
  assert.equal(parseTime('0:45:10'), 2710);
  assert.equal(parseTime('2:05:30'), 7530);
  assert.equal(parseTime('0:00:30'), 30);
  assert.equal(parseTime('0:61:00'), null);
});

test('Por valorar: «Repetir el año que viene» mueve 52 semanas, marca la fecha por confirmar y quita el plazo', () => {
  const w = { name: 'MB Race', date: '2027-07-03', end_date: '2027-07-04', place: 'Megève', modality: 'BTT', subtype: 'UXCM', km: 100, price: 90, url: 'https://www.alpinecup.com', deadline: '2027-06-01', notes: 'Con el grupo' };
  const n = nextYearWatch(w);
  assert.equal(n.date, '2028-07-01'); assert.equal(n.end_date, '2028-07-02');
  assert.equal(new Date(n.date + 'T12:00:00Z').getUTCDay(), new Date(w.date + 'T12:00:00Z').getUTCDay());   // mismo día de la semana
  assert.equal(n.deadline, ''); assert.equal(n.url, w.url); assert.equal(n.km, 100); assert.equal(n.price, 90);
  assert.ok(watchTbc(n) && n.notes.includes('Con el grupo') && n.notes.length <= 500);
  const m = nextYearWatch({ ...w, ...n });   // repetir dos veces no apila la marca ni las notas
  assert.equal(m.date, '2029-06-30'); assert.equal(m.notes.split(WATCH_TBC).length, 2);
  assert.equal(watchTbc({ notes: 'Con el grupo' }), false);
});

test('impacto en redes: historia automática, resultado del corredor, publicado por el club y crónica', async () => {
  const { raceImpact, parseStoryLog } = await import('../js/logic.js');
  const items = [{ key: '2026-10-10|a', date: '2026-10-10', name: 'A' }, { key: '2026-10-17|b', date: '2026-10-17', name: 'B' }, { key: '2026-10-24|c', date: '2026-10-24', name: 'C' }];
  const story = parseStoryLog({ desde: '2026-10-01', historias: [{ carrera: 'A', fecha: '2026-10-10', publicada: '2026-10-08' }] });
  const r = raceImpact(items, { posted: new Set(['2026-10-17|b', 'res|2026-10-10|a']), story, chron: new Set(['2026-10-24|c']), mine: new Set(['2026-10-10|a', '2026-10-24|c']) });
  assert.deepEqual(r.rows.map((x) => [x.story, x.mine, x.published, x.cro]), [[true, true, true, false], [true, false, false, false], [false, true, false, true]]);
  assert.deepEqual(r.totals, { races: 3, stories: 2, results: 2, published: 1, chronicles: 1 });
  assert.deepEqual(raceImpact([]).totals, { races: 0, stories: 0, results: 0, published: 0, chronicles: 0 });
});

test('carrera frente a viaje: pocas carreras largas no salen peor que muchas cortas', async () => {
  const { tripRatio } = await import('../js/logic.js');
  // mismo origen que el resto de la app: A corre cerca (Fraga, 35 km) y B lejos (Valencia, 330 km)
  const near = { km: 800, place: 'Fraga', province: 'Huesca' }, far = { km: 30, place: 'Valencia', province: 'Valencia' };
  const a = tripRatio([near, near]), b = tripRatio(Array.from({ length: 10 }, () => far));
  assert.ok(a.km === 1600 && b.km === 300);
  assert.ok(a.ratio > b.ratio * 5, 'A (2 de 800 km, cerca) compensa mucho más que B (10 de 30 km, lejos)');
  assert.deepEqual(tripRatio([{ km: 50 }, { place: 'Fraga', province: 'Huesca' }, {}]), { km: 0, trip: 0, ratio: 0 });   // sin km o sin ubicación no cuenta
  assert.deepEqual(tripRatio([]), { km: 0, trip: 0, ratio: 0 });
});
