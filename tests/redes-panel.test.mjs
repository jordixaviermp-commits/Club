import test from 'node:test';
import assert from 'node:assert/strict';
import { socialBoard, postKeyOf, resKeyOf, parseStoryLog, chronicleStatus } from '../js/logic.js';

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

test('crónicas del corredor: participadas, pendientes y pasadas; solo de la temporada', () => {
  const d = { me: { id: 'me' }, my_results: [{ race_id: 'a', name: 'Hecha uno', date: '2026-10-25' }, { race_id: 'b', name: 'Hecha dos', date: '2026-11-08' }, { race_id: 'o', name: 'De 2025', date: '2025-05-01' }],
    registrations: [{ id: 'c', name: 'Corrida sin resultado', date: '2026-11-12', entries: [{ runner_id: 'me' }] }, { id: 'f', name: 'Futura', date: '2026-12-01', entries: [{ runner_id: 'me' }] },
      { id: 'x', name: 'De otro', date: '2026-11-10', entries: [{ runner_id: 'otro' }] }, { id: 's', name: 'Suspendida', date: '2026-11-11', suspended: true, entries: [{ runner_id: 'me' }] }] };
  const done = new Set([postKeyOf({ date: '2026-10-25', name: 'Hecha uno' })]);
  const c = chronicleStatus(d, done, '2026-11-14', 2026);
  assert.deepEqual(c.pending.map((x) => x.name), ['Corrida sin resultado', 'Hecha dos']);   // lo más reciente primero
  assert.deepEqual(c.done.map((x) => x.name), ['Hecha uno']);
  assert.equal(c.total, 3);
  assert.equal(chronicleStatus(d, done, '2026-11-14', null).total, 4);                      // sin filtrar por temporada entra la de 2025
  assert.equal(chronicleStatus({ me: { id: 'me' } }, new Set(), '2026-11-14').total, 0);
});

test('panel de redes: crónicas de una carrera (quién falta)', () => {
  const r = race('cr', 'Con crónicas', '2026-11-10', { results: [{ runner_id: 'p1', runner_name: 'Pere' }, { runner_id: 'p2', runner_name: 'Joan' }] });
  const mk = (done) => socialBoard([r], [], new Set(), TODAY, null, { chron: { done: new Map([[postKeyOf(r), new Set(done)]]) } });
  const it = (b) => b.items.find((x) => x.id === 'cr');
  assert.match(piece(it(mk(['p1'])), 'cro').text, /1\/2 · faltan Joan/); assert.equal(piece(it(mk(['p1'])), 'cro').st, 'curso');   // terminó hace 4 días
  assert.deepEqual(piece(it(mk(['p1'])), 'cro').people, [{ id: 'p2', name: 'Joan', done: false }, { id: 'p1', name: 'Pere', done: true }]);   // para marcarlas desde la dirección
  assert.equal(piece(it(mk(['p1'])), 'cro').key, postKeyOf(r));
  assert.equal(piece(it(mk(['p1', 'p2'])), 'cro').st, 'ok');
  const old = race('co', 'Antigua', '2026-11-01', { results: [{ runner_id: 'p1', runner_name: 'Pere' }] });
  assert.equal(piece(socialBoard([old], [], new Set(), TODAY, null, { chron: { done: new Map() } }).items[0], 'cro').st, 'late');   // más de 7 días sin crónica
  assert.equal(piece(socialBoard([r], [], new Set(), TODAY, null).items[0], 'cro'), undefined);                              // sin el SQL no hay pieza
});
