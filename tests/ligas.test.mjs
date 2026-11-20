// Comprueba el archivo de ligas escrito a mano y que se encuentran al buscar por liga, pueblo o nombre.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { searchRaces, MODALITIES, PROVINCES } from '../js/logic.js';

const data = JSON.parse(await readFile(new URL('../data/ligas.json', import.meta.url), 'utf8'));

test('ligas.json: cada carrera tiene los datos que usa la app', () => {
  assert.ok(data.races.length > 0);
  const seen = new Set();
  for (const r of data.races) {
    assert.equal(r.source, 'LIGA');
    assert.ok(r.league && r.name && r.place, r.name);
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(r.date)), r.date);
    assert.ok(MODALITIES.includes(r.modality), r.modality);
    assert.ok(r.province ? PROVINCES.includes(r.province) : r.country !== 'España', r.name);   // fuera de España (Andorra) no hay provincia
    if (r.url) assert.match(r.url, /^https:\/\//);
    // «circuit» es opcional (solo las ligas con clasificación general); si lo lleva, igual en todas las pruebas de la liga
    const k = r.date + '|' + r.name;
    assert.ok(!seen.has(k), 'repetida: ' + k);
    seen.add(k);
  }
});

test('cada liga usa un solo nombre de circuito', () => {
  const por = new Map();
  for (const r of data.races) if (r.circuit) (por.get(r.league) || por.set(r.league, new Set()).get(r.league)).add(r.circuit);
  for (const [liga, nombres] of por) assert.equal(nombres.size, 1, liga);
  assert.ok(por.has("Xallenger BTT Terres de l'Ebre 2027") && por.has('Open Maxxis Marathon by Bryton 2027') && por.has('Copa Catalana Internacional BTT 2027') && por.has('Marathon Cup BTT 2027'));
});

test('las carreras de la liga salen al buscar por liga, pueblo o nombre', () => {
  const names = (q) => searchRaces(q, data.races).map((r) => r.name);
  assert.equal(names('xallenger').length, 9);
  assert.equal(names('maxxis').length, 9);
  assert.ok(names('vendrell').includes('Open Maxxis Marathon – El Vendrell'));
  assert.ok(names('gandesa').includes('5a Garnatxa Bike Race'));
  assert.ok(names('garnatxa')[0] === '5a Garnatxa Bike Race');
  assert.ok(names('ràpita').includes('Bandolers 11.0'));
});

test('Hivernal de Resistència BTT: las 3 pruebas salen al buscar por liga, pueblo o equipo', () => {
  const names = (q) => searchRaces(q, data.races).map((r) => r.name);
  assert.equal(names('hivernal').length, 3);
  assert.ok(names('la granada').includes('6a Hivernal de Resistència BTT – Tot Vici en Bici'));
  assert.ok(names('monjos').includes('6a Hivernal de Resistència BTT – KPT'));
  assert.ok(names('vilafranca').includes('6a Hivernal de Resistència BTT – Metalbikers'));
  assert.ok(names('resistencia').length >= 3);   // sin tildes
  const h = data.races.filter((r) => /Hivernal/.test(r.name));
  assert.deepEqual(h.map((r) => r.date), ['2026-12-27', '2027-01-10', '2027-01-17']);
});

test('Copa Catalana Internacional BTT 2027: 6 pruebas de XCO que se encuentran por liga, pueblo y nombre', () => {
  const names = (q) => searchRaces(q, data.races).map((r) => r.name);
  assert.equal(names('copa catalana').length, 6);
  assert.ok(names('banyoles').includes('Copa Catalana Internacional BTT – Banyoles'));
  assert.ok(names('naturland').filter((n) => /Copa Catalana/.test(n)).length === 1 && names('molina').length >= 1 && names('santa susanna').length === 1);
  const cc = data.races.filter((r) => r.league === 'Copa Catalana Internacional BTT 2027');
  assert.deepEqual(cc.map((r) => r.date), ['2027-01-30', '2027-02-20', '2027-04-04', '2027-04-24', '2027-05-29', '2027-06-26']);
  assert.ok(cc.every((r) => r.subtype === 'XCO' && r.circuit === 'Copa Catalana Internacional BTT'));
  assert.equal(cc.find((r) => r.place === 'Naturland').country, 'Andorra');
});

