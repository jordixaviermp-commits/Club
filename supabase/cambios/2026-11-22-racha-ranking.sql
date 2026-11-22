-- Clasificación de la racha «al día»: cuántas carreras seguidas tiene cada corredor con su resultado puesto y su crónica pasada.
-- Va de la carrera más reciente hacia atrás; las de la última semana sin terminar no la rompen (hay una semana de plazo).
-- Ejecutar entero en Supabase → SQL Editor.
create or replace function public.cron_name_key(t text)
returns text language sql immutable as $$
  select btrim(regexp_replace(translate(lower(coalesce(t, '')), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc'), '\s+', ' ', 'g'))
$$;

create or replace function public.runner_streaks(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from runners where code = p_code) then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((
    with rws as (
      select res.runner_id, rc.date, coalesce(rc.end_date, rc.date) as last_day,
             (res.position is not null and exists (select 1 from chronicles c where c.race_key = to_char(rc.date, 'YYYY-MM-DD') || '|' || public.cron_name_key(rc.name))) as complete
        from results res join races rc on rc.id = res.race_id where res.runner_id is not null
      union all
      select e.runner_id, g.date, coalesce(g.end_date, g.date),
             (e.self_position is not null and exists (select 1 from chronicles c where c.race_key = to_char(g.date, 'YYYY-MM-DD') || '|' || public.cron_name_key(g.name)))
        from registration_entries e join registrations g on g.id = e.registration_id
       where g.date < current_date and not g.suspended
    ), br as (
      select runner_id, max(date) as d from rws where not complete and last_day < current_date - 7 group by runner_id
    ), st as (
      select r.id, r.name, (select count(*) from rws x where x.runner_id = r.id and x.complete
                              and x.date > coalesce((select b.d from br b where b.runner_id = r.id), date '1900-01-01'))::int as n
        from runners r
    )
    select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'streak', n) order by n desc, name) from st where n > 0), '[]'::jsonb);
end $$;

grant execute on function public.runner_streaks(text) to anon, authenticated;

select 'racha-ranking ejecutada' as resultado;
