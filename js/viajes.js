// Desplazamientos a las carreras: distancia aproximada desde un punto de salida común hasta la población de cada carrera.
// Es orientativo: unos viven en Monzón y otros en Lleida, así que se usa un punto intermedio entre las dos (cámbialo aquí si hace falta).
// Sin dependencias: lo usan la lógica de estadísticas y la pantalla.

/** Punto de salida de todos los desplazamientos: a medio camino entre Monzón (41,917 N, 0,199 E) y Lleida (41,618 N, 0,620 E). */
export const ORIGEN = { nombre: 'a medio camino entre Monzón y Lleida', lat: 41.7671, lon: 0.4095 };
/** La carretera es más larga que la línea recta: se multiplica por este factor para estimar los km reales (curvas, puertos, rodeos). */
export const FACTOR_CARRETERA = 1.25;

/** Nombre para comparar: sin mayúsculas, tildes ni signos. */
export const normPlace = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// [nombre, latitud, longitud, ...otros nombres]. Poblaciones donde es probable que haya carreras (Aragón, Cataluña, Pirineos, Navarra…) y capitales.
const POBLACIONES = [
  // Huesca
  ['Monzón', 41.9166, 0.199, 'Monzon'], ['Barbastro', 42.0357, 0.127], ['Binéfar', 41.8475, 0.2937, 'Binefar'], ['Fraga', 41.5222, 0.3489], ['Graus', 42.186, 0.327],
  ['Jaca', 42.57, -0.549], ['Sabiñánigo', 42.519, -0.364, 'Sabinanigo'], ['Aínsa', 42.417, 0.139, 'Ainsa', 'Aínsa-Sobrarbe'], ['Boltaña', 42.449, 0.056], ['Benasque', 42.604, 0.523],
  ['Tamarite de Litera', 41.8686, 0.4252, 'Tamarit de Llitera'], ['Ayerbe', 42.277, -0.679], ['Sariñena', 41.787, -0.159, 'Sarinena'], ['Castejón de Sos', 42.51, 0.49],
  ['Estadilla', 42.067, 0.213], ['Huesca', 42.14, -0.408],
  // Zaragoza y Teruel
  ['Zaragoza', 41.649, -0.889], ['Calatayud', 41.353, -1.643], ['Ejea de los Caballeros', 42.127, -1.137, 'Ejea'], ['Tarazona', 41.905, -1.725], ['Caspe', 41.234, -0.039],
  ['Borja', 41.837, -1.534], ['Alcañiz', 41.051, -0.131, 'Alcaniz'], ['Teruel', 40.345, -1.107],
  // Lleida
  ['Lleida', 41.617, 0.62, 'Lérida', 'Lerida'], ['Balaguer', 41.79, 0.806], ['Cervera', 41.668, 1.272], ['Tàrrega', 41.647, 1.14, 'Tarrega'], ['Mollerussa', 41.632, 0.895],
  ['Les Borges Blanques', 41.522, 0.869, 'Borges Blanques', 'Las Borjas Blancas'], ['Almacelles', 41.731, 0.436], ['Alfarràs', 41.833, 0.574, 'Alfarras'], ['Seròs', 41.451, 0.398, 'Seros'],
  ['Alcarràs', 41.564, 0.524, 'Alcarras'], ["La Seu d'Urgell", 42.358, 1.46, 'Seu dUrgell', 'Seo de Urgel'], ['Solsona', 41.994, 1.517], ['Tremp', 42.166, 0.895], ['Vielha', 42.703, 0.797, 'Viella'],
  ['Sort', 42.413, 1.129], ['Agramunt', 41.787, 1.096], ['Guissona', 41.785, 1.291], ['La Pobla de Segur', 42.248, 0.968, 'Pobla de Segur'], ['Àger', 42.004, 0.762, 'Ager'],
  ['Artesa de Segre', 41.892, 1.049], ['Bellpuig', 41.625, 1.02], ['Alpicat', 41.6683, 0.568],
  // Cataluña (Barcelona, Girona, Tarragona) y Cerdanya
  ['Barcelona', 41.385, 2.173], ['Sant Celoni', 41.69, 2.49], ['Vic', 41.93, 2.254, 'Vich'], ['Manresa', 41.73, 1.826], ['Igualada', 41.58, 1.617], ['Granollers', 41.608, 2.288],
  ['Sabadell', 41.543, 2.109], ['Terrassa', 41.563, 2.008, 'Tarrasa'], ['Mataró', 41.54, 2.445, 'Mataro'], ['Vilafranca del Penedès', 41.345, 1.699, 'Vilafranca del Penedes'],
  ['Sitges', 41.237, 1.806], ['Berga', 42.103, 1.846], ['Ripoll', 42.201, 2.19], ['Olot', 42.182, 2.489], ['Figueres', 42.267, 2.961, 'Figueras'], ['Banyoles', 42.119, 2.766],
  ['Blanes', 41.674, 2.79], ['Lloret de Mar', 41.7, 2.845], ['Cardona', 41.914, 1.679], ['Moià', 41.811, 2.098, 'Moia'], ['Sant Cugat del Vallès', 41.472, 2.086, 'Sant Cugat'],
  ['Mollet del Vallès', 41.54, 2.213, 'Mollet del Valles'], ['Calella', 41.616, 2.664], ['Pineda de Mar', 41.627, 2.69], ['Girona', 41.979, 2.821, 'Gerona'],
  ['Tarragona', 41.119, 1.245], ['Reus', 41.156, 1.107], ['Salou', 41.077, 1.14], ['Cambrils', 41.067, 1.062], ['Montblanc', 41.376, 1.163], ['Tortosa', 40.812, 0.521],
  ['Puigcerdà', 42.432, 1.929, 'Puigcerda'], ['Bellver de Cerdanya', 42.372, 1.778], ['Llívia', 42.463, 1.983, 'Llivia'],
  // Andorra y sur de Francia
  ['Andorra la Vella', 42.507, 1.521, 'Andorra la Vieja'], ['Encamp', 42.536, 1.583], ['Ordino', 42.556, 1.534], ['Canillo', 42.567, 1.598], ['Pas de la Casa', 42.543, 1.733],
  ['Bourg-Madame', 42.435, 1.945, 'Bourg Madame'], ['Font-Romeu', 42.505, 2.036, 'Font Romeu'], ['Mont-Louis', 42.509, 2.121], ['Perpignan', 42.699, 2.895, 'Perpinyà', 'Perpiñán'],
  ['Toulouse', 43.605, 1.444, 'Tolosa'], ['Foix', 42.965, 1.605], ['Carcassonne', 43.213, 2.349], ['Tarbes', 43.233, 0.078], ['Lourdes', 43.094, -0.046], ['Pau', 43.295, -0.37],
  ['Saint-Gaudens', 43.109, 0.725], ['Luchon', 42.79, 0.594, 'Bagnères-de-Luchon'], ['Cauterets', 42.889, -0.112], ['Ax-les-Thermes', 42.722, 1.836], ['Prades', 42.617, 2.424],
  // Navarra, La Rioja, País Vasco, Levante y otras capitales
  ['Pamplona', 42.812, -1.646, 'Iruña'], ['Tudela', 42.062, -1.606], ['Estella', 42.672, -2.029, 'Lizarra'], ['Sangüesa', 42.575, -1.283, 'Sanguesa'], ['Logroño', 42.466, -2.445, 'Logrono'],
  ['Vitoria', 42.847, -2.673, 'Vitoria-Gasteiz', 'Gasteiz'], ['Bilbao', 43.263, -2.935], ['San Sebastián', 43.318, -1.981, 'Donostia', 'San Sebastian'], ['Burgos', 42.343, -3.7], ['Soria', 41.764, -2.469],
  ['Madrid', 40.417, -3.704], ['Valencia', 39.47, -0.376, 'València'], ['Castellón', 39.986, -0.037, 'Castellón de la Plana', 'Castello'], ['Benicàssim', 40.056, 0.065, 'Benicassim'],
  ['Peñíscola', 40.36, 0.408, 'Peniscola'], ['Morella', 40.62, -0.1], ['Vinaròs', 40.47, 0.475, 'Vinaros'], ['Alicante', 38.345, -0.481, 'Alacant'], ['Murcia', 37.992, -1.13],
  ['Palma', 39.57, 2.65, 'Palma de Mallorca'], ['Sevilla', 37.389, -5.984], ['Málaga', 36.721, -4.421, 'Malaga'], ['Granada', 37.177, -3.598], ['Córdoba', 37.888, -4.779, 'Cordoba'],
  ['Valladolid', 41.652, -4.724], ['León', 42.599, -5.567, 'Leon'], ['Santander', 43.462, -3.81], ['Oviedo', 43.361, -5.849], ['A Coruña', 43.362, -8.411, 'La Coruña'], ['Vigo', 42.24, -8.721],
  ['Toledo', 39.862, -4.027], ['Cuenca', 40.07, -2.137], ['Guadalajara', 40.633, -3.167], ['Salamanca', 40.97, -5.664], ['Badajoz', 38.879, -6.971], ['Cáceres', 39.476, -6.372, 'Caceres'],
];
// Provincias (capital): si no se conoce la población, se usa la capital de su provincia como aproximación.
const PROVINCIAS = {
  huesca: [42.14, -0.408], zaragoza: [41.649, -0.889], teruel: [40.345, -1.107], lleida: [41.617, 0.62], barcelona: [41.385, 2.173], girona: [41.979, 2.821], tarragona: [41.119, 1.245],
  navarra: [42.812, -1.646], 'la rioja': [42.466, -2.445], alava: [42.847, -2.673], bizkaia: [43.263, -2.935], gipuzkoa: [43.318, -1.981], burgos: [42.343, -3.7], soria: [41.764, -2.469],
  madrid: [40.417, -3.704], valencia: [39.47, -0.376], castellon: [39.986, -0.037], alicante: [38.345, -0.481], murcia: [37.992, -1.13], 'illes balears': [39.57, 2.65], sevilla: [37.389, -5.984],
  malaga: [36.721, -4.421], granada: [37.177, -3.598], cordoba: [37.888, -4.779], valladolid: [41.652, -4.724], leon: [42.599, -5.567], cantabria: [43.462, -3.81], asturias: [43.361, -5.849],
  'a coruna': [43.362, -8.411], pontevedra: [42.24, -8.721], toledo: [39.862, -4.027], cuenca: [40.07, -2.137], guadalajara: [40.633, -3.167], salamanca: [40.97, -5.664], badajoz: [38.879, -6.971],
  caceres: [39.476, -6.372], andorra: [42.507, 1.521],
};

