-- Cuando una crónica está PUBLICADA en redes, los resultados de esa carrera se cierran: el corredor ya no puede cambiarlos
-- (si hay un error, lo corrige la dirección). Se puede poner el resultado si aún no existía.
-- TRES trozos cortos (se pueden repetir). Pégalos EN ORDEN. El 3 sustituye a una función que ya tienes.

-- ===== TROZO 1: la comprobación =====
create or replace function public.assert_result_open(p_kind text, p_id uuid, p_runner uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_key text; v_has boolean;
begin
  if p_kind = 'reg' then
    select to_char(g.date, 'YYYY-MM-DD') || '|' || public.cron_name_key(g.name), (e.self_position is not null or e.self_dnf) into v_key, v_has
      from registrations g join registration_entries e on e.registration_id = g.id where g.id = p_id and e.runner_id = p_runner;
  else
    select to_char(r.date, 'YYYY-MM-DD') || '|' || public.cron_name_key(r.name), (x.position is not null or x.dnf) into v_key, v_has
      from races r join results x on x.race_id = r.id where r.id = p_id and x.runner_id = p_runner;
  end if;
  -- ya publicado en redes con su resultado: se cierra (si hay un error, lo corrige la dirección)
  if coalesce(v_has, false) and exists (select 1 from chronicle_posts where race_key = v_key and status = 'publicada') then raise exception 'resultado_cerrado'; end if;
end $$;
revoke all on function public.assert_result_open(text, uuid, uuid) from public, anon, authenticated;

-- ===== TROZO 2: que poner el resultado y la general la usen (parchea 2 funciones; una sola vez) =====
do $do$
declare p jsonb := $j$[
 {"fn": "public.runner_report_result(text,text,uuid,integer,text,text,integer,boolean)", "from": "select self_position into v_old from registration_entries where registration_id = p_id and runner_id = v_runner;", "to": "select self_position into v_old from registration_entries where registration_id = p_id and runner_id = v_runner;\n    perform public.assert_result_open('reg', p_id, v_runner);"},
 {"fn": "public.runner_report_result(text,text,uuid,integer,text,text,integer,boolean)", "from": "select position into v_old from results where race_id = p_id and runner_id = v_runner;", "to": "select position into v_old from results where race_id = p_id and runner_id = v_runner;\n    perform public.assert_result_open('race', p_id, v_runner);"},
 {"fn": "public.runner_set_general(text,text,uuid,integer)", "from": "if not found then raise exception 'no_es_tuya' using errcode = '42501'; end if;", "to": "if not found then raise exception 'no_es_tuya' using errcode = '42501'; end if;\n  perform public.assert_result_open(p_kind, p_id, v_runner);"}
]$j$; sig text; f text; x jsonb;
begin
  for sig in select distinct e->>'fn' from jsonb_array_elements(p) e loop
    f := pg_get_functiondef(sig::regprocedure);
    if f like '%assert_result_open%' then continue; end if;
    for x in select value from jsonb_array_elements(p) with ordinality o(value, n) where value->>'fn' = sig order by n loop
      f := replace(f, x->>'from', x->>'to');
    end loop;
    execute f;
  end loop;
end $do$;

-- ===== TROZO 3: que la app sepa qué carreras están cerradas =====
create or replace function public.runner_chronicles_team(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('key', k.race_key, 'by', k.by_name, 'mine', k.mine, 'at', k.at, 'pub', k.pub) order by k.race_key)
      from (select c.race_key,
                   (array_agg(r.name order by (c.runner_id = v_runner) desc, c.done_at))[1] as by_name,
                   bool_or(c.runner_id = v_runner) as mine,
                   min(c.done_at) as at,
                   exists (select 1 from chronicle_posts cp where cp.race_key = c.race_key and cp.status = 'publicada') as pub
              from chronicles c join runners r on r.id = c.runner_id
             group by c.race_key) k), '[]'::jsonb);
end $$;
