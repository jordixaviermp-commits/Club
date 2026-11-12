-- =====================================================================
--  App de carreras del Club Ciclista Monzón · Base de datos (Supabase)
--  Se pega entero en Supabase > SQL Editor > New query > Run.
--  Se puede volver a ejecutar sin perder datos (crea solo lo que falta
--  y actualiza las funciones).
-- =====================================================================

-- ---------- Tablas ----------------------------------------------------

create table if not exists public.runners (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  category    text check (category in ('Sub-23','Élite','M30','M40','M50','M60')),
  code        text not null unique check (length(code) >= 10),  -- enlace personal
  created_at  timestamptz default now()
);

create table if not exists public.registrations (          -- inscripciones (carreras futuras)
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  date        date not null,
  place       text,
  province    text,
  country     text default 'España',
  modality    text not null default 'Carretera'
              check (modality in ('Carretera','BTT','Gravel','Ciclocross','Pista','Otra')),
  notes       text,
  created_at  timestamptz default now()
);

create table if not exists public.registration_entries (
  registration_id uuid not null references public.registrations(id) on delete cascade,
  runner_id       uuid not null references public.runners(id) on delete cascade,
  category        text check (category in ('Sub-23','Élite','M30','M40','M50','M60')),
  created_at      timestamptz default now(),
  primary key (registration_id, runner_id)
);

create table if not exists public.races (                  -- carreras con resultados
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  date        date not null,
  place       text,
  province    text,
  country     text default 'España',
  modality    text not null default 'Carretera'
              check (modality in ('Carretera','BTT','Gravel','Ciclocross','Pista','Otra')),
  notes       text,
  created_at  timestamptz default now()
);

create table if not exists public.results (                -- participaciones
  id           uuid primary key default gen_random_uuid(),
  race_id      uuid not null references public.races(id) on delete cascade,
  runner_id    uuid references public.runners(id) on delete set null,  -- borrar corredor no borra historial
  runner_name  text not null,                                          -- nombre guardado en cada participación
  category     text check (category in ('Sub-23','Élite','M30','M40','M50','M60')),
  position     integer check (position > 0),                           -- puesto en su categoría
  podium_type  text not null default 'suelta' check (podium_type in ('suelta','general','campeonato')),
  unique (race_id, runner_id)                                          -- un solo puesto por carrera
);

create index if not exists results_race_idx on public.results(race_id);
create index if not exists results_runner_idx on public.results(runner_id);
create index if not exists entries_runner_idx on public.registration_entries(runner_id);

-- Inscripciones creadas por un corredor (null = creada por la dirección).
alter table public.registrations add column if not exists created_by uuid references public.runners(id) on delete set null;

-- Resultado puesto por el propio corredor (una sola vez; después solo lo cambia la dirección).
alter table public.registration_entries add column if not exists self_position integer;
alter table public.registration_entries add column if not exists self_podium_type text;
alter table public.registration_entries add column if not exists self_reported_at timestamptz;
alter table public.registration_entries drop constraint if exists entries_self_check;
alter table public.registration_entries add constraint entries_self_check check (
  (self_position is null or self_position > 0) and (self_podium_type is null or self_podium_type in ('suelta','general','campeonato')));
alter table public.results add column if not exists self_reported boolean not null default false;

-- Documentos de cada corredor (p. ej. su contrato de la temporada). Solo los ven él y la dirección.
create table if not exists public.runner_documents (
  id         uuid primary key default gen_random_uuid(),
  runner_id  uuid not null references public.runners(id) on delete cascade,
  year       integer not null,
  title      text not null default 'Contrato',
  filename   text not null,
  mime       text not null check (mime in ('application/pdf','image/jpeg','image/png','image/webp')),
  size       integer not null check (size > 0 and size <= 5000000),
  data       bytea not null,
  created_at timestamptz default now()
);
create index if not exists runner_documents_runner_idx on public.runner_documents(runner_id);
alter table public.runner_documents enable row level security;  -- permisos: ver «Seguridad» más abajo

-- Tipo de contrato del corredor en la temporada actual.
alter table public.runners add column if not exists contract text;
alter table public.runners drop constraint if exists runners_contract_check;
alter table public.runners add constraint runners_contract_check
  check (contract is null or contract in ('nuevo','renovacion','renovacion_sin_licencia'));

-- Carreras de varios días (por etapas): último día. Vacío = carrera de un solo día.
alter table public.registrations add column if not exists end_date date;
alter table public.races         add column if not exists end_date date;
alter table public.registrations drop constraint if exists registrations_end_date_check;
alter table public.registrations add constraint registrations_end_date_check check (end_date is null or end_date > date);
alter table public.races drop constraint if exists races_end_date_check;
alter table public.races add constraint races_end_date_check check (end_date is null or end_date > date);