const INDICE = new Map();
for (const [nombre, lat, lon, ...otros] of POBLACIONES) for (const n of [nombre, ...otros]) INDICE.set(normPlace(n), [lat, lon]);

/** Distancia en línea recta (km) entre dos puntos {lat, lon}. */
export function haversineKm(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Rumbo (grados, 0 = norte, 90 = este) desde `a` hacia `b`. */
export function bearingDeg(a, b) {
  const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Clave que identifica «dónde es» una carrera (población + provincia): si cambia, las coordenadas guardadas ya no valen. */
export const geoKey = (r) => `${normPlace(r?.place)}|${normPlace(r?.province)}`;

/** Coordenadas de una población (o, si no se conoce, de la capital de su provincia). `src`: 'town' o 'province'; null si no hay forma. */
export function placeCoords(place, province = '') {
  const raw = String(place ?? '');
  const candidates = [raw, raw.replace(/\(.*?\)/g, ''), ...raw.split(/[,\-–—/·|]/)].map(normPlace).filter(Boolean);
  const words = normPlace(raw.replace(/\(.*?\)/g, ''));
  for (const c of [...new Set(candidates)]) if (INDICE.has(c)) { const [lat, lon] = INDICE.get(c); return { lat, lon, src: 'town' }; }
  // «Salida de Monzón», «Meta en Fraga»…: alguna población conocida aparece como palabra suelta o dentro de la frase
  for (const [n, [lat, lon]] of INDICE) if (n.length >= 4 && (` ${words} `).includes(` ${n} `)) return { lat, lon, src: 'town' };
  const p = PROVINCIAS[normPlace(province)] || PROVINCIAS[normPlace(candidates.find((c) => PROVINCIAS[c]) || '')];
  return p ? { lat: p[0], lon: p[1], src: 'province' } : null;
}

/** Coordenadas de una carrera: las guardadas (si siguen siendo de su población), las del listado de poblaciones o, como aproximación, las de su provincia. */
export function coordsOf(r) {
  if (r && r.lat != null && r.lon != null && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)) && r.geo_key && r.geo_key === geoKey(r)) return { lat: Number(r.lat), lon: Number(r.lon), src: 'geo' };
  return placeCoords(r?.place, r?.province);
}

