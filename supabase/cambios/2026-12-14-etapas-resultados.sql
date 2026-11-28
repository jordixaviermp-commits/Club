-- Resultado de CADA etapa de un corredor (puesto y tiempo). Se guarda en una tabla aparte: si viviera en «results», cada vez que la dirección
-- edita una carrera (se vuelven a crear sus resultados) se borrarían. La clave es la misma que la de las crónicas («AAAA-MM-DD|nombre»),
-- que no cambia cuando la inscripción pasa a resultados. Los puestos y tiempos de etapa llegan a las estadísticas del equipo por runner_team.
-- Además las etapas se guardan siempre ordenadas por día (la 1.ª, la 2.ª… coinciden con las de las historias).
-- CUATRO trozos cortos (se pueden repetir). Pégalos EN ORDEN.

-- ===== TROZO 1: la tabla =====
create table if not exists public.stage_results (
  race_key     text not null check (length(race_key) between 3 and 200),
  runner_id    uuid not null references public.runners(id) on delete cascade,
  stage        int  not null check (stage between 1 and 30),
  position     int  check (position is null or position between 1 and 9999),            -- puesto en su categoría en esa etapa
  general_position int check (general_position is null or general_position between 1 and 9999),   -- puesto en la general (absoluta) de esa etapa
  time_seconds int  check (time_seconds is null or time_seconds between 1 and 86400),
  updated_at   timestamptz not null default now(),
  primary key (race_key, runner_id, stage),
  check (position is not null or general_position is not null or time_seconds is not null)
);
-- Corredor que hizo la carrera por parejas: con quién (texto libre; puede no ser del club). Aparte de «results» por la misma razón.
create table if not exists public.race_pairs (
  race_key  text not null check (length(race_key) between 3 and 200),
  runner_id uuid not null references public.runners(id) on delete cascade,
  partner   text not null check (length(btrim(partner)) between 1 and 60),
  updated_at timestamptz not null default now(),
  primary key (race_key, runner_id)
);
alter table public.race_pairs enable row level security;
drop policy if exists admin_all on public.race_pairs;
create policy admin_all on public.race_pairs for all to authenticated using (public.is_admin()) with check (public.is_admin());
alter table public.stage_results enable row level security;
drop policy if exists admin_all on public.stage_results;
create policy admin_all on public.stage_results for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ===== TROZO 2: las etapas siempre por orden de día (sustituye a una función que ya tienes) =====
create or replace function public.stages_clean(p_stages jsonb, p_first date, p_last date)
returns jsonb language plpgsql stable set search_path = public as $$
declare el jsonb; v_out jsonb := '[]'::jsonb; v_n int := 0; v_name text; v_date date; v_km numeric; v_ele int; v_item jsonb;
begin
  if p_stages is null or jsonb_typeof(p_stages) <> 'array' or jsonb_array_length(p_stages) = 0 then return null; end if;
  if p_last is null or p_last <= p_first then raise exception 'datos_no_validos'; end if;          -- solo carreras de varios días
  if jsonb_array_length(p_stages) > 30 then raise exception 'datos_no_validos'; end if;
  for el in select value from jsonb_array_elements(p_stages) loop
    v_n := v_n + 1;
    v_name := coalesce(nullif(left(btrim(coalesce(el->>'name', '')), 60), ''), 'Etapa ' || v_n);
    v_date := case when coalesce(el->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$' then (el->>'date')::date end;
    if v_date is null or v_date < p_first or v_date > p_last then raise exception 'datos_no_validos'; end if;
    v_km := case when coalesce(el->>'km', '') ~ '^[0-9]{1,4}([.][0-9]+)?$' then round((el->>'km')::numeric, 1) end;
    if v_km is not null and not (v_km > 0 and v_km <= 1000) then v_km := null; end if;
    v_ele := case when coalesce(el->>'elevation', '') ~ '^[0-9]{1,5}$' then (el->>'elevation')::int end;
    if v_ele is not null and not (v_ele > 0 and v_ele <= 10000) then v_ele := null; end if;
    v_item := jsonb_build_object('name', v_name, 'date', v_date);
    if v_km is not null then v_item := v_item || jsonb_build_object('km', v_km); end if;
    if v_ele is not null then v_item := v_item || jsonb_build_object('elevation', v_ele); end if;
    v_out := v_out || jsonb_build_array(v_item);
  end loop;
  select jsonb_agg(x.value order by x.value->>'date', x.ord) into v_out from jsonb_array_elements(v_out) with ordinality as x(value, ord);   -- por día (y, en el mismo día, como se escribieron)
  return v_out;
end $$;

-- ===== TROZO 3: poner y leer los resultados de etapa =====
create or replace function public.stage_results_arr(p_key text, p_runner uuid, p_field text, p_n int)
returns jsonb language plpgsql stable set search_path = public as $$
begin
  if coalesce(p_n, 0) <= 0 or not exists (select 1 from stage_results where race_key = p_key and runner_id = p_runner) then return null; end if;
  return (select jsonb_agg(case when p_field = 'time' then to_jsonb(sr.time_seconds) when p_field = 'general' then to_jsonb(sr.general_position) else to_jsonb(sr.position) end order by g.n)
            from generate_series(1, p_n) g(n) left join stage_results sr on sr.race_key = p_key and sr.runner_id = p_runner and sr.stage = g.n);
end $$;
revoke all on function public.stage_results_arr(text, uuid, text, int) from public, anon, authenticated;

create or replace function public.runner_set_stage_result(p_code text, p_kind text, p_id uuid, p_stage int, p_position int, p_general int, p_time int)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_date date; v_name text; v_info jsonb; v_sd date; v_key text;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if p_kind = 'reg' then
    select date, name, stage_info into v_date, v_name, v_info from registrations where id = p_id;
    if not exists (select 1 from registration_entries where registration_id = p_id and runner_id = v_runner) then raise exception 'no_es_tuya' using errcode = '42501'; end if;
  elsif p_kind = 'race' then
    select date, name, stage_info into v_date, v_name, v_info from races where id = p_id;
    if not exists (select 1 from results where race_id = p_id and runner_id = v_runner) then raise exception 'no_es_tuya' using errcode = '42501'; end if;
  else raise exception 'tipo_no_valido'; end if;
  if v_date is null then raise exception 'no_existe'; end if;
  if v_info is null or jsonb_typeof(v_info) <> 'array' or p_stage is null or p_stage < 1 or p_stage > jsonb_array_length(v_info) then raise exception 'datos_no_validos'; end if;
  select (v_info->(p_stage - 1)->>'date')::date into v_sd;
  if v_sd > current_date then raise exception 'etapa_futura'; end if;                                   -- una etapa que aún no se ha corrido no tiene resultado
  if p_position is not null and p_position not between 1 and 9999 then raise exception 'datos_no_validos'; end if;
  if p_general is not null and p_general not between 1 and 9999 then raise exception 'datos_no_validos'; end if;
  if p_time is not null and p_time not between 1 and 86400 then raise exception 'datos_no_validos'; end if;
  perform public.assert_result_open(p_kind, p_id, v_runner);                                            -- publicado en redes: ya no se cambia
  v_key := to_char(v_date, 'YYYY-MM-DD') || '|' || public.cron_name_key(v_name);
  if p_position is null and p_general is null and p_time is null then
    delete from stage_results where race_key = v_key and runner_id = v_runner and stage = p_stage;
  else
    insert into stage_results (race_key, runner_id, stage, position, general_position, time_seconds) values (v_key, v_runner, p_stage, p_position, p_general, p_time)
    on conflict (race_key, runner_id, stage) do update set position = excluded.position, general_position = excluded.general_position, time_seconds = excluded.time_seconds, updated_at = now();
  end if;
end $$;
grant execute on function public.runner_set_stage_result(text, text, uuid, int, int, int, int) to anon, authenticated;

create or replace function public.runner_stage_results(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('key', race_key, 'stage', stage, 'position', position, 'general', general_position, 'time', time_seconds) order by race_key, stage)
                     from stage_results where runner_id = v_runner), '[]'::jsonb);