-- Carreras por etapas dentro de una misma carrera:
--   races.stages            nombres de las etapas, p. ej. ["Prólogo","Etapa 1","Etapa 2"] (null = sin etapas)
--   results.stage_positions puesto en cada etapa, en el mismo orden, p. ej. [3,null,1]
--   results.position        sigue siendo el puesto de la general (o de la carrera, si no hay etapas)
alter table public.races   add column if not exists stages jsonb;
alter table public.results add column if not exists stage_positions jsonb;
alter table public.races drop constraint if exists races_stages_check;
alter table public.races add constraint races_stages_check check (stages is null or jsonb_typeof(stages) = 'array');
alter table public.results drop constraint if exists results_stage_positions_check;
alter table public.results add constraint results_stage_positions_check check (stage_positions is null or jsonb_typeof(stage_positions) = 'array');

-- Carrera suspendida (cláusula SEXTA del contrato): cuenta para el mínimo de participaciones, pero no para el bono.
alter table public.registrations add column if not exists suspended boolean not null default false;

-- Tipo de carrera: suelta, campeonato o puntuable de un circuito (Copa, Open, Critérium…; `circuit` = su nombre).
alter table public.registrations add column if not exists race_type text not null default 'suelta';
alter table public.registrations add column if not exists circuit text;
alter table public.races         add column if not exists race_type text not null default 'suelta';
alter table public.races         add column if not exists circuit text;
alter table public.registrations drop constraint if exists registrations_race_type_check;
alter table public.registrations add constraint registrations_race_type_check check (race_type in ('suelta','campeonato','circuito'));
alter table public.races drop constraint if exists races_race_type_check;
alter table public.races add constraint races_race_type_check check (race_type in ('suelta','campeonato','circuito'));

-- Podios en la clasificación general FINAL de un circuito completo (cláusula NOVENA del contrato):
-- cada uno confirmado suma carreras extra para el bono (no para el mínimo). El corredor lo comunica
-- («pendiente») y la dirección lo confirma.
create table if not exists public.circuit_podiums (
  id         uuid primary key default gen_random_uuid(),
  runner_id  uuid not null references public.runners(id) on delete cascade,
  year       integer not null check (year between 2000 and 2100),
  circuit    text not null check (length(btrim(circuit)) between 3 and 120),
  position   integer not null check (position between 1 and 3),
  scope      text not null default 'categoria' check (scope in ('absoluta','categoria')),
  status     text not null default 'pendiente' check (status in ('pendiente','confirmado')),
  by_runner  boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists circuit_podiums_runner_idx on public.circuit_podiums(runner_id);
alter table public.circuit_podiums enable row level security;  -- permisos: ver «Seguridad» más abajo

-- Noticias de la dirección para los corredores (quedadas, pedidos de ropa…). Las escribe la dirección;
-- cada corredor las ve (solo lectura) con la campanita. `expires_at` = último día en que se muestra (vacío = siempre).
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(btrim(title)) between 3 and 120),
  body       text not null default '' check (length(body) <= 4000),
  expires_at date,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;  -- permisos: ver «Seguridad» más abajo

-- Ajustes del club (p. ej. los bonos por temporada). Solo los ve y cambia la dirección.
--   key 'bonus' → {"2026": {"tiers":[{"races":12,"amount":150},…], "minimum":12,
--                           "penalty":{"renovado":100,"nuevo":175}, "nuevos":[<runner_id>,…]}}
create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);

create table if not exists public.admins (                 -- quién es dirección
  user_id uuid primary key
);

-- ---------- Seguridad: solo dirección toca las tablas ------------------

alter table public.runners              enable row level security;
alter table public.registrations        enable row level security;
alter table public.registration_entries enable row level security;
alter table public.races                enable row level security;
alter table public.results              enable row level security;
alter table public.admins               enable row level security;
alter table public.settings             enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

do $$
declare t text;
begin
  foreach t in array array['runners','registrations','registration_entries','races','results','settings','runner_documents','circuit_podiums','announcements'] loop
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

revoke all on public.runners, public.registrations, public.registration_entries,
              public.races, public.results, public.admins, public.settings, public.runner_documents, public.circuit_podiums, public.announcements from anon, public;
grant select, insert, update, delete on public.runners, public.registrations,
              public.registration_entries, public.races, public.results, public.settings, public.runner_documents, public.circuit_podiums, public.announcements to authenticated;
