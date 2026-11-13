// Planificador de ruta (ruta/logic.js): lectura de tracks, tiempos de paso, subidas y viento.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as R from '../ruta/logic.js';

const ejemplo = async () => R.parseGPX(await readFile(new URL('../ruta/ejemplo.gpx', import.meta.url), 'utf8'));

test('lee un GPX con track, nombre y altitud', async () => {
  const g = await ejemplo();
  assert.equal(g.name, 'Ejemplo: Monzón – Alquézar');
  assert.ok(g.points.length > 1000);
  assert.equal(typeof g.points[0].ele, 'number');
});

test('GPX solo con ruta (rtept), sin altitud y con prefijos de espacio de nombres', () => {
  const g = R.parseGPX(`<gpx><rte><name>A &amp; B</name><rtept lon="0.2" lat="41.9"/><rtept lat='41.91' lon='0.21'></rtept></rte></gpx>`);
  assert.equal(g.name, 'A & B');
  assert.deepEqual(g.points, [{ lat: 41.9, lon: 0.2, ele: null }, { lat: 41.91, lon: 0.21, ele: null }]);
  const n = R.parseGPX('<gpx:gpx><gpx:trk><gpx:trkseg><gpx:trkpt lat="1" lon="2"><gpx:ele>5</gpx:ele></gpx:trkpt><gpx:trkpt lat="1.1" lon="2"/></gpx:trkseg></gpx:trk></gpx:gpx>');
  assert.equal(n.points[0].ele, 5);
});

/** FIT mínimo: cabecera de 14 bytes, definición del mensaje 20 (record) con lat, lon y altitud, y dos registros. */
function fakeFit(points) {
  const def = [0x40, 0, 0, 20, 0, 3, 0, 4, 0x85, 1, 4, 0x85, 2, 2, 0x84];
  const recs = points.flatMap(([la, lo, e]) => {
    const b = new DataView(new ArrayBuffer(11));
    b.setUint8(0, 0);
    b.setInt32(1, Math.round(la / (180 / 2 ** 31)), true);
    b.setInt32(5, Math.round(lo / (180 / 2 ** 31)), true);
    b.setUint16(9, (e + 500) * 5, true);
    return [...new Uint8Array(b.buffer)];
  });
  const data = [...def, ...recs];
  const h = new DataView(new ArrayBuffer(14));
  h.setUint8(0, 14); h.setUint8(1, 0x20); h.setUint16(2, 2132, true); h.setUint32(4, data.length, true);
  [...'.FIT'].forEach((c, i) => h.setUint8(8 + i, c.charCodeAt(0)));
  return new Uint8Array([...new Uint8Array(h.buffer), ...data, 0, 0]);
}

test('lee los registros con posición de un archivo FIT', () => {
  const f = R.parseFIT(fakeFit([[41.9, 0.19, 280], [41.91, 0.2, 300]]));
  assert.equal(f.points.length, 2);
  assert.ok(Math.abs(f.points[1].lat - 41.91) < 1e-6);
  assert.equal(f.points[1].ele, 300);
  assert.throws(() => R.parseFIT(new Uint8Array(20)), /No es un archivo FIT/);
});

test('distancia, desnivel y subida del ejemplo', async () => {
  const t = R.buildTrack((await ejemplo()).points);
  assert.ok(Math.abs(t.distance / 1000 - 69.6) < 0.2);
  assert.ok(t.gain > 450 && t.gain < 650, `desnivel ${t.gain}`);
  const climbs = R.findClimbs(t.points);
  assert.equal(climbs.length, 1);
  assert.ok(climbs[0].avg >= 0.03 && climbs[0].gain > 250);
  assert.equal(R.climbCategory(climbs[0]), '3');
});

test('modelo de velocidad: en llano da la media indicada, subiendo va más lento y bajando tiene tope', () => {
  const P = R.powerFor(30 / 3.6, 0);
  assert.ok(Math.abs(R.speedFor(P, 0) * 3.6 - 30) < 0.01);
  assert.ok(R.speedFor(P, 0.06) * 3.6 < 18);
  const flat = [0, 1000, 2000].map((d, i) => ({ lat: 0, lon: i * 0.008983, d, es: 0 }));
  const { total } = R.timeline(flat, { flatKmh: 30 });
  assert.ok(Math.abs(total / 60000 - 4) < 0.05, `${total / 60000} min`);
  const down = [0, 1000, 2000].map((d) => ({ d, es: -d * 0.1 }));
  assert.ok(R.timeline(down, { flatKmh: 30, vmaxKmh: 50 }).total >= (2000 / (50 / 3.6)) * 1000 - 1);
});

test('viento relativo a la marcha', () => {
  assert.equal(R.windRelative(0, 0, 20).kind, 'cara'); // voy al norte, viene del norte
  assert.equal(R.windRelative(0, 180, 20).kind, 'favor');
  assert.equal(R.windRelative(90, 0, 20).kind, 'lateral');
  assert.ok(R.windRelative(350, 10, 10).head > 9);
});

test('interpolación horaria y de la dirección del viento entre 350° y 10°', () => {
  assert.equal(R.interpHourly([0, 3600], [10, 20], 1800 * 1000), 15);
  const d = R.interpDirection([0, 3600], [350, 10], [10, 10], 1800 * 1000);
  assert.ok(d < 1 || d > 359, `${d}`);
});

test('previsión a lo largo de la ruta con la respuesta de varios puntos', () => {
  const samples = [{ lat: 0, lon: 0, d: 0, heading: 0 }, { lat: 0, lon: 0.1, d: 1000, heading: 90 }];
  const h = { time: [0, 3600], temperature_2m: [10, 12], apparent_temperature: [9, 11], precipitation_probability: [0, 50], precipitation: [0, 1],
    weather_code: [0, 61], wind_speed_10m: [10, 10], wind_direction_10m: [0, 0], wind_gusts_10m: [20, 20] };
  const w = R.weatherAlong(samples, [0, 3600000], [{ hourly: h }, { hourly: h }]);
  assert.equal(w[0].rel.kind, 'cara');
  assert.equal(w[1].rel.kind, 'lateral');
  assert.equal(w[1].rainProb, 50);
  assert.match(R.forecastUrl(samples, 0, 3600000), /latitude=0.000%2C0.000/);
});

test('tomas de avituallamiento y GPX exportado con waypoints y horas', async () => {
  const t = R.buildTrack((await ejemplo()).points);
  const tl = R.timeline(t.points, { flatKmh: 27 });
  const plan = R.feedingPlan(t.points, tl.t, { gph: 90, everyMin: 30 });
  assert.ok(plan.length >= 4);
  assert.equal(plan[0].grams, 45);
  assert.equal(plan[0].ms, 25 * 60000);
  const gpx = R.toGPX('Ruta <1>', t.points.slice(0, 3), [{ lat: 1, lon: 2, name: 'Agua & más' }], { startMs: 0, t: tl.t });
  assert.match(gpx, /<name>Ruta &lt;1&gt;<\/name>/);
  assert.match(gpx, /<wpt lat="1.000000" lon="2.000000"><name>Agua &amp; más<\/name>/);
  assert.match(gpx, /<time>1970-01-01T00:00:00.000Z<\/time>/);
  assert.equal(R.parseGPX(gpx).points.length, 3);
});
