-- Turnos por escamots (calendario USPAC): la dirección indica en la ficha de un corredor su escamot (E1 a E5) y el corredor ve
-- en su calendario una letra por día (M mañana, T tarde, N noche, F fiesta…). Solo lo ve él (y la dirección). Ejecutar entero en Supabase → SQL Editor.
alter table public.runners add column if not exists shift_group text;
alter table public.runners drop constraint if exists runners_shift_group_check;
alter table public.runners add constraint runners_shift_group_check check (shift_group is null or shift_group in ('E1','E2','E3','E4','E5'));

create or replace function public.runner_my_shift(p_code text)
returns text language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  select shift_group into v from runners where code = p_code;
  if not found then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return v;
end $$;
grant execute on function public.runner_my_shift(text) to anon, authenticated;

select 'turnos ejecutada' as resultado;
