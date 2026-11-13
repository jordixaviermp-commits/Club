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
    assert.ok(PROVINCES.includes(r.province), r.province);
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
  assert.ok(por.has("Xallenger BTT Terres de l'Ebre 2027") && por.has('Open Maxxis Marathon by Bryton 2027'));
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
