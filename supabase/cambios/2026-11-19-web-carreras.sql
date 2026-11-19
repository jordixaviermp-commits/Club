-- =====================================================================
--  Cambio del 19/11/2026 (3): la web de cada carrera, para todos.
--  Cualquier corredor que conozca la web de una carrera la puede poner (si aún no la tiene) y le sale
--  a todos con un botón «Web de la carrera». Se puede poner al crearla, al guardarla en «Por valorar» o después.
--  Solo la cambia (o la quita) quien la puso, o la dirección. Al pasar a resultados, la web se conserva.
--  Se puede ejecutar más de una vez. Necesita antes 2026-11-19-por-valorar-en-carreras.sql.
-- =====================================================================
-- Web de la carrera: la puede poner cualquiera que la conozca (solo si está vacía; después solo quien la puso, o la dirección).
alter table public.registrations add column if not exists url text;
alter table public.registrations add column if not exists url_by uuid;
alter table public.races add column if not exists url text;
alter table public.registrations drop constraint if exists registrations_url_check;
alter table public.registrations add constraint registrations_url_check check (url is null or (length(url) <= 500 and url ~* '^https?://[^[:space:]]+$'));
alter table public.races drop constraint if exists races_url_check;
alter table public.races add constraint races_url_check check (url is null or (length(url) <= 500 and url ~* '^https?://[^[:space:]]+$'));

drop function if exists public.watch_publish(text, date, date, text, text, text, text, text, numeric);