test('Marathon Cup BTT 2027: 3 pruebas de XCM que se encuentran por liga, pueblo y nombre', () => {
  const names = (q) => searchRaces(q, data.races).map((r) => r.name);
  assert.equal(names('marathon cup btt').filter((n) => /^Marathon Cup/.test(n)).length, 3);
  assert.ok(names('sea otter').includes('Marathon Cup BTT – Sea Otter Europe'));
  assert.ok(names('fruitos').includes('Marathon Cup BTT – St. Fruitós de Bages'));
  const mc = data.races.filter((r) => r.league === 'Marathon Cup BTT 2027');
  assert.deepEqual(mc.map((r) => r.date), ['2027-05-08', '2027-05-30', '2027-09-19']);
  assert.ok(mc.every((r) => r.subtype === 'XCM' && r.circuit === 'Marathon Cup BTT'));
  assert.equal(mc.find((r) => r.place === 'Naturland').country, 'Andorra');
});

test('La Invernal Motorland 2027: sale al buscar por nombre o circuito', () => {
  const names = (q) => searchRaces(q, data.races).map((r) => r.name);
  assert.ok(names('invernal').includes('La Invernal Motorland'));
  assert.ok(names('motorland').includes('La Invernal Motorland'));
  assert.equal(data.races.find((r) => r.name === 'La Invernal Motorland').date, '2027-01-23');
});

test('Europeos UEC MTB La Molina 2027 (XCO Máster y Descenso): salen al buscar por nombre o pueblo', () => {
  const names = (q) => searchRaces(q, data.races).map((r) => r.name);
  assert.ok(names('europa').includes('Campeonato de Europa UEC MTB XCO Máster – La Molina'));
  assert.ok(names('descenso').includes('Campeonato de Europa UEC MTB Descenso – La Molina'));
  assert.equal(data.races.filter((r) => r.league === 'Europeos UEC MTB La Molina 2027').length, 2);
  assert.equal(data.races.find((r) => /Descenso/.test(r.name)).subtype, 'Descenso');
});

test('MB Race (MTB Alpine Cup 2027): sale al buscar por nombre, pueblo o Ultra', () => {
  const names = (q) => searchRaces(q, data.races).map((r) => r.name);
  const n = 'MTB Alpine Cup – MB Race Megève-Combloux';
  assert.ok(names('mb race').includes(n) && names('megeve').includes(n) && names('alpine cup').includes(n));
  const r = data.races.find((x) => x.name === n);
  assert.deepEqual([r.date, r.subtype, r.country, r.circuit], ['2027-07-03', 'UXCM', 'Francia', 'MTB Alpine Cup']);
});

test('el buscador encuentra por modalidad y formato: btt, mtb, mountain bike, xco, descenso', () => {
  const names = (q) => searchRaces(q, data.races).map((r) => r.name);
  for (const q of ['btt', 'mtb', 'mountain bike', 'Mountain Bike']) assert.ok(names(q).includes('MTB Alpine Cup – MB Race Megève-Combloux'), q);
  assert.ok(names('mtb').length >= data.races.filter((r) => r.modality === 'BTT').length);
  assert.ok(names('xco').includes('Campeonato de Europa UEC MTB XCO Máster – La Molina') && names('downhill').includes('Campeonato de Europa UEC MTB Descenso – La Molina'));
  assert.ok(!names('mtb').includes('La Invernal Motorland'));   // una de carretera no sale por «mtb»
  assert.ok(names('mtb marathon').slice(0, 3).every((n) => /Marathon/i.test(n)));   // más palabras afinan
});

test('Gigante de Piedra 2027 (Small y Gigante, NUE Series): salen al buscar por nombre, pueblo o serie', () => {
  const names = (q) => searchRaces(q, data.races).map((r) => r.name);
  assert.ok(names('gigante').includes('Gigante Small – Sant Joan de Moró') && names('gigante').includes('Gigante de Piedra – Sant Joan de Moró'));
  assert.ok(names('nue').length >= 2 && names('moro').length >= 2);
  const g = data.races.filter((r) => r.league === 'NUE Series 2027');
  assert.deepEqual(g.map((r) => [r.date, r.subtype]), [['2027-05-08', 'XCM'], ['2027-06-05', 'UXCM']]);
});

test('Bike Marathon Pulmón de Acero 2027: sale al buscar por nombre o pueblo', () => {
  const names = (q) => searchRaces(q, data.races).map((r) => r.name);
  assert.ok(names('pulmon de acero').includes('Bike Marathon Pulmón de Acero') && names('barakaldo').includes('Bike Marathon Pulmón de Acero'));
  const r = data.races.find((x) => x.name === 'Bike Marathon Pulmón de Acero');
  assert.deepEqual([r.date, r.subtype, r.province], ['2027-09-25', 'XCM', 'Bizkaia']);
});
