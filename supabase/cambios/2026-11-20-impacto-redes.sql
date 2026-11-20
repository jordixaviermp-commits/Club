-- «Impacto en redes» para los corredores: qué publicaciones ha generado el club y las cifras de Instagram del club
-- de los últimos 30 días (solo agregados: nada por persona ni datos de seguidores). Ejecutar entero en Supabase → SQL Editor.

create or replace function public.runner_social_impact(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_runner uuid; v_from text := to_char(current_date - 30, 'YYYY-MM-DD'); v_ig jsonb := null;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  begin   -- las estadísticas de Instagram son opcionales: si aún no existen, solo se devuelven las publicaciones
    select jsonb_build_object(
      'days', count(*), 'views', coalesce(sum((data->>'views')::numeric), 0), 'reach_avg', coalesce(round(avg((data->>'reach')::numeric)), 0),
      'interactions', coalesce(sum((data->>'interactions')::numeric), 0), 'follows', coalesce(sum((data->>'follows')::numeric), 0),
      'followers', (select (a.data->>'followers')::int from ig_snapshots a where a.kind = 'account' and a.data ? 'followers' order by a.key desc limit 1))
      into v_ig from ig_snapshots where kind = 'day' and key >= v_from;
  exception when others then v_ig := null;
  end;
  return jsonb_build_object('posted', coalesce((select jsonb_agg(key) from social_posts), '[]'::jsonb), 'ig', v_ig, 'from', v_from);
end $$;

grant execute on function public.runner_social_impact(text) to anon, authenticated;

select 'impacto-redes ejecutada' as resultado;
