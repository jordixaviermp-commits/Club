-- La crónica puede llevar los resultados de TODOS los del club que corrieron la carrera: al enviarla, los que aún no habían puesto el suyo quedan puestos.
-- Dos trozos cortos (se pueden repetir). Sustituyen a la función de enviar crónica que ya tienes.

-- ===== TROZO 1: quién corrió con quién (y qué resultado tiene cada uno) =====
create or replace function public.runner_race_group(p_code text, p_kind text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if p_kind = 'reg' then
    if not exists (select 1 from registration_entries where registration_id = p_id and runner_id = v_runner) then raise exception 'no_es_tuya' using errcode = '42501'; end if;
    return coalesce((select jsonb_agg(jsonb_build_object('runner_id', e.runner_id, 'name', r.name, 'category', e.category, 'position', e.self_position,
                      'general', e.self_general_position, 'time', e.self_time_seconds, 'me', e.runner_id = v_runner) order by (e.runner_id = v_runner) desc, r.name)
                      from registration_entries e join runners r on r.id = e.runner_id where e.registration_id = p_id), '[]'::jsonb);
  elsif p_kind = 'race' then
    if not exists (select 1 from results where race_id = p_id and runner_id = v_runner) then raise exception 'no_es_tuya' using errcode = '42501'; end if;
    return coalesce((select jsonb_agg(jsonb_build_object('runner_id', x.runner_id, 'name', x.runner_name, 'category', x.category, 'position', x.position,
                      'general', x.general_position, 'time', x.time_seconds, 'me', x.runner_id = v_runner) order by (x.runner_id = v_runner) desc, x.runner_name)
                      from results x where x.race_id = p_id and x.runner_id is not null), '[]'::jsonb);
  end if;
  raise exception 'tipo_no_valido';
end $$;
grant execute on function public.runner_race_group(text, text, uuid) to anon, authenticated;

-- ===== TROZO 2: enviar la crónica con los resultados de los compañeros =====
drop function if exists public.runner_chronicle_send(text, text, text, date, text, text, text);
create or replace function public.runner_chronicle_send(p_code text, p_key text, p_name text, p_date date, p_body text, p_p1 text, p_p2 text,
                                                         p_kind text default null, p_id uuid default null, p_results jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_who text; v_post uuid; v_st text; v_n int; it jsonb; v_rid uuid; v_pos int; v_gen int; v_time int;
begin
  select id, name into v_runner, v_who from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if p_key is null or length(p_key) not between 3 and 200 or length(trim(coalesce(p_body, ''))) not between 1 and 4000 or length(coalesce(p_name, '')) > 200 then raise exception 'datos_no_validos'; end if;
  select id, status into v_post, v_st from chronicle_posts where runner_id = v_runner and race_key = p_key;
  if v_st is not null and v_st <> 'enviada' then raise exception 'ya_en_proceso'; end if;
  -- resultados de los compañeros: solo se rellenan los que aún no tienen el suyo (nunca se pisa uno puesto)
  if jsonb_typeof(p_results) = 'array' and p_kind in ('reg', 'race') and p_id is not null then
    if not (case when p_kind = 'reg' then exists (select 1 from registration_entries where registration_id = p_id and runner_id = v_runner)
                 else exists (select 1 from results where race_id = p_id and runner_id = v_runner) end) then raise exception 'no_es_tuya' using errcode = '42501'; end if;
    for it in select * from jsonb_array_elements(p_results) loop
      v_rid := (it->>'runner_id')::uuid; v_pos := (it->>'position')::int; v_gen := (it->>'general')::int; v_time := (it->>'time')::int;
      if v_rid = v_runner then continue; end if;
      if v_pos is null or v_pos < 1 or v_pos > 999 or v_gen is null or v_gen < v_pos or v_gen > 9999 or v_time is null or v_time < 1 or v_time > 3600000 then raise exception 'datos_no_validos'; end if;
      if p_kind = 'reg' then
        update registration_entries set self_position = v_pos, self_general_position = v_gen, self_time_seconds = v_time, self_reported_at = now(),
               self_podium_type = case when v_pos between 1 and 3 then coalesce(self_podium_type, 'suelta') else null end
         where registration_id = p_id and runner_id = v_rid and self_position is null;
      else
        update results set position = v_pos, general_position = v_gen, time_seconds = v_time, self_reported = true
         where race_id = p_id and runner_id = v_rid and position is null;
      end if;
      get diagnostics v_n = row_count;
      if v_n > 0 then
        perform public.log_change(v_who, 'result', p_id, 'resultado', format('puso el resultado de %s: %sº en %s', (select name from runners where id = v_rid), v_pos, p_name));
      end if;
    end loop;
  end if;
  if v_post is null then
    insert into chronicle_posts (runner_id, race_key, race_name, race_date, body) values (v_runner, p_key, coalesce(nullif(trim(p_name), ''), 'Carrera'), p_date, trim(p_body)) returning id into v_post;
  else
    update chronicle_posts set body = trim(p_body), updated_at = now() where id = v_post;
  end if;
  if p_p1 is not null or p_p2 is not null then
    delete from chronicle_photos where post_id = v_post;
    if p_p1 is not null then insert into chronicle_photos (post_id, ord, data) values (v_post, 1, p_p1); end if;
    if p_p2 is not null then insert into chronicle_photos (post_id, ord, data) values (v_post, case when p_p1 is null then 1 else 2 end, p_p2); end if;
  end if;
  select count(*) into v_n from chronicle_photos where post_id = v_post;
  update chronicle_posts set photos = v_n where id = v_post;
  insert into chronicles (runner_id, race_key) values (v_runner, p_key) on conflict do nothing;
end $$;
grant execute on function public.runner_chronicle_send(text, text, text, date, text, text, text, text, uuid, jsonb) to anon, authenticated;