revoke all on public.admins from authenticated;

-- ---------- Funciones de dirección (respetan la seguridad de arriba) ---

create or replace function public.require_admin() returns void
language plpgsql stable set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'solo_direccion' using errcode = '42501';
  end if;
end $$;

-- Guarda una inscripción y su lista de inscritos de una vez.
create or replace function public.save_registration(p_reg jsonb, p_entries jsonb)
returns uuid language plpgsql set search_path = public as $$
declare v_id uuid := nullif(p_reg->>'id','')::uuid;
begin
  perform public.require_admin();
  if v_id is null then
    insert into registrations (name, date, end_date, place, province, country, modality, notes)
    values (btrim(p_reg->>'name'), (p_reg->>'date')::date,
            nullif(nullif(p_reg->>'end_date',''), p_reg->>'date')::date, nullif(btrim(p_reg->>'place'),''),
            nullif(btrim(p_reg->>'province'),''), nullif(btrim(p_reg->>'country'),''),
            coalesce(nullif(p_reg->>'modality',''),'Carretera'), nullif(btrim(p_reg->>'notes'),''))
    returning id into v_id;
  else
    update registrations set name = btrim(p_reg->>'name'), date = (p_reg->>'date')::date,
      end_date = nullif(nullif(p_reg->>'end_date',''), p_reg->>'date')::date,
      place = nullif(btrim(p_reg->>'place'),''), province = nullif(btrim(p_reg->>'province'),''),
      country = nullif(btrim(p_reg->>'country'),''),
      modality = coalesce(nullif(p_reg->>'modality',''),'Carretera'),
      notes = nullif(btrim(p_reg->>'notes'),'')
    where id = v_id;
    if not found then raise exception 'no_existe'; end if;
  end if;

  delete from registration_entries e
   where e.registration_id = v_id
     and e.runner_id not in (select (x->>'runner_id')::uuid from jsonb_array_elements(coalesce(p_entries,'[]')) x);
  insert into registration_entries (registration_id, runner_id, category)
  select v_id, (x->>'runner_id')::uuid, nullif(x->>'category','')
    from jsonb_array_elements(coalesce(p_entries,'[]')) x
  on conflict (registration_id, runner_id) do update set category = excluded.category;
  return v_id;
end $$;

-- Guarda una carrera y sus participantes de una vez.
create or replace function public.save_race(p_race jsonb, p_results jsonb)
returns uuid language plpgsql set search_path = public as $$
declare v_id uuid := nullif(p_race->>'id','')::uuid;
begin
  perform public.require_admin();
  if v_id is null then
    insert into races (name, date, end_date, place, province, country, modality, notes, stages)
    values (btrim(p_race->>'name'), (p_race->>'date')::date,
            nullif(nullif(p_race->>'end_date',''), p_race->>'date')::date, nullif(btrim(p_race->>'place'),''),
            nullif(btrim(p_race->>'province'),''), nullif(btrim(p_race->>'country'),''),
            coalesce(nullif(p_race->>'modality',''),'Carretera'), nullif(btrim(p_race->>'notes'),''),
            nullif(nullif(p_race->'stages', 'null'::jsonb), '[]'::jsonb))
    returning id into v_id;
  else
    update races set name = btrim(p_race->>'name'), date = (p_race->>'date')::date,
      end_date = nullif(nullif(p_race->>'end_date',''), p_race->>'date')::date,
      place = nullif(btrim(p_race->>'place'),''), province = nullif(btrim(p_race->>'province'),''),
      country = nullif(btrim(p_race->>'country'),''),
      modality = coalesce(nullif(p_race->>'modality',''),'Carretera'),
      notes = nullif(btrim(p_race->>'notes'),''),
      stages = nullif(nullif(p_race->'stages', 'null'::jsonb), '[]'::jsonb)
    where id = v_id;
    if not found then raise exception 'no_existe'; end if;
  end if;

  delete from results where race_id = v_id;
  insert into results (race_id, runner_id, runner_name, category, position, podium_type, stage_positions, self_reported)
  select v_id, nullif(x->>'runner_id','')::uuid, btrim(x->>'runner_name'), nullif(x->>'category',''),
         nullif(x->>'position','')::int, coalesce(nullif(x->>'podium_type',''),'suelta'),
         nullif(nullif(x->'stage_positions', 'null'::jsonb), '[]'::jsonb), coalesce((x->>'self_reported')::boolean, false)
    from jsonb_array_elements(coalesce(p_results,'[]')) x;
  return v_id;
end $$;

