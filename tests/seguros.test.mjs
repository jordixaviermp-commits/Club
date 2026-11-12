// Comprueba que los datos del seguro (botón «Accidente») son coherentes y que el PDF enlazado existe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { SEGUROS } from '../js/seguros.js';

test('seguros: teléfono, correos y pólizas con formato válido', () => {
  const a = SEGUROS.accidentes, rc = SEGUROS.responsabilidadCivil;
  assert.equal(a.telefono.replace(/\D/g, '').length, 9);
  assert.match(a.email, /^[^@\s]+@[^@\s]+\.[a-z]+$/);
  assert.match(rc.email, /^[^@\s]+@[^@\s]+\.[a-z]+$/);
  assert.notEqual(a.email, rc.email); // accidentes y responsabilidad civil van a correos distintos
  assert.ok(a.poliza && rc.poliza);
  assert.ok(a.plazoDias > 0 && rc.franquicia > 0);
  assert.match(SEGUROS.info, /^https:\/\//);
  assert.ok(rc.polizaMenores.poliza);
  assert.equal(rc.casos.length, 2);
  for (const c of rc.casos) assert.ok(c.titulo && c.antes && c.adjuntar.length > 0, c.id);
});

test('seguros: los PDF de la declaración y el protocolo de responsabilidad civil están en la app', async () => {
  for (const f of [SEGUROS.responsabilidadCivil.formulario, SEGUROS.responsabilidadCivil.protocolo]) await access(new URL('../' + f, import.meta.url));
});
