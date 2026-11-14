# Estadísticas de Instagram: captura diaria

Windsor solo da los **últimos 30 días** de la cuenta, y las **historias solo 24 horas**. Por eso una tarea automática
guarda cada día una foto de las cifras en la base de datos (tabla privada `ig_snapshots`, solo la lee la dirección).

## Qué se guarda (una fila por `kind` + `key`, el campo `data` es JSON; se quitan los valores vacíos)

| kind | key | data |
|---|---|---|
| `day` | `AAAA-MM-DD` | `views, reach, follows, taps, interactions, engaged, likes, comments, shares, saves, replies, views_f, views_nf, reach_f, reach_nf, unfollows` |
| `media` | id de la publicación | `ts, type, product, link, views, reach, likes, comments, saves, shares, visits, follows, engagement` |
| `story` | id de la historia | `ts, views, reach, replies, shares, interactions, taps_fwd, taps_back, exits, swipe_fwd` |
| `account` | `AAAA-MM-DD` | `followers, following, media` |
| `audience` | `AAAA-MM-DD` | `gender_age {"F.25-34": n…}, country {"ES": n…}, city {"Monzón, Aragón": n…}` |

No se guarda nada personal: ni nombres de usuario ni el texto de los comentarios, solo los números.

## Campos de Windsor que funcionan con esta cuenta (conexión «Instagram Login»)

- Cuenta: `username followers_count follows_count media_count`.
- Día: `date views reach_1d follower_count_1d profile_links_taps total_interactions accounts_engaged likes comments shares saves reposts replies`
  y, aparte, `date views_followers views_non_followers reach_followers reach_non_followers follows_and_unfollows`.
- Publicación: `media_id timestamp media_type media_product_type media_permalink media_views media_reach media_like_count media_comments_count media_saved media_shares media_engagement media_profile_visits media_follows`.
- Historia: `story_id story_timestamp story_views story_reach story_replies story_shares story_interactions story_taps_forward story_taps_back story_exits story_swipe_forward`.
- Audiencia: `audience_gender_age_name/size`, `audience_country_name/size`, `city` + `audience_city_size`.
- **No usar** `media_reposts` ni `media_total_like_count` / `media_total_comments_count` (esta conexión no los devuelve), ni los campos marcados «Deprecated».

## Cómo guarda la tarea (sin claves en el código)

`POST https://<proyecto>.supabase.co/rest/v1/rpc/ig_save` con el cuerpo `{"p_rows": [ {"kind":…, "key":…, "data":{…}}, … ]}`, la cabecera
`apikey` / `Authorization: Bearer` con la clave pública de `js/config.js` y la cabecera `x-ig-token`, que **añade sola la credencial guardada en
el entorno de Claude** (la tarea nunca ve su valor). Sin el token correcto, la función rechaza el guardado. Máximo 600 filas por llamada.
Al repetir una fila se **fusionan** los campos (no se pisa con vacíos).

## Puesta en marcha

1. Ejecutar en Supabase `supabase/cambios/2026-11-14-instagram.sql` (Copy raw file, pegar, Run). Al final sale el **token**: copiarlo.
2. Dárselo a Claude con el formulario seguro de credenciales (cabecera `x-ig-token`, host del proyecto Supabase). No pegarlo en el chat.
3. Claude crea la tarea diaria y hace una primera captura de los últimos 30 días.
4. La pestaña de la app (Resumen → Instagram) lee `ig_snapshots`.
