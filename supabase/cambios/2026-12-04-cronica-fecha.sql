-- Crónicas del equipo: ahora también devuelven el día en que se pasó cada una (para mostrarlo en «Carreras hechas»). Un solo trozo corto; se puede repetir.
create or replace function public.runner_chronicles_team(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('key', k.race_key, 'by', k.by_name, 'mine', k.mine, 'at', k.at) order by k.race_key)
      from (select c.race_key,
                   (array_agg(r.name order by (c.runner_id = v_runner) desc, c.done_at))[1] as by_name,
                   bool_or(c.runner_id = v_runner) as mine,
                   min(c.done_at) as at
              from chronicles c join runners r on r.id = c.runner_id
             group by c.race_key) k), '[]'::jsonb);
end $$;
