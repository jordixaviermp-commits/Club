-- Cada corredor puede elegir (o quitar) su propio escamot desde su perfil. Solo cambia su propio dato. Necesita antes 2026-11-26-turnos.sql.
-- Ejecutar entero en Supabase → SQL Editor.
create or replace function public.runner_set_my_shift(p_code text, p_group text)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text; g text := nullif(btrim(coalesce(p_group, '')), '');
begin
  select id, name into v_id, v_name from runners where code = p_code;
  if v_id is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if g is not null and g not in ('E1','E2','E3','E4','E5') then raise exception 'datos_no_validos'; end if;
  perform set_config('app.actor', v_name, true);
  update runners set shift_group = g where id = v_id;
  perform set_config('app.actor', '', true);
end $$;
grant execute on function public.runner_set_my_shift(text, text) to anon, authenticated;

select 'turnos-propios ejecutada' as resultado;
