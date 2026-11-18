-- =====================================================================
--  Cambio del 18/11/2026: la crónica de cada carrera la pasa UNO solo.
--  Si ha asistido 8 y uno la marca, queda hecha para todos. Este cambio da al
--  corredor la lista de crónicas pasadas por cualquier compañero (y quién la
--  pasó) para que no le salga como pendiente. Se puede ejecutar más de una vez.
--  Necesita antes el cambio de crónicas (2026-11-15-cronicas.sql).
-- =====================================================================
create or replace function public.runner_chronicles_team(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('key', k.race_key, 'by', k.by_name, 'mine', k.mine) order by k.race_key)
      from (select c.race_key,
                   (array_agg(r.name order by (c.runner_id = v_runner) desc, c.done_at))[1] as by_name,
                   bool_or(c.runner_id = v_runner) as mine
              from chronicles c join runners r on r.id = c.runner_id
             group by c.race_key) k), '[]'::jsonb);
end $$;
revoke execute on function public.runner_chronicles_team(text) from public, anon;
grant execute on function public.runner_chronicles_team(text) to anon, authenticated;
