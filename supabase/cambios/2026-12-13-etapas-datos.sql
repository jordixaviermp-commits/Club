-- Carreras por etapas: datos de CADA etapa (nombre, día, km y desnivel), para que cada día tenga su historia con sus datos.
-- Cualquier corredor puede ponerlos (como el resto de datos de una carrera) y la dirección también. Los km y el desnivel totales
-- salen de la suma cuando todas las etapas los tienen. Al pasar la inscripción a resultados, las etapas viajan con ella.
-- Además arregla que «Pasar a resultados» a mano perdía el desnivel, el precio, la web y las coordenadas.
-- CINCO trozos cortos (se pueden repetir). Pégalos EN ORDEN.

-- ===== TROZO 1: las columnas =====
alter table public.registrations add column if not exists stage_info jsonb;
alter table public.races add column if not exists stage_info jsonb;
alter table public.registrations drop constraint if exists registrations_stage_info_check;
alter table public.registrations add constraint registrations_stage_info_check check (stage_info is null or (jsonb_typeof(stage_info) = 'array' and jsonb_array_length(stage_info) <= 30));
alter table public.races drop constraint if exists races_stage_info_check;
alter table public.races add constraint races_stage_info_check check (stage_info is null or (jsonb_typeof(stage_info) = 'array' and jsonb_array_length(stage_info) <= 30));

