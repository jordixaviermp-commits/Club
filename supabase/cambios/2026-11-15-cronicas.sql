-- =====================================================================
--  Cambio del 15/11/2026: crónicas de carrera (cláusula del contrato).
--  Cada corredor marca desde su perfil las carreras cuya crónica (más los
--  resultados y las fotos) ya ha pasado; la dirección ve cuántas faltan.
--  Se puede ejecutar más de una vez.
-- =====================================================================
create table if not exists public.chronicles (
  runner_id uuid not null references public.runners(id) on delete cascade,
  race_key  text not null check (length(race_key) between 3 and 200),   -- «AAAA-MM-DD|nombre normalizado»: no cambia cuando la inscripción pasa a resultados
  done_at   timestamptz not null default now(),
  primary key (runner_id, race_key)
);
alter table public.chronicles enable row level security;
drop policy if exists admin_all on public.chronicles;
create policy admin_all on public.chronicles for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.chronicles from anon, public;
grant select, insert, update, delete on public.chronicles to authenticated;

-- El corredor (con su enlace personal) lee sus crónicas pasadas…
create or replace function public.runner_chronicles(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(race_key order by race_key) from chronicles where runner_id = v_runner), '[]'::jsonb);
end $$;

-- …y marca o desmarca una carrera suya.
create or replace function public.runner_chronicle_set(p_code text, p_key text, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if p_key is null or length(p_key) not between 3 and 200 then raise exception 'datos_no_validos'; end if;
  if coalesce(p_done, true) then
    insert into chronicles (runner_id, race_key) values (v_runner, p_key) on conflict do nothing;
  else
    delete from chronicles where runner_id = v_runner and race_key = p_key;
  end if;
end $$;

revoke execute on function public.runner_chronicles(text) from public, anon;
revoke execute on function public.runner_chronicle_set(text, text, boolean) from public, anon;
grant execute on function public.runner_chronicles(text), public.runner_chronicle_set(text, text, boolean) to anon, authenticated;
