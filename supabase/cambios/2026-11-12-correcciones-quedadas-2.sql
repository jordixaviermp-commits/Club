-- =====================================================================
--  Cambio del 12/11/2026 · PARTE 2 de 2: confirmar asistencia en las noticias
--  Delegar en los corredores (2/3): pedir correcciones de puesto y
--  confirmar asistencia a las quedadas desde las noticias.
--  Pega primero la parte 1 y después la 2. Se pueden repetir.
-- =====================================================================

-- Noticias que piden confirmación (quedadas…): «Me apunto / No voy» y acompañantes.
alter table public.announcements add column if not exists rsvp boolean not null default false;
create table if not exists public.announcement_replies (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  runner_id       uuid not null references public.runners(id) on delete cascade,
  answer          text not null check (answer in ('si','no')),
  guests          integer not null default 0 check (guests between 0 and 10),
  updated_at      timestamptz not null default now(),
  primary key (announcement_id, runner_id)
);
alter table public.announcement_replies enable row level security;  -- permisos: ver «Seguridad» más abajo

drop policy if exists admin_all on public.announcement_replies;
create policy admin_all on public.announcement_replies for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.announcement_replies from anon, public;
grant select, insert, update, delete on public.announcement_replies to authenticated;

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
                                                       'no_count', (select count(*) from announcement_replies a where a.announcement_id = n.id and a.answer = 'no'))
                                    order by n.created_at desc)
                     from (select * from announcements where expires_at is null or expires_at >= current_date
                            order by created_at desc limit 30) n), '[]'::jsonb);
end $$;

create or replace function public.runner_reply_news(p_code text, p_id uuid, p_answer text, p_guests int)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_name text;
begin
  select id, name into v_runner, v_name from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if p_answer not in ('si', 'no') then raise exception 'tipo_no_valido'; end if;
  if not exists (select 1 from announcements where id = p_id and rsvp and (expires_at is null or expires_at >= current_date)) then
    raise exception 'inscripcion_cerrada';
  end if;
  insert into announcement_replies (announcement_id, runner_id, answer, guests)
  values (p_id, v_runner, p_answer, case when p_answer = 'si' then greatest(0, least(coalesce(p_guests, 0), 10)) else 0 end)
  on conflict (announcement_id, runner_id) do update set answer = excluded.answer, guests = excluded.guests, updated_at = now();
end $$;

revoke execute on function public.runner_reply_news(text, uuid, text, int) from public;
grant execute on function public.runner_reply_news(text, uuid, text, int) to anon, authenticated;
