-- =====================================================================
--  Cambio del 12/11/2026 · PARTE 1 de 2: columna y reglas
--  Carrera suspendida (cláusula 6: cuenta para el mínimo, no para el bono).
--  Pega y ejecuta primero la parte 1 y después la parte 2.
--  Se puede ejecutar más de una vez.
-- =====================================================================

alter table public.registrations add column if not exists suspended boolean not null default false;

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
