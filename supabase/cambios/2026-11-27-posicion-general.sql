-- Puesto en la clasificación GENERAL (todas las categorías), además del puesto en su categoría: el corredor lo pone (opcional) al dar su resultado
-- y la dirección también. Alimenta las estadísticas nuevas: podios absolutos, top 10, mejor puesto general y podios importantes.
-- Ejecutar entero en Supabase → SQL Editor. Se puede repetir.
-- Puesto en la clasificación GENERAL (todas las categorías), opcional, además del puesto en su categoría.
alter table public.results add column if not exists general_position integer;
alter table public.results drop constraint if exists results_general_position_check;
alter table public.results add constraint results_general_position_check check (general_position is null or (general_position > 0 and general_position <= 9999));
alter table public.registration_entries add column if not exists self_general_position integer;
alter table public.registration_entries drop constraint if exists entries_self_general_check;
alter table public.registration_entries add constraint entries_self_general_check check (self_general_position is null or (self_general_position > 0 and self_general_position <= 9999));

create or replace function public.auto_promote_registrations()
returns int language plpgsql security definer set search_path = public as $$
declare g registrations; v_race uuid; v_n int := 0;
begin
  perform set_config('app.skip_log', 'on', true);
  for g in select * from registrations r
            where not r.suspended and coalesce(r.end_date, r.date) < current_date - 7
              and exists (select 1 from registration_entries e where e.registration_id = r.id and e.self_position is not null)
            for update skip locked loop
    insert into races (name, date, end_date, place, province, country, modality, notes, race_type, circuit, subtype, km, created_by, url, elevation, price, lat, lon, geo_key)
    values (g.name, g.date, g.end_date, g.place, g.province, g.country, g.modality, g.notes, g.race_type, g.circuit, g.subtype, g.km, g.created_by, g.url, g.elevation, g.price, g.lat, g.lon, g.geo_key)
    returning id into v_race;
    insert into results (race_id, runner_id, runner_name, category, position, podium_type, self_reported, time_seconds, general_position)
    select v_race, e.runner_id, rn.name, e.category, e.self_position,
           case when e.self_position between 1 and 3 then coalesce(e.self_podium_type, 'suelta') else 'suelta' end, true,
           e.self_time_seconds, e.self_general_position
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
  insert into results (race_id, runner_id, runner_name, category, position, podium_type, stage_positions, self_reported, time_seconds, general_position)
  select v_id, nullif(x->>'runner_id','')::uuid, btrim(x->>'runner_name'), nullif(x->>'category',''),
         nullif(x->>'position','')::int, coalesce(nullif(x->>'podium_type',''),'suelta'),
         nullif(nullif(x->'stage_positions', 'null'::jsonb), '[]'::jsonb), coalesce((x->>'self_reported')::boolean, false),
         nullif(x->>'time_seconds','')::int, nullif(x->>'general_position','')::int
    from jsonb_array_elements(coalesce(p_results,'[]')) x;
  return v_id;
end $$;

create or replace function public.promote_registration(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_race uuid;
begin
  perform public.require_admin();
  if exists (select 1 from registrations where id = p_id and suspended) then raise exception 'carrera_suspendida'; end if;
  perform set_config('app.skip_log', 'on', true);
  insert into races (name, date, end_date, place, province, country, modality, notes, race_type, circuit, subtype, km, created_by)
  select name, date, end_date, place, province, country, modality, notes, race_type, circuit, subtype, km, created_by from registrations where id = p_id
  returning id into v_race;
  if v_race is null then raise exception 'no_existe'; end if;
  insert into results (race_id, runner_id, runner_name, category, position, podium_type, self_reported, time_seconds, general_position)
  select v_race, e.runner_id, r.name, e.category, e.self_position,
         case when e.self_position between 1 and 3 then coalesce(e.self_podium_type, 'suelta') else 'suelta' end,
         e.self_position is not null,
         e.self_time_seconds, e.self_general_position
    from registration_entries e join runners r on r.id = e.runner_id
   where e.registration_id = p_id;
  perform public.log_change('Dirección', 'race', v_race, 'a_resultados', format('pasó a resultados: %s', (select name from races where id = v_race)));
  delete from registrations where id = p_id;
  perform set_config('app.skip_log', 'off', true);
  return v_race;
end $$;

create or replace function public.runner_view(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me runners; v_year int := extract(year from current_date)::int; v_cfg jsonb;
begin
  select * into me from runners where code = p_code;
  if not found then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  perform public.auto_promote_registrations();   -- pasa solas a resultados las carreras ya disputadas con puestos
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
               'race_type', r.race_type, 'circuit', r.circuit, 'subtype', r.subtype, 'km', r.km, 'elevation', r.elevation, 'price', r.price, 'lat', r.lat, 'lon', r.lon, 'geo_key', r.geo_key, 'notes', r.notes,
               'mine_created', r.created_by = me.id,
               'others', (select count(*) from results o where o.race_id = r.id and o.runner_id is distinct from me.id),
               'category', x.category, 'position', x.position, 'podium_type', x.podium_type,
               'stage_positions', x.stage_positions, 'self_reported', x.self_reported, 'time_seconds', x.time_seconds, 'general_position', x.general_position)
             order by r.date desc, r.name)
        from results x join races r on r.id = x.race_id
       where x.runner_id = me.id), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'name', g.name, 'date', g.date, 'end_date', g.end_date, 'place', g.place,
               'mine_created', g.created_by = me.id, 'race_type', g.race_type, 'circuit', g.circuit, 'suspended', g.suspended, 'subtype', g.subtype, 'km', g.km, 'url', g.url, 'url_mine', coalesce(g.url_by = me.id, false), 'elevation', g.elevation, 'price', g.price, 'lat', g.lat, 'lon', g.lon, 'geo_key', g.geo_key,
               'my_result', (select jsonb_build_object('position', e.self_position, 'podium_type', e.self_podium_type, 'time_seconds', e.self_time_seconds, 'general_position', e.self_general_position)
                               from registration_entries e where e.registration_id = g.id and e.runner_id = me.id and e.self_position is not null),
               'province', g.province, 'country', g.country, 'modality', g.modality, 'notes', g.notes,
               'entries', coalesce((
                  select jsonb_agg(jsonb_build_object('runner_id', r.id, 'name', r.name, 'category', e.category,
                                     'paid', e.paid_at is not null, 'paid_amount', case when r.id = me.id then e.paid_amount end,
                                     'paid_on', case when r.id = me.id then e.paid_at::date end, 'joined_on', case when r.id = me.id then e.created_at::date end)
                                   order by r.name)
                    from registration_entries e join runners r on r.id = e.runner_id
                   where e.registration_id = g.id), '[]'::jsonb))
             order by g.date, g.name)
        from registrations g), '[]'::jsonb));
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
               'race_type', r.race_type, 'circuit', r.circuit, 'subtype', r.subtype, 'km', r.km, 'elevation', r.elevation, 'price', r.price, 'lat', r.lat, 'lon', r.lon, 'geo_key', r.geo_key,
               'results', coalesce((
                  select jsonb_agg(jsonb_build_object('runner_id', x.runner_id, 'runner_name', x.runner_name, 'category', x.category,
                                   'position', x.position, 'podium_type', x.podium_type, 'stage_positions', x.stage_positions, 'time_seconds', x.time_seconds, 'general_position', x.general_position))
                    from results x where x.race_id = r.id), '[]'::jsonb))
             order by r.date)
        from races r), '[]'::jsonb));
