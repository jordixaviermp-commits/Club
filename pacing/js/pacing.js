// Motor de pacing: reglas puras (sin DOM ni red) para poder probarlas con `node --test`.
// Track + ciclista + objetivo → tramos con vatios, tiempos, nutrición y texto de estrategia.
import { findClimbs, gradeAt, pointAt, powerFor, speedFor, TERRAIN } from './track.js';

/** ifTarget = factor de intensidad (potencia normalizada / FTP) que se busca en toda la ruta. */
export const OBJECTIVES = {
  finish: { label: 'Terminarla', ifTarget: 0.66, carbs: 60, interval: 25, fade: 0.06 },
  good: { label: 'Buen tiempo', ifTarget: 0.76, carbs: 75, interval: 22, fade: 0.10 },
  max: { label: 'A tope', ifTarget: 0.85, carbs: 90, interval: 20, fade: 0.10 },
};

export const KIND_LABEL = { climb: 'Puerto', rolling: 'Rompepiernas', flat: 'Llano', descent: 'Descenso' };
export const DEFAULT_PROFILE = { level: 'advanced', age: 40, weight: 72, bike: 8, ftp: 250, cda: 0.36, ctl: 0, atl: 0 };

const PROFILE_LIMITS = { ftp: [80, 500], weight: [35, 140], bike: [5, 25], age: [14, 90], ctl: [0, 250], atl: [0, 300] };
/** Perfil a partir de una cadena tipo `ftp=310&weight=69&ctl=59&atl=64`. Ignora lo que no sea un número dentro de rango. */
export function profileFromQuery(query, base = DEFAULT_PROFILE) {
  const q = new URLSearchParams(query), out = { ...base };
  let n = 0;
  for (const [k, [a, b]] of Object.entries(PROFILE_LIMITS)) {
    const raw = q.get(k), v = raw === null || raw.trim() === '' ? NaN : Number(raw);
    if (Number.isFinite(v) && v >= a && v <= b) { out[k] = v; n++; }
  }
  return n ? out : null;
}

const STEP = 100; // m entre muestras de la simulación
const r5 = (x) => Math.round(x / 5) * 5;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---------- Tramos ----------

function blockStats(points, a, b) {
  const e0 = pointAt(points, a).es, e1 = pointAt(points, b).es;
  let up = 0, down = 0, prev = e0;
  for (let d = a + 100; d < b + 99; d += 100) {
    const e = pointAt(points, Math.min(d, b)).es;
    if (e > prev) up += e - prev; else down += prev - e;
    prev = e;
  }
  return { len: b - a, net: e1 - e0, up, down };
}

/**
 * Divide el track en tramos: puertos (de findClimbs), descensos sostenidos y, entre medias,
 * rompepiernas (terreno ondulado) o llano. Los tramos de menos de 2 km se absorben en un vecino.
 */
