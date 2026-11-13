-- Tiempo de cada carrera (parte 1 de 2): columnas, y las funciones que lo guardan y lo pasan a resultados.
-- Se puede ejecutar más de una vez sin problema. Ejecutar la parte 1 y después la parte 2.
-- Tiempo que ha tardado el corredor en la carrera, en segundos (opcional; de 1 s a 1000 h). Lo pone él al dar su resultado,
-- o la dirección al editar los resultados. Alimenta las horas de cada corredor en el resumen del equipo.
alter table public.results add column if not exists time_seconds integer;
alter table public.results drop constraint if exists results_time_check;
alter table public.results add constraint results_time_check check (time_seconds is null or (time_seconds > 0 and time_seconds <= 3600000));
alter table public.registration_entries add column if not exists self_time_seconds integer;
alter table public.registration_entries drop constraint if exists entries_self_check;
alter table public.registration_entries add constraint entries_self_check check (
  (self_position is null or self_position > 0) and (self_podium_type is null or self_podium_type in ('suelta','general','campeonato'))
  and (self_time_seconds is null or (self_time_seconds > 0 and self_time_seconds <= 3600000)));

-- 1) Pasar a resultados (automático) conserva el tiempo
create or replace function public.auto_promote_registrations()
returns int language plpgsql security definer set search_path = public as $$
declare g registrations; v_race uuid; v_n int := 0;
begin
  perform set_config('app.skip_log', 'on', true);
  for g in select * from registrations r
            where not r.suspended and coalesce(r.end_date, r.date) < current_date - 3
              and exists (select 1 from registration_entries e where e.registration_id = r.id and e.self_position is not null)
            for update skip locked loop
    insert into races (name, date, end_date, place, province, country, modality, notes, race_type, circuit, subtype, km)
    values (g.name, g.date, g.end_date, g.place, g.province, g.country, g.modality, g.notes, g.race_type, g.circuit, g.subtype, g.km)
    returning id into v_race;
    insert into results (race_id, runner_id, runner_name, category, position, podium_type, self_reported, time_seconds)
    select v_race, e.runner_id, rn.name, e.category, e.self_position,
           case when e.self_position between 1 and 3 then coalesce(e.self_podium_type, 'suelta') else 'suelta' end, true,
           e.self_time_seconds
      from registration_entries e join runners rn on rn.id = e.runner_id
     where e.registration_id = g.id and e.self_position is not null;
    delete from registrations where id = g.id;
    perform public.log_change('Sistema', 'race', v_race, 'auto_resultados', format('pasó sola a resultados: %s (%s)', g.name, g.date));
    v_n := v_n + 1;
  end loop;
  perform set_config('app.skip_log', 'off', true);
  return v_n;
end $$;

-- 2) Guardar una carrera con sus resultados (dirección): ahora admite «time_seconds» en cada resultado
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
  insert into results (race_id, runner_id, runner_name, category, position, podium_type, stage_positions, self_reported, time_seconds)
  select v_id, nullif(x->>'runner_id','')::uuid, btrim(x->>'runner_name'), nullif(x->>'category',''),
         nullif(x->>'position','')::int, coalesce(nullif(x->>'podium_type',''),'suelta'),
         nullif(nullif(x->'stage_positions', 'null'::jsonb), '[]'::jsonb), coalesce((x->>'self_reported')::boolean, false),
         nullif(x->>'time_seconds','')::int
    from jsonb_array_elements(coalesce(p_results,'[]')) x;
  return v_id;
end $$;

-- 3) El corredor da su resultado con tiempo opcional (cambia la firma: se quita la antigua)
drop function if exists public.runner_report_result(text, text, uuid, int, text, text);
create or replace function public.runner_report_result(p_code text, p_kind text, p_id uuid, p_position int,
                                                       p_category text, p_podium_type text, p_time int default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_who text; v_pod text := case when p_position between 1 and 3 then coalesce(nullif(p_podium_type,''), 'suelta') else null end;
begin
  select id, name into v_runner, v_who from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if p_position is null or p_position < 1 or p_position > 999 then raise exception 'puesto_no_valido'; end if;
  if p_time is not null and (p_time < 1 or p_time > 3600000) then raise exception 'tiempo_no_valido'; end if;  -- segundos: de 1 s a 1000 h
  if p_kind = 'reg' then
    if exists (select 1 from registrations where id = p_id and suspended) then raise exception 'carrera_suspendida'; end if;
    if not exists (select 1 from registration_entries e join registrations g on g.id = e.registration_id
                    where e.registration_id = p_id and e.runner_id = v_runner and g.date <= current_date) then
      raise exception 'no_es_tuya' using errcode = '42501';
    end if;
    update registration_entries set self_position = p_position, self_podium_type = v_pod, self_reported_at = now(), self_time_seconds = p_time,
           category = coalesce(nullif(p_category, ''), category)
     where registration_id = p_id and runner_id = v_runner and self_position is null;
    if not found then raise exception 'resultado_ya_puesto'; end if;
    perform public.log_change(v_who, 'result', p_id, 'resultado', format('puso su resultado: %sº en %s', p_position, (select name from registrations where id = p_id)));
  elsif p_kind = 'race' then
    if not exists (select 1 from results where race_id = p_id and runner_id = v_runner) then
      raise exception 'no_es_tuya' using errcode = '42501';
    end if;
    update results set position = p_position, podium_type = coalesce(v_pod, 'suelta'), self_reported = true, time_seconds = p_time,
           category = coalesce(nullif(p_category, ''), category)
     where race_id = p_id and runner_id = v_runner and position is null;
    if not found then raise exception 'resultado_ya_puesto'; end if;
    perform public.log_change(v_who, 'result', p_id, 'resultado', format('puso su resultado: %sº en %s', p_position, (select name from races where id = p_id)));
  else
    raise exception 'tipo_no_valido';
  end if;
end $$;
revoke execute on function public.runner_report_result(text, text, uuid, int, text, text, int) from public, anon;
grant execute on function public.runner_report_result(text, text, uuid, int, text, text, int) to anon, authenticated;