-- «Pasar a resultados»: crea la carrera con los inscritos y borra la inscripción.
create or replace function public.promote_registration(p_id uuid)
returns uuid language plpgsql set search_path = public as $$
declare v_race uuid;
begin
  perform public.require_admin();
  if exists (select 1 from registrations where id = p_id and suspended) then raise exception 'carrera_suspendida'; end if;
  insert into races (name, date, end_date, place, province, country, modality, notes, race_type, circuit)
  select name, date, end_date, place, province, country, modality, notes, race_type, circuit from registrations where id = p_id
  returning id into v_race;
  if v_race is null then raise exception 'no_existe'; end if;
  insert into results (race_id, runner_id, runner_name, category, position, podium_type, self_reported)
  select v_race, e.runner_id, r.name, e.category, e.self_position,
         case when e.self_position between 1 and 3 then coalesce(e.self_podium_type, 'suelta') else 'suelta' end,
         e.self_position is not null
    from registration_entries e join runners r on r.id = e.runner_id
   where e.registration_id = p_id;
  delete from registrations where id = p_id;
  return v_race;
end $$;

-- Borrar un corredor. Su historial se conserva con su nombre;
-- con p_anonymize = true el nombre del historial se sustituye (derecho de supresión).
create or replace function public.delete_runner(p_id uuid, p_anonymize boolean)
returns void language plpgsql set search_path = public as $$
begin
  perform public.require_admin();
  if p_anonymize then
    update results set runner_name = 'Corredor eliminado' where runner_id = p_id;
  end if;
  delete from runners where id = p_id;
end $$;

-- Restaurar una copia de seguridad completa (sustituye todos los datos).
create or replace function public.import_backup(p jsonb)
returns void language plpgsql set search_path = public as $$
begin
  perform public.require_admin();
  delete from results where true;
  delete from races where true;
  delete from registration_entries where true;
  delete from registrations where true;
  delete from runners where true;
  insert into runners      select * from jsonb_populate_recordset(null::runners,      coalesce(p->'runners','[]'));
  insert into registrations select * from jsonb_populate_recordset(null::registrations, coalesce(p->'registrations','[]'));
  insert into registration_entries select * from jsonb_populate_recordset(null::registration_entries, coalesce(p->'registration_entries','[]'));
  insert into races        select * from jsonb_populate_recordset(null::races,        coalesce(p->'races','[]'));
  insert into results      select * from jsonb_populate_recordset(null::results,      coalesce(p->'results','[]'));
  if p ? 'circuit_podiums' then
    insert into circuit_podiums select * from jsonb_populate_recordset(null::circuit_podiums, coalesce(p->'circuit_podiums','[]'));
  end if;
  if p ? 'settings' then  -- las copias antiguas no traen ajustes: entonces se conservan los actuales
    delete from settings where true;
    insert into settings select * from jsonb_populate_recordset(null::settings, coalesce(p->'settings','[]'));
  end if;
end $$;

-- ---------- Funciones de corredores (entran con su enlace personal) ----
-- Solo ven inscripciones (nombre y categoría de los inscritos) y solo
-- pueden apuntarse o borrarse a sí mismos en carreras de hoy en adelante.