/**
 * Cuánto hay desde el punto de salida hasta la carrera: km por carretera (estimados, solo ida), la línea recta, el rumbo y de dónde salen las coordenadas.
 * null si no se sabe dónde es.
 */
export function distanceKm(r, origen = ORIGEN) {
  const c = coordsOf(r);
  if (!c) return null;
  const straight = haversineKm(origen, c);
  return { km: Math.max(1, Math.round(straight * FACTOR_CARRETERA)), straight: Math.round(straight), bearing: Math.round(bearingDeg(origen, c)), src: c.src, lat: c.lat, lon: c.lon };
}

const CODIGO_PAIS = { españa: 'ES', espana: 'ES', francia: 'FR', andorra: 'AD', portugal: 'PT', italia: 'IT' };
/**
 * De los resultados de un buscador de poblaciones (Open-Meteo: latitude, longitude, country_code, admin1-3, population) elige el que mejor
 * encaja con el país y la provincia de la carrera. null si no hay ninguno razonable.
 */
export function pickGeocode(results, province = '', country = 'España') {
  const cc = CODIGO_PAIS[normPlace(country || 'España')] || 'ES', prov = normPlace(province);
  const list = (results || []).filter((r) => Number.isFinite(r?.latitude) && Number.isFinite(r?.longitude));
  let best = null, bestScore = -1;
  for (const r of list) {
    const donde = [r.admin1, r.admin2, r.admin3].map(normPlace).join(' | ');
    const score = (r.country_code === cc ? 10 : 0) + (prov && donde.includes(prov) ? 6 : 0) + Math.log10(1 + (r.population || 0)) / 4;
    if (score > bestScore) { best = r; bestScore = score; }
  }
  if (!best || (best.country_code !== cc && list.some((r) => r.country_code === cc))) return null;
  return { lat: Math.round(best.latitude * 1e5) / 1e5, lon: Math.round(best.longitude * 1e5) / 1e5 };
}
