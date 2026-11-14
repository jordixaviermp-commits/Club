-- =====================================================================
--  Cambio del 14/11/2026: estadísticas de Instagram (almacén privado).
--  Una tarea automática guarda aquí una foto diaria de las cifras de
--  Instagram (Windsor solo da 30 días hacia atrás); la dirección las ve
--  en la app. Se puede ejecutar más de una vez.
--  AL FINAL sale el «token» de la tarea automática: cópialo (ver guía).
-- =====================================================================

-- Una fila por dato y día: day = cifras del día, media = una publicación, story = una historia,
-- account = seguidores y publicaciones, audience = edad/género/país/ciudad de los seguidores.
create table if not exists public.ig_snapshots (
  kind        text not null check (kind in ('day','media','story','account','audience')),
  key         text not null check (length(key) between 1 and 200),
  data        jsonb not null,
  captured_at timestamptz not null default now(),
  primary key (kind, key)
);
alter table public.ig_snapshots enable row level security;
drop policy if exists admin_all on public.ig_snapshots;
create policy admin_all on public.ig_snapshots for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.ig_snapshots from anon, public;
grant select, insert, update, delete on public.ig_snapshots to authenticated;

-- Clave de la tarea automática: nadie la lee desde la app, solo la función de abajo.
create table if not exists public.ig_secret (token text primary key);
alter table public.ig_secret enable row level security;
revoke all on public.ig_secret from anon, authenticated, public;
insert into public.ig_secret (token)
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where not exists (select 1 from public.ig_secret);

-- La tarea automática guarda filas con la cabecera «x-ig-token». Fusiona campos (no pisa con vacíos), máx. 600 filas.
create or replace function public.ig_save(p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_tok text; n int;
begin
  begin v_tok := coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-ig-token', '');
  exception when others then v_tok := ''; end;
  if v_tok = '' or not exists (select 1 from ig_secret where token = v_tok) then
    raise exception 'token_no_valido' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 600 or length(p_rows::text) > 2000000 then
    raise exception 'datos_no_validos';
  end if;
  insert into ig_snapshots (kind, key, data)
    select x->>'kind', left(x->>'key', 200), coalesce(x->'data', '{}'::jsonb) from jsonb_array_elements(p_rows) x
     where x->>'kind' in ('day','media','story','account','audience') and coalesce(x->>'key', '') <> ''
  on conflict (kind, key) do update set data = ig_snapshots.data || excluded.data, captured_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.ig_save(jsonb) from public, anon;
grant execute on function public.ig_save(jsonb) to anon, authenticated;

-- RESULTADO: copia este token (se guarda en la app de Claude como credencial; no lo pegues en ningún chat).
select token as "COPIA_ESTE_TOKEN" from public.ig_secret;