export function segmentTrack(points, climbs = findClimbs(points)) {
  const total = points[points.length - 1].d;
  const big = climbs.filter((c) => c.gain >= 80 && c.length >= 1500);
  const runs = []; // { a, b, type: climb|descent|other }
  const gap = (a, b) => {
    if (b - a < 1) return;
    const blocks = [];
    for (let d = a; d < b; d += 500) {
      const e = Math.min(b, d + 500);
      blocks.push({ a: d, b: e, type: (pointAt(points, e).es - pointAt(points, d).es) / (e - d) < -0.025 ? 'descent' : 'other' });
    }
    const merged = [];
    for (const bl of blocks) {
      const last = merged[merged.length - 1];
      if (last && last.type === bl.type) last.b = bl.b; else merged.push({ ...bl });
    }
    // un tramo corto se funde con el vecino más largo
    while (merged.length > 1) {
      let k = -1, min = 2000;
      merged.forEach((r, i) => { if (r.b - r.a < min) { min = r.b - r.a; k = i; } });
      if (k < 0) break;
      const left = merged[k - 1], right = merged[k + 1];
      const into = !left ? right : !right ? left : (left.b - left.a >= right.b - right.a ? left : right);
      into.a = Math.min(into.a, merged[k].a); into.b = Math.max(into.b, merged[k].b);
      merged.splice(k, 1);
      for (let i = merged.length - 1; i > 0; i--) { // vecinos del mismo tipo que quedan juntos
        if (merged[i].type === merged[i - 1].type) { merged[i - 1].b = merged[i].b; merged.splice(i, 1); }
      }
    }
    runs.push(...merged);
  };
  let pos = 0;
  for (const c of big) {
    if (c.start > pos) gap(pos, c.start);
    runs.push({ a: c.start, b: c.end, type: 'climb' });
    pos = c.end;
  }
  gap(pos, total);
  // huecos diminutos entre tramos: los absorbe el tramo anterior
  runs.sort((x, y) => x.a - y.a);
  for (let i = 1; i < runs.length; i++) runs[i].a = runs[i - 1].b;
  runs[0].a = 0; runs[runs.length - 1].b = total;

  let nClimb = 0;
  return runs.map((r, i) => {
    const s = blockStats(points, r.a, r.b);
    const avg = s.net / s.len;
    let kind = r.type;
    if (kind === 'other') kind = (s.up + s.down) / s.len > 0.028 || Math.abs(avg) > 0.025 ? 'rolling' : 'flat';
    let max = 0;
    for (let d = r.a; d <= r.b - 100; d += 100) max = Math.max(max, gradeAt(points, d + 50, 50));
    const seg = { id: i + 1, kind, start: r.a, end: r.b, length: s.len, gain: s.up, loss: s.down, avg, max: Math.max(max, avg) };
    seg.name = kind === 'climb' ? (s.up >= 300 ? 'Puerto' : 'Subida') : KIND_LABEL[kind];
    if (kind === 'climb') { seg.climbNo = ++nClimb; seg.top = pointAt(points, r.b).es; }
    return seg;
  });
}

// ---------- Potencia y tiempos ----------

function climbFactor(seg) {
  const minutes = seg.length / 3.5 / 60; // duración aproximada de la subida
  return minutes < 8 ? 1.12 : minutes < 20 ? 1.05 : minutes < 45 ? 1.0 : 0.96;
}
const KIND_FACTOR = { flat: 0.96, rolling: 1.06, descent: 0.32 };

function simulate(points, segs, p, ftp, k, obj, opts, vmax) {
  const total = points[points.length - 1].d;
  const n = Math.ceil(total / STEP);
  const out = { t: new Float64Array(n + 1), p: new Float32Array(n), pt: new Float32Array(n), v: new Float32Array(n), g: new Float32Array(n), seg: new Uint16Array(n) };
  let si = 0, sumP4 = 0, sumJ = 0, tms = 0;
  for (let i = 0; i < n; i++) {
    const a = i * STEP, b = Math.min(total, a + STEP), mid = (a + b) / 2;
    while (si < segs.length - 1 && mid >= segs[si].end) si++;
    const seg = segs[si];
    const x = mid / total;
    const prog = 1 - obj.fade + (obj.fade * 1.6) * Math.min(1, x / 0.8); // conservador al principio, más suelto al final
    const factor = seg.kind === 'climb' ? climbFactor(seg) : KIND_FACTOR[seg.kind];
    const pw = clamp(ftp * obj.ifTarget * k * factor * prog, 0, ftp * 1.25);
    const g = gradeAt(points, mid, 100);
    const v = clamp(speedFor(pw * 0.97, g, opts), 1.4, vmax);
    // si se topa con la velocidad máxima bajando, en realidad no hace falta tanta potencia
    const real = Math.max(0, Math.min(pw, powerFor(v, g, opts) / 0.97));
    const dt = (b - a) / v;
    out.p[i] = real; out.pt[i] = pw; out.v[i] = v; out.g[i] = g; out.seg[i] = si;
    tms += dt * 1000; out.t[i + 1] = tms;
    sumP4 += real ** 4 * dt; sumJ += real * dt;
  }
  const secs = tms / 1000;
  out.np = (sumP4 / secs) ** 0.25;
  out.avg = sumJ / secs;
  out.kj = sumJ / 1000;
  out.total = tms;
  return out;
}

