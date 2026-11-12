-- =====================================================================
--  Cambio del 12/11/2026 · PARTE 2 de 3: paso automático y completar datos
--  Historial de cambios, paso automático a resultados y «completar
--  datos» por los corredores.
--  Pega y ejecuta las partes en orden: 1, 2 y 3. Se pueden repetir.
-- =====================================================================

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
    insert into results (race_id, runner_id, runner_name, category, position, podium_type, self_reported)
    select v_race, e.runner_id, rn.name, e.category, e.self_position,
           case when e.self_position between 1 and 3 then coalesce(e.self_podium_type, 'suelta') else 'suelta' end, true
      from registration_entries e join runners rn on rn.id = e.runner_id
     where e.registration_id = g.id and e.self_position is not null;
    delete from registrations where id = g.id;
    perform public.log_change('Sistema', 'race', v_race, 'auto_resultados', format('pasó sola a resultados: %s (%s)', g.name, g.date));
    v_n := v_n + 1;
  end loop;
  perform set_config('app.skip_log', 'off', true);
  return v_n;
end $$;

create or replace function public.runner_complete_race(p_code text, p_kind text, p_id uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_runner uuid; v_name text;
  v_place text := nullif(left(btrim(coalesce(p_data->>'place', '')), 120), '');
  v_prov  text := nullif(left(btrim(coalesce(p_data->>'province', '')), 60), '');
  v_sub   text := nullif(left(btrim(coalesce(p_data->>'subtype', '')), 30), '');
  v_km    numeric := case when coalesce(p_data->>'km', '') ~ '^[0-9]+([.][0-9]+)?$' then (p_data->>'km')::numeric end;
begin
  select id, name into v_runner, v_name from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if v_km is not null and not (v_km > 0 and v_km <= 1000) then v_km := null; end if;
  perform set_config('app.actor', v_name, true);
  if p_kind = 'reg' then
    if not exists (select 1 from registration_entries where registration_id = p_id and runner_id = v_runner)
       and not exists (select 1 from registrations where id = p_id and created_by = v_runner) then
      raise exception 'no_es_tuya' using errcode = '42501';
    end if;
    update registrations set place = coalesce(nullif(place, ''), v_place), province = coalesce(nullif(province, ''), v_prov),
           subtype = coalesce(nullif(subtype, ''), v_sub), km = coalesce(km, round(v_km, 1))
     where id = p_id;
  elsif p_kind = 'race' then
    if not exists (select 1 from results where race_id = p_id and runner_id = v_runner) then
      raise exception 'no_es_tuya' using errcode = '42501';
    end if;
    update races set place = coalesce(nullif(place, ''), v_place), province = coalesce(nullif(province, ''), v_prov),
           subtype = coalesce(nullif(subtype, ''), v_sub), km = coalesce(km, round(v_km, 1))
     where id = p_id;
  else
    raise exception 'tipo_no_valido';
  end if;
  perform set_config('app.actor', '', true);
end $$;

create or replace function public.promote_registration(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_race uuid;
begin
  perform public.require_admin();
  if exists (select 1 from registrations where id = p_id and suspended) then raise exception 'carrera_suspendida'; end if;
  perform set_config('app.skip_log', 'on', true);
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
  perform public.log_change('Dirección', 'race', v_race, 'a_resultados', format('pasó a resultados: %s', (select name from races where id = v_race)));
  delete from registrations where id = p_id;
  perform set_config('app.skip_log', 'off', true);
  return v_race;
end $$;

create or replace function public.import_backup(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  perform set_config('app.skip_log', 'on', true);
  perform public.log_change('Dirección', 'backup', null, 'restaurar', 'restauró una copia de seguridad');
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

revoke execute on function public.runner_complete_race(text, text, uuid, jsonb), public.auto_promote_registrations() from public;
grant execute on function public.runner_complete_race(text, text, uuid, jsonb), public.auto_promote_registrations() to anon, authenticated;
