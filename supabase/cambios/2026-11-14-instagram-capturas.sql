-- =====================================================================
--  Cambio del 14/11/2026: capturas de Insights de Instagram.
--  La dirección sube desde la app las capturas de pantalla de Insights
--  (Resumen, Contenido, Audiencia) y salen en Resumen → Instagram y en
--  el PDF del dossier. Solo las ve la dirección. Se puede ejecutar más de una vez.
-- =====================================================================
create table if not exists public.ig_capturas (
  id         uuid primary key default gen_random_uuid(),
  periodo    text not null check (length(periodo) between 1 and 80),
  seccion    text not null default 'otras' check (seccion in ('resumen','contenido','audiencia','otras')),
  nota       text check (nota is null or length(nota) <= 300),
  imagen     text not null check (length(imagen) <= 3000000),
  created_at timestamptz not null default now()
);
alter table public.ig_capturas enable row level security;
drop policy if exists admin_all on public.ig_capturas;
create policy admin_all on public.ig_capturas for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.ig_capturas from anon, public;
grant select, insert, update, delete on public.ig_capturas to authenticated;