create or replace function public.runner_view(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me runners; v_year int := extract(year from current_date)::int; v_cfg jsonb;
begin
  select * into me from runners where code = p_code;
  if not found then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  select value -> v_year::text into v_cfg from settings where key = 'bonus';
  return jsonb_build_object(
    'me', jsonb_build_object('id', me.id, 'name', me.name, 'category', me.category),
    'today', current_date,
    -- Su bono de la temporada: solo lo suyo (sin la lista de quién es nuevo).
    -- Cada día de competición cuenta como una carrera (una de 3 días = 3).
    'bonus', jsonb_build_object(
      'year', v_year,
      -- Cuentan las carreras con resultados y también las inscripciones ya disputadas en las que el propio
      -- corredor ha puesto su puesto (aunque la dirección aún no las haya pasado a resultados).
      'done', (select coalesce(sum(coalesce(r.end_date - r.date, 0) + 1), 0)
                 from results x join races r on r.id = x.race_id
                where x.runner_id = me.id and extract(year from r.date) = v_year)
            + (select coalesce(sum(coalesce(g.end_date - g.date, 0) + 1), 0)
                 from registration_entries e join registrations g on g.id = e.registration_id
                where e.runner_id = me.id and e.self_position is not null and not g.suspended and extract(year from g.date) = v_year),
      'planned', (select coalesce(sum(coalesce(g.end_date - g.date, 0) + 1), 0)
                    from registration_entries e join registrations g on g.id = e.registration_id
                   where e.runner_id = me.id and e.self_position is null and not g.suspended and extract(year from g.date) = v_year),
      -- carreras suspendidas en las que estaba apuntado: cuentan para el mínimo, no para el bono
      'suspended', (select coalesce(sum(coalesce(g.end_date - g.date, 0) + 1), 0)
                      from registration_entries e join registrations g on g.id = e.registration_id
                     where e.runner_id = me.id and g.suspended and extract(year from g.date) = v_year),
      -- carreras extra por podios confirmados en la general final de un circuito (solo para el bono)
      'extra', (select count(*) from circuit_podiums c where c.runner_id = me.id and c.year = v_year and c.status = 'confirmado')
               * coalesce((v_cfg ->> 'circuitExtra')::int, 4),
      'config', v_cfg - 'nuevos',
      'contract', me.contract,
      'nuevo', coalesce(me.contract = 'nuevo' or (me.contract is null and v_cfg -> 'nuevos' ? me.id::text), false)),
    'circuits', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'year', c.year, 'circuit', c.circuit, 'position', c.position,
                                   'scope', c.scope, 'status', c.status, 'by_runner', c.by_runner) order by c.year desc, c.created_at)
                            from circuit_podiums c where c.runner_id = me.id), '[]'::jsonb),
    -- Sus propias carreras con resultados (todas las temporadas), para su lista «Mis carreras».
    'my_results', coalesce((
      select jsonb_agg(jsonb_build_object(
               'race_id', r.id, 'name', r.name, 'date', r.date, 'end_date', r.end_date, 'place', r.place,
               'province', r.province, 'country', r.country, 'modality', r.modality, 'stages', r.stages,
               'race_type', r.race_type, 'circuit', r.circuit,
               'category', x.category, 'position', x.position, 'podium_type', x.podium_type,
               'stage_positions', x.stage_positions, 'self_reported', x.self_reported)
             order by r.date desc, r.name)
        from results x join races r on r.id = x.race_id
       where x.runner_id = me.id), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'name', g.name, 'date', g.date, 'end_date', g.end_date, 'place', g.place,
               'mine_created', g.created_by = me.id, 'race_type', g.race_type, 'circuit', g.circuit, 'suspended', g.suspended,
               'my_result', (select jsonb_build_object('position', e.self_position, 'podium_type', e.self_podium_type)
                               from registration_entries e where e.registration_id = g.id and e.runner_id = me.id and e.self_position is not null),
               'province', g.province, 'country', g.country, 'modality', g.modality, 'notes', g.notes,
               'entries', coalesce((
                  select jsonb_agg(jsonb_build_object('runner_id', r.id, 'name', r.name, 'category', e.category)
                                   order by r.name)
                    from registration_entries e join runners r on r.id = e.runner_id
                   where e.registration_id = g.id), '[]'::jsonb))
             order by g.date, g.name)
        from registrations g), '[]'::jsonb));
end $$;

-- Resumen del equipo para los corredores: todas las carreras con resultados y la plantilla (solo nombres).
-- No incluye enlaces, contratos, bonos ni notas.
create or replace function public.runner_team(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from runners where code = p_code) then
    raise exception 'enlace_no_valido' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'runners', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from runners), '[]'::jsonb),
    'races', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'name', r.name, 'date', r.date, 'end_date', r.end_date, 'place', r.place,
               'province', r.province, 'country', r.country, 'modality', r.modality, 'stages', r.stages,
               'race_type', r.race_type, 'circuit', r.circuit,
               'results', coalesce((
                  select jsonb_agg(jsonb_build_object('runner_id', x.runner_id, 'runner_name', x.runner_name, 'category', x.category,
                                   'position', x.position, 'podium_type', x.podium_type, 'stage_positions', x.stage_positions))
                    from results x where x.race_id = r.id), '[]'::jsonb))
             order by r.date)
        from races r), '[]'::jsonb));
end $$;

create or replace function public.runner_join(p_code text, p_registration uuid, p_category text)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  -- también carreras ya pasadas (desde el 1 de enero del año anterior): «la hice y no me apunté»
  if not exists (select 1 from registrations where id = p_registration and date >= make_date(extract(year from current_date)::int - 1, 1, 1)) then
    raise exception 'inscripcion_cerrada';
  end if;
  insert into registration_entries (registration_id, runner_id, category)
  values (p_registration, v_runner, nullif(p_category,''))
  on conflict (registration_id, runner_id) do update set category = excluded.category;
end $$;