-- ===== TROZO 2: limpiar y aplicar las etapas (internas) =====
create or replace function public.stages_clean(p_stages jsonb, p_first date, p_last date)
returns jsonb language plpgsql stable set search_path = public as $$
declare el jsonb; v_out jsonb := '[]'::jsonb; v_n int := 0; v_name text; v_date date; v_km numeric; v_ele int; v_item jsonb;
begin
  if p_stages is null or jsonb_typeof(p_stages) <> 'array' or jsonb_array_length(p_stages) = 0 then return null; end if;
  if p_last is null or p_last <= p_first then raise exception 'datos_no_validos'; end if;          -- solo carreras de varios días
  if jsonb_array_length(p_stages) > 30 then raise exception 'datos_no_validos'; end if;
  for el in select value from jsonb_array_elements(p_stages) loop
    v_n := v_n + 1;
    v_name := coalesce(nullif(left(btrim(coalesce(el->>'name', '')), 60), ''), 'Etapa ' || v_n);
    v_date := case when coalesce(el->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$' then (el->>'date')::date end;
    if v_date is null or v_date < p_first or v_date > p_last then raise exception 'datos_no_validos'; end if;
    v_km := case when coalesce(el->>'km', '') ~ '^[0-9]{1,4}([.][0-9]+)?$' then round((el->>'km')::numeric, 1) end;
    if v_km is not null and not (v_km > 0 and v_km <= 1000) then v_km := null; end if;
    v_ele := case when coalesce(el->>'elevation', '') ~ '^[0-9]{1,5}$' then (el->>'elevation')::int end;
    if v_ele is not null and not (v_ele > 0 and v_ele <= 10000) then v_ele := null; end if;
    v_item := jsonb_build_object('name', v_name, 'date', v_date);
    if v_km is not null then v_item := v_item || jsonb_build_object('km', v_km); end if;
    if v_ele is not null then v_item := v_item || jsonb_build_object('elevation', v_ele); end if;
    v_out := v_out || jsonb_build_array(v_item);
  end loop;
  return v_out;
end $$;

create or replace function public.stages_apply(p_kind text, p_id uuid, p_clean jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_km numeric; v_ele numeric; v_all_km boolean; v_all_ele boolean; v_names jsonb;
begin
  select sum((x->>'km')::numeric), sum((x->>'elevation')::numeric), coalesce(bool_and(x ? 'km'), false), coalesce(bool_and(x ? 'elevation'), false)
    into v_km, v_ele, v_all_km, v_all_ele from jsonb_array_elements(coalesce(p_clean, '[]'::jsonb)) x;
  if not v_all_km or v_km is null or v_km <= 0 or v_km > 1000 then v_km := null; end if;       -- el total solo si TODAS las etapas lo tienen
  if not v_all_ele or v_ele is null or v_ele <= 0 or v_ele > 10000 then v_ele := null; end if;
  select jsonb_agg(x->>'name') into v_names from jsonb_array_elements(coalesce(p_clean, '[]'::jsonb)) x;
  if p_kind = 'reg' then
    update registrations set stage_info = p_clean, km = coalesce(round(v_km, 1), km), elevation = coalesce(v_ele::int, elevation) where id = p_id;
  elsif p_kind = 'race' then
    update races set stage_info = p_clean, stages = coalesce(v_names, stages), km = coalesce(round(v_km, 1), km), elevation = coalesce(v_ele::int, elevation) where id = p_id;
  else raise exception 'tipo_no_valido'; end if;
end $$;
revoke all on function public.stages_apply(text, uuid, jsonb) from public, anon, authenticated;

-- ===== TROZO 3: poner las etapas (corredor y dirección) =====
create or replace function public.runner_set_stages(p_code text, p_kind text, p_id uuid, p_stages jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_name text; v_first date; v_last date;
begin
  select id, name into v_runner, v_name from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if p_kind = 'reg' then select date, end_date into v_first, v_last from registrations where id = p_id;
  elsif p_kind = 'race' then
    if not exists (select 1 from results where race_id = p_id and runner_id = v_runner) then raise exception 'no_es_tuya' using errcode = '42501'; end if;
    select date, end_date into v_first, v_last from races where id = p_id;
  else raise exception 'tipo_no_valido'; end if;
  if v_first is null then raise exception 'no_existe'; end if;
  perform set_config('app.actor', v_name, true);
  perform public.stages_apply(p_kind, p_id, public.stages_clean(p_stages, v_first, v_last));
  perform set_config('app.actor', '', true);
end $$;
grant execute on function public.runner_set_stages(text, text, uuid, jsonb) to anon, authenticated;

create or replace function public.admin_set_stages(p_kind text, p_id uuid, p_stages jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_first date; v_last date;
begin
  perform public.require_admin();
  if p_kind = 'reg' then select date, end_date into v_first, v_last from registrations where id = p_id;
  elsif p_kind = 'race' then select date, end_date into v_first, v_last from races where id = p_id;
  else raise exception 'tipo_no_valido'; end if;
  if v_first is null then raise exception 'no_existe'; end if;
  perform public.stages_apply(p_kind, p_id, public.stages_clean(p_stages, v_first, v_last));
end $$;
revoke all on function public.admin_set_stages(text, uuid, jsonb) from public, anon;
grant execute on function public.admin_set_stages(text, uuid, jsonb) to authenticated;

-- ===== TROZO 4: las etapas viajan a resultados (y el pase a mano ya no pierde datos) =====
create or replace function public.auto_promote_registrations()
returns int language plpgsql security definer set search_path = public as $$
declare g registrations; v_race uuid; v_n int := 0;
begin
  perform set_config('app.skip_log', 'on', true);
  for g in select * from registrations r
            where not r.suspended and coalesce(r.end_date, r.date) < current_date - 7
              and exists (select 1 from registration_entries e where e.registration_id = r.id and (e.self_position is not null or e.self_dnf))
            for update skip locked loop
    insert into races (name, date, end_date, place, province, country, modality, notes, race_type, circuit, subtype, km, created_by, url, elevation, price, lat, lon, geo_key, stage_info, stages)
    values (g.name, g.date, g.end_date, g.place, g.province, g.country, g.modality, g.notes, g.race_type, g.circuit, g.subtype, g.km, g.created_by, g.url, g.elevation, g.price, g.lat, g.lon, g.geo_key, g.stage_info,
            (select jsonb_agg(x->>'name') from jsonb_array_elements(g.stage_info) x))
    returning id into v_race;
    insert into results (race_id, runner_id, runner_name, category, position, podium_type, self_reported, time_seconds, dnf)
    select v_race, e.runner_id, rn.name, e.category, e.self_position,
           case when e.self_position between 1 and 3 then coalesce(e.self_podium_type, 'suelta') else 'suelta' end, true,
           e.self_time_seconds, e.self_dnf
      from registration_entries e join runners rn on rn.id = e.runner_id
     where e.registration_id = g.id and (e.self_position is not null or e.self_dnf);
    delete from registrations where id = g.id;
    perform public.log_change('Sistema', 'race', v_race, 'auto_resultados', format('pasó sola a resultados: %s (%s)', g.name, g.date));
    v_n := v_n + 1;
  end loop;
  perform public.watch_cleanup();   -- quita las «candidatas» (de Por valorar) que ya nadie valora o que ya pasaron sin inscritos
  perform set_config('app.skip_log', 'off', true);
  return v_n;
end $$;

create or replace function public.promote_registration(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_race uuid;
begin
  perform public.require_admin();
  if exists (select 1 from registrations where id = p_id and suspended) then raise exception 'carrera_suspendida'; end if;
  perform set_config('app.skip_log', 'on', true);
  insert into races (name, date, end_date, place, province, country, modality, notes, race_type, circuit, subtype, km, created_by, url, elevation, price, lat, lon, geo_key, stage_info, stages)
  select name, date, end_date, place, province, country, modality, notes, race_type, circuit, subtype, km, created_by, url, elevation, price, lat, lon, geo_key, stage_info,
         (select jsonb_agg(x->>'name') from jsonb_array_elements(stage_info) x) from registrations where id = p_id
  returning id into v_race;
  if v_race is null then raise exception 'no_existe'; end if;
  insert into results (race_id, runner_id, runner_name, category, position, podium_type, self_reported, time_seconds, dnf)
  select v_race, e.runner_id, r.name, e.category, e.self_position,
         case when e.self_position between 1 and 3 then coalesce(e.self_podium_type, 'suelta') else 'suelta' end,
         (e.self_position is not null or e.self_dnf),
         e.self_time_seconds, e.self_dnf
    from registration_entries e join runners r on r.id = e.runner_id
   where e.registration_id = p_id;
  perform public.log_change('Dirección', 'race', v_race, 'a_resultados', format('pasó a resultados: %s', (select name from races where id = v_race)));
  delete from registrations where id = p_id;
  perform set_config('app.skip_log', 'off', true);
  return v_race;
end $$;

-- ===== TROZO 5: la pantalla del corredor recibe las etapas (sustituye a dos funciones que ya tienes) =====
do $$
declare d text;
begin
  d := pg_get_functiondef('public.runner_view(text)'::regprocedure);
  if d not like '%stage_info%' then
    d := replace(d, '''stages'', r.stages,', '''stages'', r.stages, ''stage_info'', r.stage_info,');
    d := replace(d, '''suspended'', g.suspended,', '''suspended'', g.suspended, ''stage_info'', g.stage_info,');
    execute d;
  end if;
  d := pg_get_functiondef('public.runner_team(text)'::regprocedure);
  if d not like '%stage_info%' then
    d := replace(d, '''stages'', r.stages,', '''stages'', r.stages, ''stage_info'', r.stage_info,');
    execute d;
  end if;
end $$;
