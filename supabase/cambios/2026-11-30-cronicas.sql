-- Crónicas con fotos para publicar en redes. TRES trozos cortos (pégalos uno a uno; se pueden repetir).

-- ===== TROZO 1: tablas (solo las ve la dirección) =====
create table if not exists public.chronicle_posts (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid not null references public.runners(id) on delete cascade,
  race_key text not null check (length(race_key) between 3 and 200),
  race_name text not null check (length(race_name) <= 200),
  race_date date,
  body text not null check (length(body) between 1 and 4000),
  final_text text check (final_text is null or length(final_text) <= 4000),
  status text not null default 'enviada' check (status in ('enviada','lista','publicada')),
  photos int not null default 0 check (photos between 0 and 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (runner_id, race_key)
);
create table if not exists public.chronicle_photos (
  post_id uuid not null references public.chronicle_posts(id) on delete cascade,
  ord int not null check (ord in (1, 2)),
  data text not null check (length(data) <= 900000),
  primary key (post_id, ord)
);
alter table public.chronicle_posts enable row level security;
alter table public.chronicle_photos enable row level security;
drop policy if exists admin_all on public.chronicle_posts;
drop policy if exists admin_all on public.chronicle_photos;
create policy admin_all on public.chronicle_posts for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.chronicle_photos for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.chronicle_posts, public.chronicle_photos from anon, public;
grant select, insert, update, delete on public.chronicle_posts, public.chronicle_photos to authenticated;

-- ===== TROZO 2: el corredor envía su crónica (texto + hasta 2 fotos) =====
create or replace function public.runner_chronicle_send(p_code text, p_key text, p_name text, p_date date, p_body text, p_p1 text, p_p2 text)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_post uuid; v_st text; v_n int;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if p_key is null or length(p_key) not between 3 and 200 or length(trim(coalesce(p_body, ''))) not between 1 and 4000 or length(coalesce(p_name, '')) > 200 then raise exception 'datos_no_validos'; end if;
  select id, status into v_post, v_st from chronicle_posts where runner_id = v_runner and race_key = p_key;
  if v_st is not null and v_st <> 'enviada' then raise exception 'ya_en_proceso'; end if;
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
grant execute on function public.runner_chronicle_send(text, text, text, date, text, text, text) to anon, authenticated;

-- ===== TROZO 3: el corredor ve las suyas (texto y estado) =====
create or replace function public.runner_chronicle_posts(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('key', race_key, 'name', race_name, 'body', body, 'status', status, 'photos', photos) order by created_at desc) from chronicle_posts where runner_id = v_runner), '[]'::jsonb);
end $$;
grant execute on function public.runner_chronicle_posts(text) to anon, authenticated;
