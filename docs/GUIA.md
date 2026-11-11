# Guía paso a paso para montar la app (para Jordi)

No hace falta saber programar. Son unos 30 minutos, una sola vez. **Todo es gratis**: no hay que poner tarjeta en ningún paso. Si en algún momento una pantalla te pide pagar o meter una tarjeta, para y pregúntame.

> Los nombres de los botones de Supabase y GitHub cambian a veces. Si algo no coincide exactamente, busca el más parecido o mándame una captura.

---

## Paso 1 · Publicar la app (GitHub Pages)

La app son archivos que GitHub sirve gratis como página web. Esos archivos no contienen datos de los corredores.

1. Los cambios tienen que estar en la rama `main`. Si aún no lo están, pídeme que abra la *pull request* y pulsa **Merge** en GitHub.
2. En GitHub, abre el repositorio **Club** → **Settings** (arriba a la derecha) → **Pages** (menú de la izquierda).
3. En **Source** elige **Deploy from a branch**. En **Branch** elige `main` y la carpeta `/ (root)`, y pulsa **Save**.
4. Espera 1 o 2 minutos y recarga la página. Arriba aparecerá la dirección de la app:
   **https://jordixaviermp-commits.github.io/Club/**

Ábrela en el móvil: funciona ya en **modo demostración**, con datos de prueba que solo se guardan en tu móvil. Entra como dirección y prueba todas las pantallas.

## Paso 2 · Crear la base de datos (Supabase, en Frankfurt)

1. Entra en **https://supabase.com** → **Start your project** → **Continue with GitHub** (así no creas otra contraseña).
2. **New project**:
   - **Name**: `hinaco-prats`
   - **Database Password**: pulsa *Generate a password* y **guárdala** en tus notas. Casi nunca hará falta, pero no se puede recuperar.
   - **Region**: **Central EU (Frankfurt)**. Así los datos quedan dentro de la UE.
   - **Plan**: **Free**.
3. **Create new project** y espera 1 o 2 minutos.

## Paso 3 · Crear las tablas

1. En el menú de la izquierda: **SQL Editor** → **New query**.
2. En GitHub abre el archivo [`supabase/schema.sql`](../supabase/schema.sql), pulsa el botón **Copy raw file** (dos cuadraditos) y pégalo entero en el editor de Supabase.
3. Pulsa **Run**. Debe salir *Success. No rows returned*.

Si algún día te paso una versión nueva de este archivo, se repite este mismo paso. No borra datos.

## Paso 4 · Crear tu usuario de dirección

1. **Authentication** → **Users** → **Add user** → **Create new user**.
   - Tu email y una contraseña que recuerdes.
   - Marca **Auto Confirm User**.
2. Vuelve a **SQL Editor** → **New query**, pega esto **cambiando el email por el tuyo** y pulsa **Run**:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'TU-EMAIL@ejemplo.com';
   ```

   Debe salir *Success. 1 row*. Si sale *0 rows*, el email no coincide con el del usuario que creaste.
3. Cierra la puerta a que se registre cualquiera: **Authentication** → **Sign In / Providers** (o **Settings**) → desactiva **Allow new users to sign up** → **Save**.

## Paso 5 · Conectar la app con la base de datos

1. En Supabase pulsa el botón **Connect** de arriba, o ve a **Project Settings** → **API Keys**. Copia dos cosas:
   - **Project URL**: algo como `https://abcdefgh.supabase.co`
   - **Publishable key**: empieza por `sb_publishable_…`. Si solo ves claves antiguas, usa la **anon / public**, que empieza por `eyJ…`.
   - ⚠️ **Nunca** copies la **secret** ni la **service_role**.
2. En GitHub abre [`js/config.js`](../js/config.js) → icono del **lápiz** (Edit).
3. Pega cada valor entre las comillas:

   ```js
   SUPABASE_URL: 'https://abcdefgh.supabase.co',
   SUPABASE_KEY: 'sb_publishable_xxxxxxxx',
   ```

4. **Commit changes** → **Commit changes**. En 1 o 2 minutos la app ya usa los datos reales y desaparece la franja de «Modo demostración».

> La *publishable key* está pensada para ir en la página, así que no pasa nada porque se vea: las reglas del paso 3 impiden que nadie lea ni toque nada sin permiso.

## Paso 6 · Empezar a usarla

1. Abre la app en el móvil → **Acceso de la dirección** → tu email y contraseña.
2. Instálala: en **Android/Chrome**, menú ⋮ → **Instalar aplicación**. En **iPhone/Safari**, botón **Compartir** → **Añadir a pantalla de inicio**. En el iPhone tendrás que volver a entrar una vez dentro de la app instalada.
3. **Corredores** → **+ Añadir corredores** → pega la lista de los 26, uno por línea:

   ```
   Pere Soler, M40
   Anna Puig, Élite
   Jordi Vila
   ```

4. Envía a cada corredor su enlace: **⋯** junto a su nombre → **Enviar enlace por WhatsApp**.

### Cómo entran los corredores

- Cada corredor tiene un **enlace personal secreto**. Al abrirlo, la app le reconoce sin contraseña ni cuenta.
- Ve todas las inscripciones con quién va apuntado, y solo puede **apuntarse o borrarse a sí mismo** en carreras que aún no se han disputado. No ve resultados de otros ni puede tocar nada más.
- Si un enlace se filtra o cambia de móvil y lo pierde: **⋯** → **Crear enlace nuevo**. El anterior deja de funcionar al momento.
- iPhone: si instala la app en la pantalla de inicio y le pide el enlace, que lo pegue una vez en la casilla que aparece.

## Paso 7 · Pasar los datos del prototipo

- **Resultados**: exporta el CSV desde el prototipo (las columnas son las mismas) y en la app nueva ve a **Datos** → **Importar resultados desde CSV**. Antes de importar, la app te dice cuántas carreras va a crear y qué corredores no están en la plantilla, y te deja darlos de alta.
- **Plantilla**: copia la lista de nombres y pégala en **Corredores** → **Añadir**.
- **Inscripciones abiertas**: si son pocas, créalas a mano. Si me pasas el JSON del prototipo, preparo la importación.

## Mantenimiento

- **Copia de seguridad**: una vez al mes, **Datos** → **Descargar copia completa** y guarda el archivo en tu Drive o en tu correo. Con **Restaurar copia completa** se recupera todo.
- **Pausa de Supabase**: los proyectos gratuitos se pausan tras unos días sin uso. GitHub hace una consulta automática los lunes y los jueves para evitarlo (pestaña **Actions** → *Mantener Supabase despierto*). Si un día la app no carga datos:
  1. Entra en supabase.com, abre el proyecto y pulsa **Restore project**. No se pierde nada.
  2. GitHub apaga las tareas automáticas si el repositorio pasa 60 días sin cambios, y te avisa por email. Para reactivarla: **Actions** → *Mantener Supabase despierto* → **Enable workflow**.
- **Derechos de los corredores (RGPD)**: en **⋯** junto a cada corredor puedes **descargar sus datos** o **borrarle**. Al borrar, eliges si su nombre se queda en el historial de resultados o se sustituye por «Corredor eliminado».
- **Qué se guarda**: nombre, categoría, inscripciones y resultados. Nada más: ni email, ni teléfono, ni fecha de nacimiento.
