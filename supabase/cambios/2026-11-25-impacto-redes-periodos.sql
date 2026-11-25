-- Las cifras de Instagram que ven los corredores (Crónicas → Impacto en redes) salen ahora del último PERIODO guardado
-- (las capturas de Insights que se vuelcan desde la versión 168). Antes solo leía los datos diarios de los últimos 30 días,
-- que ya no se actualizan: por eso los corredores no veían las cifras nuevas. Solo agregados del club, nada por persona.
-- Ejecutar entero en Supabase → SQL Editor. Se puede ejecutar más de una vez.
create or replace function public.runner_social_impact(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_runner uuid; v_from text := to_char(current_date - 30, 'YYYY-MM-DD'); v_ig jsonb := null; v_p record; v_followers int;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  begin   -- las estadísticas de Instagram son opcionales: si aún no existen, solo se devuelven las publicaciones
    select (a.data->>'followers')::int into v_followers from ig_snapshots a where a.kind = 'account' and a.data ? 'followers' order by a.key desc limit 1;
    select key, data into v_p from ig_snapshots
     where kind = 'period' and key ~ '^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$'
     order by split_part(key, '_', 2) desc, split_part(key, '_', 1) desc limit 1;
    if v_p.key is not null then
      v_ig := jsonb_build_object('source', 'period', 'from', split_part(v_p.key, '_', 1), 'to', split_part(v_p.key, '_', 2),
        'days', (split_part(v_p.key, '_', 2)::date - split_part(v_p.key, '_', 1)::date) + 1,
        'views', v_p.data->'views', 'interactions', v_p.data->'interactions', 'viewers', coalesce(v_p.data->'viewers', v_p.data->'reach'),
        'follows', coalesce(v_p.data->'net_follows', v_p.data->'follows'), 'profile_visits', v_p.data->'profile_visits',
        'followers', coalesce((v_p.data->>'followers')::int, v_followers));
    else
      select jsonb_build_object('source', 'day', 'days', count(*), 'views', coalesce(sum((data->>'views')::numeric), 0), 'reach_avg', coalesce(round(avg((data->>'reach')::numeric)), 0),
        'interactions', coalesce(sum((data->>'interactions')::numeric), 0), 'follows', coalesce(sum((data->>'follows')::numeric), 0), 'followers', v_followers)
        into v_ig from ig_snapshots where kind = 'day' and key >= v_from;
    end if;
  exception when others then v_ig := null;
  end;
  return jsonb_build_object('posted', coalesce((select jsonb_agg(key) from social_posts), '[]'::jsonb), 'ig', v_ig, 'from', v_from);
end $$;

grant execute on function public.runner_social_impact(text) to anon, authenticated;

select 'impacto-redes-periodos ejecutada' as resultado;
