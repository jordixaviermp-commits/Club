-- =====================================================================
--  Cambio del 13/11/2026: en la vista del encargado de redes, cada inscrito
--  sale con su categoría («Pere Soler (M40)») para las publicaciones.
--  Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function public.social_view(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.social_check(p_code);
  return jsonb_build_object(
    'today', current_date,
    'upcoming', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', g.name, 'date', g.date, 'end_date', g.end_date, 'place', g.place, 'province', g.province, 'country', g.country,
               'modality', g.modality, 'subtype', g.subtype, 'km', g.km, 'race_type', g.race_type, 'circuit', g.circuit,
               'people', (select coalesce(jsonb_agg(rn.name order by rn.name), '[]'::jsonb)
                            from registration_entries e join runners rn on rn.id = e.runner_id where e.registration_id = g.id),
               'people_cat', (select coalesce(jsonb_agg(rn.name || coalesce(' (' || nullif(e.category, '') || ')', '') order by rn.name), '[]'::jsonb)
                            from registration_entries e join runners rn on rn.id = e.runner_id where e.registration_id = g.id))
             order by g.date, g.name)
        from registrations g
       where not g.suspended and coalesce(g.end_date, g.date) >= current_date - 1 and g.date <= current_date + 45
         and exists (select 1 from registration_entries e where e.registration_id = g.id)), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', x.name, 'date', x.date, 'end_date', x.end_date, 'place', x.place, 'province', x.province, 'country', x.country,
               'modality', x.modality, 'subtype', x.subtype, 'km', x.km, 'race_type', x.race_type, 'circuit', x.circuit,
               'participants', (select count(*) from results s where s.race_id = x.id),
               'podium', (select coalesce(jsonb_agg(jsonb_build_object('position', s.position, 'name', s.runner_name, 'category', s.category)
                                                    order by s.position), '[]'::jsonb)
                            from results s where s.race_id = x.id and s.position between 1 and 3))
             order by x.date desc)
        from races x
       where x.date >= current_date - 21 and x.date <= current_date
         and exists (select 1 from results s where s.race_id = x.id)), '[]'::jsonb),
    'posted', coalesce((select jsonb_agg(key) from social_posts where posted_at > now() - interval '120 days'), '[]'::jsonb));
end $$;

revoke execute on function public.social_view(text) from public, anon;
grant execute on function public.social_view(text) to anon, authenticated;