-- Un corredor añade una carrera que no estaba y queda apuntado.
-- Si ya hay una con el mismo nombre el mismo día, no se duplica: se le apunta a esa.
-- Si es una carrera ya pasada que la dirección ya pasó a resultados (mismo nombre y día), se le añade a esa.
-- Límites contra errores o abusos: nombre de 3 a 120 caracteres, fecha desde el 1 de enero del año anterior
-- (para las carreras que se olvidó de apuntar) hasta dentro de dos años,
-- como mucho 10 carreras creadas por corredor y día. Solo la dirección puede editarlas o borrarlas.
create or replace function public.runner_create_registration(p_code text, p_reg jsonb, p_category text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_runner uuid; v_id uuid;
  v_name text := btrim(regexp_replace(coalesce(p_reg->>'name',''), '\s+', ' ', 'g'));
  v_date date := nullif(p_reg->>'date','')::date;
  v_end  date := nullif(nullif(p_reg->>'end_date',''), p_reg->>'date')::date;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'nombre_no_valido'; end if;
  if v_date is null or v_date < make_date(extract(year from current_date)::int - 1, 1, 1) or v_date > current_date + 730 then raise exception 'fecha_no_valida'; end if;
  if v_end is not null and (v_end < v_date or v_end > v_date + 30) then raise exception 'fecha_no_valida'; end if;
  if (select count(*) from registrations where created_by = v_runner and created_at > now() - interval '1 day') >= 10 then
    raise exception 'demasiadas_carreras';
  end if;
  if v_date < current_date then
    select id into v_id from races where date = v_date and lower(name) = lower(v_name) limit 1;
    if v_id is not null then
      insert into results (race_id, runner_id, runner_name, category)
      select v_id, v_runner, name, nullif(p_category, '') from runners where id = v_runner
      on conflict (race_id, runner_id) do nothing;
      return v_id;
    end if;
  end if;
  select id into v_id from registrations where date = v_date and lower(name) = lower(v_name) limit 1;
  if v_id is null then
    insert into registrations (name, date, end_date, place, province, country, modality, notes, created_by)
    values (v_name, v_date, v_end,
            nullif(left(btrim(coalesce(p_reg->>'place','')), 120), ''), nullif(left(btrim(coalesce(p_reg->>'province','')), 60), ''),
            coalesce(nullif(left(btrim(coalesce(p_reg->>'country','')), 60), ''), 'España'),
            coalesce(nullif(p_reg->>'modality',''), 'Carretera'), nullif(left(btrim(coalesce(p_reg->>'notes','')), 500), ''), v_runner)
    returning id into v_id;
  end if;
  insert into registration_entries (registration_id, runner_id, category)
  values (v_id, v_runner, nullif(p_category, ''))
  on conflict (registration_id, runner_id) do update set category = excluded.category;
  return v_id;
end $$;

-- Un corredor corrige los datos de una carrera que creó él (no resultados ni podios).
create or replace function public.runner_update_registration(p_code text, p_id uuid, p_reg jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_runner uuid;
  v_name text := btrim(regexp_replace(coalesce(p_reg->>'name',''), '\s+', ' ', 'g'));
  v_date date := nullif(p_reg->>'date','')::date;
  v_end  date := nullif(nullif(p_reg->>'end_date',''), p_reg->>'date')::date;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if not exists (select 1 from registrations where id = p_id and created_by = v_runner) then
    raise exception 'no_es_tuya' using errcode = '42501';
  end if;
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'nombre_no_valido'; end if;
  if v_date is null or v_date < make_date(extract(year from current_date)::int - 1, 1, 1) or v_date > current_date + 730 then raise exception 'fecha_no_valida'; end if;
  if v_end is not null and (v_end < v_date or v_end > v_date + 30) then raise exception 'fecha_no_valida'; end if;
  if exists (select 1 from registrations where id <> p_id and date = v_date and lower(name) = lower(v_name)) then
    raise exception 'ya_existe';
  end if;
  update registrations set name = v_name, date = v_date, end_date = v_end,
    place = nullif(left(btrim(coalesce(p_reg->>'place','')), 120), ''),
    province = nullif(left(btrim(coalesce(p_reg->>'province','')), 60), ''),
    country = coalesce(nullif(left(btrim(coalesce(p_reg->>'country','')), 60), ''), 'España'),
    modality = coalesce(nullif(p_reg->>'modality',''), 'Carretera'),
    notes = nullif(left(btrim(coalesce(p_reg->>'notes','')), 500), '')
  where id = p_id;
end $$;

-- Un corredor borra una carrera que creó él, solo si no hay otros compañeros apuntados.
create or replace function public.runner_delete_registration(p_code text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if not exists (select 1 from registrations where id = p_id and created_by = v_runner) then
    raise exception 'no_es_tuya' using errcode = '42501';
  end if;
  if exists (select 1 from registration_entries where registration_id = p_id and runner_id <> v_runner) then
    raise exception 'otros_apuntados';
  end if;
  delete from registrations where id = p_id;
end $$;

-- El corredor pone SU resultado una sola vez (después solo lo corrige la dirección).
--  p_kind = 'reg': inscripción ya disputada en la que está apuntado (se copiará al pasar a resultados).
--  p_kind = 'race': carrera ya en resultados donde su puesto está vacío.
create or replace function public.runner_report_result(p_code text, p_kind text, p_id uuid, p_position int,
                                                       p_category text, p_podium_type text)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_pod text := case when p_position between 1 and 3 then coalesce(nullif(p_podium_type,''), 'suelta') else null end;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if p_position is null or p_position < 1 or p_position > 999 then raise exception 'puesto_no_valido'; end if;
  if p_kind = 'reg' then
    if exists (select 1 from registrations where id = p_id and suspended) then raise exception 'carrera_suspendida'; end if;
    if not exists (select 1 from registration_entries e join registrations g on g.id = e.registration_id
                    where e.registration_id = p_id and e.runner_id = v_runner and g.date <= current_date) then
      raise exception 'no_es_tuya' using errcode = '42501';
    end if;
    update registration_entries set self_position = p_position, self_podium_type = v_pod, self_reported_at = now(),
           category = coalesce(nullif(p_category, ''), category)
     where registration_id = p_id and runner_id = v_runner and self_position is null;
    if not found then raise exception 'resultado_ya_puesto'; end if;
  elsif p_kind = 'race' then
    if not exists (select 1 from results where race_id = p_id and runner_id = v_runner) then
      raise exception 'no_es_tuya' using errcode = '42501';
    end if;
    update results set position = p_position, podium_type = coalesce(v_pod, 'suelta'), self_reported = true,
           category = coalesce(nullif(p_category, ''), category)
     where race_id = p_id and runner_id = v_runner and position is null;
    if not found then raise exception 'resultado_ya_puesto'; end if;
  else
    raise exception 'tipo_no_valido';
  end if;
end $$;

-- Documentos: la dirección sube y descarga; el corredor ve y descarga solo los suyos.
create or replace function public.upload_document(p_runner uuid, p_year int, p_title text, p_filename text, p_mime text, p_b64 text)
returns uuid language plpgsql set search_path = public as $$
declare v_id uuid; v_data bytea := decode(p_b64, 'base64');
begin
  perform public.require_admin();
  insert into runner_documents (runner_id, year, title, filename, mime, size, data)
  values (p_runner, p_year, left(coalesce(nullif(btrim(p_title), ''), 'Contrato'), 120), left(p_filename, 200), p_mime, length(v_data), v_data)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.get_document(p_id uuid)
returns jsonb language plpgsql stable set search_path = public as $$
declare d runner_documents;
begin
  perform public.require_admin();
  select * into d from runner_documents where id = p_id;
  if not found then raise exception 'no_existe'; end if;
  return jsonb_build_object('filename', d.filename, 'mime', d.mime, 'b64', encode(d.data, 'base64'));
end $$;

create or replace function public.runner_documents_list(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'year', year, 'title', title, 'filename', filename,
                                                       'mime', mime, 'size', size, 'created_at', created_at)
                                    order by year desc, created_at desc)
                     from runner_documents where runner_id = v_runner), '[]'::jsonb);
