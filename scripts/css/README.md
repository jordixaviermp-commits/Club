# Limpieza del CSS

Herramientas para quitar CSS que ya no hace nada **y demostrar que no cambia el aspecto**.

1. `python3 scripts/css/limpiar-declaraciones.py css/app.css /tmp/a.css` — quita las declaraciones que ningún navegador aplica porque otra regla posterior con el mismo selector y contexto las pisa.
2. `python3 scripts/css/quitar-reglas-muertas.py /tmp/a.css /tmp/b.css` — quita reglas cuyas clases no aparecen en ningún JS/HTML (cuida las clases que se construyen por trozos).
3. Prueba de que no cambia nada (necesita Playwright y `python3 -m http.server 8125`):
   - con el CSS actual: `SP=. OUT=/tmp/antes.json node scripts/css/foto-estilos.cjs`
   - copia `/tmp/b.css` sobre `css/app.css` y repite con `OUT=/tmp/despues.json`
   - `python3 scripts/css/comparar-fotos.py /tmp/antes.json /tmp/despues.json` debe decir **0 elementos distintos**.

La foto guarda el estilo calculado de cada elemento de ~170 pantallas (corredor y dirección, claro y oscuro, 320/360/768 px).
