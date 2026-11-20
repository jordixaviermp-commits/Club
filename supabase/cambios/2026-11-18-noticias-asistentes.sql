-- =====================================================================
--  Cambio del 18/11/2026: en las noticias que piden confirmación («Me apunto»),
--  el corredor puede ver QUIÉN asiste (nombres y acompañantes), no solo el número.
--  Se puede ejecutar más de una vez.
-- =====================================================================
create or replace function public.runner_news(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body,
                                                       'created_at', n.created_at, 'expires_at', n.expires_at, 'rsvp', n.rsvp,
                                                       'my_answer', (select a.answer from announcement_replies a where a.announcement_id = n.id and a.runner_id = v_runner),
                                                       'my_guests', (select a.guests from announcement_replies a where a.announcement_id = n.id and a.runner_id = v_runner),
                                                       'yes_count', (select coalesce(count(*) + sum(a.guests), 0) from announcement_replies a where a.announcement_id = n.id and a.answer = 'si'),
                                                       'no_count', (select count(*) from announcement_replies a where a.announcement_id = n.id and a.answer = 'no'),
                                                       -- quién asiste (solo nombre y acompañantes), para verlo desplegado
                                                       'yes_list', (select coalesce(jsonb_agg(jsonb_build_object('name', rn.name, 'guests', a.guests) order by rn.name), '[]'::jsonb)
                                                                      from announcement_replies a join runners rn on rn.id = a.runner_id
                                                                     where a.announcement_id = n.id and a.answer = 'si'))
                                    order by n.created_at desc)
                     from (select * from announcements where expires_at is null or expires_at >= current_date
                            order by created_at desc limit 30) n), '[]'::jsonb);
end $$;