end $$;
grant execute on function public.runner_stage_results(text) to anon, authenticated;

create or replace function public.runner_set_pair(p_code text, p_kind text, p_id uuid, p_partner text)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_date date; v_name text; v_key text; v_p text := left(btrim(coalesce(p_partner, '')), 60);
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if p_kind = 'reg' then
    select date, name into v_date, v_name from registrations where id = p_id;
    if not exists (select 1 from registration_entries where registration_id = p_id and runner_id = v_runner) then raise exception 'no_es_tuya' using errcode = '42501'; end if;
  elsif p_kind = 'race' then
    select date, name into v_date, v_name from races where id = p_id;
    if not exists (select 1 from results where race_id = p_id and runner_id = v_runner) then raise exception 'no_es_tuya' using errcode = '42501'; end if;
  else raise exception 'tipo_no_valido'; end if;
  if v_date is null then raise exception 'no_existe'; end if;
  perform public.assert_result_open(p_kind, p_id, v_runner);
  v_key := to_char(v_date, 'YYYY-MM-DD') || '|' || public.cron_name_key(v_name);
  if v_p = '' then delete from race_pairs where race_key = v_key and runner_id = v_runner;
  else insert into race_pairs (race_key, runner_id, partner) values (v_key, v_runner, v_p)
       on conflict (race_key, runner_id) do update set partner = excluded.partner, updated_at = now(); end if;