create or replace function public.watch_publish(p_runner uuid, p_name text, p_date date, p_end date, p_place text, p_province text, p_country text, p_modality text, p_subtype text, p_km numeric, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare v_prev text := nullif(current_setting('app.skip_log', true), '');
begin
  if p_date < current_date then return; end if;
  if exists (select 1 from registrations where date = p_date and public.norm_name(name) = public.norm_name(p_name)) then
    -- ya existe: si no tenía web y este corredor la conoce, queda para todos
    if p_url is not null then
      perform set_config('app.skip_log', 'on', true);
      update registrations set url = p_url, url_by = p_runner where date = p_date and public.norm_name(name) = public.norm_name(p_name) and url is null;
      perform set_config('app.skip_log', coalesce(v_prev, 'off'), true);
    end if;
    return;
  end if;
  perform set_config('app.skip_log', 'on', true);
  begin
    insert into registrations (name, date, end_date, place, province, country, modality, subtype, km, candidate, url, url_by)
    values (p_name, p_date, p_end, p_place, p_province, coalesce(p_country, 'España'), p_modality, p_subtype, p_km, true, p_url, case when p_url is not null then p_runner end);
  exception when others then null;   -- si algún dato no encaja, la lista personal se guarda igual
  end;
  perform set_config('app.skip_log', coalesce(v_prev, 'off'), true);
end $$;

create or replace function public.runner_set_registration_url(p_code text, p_registration uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_url text := nullif(btrim(coalesce(p_url, '')), ''); v_n int;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if v_url is not null and (length(v_url) > 500 or v_url !~* '^https?://[^[:space:]]+$') then raise exception 'enlace_web_no_valido'; end if;
  perform set_config('app.skip_log', 'on', true);
  update registrations set url = v_url, url_by = case when v_url is null then null else v_runner end
   where id = p_registration and (url is null or url_by = v_runner);
  get diagnostics v_n = row_count;
  perform set_config('app.skip_log', 'off', true);
  if v_n = 0 then
    if exists (select 1 from registrations where id = p_registration) then raise exception 'web_ya_puesta'; end if;
    raise exception 'no_existe';
  end if;
end $$;

create or replace function public.runner_watch_save(p_code text, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_runner uuid; v_id uuid;
  v_name text := btrim(regexp_replace(coalesce(p_data->>'name',''), '\s+', ' ', 'g'));
  v_date date := nullif(p_data->>'date','')::date;
  v_end date := nullif(nullif(p_data->>'end_date',''), p_data->>'date')::date;
  v_deadline date := nullif(p_data->>'deadline','')::date;
  v_url text := nullif(btrim(coalesce(p_data->>'url','')), '');
  v_price numeric := nullif(btrim(coalesce(p_data->>'price','')), '')::numeric;
  v_km numeric := nullif(btrim(coalesce(p_data->>'km','')), '')::numeric;
  v_mod text := coalesce(nullif(p_data->>'modality',''), 'Carretera');
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'nombre_no_valido'; end if;
  if v_date is null or v_date < make_date(extract(year from current_date)::int - 1, 1, 1) or v_date > current_date + 730 then raise exception 'fecha_no_valida'; end if;
  if v_end is not null and (v_end < v_date or v_end > v_date + 30) then raise exception 'fecha_no_valida'; end if;
  if v_deadline is not null and (v_deadline > v_date or v_deadline < v_date - 730) then raise exception 'plazo_no_valido'; end if;
  if v_url is not null and (length(v_url) > 500 or v_url !~* '^https?://[^[:space:]]+$') then raise exception 'enlace_web_no_valido'; end if;
  if v_price is not null and (v_price < 0 or v_price > 10000) then raise exception 'precio_no_valido'; end if;
  if v_km is not null and (v_km <= 0 or v_km > 1000) then raise exception 'km_no_validos'; end if;
  if v_mod not in ('Carretera','BTT','Gravel','Ciclocross','Pista','Otra') then raise exception 'modalidad_no_valida'; end if;
  if p_id is null then
    select id into v_id from runner_watch where runner_id = v_runner and date = v_date and public.norm_name(name) = public.norm_name(v_name) limit 1;
    if v_id is not null then return v_id; end if;
    if (select count(*) from runner_watch where runner_id = v_runner) >= 60 then raise exception 'demasiadas_guardadas'; end if;
    insert into runner_watch (runner_id, name, date, end_date, place, province, country, modality, subtype, km, url, price, deadline, notes)
    values (v_runner, v_name, v_date, v_end, nullif(left(btrim(coalesce(p_data->>'place','')), 120), ''), nullif(left(btrim(coalesce(p_data->>'province','')), 60), ''),
            nullif(left(btrim(coalesce(p_data->>'country','')), 60), ''), v_mod, nullif(left(btrim(coalesce(p_data->>'subtype','')), 40), ''), v_km, v_url, v_price, v_deadline,
            nullif(left(btrim(coalesce(p_data->>'notes','')), 500), ''))
    returning id into v_id;
    perform public.watch_publish(v_runner, v_name, v_date, v_end, nullif(left(btrim(coalesce(p_data->>'place','')), 120), ''), nullif(left(btrim(coalesce(p_data->>'province','')), 60), ''),
                                 nullif(left(btrim(coalesce(p_data->>'country','')), 60), ''), v_mod, nullif(left(btrim(coalesce(p_data->>'subtype','')), 30), ''), v_km, v_url);
  else
    update runner_watch set name = v_name, date = v_date, end_date = v_end, place = nullif(left(btrim(coalesce(p_data->>'place','')), 120), ''),
           province = nullif(left(btrim(coalesce(p_data->>'province','')), 60), ''), country = nullif(left(btrim(coalesce(p_data->>'country','')), 60), ''), modality = v_mod,
           subtype = nullif(left(btrim(coalesce(p_data->>'subtype','')), 40), ''), km = v_km, url = v_url, price = v_price, deadline = v_deadline,
           notes = nullif(left(btrim(coalesce(p_data->>'notes','')), 500), '')
     where id = p_id and runner_id = v_runner returning id into v_id;
    if v_id is null then raise exception 'no_encontrada'; end if;
    perform public.watch_publish(v_runner, v_name, v_date, v_end, nullif(left(btrim(coalesce(p_data->>'place','')), 120), ''), nullif(left(btrim(coalesce(p_data->>'province','')), 60), ''),
                                 nullif(left(btrim(coalesce(p_data->>'country','')), 60), ''), v_mod, nullif(left(btrim(coalesce(p_data->>'subtype','')), 30), ''), v_km, v_url);
    perform public.watch_cleanup();
  end if;
  return v_id;
end $$;

create or replace function public.runner_create_registration(p_code text, p_reg jsonb, p_category text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_runner uuid; v_id uuid;
  v_name text := btrim(regexp_replace(coalesce(p_reg->>'name',''), '\s+', ' ', 'g'));
  v_date date := nullif(p_reg->>'date','')::date;
  v_end  date := nullif(nullif(p_reg->>'end_date',''), p_reg->>'date')::date;
  v_url  text := nullif(btrim(coalesce(p_reg->>'url','')), '');
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'nombre_no_valido'; end if;
  if v_date is null or v_date < make_date(extract(year from current_date)::int - 1, 1, 1) or v_date > current_date + 730 then raise exception 'fecha_no_valida'; end if;
  if v_end is not null and (v_end < v_date or v_end > v_date + 30) then raise exception 'fecha_no_valida'; end if;
  if v_url is not null and (length(v_url) > 500 or v_url !~* '^https?://[^[:space:]]+$') then raise exception 'enlace_web_no_valido'; end if;
  if (select count(*) from registrations where created_by = v_runner and created_at > now() - interval '1 day') >= 10 then
    raise exception 'demasiadas_carreras';
  end if;
  if v_date < current_date then
    select id into v_id from races where date = v_date and public.norm_name(name) = public.norm_name(v_name) limit 1;
    if v_id is not null then
      insert into results (race_id, runner_id, runner_name, category)
      select v_id, v_runner, name, nullif(p_category, '') from runners where id = v_runner
      on conflict (race_id, runner_id) do nothing;
      return v_id;
    end if;
  end if;
  select id into v_id from registrations where date = v_date and public.norm_name(name) = public.norm_name(v_name) limit 1;
  if v_id is null then
    insert into registrations (name, date, end_date, place, province, country, modality, notes, created_by, url, url_by)
    values (v_name, v_date, v_end,
            nullif(left(btrim(coalesce(p_reg->>'place','')), 120), ''), nullif(left(btrim(coalesce(p_reg->>'province','')), 60), ''),
            coalesce(nullif(left(btrim(coalesce(p_reg->>'country','')), 60), ''), 'España'),
            coalesce(nullif(p_reg->>'modality',''), 'Carretera'), nullif(left(btrim(coalesce(p_reg->>'notes','')), 500), ''), v_runner, v_url, case when v_url is not null then v_runner end)
    returning id into v_id;
  end if;
  if v_url is not null then update registrations set url = v_url, url_by = v_runner where id = v_id and url is null; end if;   -- la web que ponga, si aún no tenía
  insert into registration_entries (registration_id, runner_id, category)
  values (v_id, v_runner, nullif(p_category, ''))
  on conflict (registration_id, runner_id) do update set category = excluded.category;
  return v_id;
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
    insert into races (name, date, end_date, place, province, country, modality, notes, race_type, circuit, subtype, km, created_by, url)
    values (g.name, g.date, g.end_date, g.place, g.province, g.country, g.modality, g.notes, g.race_type, g.circuit, g.subtype, g.km, g.created_by, g.url)
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
               'mine_created', g.created_by = me.id, 'race_type', g.race_type, 'circuit', g.circuit, 'suspended', g.suspended, 'subtype', g.subtype, 'km', g.km, 'url', g.url, 'url_mine', coalesce(g.url_by = me.id, false),
               'my_result', (select jsonb_build_object('position', e.self_position, 'podium_type', e.self_podium_type, 'time_seconds', e.self_time_seconds)
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

revoke execute on function public.watch_publish(uuid, text, date, date, text, text, text, text, text, numeric, text) from public, anon;
grant execute on function public.runner_set_registration_url(text, uuid, text), public.runner_watch_save(text, uuid, jsonb), public.runner_create_registration(text, jsonb, text),
                          public.auto_promote_registrations(), public.runner_view(text) to anon, authenticated;
