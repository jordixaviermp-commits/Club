-- =====================================================================
--  Cambio del 19/11/2026 (4), parte 2 de 3: desnivel positivo y precio de la inscripción.
--  Ejecuta las 3 partes EN ORDEN (1, 2 y 3). Cada una se pega entera y se puede ejecutar más de una vez.
--  Al final de cada parte sale una fila «Parte 2 de 3 ejecutada»: si no la ves, el texto se pegó cortado.
--  Necesita antes 2026-11-19-web-carreras.sql.
-- =====================================================================
create or replace function public.runner_complete_race(p_code text, p_kind text, p_id uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_runner uuid; v_name text;
  v_place text := nullif(left(btrim(coalesce(p_data->>'place', '')), 120), '');
  v_prov  text := nullif(left(btrim(coalesce(p_data->>'province', '')), 60), '');
  v_sub   text := nullif(left(btrim(coalesce(p_data->>'subtype', '')), 30), '');
  v_km    numeric := case when coalesce(p_data->>'km', '') ~ '^[0-9]+([.][0-9]+)?$' then (p_data->>'km')::numeric end;
  v_elev  int := case when coalesce(p_data->>'elevation','') ~ '^[0-9]{1,5}$' and (p_data->>'elevation')::int between 1 and 10000 then (p_data->>'elevation')::int end;
  v_price numeric := case when coalesce(p_data->>'price','') ~ '^[0-9]{1,5}([.][0-9]{1,2})?$' and (p_data->>'price')::numeric <= 10000 then (p_data->>'price')::numeric end;
begin
  select id, name into v_runner, v_name from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if v_km is not null and not (v_km > 0 and v_km <= 1000) then v_km := null; end if;
  perform set_config('app.actor', v_name, true);
  if p_kind = 'reg' then
    -- una inscripción la puede completar cualquier corredor (solo lo que falta): así quien conoce la carrera ayuda a los demás
    update registrations set place = coalesce(nullif(place, ''), v_place), province = coalesce(nullif(province, ''), v_prov),
           subtype = coalesce(nullif(subtype, ''), v_sub), km = coalesce(km, round(v_km, 1)), elevation = coalesce(elevation, v_elev), price = coalesce(price, v_price)
     where id = p_id;
  elsif p_kind = 'race' then
    if not exists (select 1 from results where race_id = p_id and runner_id = v_runner) then
      raise exception 'no_es_tuya' using errcode = '42501';
    end if;
    update races set place = coalesce(nullif(place, ''), v_place), province = coalesce(nullif(province, ''), v_prov),
           subtype = coalesce(nullif(subtype, ''), v_sub), km = coalesce(km, round(v_km, 1)), elevation = coalesce(elevation, v_elev), price = coalesce(price, v_price)
     where id = p_id;
  else
    raise exception 'tipo_no_valido';
  end if;
  perform set_config('app.actor', '', true);
end $$;

create or replace function public.runner_update_registration(p_code text, p_id uuid, p_reg jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_runner uuid;
  v_name text := btrim(regexp_replace(coalesce(p_reg->>'name',''), '\s+', ' ', 'g'));
  v_date date := nullif(p_reg->>'date','')::date;
  v_end  date := nullif(nullif(p_reg->>'end_date',''), p_reg->>'date')::date;
  v_elev int := case when coalesce(p_reg->>'elevation','') ~ '^[0-9]{1,5}$' and (p_reg->>'elevation')::int between 1 and 10000 then (p_reg->>'elevation')::int end;
  v_price numeric := case when coalesce(p_reg->>'price','') ~ '^[0-9]{1,5}([.][0-9]{1,2})?$' and (p_reg->>'price')::numeric <= 10000 then (p_reg->>'price')::numeric end;
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
  if p_reg ? 'elevation' then update registrations set elevation = v_elev where id = p_id; end if;
  if p_reg ? 'price' then update registrations set price = v_price where id = p_id; end if;
end $$;

create or replace function public.runner_update_race(p_code text, p_id uuid, p_race jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_runner uuid; v_who text;
  v_name text := btrim(regexp_replace(coalesce(p_race->>'name',''), '\s+', ' ', 'g'));
  v_date date := nullif(p_race->>'date','')::date;
  v_end  date := nullif(nullif(p_race->>'end_date',''), p_race->>'date')::date;
  v_type text := coalesce(nullif(p_race->>'race_type',''), 'suelta');
  v_km   numeric := case when coalesce(p_race->>'km', '') ~ '^[0-9]+([.][0-9]+)?$' then (p_race->>'km')::numeric end;
  v_elev int := case when coalesce(p_race->>'elevation','') ~ '^[0-9]{1,5}$' and (p_race->>'elevation')::int between 1 and 10000 then (p_race->>'elevation')::int end;
  v_price numeric := case when coalesce(p_race->>'price','') ~ '^[0-9]{1,5}([.][0-9]{1,2})?$' and (p_race->>'price')::numeric <= 10000 then (p_race->>'price')::numeric end;
begin
  select id, name into v_runner, v_who from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if not exists (select 1 from races where id = p_id and created_by = v_runner) then
    raise exception 'no_es_tuya' using errcode = '42501';
  end if;
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'nombre_no_valido'; end if;
  if v_date is null or v_date < make_date(extract(year from current_date)::int - 1, 1, 1) or v_date > current_date then raise exception 'fecha_no_valida'; end if;
  if v_end is not null and (v_end < v_date or v_end > v_date + 30) then raise exception 'fecha_no_valida'; end if;
  if v_type not in ('suelta','campeonato','circuito') then v_type := 'suelta'; end if;
  if exists (select 1 from races where id <> p_id and date = v_date and lower(name) = lower(v_name)) then
    raise exception 'ya_existe';
  end if;
  perform set_config('app.actor', v_who, true);
  update races set name = v_name, date = v_date, end_date = v_end,
    place = nullif(left(btrim(coalesce(p_race->>'place','')), 120), ''),
    province = nullif(left(btrim(coalesce(p_race->>'province','')), 60), ''),
    country = coalesce(nullif(left(btrim(coalesce(p_race->>'country','')), 60), ''), 'España'),
    modality = coalesce(nullif(p_race->>'modality',''), 'Carretera'),
    notes = nullif(left(btrim(coalesce(p_race->>'notes','')), 500), ''),
    race_type = v_type,
    circuit = case when v_type = 'circuito' then nullif(left(btrim(coalesce(p_race->>'circuit', '')), 120), '') end,
    subtype = nullif(left(btrim(coalesce(p_race->>'subtype', '')), 30), ''),
    km = case when v_km > 0 and v_km <= 1000 then round(v_km, 1) end
  where id = p_id;
  if p_race ? 'elevation' then update races set elevation = v_elev where id = p_id; end if;
  if p_race ? 'price' then update races set price = v_price where id = p_id; end if;
  perform set_config('app.actor', '', true);
end $$;

create or replace function public.auto_promote_registrations()
returns int language plpgsql security definer set search_path = public as $$
declare g registrations; v_race uuid; v_n int := 0;
begin
  perform set_config('app.skip_log', 'on', true);
  for g in select * from registrations r
            where not r.suspended and coalesce(r.end_date, r.date) < current_date - 3
              and exists (select 1 from registration_entries e where e.registration_id = r.id and e.self_position is not null)
            for update skip locked loop
    insert into races (name, date, end_date, place, province, country, modality, notes, race_type, circuit, subtype, km, created_by, url, elevation, price)
    values (g.name, g.date, g.end_date, g.place, g.province, g.country, g.modality, g.notes, g.race_type, g.circuit, g.subtype, g.km, g.created_by, g.url, g.elevation, g.price)
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
  perform public.watch_cleanup();   -- quita las «candidatas» (de Por valorar) que ya nadie valora o que ya pasaron sin inscritos
  perform set_config('app.skip_log', 'off', true);
  return v_n;
end $$;


select 'Parte 2 de 3 ejecutada' as resultado;
