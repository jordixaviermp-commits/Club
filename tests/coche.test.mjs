import test from 'node:test';
import assert from 'node:assert/strict';
import { demoApi } from '../js/api.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('coche compartido (modo demo): plazas, un coche por carrera y limpieza', async () => {
  const api = demoApi(memory());
  await api.signIn();
  const all = await api.loadAll();
  const [A, B, C, D] = all.runners;
  const iso = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  const reg = await api.saveRegistration({ name: 'Cursa del Coche', date: iso, modality: 'Carretera' }, [{ runner_id: A.id, category: 'M40' }, { runner_id: B.id, category: 'M40' }, { runner_id: C.id, category: 'M40' }]);
  await api.signOut();

  await api.runnerCarSave(A.code, reg, 2, 'Monzón', '7:00', 'Sin parar');
  let cars = await api.runnerCars(D.code);                                              // lo ven todos, también quien no está inscrito
  assert.equal(cars.length, 1); assert.equal(cars[0].driver, A.name); assert.equal(cars[0].seats, 2); assert.equal(cars[0].from, 'Monzón');
  await assert.rejects(() => api.runnerCarSave(D.code, reg, 2, '', '', ''), /no_inscrito/);   // solo inscritos ofrecen
  await assert.rejects(() => api.runnerCarJoin(D.code, cars[0].id), /no_inscrito/);           // y solo inscritos se apuntan
  await assert.rejects(() => api.runnerCarJoin(A.code, cars[0].id), /ya_conduces/);           // el conductor no se apunta a su coche
  await api.runnerCarJoin(B.code, cars[0].id);
  await api.runnerCarJoin(C.code, cars[0].id);
  await assert.rejects(() => api.runnerCarSave(A.code, reg, 1, '', '', ''), /plazas_ocupadas/);   // no se puede dejar con menos plazas que apuntados
  assert.equal((await api.runnerCars(A.code))[0].riders.length, 2);
  // un coche por carrera: B ofrece el suyo (deja el de A) y C no cabe en el de A
  await api.runnerCarSave(B.code, reg, 3, 'Fraga', '', '');
  cars = await api.runnerCars(A.code);
  assert.equal(cars.length, 2); assert.equal(cars.find((c) => c.driver_id === A.id).riders.map((r) => r.id).join(), C.id);
  await api.runnerCarJoin(C.code, cars.find((c) => c.driver_id === B.id).id);              // C cambia de coche
  cars = await api.runnerCars(A.code);
  assert.equal(cars.find((c) => c.driver_id === A.id).riders.length, 0); assert.equal(cars.find((c) => c.driver_id === B.id).riders.length, 1);
  await api.runnerCarLeave(C.code, reg);
  assert.equal((await api.runnerCars(A.code)).find((c) => c.driver_id === B.id).riders.length, 0);
  await api.runnerCarDelete(A.code, reg);
  assert.equal((await api.runnerCars(A.code)).length, 1);
});
