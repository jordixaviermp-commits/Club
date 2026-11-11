-- =====================================================================
--  Cambio del 12/11/2026 · PARTE 1 de 2: tablas y funciones nuevas
--  Tipo de carrera (campeonato / circuito) y podios en la general final
--  de un circuito (cláusula 9: +4 carreras para el bono).
--  Pega y ejecuta primero la parte 1 y después la parte 2.
--  Se puede ejecutar más de una vez.
-- =====================================================================

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

drop policy if exists admin_all on public.circuit_podiums;
create policy admin_all on public.circuit_podiums for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.circuit_podiums from anon, public;
grant select, insert, update, delete on public.circuit_podiums to authenticated;

create or replace function public.promote_registration(p_id uuid)
returns uuid language plpgsql set search_path = public as $$
declare v_race uuid;
begin
  perform public.require_admin();
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

create or replace function public.runner_cancel_circuit(p_code text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  delete from circuit_podiums where id = p_id and runner_id = v_runner and status = 'pendiente';
  if not found then raise exception 'no_es_tuya' using errcode = '42501'; end if;
end $$;

revoke execute on function public.runner_set_race_type(text, uuid, text, text), public.runner_propose_circuit(text, text, int, int, text),
                           public.runner_cancel_circuit(text, uuid) from public;
grant execute on function public.runner_set_race_type(text, uuid, text, text), public.runner_propose_circuit(text, text, int, int, text),
                          public.runner_cancel_circuit(text, uuid) to anon, authenticated;
