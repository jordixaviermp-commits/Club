-- =====================================================================
--  Cambio del 15/11/2026: resúmenes por periodo de Instagram.
--  La dirección manda a Claude la captura de Insights; Claude vuelca los números
--  como una fila «period» y la app los suma y los pinta en gráficos.
--  Sustituye al cambio de capturas de imagen (2026-11-14-instagram-capturas.sql),
--  que ya no hace falta ejecutar. Se puede ejecutar más de una vez.
-- =====================================================================
drop table if exists public.ig_capturas;

alter table public.ig_snapshots drop constraint if exists ig_snapshots_kind_check;
alter table public.ig_snapshots add constraint ig_snapshots_kind_check
  check (kind in ('day','media','story','account','audience','period'));

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
     where x->>'kind' in ('day','media','story','account','audience','period') and coalesce(x->>'key', '') <> ''
  on conflict (kind, key) do update set data = ig_snapshots.data || excluded.data, captured_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.ig_save(jsonb) from public, anon;
grant execute on function public.ig_save(jsonb) to anon, authenticated;
