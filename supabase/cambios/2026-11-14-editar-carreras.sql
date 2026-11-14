-- =====================================================================
--  Cambio del 14/11/2026: quien añadió una carrera puede seguir editándola
--  o borrándola aunque ya esté en resultados (la dirección, siempre).
--  Versión corta para pegar desde el móvil (equivale a ejecutar
--  supabase/schema.sql completo). Se puede ejecutar más de una vez.
--  Termina en la línea «grant execute … to anon, authenticated;».
--  Las carreras pasadas a resultados ANTES de este cambio no guardan
--  quién las añadió: esas solo las edita la dirección.
-- =====================================================================

alter table public.races add column if not exists created_by uuid references public.runners(id) on delete set null;

create or replace function public.auto_promote_registrations()
returns int language plpgsql security definer set search_path = public as $$
declare g registrations; v_race uuid; v_n int := 0;
begin
  perform set_config('app.skip_log', 'on', true);
  for g in select * from registrations r
            where not r.suspended and coalesce(r.end_date, r.date) < current_date - 3
              and exists (select 1 from registration_entries e where e.registration_id = r.id and e.self_position is not null)
            for update skip locked loop
    insert into races (name, date, end_date, place, province, country, modality, notes, race_type, circuit, subtype, km, created_by)
    values (g.name, g.date, g.end_date, g.place, g.province, g.country, g.modality, g.notes, g.race_type, g.circuit, g.subtype, g.km, g.created_by)
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
  insert into results (race_id, runner_id, runner_name, category, position, podium_type, self_reported, time_seconds)
  select v_race, e.runner_id, r.name, e.category, e.self_position,
         case when e.self_position between 1 and 3 then coalesce(e.self_podium_type, 'suelta') else 'suelta' end,
         e.self_position is not null,
         e.self_time_seconds
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
               'race_type', r.race_type, 'circuit', r.circuit, 'subtype', r.subtype, 'km', r.km, 'notes', r.notes,
               'mine_created', r.created_by = me.id,
               'others', (select count(*) from results o where o.race_id = r.id and o.runner_id is distinct from me.id),
               'category', x.category, 'position', x.position, 'podium_type', x.podium_type,
               'stage_positions', x.stage_positions, 'self_reported', x.self_reported, 'time_seconds', x.time_seconds)
             order by r.date desc, r.name)
        from results x join races r on r.id = x.race_id
       where x.runner_id = me.id), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'name', g.name, 'date', g.date, 'end_date', g.end_date, 'place', g.place,
               'mine_created', g.created_by = me.id, 'race_type', g.race_type, 'circuit', g.circuit, 'suspended', g.suspended, 'subtype', g.subtype, 'km', g.km,
               'my_result', (select jsonb_build_object('position', e.self_position, 'podium_type', e.self_podium_type, 'time_seconds', e.self_time_seconds)
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

create or replace function public.runner_update_race(p_code text, p_id uuid, p_race jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_runner uuid; v_who text;
  v_name text := btrim(regexp_replace(coalesce(p_race->>'name',''), '\s+', ' ', 'g'));
  v_date date := nullif(p_race->>'date','')::date;
  v_end  date := nullif(nullif(p_race->>'end_date',''), p_race->>'date')::date;
  v_type text := coalesce(nullif(p_race->>'race_type',''), 'suelta');
  v_km   numeric := case when coalesce(p_race->>'km', '') ~ '^[0-9]+([.][0-9]+)?$' then (p_race->>'km')::numeric end;
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
  perform set_config('app.actor', '', true);
end $$;

create or replace function public.runner_delete_race(p_code text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_who text;
begin
  select id, name into v_runner, v_who from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if not exists (select 1 from races where id = p_id and created_by = v_runner) then
    raise exception 'no_es_tuya' using errcode = '42501';
  end if;
  if exists (select 1 from results where race_id = p_id and runner_id is distinct from v_runner) then
    raise exception 'otros_apuntados';
  end if;
  perform set_config('app.actor', v_who, true);
  delete from races where id = p_id;
  perform set_config('app.actor', '', true);
end $$;

revoke execute on function public.runner_update_race(text, uuid, jsonb), public.runner_delete_race(text, uuid) from public;
grant execute on function public.runner_update_race(text, uuid, jsonb), public.runner_delete_race(text, uuid) to anon, authenticated;