end $$;
grant execute on function public.runner_set_pair(text, text, uuid, text) to anon, authenticated;

create or replace function public.runner_pairs(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('key', race_key, 'partner', partner)) from race_pairs where runner_id = v_runner), '[]'::jsonb);
end $$;
grant execute on function public.runner_pairs(text) to anon, authenticated;

-- ===== TROZO 4: los puestos y tiempos de etapa llegan a las estadísticas (sustituye a dos funciones que ya tienes) =====
do $$
declare d text;
begin
  d := pg_get_functiondef('public.runner_view(text)'::regprocedure);
  if d not like '%stage_results_arr%' then
    d := replace(d, '''stage_positions'', x.stage_positions,', '''stage_positions'', coalesce(x.stage_positions, public.stage_results_arr(to_char(r.date, ''YYYY-MM-DD'') || ''|'' || public.cron_name_key(r.name), x.runner_id, ''position'', jsonb_array_length(coalesce(r.stage_info, ''[]''::jsonb)))), ''stage_times'', public.stage_results_arr(to_char(r.date, ''YYYY-MM-DD'') || ''|'' || public.cron_name_key(r.name), x.runner_id, ''time'', jsonb_array_length(coalesce(r.stage_info, ''[]''::jsonb))), ''stage_general'', public.stage_results_arr(to_char(r.date, ''YYYY-MM-DD'') || ''|'' || public.cron_name_key(r.name), x.runner_id, ''general'', jsonb_array_length(coalesce(r.stage_info, ''[]''::jsonb))),');
    execute d;
  end if;
  d := pg_get_functiondef('public.runner_team(text)'::regprocedure);
  if d not like '%stage_results_arr%' then
    d := replace(d, '''stage_positions'', x.stage_positions,', '''stage_positions'', coalesce(x.stage_positions, public.stage_results_arr(to_char(r.date, ''YYYY-MM-DD'') || ''|'' || public.cron_name_key(r.name), x.runner_id, ''position'', jsonb_array_length(coalesce(r.stage_info, ''[]''::jsonb)))), ''stage_times'', public.stage_results_arr(to_char(r.date, ''YYYY-MM-DD'') || ''|'' || public.cron_name_key(r.name), x.runner_id, ''time'', jsonb_array_length(coalesce(r.stage_info, ''[]''::jsonb))), ''stage_general'', public.stage_results_arr(to_char(r.date, ''YYYY-MM-DD'') || ''|'' || public.cron_name_key(r.name), x.runner_id, ''general'', jsonb_array_length(coalesce(r.stage_info, ''[]''::jsonb))),');
    execute d;
  end if;
end $$;
