-- =====================================================================
--  Cambio del 11/11/2026: los corredores pueden editar o borrar las
--  carreras que han creado ellos (solo datos; no resultados).
--  Versión corta para pegar desde el móvil (equivale a ejecutar
--  supabase/schema.sql completo). Se puede ejecutar más de una vez.
--  Termina en la línea «grant execute … to anon, authenticated;».
-- =====================================================================

create or replace function public.runner_view(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me runners; v_year int := extract(year from current_date)::int; v_cfg jsonb;
begin
  select * into me from runners where code = p_code;
  if not found then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  select value -> v_year::text into v_cfg from settings where key = 'bonus';
  return jsonb_build_object(
    'me', jsonb_build_object('id', me.id, 'name', me.name, 'category', me.category),
    'today', current_date,
    -- Su bono de la temporada: solo lo suyo (sin la lista de quién es nuevo).
    -- Cada día de competición cuenta como una carrera (una de 3 días = 3).
    'bonus', jsonb_build_object(
      'year', v_year,
      'done', (select coalesce(sum(coalesce(r.end_date - r.date, 0) + 1), 0)
                 from results x join races r on r.id = x.race_id
                where x.runner_id = me.id and extract(year from r.date) = v_year),
      'planned', (select coalesce(sum(coalesce(g.end_date - g.date, 0) + 1), 0)
                    from registration_entries e join registrations g on g.id = e.registration_id
                   where e.runner_id = me.id and extract(year from g.date) = v_year),
      'config', v_cfg - 'nuevos',
      'contract', me.contract,
      'nuevo', coalesce(me.contract = 'nuevo' or (me.contract is null and v_cfg -> 'nuevos' ? me.id::text), false)),
    -- Sus propias carreras con resultados (todas las temporadas), para su lista «Mis carreras».
    'my_results', coalesce((
      select jsonb_agg(jsonb_build_object(
               'race_id', r.id, 'name', r.name, 'date', r.date, 'end_date', r.end_date, 'place', r.place,
               'province', r.province, 'country', r.country, 'modality', r.modality, 'stages', r.stages,
               'category', x.category, 'position', x.position, 'podium_type', x.podium_type,
               'stage_positions', x.stage_positions)
             order by r.date desc, r.name)
        from results x join races r on r.id = x.race_id
       where x.runner_id = me.id), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'name', g.name, 'date', g.date, 'end_date', g.end_date, 'place', g.place,
               'mine_created', g.created_by = me.id,
               'province', g.province, 'country', g.country, 'modality', g.modality, 'notes', g.notes,
               'entries', coalesce((
                  select jsonb_agg(jsonb_build_object('runner_id', r.id, 'name', r.name, 'category', e.category)
                                   order by r.name)
                    from registration_entries e join runners r on r.id = e.runner_id
                   where e.registration_id = g.id), '[]'::jsonb))
             order by g.date, g.name)
        from registrations g), '[]'::jsonb));
end $$;

-- Un corredor corrige los datos de una carrera que creó él (no resultados ni podios).
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
  if v_date is null or v_date < current_date - 60 or v_date > current_date + 730 then raise exception 'fecha_no_valida'; end if;
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

-- Un corredor borra una carrera que creó él, solo si no hay otros compañeros apuntados.
create or replace function public.runner_delete_registration(p_code text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if not exists (select 1 from registrations where id = p_id and created_by = v_runner) then
    raise exception 'no_es_tuya' using errcode = '42501';
  end if;
  if exists (select 1 from registration_entries where registration_id = p_id and runner_id <> v_runner) then
    raise exception 'otros_apuntados';
  end if;
  delete from registrations where id = p_id;
end $$;

revoke execute on function public.runner_update_registration(text, uuid, jsonb), public.runner_delete_registration(text, uuid) from public;
grant execute on function public.runner_view(text), public.runner_update_registration(text, uuid, jsonb),
                          public.runner_delete_registration(text, uuid) to anon, authenticated;
