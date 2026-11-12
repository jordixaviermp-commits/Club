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
- Ve todas las inscripciones con quién va apuntado, y solo puede **apuntarse o borrarse a sí mismo**. También puede apuntarse a carreras ya disputadas (desde el 1 de enero del año anterior) si se olvidó de hacerlo; ver «Carreras olvidadas». No ve resultados de otros ni puede tocar nada más.
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
- **Bonos por carreras**: **Corredores** → **Bonos por carreras** muestra, para cada corredor, cuántas carreras lleva en la temporada, en qué tramo está según su contrato (nuevo y renovación: 12 → 50 €, 17 → 100 €, 22 → 150 €; renovación sin licencia: 12 → 100 €, 17 → 150 €, 22 → 200 €), cuántas le faltan para el siguiente y si está por debajo del mínimo (12). Si lo está, aparece la penalización según su contrato: 175 € nuevos, 100 € renovación y nada en renovación sin licencia. Las carreras por etapas cuentan un día cada una. Las bonificaciones empiezan en el mínimo. Los tramos (de nuevo y renovación, y aparte los de renovación sin licencia), el mínimo y las penalizaciones se cambian en «Condiciones del bono» de cada año. Cada corredor ve solo su propio bono en su pantalla.
- **Aviso del mínimo**: en «Tu bono» de cada corredor y arriba de tu pantalla de Bonos sale un recuadro rojo con el mínimo del contrato (12 carreras, editable en «Condiciones del bono»), cuántas faltan, la penalización que le toca según su contrato y los días que quedan de temporada. Cuando lo cumple, el recuadro pasa a verde. En la barra, la marca roja «mín» indica el mínimo.
- **Contrato de cada corredor**: en **Corredores**, pulsa **⋯** y luego **📄 Contrato y documentos**. Sube el PDF o una foto del contrato (máximo 5 MB; las fotos se reducen solas) e indica la temporada y un título. El corredor lo tendrá en la pestaña **Contrato** (abajo) para consultarlo todo el año, junto con su bono. Solo lo ven él y tú. En la lista de corredores, el 📄 junto al nombre indica que ya tiene el contrato del año subido. Los documentos no entran en la copia de seguridad en JSON: guarda también los originales.
- **Tipo de contrato**: en **Corredores**, debajo de cada nombre, junto a la categoría, elige **Nuevo**, **Renovación** o **Renovación sin licencia**. También se puede poner al pegar la lista: «Pere Soler, M40, renovación». Al usar «Renovar plantilla del año», las altas pasan a «Nuevo» y quien era «Nuevo» y sigue pasa a «Renovación», salvo que la lista diga otra cosa.
- **Buscar y añadir carreras (corredores)**: arriba de su pantalla, los corredores tienen una **lupa**. Al escribir el nombre o el pueblo les salen las carreras que ya están en el club, para apuntarse con un toque, y las de los calendarios de las federaciones. Si no está, pulsan **+ Añadir una carrera que no está**. Mientras escriben el nombre les vuelve a avisar de las parecidas, y al guardar quedan apuntados. Si ya hay una con el mismo nombre ese día, no se duplica. Las que añade un corredor salen en tu lista con «Añadida por…», y solo tú puedes corregirlas o borrarlas. Cada corredor puede añadir como mucho 10 al día.
- **Mis carreras (corredores)**: cada corredor tiene en su pantalla el desplegable **📋 Mis carreras**. Ahí ve, por temporada, las carreras en las que ha participado (con su puesto y sus podios de etapa) y cuántos días le cuentan para el bono. También ve aquellas a las que está apuntado y que ya se han disputado, pero que todavía no has pasado a resultados. Así cada uno puede comprobar que no falta ninguna.
- **Ver las carreras de un corredor (dirección)**: en **Corredores**, debajo de cada nombre, despliega **«Carreras 2026: …»**. Verás las carreras con resultado de ese año, las próximas a las que está apuntado y, en rojo, las ya disputadas que te faltan por pasar a resultados.
- **Ver la pantalla de un corredor**: en **Corredores**, pulsa **⋯** y luego **«Ver su pantalla (vista previa)»**. Verás exactamente lo que ve él, pero sin poder apuntar ni borrar nada. Si falta algún SQL por ejecutar, aparecerá un aviso.
- **Resumen del equipo (corredores)**: en su pantalla, los corredores tienen el botón **📊 Resumen del equipo**. Muestra lo mismo que tu pestaña Resumen: totales, carreras por modalidad, dónde se ha competido, participaciones por corredor y podios, con un selector de año. Su fila sale resaltada. No ven el bono de los demás, ni los contratos, ni los enlaces, y no pueden exportar.
- **Carreras de las federaciones (corredores)**: en su pantalla, al final, los corredores tienen **Ver carreras de las federaciones**. Es la misma lista que la tuya, con los mismos filtros. Si la carrera ya está en el club, les sale **Apuntarme**; si no, **Añadir y apuntarme**, con los datos ya rellenados.
- **Resumen anual (más visual)**: arriba, junto a los años, hay un selector de modalidad (**Todas**, Carretera, BTT, Gravel…), cada una con su color. Al elegir una, todo el resumen se filtra a lo suyo: sus números, sus corredores, sus podios y dónde se ha corrido. Después vienen: una cabecera de color con carreras, corredores, podios y victorias; las tarjetas de líderes (más carreras, más podios, más victorias); «Por modalidad» con barras (tocar una modalidad la elige); «Carreras por mes» con colores por modalidad; la clasificación de corredores, con una barra coloreada por modalidad y sus medallas; los podios, con una franja del color de la modalidad; y «Dónde se ha competido» con barras. Los corredores ven lo mismo en **Equipo**, con su fila resaltada.
- **Menú de los corredores**: abajo tienen cinco iconos. **Carreras** muestra la lista o el calendario, con la lupa y el botón **＋** para añadir. **Mi temporada** reúne su bono y «Mis carreras». **Contrato** tiene su contrato y su bono. **Equipo** es el resumen del equipo. **Federaciones** son las carreras de las federaciones.
- **Calendario: próximas y ya disputadas**: los días con inscripciones próximas salen rellenos del color de la modalidad. Los ya disputados salen solo con el borde discontinuo; incluyen las carreras con resultados y las inscripciones pendientes de pasar a resultados. El número en la esquina de cada día es cuántos del club van, o fueron. Debajo del calendario, las carreras se separan en «📅 Próximas» y «🏁 Ya disputadas».
- **Inscripciones (dirección)**: la lupa y el botón **＋** (nueva inscripción) están arriba. El menú **⋮** de la esquina lleva a las carreras y a los calendarios de las federaciones.
- **Corredores que editan sus carreras**: las carreras que añade un corredor llevan «Añadida por ti · ✏️ Editar o borrar». Puede corregir el nombre, las fechas, el lugar, la modalidad y las notas. Solo puede borrarla si no hay más compañeros apuntados. Los resultados y podios los sigues poniendo solo tú.
- **Resultado puesto por el corredor**: en una carrera ya disputada en la que estaba apuntado, el corredor pulsa **Poner mi resultado** y escribe su puesto, su categoría y, si es podio, el tipo. Puede hacerlo **una sola vez**: si se equivoca, lo corriges tú. Al pulsar «Pasar a resultados», esos puestos se copian solos. En la inscripción verás «📝 puso 2º» y, en la carrera, «📝 puesto por el corredor». Si la carrera ya estaba en resultados y no tenía su puesto, también puede ponerlo él desde «Carreras hechas».
- **Carreras olvidadas**: si un corredor hizo una carrera y no se apuntó, puede arreglarlo él mismo hasta el 1 de enero del año anterior (por ejemplo, en enero aún puede añadir las de diciembre). Con **＋** escribe el nombre. Si la carrera ya existe, le sale **«La hice: apuntarme»**, o **«La hice: añadirme»** si ya la pasaste a resultados. Si no existe, la añade con su fecha pasada. Después la app le lleva directamente a **Poner mi resultado**. En las carreras ya disputadas de la lista y del calendario también tiene esos botones. Si se apuntó por error y aún no ha puesto el resultado, puede pulsar «No fui: borrarme». Necesita el SQL `supabase/cambios/2026-11-12-carreras-olvidadas.sql`.
- **Carreras ya disputadas y bono**: una inscripción cuya fecha ha pasado cuenta para el bono y para el mínimo **en cuanto el corredor pone su puesto**, sin esperar a que tú la pases a resultados. Si se apuntó y no fue, no pone resultado y pulsa «No fui: borrarme». Si no lo hace, no le cuenta. Pasarlas a resultados es opcional: solo hace falta si quieres que salgan en el resumen del equipo y en los podios. Necesita el SQL `supabase/cambios/2026-11-12-cuentan-con-su-resultado.sql`.
- **Noticias para los corredores (dirección)**: en la campanita 🔔 de arriba a la derecha, pulsa **📣 Noticias para los corredores**. Escribe un título y el texto (por ejemplo «Quedada social del club», con la fecha y qué hay que hacer; los enlaces se pueden pulsar) y pulsa **Publicar**. Opcionalmente pon «Mostrar hasta» y la noticia desaparece sola ese día; sin fecha se queda hasta que la borres. Desde ahí puedes editar o borrar las publicadas.
- **Noticias (corredores)**: todos los corredores tienen una campanita arriba a la derecha. Si hay una noticia nueva, sale con un número rojo. Al abrirla ven las noticias, las nuevas marcadas como «Nueva». No suena el teléfono: la ven cuando abren la app. Lo que ya han abierto en ese móvil deja de contar como nuevo. Necesita el SQL `supabase/cambios/2026-11-12-noticias.sql`.
- **Carrera suspendida (cláusula 6)**: si una carrera a la que se apuntaron se suspende, abre su inscripción y marca **⛔ Carrera suspendida**. A los inscritos les cuenta para el mínimo de 12, pero **no para el bono**. Una suspendida no se pasa a resultados ni admite resultado. Necesita el SQL `supabase/cambios/2026-11-12-suspendida-1.sql` y después `…-2.sql`. La exención por lesión (cláusula 5) no está en la app: se gestiona en persona, escribiendo a la dirección.
- **Próximas carreras para redes (cláusula 8)**: en **Inscripciones → ⋮ → 📅 Próximas carreras (para redes)** (o desde la campanita) sale la lista de los próximos 7, 14 o 30 días, con quién va a cada una y sin las suspendidas. **Copiar texto** o **WhatsApp** dan un mensaje listo para el encargado de redes.
- **Saldo en Bonos**: cada corredor lleva «💶 Saldo» = bono − penalización (si la temporada acabara hoy): positivo, el club le debe; negativo, debe al club. Arriba sale el saldo total, y el CSV lleva la columna de saldo y la de suspendidas.
- **Tipo de carrera**: al crear o editar una carrera (tú o un corredor) se elige **Carrera normal**, **Campeonato** o **Puntuable de un circuito** (Copa, Open, Critérium…). En el circuito se escribe su nombre, siempre igual; la app sugiere los ya usados. La carrera lleva la etiqueta 🏆 Campeonato o 🔗 con el nombre del circuito. En un campeonato, los podios se guardan como podios de campeonato.
- **Podio en la general final de un circuito (cláusula 9)**: suma **+4 carreras para el bono** (no para el mínimo de 12). El corredor lo comunica en su pestaña **Contrato → 🏆 General final de un circuito** y queda «⏳ Pendiente» hasta que tú lo confirmes. También puedes añadirlo tú en **Bonos → 🏆 Podios en la general final de un circuito**. En la barra del bono, las carreras extra salen en dorado con el texto «🏆 +4 por podio de circuito». El número de carreras extra se cambia en «Condiciones del bono».
- **Campanita 🔔 (dirección)**: arriba a la derecha, con el número de cosas pendientes. Dentro salen los podios de circuito por confirmar (esto sí hay que revisarlo, porque da +4 al bono) y los corredores sin tipo de contrato. Las carreras que añaden los corredores, también las olvidadas de fechas pasadas, **no hay que revisarlas ni aprobarlas**: cuentan solas.
- Necesita el SQL `supabase/cambios/2026-11-12-circuitos-1.sql` y después `supabase/cambios/2026-11-12-circuitos-2.sql`.
- **Mi temporada**: arriba salen tres contadores (✅ hechas, 🏁 pendientes, 📅 próximas) y debajo tres bloques de colores distintos. **Mis próximas inscripciones**, en azul, indica cuántos días faltan. **Ya corridas, pendientes de resultado** va con borde discontinuo. **Carreras hechas**, en verde, muestra el puesto.
- **Lupa de la dirección**: en Inscripciones, la lupa filtra la lista. Al crear una inscripción nueva, te avisa si ya existe una parecida.
- **Carreras de las federaciones**: en **Inscripciones** → **Carreras de las federaciones** salen las próximas carreras de la Federació Catalana y de la Federación Aragonesa, con filtros por federación y modalidad. **Crear inscripción** la añade con nombre, fecha y lugar ya rellenados. GitHub las vuelve a leer los lunes y los jueves (pestaña **Actions** → *Actualizar calendarios de las federaciones*; se puede lanzar a mano con **Run workflow**). Si una federación cambia su web y deja de leerse, aparecerá un aviso en esa pantalla: pídeme que lo arregle. Mientras tanto, los botones de enlace directo siguen funcionando.
- **Enviar los enlaces de golpe**: **Corredores** → **Copiar todos los enlaces** copia una lista «Nombre: enlace» para que la pegues en tus notas y se la envíes a cada uno.
- **Copia de seguridad**: una vez al mes, **Datos** → **Descargar copia completa** y guarda el archivo en tu Drive o en tu correo. Con **Restaurar copia completa** se recupera todo.
- **Pausa de Supabase**: los proyectos gratuitos se pausan tras unos días sin uso. GitHub hace una consulta automática los lunes y los jueves para evitarlo (pestaña **Actions** → *Mantener Supabase despierto*). Si un día la app no carga datos:
  1. Entra en supabase.com, abre el proyecto y pulsa **Restore project**. No se pierde nada.
  2. GitHub apaga las tareas automáticas si el repositorio pasa 60 días sin cambios, y te avisa por email. Para reactivarla: **Actions** → *Mantener Supabase despierto* → **Enable workflow**.
- **Derechos de los corredores (RGPD)**: en **⋯** junto a cada corredor puedes **descargar sus datos** o **borrarle**. Al borrar, eliges si su nombre se queda en el historial de resultados o se sustituye por «Corredor eliminado».
- **Qué se guarda**: nombre, categoría, inscripciones y resultados. Nada más: ni email, ni teléfono, ni fecha de nacimiento.
