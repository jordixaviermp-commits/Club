// Ficha para compartir: una imagen (PNG) con la cabecera, el mapa con el viento, el perfil con las
// subidas y las gráficas de viento, temperatura y lluvia. Se dibuja en un <canvas>, sin servidor.
import * as R from './logic.js';

const W = 1080, M = 48;
const C = { ink: '#1b2a36', muted: '#5f6b76', line: '#dfe5ea', accent: '#284556', cyan: '#00a9d6', sil: '#e4e9f0',
  cara: '#d92d20', lateral: '#e0b000', favor: '#16a34a', none: '#284556', orange: '#e8711a' };
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const hm = (ms) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const kindColor = (w) => (w && w.wind !== undefined ? C[w.rel.kind] : C.none);

function loadImage(src, cors = false, timeout = 7000) {
  return new Promise((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    const t = setTimeout(() => resolve(null), timeout);
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = src;
  });
}

function wrap(ctx, text, maxW, maxLines = 2) {
  const words = String(text).split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; let l = lines[maxLines - 1]; while (ctx.measureText(`${l}…`).width > maxW && l.length > 1) l = l.slice(0, -1); lines[maxLines - 1] = `${l}…`; }
  return lines;
}

function ticks(lo, hi, n = 3) {
  const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw);
  const out = [];
  for (let v = Math.floor(lo / step) * step; ; v += step) { out.push(+v.toFixed(6)); if (v >= hi - step * 1e-6) break; }
  return out;
}

