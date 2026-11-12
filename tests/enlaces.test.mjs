// Los enlaces de la pestaña Contrato: https, con texto, y los de Google Forms sin los parámetros que identifican la cuenta del creador.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENLACES_CONTRATO } from '../js/enlaces.js';

test('enlaces del club: https, con título, texto y botón', () => {
  assert.ok(ENLACES_CONTRATO.length > 0);
  for (const l of ENLACES_CONTRATO) {
    assert.match(l.href, /^https:\/\//, l.titulo);
    assert.ok(l.titulo && l.texto && l.boton, l.titulo);
  }
});

test('enlaces de Google Forms: sin «ouid» (identificador de la cuenta del creador) ni «usp»', () => {
  for (const l of ENLACES_CONTRATO.filter((x) => x.href.includes('docs.google.com/forms'))) {
    assert.doesNotMatch(l.href, /[?&](ouid|usp)=/, l.titulo);
    assert.match(l.href, /\/viewform$/, l.titulo);
  }
});
