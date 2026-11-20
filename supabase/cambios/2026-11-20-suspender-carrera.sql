-- Cualquier corredor puede marcar (o reabrir) una carrera como suspendida por la organización.
-- Ejecutar entero en Supabase → SQL Editor.

-- Cualquier corredor puede marcar (o reabrir) una carrera como suspendida por la organización: cuenta para el mínimo, no para el bono.
create or replace function public.runner_set_suspended(p_code text, p_id uuid, p_suspended boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_who text;
begin
  select id, name into v_runner, v_who from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if not exists (select 1 from registrations where id = p_id) then raise exception 'no_existe'; end if;
  perform set_config('app.actor', v_who, true);   -- el historial dice quién lo cambió
  update registrations set suspended = coalesce(p_suspended, false) where id = p_id and suspended is distinct from coalesce(p_suspended, false);
end $$;

grant execute on function public.runner_set_suspended(text, uuid, boolean) to anon, authenticated;

select 'suspender-carrera ejecutada' as resultado;
