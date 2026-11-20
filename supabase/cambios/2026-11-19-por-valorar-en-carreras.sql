-- =====================================================================
--  Cambio del 19/11/2026 (2): las carreras de «Por valorar» se crean también en Carreras.
--  Cuando un corredor guarda una carrera en «Por valorar», se crea (si no existe) en Carreras
--  sin inscritos y sin dueño, para que otro la encuentre ya con sus datos y no se duplique
--  cuando varios se inscriben. Solo se publica la carrera; web, precio, plazo y notas siguen siendo privados.
--  Además, los duplicados se detectan sin importar mayúsculas, tildes ni signos. Se puede ejecutar más de una vez.
--  Necesita antes 2026-11-19-por-valorar.sql.
-- =====================================================================
alter table public.registrations add column if not exists candidate boolean default false;

-- Nombre para comparar: sin mayúsculas, tildes ni signos («Gran Fondo Monzón» = «gran fondo monzon»).
create or replace function public.norm_name(t text)
returns text language sql immutable as $$
  select regexp_replace(translate(lower(coalesce(t, '')), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc'), '[^a-z0-9]', '', 'g')
$$;

create or replace function public.watch_publish(p_name text, p_date date, p_end date, p_place text, p_province text, p_country text, p_modality text, p_subtype text, p_km numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_prev text := nullif(current_setting('app.skip_log', true), '');
begin
  if p_date < current_date then return; end if;
  if exists (select 1 from registrations where date = p_date and public.norm_name(name) = public.norm_name(p_name)) then return; end if;
  perform set_config('app.skip_log', 'on', true);
  begin
    insert into registrations (name, date, end_date, place, province, country, modality, subtype, km, candidate)
    values (p_name, p_date, p_end, p_place, p_province, coalesce(p_country, 'España'), p_modality, p_subtype, p_km, true);
  exception when others then null;   -- si algún dato no encaja, la lista personal se guarda igual
  end;
  perform set_config('app.skip_log', coalesce(v_prev, 'off'), true);
end $$;

-- Borra las candidatas sin inscritos que ya nadie tiene en «Por valorar» (o cuya fecha ya pasó).
create or replace function public.watch_cleanup()
returns void language plpgsql security definer set search_path = public as $$
declare v_prev text := nullif(current_setting('app.skip_log', true), '');
begin
  perform set_config('app.skip_log', 'on', true);
  delete from registrations g
   where coalesce(g.candidate, false)
     and not exists (select 1 from registration_entries e where e.registration_id = g.id)
     and (g.date < current_date
          or not exists (select 1 from runner_watch w where w.date = g.date and public.norm_name(w.name) = public.norm_name(g.name)));
  perform set_config('app.skip_log', coalesce(v_prev, 'off'), true);
end $$;

-- En cuanto alguien se apunta, deja de ser «candidata»: es una inscripción normal.
create or replace function public.reg_entry_clears_candidate()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prev text := nullif(current_setting('app.skip_log', true), '');
begin
  perform set_config('app.skip_log', 'on', true);
  update registrations set candidate = false where id = new.registration_id and coalesce(candidate, false);
  perform set_config('app.skip_log', coalesce(v_prev, 'off'), true);
  return new;
end $$;
drop trigger if exists reg_entry_candidate on public.registration_entries;
create trigger reg_entry_candidate after insert on public.registration_entries for each row execute function public.reg_entry_clears_candidate();


create or replace function public.runner_create_registration(p_code text, p_reg jsonb, p_category text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_runner uuid; v_id uuid;
  v_name text := btrim(regexp_replace(coalesce(p_reg->>'name',''), '\s+', ' ', 'g'));
  v_date date := nullif(p_reg->>'date','')::date;
  v_end  date := nullif(nullif(p_reg->>'end_date',''), p_reg->>'date')::date;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'nombre_no_valido'; end if;
  if v_date is null or v_date < make_date(extract(year from current_date)::int - 1, 1, 1) or v_date > current_date + 730 then raise exception 'fecha_no_valida'; end if;
  if v_end is not null and (v_end < v_date or v_end > v_date + 30) then raise exception 'fecha_no_valida'; end if;
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
    insert into registrations (name, date, end_date, place, province, country, modality, notes, created_by)
    values (v_name, v_date, v_end,
            nullif(left(btrim(coalesce(p_reg->>'place','')), 120), ''), nullif(left(btrim(coalesce(p_reg->>'province','')), 60), ''),
            coalesce(nullif(left(btrim(coalesce(p_reg->>'country','')), 60), ''), 'España'),
            coalesce(nullif(p_reg->>'modality',''), 'Carretera'), nullif(left(btrim(coalesce(p_reg->>'notes','')), 500), ''), v_runner)
    returning id into v_id;
  end if;
  insert into registration_entries (registration_id, runner_id, category)
  values (v_id, v_runner, nullif(p_category, ''))
  on conflict (registration_id, runner_id) do update set category = excluded.category;
  return v_id;
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
    perform public.watch_publish(v_name, v_date, v_end, nullif(left(btrim(coalesce(p_data->>'place','')), 120), ''), nullif(left(btrim(coalesce(p_data->>'province','')), 60), ''),
                                 nullif(left(btrim(coalesce(p_data->>'country','')), 60), ''), v_mod, nullif(left(btrim(coalesce(p_data->>'subtype','')), 30), ''), v_km);
  else
    update runner_watch set name = v_name, date = v_date, end_date = v_end, place = nullif(left(btrim(coalesce(p_data->>'place','')), 120), ''),
           province = nullif(left(btrim(coalesce(p_data->>'province','')), 60), ''), country = nullif(left(btrim(coalesce(p_data->>'country','')), 60), ''), modality = v_mod,
           subtype = nullif(left(btrim(coalesce(p_data->>'subtype','')), 40), ''), km = v_km, url = v_url, price = v_price, deadline = v_deadline,
           notes = nullif(left(btrim(coalesce(p_data->>'notes','')), 500), '')
     where id = p_id and runner_id = v_runner returning id into v_id;
    if v_id is null then raise exception 'no_encontrada'; end if;
    perform public.watch_publish(v_name, v_date, v_end, nullif(left(btrim(coalesce(p_data->>'place','')), 120), ''), nullif(left(btrim(coalesce(p_data->>'province','')), 60), ''),
                                 nullif(left(btrim(coalesce(p_data->>'country','')), 60), ''), v_mod, nullif(left(btrim(coalesce(p_data->>'subtype','')), 30), ''), v_km);
    perform public.watch_cleanup();
  end if;
  return v_id;
end $$;

create or replace function public.runner_watch_delete(p_code text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  delete from runner_watch where id = p_id and runner_id = v_runner;
  perform public.watch_cleanup();
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
  perform public.watch_cleanup();   -- quita las «candidatas» (de Por valorar) que ya nadie valora o que ya pasaron sin inscritos
  perform set_config('app.skip_log', 'off', true);
  return v_n;
end $$;

-- Lo que ya estaba guardado en «Por valorar» también pasa a Carreras.
do $$
declare w runner_watch;
begin
  for w in select * from runner_watch where date >= current_date loop
    perform public.watch_publish(w.name, w.date, w.end_date, w.place, w.province, w.country, w.modality, left(w.subtype, 30), w.km);
  end loop;
end $$;

revoke execute on function public.norm_name(text), public.watch_publish(text, date, date, text, text, text, text, text, numeric), public.watch_cleanup(), public.reg_entry_clears_candidate() from public, anon;
grant execute on function public.runner_create_registration(text, jsonb, text), public.runner_watch_save(text, uuid, jsonb), public.runner_watch_delete(text, uuid), public.auto_promote_registrations() to anon, authenticated;
