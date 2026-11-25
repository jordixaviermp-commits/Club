-- Las cifras de Instagram de los corredores pasan a calcularse en la app con la MISMA función que usa la dirección (Redes y Dossier):
-- así coinciden siempre. El servidor solo entrega las filas con las cifras sumables (periodos, el último nº de seguidores y,
-- si no hay periodos, los datos diarios). Nada de publicaciones, audiencia ni datos por persona.
-- Sustituye al cambio del 25/11 (impacto-redes-periodos). Ejecutar entero en Supabase → SQL Editor; se puede repetir.
create or replace function public.runner_social_impact(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_runner uuid; v_rows jsonb := '[]'::jsonb; v_has boolean := false;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  begin   -- las estadísticas de Instagram son opcionales: si aún no existen, solo se devuelven las publicaciones
    select exists (select 1 from ig_snapshots where kind = 'period' and key ~ '^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$') into v_has;
    select coalesce(jsonb_agg(r), '[]'::jsonb) into v_rows from (
      select jsonb_build_object('kind', kind, 'key', key, 'data', data - array['posts','gender','ages','cities','countries','top_hours','note','approx']) as r
        from ig_snapshots where kind = 'period'
      union all
      select jsonb_build_object('kind', 'account', 'key', key, 'data', jsonb_build_object('followers', data->'followers'))
        from (select key, data from ig_snapshots where kind = 'account' and data ? 'followers' order by key desc limit 1) a
      union all
      select jsonb_build_object('kind', 'day', 'key', key, 'data', jsonb_build_object('views', data->'views', 'reach', data->'reach', 'interactions', data->'interactions',
               'follows', data->'follows', 'views_f', data->'views_f', 'views_nf', data->'views_nf'))
        from ig_snapshots where kind = 'day' and not v_has
    ) q;
  exception when others then v_rows := '[]'::jsonb;
  end;
  return jsonb_build_object('posted', coalesce((select jsonb_agg(key) from social_posts), '[]'::jsonb), 'ig_rows', v_rows);
end $$;

grant execute on function public.runner_social_impact(text) to anon, authenticated;

select 'impacto-redes-cifras ejecutada' as resultado;
