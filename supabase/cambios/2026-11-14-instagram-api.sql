-- =====================================================================
--  Cambio del 14/11/2026 (2): guardar el token de la API de Instagram.
--  La captura automática (GitHub Actions) lee y renueva aquí el token de
--  Instagram, que dura 60 días y hay que renovar. El token NO está en
--  GitHub ni en ningún chat. Se puede ejecutar más de una vez.
--  Requiere haber ejecutado antes 2026-11-14-instagram.sql.
-- =====================================================================

create table if not exists public.ig_token_store (
  id         int primary key default 1 check (id = 1),
  token      text not null,
  updated_at timestamptz not null default now()
);
alter table public.ig_token_store enable row level security;
revoke all on public.ig_token_store from anon, authenticated, public;

-- Solo la captura automática (cabecera «x-ig-token», igual que ig_save) puede leer o cambiar el token de Instagram.
create or replace function public.ig_token_get()
returns text language plpgsql security definer set search_path = public as $$
declare v_tok text; r text;
begin
  begin v_tok := coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-ig-token', '');
  exception when others then v_tok := ''; end;
  if v_tok = '' or not exists (select 1 from ig_secret where token = v_tok) then
    raise exception 'token_no_valido' using errcode = '42501';
  end if;
  select token into r from ig_token_store where id = 1;
  return r;
end $$;

create or replace function public.ig_token_set(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare v_tok text;
begin
  begin v_tok := coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-ig-token', '');
  exception when others then v_tok := ''; end;
  if v_tok = '' or not exists (select 1 from ig_secret where token = v_tok) then
    raise exception 'token_no_valido' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) < 20 or length(p_token) > 2000 then raise exception 'datos_no_validos'; end if;
  insert into ig_token_store (id, token) values (1, p_token)
  on conflict (id) do update set token = excluded.token, updated_at = now();
end $$;

revoke execute on function public.ig_token_get() from public, anon;
revoke execute on function public.ig_token_set(text) from public, anon;
grant execute on function public.ig_token_get() to anon, authenticated;
grant execute on function public.ig_token_set(text) to anon, authenticated;

-- Pega aquí el token de Instagram (solo la primera vez; luego la captura lo renueva sola) y ejecuta SOLO esta línea:
--   insert into public.ig_token_store (id, token) values (1, 'PEGA_AQUI_EL_TOKEN') on conflict (id) do update set token = excluded.token, updated_at = now();
--
-- Y para la acción de GitHub necesitas el token de captura (el mismo de ig_save). Si ya no lo tienes, ejecuta:
--   select token as "COPIA_ESTE_TOKEN" from public.ig_secret;
