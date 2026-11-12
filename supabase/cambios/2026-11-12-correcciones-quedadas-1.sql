-- =====================================================================
--  Cambio del 12/11/2026 · PARTE 1 de 2: correcciones de puesto
--  Delegar en los corredores (2/3): pedir correcciones de puesto y
--  confirmar asistencia a las quedadas desde las noticias.
--  Pega primero la parte 1 y después la 2. Se pueden repetir.
-- =====================================================================

-- Correcciones de puesto que piden los corredores (la dirección las acepta o rechaza con un toque).
create table if not exists public.correction_requests (
  id              uuid primary key default gen_random_uuid(),
  runner_id       uuid not null references public.runners(id) on delete cascade,
  kind            text not null check (kind in ('reg','race')),
  target_id       uuid not null,                       -- inscripción o carrera (si ya pasó a resultados se busca por nombre y fecha)
  race_name       text not null,
  race_date       date,
  old_position    integer,
  new_position    integer not null check (new_position between 1 and 999),
  new_category    text check (new_category in ('Sub-23','Élite','M30','M40','M50','M60')),
  new_podium_type text check (new_podium_type in ('suelta','general','campeonato')),
  note            text check (length(note) <= 300),
  status          text not null default 'pendiente' check (status in ('pendiente','aceptada','rechazada')),
  reply           text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index if not exists correction_requests_runner_idx on public.correction_requests(runner_id);
alter table public.correction_requests enable row level security;  -- permisos: ver «Seguridad» más abajo

drop policy if exists admin_all on public.correction_requests;
create policy admin_all on public.correction_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.correction_requests from anon, public;
grant select, insert, update, delete on public.correction_requests to authenticated;

create or replace function public.runner_request_correction(p_code text, p_kind text, p_id uuid, p_position int,
                                                            p_category text, p_podium_type text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_runner uuid; v_name text; v_old int; v_rname text; v_rdate date; v_id uuid;
  v_cat text := nullif(p_category, '');
  v_pod text := case when p_position between 1 and 3 then coalesce(nullif(p_podium_type, ''), 'suelta') end;
begin
  select id, name into v_runner, v_name from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if p_position is null or p_position < 1 or p_position > 999 then raise exception 'puesto_no_valido'; end if;
  if p_kind = 'reg' then
    select e.self_position, g.name, g.date into v_old, v_rname, v_rdate
      from registration_entries e join registrations g on g.id = e.registration_id
     where e.registration_id = p_id and e.runner_id = v_runner;
  elsif p_kind = 'race' then
    select x.position, r.name, r.date into v_old, v_rname, v_rdate
      from results x join races r on r.id = x.race_id where x.race_id = p_id and x.runner_id = v_runner;
  else
    raise exception 'tipo_no_valido';
  end if;
  if v_old is null then raise exception 'no_es_tuya' using errcode = '42501'; end if;   -- no es suya o aún no puso su puesto
  if v_old = p_position and v_cat is null and nullif(p_podium_type, '') is null then raise exception 'sin_cambios'; end if;
  if exists (select 1 from correction_requests where runner_id = v_runner and target_id = p_id and status = 'pendiente') then
    raise exception 'ya_existe';
  end if;
  if (select count(*) from correction_requests where runner_id = v_runner and status = 'pendiente') >= 5 then
    raise exception 'demasiadas_carreras';
  end if;
  insert into correction_requests (runner_id, kind, target_id, race_name, race_date, old_position, new_position, new_category, new_podium_type, note)
  values (v_runner, p_kind, p_id, v_rname, v_rdate, v_old, p_position, v_cat, v_pod, nullif(left(btrim(coalesce(p_note, '')), 300), ''))
  returning id into v_id;
  perform public.log_change(v_name, 'result', p_id, 'correccion', format('pidió corregir su puesto en %s: %sº → %sº', v_rname, v_old, p_position));
  return v_id;
end $$;

create or replace function public.runner_corrections(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(to_jsonb(c) - 'runner_id' order by c.created_at desc)
                     from (select * from correction_requests where runner_id = v_runner order by created_at desc limit 20) c), '[]'::jsonb);
end $$;

create or replace function public.runner_cancel_correction(p_code text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  delete from correction_requests where id = p_id and runner_id = v_runner and status = 'pendiente';
  if not found then raise exception 'no_es_tuya' using errcode = '42501'; end if;
end $$;

create or replace function public.resolve_correction(p_id uuid, p_accept boolean, p_reply text)
returns void language plpgsql security definer set search_path = public as $$
declare c correction_requests; n int := 0; v_pod text; v_name text;
begin
  perform public.require_admin();
  select * into c from correction_requests where id = p_id and status = 'pendiente' for update;
  if not found then raise exception 'no_existe'; end if;
  select name into v_name from runners where id = c.runner_id;
  if p_accept then
    v_pod := case when c.new_position between 1 and 3 then coalesce(c.new_podium_type, 'suelta') end;
    if c.kind = 'reg' then
      update registration_entries set self_position = c.new_position, self_podium_type = v_pod, category = coalesce(c.new_category, category)
       where registration_id = c.target_id and runner_id = c.runner_id;
      get diagnostics n = row_count;
    end if;
    if n = 0 then   -- ya pasó a resultados: se corrige en la carrera
      update results set position = c.new_position, podium_type = coalesce(v_pod, 'suelta'), category = coalesce(c.new_category, category), self_reported = true
       where runner_id = c.runner_id
         and race_id = case when c.kind = 'race' then c.target_id
                            else (select id from races where name = c.race_name and date = c.race_date limit 1) end;
      get diagnostics n = row_count;
    end if;
    if n = 0 then raise exception 'no_existe'; end if;
  end if;
  update correction_requests set status = case when p_accept then 'aceptada' else 'rechazada' end,
         reply = nullif(left(btrim(coalesce(p_reply, '')), 300), ''), resolved_at = now() where id = p_id;
  perform public.log_change('Dirección', 'result', c.target_id, 'correccion',
    format('%s la corrección de %s en %s: %sº → %sº', case when p_accept then 'aceptó' else 'rechazó' end, v_name, c.race_name, c.old_position, c.new_position));
end $$;

revoke execute on function public.runner_request_correction(text, text, uuid, int, text, text, text), public.runner_corrections(text),
                           public.runner_cancel_correction(text, uuid), public.resolve_correction(uuid, boolean, text) from public;
grant execute on function public.runner_request_correction(text, text, uuid, int, text, text, text), public.runner_corrections(text),
                          public.runner_cancel_correction(text, uuid) to anon, authenticated;
grant execute on function public.resolve_correction(uuid, boolean, text) to authenticated;
