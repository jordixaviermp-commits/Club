import test from 'node:test';
import assert from 'node:assert/strict';
import { socialBoard, postKeyOf, resKeyOf, parseStoryLog } from '../js/logic.js';

const reg = (id, name, date, extra = {}) => ({ id, name, date, entries: [{ runner_id: 'r1' }], modality: 'BTT', ...extra });
const race = (id, name, date, extra = {}) => ({ id, name, date, results: [{ runner_id: 'r1', position: 1 }], modality: 'BTT', ...extra });
const TODAY = '2026-11-14';
const by = (b, id) => b.items.find((x) => x.id === id);
const piece = (it, k) => it.pieces.find((p) => p.k === k);

test('panel de redes: carrera próxima con historia programada y aviso sin publicar', () => {
  const b = socialBoard([], [reg('a', 'Prueba A', '2026-11-20')], new Set(), TODAY, parseStoryLog({ desde: '2026-11-10', historias: [] }));
  const it = by(b, 'a');
  assert.equal(piece(it, 'story').st, 'curso'); assert.match(piece(it, 'story').text, /sale el/);
  assert.equal(piece(it, 'aviso').st, 'pend'); assert.equal(it.status, 'pend');
  assert.deepEqual(b.counts, { pend: 1, curso: 0, hecho: 0 });
  assert.equal(b.nextStory.item.id, 'a');
});

test('panel de redes: aviso publicado e historia constada → hecho; lejana → en curso', () => {
  const log = parseStoryLog({ desde: '2026-11-01', historias: [{ carrera: 'Prueba B', fecha: '2026-11-16', pagina: 1, publicada: '2026-11-14', media_id: '1' }] });
  const posted = new Set([postKeyOf({ date: '2026-11-16', name: 'Prueba B' })]);
  const b = socialBoard([], [reg('b', 'Prueba B', '2026-11-16'), reg('c', 'Prueba C', '2026-12-10')], posted, TODAY, log);
  assert.equal(by(b, 'b').status, 'hecho');
  assert.equal(by(b, 'c').status, 'curso'); assert.equal(piece(by(b, 'c'), 'aviso').st, 'curso');
});

test('panel de redes: resultados por publicar, tardíos, publicados y esperando', () => {
  const posted = new Set([resKeyOf({ date: '2026-11-08', name: 'Hecha' })]);
  const b = socialBoard([race('r1', 'Reciente', '2026-11-12'), race('r2', 'Tarde', '2026-11-01'), race('r3', 'Hecha', '2026-11-08')],
    [reg('w', 'Esperando', '2026-11-13'), reg('x', 'Nadie', '2026-11-05')], posted, TODAY, null);
  assert.equal(piece(by(b, 'r1'), 'res').st, 'pend');
  assert.equal(piece(by(b, 'r2'), 'res').st, 'late'); assert.match(piece(by(b, 'r2'), 'res').text, /hace 13 días/);
  assert.equal(piece(by(b, 'r3'), 'res').st, 'ok');
  assert.equal(piece(by(b, 'w'), 'res').st, 'curso');
  assert.equal(piece(by(b, 'x'), 'res').st, 'pend'); assert.match(piece(by(b, 'x'), 'res').text, /nadie ha puesto/);
  assert.equal(b.items[0].status, 'pend');                      // lo pendiente va primero
  assert.equal(b.items[b.items.length - 1].status, 'hecho');    // y lo hecho al final
});

test('panel de redes: ventana de fechas, suspendidas y carreras sin inscritos', () => {
  const b = socialBoard([race('old', 'Antigua', '2026-09-01')], [reg('far', 'Lejana', '2027-03-01'), reg('none', 'Sin inscritos', '2026-11-20', { entries: [] }),
    reg('sus', 'Suspendida', '2026-11-22', { suspended: true })], new Set([postKeyOf({ date: '2026-11-22', name: 'Suspendida' })]), TODAY, null);
  assert.equal(b.items.length, 1);                              // solo la suspendida (con aviso ya publicado)
  assert.equal(by(b, 'sus').status, 'pend'); assert.match(by(b, 'sus').pieces[0].text, /anulación/);
  assert.equal(socialBoard([], [], new Set(), TODAY).items.length, 0);
});