/**
 * Plan completo. `profile`: { ftp, weight, bike, cda }, `objective`: finish | good | max.
 * Ajusta un factor único para que la potencia normalizada de toda la ruta dé el IF del objetivo.
 */
export function planRoute(points, profile, objective = 'good', { terrain = 'road', climbs } = {}) {
  const obj = OBJECTIVES[objective] || OBJECTIVES.good;
  const T = TERRAIN[terrain] || TERRAIN.road;
  const ftp = profile.ftp;
  const opts = { mass: profile.weight + profile.bike, crr: T.crr, cda: profile.cda ?? T.cda };
  const vmax = T.vmax / 3.6;
  const segs = segmentTrack(points, climbs);
  let lo = 0.4, hi = 1.6, sim = null;
  for (let it = 0; it < 22; it++) {
    const m = (lo + hi) / 2;
    sim = simulate(points, segs, null, ftp, m, obj, opts, vmax);
    if (sim.np < ftp * obj.ifTarget) lo = m; else hi = m;
  }
  const k = (lo + hi) / 2;
  sim = simulate(points, segs, null, ftp, k, obj, opts, vmax);
  const total = points[points.length - 1].d;

  const out = segs.map((s) => ({ ...s, durMs: 0, joules: 0, targets: [] }));
  for (let i = 0; i < sim.p.length; i++) {
    const s = out[sim.seg[i]];
    const dt = (Math.min(total, (i + 1) * STEP) - i * STEP) / sim.v[i];
    s.durMs += dt * 1000; s.joules += sim.p[i] * dt; s.targets.push(sim.pt[i]);
  }
  for (const s of out) {
    s.startMs = sim.t[Math.round(s.start / STEP)];
    s.speedKmh = (s.length / (s.durMs / 1000)) * 3.6;
    s.pMean = s.joules / (s.durMs / 1000);
    // vatios que se piden en el tramo (la mediana de lo pedido; en bajadas rápidas se rueda suave, no se empuja)
    const sorted = [...s.targets].sort((x, y) => x - y);
    const mid = sorted[sorted.length >> 1] ?? s.pMean;
    const w = mid < 150 ? 5 : 10;
    s.pLo = Math.max(0, r5(mid - w / 2)); s.pHi = s.pLo + w;
    s.ifLo = s.pLo / ftp; s.ifHi = s.pHi / ftp;
    delete s.targets;
  }
  const hours = sim.total / 3600000;
  return {
    objective, label: obj.label, ftp, segments: out, sim, k, step: STEP, total, totalMs: sim.total,
    np: sim.np, avgPower: sim.avg, kj: sim.kj, IF: sim.np / ftp, tss: hours * (sim.np / ftp) ** 2 * 100,
    opts, climbs: out.filter((s) => s.kind === 'climb'),
  };
}

/** Valores en el punto de distancia d (m): vatios, pendiente, velocidad, hora. */
export function planAt(plan, d) {
  const i = clamp(Math.floor(d / plan.step), 0, plan.sim.p.length - 1);
  return { i, power: plan.sim.p[i], grade: plan.sim.g[i], kmh: plan.sim.v[i] * 3.6, ms: plan.sim.t[i], seg: plan.segments[plan.sim.seg[i]] };
}

/** Distancia (m) a la que se está en el instante ms desde la salida. */
export function distAtMs(plan, ms) {
  const t = plan.sim.t;
  let a = 0, b = t.length - 1;
  if (ms <= 0) return 0;
  if (ms >= t[b]) return plan.total;
  while (a < b) { const m = (a + b) >> 1; if (t[m] < ms) a = m + 1; else b = m; }
  const f = (ms - t[a - 1]) / (t[a] - t[a - 1] || 1);
  return Math.min(plan.total, (a - 1 + f) * plan.step);
}

