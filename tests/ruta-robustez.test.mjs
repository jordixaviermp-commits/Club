// Detector de subidas con altitudes reales «malas»: GPS con ruido, picos, puntos muy separados,
// túneles o puentes (escalones de ida y vuelta) y altitud redondeada. Perfiles con las subidas conocidas.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../ruta/logic.js';

let seed = 1;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
/** Track sintético: K = [[km, m], …] por tramos rectos, con el tipo de altitud mala indicado. */
function track(K, { stepM = 20, noise = 0, spikes = 0, tunnel = null, quant = 0 } = {}) {
  seed = 7;
  const km = K[K.length - 1][0];
  const f = (k) => { let i = 1; while (i < K.length - 1 && K[i][0] < k) i++; const [a, b] = [K[i - 1], K[i]]; return a[1] + (b[1] - a[1]) * ((k - a[0]) / (b[0] - a[0])); };
  const pts = [];
  for (let m = 0; m <= km * 1000; m += stepM) {
    let e = f(m / 1000) + noise * gauss();
    if (spikes && rnd() < spikes) e += (rnd() < 0.5 ? -1 : 1) * (20 + 40 * rnd());
    if (tunnel && m / 1000 > tunnel[0] && m / 1000 < tunnel[1]) e -= tunnel[2];
    if (quant) e = Math.round(e / quant) * quant;
    pts.push({ lat: 41.9, lon: 0.19 + m / 82900, ele: e });
  }
  return R.buildTrack(pts);
}
// puerto 8 km al 6 %, repecho 1,5 km al 5 %, puerto tendido 20 km al 2 %: 955 m de desnivel
const BASE = [[0, 200], [10, 200], [18, 680], [24, 400], [30, 400], [31.5, 475], [33, 440], [40, 440], [60, 840], [75, 300]];
const TRUTH = [[10, 18, 480], [30, 31.5, 75], [40, 60, 400]];
const VARIANTES = {
  'altitud limpia': {}, 'GPS con 3 m de ruido': { noise: 3 }, 'GPS con 8 m de ruido y puntos cada 5 m': { noise: 8, stepM: 5 },
  'GPS con 8 m de ruido': { noise: 8 }, 'picos sueltos': { noise: 2, spikes: 0.01 }, 'ruta de planificador (cada 300 m)': { stepM: 300 },
  'túnel de 400 m (−60 m)': { tunnel: [14, 14.4, 60] }, 'altitud redondeada a 5 m': { quant: 5 },
};
for (const [name, v] of Object.entries(VARIANTES)) {
  test(`subidas con ${name}: las tres reales, sin falsas, y desnivel ±10 %`, () => {
    const t = track(BASE, v);
    const c = R.climbFilter(R.findClimbs(t.points), 'medianas');
    const hits = TRUTH.map(([a, b, g]) => c.find((x) => Math.abs(x.start / 1000 - a) < 1.5 && Math.abs(x.end / 1000 - b) < 1.5 && Math.abs(x.gain - g) / g < 0.2));
    const show = c.map((x) => `${(x.start / 1000).toFixed(1)}-${(x.end / 1000).toFixed(1)} +${Math.round(x.gain)}`).join(', ');
    assert.ok(hits.every(Boolean), `faltan subidas; detectadas: ${show}`);
    assert.equal(c.length, 3, `sobran subidas: ${show}`);
    assert.ok(Math.abs(t.gain - 955) / 955 < 0.1, `desnivel ${Math.round(t.gain)} m (real 955)`);
  });
}

test('rompepiernas: cada repecho de 30-50 m sale por separado', () => {
  const K = [[0, 300]]; let k = 0;
  for (const g of [35, 50, 30, 45, 40]) { K.push([k + 2, 300], [k + 2.8, 300 + g], [k + 3.6, 300]); k += 3.6; }
  K.push([k + 2, 300]);
  const t = track(K, { noise: 2 });
  assert.equal(R.findClimbs(t.points).length, 5);
});

test('un muro corto (300 m al 12 %) sale en «Todas»', () => {
  const t = track([[0, 400], [5, 400], [5.3, 436], [10, 436]], { noise: 1 });
  const c = R.findClimbs(t.points);
  assert.equal(c.length, 1);
  assert.ok(c[0].max > 0.09, `máx. ${c[0].max}`);
});

test('el resultado no depende de en qué sentido se recorra (una subida es una bajada al revés)', () => {
  const t = track([[0, 200], [5, 200], [12, 620], [20, 620]], { noise: 3 });
  const back = R.buildTrack([...t.points].reverse().map((p) => ({ lat: p.lat, lon: p.lon, ele: p.ele })));
  assert.equal(R.findClimbs(t.points).length, 1);
  assert.equal(R.findClimbs(back.points).length, 0);
});
