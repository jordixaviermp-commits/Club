-- =====================================================================
--  Cambio del 12/11/2026: noticias de la dirección para los corredores
--  (campanita con aviso de «nueva»). Se puede ejecutar más de una vez.
-- =====================================================================

-- Noticias de la dirección para los corredores (quedadas, pedidos de ropa…). Las escribe la dirección;
-- cada corredor las ve (solo lectura) con la campanita. `expires_at` = último día en que se muestra (vacío = siempre).
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(btrim(title)) between 3 and 120),
  body       text not null default '' check (length(body) <= 4000),
  expires_at date,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;  -- permisos: ver «Seguridad» más abajo

drop policy if exists admin_all on public.announcements;
create policy admin_all on public.announcements for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.announcements from anon, public;
grant select, insert, update, delete on public.announcements to authenticated;

create or replace function public.runner_news(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from runners where code = p_code) then
    raise exception 'enlace_no_valido' using errcode = '28000';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body,
                                                       'created_at', n.created_at, 'expires_at', n.expires_at)
                                    order by n.created_at desc)
                     from (select * from announcements where expires_at is null or expires_at >= current_date
                            order by created_at desc limit 30) n), '[]'::jsonb);
end $$;

revoke execute on function public.runner_news(text) from public;
grant execute on function public.runner_news(text) to anon, authenticated;
