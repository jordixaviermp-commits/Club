-- Movimientos de la app para la dirección (pestaña Hoy): quién se ha inscrito, quién ha pagado, quién ha pasado una crónica,
-- quién ha creado o cambiado una carrera, quién ha puesto su resultado… Reúne lo que ya estaba guardado (con su fecha) y el historial de cambios.
-- Además, a partir de ahora se anota cuando alguien se borra de una carrera. Solo lo puede leer la dirección.
-- Ejecutar entero en Supabase → SQL Editor.
create or replace function public.log_entry_leave()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_reg text; v_date date; v_admin boolean := public.is_admin();
begin
  if current_setting('app.skip_log', true) = 'on' then return old; end if;
  select g.name, g.date into v_reg, v_date from registrations g where g.id = old.registration_id;
  if v_reg is null then return old; end if;            -- se ha borrado la carrera entera: ya queda anotado
  select name into v_name from runners where id = old.runner_id;
  if v_name is null then return old; end if;
  if v_admin then
    perform public.log_change('Dirección', 'registration', old.registration_id, 'baja', format('quitó a %s de %s (%s)', v_name, v_reg, v_date));
  else
    perform public.log_change(v_name, 'registration', old.registration_id, 'baja', format('se borró de %s (%s)', v_reg, v_date));
  end if;
  return old;
end $$;
drop trigger if exists entries_leave_log on public.registration_entries;
create trigger entries_leave_log after delete on public.registration_entries for each row execute function public.log_entry_leave();

create or replace function public.admin_movements(p_limit int default 300)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'solo_direccion' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(m.x order by m.at desc) from (
      select e.created_at as at, jsonb_build_object('at', e.created_at, 'who', r.name, 'kind', 'inscripcion', 'text', format('se inscribió en %s (%s)', g.name, to_char(g.date, 'DD/MM/YYYY'))) as x
        from registration_entries e join runners r on r.id = e.runner_id join registrations g on g.id = e.registration_id where e.created_at is not null
      union all
      select e.paid_at, jsonb_build_object('at', e.paid_at, 'who', r.name, 'kind', 'pago', 'text', format('marcó como pagada su inscripción en %s', g.name))
        from registration_entries e join runners r on r.id = e.runner_id join registrations g on g.id = e.registration_id where e.paid_at is not null
      union all
      select c.done_at, jsonb_build_object('at', c.done_at, 'who', r.name, 'kind', 'cronica', 'text', format('pasó la crónica de %s (%s)', initcap(split_part(c.race_key, '|', 2)), split_part(c.race_key, '|', 1)))
        from chronicles c join runners r on r.id = c.runner_id
      union all
      select l.at, jsonb_build_object('at', l.at, 'who', l.actor, 'kind',
               case when l.action = 'baja' then 'baja' when l.entity = 'result' then 'resultado' when l.entity in ('race', 'registration') then 'carrera' else 'otro' end, 'text', l.summary)
        from change_log l
      order by at desc limit greatest(1, least(coalesce(p_limit, 300), 1000))
    ) m), '[]'::jsonb);
end $$;

grant execute on function public.admin_movements(int) to authenticated;
revoke execute on function public.admin_movements(int) from anon, public;

select 'movimientos ejecutada' as resultado;
