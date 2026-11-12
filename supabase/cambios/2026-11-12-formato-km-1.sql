-- =====================================================================
--  Cambio del 12/11/2026 · PARTE 1 de 2: columnas y funciones
--  Formato de la carrera (Critérium, Ciclodeportiva, Máster, XCO, XCM,
--  UXCM…) y kilómetros del recorrido.
--  Pega y ejecuta primero la parte 1 y después la parte 2.
--  Se puede ejecutar más de una vez.
-- =====================================================================

-- Formato de la carrera (Critérium, Ciclodeportiva, Máster, XCO, XCM, UXCM…) y distancia del recorrido en km.
alter table public.registrations add column if not exists subtype text;
alter table public.registrations add column if not exists km numeric(6,1);
alter table public.races         add column if not exists subtype text;
alter table public.races         add column if not exists km numeric(6,1);
alter table public.registrations drop constraint if exists registrations_details_check;
alter table public.registrations add constraint registrations_details_check check ((subtype is null or length(subtype) <= 30) and (km is null or (km > 0 and km <= 1000)));
alter table public.races drop constraint if exists races_details_check;
alter table public.races add constraint races_details_check check ((subtype is null or length(subtype) <= 30) and (km is null or (km > 0 and km <= 1000)));

create or replace function public.promote_registration(p_id uuid)
returns uuid language plpgsql set search_path = public as $$
declare v_race uuid;
begin
  perform public.require_admin();
  if exists (select 1 from registrations where id = p_id and suspended) then raise exception 'carrera_suspendida'; end if;
  insert into races (name, date, end_date, place, province, country, modality, notes, race_type, circuit, subtype, km)
  select name, date, end_date, place, province, country, modality, notes, race_type, circuit, subtype, km from registrations where id = p_id
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

create or replace function public.runner_set_race_details(p_code text, p_id uuid, p_subtype text, p_km numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  update registrations set subtype = nullif(left(btrim(coalesce(p_subtype, '')), 30), ''),
         km = case when p_km > 0 and p_km <= 1000 then round(p_km, 1) end
   where id = p_id and created_by = v_runner;
  if not found then raise exception 'no_es_tuya' using errcode = '42501'; end if;
end $$;

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
               'race_type', r.race_type, 'circuit', r.circuit, 'subtype', r.subtype, 'km', r.km,
               'results', coalesce((
                  select jsonb_agg(jsonb_build_object('runner_id', x.runner_id, 'runner_name', x.runner_name, 'category', x.category,
                                   'position', x.position, 'podium_type', x.podium_type, 'stage_positions', x.stage_positions))
                    from results x where x.race_id = r.id), '[]'::jsonb))
             order by r.date)
        from races r), '[]'::jsonb));
end $$;

revoke execute on function public.runner_set_race_details(text, uuid, text, numeric) from public;
grant execute on function public.runner_set_race_details(text, uuid, text, numeric) to anon, authenticated;
