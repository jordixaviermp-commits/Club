-- El corredor que creó una carrera puede marcarla como suspendida desde «Editar mi carrera».
-- Ejecutar entero en Supabase → SQL Editor.

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
  -- el creador puede marcarla como suspendida (la organización la anula): cuenta para el mínimo, no para el bono
  if p_reg ? 'suspended' then update registrations set suspended = coalesce((p_reg->>'suspended')::boolean, false) where id = p_id; end if;
end $$;

select 'suspender-propia ejecutada' as resultado;
