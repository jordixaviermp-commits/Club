# Rutina de captura de Instagram (para pegar en claude.ai)

Cómo crearla (una sola vez):

1. En claude.ai, abre **Rutinas** (Routines) → **Nueva rutina**.
2. Pega el texto del recuadro de abajo como prompt.
3. Activa el conector **Windsor.ai** y deja el entorno **Club** (ahí está guardada la credencial `x-ig-token`).
4. Programación: **todos los días a las 09:37 y a las 21:37** (Europe/Madrid). Basta una vez al día; dos ejecuciones aseguran que no se pierda un día si una falla.
5. Pulsa «Ejecutar ahora» una vez y comprueba que el resumen acaba en «ESTADÍSTICAS GUARDADAS: ok».

Límites (ver `docs/instagram-captura.md`): Windsor en prueba solo da 30 días de histórico y, si se alcanza el límite de uso de Claude, esa ejecución se pierde (el histórico no se pierde mientras la siguiente llegue antes de 30 días, pero **las historias sí**).

No contiene secretos: la clave pública de Supabase ya está en `js/config.js` y la credencial secreta la añade sola el entorno.

````
Eres quien guarda las estadísticas de Instagram del Club Ciclista Monzón (cuenta hinacoclubciclistamonzon, id 17841403987707094) en la base de datos privada del club, para el informe de fin de temporada. Jordi, de la dirección, lo ha pedido. Responde siempre en castellano. No inventes ningún dato: todo sale de Windsor. NO guardes nunca nombres de usuario ni el texto de comentarios, solo números y el título de cada publicación. NO escribas ni muestres ninguna clave.

POR QUÉ: Windsor solo da los últimos 30 días y las historias solo duran 24 horas, así que cada ejecución guarda lo que ve; al repetirse una fila, la base fusiona los campos.

PASOS
1. Con ToolSearch carga las herramientas del MCP «Windsor_ai_for_Social_Media» (get_data). Si NO existen en esta sesión, termina con «ERROR: sin acceso a Windsor» y no hagas nada más. Todas las llamadas son con connector "instagram" y accounts ["17841403987707094"]. Si una devuelve status "pending", repite la MISMA llamada hasta que acabe. Si da error, reintenta UNA vez; si vuelve a fallar, anota «fallo en <consulta>: <motivo>» y sigue con las demás. Los campos de abajo son los únicos que funcionan con esta cuenta (no uses media_reposts ni campos «Deprecated»).
   A) DÍAS: date_preset "last_30d", fields ["date","views","reach_1d","follower_count_1d","profile_links_taps","total_interactions","accounts_engaged","likes","comments","shares","saves","reposts","replies"].
   B) DÍAS (seguidores/no seguidores): date_preset "last_30d", fields ["date","views_followers","views_non_followers","reach_followers","reach_non_followers","follows_and_unfollows"].
   C) PUBLICACIONES: date_preset "last_30d", fields ["media_id","timestamp","media_type","media_product_type","media_permalink","media_caption","media_views","media_reach","media_like_count","media_comments_count","media_saved","media_shares","media_engagement","media_profile_visits","media_follows","media_profile_activity"].
   D) HISTORIAS: date_preset "last_2d", fields ["story_id","story_timestamp","story_views","story_reach","story_replies","story_shares","story_interactions","story_taps_forward","story_taps_back","story_exits","story_swipe_forward"]. Es normal que no devuelva nada si no hay historias vivas.
   E) CUENTA: date_preset "last_3d", fields ["followers_count","follows_count","media_count"].
   F) AUDIENCIA (tres llamadas, date_preset "last_3d"): ["audience_gender_age_name","audience_gender_age_size"]; ["audience_country_name","audience_country_size"]; ["city","audience_city_size"].
2. Construye las filas con un script de Python (guarda el JSON en un fichero y NO lo imprimas entero). Una fila = {"kind","key","data"}. En «data» OMITE todo valor null o vacío. Si una misma clave sale en varias filas, fusiónalas quedándote con los valores no nulos.
   - kind "day", key = la fecha AAAA-MM-DD; data: views→views, reach_1d→reach, follower_count_1d→follows, profile_links_taps→taps, total_interactions→interactions, accounts_engaged→engaged, likes, comments, shares, saves, reposts, replies; de B: views_followers→views_f, views_non_followers→views_nf, reach_followers→reach_f, reach_non_followers→reach_nf, follows_and_unfollows→unfollows.
   - kind "media", key = media_id; data: timestamp→ts, media_type→type, media_product_type→product, media_permalink→link, media_caption→title (SOLO la primera línea del texto, máximo 90 caracteres; si se corta, termina en «…»), media_views→views, media_reach→reach, media_like_count→likes, media_comments_count→comments, media_saved→saves, media_shares→shares, media_engagement→engagement, media_profile_visits→visits, media_follows→follows, media_profile_activity→activity.
   - kind "story", key = story_id; data: story_timestamp→ts, story_views→views, story_reach→reach, story_replies→replies, story_shares→shares, story_interactions→interactions, story_taps_forward→taps_fwd, story_taps_back→taps_back, story_exits→exits, story_swipe_forward→swipe_fwd.
   - kind "account", key = la fecha de HOY en Madrid (`TZ=Europe/Madrid date +%F`); data: followers_count→followers, follows_count→following, media_count→media.
   - kind "audience", key = la fecha de HOY en Madrid; data: {"gender_age": {nombre: tamaño…}, "country": {código: tamaño…}, "city": {ciudad: tamaño…}} a partir de las tres llamadas de F.
3. Guarda en bloques de 200 filas como máximo con curl (el HTTPS pasa por un proxy que añade solo la cabecera secreta x-ig-token: NO la añadas tú ni la busques):
   curl -sS -X POST "https://cfecqvgzgsgekvskjjkj.supabase.co/rest/v1/rpc/ig_save" -H "apikey: sb_publishable_NUC7LWKuR2mqamubbKRk3Q_2xzlEu7h" -H "Authorization: Bearer sb_publishable_NUC7LWKuR2mqamubbKRk3Q_2xzlEu7h" -H "Content-Type: application/json" -d @bloque.json   donde bloque.json es {"p_rows":[…]}.
   La respuesta correcta es un número (filas guardadas). Si responde con «token_no_valido» o 401/403, espera 60 s y reintenta UNA vez; si sigue igual, termina con «ERROR: el guardado fue rechazado (credencial)» y no insistas. Cualquier otro error: anótalo.
4. RESUMEN final, solo estas líneas: filas guardadas por tipo (día, publicación, historia, cuenta, audiencia), seguidores actuales, y cualquier fallo anotado. Si todo fue bien, termina con «ESTADÍSTICAS GUARDADAS: ok». No hagas nada más (no publiques, no modifiques repositorios).
````
