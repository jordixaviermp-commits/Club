-- Cualquier corredor puede cambiar los datos de una carrera (nombre, fecha, lugar, disciplina, km, desnivel, precio, formato…), no solo quien la añadió.
-- También: «Deshacer» una crónica la deja pendiente para todos, no solo para quien la marcó.
-- Cada cambio queda en el «Historial de cambios» de la dirección con el nombre de quien lo hizo. Borrar una carrera sigue siendo solo de quien la añadió.
-- Ejecutar entero en Supabase → SQL Editor.
create or replace function public.runner_update_registration(p_code text, p_id uuid, p_reg jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_runner uuid; v_who text;
  v_name text := btrim(regexp_replace(coalesce(p_reg->>'name',''), '\s+', ' ', 'g'));
  v_date date := nullif(p_reg->>'date','')::date;
  v_end  date := nullif(nullif(p_reg->>'end_date',''), p_reg->>'date')::date;
  v_elev int := case when coalesce(p_reg->>'elevation','') ~ '^[0-9]{1,5}$' and (p_reg->>'elevation')::int between 1 and 10000 then (p_reg->>'elevation')::int end;
  v_price numeric := case when coalesce(p_reg->>'price','') ~ '^[0-9]{1,5}([.][0-9]{1,2})?$' and (p_reg->>'price')::numeric <= 10000 then (p_reg->>'price')::numeric end;
begin
  select id, name into v_runner, v_who from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if not exists (select 1 from registrations where id = p_id) then raise exception 'no_existe'; end if;
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'nombre_no_valido'; end if;
  if v_date is null or v_date < make_date(extract(year from current_date)::int - 1, 1, 1) or v_date > current_date + 730 then raise exception 'fecha_no_valida'; end if;
  if v_end is not null and (v_end < v_date or v_end > v_date + 30) then raise exception 'fecha_no_valida'; end if;
  if exists (select 1 from registrations where id <> p_id and date = v_date and lower(name) = lower(v_name)) then
    raise exception 'ya_existe';
  end if;
  perform set_config('app.actor', v_who, true);   -- el historial dice quién lo cambió
  update registrations set name = v_name, date = v_date, end_date = v_end,
    place = nullif(left(btrim(coalesce(p_reg->>'place','')), 120), ''),
    province = nullif(left(btrim(coalesce(p_reg->>'province','')), 60), ''),
    country = coalesce(nullif(left(btrim(coalesce(p_reg->>'country','')), 60), ''), 'España'),
    modality = coalesce(nullif(p_reg->>'modality',''), 'Carretera'),
    notes = nullif(left(btrim(coalesce(p_reg->>'notes','')), 500), '')
  where id = p_id;
  if p_reg ? 'elevation' then update registrations set elevation = v_elev where id = p_id; end if;
  if p_reg ? 'price' then update registrations set price = v_price where id = p_id; end if;
  perform set_config('app.actor', '', true);
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
  if not exists (select 1 from races where id = p_id) then raise exception 'no_existe'; end if;
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

create or replace function public.runner_set_race_type(p_code text, p_id uuid, p_type text, p_circuit text)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_who text; v_type text := coalesce(nullif(p_type, ''), 'suelta');
begin
  select id, name into v_runner, v_who from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  perform set_config('app.actor', v_who, true);
  update registrations set race_type = v_type,
         circuit = case when v_type = 'circuito' then nullif(left(btrim(coalesce(p_circuit, '')), 120), '') end
   where id = p_id;
  if not found then raise exception 'no_existe'; end if;
  perform set_config('app.actor', '', true);
end $$;

create or replace function public.runner_set_race_details(p_code text, p_id uuid, p_subtype text, p_km numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_who text;
begin
  select id, name into v_runner, v_who from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  perform set_config('app.actor', v_who, true);
  update registrations set subtype = nullif(left(btrim(coalesce(p_subtype, '')), 30), ''),
         km = case when p_km > 0 and p_km <= 1000 then round(p_km, 1) end
   where id = p_id;
  if not found then raise exception 'no_existe'; end if;
  perform set_config('app.actor', '', true);
end $$;

-- «Deshacer» una crónica quita la marca de la carrera para todos (basta con que la pase uno; si se deshace, vuelve a estar pendiente para todos).
create or replace function public.runner_chronicle_set(p_code text, p_key text, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if p_key is null or length(p_key) not between 3 and 200 then raise exception 'datos_no_validos'; end if;
  if coalesce(p_done, true) then
    insert into chronicles (runner_id, race_key) values (v_runner, p_key) on conflict do nothing;
  else
    delete from chronicles where race_key = p_key;
  end if;
end $$;

select 'editar-todos ejecutada' as resultado;
