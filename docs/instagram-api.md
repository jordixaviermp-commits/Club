# Captura de Instagram con la API de Meta (sin Windsor ni rutinas de Claude)

Una **acción programada de GitHub** (`.github/workflows/instagram.yml`) lee cada día las estadísticas de la cuenta
directamente de Instagram y las guarda en la base de datos del club (tabla privada `ig_snapshots`).
No depende de Windsor, de conectores ni del límite de uso de Claude. Cuesta **0 €**.

- Meta guarda las métricas de cuenta **90 días**: lo que no se capture a tiempo se pierde. Por eso se rellenan 90 días la primera vez.
- El **token** de Instagram dura 60 días y **se renueva solo** en cada captura. Vive en tu Supabase (tabla `ig_token_store`), nunca en GitHub ni en un chat.
- Si la captura falla, la pestaña de Instagram simplemente no recibe datos nuevos: no se rompe nada más.

## Puesta en marcha (una sola vez, ~30 minutos)

> Los menús de Meta cambian con frecuencia: si algo no coincide, manda una captura de pantalla (sin el token) y lo ajustamos.
> Guía oficial: <https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/get-started>

### 1. Crear la app en Meta
1. Entra en <https://developers.facebook.com/apps> con tu Facebook personal y acepta ser **desarrollador** si te lo pide.
2. **Crear app** → tipo **Business** (Empresa). Nombre: «CC Monzón estadísticas». Es una app solo para ti: no hace falta publicarla ni pasar revisión de Meta.
3. En el panel de la app, añade el producto **Instagram** → **API setup with Instagram business login**.

### 2. Generar el token
1. En esa misma pantalla, junto a la cuenta de Instagram del club, pulsa **Add account** si no aparece (te pedirá iniciar sesión en Instagram con la cuenta del club; si te pide aceptar una invitación de «probador», acéptala desde la app de Instagram: Ajustes → Sitios web y aplicaciones → Invitaciones de probadores).
2. Pulsa **Generate token** junto a la cuenta, inicia sesión y **copia el token** (empieza por `IGAA…`). Dura 60 días.
3. **No lo pegues en ningún chat.** Si lo haces sin querer, vuelve a generarlo (el anterior queda inservible).

### 3. Preparar la base de datos
1. En Supabase → SQL Editor, pega y ejecuta `supabase/cambios/2026-11-14-instagram-api.sql` (Copy raw file; con el traductor desactivado).
2. En otra consulta, ejecuta (cambiando `PEGA_AQUI_EL_TOKEN` por el token de Instagram) **solo esa línea**:
   ```sql
   insert into public.ig_token_store (id, token) values (1, 'PEGA_AQUI_EL_TOKEN')
   on conflict (id) do update set token = excluded.token, updated_at = now();
   ```
3. Ejecuta `select token as "COPIA_ESTE_TOKEN" from public.ig_secret;` y copia el resultado (es la clave de la captura, distinta del token de Instagram).

### 4. Dar la clave a GitHub
En el repositorio → **Settings → Secrets and variables → Actions → New repository secret**:
nombre `IG_SAVE_TOKEN`, valor: el resultado del paso 3.3.

### 5. Primera ejecución (en dos tiempos)
1. Pestaña **Actions** → **Instagram (captura de estadísticas)** → **Run workflow**. Pon `dias` = `90`, `historico` = `sí`, `prueba` = `sí` y lánzalo.
   «Prueba» **no guarda nada**: enseña qué ha conseguido leer. Cópiame el registro de la ejecución (no contiene claves) y lo repasamos.
2. Si todo sale bien, vuelve a lanzarlo con `dias` = `90`, `historico` = `sí`, `prueba` = `no`. El registro debe acabar en **ESTADÍSTICAS GUARDADAS: ok**.
3. A partir de ahí se ejecuta solo todos los días (06:37 UTC, entre las 07:37 y las 08:37 en Madrid).

## Qué guarda (además de lo que ya había)

| Dato | Campo | Nota |
|---|---|---|
| Visualizaciones por tipo de contenido | `v_story`, `v_feed`, `v_reel` | lo que Insights llama «Historias / Publicaciones / Reels» |
| Seguidores / no seguidores | `views_f`, `views_nf`, `reach_f`, `reach_nf` | |
| Altas y bajas | `fu_f`, `fu_nf` | tal como los da Meta; se interpretan cuando se compruebe con la primera ejecución |
| Audiencia que interactúa | `engaged_gender_age`, `engaged_city`, `engaged_country` | además de la de seguidores |
| Horas con más seguidores conectados | `online_hours` | solo últimos 30 días según Meta |
| Reels | `reel_avg_ms`, `reel_total_ms` | tiempo medio y total de reproducción |
| **Todas** las publicaciones de la cuenta | `media` | con `historico` = `sí` la primera vez |

La app mostrará estos campos nuevos en cuanto se compruebe, con datos reales, que Meta los devuelve como se espera.

## Si algo falla
- «La API de Instagram rechaza el token»: el token caducó o se revocó. Genera otro (paso 2) y vuelve a ejecutar el `insert` del paso 3.2.
- «Todavía no hay token…» / «No puedo leer el token»: falta el SQL del paso 3 o el secreto `IG_SAVE_TOKEN` del paso 4.
- Avisos con nombre de métrica (⚠️): Meta no devuelve esa métrica para esta cuenta; el resto se guarda igual.
- Si la acción no se ejecuta durante más de 60 días, el token caduca: repite los pasos 2 y 3.2.

## Privacidad
No se guardan nombres de usuario ni comentarios; de cada publicación solo su **título** (la primera línea, máx. 90 caracteres).
El token de Instagram no se imprime nunca en el registro de la acción.
