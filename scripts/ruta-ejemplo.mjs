// Genera ruta/ejemplo.gpx: Monzón → Barbastro → Alquézar y vuelta.
// Es una ruta de demostración: el trazado une los pueblos en línea recta y la altitud es aproximada.
// Uso: node scripts/ruta-ejemplo.mjs
import { writeFile } from 'node:fs/promises';
import { haversine } from '../ruta/logic.js';

const WP = [
  [41.9106, 0.1934, 280], [41.9900, 0.1680, 300], [42.0357, 0.1265, 330],
  [42.0670, 0.0660, 380], [42.1100, 0.0560, 420], [42.1730, 0.0420, 730], [42.1720, 0.0230, 670],
];
const route = [...WP, ...WP.slice(0, -1).reverse()];
const pts = [];
let dist = 0;
for (let k = 1; k < route.length; k++) {
  const [a, b] = [route[k - 1], route[k]];
  const len = haversine(a[0], a[1], b[0], b[1]);
  const n = Math.max(2, Math.round(len / 50));
  for (let j = k === 1 ? 0 : 1; j <= n; j++) {
    const f = j / n;
    const s = (1 - Math.cos(Math.PI * f)) / 2;
    const d = dist + len * f;
    // pequeños repechos para que el perfil no sea una línea
    const ondula = 4 * Math.sin(d / 1100) + 1.5 * Math.sin(d / 300);
    pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * s + ondula]);
  }
  dist += len;
}
const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="CC Monzón" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>Ejemplo: Monzón – Alquézar</name><trkseg>
${pts.map(([la, lo, e]) => `<trkpt lat="${la.toFixed(6)}" lon="${lo.toFixed(6)}"><ele>${e.toFixed(1)}</ele></trkpt>`).join('\n')}
</trkseg></trk>
</gpx>
`;
await writeFile(new URL('../ruta/ejemplo.gpx', import.meta.url), gpx);
console.log(`${pts.length} puntos, ${(dist / 1000).toFixed(1)} km`);
