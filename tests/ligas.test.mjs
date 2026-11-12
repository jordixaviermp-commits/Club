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
    assert.match(r.url, /^https:\/\//);
    assert.equal(r.circuit, "Xallenger BTT Terres de l'Ebre"); // mismo nombre en todas las pruebas: el podio de la general se agrupa por él
    const k = r.date + '|' + r.name;
    assert.ok(!seen.has(k), 'repetida: ' + k);
    seen.add(k);
  }
});

test('las carreras de la liga salen al buscar por liga, pueblo o nombre', () => {
  const names = (q) => searchRaces(q, data.races).map((r) => r.name);
  assert.equal(names('xallenger').length, data.races.length);
  assert.ok(names('gandesa').includes('5a Garnatxa Bike Race'));
  assert.ok(names('garnatxa')[0] === '5a Garnatxa Bike Race');
  assert.ok(names('ràpita').includes('Bandolers 11.0'));
});
