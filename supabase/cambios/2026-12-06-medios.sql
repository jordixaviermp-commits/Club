-- Presencia en medios de comunicación: la dirección anota en qué medio salió una carrera y qué día (para la estadística de fin de temporada y la memoria de patrocinadores).
-- UN solo trozo; se puede repetir. Solo lo ve y lo toca la dirección.
create table if not exists public.media_mentions (
  id uuid primary key default gen_random_uuid(),
  race_key text not null check (length(race_key) between 3 and 200),   -- «AAAA-MM-DD|nombre normalizado»: no cambia cuando la inscripción pasa a resultados
  race_name text not null check (length(race_name) <= 200),
  race_date date not null,
  medium text not null check (length(btrim(medium)) between 1 and 120),
  kind text not null default 'prensa' check (kind in ('prensa', 'radio', 'tv', 'web', 'otro')),
  published_on date not null,
  url text check (url is null or length(url) <= 500),
  notes text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists media_mentions_race_idx on public.media_mentions (race_key);
alter table public.media_mentions enable row level security;
drop policy if exists admin_all on public.media_mentions;
create policy admin_all on public.media_mentions for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.media_mentions from anon, public;
grant select, insert, update, delete on public.media_mentions to authenticated;