// ---------- Mapa (teselas de OpenStreetMap) ----------
const mx = (lon) => (lon + 180) / 360;
const my = (lat) => { const s = Math.sin((lat * Math.PI) / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };

async function drawMap(ctx, d, y0, H) {
  const P = d.track.points;
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
  for (const p of P) { const x = mx(p.lon), y = my(p.lat); if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
  const pad = 70;
  const fit = Math.min((W - 2 * pad) / Math.max(1e-9, (x2 - x1) * 256), (H - 2 * pad) / Math.max(1e-9, (y2 - y1) * 256));
  const zf = Math.log2(fit), z = Math.max(1, Math.min(17, Math.round(zf))), s = 2 ** (zf - z), n = 2 ** z;
  const left = ((x1 + x2) / 2) * n * 256 - W / (2 * s), top = ((y1 + y2) / 2) * n * 256 - H / (2 * s);
  const proj = (p) => [(mx(p.lon) * n * 256 - left) * s, (my(p.lat) * n * 256 - top) * s + y0];

  ctx.save();
  ctx.beginPath(); ctx.rect(0, y0, W, H); ctx.clip();
  ctx.fillStyle = '#e9eef0'; ctx.fillRect(0, y0, W, H);
  const jobs = [];
  for (let tx = Math.floor(left / 256); tx <= Math.floor((left + W / s) / 256); tx++) {
    for (let ty = Math.floor(top / 256); ty <= Math.floor((top + H / s) / 256); ty++) {
      if (ty < 0 || ty >= n) continue;
      jobs.push(loadImage(`https://tile.openstreetmap.org/${z}/${((tx % n) + n) % n}/${ty}.png`, true).then((img) => ({ img, tx, ty })));
    }
  }
  let tiles = 0;
  for (const { img, tx, ty } of await Promise.all(jobs)) {
    if (!img) continue;
    tiles++;
    ctx.drawImage(img, (tx * 256 - left) * s, (ty * 256 - top) * s + y0, 256 * s + 0.6, 256 * s + 0.6);
  }
  ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(0, y0, W, H);

  // track: borde blanco y encima un tramo por punto de previsión, con el color de su viento
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const path = (a, b) => { ctx.beginPath(); for (let i = a; i <= b; i++) { const [x, y] = proj(P[i]); if (i === a) ctx.moveTo(x, y); else ctx.lineTo(x, y); } };
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 13; path(0, P.length - 1); ctx.stroke();
  const cuts = d.samples.map((q) => q.d);
  ctx.lineWidth = 8;
  for (let k = 0; k < cuts.length - 1; k++) {
    const a = Math.max(0, R.indexAt(P, cuts[k]) - 1), b = R.indexAt(P, cuts[k + 1]);
    ctx.strokeStyle = kindColor(d.along?.[k]); path(a, b); ctx.stroke();
  }
  // flechas del viento, repartidas y sin pisarse
  if (d.along) {
    const placed = [];
    const nA = Math.min(9, Math.max(3, Math.round(d.track.distance / 8000)));
    for (let k = 0; k < nA; k++) {
      const dd = ((k + 0.5) / nA) * d.track.distance;
      const w = d.along.reduce((b, q) => (Math.abs(q.d - dd) < Math.abs(b.d - dd) ? q : b), d.along[0]);
      if (w.wind === undefined) continue;
      const [x, y] = proj(R.pointAt(P, dd));
      if (placed.some(([px, py]) => Math.hypot(px - x, py - y) < 70)) continue;
      placed.push([x, y]);
      const size = 30 + Math.min(26, w.wind * 0.9);
      ctx.save(); ctx.translate(x, y); ctx.rotate(((w.windFrom + 180) * Math.PI) / 180); ctx.scale(size / 24, size / 24); ctx.translate(-12, -12);
      const a = new Path2D('M12 1.5 21.5 12.5h-5.8V22.5H8.3V12.5H2.5Z');
      ctx.fillStyle = '#fff'; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.7; ctx.lineJoin = 'round'; ctx.fill(a); ctx.stroke(a);
      ctx.restore();
    }
  }
  const dot = (p, fill, label) => { const [x, y] = proj(p); ctx.beginPath(); ctx.arc(x, y, 13, 0, 7); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `700 15px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(label, x, y + 5); };
  dot(P[P.length - 1], '#111', 'F'); dot(P[0], C.favor, 'S');
  // atribución
  ctx.font = `20px ${FONT}`; ctx.textAlign = 'right';
  const at = '© OpenStreetMap', tw = ctx.measureText(at).width;
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(W - tw - 24, y0 + H - 34, tw + 24, 34);
  ctx.fillStyle = C.ink; ctx.fillText(at, W - 12, y0 + H - 10);
  ctx.restore();
  return tiles;
}

// ---------- Ficha ----------
/**
 * `d`: { name, club, start, track, tl, samples, along, climbs: [{ start, end, top, n, color }], lines: [texto…],
 *        hard: texto corto o '', footer: texto, logo: url }.
 * Devuelve { blob, canvas, tiles } (tiles = teselas del mapa que se han podido cargar).
 */
export async function buildCard(d) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = 2700;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, cv.height);
  ctx.textBaseline = 'alphabetic';
  let y = M;

  // cabecera
  const logo = d.logo ? await loadImage(d.logo) : null;
  if (logo) { ctx.save(); ctx.beginPath(); ctx.arc(M + 30, y + 30, 30, 0, 7); ctx.clip(); ctx.drawImage(logo, M, y, 60, 60); ctx.restore(); }
  ctx.fillStyle = C.accent; ctx.font = `700 28px ${FONT}`; ctx.textAlign = 'left';
  ctx.fillText(d.club, M + (logo ? 76 : 0), y + 28);
  ctx.fillStyle = C.muted; ctx.font = `22px ${FONT}`; ctx.fillText('Planificación de ruta', M + (logo ? 76 : 0), y + 56);
  y += 92;
  ctx.fillStyle = C.ink; ctx.font = `800 58px ${FONT}`;
  for (const l of wrap(ctx, d.name, W - 2 * M, 2)) { y += 58; ctx.fillText(l, M, y); y += 8; }
  y += 14;
  d.lines.forEach((l, i) => {
    ctx.font = `${i === 1 ? '700 ' : ''}31px ${FONT}`; ctx.fillStyle = i === 0 ? C.muted : C.ink;
    for (const part of wrap(ctx, l, W - 2 * M, 2)) { y += 36; ctx.fillText(part, M, y); y += 6; }
  });
  y += 26;

  // mapa
  const MH = 620;
  const tiles = await drawMap(ctx, d, y, MH);
  y += MH + 40;
  const legend = (items, x0, yy, size = 24) => {
    let x = x0; ctx.font = `${size}px ${FONT}`; ctx.textAlign = 'left';
    for (const [color, label, dash] of items) {
      if (color) { ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.setLineDash(dash ? [8, 6] : []); ctx.beginPath(); ctx.moveTo(x, yy - size * 0.32); ctx.lineTo(x + 30, yy - size * 0.32); ctx.stroke(); ctx.setLineDash([]); x += 40; }
      ctx.fillStyle = C.ink; ctx.fillText(label, x, yy); x += ctx.measureText(label).width + 28;
    }
    return x;
  };
  if (d.along) { legend([[C.cara, 'De cara'], [C.lateral, 'Cruzado o flojo'], [C.favor, 'A favor'], [null, 'Flechas: hacia dónde sopla']], M, y); y += 44; }

  // ejes comunes: x por distancia, alineado en el perfil y en las gráficas
  const P = d.track.points, total = d.track.distance, X0 = M + 86, X1 = W - M;
  const x = (dd) => X0 + (dd / total) * (X1 - X0);
  const N = 240, prof = [];
  for (let k = 0; k <= N; k++) { const dd = (k / N) * total; prof.push([dd, R.pointAt(P, dd).es]); }
  const title = (t) => { ctx.fillStyle = C.ink; ctx.font = `800 36px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(t, M, y); };

  // perfil
  y += 30; title('Elevación');
  y += 44;
  const hours = [[0, hm(d.start), 'left']];
  for (let h = Math.ceil(d.start / 3600000) * 3600000; h < d.start + d.tl.total; h += 3600000) {
    const dd = R.distAtTime(P, d.tl.t, h - d.start);
    if (x(dd) - X0 > 110 && X1 - x(dd) > 110) hours.push([dd, hm(h), 'center']);
  }
  hours.push([total, hm(d.start + d.tl.total), 'right']);
  ctx.font = `600 24px ${FONT}`; ctx.fillStyle = C.ink;
  for (const [dd, l, a] of hours) { ctx.textAlign = a; ctx.fillText(l, x(dd), y); }
  y += 16;
  const PH = 250, lo = Math.floor((d.track.minEle - 10) / 100) * 100;
  // hueco arriba para los números de las subidas
  const hi = Math.ceil((d.track.maxEle + (d.track.maxEle - lo) * 0.16) / 50) * 50;
  const ey = (e) => y + (1 - (e - lo) / (hi - lo || 1)) * PH;
  ctx.font = `22px ${FONT}`; ctx.textAlign = 'right';
  for (const e of ticks(lo, hi, 4)) { if (e < lo || e > hi) continue; ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X0, ey(e)); ctx.lineTo(X1, ey(e)); ctx.stroke(); ctx.fillStyle = C.muted; ctx.fillText(`${e.toLocaleString('es-ES')} m`, X0 - 10, ey(e) + 8); }
  const area = (d1, d2, fill) => {
    ctx.beginPath(); ctx.moveTo(x(d1), y + PH); ctx.lineTo(x(d1), ey(R.pointAt(P, d1).es));
    for (const [dd, e] of prof) if (dd > d1 && dd < d2) ctx.lineTo(x(dd), ey(e));
    ctx.lineTo(x(d2), ey(R.pointAt(P, d2).es)); ctx.lineTo(x(d2), y + PH); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  };
  area(0, total, C.sil);
  for (const c of d.climbs) area(c.start, c.end, c.color);
  ctx.beginPath(); prof.forEach(([dd, e], i) => (i ? ctx.lineTo(x(dd), ey(e)) : ctx.moveTo(x(dd), ey(e)))); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.font = `700 22px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = C.ink;
  for (const c of d.climbs) ctx.fillText(String(c.n), (x(c.start) + x(c.end)) / 2, ey(c.top) - 10);
  y += PH;
  if (d.along) {
    const cuts = d.samples.map((q) => q.d);
    for (let k = 0; k < cuts.length - 1; k++) { ctx.fillStyle = kindColor(d.along[k]); ctx.fillRect(x(cuts[k]), y + 6, x(cuts[k + 1]) - x(cuts[k]) + 0.6, 12); }
    ctx.fillStyle = C.muted; ctx.font = `22px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText('Viento', X0 - 10, y + 20);
  }
  y += 34;
  ctx.fillStyle = C.muted; ctx.font = `22px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText('0 km', X0, y + 14); ctx.textAlign = 'right'; ctx.fillText(`${(total / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`, X1, y + 14);
  if (d.hard) { ctx.textAlign = 'center'; ctx.fillStyle = C.ink; ctx.fillText(d.hard, (X0 + X1) / 2, y + 14); }
  y += 40;

  // gráficas
  const A = (d.along || []).filter((w) => w.wind !== undefined);
  const chart = (name, series, { zero = false, range = null, unit = '' } = {}) => {
    y += 58; title(name);
    legend(series.map(([, label, color, dash]) => [color, label, dash]), M + ctx.measureText(name).width + 36, y - 4, 23);
    y += 22;
    const CH = 150;
    const vals = series.flatMap(([k]) => A.map((w) => w[k]).filter((v) => v !== null && v !== undefined));
    if (!vals.length) { y += 20; return; }
    let a = range ? range[0] : zero ? 0 : Math.min(...vals), b = range ? range[1] : Math.max(...vals);
    if (b - a < 1) b = a + 1;
    const tk = ticks(a, b, 3); a = tk[0]; b = tk[tk.length - 1];
    const vy = (v) => y + (1 - (v - a) / (b - a)) * CH;
    // silueta del perfil de fondo
    ctx.beginPath(); ctx.moveTo(X0, y + CH);
    for (const [dd, e] of prof) ctx.lineTo(x(dd), y + CH - ((e - d.track.minEle) / ((d.track.maxEle - d.track.minEle) || 1)) * CH * 0.8);
    ctx.lineTo(X1, y + CH); ctx.closePath(); ctx.fillStyle = C.sil; ctx.fill();
    ctx.font = `22px ${FONT}`; ctx.textAlign = 'right';
    for (const v of tk) { ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X0, vy(v)); ctx.lineTo(X1, vy(v)); ctx.stroke(); ctx.fillStyle = C.muted; ctx.fillText(`${v.toLocaleString('es-ES')}${unit}`, X0 - 10, vy(v) + 8); }
    for (const [k, , color, dash] of series) {
      ctx.beginPath(); let first = true;
      for (const w of A) { if (w[k] === null || w[k] === undefined) continue; if (first) { ctx.moveTo(x(w.d), vy(w[k])); first = false; } else ctx.lineTo(x(w.d), vy(w[k])); }
      ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.setLineDash(dash ? [10, 8] : []); ctx.stroke(); ctx.setLineDash([]);
    }
    y += CH + 4;
  };
  if (A.length) {
    chart('Viento', [['wind', 'Viento (km/h)', C.accent, false], ['gust', 'Rachas', C.orange, true]], { zero: true });
    chart('Temperatura', [['temp', 'Temperatura (°C)', C.accent, false], ['feels', 'Sensación', C.orange, true]], { unit: '°' });
    chart('Lluvia y nubes', [['rainProb', 'Probabilidad de lluvia (%)', C.accent, false], ['clouds', 'Nubes', C.orange, true]], { range: [0, 100] });
  } else {
    y += 30; ctx.fillStyle = C.muted; ctx.font = `26px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText('Sin previsión del tiempo para esa fecha todavía.', M, y); y += 20;
  }

  // pie
  y += 26; ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke();
  y += 40; ctx.font = `700 24px ${FONT}`; ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.fillText(`Planificada con la app del ${d.club}`, M, y);
  ctx.font = `22px ${FONT}`; ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.fillText(d.footer, W - M, y);
  y += M;

  const out = document.createElement('canvas');
  out.width = W; out.height = Math.round(y);
  out.getContext('2d').drawImage(cv, 0, 0);
  const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
  return { blob, canvas: out, tiles };
}