// ---------- Nutrición ----------

/** Líquido (ml/h) y sodio (mg/h) según la temperatura (°C). */
export function hydration(tempC = 17) {
  return { mlPerHour: Math.round((450 + 25 * (tempC - 12)) / 5) * 5, naPerHour: Math.round((300 + 12 * Math.max(0, tempC - 5)) / 10) * 10 };
}

/**
 * Tomas de hidratos: una cada `interval` min, desplazadas hasta ±8 min para no coincidir con bajadas ni rampas fuertes.
 * Se avisa «antes del segmento N» cuando justo después empieza un puerto.
 */
export function nutritionPlan(plan, objective = 'good', tempC = 17) {
  const obj = OBJECTIVES[objective] || OBJECTIVES.good;
  const h = hydration(tempC);
  const total = plan.totalMs;
  const gph = obj.carbs;
  const grams = Math.max(5, r5((gph * obj.interval) / 60));
  const ml = Math.round((h.mlPerHour * obj.interval) / 60);
  const cost = (ms) => { const g = planAt(plan, distAtMs(plan, ms)).grade; return (g < -0.03 ? 100 : 0) + (g > 0.07 ? 50 : 0) + Math.abs(g) * 100; };
  const items = [];
  const first = 20 * 60000, every = obj.interval * 60000;
  let n = 0;
  for (let base = first; base <= total - 15 * 60000; base += every) {
    const prev = items.length ? items[items.length - 1].ms : -Infinity;
    let best = base, bestC = Infinity;
    for (let dm = -8; dm <= 8; dm++) {
      const ms = base + dm * 60000;
      if (ms < 10 * 60000 || ms > total - 5 * 60000 || ms - prev < 12 * 60000) continue;
      const c = cost(ms) + Math.abs(dm) * 0.6;
      if (c < bestC) { bestC = c; best = ms; }
    }
    const d = distAtMs(plan, best);
    const at = planAt(plan, d);
    const seg = at.seg;
    const next = plan.segments[seg.id]; // segmento siguiente (id es base 1)
    const before = next && next.kind === 'climb' && seg.kind !== 'climb' && next.startMs - best <= 10 * 60000;
    n++;
    const solid = n % 3 === 0 && best > 60 * 60000 && best < total - 40 * 60000 && Math.abs(at.grade) < 0.03;
    let type, note;
    if (solid) { type = 'solid'; note = `Come sólido con calma, ${grams} g`; }
    else if (seg.kind === 'climb' || before) { type = 'gel'; note = `${grams} g y un par de tragos`; }
    else { type = 'drink'; note = `Bebe y toma ${grams} g sin romper el ritmo`; }
    const target = before ? next : seg;
    items.push({ ms: best, d, type, grams, ml, segId: target.id, before: !!before,
      where: before ? `Antes del segmento ${next.id}` : `En el segmento ${seg.id}`, note });
  }
  const hours = total / 3600000;
  return { items, gph: Math.round((items.reduce((a, x) => a + x.grams, 0) / hours) * 10) / 10,
    totalCarbs: items.reduce((a, x) => a + x.grams, 0), totalMl: items.reduce((a, x) => a + x.ml, 0),
    naPerHour: h.naPerHour, mlPerHour: h.mlPerHour, count: items.length };
}

export const TYPE_LABEL = { gel: 'Gel', drink: 'Bebida', solid: 'Comida sólida' };

// ---------- Forma y texto ----------

/** Frescura estimada (TSB = CTL − ATL, convertido a %). Es una estimación, no una medida de ningún servicio. */
export function freshness(ctl = 0, atl = 0) {
  if (!ctl && !atl) return { pct: 100, label: 'Fresca', tsb: 0 };
  const tsb = ctl - atl;
  const pct = Math.round(clamp(100 + tsb * 4, 0, 100));
  return { pct, tsb: Math.round(tsb), label: pct >= 85 ? 'Fresca' : pct >= 60 ? 'Normal' : pct >= 35 ? 'Cargada' : 'Fatigada' };
}

