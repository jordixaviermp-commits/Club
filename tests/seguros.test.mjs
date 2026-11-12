// Comprueba que los datos de los seguros (botón «Accidente») son coherentes y que los PDF enlazados existen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { FEDERACIONES, ORDEN_FEDERACIONES } from '../js/seguros.js';

const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]+$/;
const digits = (t) => t.replace(/\D/g, '').length;

test('seguros: hay catalana y aragonesa, cada una con accidente y responsabilidad civil', () => {
  assert.deepEqual(ORDEN_FEDERACIONES, ['fcc', 'fac']);
  for (const id of ORDEN_FEDERACIONES) {
    const f = FEDERACIONES[id];
    assert.equal(f.id, id);
    assert.ok(f.corto && f.nombre && f.info.startsWith('https://'), id);
    assert.ok(f.accidente.poliza && f.accidente.aseguradora && f.rc.poliza && f.rc.aseguradora, id);
    assert.ok(f.accidente.pasos.length >= 2, id);
  }
});

test('seguros: teléfonos de 9 cifras, correos válidos y cada paso con título y texto', () => {
  for (const id of ORDEN_FEDERACIONES) {
    const f = FEDERACIONES[id];
    for (const p of f.accidente.pasos) {
      assert.ok(p.titulo && p.texto, `${id}: ${p.titulo}`);
      if (p.tel) assert.equal(digits(p.tel.numero), 9, `${id}: ${p.tel.numero}`);
      for (const c of [].concat(p.correo || [])) { assert.match(c.para, EMAIL); assert.ok(c.asunto); }
      if (p.copia) assert.ok(p.copia.valor && p.copia.etiqueta);
    }
    if (f.rc.tel) assert.equal(digits(f.rc.tel.numero), 9, `${id} rc`);
    if (f.rc.correo) assert.match(f.rc.correo.para, EMAIL);
  }
});

test('seguros catalana: los dos casos de RC, y accidentes y RC van a correos distintos', () => {
  const f = FEDERACIONES.fcc;
  assert.equal(f.rc.casos.length, 2);
  for (const c of f.rc.casos) assert.ok(c.titulo && c.antes && c.adjuntar.length > 0);
  const mailsAcc = f.accidente.pasos.flatMap((p) => [].concat(p.correo || [])).map((c) => c.para);
  assert.ok(mailsAcc.includes('siniestros@gerosalud.es')); // el parte va a Gerosalud, según la póliza
  assert.ok(!mailsAcc.includes(f.rc.correo.para)); // y la responsabilidad civil, a otro correo
});

test('seguros aragonesa: llamar antes de ir al médico, parte en 48 h y resumen de cobertura', () => {
  const f = FEDERACIONES.fac;
  assert.equal(f.accidente.pasos[0].tel.numero.replace(/\D/g, ''), '981941111');
  assert.ok(f.accidente.aviso && f.accidente.avisoFinal);
  assert.ok(f.accidente.resumen.length >= 3);
  assert.equal(f.accidente.pasos.filter((p) => p.correo).length, 2);
  assert.equal(FEDERACIONES.fcc.accidente.pasos[0].tel.numero.replace(/\D/g, ''), '981941111'); // la catalana llama al mismo Gerosalud
});

test('seguros: todos los PDF enlazados están en la app', async () => {
  for (const id of ORDEN_FEDERACIONES) {
    const { accidente, rc } = FEDERACIONES[id];
    for (const l of [...(accidente.pdfs || []), ...(rc.pdfs || [])]) {
      if (l.href.startsWith('http')) continue;
      await access(new URL('../' + l.href, import.meta.url));
    }
  }
});
