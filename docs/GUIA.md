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
   - **Name**: `cc-monzon`
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

- **Cambio de temporada (una vez al año)**: **Corredores** → **↻ Renovar plantilla del año** → pega la lista completa del nuevo año → **Revisar cambios**. Verás quién sigue, quién entra y quién sale antes de aplicar nada. Quien sigue conserva su enlace. A quien entra le envías el suyo. Quien sale deja de tener acceso, pero sus resultados se quedan en el historial.
- **Carreras de varios días (por etapas)**: al crear o editar una inscripción o una carrera, marca **Carrera de varios días** y pon el **último día**. En el calendario salen marcados todos los días.
- **Puestos de cada etapa**: en la ficha de la carrera, en **Etapas**, pulsa **+** tantas veces como etapas tenga (puedes renombrarlas: «Prólogo», «CRI»…). Cada corredor tendrá un hueco por etapa y el de la **General**. Los podios de etapa cuentan en el resumen del año como podios y victorias, en su propia fila «Etapa».
- **Cuando te paso un `schema.sql` nuevo**: repite el paso 3 (SQL Editor → New query → pegar → Run). No borra datos. Si desde el móvil da un error raro (por ejemplo «unterminated dollar-quoted string»), es que el texto se ha copiado cortado. En ese caso, usa el archivo corto de la carpeta `supabase/cambios/` que te indique.
- **Bonos por carreras**: **Corredores** → **Bonos por carreras** muestra, para cada corredor, cuántas carreras lleva en la temporada, en qué tramo está (12 → 150 €, 17 → 200 €, 22 → 250 €), cuántas le faltan para el siguiente y si está por debajo del mínimo (12). Si lo está, aparece la penalización según su contrato: 175 € nuevos, 100 € renovación y nada en renovación sin licencia. Las carreras por etapas cuentan un día cada una. Los tramos, el mínimo y las penalizaciones se cambian en «Condiciones del bono» de cada año. Cada corredor ve solo su propio bono en su pantalla.
- **Tipo de contrato**: en **Corredores**, debajo de cada nombre, junto a la categoría, elige **Nuevo**, **Renovación** o **Renovación sin licencia**. También se puede poner al pegar la lista: «Pere Soler, M40, renovación». Al usar «Renovar plantilla del año», las altas pasan a «Nuevo» y quien era «Nuevo» y sigue pasa a «Renovación», salvo que la lista diga otra cosa.
- **Buscar y añadir carreras (corredores)**: arriba de su pantalla, los corredores tienen una **lupa**. Al escribir el nombre o el pueblo les salen las carreras que ya están en el club, para apuntarse con un toque, y las de los calendarios de las federaciones. Si no está, pulsan **+ Añadir una carrera que no está**. Mientras escriben el nombre les vuelve a avisar de las parecidas, y al guardar quedan apuntados. Si ya hay una con el mismo nombre ese día, no se duplica. Las que añade un corredor salen en tu lista con «Añadida por…», y solo tú puedes corregirlas o borrarlas. Cada corredor puede añadir como mucho 10 al día.
- **Mis carreras (corredores)**: cada corredor tiene en su pantalla el desplegable **📋 Mis carreras**. Ahí ve, por temporada, las carreras en las que ha participado (con su puesto y sus podios de etapa) y cuántos días le cuentan para el bono. También ve aquellas a las que está apuntado y que ya se han disputado, pero que todavía no has pasado a resultados. Así cada uno puede comprobar que no falta ninguna.
- **Ver las carreras de un corredor (dirección)**: en **Corredores**, debajo de cada nombre, despliega **«Carreras 2026: …»**. Verás las carreras con resultado de ese año, las próximas a las que está apuntado y, en rojo, las ya disputadas que te faltan por pasar a resultados.
- **Ver la pantalla de un corredor**: en **Corredores**, pulsa **⋯** y luego **«Ver su pantalla (vista previa)»**. Verás exactamente lo que ve él, pero sin poder apuntar ni borrar nada. Si falta algún SQL por ejecutar, aparecerá un aviso.
- **Resumen del equipo (corredores)**: en su pantalla, los corredores tienen el botón **📊 Resumen del equipo**. Muestra lo mismo que tu pestaña Resumen: totales, carreras por modalidad, dónde se ha competido, participaciones por corredor y podios, con un selector de año. Su fila sale resaltada. No ven el bono de los demás, ni los contratos, ni los enlaces, y no pueden exportar.
- **Carreras de las federaciones (corredores)**: en su pantalla, al final, los corredores tienen **Ver carreras de las federaciones**. Es la misma lista que la tuya, con los mismos filtros. Si la carrera ya está en el club, les sale **Apuntarme**; si no, **Añadir y apuntarme**, con los datos ya rellenados.
- **Lupa de la dirección**: en Inscripciones, la lupa filtra la lista. Al crear una inscripción nueva, te avisa si ya existe una parecida.
- **Carreras de las federaciones**: en **Inscripciones** → **Carreras de las federaciones** salen las próximas carreras de la Federació Catalana y de la Federación Aragonesa, con filtros por federación y modalidad. **Crear inscripción** la añade con nombre, fecha y lugar ya rellenados. GitHub las vuelve a leer los lunes y los jueves (pestaña **Actions** → *Actualizar calendarios de las federaciones*; se puede lanzar a mano con **Run workflow**). Si una federación cambia su web y deja de leerse, aparecerá un aviso en esa pantalla: pídeme que lo arregle. Mientras tanto, los botones de enlace directo siguen funcionando.
- **Enviar los enlaces de golpe**: **Corredores** → **Copiar todos los enlaces** copia una lista «Nombre: enlace» para que la pegues en tus notas y se la envíes a cada uno.
- **Copia de seguridad**: una vez al mes, **Datos** → **Descargar copia completa** y guarda el archivo en tu Drive o en tu correo. Con **Restaurar copia completa** se recupera todo.
- **Pausa de Supabase**: los proyectos gratuitos se pausan tras unos días sin uso. GitHub hace una consulta automática los lunes y los jueves para evitarlo (pestaña **Actions** → *Mantener Supabase despierto*). Si un día la app no carga datos:
  1. Entra en supabase.com, abre el proyecto y pulsa **Restore project**. No se pierde nada.
  2. GitHub apaga las tareas automáticas si el repositorio pasa 60 días sin cambios, y te avisa por email. Para reactivarla: **Actions** → *Mantener Supabase despierto* → **Enable workflow**.
- **Derechos de los corredores (RGPD)**: en **⋯** junto a cada corredor puedes **descargar sus datos** o **borrarle**. Al borrar, eliges si su nombre se queda en el historial de resultados o se sustituye por «Corredor eliminado».
- **Qué se guarda**: nombre, categoría, inscripciones y resultados. Nada más: ni email, ni teléfono, ni fecha de nacimiento.
