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
  assert.equal(R.climbCategory(climbs[0]), '2'); // 10,4 km al 3,1 %
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

/** Perfil sintético: puntos cada 50 m con altitud dada por f(d en km). */
const perfil = (km, f) => R.buildTrack(Array.from({ length: Math.round(km * 20) + 1 }, (_, i) => ({ lat: 41.9, lon: 0.19 + (i * 50) / 82900, ele: f((i * 50) / 1000) })));

test('subidas: una larga y tendida con rellanos y bajaditas cuenta como una sola', () => {
  // 0-20 km llano a 100 m; 20-50 km sube a ~720 m (≈2,1 %) con rellanos y dos bajadas de ~20 m; luego baja
  const f = (k) => {
    if (k < 20) return 100 + 3 * Math.sin(k * 3);
    if (k < 50) { const x = (k - 20) / 30; return 100 + 620 * x + 8 * Math.sin(k * 4) - (Math.abs(k - 31) < 0.6 ? 20 : 0) - (Math.abs(k - 42) < 0.6 ? 20 : 0); }
    return Math.max(100, 720 - (k - 50) * 40);
  };
  const t = perfil(70, f);
  const c = R.findClimbs(t.points);
  assert.equal(c.length, 1, JSON.stringify(c.map((x) => [x.start, x.gain])));
  assert.ok(c[0].gain > 500, `sube ${c[0].gain}`);
  assert.ok(c[0].start / 1000 > 18 && c[0].start / 1000 < 24, `empieza en ${c[0].start}`);
});

test('subidas: los repechos cortos siguen saliendo y un falso llano no es subida', () => {
  const corto = perfil(10, (k) => (k < 4 ? 200 : k < 5.2 ? 200 + (k - 4) * 60 : 272 - Math.min(72, (k - 5.2) * 50)));
  assert.equal(R.findClimbs(corto.points).length, 1);
  const falso = perfil(20, (k) => 200 + k * 10); // 1 % durante 20 km
  assert.equal(R.findClimbs(falso.points).length, 0);
});

test('avituallamiento inteligente: reparte el total y no pone tomas en las bajadas', () => {
  // 0-20 km llano, 20-35 km bajada al 5 %, 35-70 km llano
  const tr = perfil(70, (k) => (k < 20 ? 800 : k < 35 ? 800 - (k - 20) * 50 : 50));
  const tl = R.timeline(tr.points, { flatKmh: 27 });
  const plan = R.feedingPlan(tr.points, tl.t, { gph: 90, everyMin: 30, smart: true });
  const total = Math.round((90 * tl.total) / 3600000 / 10) * 10;
  assert.ok(Math.abs(plan.reduce((a, f) => a + f.grams, 0) - total) <= plan.length * 5, 'suma ≈ total');
  for (const f of plan) assert.ok(!(f.d > 20200 && f.d < 34800), `toma en la bajada, km ${f.d / 1000}`);
  assert.ok(plan.every((f, i) => i === 0 || f.ms - plan[i - 1].ms >= 15 * 60000));
  assert.ok(plan[plan.length - 1].ms <= tl.total - 5 * 60000);
});

test('subidas: perfil real de 117 km (puerto tendido al ~1,9 % y cuatro repechos)', () => {
  // altitudes leídas del perfil de una ruta de un usuario (km, m)
  const K = [[0, 100], [5, 105], [10, 110], [15, 120], [16.7, 122], [17.7, 178], [19, 140], [20, 150], [25, 230], [28, 290], [30, 300], [35, 345],
    [40, 400], [43, 450], [45, 520], [47, 600], [49, 700], [50, 720], [55, 722], [58, 700], [62, 640], [66.9, 580], [68.1, 646], [72, 560],
    [80, 480], [81.7, 470], [83.4, 544], [85, 500], [87, 497], [88.8, 551], [93, 400], [100, 150], [110, 110], [117, 150]];
  const f = (k) => { let i = 1; while (i < K.length - 1 && K[i][0] < k) i++; const [a, b] = [K[i - 1], K[i]]; return a[1] + (b[1] - a[1]) * ((k - a[0]) / (b[0] - a[0])) + 4 * Math.sin(k * 2.3); };
  const c = R.findClimbs(perfil(117, f).points).map((x) => [Math.round(x.start / 1000), Math.round(x.gain)]);
  const near = (km) => c.some(([s]) => Math.abs(s - km) <= 3);
  assert.ok(c.some(([s, g]) => s >= 18 && s <= 30 && g > 400), `falta el puerto largo: ${JSON.stringify(c)}`);
  for (const km of [17, 67, 82, 87]) assert.ok(near(km), `falta la subida del km ${km}: ${JSON.stringify(c)}`);
});

