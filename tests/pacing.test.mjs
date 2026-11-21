import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGPX, buildTrack } from '../pacing/js/track.js';
import { planRoute, planAt, distAtMs, nutritionPlan, strategyText, freshness, formAdjust, hydration, profileFromQuery, OBJECTIVES, DEFAULT_PROFILE, fmtDur } from '../pacing/js/pacing.js';

const gpx = parseGPX(readFileSync(new URL('../pacing/ejemplo.gpx', import.meta.url), 'utf8'));
const track = buildTrack(gpx.points);
const prof = { ...DEFAULT_PROFILE, ftp: 300, weight: 72, bike: 8 };

test('los tramos cubren la ruta entera sin huecos ni solapes', () => {
  const p = planRoute(track.points, prof, 'good');
  assert.equal(p.segments[0].start, 0);
  assert.ok(Math.abs(p.segments.at(-1).end - track.distance) < 1);
  for (let i = 1; i < p.segments.length; i++) assert.equal(p.segments[i].start, p.segments[i - 1].end);
  assert.ok(p.climbs.length >= 3);
});

test('la potencia normalizada de la ruta da el IF del objetivo', () => {
  for (const o of Object.keys(OBJECTIVES)) {
    const p = planRoute(track.points, prof, o);
    assert.ok(Math.abs(p.IF - OBJECTIVES[o].ifTarget) < 0.01, `${o}: IF ${p.IF}`);
  }
});

test('más intensidad = más vatios y menos tiempo', () => {
  const a = planRoute(track.points, prof, 'finish'), b = planRoute(track.points, prof, 'good'), c = planRoute(track.points, prof, 'max');
  assert.ok(a.totalMs > b.totalMs && b.totalMs > c.totalMs);
  assert.ok(a.avgPower < b.avgPower && b.avgPower < c.avgPower);
});

test('más FTP = más rápido; más peso = más lento', () => {
  const base = planRoute(track.points, prof, 'good').totalMs;
  assert.ok(planRoute(track.points, { ...prof, ftp: 340 }, 'good').totalMs < base);
  assert.ok(planRoute(track.points, { ...prof, weight: 90 }, 'good').totalMs > base);
});

test('en los descensos se pide menos que en el llano y se rueda sin pasar de la velocidad máxima', () => {
  const p = planRoute(track.points, prof, 'good');
  const flat = p.segments.find((s) => s.kind === 'flat'), desc = p.segments.find((s) => s.kind === 'descent');
  assert.ok(desc.pHi < flat.pLo);
  assert.ok(desc.speedKmh <= 55.01);
});

test('los tiempos son crecientes y distAtMs es la inversa de planAt', () => {
  const p = planRoute(track.points, prof, 'good');
  for (let i = 1; i < p.sim.t.length; i++) assert.ok(p.sim.t[i] > p.sim.t[i - 1]);
  const d = 80000, at = planAt(p, d);
  assert.ok(Math.abs(distAtMs(p, at.ms) - Math.floor(d / p.step) * p.step) < p.step);
  assert.equal(distAtMs(p, -5), 0);
  assert.equal(distAtMs(p, p.totalMs + 1), p.total);
});

test('nutrición: g/h según el objetivo, sin tomas durante bajadas fuertes y «antes del segmento» ante un puerto', () => {
  for (const o of Object.keys(OBJECTIVES)) {
    const n = nutritionPlan(planRoute(track.points, prof, o), o, 17);
    assert.ok(Math.abs(n.gph - OBJECTIVES[o].carbs) < OBJECTIVES[o].carbs * 0.15, `${o}: ${n.gph} g/h`);
  }
  const p = planRoute(track.points, prof, 'good'), n = nutritionPlan(p, 'good', 17);
  for (const x of n.items) assert.ok(planAt(p, x.d).grade > -0.03, 'toma en bajada');
  for (let i = 1; i < n.items.length; i++) assert.ok(n.items[i].ms - n.items[i - 1].ms >= 12 * 60000);
  assert.ok(n.items.some((x) => x.before) || n.items.length > 5);
});

test('hidratación sube con el calor', () => {
  assert.ok(hydration(30).mlPerHour > hydration(10).mlPerHour);
  assert.ok(hydration(30).naPerHour > hydration(10).naPerHour);
});

