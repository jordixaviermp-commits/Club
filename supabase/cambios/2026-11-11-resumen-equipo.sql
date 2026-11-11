-- =====================================================================
--  Cambio del 11/11/2026: los corredores ven el resumen del equipo.
--  Versión corta para pegar desde el móvil (equivale a ejecutar
--  supabase/schema.sql completo). Se puede ejecutar más de una vez.
--  Termina en la línea «grant execute … to anon, authenticated;».
-- =====================================================================

-- Resumen del equipo para los corredores: todas las carreras con resultados y la plantilla (solo nombres).
-- No incluye enlaces, contratos, bonos ni notas.
create or replace function public.runner_team(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from runners where code = p_code) then
    raise exception 'enlace_no_valido' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'runners', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from runners), '[]'::jsonb),
    'races', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'name', r.name, 'date', r.date, 'end_date', r.end_date, 'place', r.place,
               'province', r.province, 'country', r.country, 'modality', r.modality, 'stages', r.stages,
               'results', coalesce((
                  select jsonb_agg(jsonb_build_object('runner_id', x.runner_id, 'runner_name', x.runner_name, 'category', x.category,
                                   'position', x.position, 'podium_type', x.podium_type, 'stage_positions', x.stage_positions))
                    from results x where x.race_id = r.id), '[]'::jsonb))
             order by r.date)
        from races r), '[]'::jsonb));
end $$;

revoke execute on function public.runner_team(text) from public;
grant execute on function public.runner_team(text) to anon, authenticated;
