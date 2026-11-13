// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
  assert.deepEqual(s.totals, { races: 3, runners: 3, participations: 4, podiums: 3, wins: 1, km: 0, time: 0, timed: 0 });
  assert.deepEqual(s.byModality.map((m) => m.modality), ['Carretera', 'BTT', 'Gravel']); // Pista no aparece en 2026
  assert.deepEqual(s.byModality[1], { modality: 'BTT', races: 1, participations: 2, podiums: 2, wins: 0, runners: 2 });
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
  assert.ok(csv.startsWith('﻿Fecha;Fecha fin;Carrera;Lugar;Provincia;País;Modalidad;Corredor;Categoría;Puesto;Podio;Tipo de podio\r\n'));
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
  assert.deepEqual(s.totals, { races: 1, runners: 2, participations: 2, podiums: 4, wins: 2, km: 0, time: 0, timed: 0 });
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
  assert.deepEqual(SUBTYPES.BTT, ['XCO', 'XCM', 'UXCM', 'Otra']); assert.ok(SUBTYPES.Carretera.includes('Critérium'));
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
    { id: 'r1', name: 'Uno', date: '2026-03-01', modality: 'BTT', province: 'Huesca', country: 'España', km: 50, results: [{ runner_id: 'a', runner_name: 'Ana', position: 1, podium_type: 'suelta', time_seconds: 7200 }] },
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
  assert.equal(det.length, 2); assert.equal(det[0][3], 'Uno'); assert.equal(det[0][15], '2:00:00');
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