export function fmtDur(ms, long = false) {
  const m = Math.round(ms / 60000), h = Math.floor(m / 60), mm = m % 60;
  if (long) return h ? `${h} h ${String(mm).padStart(2, '0')}` : `${mm} min`;
  return h ? `${h}h${String(mm).padStart(2, '0')}` : `${mm}min`;
}
export const fmtKm = (m, dec = 1) => `${(m / 1000).toFixed(dec).replace('.', ',')} km`;
export const fmtPct = (g, dec = 1) => `${(g * 100).toFixed(dec).replace('.', ',')}%`;

/** Texto del plan (en español) a partir de los datos: nada se inventa. */
export function strategyText(plan, name = 'la ruta', nutri = null) {
  const segs = plan.segments, climbs = plan.climbs;
  const km = (m) => Math.round(m / 1000);
  const third = plan.total / 3;
  const first = segs.filter((s) => s.start < third && s.kind !== 'descent');
  const firstMax = Math.max(0, ...first.map((s) => s.pHi));
  const tough = [...climbs].sort((a, b) => b.gain * b.avg - a.gain * a.avg)[0];
  const lastClimb = climbs[climbs.length - 1];
  const parts = [];
  const head = { finish: `${name} se gana con paciencia: el objetivo es llegar entero, sin picos ni deudas.`,
    good: `${name} se gana con paciencia: controla el primer tercio y guarda piernas para la segunda mitad.`,
    max: `${name} a tope pide valentía y orden: ataca los puertos y recupera en cada bajada.` }[plan.objective];
  parts.push(head);
  if (firstMax) parts.push(`Hasta el km ${km(third)} no pases de ${firstMax} W; ahí se decide la carrera.`);
  if (tough) parts.push(`La subida clave empieza en el km ${km(tough.start)} (${km(tough.length)} km, +${Math.round(tough.gain)} m al ${fmtPct(tough.avg)}): mantén ${tough.pLo}–${tough.pHi} W, sin salirte.`);
  if (lastClimb && lastClimb !== tough) parts.push(`Si llegas con fuerzas al último puerto (km ${km(lastClimb.start)}), puedes subir a ${lastClimb.pHi + 5} W.`);
  const chips = [];
  if (climbs.length) chips.push({ type: 'power', text: `Respeta ${Math.max(...climbs.map((c) => c.pHi))} W en puertos` });
  chips.push({ type: 'tip', text: 'No persigas cada repecho' });
  if (nutri) chips.push({ type: 'fuel', text: `Toma ${Math.round(nutri.gph)} g CH/h` });
  return { text: parts.join(' '), chips };
}

/** Plan en texto plano (para compartir o descargar). */
export function planAsText(plan, nutri, name = 'Ruta') {
  const L = [`${name} · ${plan.label}`, `${fmtKm(plan.total)} · estimado ${fmtDur(plan.totalMs, true)} · NP ${Math.round(plan.np)} W · IF ${plan.IF.toFixed(2)} · TSS ${Math.round(plan.tss)}`, ''];
  for (const s of plan.segments) L.push(`${s.id}. ${s.name} · km ${(s.start / 1000).toFixed(1)}–${(s.end / 1000).toFixed(1)} · ${s.pLo}–${s.pHi} W · ${fmtDur(s.durMs)} · ${s.speedKmh.toFixed(1)} km/h`);
  if (nutri) { L.push('', `Nutrición: ${nutri.gph} g/h, ${nutri.count} tomas`); for (const x of nutri.items) L.push(`${fmtDur(x.ms)} · ${x.where} · ${TYPE_LABEL[x.type]} · ${x.grams} g · ${x.ml} ml`); }
  return L.join('\n');
}
