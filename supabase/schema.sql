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

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

do $$
declare t text;
begin
  foreach t in array array['runners','registrations','registration_entries','races','results'] loop
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

revoke all on public.runners, public.registrations, public.registration_entries,
              public.races, public.results, public.admins from anon, public;
grant select, insert, update, delete on public.runners, public.registrations,
              public.registration_entries, public.races, public.results to authenticated;
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
  insert into results (race_id, runner_id, runner_name, category, position, podium_type, stage_positions)
  select v_id, nullif(x->>'runner_id','')::uuid, btrim(x->>'runner_name'), nullif(x->>'category',''),
         nullif(x->>'position','')::int, coalesce(nullif(x->>'podium_type',''),'suelta'),
         nullif(nullif(x->'stage_positions', 'null'::jsonb), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_results,'[]')) x;
  return v_id;
end $$;

-- «Pasar a resultados»: crea la carrera con los inscritos y borra la inscripción.
create or replace function public.promote_registration(p_id uuid)
returns uuid language plpgsql set search_path = public as $$
declare v_race uuid;
begin
  perform public.require_admin();
  insert into races (name, date, end_date, place, province, country, modality, notes)
  select name, date, end_date, place, province, country, modality, notes from registrations where id = p_id
  returning id into v_race;
  if v_race is null then raise exception 'no_existe'; end if;
  insert into results (race_id, runner_id, runner_name, category)
  select v_race, e.runner_id, r.name, e.category
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
end $$;

-- ---------- Funciones de corredores (entran con su enlace personal) ----
-- Solo ven inscripciones (nombre y categoría de los inscritos) y solo
-- pueden apuntarse o borrarse a sí mismos en carreras de hoy en adelante.

create or replace function public.runner_view(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me runners;
begin
  select * into me from runners where code = p_code;
  if not found then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return jsonb_build_object(
    'me', jsonb_build_object('id', me.id, 'name', me.name, 'category', me.category),
    'today', current_date,
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'name', g.name, 'date', g.date, 'end_date', g.end_date, 'place', g.place,
               'province', g.province, 'country', g.country, 'modality', g.modality, 'notes', g.notes,
               'entries', coalesce((
                  select jsonb_agg(jsonb_build_object('runner_id', r.id, 'name', r.name, 'category', e.category)
                                   order by r.name)
                    from registration_entries e join runners r on r.id = e.runner_id
                   where e.registration_id = g.id), '[]'::jsonb))
             order by g.date, g.name)
        from registrations g), '[]'::jsonb));
end $$;

create or replace function public.runner_join(p_code text, p_registration uuid, p_category text)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if not exists (select 1 from registrations where id = p_registration and date >= current_date) then
    raise exception 'inscripcion_cerrada';
  end if;
  insert into registration_entries (registration_id, runner_id, category)
  values (p_registration, v_runner, nullif(p_category,''))
  on conflict (registration_id, runner_id) do update set category = excluded.category;
end $$;

create or replace function public.runner_leave(p_code text, p_registration uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if not exists (select 1 from registrations where id = p_registration and date >= current_date) then
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
                          public.runner_leave(text, uuid), public.ping() to anon, authenticated;
grant execute on function public.is_admin(), public.require_admin(),
                          public.save_registration(jsonb, jsonb), public.save_race(jsonb, jsonb),
                          public.promote_registration(uuid), public.delete_runner(uuid, boolean),
                          public.import_backup(jsonb) to authenticated;
