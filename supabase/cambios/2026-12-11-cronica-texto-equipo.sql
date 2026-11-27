-- La crónica ya publicada en redes (texto final) la pueden ver todos los del club desde «Resultados y crónicas»,
-- también la que pasó un compañero. Solo las PUBLICADAS: lo que está en revisión sigue siendo de su autor.
-- UN trozo (se puede repetir; sustituye a una función que ya tienes).
create or replace function public.runner_chronicles_team(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('key', k.race_key, 'by', k.by_name, 'mine', k.mine, 'at', k.at, 'pub', k.pub, 'pub_at', k.pub_at, 'text', k.pub_text) order by k.race_key)
      from (select c.race_key,
                   (array_agg(r.name order by (c.runner_id = v_runner) desc, c.done_at))[1] as by_name,
                   bool_or(c.runner_id = v_runner) as mine,
                   min(c.done_at) as at,
                   exists (select 1 from chronicle_posts cp where cp.race_key = c.race_key and cp.status = 'publicada') as pub,
                   (select max(cp.published_at) from chronicle_posts cp where cp.race_key = c.race_key and cp.status = 'publicada') as pub_at,
                   (select cp.final_text from chronicle_posts cp where cp.race_key = c.race_key and cp.status = 'publicada' order by cp.published_at desc nulls last limit 1) as pub_text
              from chronicles c join runners r on r.id = c.runner_id
             group by c.race_key) k), '[]'::jsonb);
end $$;