end $$;

drop function if exists public.runner_report_result(text, text, uuid, int, text, text, int);
create or replace function public.runner_report_result(p_code text, p_kind text, p_id uuid, p_position int,
                                                       p_category text, p_podium_type text, p_time int default null, p_general int default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_who text; v_old int; v_pod text := case when p_position between 1 and 3 then coalesce(nullif(p_podium_type,''), 'suelta') else null end;
begin
  select id, name into v_runner, v_who from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if p_position is null or p_position < 1 or p_position > 999 then raise exception 'puesto_no_valido'; end if;
  if p_time is not null and (p_time < 1 or p_time > 3600000) then raise exception 'tiempo_no_valido'; end if;  -- segundos: de 1 s a 1000 h
  if p_general is not null and (p_general < p_position or p_general > 9999) then raise exception 'puesto_general_no_valido'; end if;  -- en la general nunca se va por delante que en su categoría
  if p_kind = 'reg' then
    if exists (select 1 from registrations where id = p_id and suspended) then raise exception 'carrera_suspendida'; end if;
    if not exists (select 1 from registration_entries e join registrations g on g.id = e.registration_id
                    where e.registration_id = p_id and e.runner_id = v_runner and g.date <= current_date) then
      raise exception 'no_es_tuya' using errcode = '42501';
    end if;
    select self_position into v_old from registration_entries where registration_id = p_id and runner_id = v_runner;
    update registration_entries set self_position = p_position, self_podium_type = v_pod, self_reported_at = now(), self_time_seconds = p_time,
           self_general_position = p_general, category = coalesce(nullif(p_category, ''), category)
     where registration_id = p_id and runner_id = v_runner;
    perform public.log_change(v_who, 'result', p_id, 'resultado',
      case when v_old is null then format('puso su resultado: %sº en %s', p_position, (select name from registrations where id = p_id))
           else format('cambió su resultado: %sº → %sº en %s', v_old, p_position, (select name from registrations where id = p_id)) end);
  elsif p_kind = 'race' then
    if not exists (select 1 from results where race_id = p_id and runner_id = v_runner) then
      raise exception 'no_es_tuya' using errcode = '42501';
    end if;
    select position into v_old from results where race_id = p_id and runner_id = v_runner;
    update results set position = p_position, podium_type = coalesce(v_pod, 'suelta'), self_reported = true, time_seconds = p_time,
           general_position = p_general, category = coalesce(nullif(p_category, ''), category)
     where race_id = p_id and runner_id = v_runner;
    perform public.log_change(v_who, 'result', p_id, 'resultado',
      case when v_old is null then format('puso su resultado: %sº en %s', p_position, (select name from races where id = p_id))
           else format('cambió su resultado: %sº → %sº en %s', v_old, p_position, (select name from races where id = p_id)) end);
  else
    raise exception 'tipo_no_valido';
  end if;
  delete from correction_requests where runner_id = v_runner and target_id = p_id and status = 'pendiente';
end $$;

grant execute on function public.runner_report_result(text, text, uuid, int, text, text, int, int) to anon, authenticated;

select 'posicion-general ejecutada' as resultado;
