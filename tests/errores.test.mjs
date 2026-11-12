// Mensajes de error comprensibles para el corredor (js/api.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { friendlyError } from '../js/api.js';

test('retirar un plus ya confirmado: mensaje claro, no «solo puedes cambiar las carreras que has añadido tú»', () => {
  const m = friendlyError(new Error('plus_confirmado'));
  assert.match(m, /ya ha confirmado/);
  assert.match(m, /no se puede retirar/);
  assert.doesNotMatch(m, /has añadido tú/);
});

test('el resto de errores no cambia', () => {
  assert.match(friendlyError(new Error('no_es_tuya')), /has añadido tú/);
  assert.match(friendlyError(new Error('enlace_no_valido')), /ya no es válido/);
  assert.equal(friendlyError(new Error('algo raro')), 'algo raro');
});
