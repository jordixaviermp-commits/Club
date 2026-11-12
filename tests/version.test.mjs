// La versión que muestra la app (js/version.js) tiene que ser la misma que la de la caché del service worker (sw.js).
// Si esta prueba falla: al subir la versión hay que cambiarla en los dos archivos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { VERSION } from '../js/version.js';

test('la versión de js/version.js coincide con la caché de sw.js y se guarda en el arranque', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(VERSION, /^v\d+$/);
  assert.equal(/const CACHE = 'monzon-(v\d+)'/.exec(sw)?.[1], VERSION);
  assert.ok(sw.includes("'js/version.js'"), 'js/version.js debe estar en la lista de arranque del service worker');
});