end $$;

create or replace function public.runner_get_document(p_code text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid; d runner_documents;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  select * into d from runner_documents where id = p_id and runner_id = v_runner;
  if not found then raise exception 'no_es_tuya' using errcode = '42501'; end if;
  return jsonb_build_object('filename', d.filename, 'mime', d.mime, 'b64', encode(d.data, 'base64'));
end $$;

-- «La hice y no salgo»: el corredor se añade a una carrera que ya está en resultados (sin puesto;
-- después lo pone él con runner_report_result). Solo carreras ya disputadas desde el 1 de enero del año anterior.
create or replace function public.runner_join_race(p_code text, p_race uuid, p_category text)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_name text;
begin
  select id, name into v_runner, v_name from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if not exists (select 1 from races where id = p_race and date <= current_date and date >= make_date(extract(year from current_date)::int - 1, 1, 1)) then
    raise exception 'inscripcion_cerrada';
  end if;
  insert into results (race_id, runner_id, runner_name, category)
  values (p_race, v_runner, v_name, nullif(p_category, ''))
  on conflict (race_id, runner_id) do nothing;
end $$;

-- El corredor indica el tipo de una carrera que creó él (campeonato o puntuable de un circuito).
create or replace function public.runner_set_race_type(p_code text, p_id uuid, p_type text, p_circuit text)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_type text := coalesce(nullif(p_type, ''), 'suelta');
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  update registrations set race_type = v_type,
         circuit = case when v_type = 'circuito' then nullif(left(btrim(coalesce(p_circuit, '')), 120), '') end
   where id = p_id and created_by = v_runner;
  if not found then raise exception 'no_es_tuya' using errcode = '42501'; end if;
end $$;

-- El corredor comunica un podio en la general final de un circuito: queda pendiente hasta que la dirección lo confirme.
create or replace function public.runner_propose_circuit(p_code text, p_circuit text, p_year int, p_position int, p_scope text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_id uuid; v_name text := btrim(regexp_replace(coalesce(p_circuit, ''), '\s+', ' ', 'g'));
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'nombre_no_valido'; end if;
  if p_position is null or p_position not between 1 and 3 then raise exception 'puesto_no_valido'; end if;
  if p_year is null or p_year not between extract(year from current_date)::int - 1 and extract(year from current_date)::int then
    raise exception 'fecha_no_valida';
  end if;
  if exists (select 1 from circuit_podiums where runner_id = v_runner and year = p_year and lower(circuit) = lower(v_name)) then
    raise exception 'ya_existe';
  end if;
  if (select count(*) from circuit_podiums where runner_id = v_runner and year = p_year) >= 10 then raise exception 'demasiadas_carreras'; end if;
  insert into circuit_podiums (runner_id, year, circuit, position, scope, by_runner)
  values (v_runner, p_year, v_name, p_position, coalesce(nullif(p_scope, ''), 'categoria'), true) returning id into v_id;
  return v_id;
end $$;

-- El corredor retira un podio de circuito que comunicó, mientras siga pendiente.
create or replace function public.runner_cancel_circuit(p_code text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  delete from circuit_podiums where id = p_id and runner_id = v_runner and status = 'pendiente';
  if not found then raise exception 'no_es_tuya' using errcode = '42501'; end if;
end $$;

-- Noticias vigentes para el corredor (las más recientes primero). Solo lectura.
create or replace function public.runner_news(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from runners where code = p_code) then
    raise exception 'enlace_no_valido' using errcode = '28000';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body,
                                                       'created_at', n.created_at, 'expires_at', n.expires_at)
                                    order by n.created_at desc)
                     from (select * from announcements where expires_at is null or expires_at >= current_date
                            order by created_at desc limit 30) n), '[]'::jsonb);
