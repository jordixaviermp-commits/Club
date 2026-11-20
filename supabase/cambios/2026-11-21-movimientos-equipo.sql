-- Últimas inscripciones del equipo (quién se apunta a qué y cuándo), para el historial visual de «Carreras».
-- Ejecutar entero en Supabase → SQL Editor.
create or replace function public.runner_team_moves(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from runners where code = p_code) then
    raise exception 'enlace_no_valido' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(s.x order by s.moved_at desc) from (
      select jsonb_build_object('runner_id', r.id, 'name', r.name, 'race_id', g.id, 'race', g.name, 'date', g.date,
                                'modality', g.modality, 'subtype', g.subtype, 'province', g.province, 'at', e.created_at) as x,
             e.created_at as moved_at
        from registration_entries e
        join runners r on r.id = e.runner_id
        join registrations g on g.id = e.registration_id
       where e.created_at > now() - interval '120 days' and not g.suspended
       order by e.created_at desc limit 60) s), '[]'::jsonb);
end $$;

grant execute on function public.runner_team_moves(text) to anon, authenticated;

select 'movimientos-equipo ejecutada' as resultado;
