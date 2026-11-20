-- =====================================================================
--  Cambio del 20/11/2026 · «Repetir el año que viene» en Por valorar
--  Una carrera guardada para el año siguiente lleva la marca «📅 Fecha por confirmar» al principio de las notas
--  (la fecha es una estimación). Mientras la lleve, NO se publica en Carreras para el resto del equipo.
--  Al quitar la marca (editando la carrera), se publica como siempre. Se puede ejecutar más de una vez.
-- =====================================================================

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
  v_elev int := nullif(btrim(coalesce(p_data->>'elevation','')), '')::int;
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
  if v_elev is not null and (v_elev <= 0 or v_elev > 10000) then raise exception 'desnivel_no_valido'; end if;
  if v_mod not in ('Carretera','BTT','Gravel','Ciclocross','Pista','Otra') then raise exception 'modalidad_no_valida'; end if;
  if p_id is null then
    select id into v_id from runner_watch where runner_id = v_runner and date = v_date and public.norm_name(name) = public.norm_name(v_name) limit 1;
    if v_id is not null then return v_id; end if;
    if (select count(*) from runner_watch where runner_id = v_runner) >= 60 then raise exception 'demasiadas_guardadas'; end if;
    insert into runner_watch (runner_id, name, date, end_date, place, province, country, modality, subtype, km, url, price, deadline, notes, elevation)
    values (v_runner, v_name, v_date, v_end, nullif(left(btrim(coalesce(p_data->>'place','')), 120), ''), nullif(left(btrim(coalesce(p_data->>'province','')), 60), ''),
            nullif(left(btrim(coalesce(p_data->>'country','')), 60), ''), v_mod, nullif(left(btrim(coalesce(p_data->>'subtype','')), 40), ''), v_km, v_url, v_price, v_deadline,
            nullif(left(btrim(coalesce(p_data->>'notes','')), 500), ''), v_elev)
    returning id into v_id;
    if coalesce(p_data->>'notes','') not like '📅 Fecha por confirmar%' then   -- fecha estimada del año siguiente: no se publica en Carreras hasta que se confirme
    perform public.watch_publish(v_runner, v_name, v_date, v_end, nullif(left(btrim(coalesce(p_data->>'place','')), 120), ''), nullif(left(btrim(coalesce(p_data->>'province','')), 60), ''),
                                   nullif(left(btrim(coalesce(p_data->>'country','')), 60), ''), v_mod, nullif(left(btrim(coalesce(p_data->>'subtype','')), 30), ''), v_km, v_url, v_elev, v_price);
    end if;
  else
    update runner_watch set name = v_name, date = v_date, end_date = v_end, place = nullif(left(btrim(coalesce(p_data->>'place','')), 120), ''),
           province = nullif(left(btrim(coalesce(p_data->>'province','')), 60), ''), country = nullif(left(btrim(coalesce(p_data->>'country','')), 60), ''), modality = v_mod,
           subtype = nullif(left(btrim(coalesce(p_data->>'subtype','')), 40), ''), km = v_km, url = v_url, price = v_price, deadline = v_deadline,
           notes = nullif(left(btrim(coalesce(p_data->>'notes','')), 500), ''), elevation = v_elev
     where id = p_id and runner_id = v_runner returning id into v_id;
    if v_id is null then raise exception 'no_encontrada'; end if;
    if coalesce(p_data->>'notes','') not like '📅 Fecha por confirmar%' then   -- fecha estimada del año siguiente: no se publica en Carreras hasta que se confirme
    perform public.watch_publish(v_runner, v_name, v_date, v_end, nullif(left(btrim(coalesce(p_data->>'place','')), 120), ''), nullif(left(btrim(coalesce(p_data->>'province','')), 60), ''),
                                   nullif(left(btrim(coalesce(p_data->>'country','')), 60), ''), v_mod, nullif(left(btrim(coalesce(p_data->>'subtype','')), 30), ''), v_km, v_url, v_elev, v_price);
    end if;
    perform public.watch_cleanup();
  end if;
  return v_id;
end $$;

-- (create or replace conserva los permisos que ya tenía la función)
