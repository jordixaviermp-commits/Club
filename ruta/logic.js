// Planificador de ruta: reglas puras (sin DOM ni red) para poder probarlas con `node --test`.
// Track → distancias y desnivel → hora de paso por cada punto → subidas → viento relativo a la marcha.

const R_EARTH = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Distancia en metros entre dos puntos (haversine). */
export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Rumbo en grados (0 = norte, 90 = este) para ir de 1 a 2. */
export function bearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

const decodeXml = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();

/** Lee un GPX (track o, si no hay, ruta). Devuelve { name, points: [{lat, lon, ele|null}] }. */
export function parseGPX(text) {
  const read = (tag) => {
    const out = [];
    const re = new RegExp(`<(?:\\w+:)?${tag}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>)`, 'g');
    let m;
    while ((m = re.exec(text))) {
      const lat = parseFloat(/\blat\s*=\s*["']([^"']+)/.exec(m[1])?.[1]);
      const lon = parseFloat(/\blon\s*=\s*["']([^"']+)/.exec(m[1])?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const e = m[2] ? parseFloat(/<(?:\w+:)?ele>\s*([^<]+)</.exec(m[2])?.[1]) : NaN;
      out.push({ lat, lon, ele: Number.isFinite(e) ? e : null });
    }
    return out;
  };
  let points = read('trkpt');
  if (points.length < 2) points = read('rtept');
  const name = /<(?:\w+:)?name>([\s\S]*?)<\/(?:\w+:)?name>/.exec(text)?.[1];
  return { name: name ? decodeXml(name) : '', points };
}

/**
 * Lee un archivo FIT (actividad o curso de Garmin/Wahoo…): solo los mensajes «record» con posición.
 * `buf` es un ArrayBuffer o Uint8Array.
 */
export function parseFIT(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.length < 14) throw new Error('Archivo FIT demasiado corto');
  const headerSize = u8[0];
  if (String.fromCharCode(u8[8], u8[9], u8[10], u8[11]) !== '.FIT') throw new Error('No es un archivo FIT');
  const end = Math.min(u8.length, headerSize + dv.getUint32(4, true));
  const defs = {};
  const points = [];
  let name = '';
  let p = headerSize;
  const SEMI = 180 / 2 ** 31;
  while (p < end) {
    const h = u8[p++];
    let local, isDef = false;
    if (h & 0x80) local = (h >> 5) & 0x03; // cabecera de marca de tiempo comprimida: siempre datos
    else { local = h & 0x0f; isDef = !!(h & 0x40); }
    if (isDef) {
      const hasDev = !!(h & 0x20);
      const little = u8[p + 1] === 0;
      const global = dv.getUint16(p + 2, little);
      const n = u8[p + 4];
      p += 5;
      const fields = [];
      for (let i = 0; i < n; i++, p += 3) fields.push({ num: u8[p], size: u8[p + 1], type: u8[p + 2] & 0x1f });
      let devSize = 0;
      if (hasDev) { const nd = u8[p++]; for (let i = 0; i < nd; i++, p += 3) devSize += u8[p + 1]; }
      defs[local] = { global, little, fields, devSize };
      continue;
    }
    const d = defs[local];
    if (!d) throw new Error('Archivo FIT dañado');
    if (d.global === 20) { // record
      let lat = null, lon = null, alt = null, ealt = null;
      let q = p;
      for (const f of d.fields) {
        if (f.num === 0 && f.size === 4) { const v = dv.getInt32(q, d.little); if (v !== 0x7fffffff) lat = v * SEMI; }
        else if (f.num === 1 && f.size === 4) { const v = dv.getInt32(q, d.little); if (v !== 0x7fffffff) lon = v * SEMI; }
        else if (f.num === 2 && f.size === 2) { const v = dv.getUint16(q, d.little); if (v !== 0xffff) alt = v / 5 - 500; }
        else if (f.num === 78 && f.size === 4) { const v = dv.getUint32(q, d.little); if (v !== 0xffffffff) ealt = v / 5 - 500; }
        q += f.size;
      }
      if (lat !== null && lon !== null) points.push({ lat, lon, ele: ealt ?? alt });
    } else if (d.global === 31 && !name) { // course: campo 5 = nombre
      let q = p;
      for (const f of d.fields) {
        if (f.num === 5 && f.type === 7) name = new TextDecoder().decode(u8.subarray(q, q + f.size)).replace(/\0[\s\S]*$/, '').trim();
        q += f.size;
      }
    }
    p += d.fields.reduce((s, f) => s + f.size, 0) + d.devSize;
  }
  return { name, points };
}

/**
 * Prepara el track: quita puntos repetidos, calcula distancia acumulada (m), suaviza la altitud
 * (media móvil de ±`win` m, quita el ruido del GPS) y devuelve el desnivel positivo.
 */
export function buildTrack(raw, { win = 60 } = {}) {
  const pts = [];
  for (const r of raw) {
    const last = pts[pts.length - 1];
    if (last && last.lat === r.lat && last.lon === r.lon) continue;
    pts.push({ lat: r.lat, lon: r.lon, ele: r.ele });
  }
  if (pts.length < 2) throw new Error('El track necesita al menos dos puntos con posición');
  const hasEle = pts.some((x) => x.ele !== null);
  // altitudes que faltan: la del punto anterior conocido (o la primera conocida)
  let lastE = pts.find((x) => x.ele !== null)?.ele ?? 0;
  for (const x of pts) { if (x.ele === null) x.ele = lastE; else lastE = x.ele; }
  let dist = 0;
  pts.forEach((x, i) => { if (i) dist += haversine(pts[i - 1].lat, pts[i - 1].lon, x.lat, x.lon); x.d = dist; });
  // media móvil por distancia con dos punteros
  let lo = 0, hi = 0, sum = 0;
  for (let i = 0; i < pts.length; i++) {
    while (hi < pts.length && pts[hi].d <= pts[i].d + win) sum += pts[hi++].ele;
    while (pts[lo].d < pts[i].d - win) sum -= pts[lo++].ele;
    pts[i].es = sum / (hi - lo);
  }
  let gain = 0, loss = 0;
  for (let i = 1; i < pts.length; i++) { const dh = pts[i].es - pts[i - 1].es; if (dh > 0) gain += dh; else loss -= dh; }
  const eles = pts.map((x) => x.es);
  return { points: pts, distance: dist, gain, loss, hasEle, minEle: Math.min(...eles), maxEle: Math.max(...eles) };
}

/** Índice del primer punto con distancia acumulada ≥ d (búsqueda binaria). */
export function indexAt(points, d) {
  let a = 0, b = points.length - 1;
  if (d <= 0) return 0;
  if (d >= points[b].d) return b;
  while (a < b) { const m = (a + b) >> 1; if (points[m].d < d) a = m + 1; else b = m; }
  return a;
}

/** Posición y altitud interpoladas a la distancia d. */
export function pointAt(points, d) {
  const i = indexAt(points, d);
  if (i === 0) return { ...points[0] };
  const a = points[i - 1], b = points[i];
  const t = b.d === a.d ? 0 : (d - a.d) / (b.d - a.d);
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, es: a.es + (b.es - a.es) * t, d };
}

/** Pendiente (fracción) entre d−half y d+half, con la altitud suavizada. */
export function gradeAt(points, d, half = 100) {
  const total = points[points.length - 1].d;
  const a = Math.max(0, d - half), b = Math.min(total, d + half);
  if (b - a < 1) return 0;
  return (pointAt(points, b).es - pointAt(points, a).es) / (b - a);
}

/** Rumbo medio de la marcha alrededor de d (de d−half a d+half). */
export function headingAt(points, d, half = 500) {
  const total = points[points.length - 1].d;
  const a = pointAt(points, Math.max(0, d - half)), b = pointAt(points, Math.min(total, d + half));
  return bearing(a.lat, a.lon, b.lat, b.lon);
}

// ---------- Modelo de velocidad ----------
// Potencia constante: la que da la velocidad indicada en llano. En cada tramo se busca la velocidad
// que con esa potencia vence pendiente, rodadura y aire. Bajando se limita a `vmax`.
const G = 9.81, RHO = 1.2;
export function powerFor(v, grade, { mass = 80, cda = 0.32, crr = 0.005 } = {}) {
  const th = Math.atan(grade);
  return v * mass * G * (crr * Math.cos(th) + Math.sin(th)) + 0.5 * RHO * cda * v ** 3;
}
export function speedFor(power, grade, opts = {}) {
  let a = 0, b = 40;
  for (let k = 0; k < 50; k++) { const m = (a + b) / 2; if (powerFor(m, grade, opts) < power) a = m; else b = m; }
  return (a + b) / 2;
}

/**
 * Hora de paso (ms desde el inicio) para cada punto del track.
 * `flatKmh`: velocidad media en llano; `vmaxKmh`: tope bajando; `vminKmh`: suelo en rampas muy duras.
 * Devuelve un Float64Array con los ms desde la salida y el tiempo total.
 */
export function timeline(points, { flatKmh = 27, mass = 80, vmaxKmh = 55, vminKmh = 5, stopsMin = 0 } = {}) {
  const opts = { mass };
  const P = powerFor(flatKmh / 3.6, 0, opts);
  const vmax = vmaxKmh / 3.6, vmin = vminKmh / 3.6;
  const memo = new Map();
  const v = (g) => {
    const k = Math.round(Math.max(-0.25, Math.min(0.25, g)) * 1000);
    if (!memo.has(k)) memo.set(k, Math.min(vmax, Math.max(vmin, speedFor(P, k / 1000, opts))));
    return memo.get(k);
  };
  const t = new Float64Array(points.length);
  for (let i = 1; i < points.length; i++) {
    const dd = points[i].d - points[i - 1].d;
    const g = gradeAt(points, (points[i].d + points[i - 1].d) / 2, 100);
    t[i] = t[i - 1] + (dd / v(g)) * 1000;
  }
  // las paradas se reparten a lo largo de la ruta, en proporción a la distancia
  const total = points[points.length - 1].d;
  if (stopsMin > 0 && total > 0) for (let i = 0; i < t.length; i++) t[i] += (points[i].d / total) * stopsMin * 60000;
  return { t, total: t[t.length - 1], power: P };
}

/** ms desde la salida a la distancia d (interpolando la línea de tiempos). */
export function timeAt(points, t, d) {
  const i = indexAt(points, d);
  if (i === 0) return t[0];
  const a = points[i - 1], b = points[i];
  const f = b.d === a.d ? 0 : (d - a.d) / (b.d - a.d);
  return t[i - 1] + (t[i] - t[i - 1]) * f;
}

/**
 * Subidas. 1) Se cortan tramos de subida (de un mínimo a una cima) cuando se baja más de
 * max(15 m, 25 % de lo subido). 2) Se juntan los tramos seguidos de una misma subida: si el
 * siguiente llega más alto y la bajada entre medias es pequeña (≤ max(25 m, 30 % del total)).
 * 3) Se recortan la aproximación y el final llanos (< 1,5 % en 1 km). 4) Se quedan las de
 * ≥ `minGain` m y ≥ `minLen` m con media ≥ `minAvg`, o las largas y tendidas (≥ `longGain` m
 * con media ≥ `longAvg`), que en carretera también son puerto.
 */
export function findClimbs(points, { minGain = 40, minLen = 500, minAvg = 0.03, longGain = 150, longAvg = 0.02, flat = 0.015 } = {}) {
  const es = (i) => points[i].es;
  // 1) tramos de subida
  const segs = [];
  let lo = 0, hi = 0;
  for (let i = 1; i < points.length; i++) {
    const e = es(i);
    if (e > es(hi)) hi = i;
    else if (es(hi) - e > Math.max(15, 0.25 * (es(hi) - es(lo)))) { if (hi > lo) segs.push([lo, hi]); lo = hi = i; }
    if (e < es(lo)) lo = hi = i;
  }
  if (hi > lo) segs.push([lo, hi]);
  // 2) juntar los de una misma subida
  const merged = [];
  for (const sg of segs) {
    const prev = merged[merged.length - 1];
    if (prev) {
      const drop = es(prev[1]) - es(sg[0]);
      if (es(sg[1]) > es(prev[1]) && drop <= Math.max(25, 0.3 * (es(sg[1]) - es(prev[0])))) { prev[1] = sg[1]; continue; }
    }
    merged.push([...sg]);
  }
  // 3) y 4) recortar lo llano y quedarse con las que cuentan
  const out = [];
  for (const [l, h] of merged) {
    let s = l, e = h;
    while (s < e && points[e].d - points[s].d > minLen && gradeAt(points, points[s].d + 500, 500) < flat) s++;
    while (e > s && points[e].d - points[s].d > minLen && gradeAt(points, points[e].d - 500, 500) < flat) e--;
    const a = points[s], b = points[e];
    const gain = b.es - a.es, len = b.d - a.d, avg = len > 0 ? gain / len : 0;
    if (len < minLen || gain < minGain) continue;
    if (!(avg >= minAvg || (gain >= longGain && avg >= longAvg))) continue;
    let maxG = 0;
    for (let d = a.d; d <= b.d - 100; d += 50) maxG = Math.max(maxG, gradeAt(points, d + 50, 50));
    out.push({ start: a.d, end: b.d, length: len, gain, avg, max: Math.max(maxG, avg), top: b.es, startIdx: s, endIdx: e });
  }
  return out;
}

/** Puntos donde se consulta el tiempo: uno cada `step` m (como mucho `max`) más la llegada. */
export function samplePoints(points, { max = 40, minStep = 2000 } = {}) {
  const total = points[points.length - 1].d;
  const step = Math.max(minStep, total / (max - 1));
  const ds = [];
  for (let d = 0; d < total - step * 0.3; d += step) ds.push(d);
  ds.push(total);
  return ds.map((d) => ({ ...pointAt(points, d), heading: headingAt(points, d) }));
}

/**
 * Viento respecto a la marcha. `fromDeg`: de dónde viene (convenio meteorológico).
 * head > 0 = de cara, < 0 = a favor; cross = componente lateral.
 */
export function windRelative(headingDeg, fromDeg, speed) {
  const diff = ((fromDeg - headingDeg + 540) % 360) - 180; // -180..180, 0 = viene de frente
  const head = speed * Math.cos(rad(diff));
  const cross = speed * Math.sin(rad(diff));
  const kind = Math.abs(diff) <= 45 ? 'cara' : Math.abs(diff) >= 135 ? 'favor' : 'lateral';
  return { head, cross, diff, kind, side: diff > 0 ? 'derecha' : 'izquierda' };
}

/** Valor horario interpolado en el instante `ms` (epoch). `times` en segundos unix, ordenados. */
export function interpHourly(times, values, ms) {
  const s = ms / 1000;
  if (!times.length) return null;
  if (s <= times[0]) return values[0];
  if (s >= times[times.length - 1]) return values[values.length - 1];
  let i = 1;
  while (times[i] < s) i++;
  const f = (s - times[i - 1]) / (times[i] - times[i - 1]);
  const a = values[i - 1], b = values[i];
  if (a === null || b === null) return a ?? b;
  return a + (b - a) * f;
}

/** Dirección del viento interpolada como vector (evita que entre 350° y 10° salga 180°). */
export function interpDirection(times, dirs, speeds, ms) {
  const u = dirs.map((d, i) => (speeds[i] ?? 0) * Math.sin(rad(d ?? 0)));
  const v = dirs.map((d, i) => (speeds[i] ?? 0) * Math.cos(rad(d ?? 0)));
  const uu = interpHourly(times, u, ms), vv = interpHourly(times, v, ms);
  if (Math.hypot(uu, vv) < 1e-6) return interpHourly(times, dirs, ms);
  return (deg(Math.atan2(uu, vv)) + 360) % 360;
}

/** Simplifica para guardar en el móvil: como mucho `max` puntos, conservando los extremos. */
export function decimate(points, max = 2500) {
  if (points.length <= max) return points.map((p) => [round(p.lat, 5), round(p.lon, 5), round(p.ele, 1)]);
  const out = [];
  const step = (points.length - 1) / (max - 1);
  for (let k = 0; k < max; k++) { const p = points[Math.round(k * step)]; out.push([round(p.lat, 5), round(p.lon, 5), round(p.ele, 1)]); }
  return out;
}
const round = (x, n) => (x === null || x === undefined ? null : Math.round(x * 10 ** n) / 10 ** n);

/** Código de tiempo WMO de Open-Meteo → icono y texto corto. */
export function weatherLabel(code) {
  if (code === null || code === undefined) return ['', ''];
  if (code === 0) return ['☀️', 'Despejado'];
  if (code <= 2) return ['🌤️', 'Poco nuboso'];
  if (code === 3) return ['☁️', 'Cubierto'];
  if (code <= 48) return ['🌫️', 'Niebla'];
  if (code <= 57) return ['🌦️', 'Llovizna'];
  if (code <= 67) return ['🌧️', 'Lluvia'];
  if (code <= 77) return ['🌨️', 'Nieve'];
  if (code <= 82) return ['🌦️', 'Chubascos'];
  if (code <= 86) return ['🌨️', 'Chubascos de nieve'];
  return ['⛈️', 'Tormenta'];
}

/** URL de Open-Meteo para varios puntos a la vez, en hora UTC y con tiempos unix. */
export function forecastUrl(samples, fromMs, toMs) {
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const q = new URLSearchParams({
    latitude: samples.map((s) => s.lat.toFixed(3)).join(','),
    longitude: samples.map((s) => s.lon.toFixed(3)).join(','),
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,relative_humidity_2m,dew_point_2m,uv_index,is_day',
    wind_speed_unit: 'kmh', timezone: 'GMT', timeformat: 'unixtime',
    start_date: day(fromMs - 3600000), end_date: day(toMs + 3600000),
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

/** Combina la respuesta de Open-Meteo con las horas de paso: el tiempo que hará en cada punto al pasar. */
export function weatherAlong(samples, etas, response) {
  const list = Array.isArray(response) ? response : [response];
  return samples.map((s, i) => {
    const h = list[i]?.hourly;
    if (!h) return { ...s, eta: etas[i] };
    const at = (k) => (h[k] ? interpHourly(h.time, h[k], etas[i]) : null);
    const wind = at('wind_speed_10m');
    const dir = interpDirection(h.time, h.wind_direction_10m, h.wind_speed_10m, etas[i]);
    const near = h.time.reduce((b, x, j) => (Math.abs(x * 1000 - etas[i]) < Math.abs(h.time[b] * 1000 - etas[i]) ? j : b), 0);
    return {
      ...s, eta: etas[i], temp: at('temperature_2m'), feels: at('apparent_temperature'), rainProb: at('precipitation_probability'),
      rain: at('precipitation'), code: h.weather_code[near], wind, gust: at('wind_gusts_10m'), windFrom: dir,
      clouds: at('cloud_cover'), hum: at('relative_humidity_2m'), dew: at('dew_point_2m'), uv: at('uv_index'), isDay: h.is_day ? h.is_day[near] : null,
      rel: windRelative(s.heading, dir, wind),
    };
  });
}

/** Categoría al estilo de las vueltas: longitud (m) × pendiente media (%). */
export function climbCategory(c) {
  const score = c.length * c.avg * 100;
  if (score >= 80000) return 'HC';
  if (score >= 64000) return '1';
  if (score >= 32000) return '2';
  if (score >= 16000) return '3';
  if (score >= 8000) return '4';
  return '';
}

/** Color por pendiente (fracción), los mismos tramos que la leyenda del perfil. */
export function gradeColor(g) {
  if (g < 0.03) return 'var(--g1)';
  if (g < 0.06) return 'var(--g2)';
  if (g < 0.09) return 'var(--g3)';
  if (g < 0.12) return 'var(--g4)';
  return 'var(--g5)';
}

/**
 * Nota de una hora de salida (más baja = mejor): viento de cara, lluvia y salir o llegar de noche.
 * `wx`: resultado de weatherAlong; `dark`: minutos fuera de la luz del día.
 */
export function departureScore(wx, darkMin = 0) {
  if (!wx.length) return Infinity;
  let s = 0;
  for (const w of wx) {
    if (w.wind === undefined) continue;
    s += Math.max(0, w.rel.head) + 0.25 * Math.abs(w.rel.cross) + 0.15 * (w.rainProb ?? 0) + 8 * (w.rain ?? 0);
  }
  return s / wx.length + darkMin * 0.3;
}

/** Distancia (m) a la que vas a los `ms` desde la salida. */
export function distAtTime(points, t, ms) {
  let a = 0, b = t.length - 1;
  if (ms <= 0) return 0;
  if (ms >= t[b]) return points[b].d;
  while (a < b) { const m = (a + b) >> 1; if (t[m] < ms) a = m + 1; else b = m; }
  const f = t[a] === t[a - 1] ? 0 : (ms - t[a - 1]) / (t[a] - t[a - 1]);
  return points[a - 1].d + (points[a].d - points[a - 1].d) * f;
}

/**
 * Tomas de comida. Devuelve [{ ms, d, grams, moved }].
 * Manual: una cada `everyMin` (la primera a los `firstMin`), con lo que toca a `gph` g/h en ese intervalo.
 * Inteligente (`smart`): las mismas horas hasta `endGapMin` antes de llegar, los hidratos de toda la
 * salida (redondeados a 10 g) a partes iguales, y cada toma se mueve hasta `shiftMin` minutos para no
 * caer en una bajada (< −3 %) ni en una rampa dura (> 7 %): se come mejor en llano o subiendo suave.
 */
export function feedingPlan(points, t, { gph = 90, everyMin = 30, firstMin = 25, smart = false, endGapMin = 20, shiftMin = 8 } = {}) {
  const total = t[t.length - 1];
  const at = (ms) => distAtTime(points, t, ms);
  if (!smart) {
    const out = [];
    const each = Math.round((gph * everyMin) / 60);
    for (let ms = firstMin * 60000; ms < total - 10 * 60000; ms += everyMin * 60000) out.push({ ms, d: at(ms), grams: each, moved: '' });
    return out;
  }
  const times = [];
  for (let ms = firstMin * 60000; ms <= total - endGapMin * 60000; ms += everyMin * 60000) times.push(ms);
  if (!times.length && total > 45 * 60000) times.push(Math.round(total / 2 / 60000) * 60000);
  if (!times.length) return [];
  const totalGrams = Math.round((gph * total) / 3600000 / 10) * 10;
  const grams = Math.max(5, Math.round(totalGrams / times.length / 5) * 5);
  const terrain = (ms) => gradeAt(points, at(ms), 150);
  const cost = (g) => (g < -0.03 ? 100 : 0) + (g > 0.07 ? 50 : 0) + Math.abs(g) * 100;
  const out = [];
  for (const base of times) {
    const prev = out[out.length - 1]?.ms ?? -Infinity;
    let best = base, bestC = Infinity;
    for (let dm = -shiftMin; dm <= shiftMin; dm++) {
      const ms = base + dm * 60000;
      if (ms < 10 * 60000 || ms > total - 5 * 60000 || ms - prev < 15 * 60000) continue;
      const c = cost(terrain(ms)) + Math.abs(dm) * 0.6;
      if (c < bestC) { bestC = c; best = ms; }
    }
    const g0 = terrain(base);
    const moved = best === base ? '' : g0 < -0.03 ? 'bajada' : g0 > 0.07 ? 'rampa' : '';
    out.push({ ms: best, d: at(best), grams, moved });
  }
  return out;
}

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** GPX con el track y los waypoints [{lat, lon, name, desc, sym}]. Las horas de paso van en <time> si se dan. */
export function toGPX(name, points, waypoints = [], { startMs = null, t = null } = {}) {
  const time = (i) => (startMs !== null && t ? `<time>${new Date(startMs + t[i]).toISOString()}</time>` : '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="CC Monzón · Planificar ruta" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${xmlEsc(name)}</name></metadata>
${waypoints.map((w) => `<wpt lat="${w.lat.toFixed(6)}" lon="${w.lon.toFixed(6)}"><name>${xmlEsc(w.name)}</name>${w.desc ? `<desc>${xmlEsc(w.desc)}</desc>` : ''}<sym>${xmlEsc(w.sym || 'Flag, Blue')}</sym></wpt>`).join('\n')}
<trk><name>${xmlEsc(name)}</name><trkseg>
${points.map((p, i) => `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><ele>${(p.ele ?? p.es).toFixed(1)}</ele>${time(i)}</trkpt>`).join('\n')}
</trkseg></trk>
</gpx>
`;
}

/** Punto del track más cercano a (lat, lon). Devuelve la distancia acumulada en ese punto. */
export function nearestD(points, lat, lon) {
  let best = 0, bd = Infinity;
  const k = Math.cos(rad(lat));
  for (const p of points) {
    const dd = (p.lat - lat) ** 2 + ((p.lon - lon) * k) ** 2;
    if (dd < bd) { bd = dd; best = p.d; }
  }
  return best;
}
