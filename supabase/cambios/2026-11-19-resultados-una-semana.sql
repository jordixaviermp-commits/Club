-- Una semana (en vez de 3 días) para que los corredores pongan su resultado antes de que la carrera pase sola
-- a la clasificación del equipo. Después sigue abierto: quien no lo puso se añade con «La hice: añadirme».
-- Ejecutar entero en Supabase → SQL Editor.

create or replace function public.auto_promote_registrations()
returns int language plpgsql security definer set search_path = public as $$
declare g registrations; v_race uuid; v_n int := 0;
begin
  perform set_config('app.skip_log', 'on', true);
  for g in select * from registrations r
            where not r.suspended and coalesce(r.end_date, r.date) < current_date - 7
              and exists (select 1 from registration_entries e where e.registration_id = r.id and e.self_position is not null)
            for update skip locked loop
    insert into races (name, date, end_date, place, province, country, modality, notes, race_type, circuit, subtype, km, created_by, url, elevation, price, lat, lon, geo_key)
    values (g.name, g.date, g.end_date, g.place, g.province, g.country, g.modality, g.notes, g.race_type, g.circuit, g.subtype, g.km, g.created_by, g.url, g.elevation, g.price, g.lat, g.lon, g.geo_key)
    returning id into v_race;
    insert into results (race_id, runner_id, runner_name, category, position, podium_type, self_reported, time_seconds)
    select v_race, e.runner_id, rn.name, e.category, e.self_position,
           case when e.self_position between 1 and 3 then coalesce(e.self_podium_type, 'suelta') else 'suelta' end, true,
           e.self_time_seconds
      from registration_entries e join runners rn on rn.id = e.runner_id
     where e.registration_id = g.id and e.self_position is not null;
    delete from registrations where id = g.id;
    perform public.log_change('Sistema', 'race', v_race, 'auto_resultados', format('pasó sola a resultados: %s (%s)', g.name, g.date));
    v_n := v_n + 1;
  end loop;
  perform public.watch_cleanup();   -- quita las «candidatas» (de Por valorar) que ya nadie valora o que ya pasaron sin inscritos
  perform set_config('app.skip_log', 'off', true);
  return v_n;
end $$;

select 'resultados-una-semana ejecutada' as resultado;