test('frescura: sin datos 100 %, y baja cuando la fatiga supera a la forma', () => {
  assert.equal(freshness(0, 0).pct, 100);
  assert.ok(freshness(60, 90).pct < freshness(60, 60).pct);
  assert.equal(freshness(60, 200).pct, 0);
});

test('la estrategia habla de datos reales de la ruta', () => {
  const p = planRoute(track.points, prof, 'good'), n = nutritionPlan(p, 'good', 17);
  const s = strategyText(p, 'Mi marcha', n);
  assert.match(s.text, /Mi marcha/);
  assert.ok(s.chips.some((c) => /g CH\/h/.test(c.text)));
  assert.equal(fmtDur(7 * 3600000 + 7 * 60000), '7h07');
});

test('el enlace de importación solo acepta números dentro de rango', () => {
  const p = profileFromQuery('ftp=310&weight=69&ctl=59&atl=64&age=abc&bike=999', DEFAULT_PROFILE);
  assert.equal(p.ftp, 310); assert.equal(p.weight, 69); assert.equal(p.ctl, 59); assert.equal(p.atl, 64);
  assert.equal(p.age, DEFAULT_PROFILE.age); assert.equal(p.bike, DEFAULT_PROFILE.bike);
  assert.equal(profileFromQuery('ftp=9999&weight=x'), null);
  assert.equal(profileFromQuery(''), null);
});

test('forma y fatiga: sin CTL el plan no cambia; cargado baja el ritmo y en forma lo sube', () => {
  const sin = planRoute(track.points, prof, 'good');
  assert.equal(sin.adjust, null);
  const mk = (ctl, atl) => planRoute(track.points, { ...prof, ctl, atl }, 'good');
  // cargado: menos intensidad y más tiempo que fresco, con la misma forma
  const fresco = mk(90, 70), cargado = mk(90, 130);
  assert.ok(cargado.IF < fresco.IF && cargado.totalMs > fresco.totalMs);
  // más forma (con la misma frescura): más intensidad en una ruta que no es excesiva para ella
  assert.ok(mk(100, 100).IF > mk(40, 40).IF);
  // el ajuste nunca se sale de sus límites
  for (const [c, a] of [[10, 250], [250, 0], [60, 300], [5, 5]]) { const r = mk(c, a); assert.ok(r.adjust.dIF >= -0.0801 && r.adjust.dIF <= 0.0201); }
  // solo ATL (sin CTL) no ajusta nada
  assert.equal(planRoute(track.points, { ...prof, ctl: 0, atl: 120 }, 'good').adjust, null);
});

test('formAdjust: razones en español y reglas de la carga de la ruta', () => {
  assert.deepEqual(formAdjust({ ctl: 0, atl: 50 }, 200).reasons, []);
  const dura = formAdjust({ ctl: 50, atl: 50 }, 300);          // 6 veces lo que sostiene: guarda fuerzas y afloja más al final
  assert.ok(dura.dIF < 0 && dura.fadeMul > 1 && dura.reasons.some((r) => r.type === 'load'));
  const facil = formAdjust({ ctl: 120, atl: 90 }, 120);         // ruta corta para su forma y fresco: algo más fuerte y menos fade
  assert.ok(facil.dIF > 0 && facil.fadeMul < 1);
});

test('la estrategia se adapta: forma, calor y el tipo de ruta', () => {
  const ajustado = planRoute(track.points, { ...prof, ctl: 60, atl: 95 }, 'good');
  const s = strategyText(ajustado, 'Mi marcha', nutritionPlan(ajustado, 'good', 29), { temp: 29 });
  assert.match(s.text, /cargado/); assert.match(s.text, /29 °C/);
  assert.ok(s.chips.some((c) => /Ajuste por tu forma/.test(c.text)) && s.chips.some((c) => /ml\/h/.test(c.text)));
  const normal = planRoute(track.points, prof, 'good');
  const t = strategyText(normal, 'Mi marcha', nutritionPlan(normal, 'good', 17), { temp: 17 });
  assert.doesNotMatch(t.text, /cargado|°C/); assert.ok(!t.chips.some((c) => /Ajuste por tu forma/.test(c.text)));
});
