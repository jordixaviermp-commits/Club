-- Crónica de grupo + abandonos.
-- 1) La crónica puede llevar los resultados de TODOS los del club que corrieron (los 2 primeros días cada uno pone el suyo; desde el tercero, cualquiera pone los que falten).
-- 2) Se puede marcar «Abandonó» (cuenta como carrera hecha, sin puesto ni tiempo), en el resultado de cada uno y en la crónica de grupo.
-- SEIS trozos cortos (se pueden repetir). Pégalos EN ORDEN. Los trozos 2, 5 y 6 sustituyen a funciones que ya tienes.

-- ===== TROZO 1: columnas de «abandonó» =====
alter table public.results add column if not exists dnf boolean not null default false;   -- abandonó: cuenta como carrera hecha, sin puesto ni tiempo
alter table public.registration_entries add column if not exists self_dnf boolean not null default false;

-- ===== TROZO 2: poner el resultado (ahora también «abandonó») =====
drop function if exists public.runner_report_result(text, text, uuid, int, text, text, int);
create or replace function public.runner_report_result(p_code text, p_kind text, p_id uuid, p_position int,
                                                       p_category text, p_podium_type text, p_time int default null, p_dnf boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_who text; v_old int; v_dnf boolean := coalesce(p_dnf, false);
        v_pos int := case when coalesce(p_dnf, false) then null else p_position end;
        v_time int := case when coalesce(p_dnf, false) then null else p_time end;
        v_pod text := case when not coalesce(p_dnf, false) and p_position between 1 and 3 then coalesce(nullif(p_podium_type,''), 'suelta') else null end;
begin
  select id, name into v_runner, v_who from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if not v_dnf and (p_position is null or p_position < 1 or p_position > 999) then raise exception 'puesto_no_valido'; end if;
  if v_time is not null and (v_time < 1 or v_time > 3600000) then raise exception 'tiempo_no_valido'; end if;  -- segundos: de 1 s a 1000 h
  if p_kind = 'reg' then
    if exists (select 1 from registrations where id = p_id and suspended) then raise exception 'carrera_suspendida'; end if;
    if not exists (select 1 from registration_entries e join registrations g on g.id = e.registration_id
                    where e.registration_id = p_id and e.runner_id = v_runner and g.date <= current_date) then
      raise exception 'no_es_tuya' using errcode = '42501';
    end if;
    select self_position into v_old from registration_entries where registration_id = p_id and runner_id = v_runner;
    update registration_entries set self_position = v_pos, self_dnf = v_dnf, self_podium_type = v_pod, self_reported_at = now(), self_time_seconds = v_time,
           self_general_position = case when v_dnf then null else self_general_position end,
           category = coalesce(nullif(p_category, ''), category)
     where registration_id = p_id and runner_id = v_runner;
    perform public.log_change(v_who, 'result', p_id, 'resultado',
      case when v_dnf then format('marcó que abandonó en %s', (select name from registrations where id = p_id))
           when v_old is null then format('puso su resultado: %sº en %s', p_position, (select name from registrations where id = p_id))
           else format('cambió su resultado: %sº → %sº en %s', v_old, p_position, (select name from registrations where id = p_id)) end);
  elsif p_kind = 'race' then
    if not exists (select 1 from results where race_id = p_id and runner_id = v_runner) then
      raise exception 'no_es_tuya' using errcode = '42501';
    end if;
    select position into v_old from results where race_id = p_id and runner_id = v_runner;
    update results set position = v_pos, dnf = v_dnf, podium_type = coalesce(v_pod, 'suelta'), self_reported = true, time_seconds = v_time,
           general_position = case when v_dnf then null else general_position end,
           category = coalesce(nullif(p_category, ''), category)
     where race_id = p_id and runner_id = v_runner;
    perform public.log_change(v_who, 'result', p_id, 'resultado',
      case when v_dnf then format('marcó que abandonó en %s', (select name from races where id = p_id))
           when v_old is null then format('puso su resultado: %sº en %s', p_position, (select name from races where id = p_id))
           else format('cambió su resultado: %sº → %sº en %s', v_old, p_position, (select name from races where id = p_id)) end);
  else
    raise exception 'tipo_no_valido';
  end if;
  delete from correction_requests where runner_id = v_runner and target_id = p_id and status = 'pendiente';
end $$;
grant execute on function public.runner_report_result(text, text, uuid, int, text, text, int, boolean) to anon, authenticated;

-- ===== TROZO 3: que lo que ya existía cuente el abandono como resultado puesto (se hace una sola vez) =====
do $do$
declare p jsonb := $j$[
 {"fn": "public.runner_view(text)", "from": "e.self_position is not null", "to": "(e.self_position is not null or e.self_dnf)"},
 {"fn": "public.runner_view(text)", "from": "e.self_position is null", "to": "(e.self_position is null and not e.self_dnf)"},
 {"fn": "public.runner_view(text)", "from": "'time_seconds', e.self_time_seconds)", "to": "'time_seconds', e.self_time_seconds, 'dnf', e.self_dnf)"},
 {"fn": "public.runner_view(text)", "from": "'self_reported', x.self_reported, 'time_seconds', x.time_seconds)", "to": "'self_reported', x.self_reported, 'time_seconds', x.time_seconds, 'dnf', x.dnf)"},
 {"fn": "public.runner_streaks(text)", "from": "res.position is not null", "to": "(res.position is not null or res.dnf)"},
 {"fn": "public.runner_streaks(text)", "from": "e.self_position is not null", "to": "(e.self_position is not null or e.self_dnf)"},
 {"fn": "public.runner_leave(text,uuid)", "from": "e.self_position is not null", "to": "(e.self_position is not null or e.self_dnf)"},
 {"fn": "public.auto_promote_registrations()", "from": "e.self_position is not null", "to": "(e.self_position is not null or e.self_dnf)"},
 {"fn": "public.auto_promote_registrations()", "from": "position, podium_type, self_reported, time_seconds)", "to": "position, podium_type, self_reported, time_seconds, dnf)"},
 {"fn": "public.auto_promote_registrations()", "from": "e.self_time_seconds\n", "to": "e.self_time_seconds, e.self_dnf\n"},
 {"fn": "public.promote_registration(uuid)", "from": "position, podium_type, self_reported, time_seconds)", "to": "position, podium_type, self_reported, time_seconds, dnf)"},
 {"fn": "public.promote_registration(uuid)", "from": "e.self_position is not null,", "to": "(e.self_position is not null or e.self_dnf),"},
 {"fn": "public.promote_registration(uuid)", "from": "e.self_time_seconds\n", "to": "e.self_time_seconds, e.self_dnf\n"},
 {"fn": "public.save_race(jsonb,jsonb)", "from": "position, podium_type, stage_positions, self_reported, time_seconds)", "to": "position, podium_type, stage_positions, self_reported, time_seconds, dnf)"},
 {"fn": "public.save_race(jsonb,jsonb)", "from": "nullif(x->>'time_seconds','')::int\n", "to": "nullif(x->>'time_seconds','')::int, coalesce((x->>'dnf')::boolean, false)\n"}
]$j$; sig text; f text; x jsonb;
begin
  for sig in select distinct e->>'fn' from jsonb_array_elements(p) e loop
    f := pg_get_functiondef(sig::regprocedure);
    if f like '%dnf%' then continue; end if;
    for x in select value from jsonb_array_elements(p) with ordinality o(value, n) where value->>'fn' = sig order by n loop
      f := replace(f, x->>'from', x->>'to');
    end loop;
    execute f;
  end loop;
end $do$;

-- ===== TROZO 4: quién corrió con quién (y qué resultado tiene cada uno) =====
create or replace function public.runner_race_group(p_code text, p_kind text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if p_kind = 'reg' then
    if not exists (select 1 from registration_entries where registration_id = p_id and runner_id = v_runner) then raise exception 'no_es_tuya' using errcode = '42501'; end if;
    return coalesce((select jsonb_agg(jsonb_build_object('runner_id', e.runner_id, 'name', r.name, 'category', e.category, 'position', e.self_position,
                      'general', e.self_general_position, 'time', e.self_time_seconds, 'dnf', e.self_dnf, 'me', e.runner_id = v_runner) order by (e.runner_id = v_runner) desc, r.name)
                      from registration_entries e join runners r on r.id = e.runner_id where e.registration_id = p_id), '[]'::jsonb);
  elsif p_kind = 'race' then
    if not exists (select 1 from results where race_id = p_id and runner_id = v_runner) then raise exception 'no_es_tuya' using errcode = '42501'; end if;
    return coalesce((select jsonb_agg(jsonb_build_object('runner_id', x.runner_id, 'name', x.runner_name, 'category', x.category, 'position', x.position,
                      'general', x.general_position, 'time', x.time_seconds, 'dnf', x.dnf, 'me', x.runner_id = v_runner) order by (x.runner_id = v_runner) desc, x.runner_name)
                      from results x where x.race_id = p_id and x.runner_id is not null), '[]'::jsonb);
  end if;
  raise exception 'tipo_no_valido';
end $$;
grant execute on function public.runner_race_group(text, text, uuid) to anon, authenticated;

-- ===== TROZO 5: enviar la crónica con los resultados de los compañeros =====
drop function if exists public.runner_chronicle_send(text, text, text, date, text, text, text);
create or replace function public.runner_chronicle_send(p_code text, p_key text, p_name text, p_date date, p_body text, p_p1 text, p_p2 text,
                                                         p_kind text default null, p_id uuid default null, p_results jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_who text; v_post uuid; v_st text; v_n int; it jsonb; v_rid uuid; v_pos int; v_gen int; v_time int; v_last date; v_dnf boolean;
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
    -- los 2 primeros días tras la carrera cada uno pone el suyo; desde el tercero, cualquiera puede poner los que falten
    select case when p_kind = 'reg' then (select coalesce(end_date, date) from registrations where id = p_id) else (select coalesce(end_date, date) from races where id = p_id) end into v_last;
    for it in select * from jsonb_array_elements(p_results) loop
      v_rid := (it->>'runner_id')::uuid; v_pos := (it->>'position')::int; v_gen := (it->>'general')::int; v_time := (it->>'time')::int; v_dnf := coalesce((it->>'dnf')::boolean, false);
      if v_rid = v_runner then continue; end if;
      if not v_dnf and (v_pos is null or v_pos < 1 or v_pos > 999 or v_gen is null or v_gen < v_pos or v_gen > 9999 or v_time is null or v_time < 1 or v_time > 3600000) then raise exception 'datos_no_validos'; end if;
      if p_kind = 'reg' then
        update registration_entries set self_position = case when v_dnf then null else v_pos end, self_general_position = case when v_dnf then null else v_gen end,
               self_time_seconds = case when v_dnf then null else v_time end, self_dnf = v_dnf, self_reported_at = now(),
               self_podium_type = case when not v_dnf and v_pos between 1 and 3 then coalesce(self_podium_type, 'suelta') else null end
         where registration_id = p_id and runner_id = v_rid and self_position is null and not self_dnf;
      else
        update results set position = case when v_dnf then null else v_pos end, general_position = case when v_dnf then null else v_gen end,
               time_seconds = case when v_dnf then null else v_time end, dnf = v_dnf, self_reported = true
         where race_id = p_id and runner_id = v_rid and position is null and not dnf;
      end if;
      get diagnostics v_n = row_count;
      if v_n > 0 and current_date < v_last + 3 then raise exception 'plazo_resultados'; end if;
      if v_n > 0 then
        perform public.log_change(v_who, 'result', p_id, 'resultado', case when v_dnf then format('marcó que %s abandonó en %s', (select name from runners where id = v_rid), p_name) else format('puso el resultado de %s: %sº en %s', (select name from runners where id = v_rid), v_pos, p_name) end);
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

-- ===== TROZO 6: datos de la carrera para Claude (con los abandonos) =====
create or replace function public.chronicle_ai_facts(p chronicle_posts)
returns text language plpgsql stable security definer set search_path = public as $$
declare r record; v text := ''; club text; n int; tm int;
begin
  select ra.id, ra.name, ra.date, ra.end_date, ra.place, ra.province, ra.modality, ra.subtype, ra.km, ra.elevation, ra.race_type,
         x.category, x.position, x.general_position, x.time_seconds, x.dnf into r
    from races ra join results x on x.race_id = ra.id
   where to_char(ra.date, 'YYYY-MM-DD') || '|' || cron_name_key(ra.name) = p.race_key and x.runner_id = p.runner_id limit 1;
  if found then
    select count(*) - 1, string_agg(split_part(y.runner_name, ' ', 1) || coalesce(' (' || y.category || case when y.dnf then ', abandonó' else coalesce(', ' || y.position || 'º', '') end || ')', ''), ', ') filter (where y.runner_id is distinct from p.runner_id)
      into n, club from results y where y.race_id = r.id;
    tm := r.time_seconds;
  else
    select g.id, g.name, g.date, g.end_date, g.place, g.province, g.modality, g.subtype, g.km, g.elevation, g.race_type,
           e.category, e.self_position as position, e.self_general_position as general_position, e.self_time_seconds as time_seconds, e.self_dnf as dnf into r
      from registrations g join registration_entries e on e.registration_id = g.id
     where to_char(g.date, 'YYYY-MM-DD') || '|' || cron_name_key(g.name) = p.race_key and e.runner_id = p.runner_id limit 1;
    if found then
      select count(*) - 1, string_agg(split_part(u.name, ' ', 1) || coalesce(' (' || y.category || case when y.self_dnf then ', abandonó' else coalesce(', ' || y.self_position || 'º', '') end || ')', ''), ', ') filter (where y.runner_id <> p.runner_id)
        into n, club from registration_entries y join runners u on u.id = y.runner_id where y.registration_id = r.id;
      tm := r.time_seconds;
    end if;
  end if;
  if r.name is null then return 'Carrera: ' || p.race_name || coalesce(' (' || to_char(p.race_date, 'DD/MM/YYYY') || ')', ''); end if;
  v := 'Carrera: ' || r.name || ' (' || to_char(r.date, 'DD/MM/YYYY') || coalesce(' al ' || to_char(r.end_date, 'DD/MM/YYYY'), '') || ')'
    || coalesce(E'\nLugar: ' || nullif(concat_ws(', ', r.place, r.province), ''), '')
    || E'\nDisciplina: ' || r.modality || coalesce(' · ' || nullif(r.subtype, 'Otra'), '')
    || coalesce(E'\nDistancia: ' || r.km || ' km', '') || coalesce(E'\nDesnivel positivo: ' || r.elevation || ' m', '')
    || case when r.race_type = 'campeonato' then E'\nEs un campeonato.' when r.race_type = 'circuito' then E'\nForma parte de un circuito.' else '' end
    || coalesce(E'\nCategoría del corredor: ' || r.category, '')
    || case when r.dnf then E'\nResultado: el corredor abandonó y no pudo terminar la carrera.' else coalesce(E'\nPuesto en su categoría: ' || r.position || 'º', '') end
    || case when r.dnf then '' else coalesce(E'\nPuesto en la general: ' || r.general_position || 'º', '') end
    || case when r.dnf then '' else coalesce(E'\nTiempo: ' || (tm / 3600) || ':' || lpad(((tm % 3600) / 60)::text, 2, '0') || ':' || lpad((tm % 60)::text, 2, '0'), '') end
    || case when coalesce(n, 0) > 0 and club is not null then E'\nOtros del club en la carrera (' || n || '): ' || club else '' end;
  return v;
end $$;
revoke all on function public.chronicle_ai_facts(chronicle_posts) from public, anon, authenticated;

