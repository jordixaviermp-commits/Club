-- =====================================================================
--  Cambio del 12/11/2026: los corredores pueden añadir o apuntarse a
--  carreras YA PASADAS (desde el 1 de enero del año anterior) que se
--  olvidaron de apuntar, y después poner su resultado.
--  Versión corta para pegar desde el móvil (equivale a ejecutar
--  supabase/schema.sql completo). Se puede ejecutar más de una vez.
--  Termina en la línea «grant execute … to anon, authenticated;».
-- =====================================================================

create or replace function public.runner_join(p_code text, p_registration uuid, p_category text)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  -- también carreras ya pasadas (desde el 1 de enero del año anterior): «la hice y no me apunté»
  if not exists (select 1 from registrations where id = p_registration and date >= make_date(extract(year from current_date)::int - 1, 1, 1)) then
    raise exception 'inscripcion_cerrada';
  end if;
  insert into registration_entries (registration_id, runner_id, category)
  values (p_registration, v_runner, nullif(p_category,''))
  on conflict (registration_id, runner_id) do update set category = excluded.category;
end $$;

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
    select id into v_id from races where date = v_date and lower(name) = lower(v_name) limit 1;
    if v_id is not null then
      insert into results (race_id, runner_id, runner_name, category)
      select v_id, v_runner, name, nullif(p_category, '') from runners where id = v_runner
      on conflict (race_id, runner_id) do nothing;
      return v_id;
    end if;
  end if;
  select id into v_id from registrations where date = v_date and lower(name) = lower(v_name) limit 1;
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

create or replace function public.runner_update_registration(p_code text, p_id uuid, p_reg jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_runner uuid;
  v_name text := btrim(regexp_replace(coalesce(p_reg->>'name',''), '\s+', ' ', 'g'));
  v_date date := nullif(p_reg->>'date','')::date;
  v_end  date := nullif(nullif(p_reg->>'end_date',''), p_reg->>'date')::date;
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
end $$;

create or replace function public.runner_join_race(p_code text, p_race uuid, p_category text)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_name text;
begin
  select id, name into v_runner, v_name from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if not exists (select 1 from races where id = p_race and date <= current_date and date >= make_date(extract(year from current_date)::int - 1, 1, 1)) then
    raise exception 'inscripcion_cerrada';
  end if;
  insert into results (race_id, runner_id, runner_name, category)
  values (p_race, v_runner, v_name, nullif(p_category, ''))
  on conflict (race_id, runner_id) do nothing;
end $$;

create or replace function public.runner_leave(p_code text, p_registration uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  -- una ya pasada solo si aún no ha puesto su resultado
  if not exists (select 1 from registrations g where g.id = p_registration and g.date >= make_date(extract(year from current_date)::int - 1, 1, 1)
                   and (g.date >= current_date or not exists (select 1 from registration_entries e where e.registration_id = g.id
                                                                and e.runner_id = v_runner and e.self_position is not null))) then
    raise exception 'inscripcion_cerrada';
  end if;
  delete from registration_entries where registration_id = p_registration and runner_id = v_runner;
end $$;

grant execute on function public.runner_join(text, uuid, text), public.runner_create_registration(text, jsonb, text),
                          public.runner_update_registration(text, uuid, jsonb), public.runner_join_race(text, uuid, text),
                          public.runner_leave(text, uuid) to anon, authenticated;