end $$;

create or replace function public.runner_leave(p_code text, p_registration uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  -- una ya pasada solo si aún no ha puesto su resultado
  if not exists (select 1 from registrations g where g.id = p_registration and g.date >= make_date(extract(year from current_date)::int - 1, 1, 1)
                   and (g.date >= current_date or not exists (select 1 from registration_entries e where e.registration_id = g.id
                                                                and e.runner_id = v_runner and e.self_position is not null))) then
    raise exception 'inscripcion_cerrada';
  end if;
  delete from registration_entries where registration_id = p_registration and runner_id = v_runner;
end $$;

-- Señal de vida para que el proyecto gratuito no se pause (ver .github/workflows/keepalive.yml).
create or replace function public.ping() returns text
language sql stable as $$ select 'ok'::text $$;

-- ---------- Permisos de ejecución -----------------------------------------

revoke execute on all functions in schema public from public, anon;
grant execute on function public.runner_view(text), public.runner_join(text, uuid, text),
                          public.runner_create_registration(text, jsonb, text),
                          public.runner_update_registration(text, uuid, jsonb), public.runner_delete_registration(text, uuid),
                          public.runner_report_result(text, text, uuid, int, text, text),
                          public.runner_documents_list(text), public.runner_get_document(text, uuid),
                          public.runner_team(text),
                          public.runner_leave(text, uuid), public.runner_join_race(text, uuid, text),
                          public.runner_set_race_type(text, uuid, text, text), public.runner_propose_circuit(text, text, int, int, text),
                          public.runner_cancel_circuit(text, uuid), public.runner_news(text), public.ping() to anon, authenticated;
grant execute on function public.is_admin(), public.require_admin(),
                          public.save_registration(jsonb, jsonb), public.save_race(jsonb, jsonb),
                          public.promote_registration(uuid), public.delete_runner(uuid, boolean),
                          public.import_backup(jsonb), public.upload_document(uuid, int, text, text, text, text),
                          public.get_document(uuid) to authenticated;
