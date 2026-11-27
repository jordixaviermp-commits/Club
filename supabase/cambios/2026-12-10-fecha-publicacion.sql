-- Fecha en que se publicó la crónica en redes (para enseñarla en «Resultados y crónicas» de Mi temporada).
-- Además: el corredor ve el texto final de su crónica cuando ya está lista o publicada.
-- TRES trozos cortos (se pueden repetir). Pégalos EN ORDEN.

-- ===== TROZO 1: la columna, la marca automática y las ya publicadas =====
alter table public.chronicle_posts add column if not exists published_at timestamptz;
create or replace function public.chronicle_posts_published_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'publicada' then
    if tg_op = 'INSERT' or old.status is distinct from 'publicada' or new.published_at is null then new.published_at := coalesce(new.published_at, now()); end if;
  else new.published_at := null; end if;
  return new;
end $$;
drop trigger if exists chronicle_posts_published_at on public.chronicle_posts;
create trigger chronicle_posts_published_at before insert or update of status on public.chronicle_posts
  for each row execute function public.chronicle_posts_published_at();
update public.chronicle_posts set published_at = updated_at where status = 'publicada' and published_at is null;

-- ===== TROZO 2: el equipo ve también cuándo se publicó (sustituye a una función que ya tienes) =====
create or replace function public.runner_chronicles_team(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('key', k.race_key, 'by', k.by_name, 'mine', k.mine, 'at', k.at, 'pub', k.pub, 'pub_at', k.pub_at) order by k.race_key)
      from (select c.race_key,
                   (array_agg(r.name order by (c.runner_id = v_runner) desc, c.done_at))[1] as by_name,
                   bool_or(c.runner_id = v_runner) as mine,
                   min(c.done_at) as at,
                   exists (select 1 from chronicle_posts cp where cp.race_key = c.race_key and cp.status = 'publicada') as pub,
                   (select max(cp.published_at) from chronicle_posts cp where cp.race_key = c.race_key and cp.status = 'publicada') as pub_at
              from chronicles c join runners r on r.id = c.runner_id
             group by c.race_key) k), '[]'::jsonb);
end $$;

-- ===== TROZO 3: el corredor ve el texto final de su crónica (sustituye a una función que ya tienes) =====
create or replace function public.runner_chronicle_posts(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('key', race_key, 'name', race_name, 'body', body, 'status', status, 'photos', photos,
                                                       'final', case when status in ('lista', 'publicada') then final_text end, 'pub_at', published_at) order by created_at desc)
                     from chronicle_posts where runner_id = v_runner), '[]'::jsonb);
end $$;
grant execute on function public.runner_chronicle_posts(text) to anon, authenticated;