test('ritmo por potencia y peso, terreno y paradas por hora', () => {
  const llano = perfil(30, () => 100);
  const a = R.timeline(llano.points, { mode: 'power', pFlat: 200, rider: 72, bike: 8 });
  const kmh = 30 / (a.moving / 3600000);
  assert.ok(kmh > 29 && kmh < 35, `200 W en llano: ${kmh} km/h`);
  const mtb = R.timeline(llano.points, { mode: 'power', pFlat: 200, rider: 72, bike: 8, terrain: 'mtb' });
  assert.ok(mtb.moving > a.moving * 1.1);
  const paradas = R.timeline(llano.points, { mode: 'power', pFlat: 200, stopsPerHour: 10 });
  assert.ok(Math.abs(paradas.total / paradas.moving - 1.2) < 1e-9); // 10 min de cada hora parado: 60/50
  const subida = perfil(10, (k) => 100 + k * 70); // 7 %
  const c1 = R.timeline(subida.points, { mode: 'power', pFlat: 200, pClimb: 200 }).moving, c2 = R.timeline(subida.points, { mode: 'power', pFlat: 200, pClimb: 260 }).moving;
  assert.ok(c2 < c1 * 0.85, 'más vatios en subida, menos tiempo');
});

test('filtros de subidas: todas, medianas y grandes, solo grandes', () => {
  const c = [{ length: 600, avg: 0.04, gain: 24 }, { length: 1200, avg: 0.04, gain: 48 }, { length: 2400, avg: 0.043, gain: 103 }, { length: 5100, avg: 0.078, gain: 398 }];
  assert.deepEqual(['todas', 'medianas', 'grandes'].map((k) => R.climbFilter(c, k).length), [4, 3, 2]);
  assert.equal(R.climbCategory(c[3]), '2');
  assert.equal(R.climbCategory({ length: 3100, avg: 0.074 }), '3');
});

test('altitud del terreno: muestras, peticiones de 100 en 100 e interpolación', () => {
  const t = perfil(30, () => 0);
  const s = R.demSamples(t.points, { step: 100 });
  assert.equal(s.length, 301);
  const urls = R.demUrls(s);
  assert.equal(urls.length, 4);
  assert.match(urls[0], /^https:\/\/api\.open-meteo\.com\/v1\/elevation\?latitude=/);
  const ele = R.applyDem(t.points, s, s.map((p) => p.d / 100)); // 1 m cada 100 m
  assert.ok(Math.abs(ele[ele.length - 1] - t.distance / 100) < 1e-6);
  assert.ok(Math.abs(ele[100] - t.points[100].d / 100) < 1e-6);
});

test('fuentes: consulta de Overpass y solo las que quedan a menos de 500 m', () => {
  const t = perfil(10, () => 300);
  const q = R.fountainsQuery(t.points);
  assert.match(q, /around:500,41\.90000,0\.19000/);
  assert.match(q, /"amenity"="drinking_water"/);
  const lon = (km) => 0.19 + (km * 1000) / 82900;
  const json = { elements: [
    { type: 'node', id: 1, lat: 41.9 + 0.002, lon: lon(5), tags: { amenity: 'drinking_water', name: 'Font del Poble' } }, // ~220 m
    { type: 'node', id: 2, lat: 41.9 + 0.01, lon: lon(2), tags: { amenity: 'drinking_water' } }, // ~1,1 km: fuera
    { type: 'node', id: 3, lat: 41.9, lon: lon(8), tags: { natural: 'spring', drinking_water: 'yes', seasonal: 'yes' } },
    { type: 'node', id: 1, lat: 41.9 + 0.002, lon: lon(5), tags: { amenity: 'drinking_water' } }, // repetida
  ] };
  const f = R.parseFountains(json, t.points);
  assert.deepEqual(f.map((x) => x.id), [1, 3]);
  assert.equal(f[0].name, 'Font del Poble');
  assert.ok(Math.abs(f[0].d / 1000 - 5) < 0.05 && f[0].off > 150 && f[0].off < 300);
  assert.equal(f[1].kind, 'Manantial');
  assert.equal(f[1].unsure, true);
});
