# Carreras del Club Ciclista Monzón

App web instalable en el móvil para que la dirección del club gestione inscripciones, resultados, podios y el resumen anual, y para que los corredores vean las inscripciones y se apunten con un enlace personal (sin contraseña).

- **Montarla (guía para no programadores):** [docs/GUIA.md](docs/GUIA.md)
- **App:** https://jordixaviermp-commits.github.io/Club/ (cuando GitHub Pages esté activado)

## Cómo está hecha

| Parte | Qué es |
|---|---|
| `index.html`, `css/`, `js/` | App estática sin paso de compilación, servida por GitHub Pages |
| `js/config.js` | URL y clave pública de Supabase. Vacío = modo demostración (localStorage) |
| `js/logic.js` | Reglas puras: alta masiva, resumen anual, CSV, fechas |
| `js/api.js` | Acceso a datos: Supabase o demostración, con la misma interfaz |
| `supabase/schema.sql` | Tablas, seguridad (RLS) y funciones. Se puede volver a ejecutar |
| `sw.js`, `manifest.webmanifest`, `icons/` | Instalación como app y apertura sin conexión |
| `scripts/calendarios.mjs`, `data/calendarios.json` | Lector de los calendarios de las federaciones catalana y aragonesa y su resultado (lo actualiza `.github/workflows/calendarios.yml`) |
| `ruta/` | Planificar ruta: sube un .gpx/.fit y mira viento, tiempo, luz y subidas a tu hora de paso, avituallamiento y exportar .gpx con waypoints. Previsión de Open-Meteo (sin clave), mapa de OpenStreetMap con Leaflet. Todo en el navegador; `scripts/ruta-ejemplo.mjs` genera la ruta de ejemplo |
| `.github/workflows/keepalive.yml` | Consulta dos veces por semana para que Supabase gratuito no se pause |

**Seguridad:** el rol anónimo no puede leer ni escribir ninguna tabla. Los corredores solo usan tres funciones (`runner_view`, `runner_join`, `runner_leave`) que exigen su código personal de 12 caracteres y solo actúan sobre ellos mismos. La dirección entra con email y contraseña de Supabase Auth y debe figurar en la tabla `admins`.

## Pruebas

```bash
node --test tests/*.test.mjs      # reglas de negocio
sudo bash tests/sql/run.sh        # schema.sql contra PostgreSQL 16 local (permisos y funciones)
python3 -m http.server 8000       # probar la app en modo demostración: http://localhost:8000
```
