-- =====================================================================
--  Cambio del 18/11/2026: el corredor marca que ha pagado su inscripción
--  (con el importe, opcional). Los compañeros ven solo «pagada»; el importe
--  es privado. Se puede ejecutar más de una vez.
--  NOTA: si ya has ejecutado «2026-11-18-pago-fecha.sql», NO ejecutes este (es
--  la versión anterior); el de «pago-fecha» lo incluye todo.
-- =====================================================================
alter table public.registration_entries add column if not exists paid_at timestamptz;
alter table public.registration_entries add column if not exists paid_amount numeric(8,2);
alter table public.registration_entries drop constraint if exists entries_paid_check;
alter table public.registration_entries add constraint entries_paid_check check (paid_amount is null or (paid_amount >= 0 and paid_amount <= 10000));

create or replace function public.runner_view(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me runners; v_year int := extract(year from current_date)::int; v_cfg jsonb;
begin
  select * into me from runners where code = p_code;
  if not found then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  perform public.auto_promote_registrations();   -- pasa solas a resultados las carreras ya disputadas con puestos
  select value -> v_year::text into v_cfg from settings where key = 'bonus';
  return jsonb_build_object(
    'me', jsonb_build_object('id', me.id, 'name', me.name, 'category', me.category),
    'today', current_date,
    -- Su bono de la temporada: solo lo suyo (sin la lista de quién es nuevo).
    -- Cada día de competición cuenta como una carrera (una de 3 días = 3).
    'bonus', jsonb_build_object(
      'year', v_year,
      -- Cuentan las carreras con resultados y también las inscripciones ya disputadas en las que el propio
      -- corredor ha puesto su puesto (aunque la dirección aún no las haya pasado a resultados).
      'done', (select coalesce(sum(coalesce(r.end_date - r.date, 0) + 1), 0)
                 from results x join races r on r.id = x.race_id
                where x.runner_id = me.id and extract(year from r.date) = v_year)
            + (select coalesce(sum(coalesce(g.end_date - g.date, 0) + 1), 0)
                 from registration_entries e join registrations g on g.id = e.registration_id
                where e.runner_id = me.id and e.self_position is not null and not g.suspended and extract(year from g.date) = v_year),
      'planned', (select coalesce(sum(coalesce(g.end_date - g.date, 0) + 1), 0)
                    from registration_entries e join registrations g on g.id = e.registration_id
                   where e.runner_id = me.id and e.self_position is null and not g.suspended and extract(year from g.date) = v_year),
      -- carreras suspendidas en las que estaba apuntado: cuentan para el mínimo, no para el bono
      'suspended', (select coalesce(sum(coalesce(g.end_date - g.date, 0) + 1), 0)
                      from registration_entries e join registrations g on g.id = e.registration_id
                     where e.runner_id = me.id and g.suspended and extract(year from g.date) = v_year),
      -- carreras extra por podios confirmados en la general final de un circuito (solo para el bono)
      'extra', (select count(*) from circuit_podiums c where c.runner_id = me.id and c.year = v_year and c.status = 'confirmado')
               * coalesce((v_cfg ->> 'circuitExtra')::int, 4),
      'config', v_cfg - 'nuevos',
      'contract', me.contract,
      'nuevo', coalesce(me.contract = 'nuevo' or (me.contract is null and v_cfg -> 'nuevos' ? me.id::text), false)),
    'circuits', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'year', c.year, 'circuit', c.circuit, 'position', c.position,
                                   'scope', c.scope, 'status', c.status, 'by_runner', c.by_runner) order by c.year desc, c.created_at)
                            from circuit_podiums c where c.runner_id = me.id), '[]'::jsonb),
    -- Sus propias carreras con resultados (todas las temporadas), para su lista «Mis carreras».
    'my_results', coalesce((
      select jsonb_agg(jsonb_build_object(
               'race_id', r.id, 'name', r.name, 'date', r.date, 'end_date', r.end_date, 'place', r.place,
               'province', r.province, 'country', r.country, 'modality', r.modality, 'stages', r.stages,
               'race_type', r.race_type, 'circuit', r.circuit, 'subtype', r.subtype, 'km', r.km, 'notes', r.notes,
               'mine_created', r.created_by = me.id,
               'others', (select count(*) from results o where o.race_id = r.id and o.runner_id is distinct from me.id),
               'category', x.category, 'position', x.position, 'podium_type', x.podium_type,
               'stage_positions', x.stage_positions, 'self_reported', x.self_reported, 'time_seconds', x.time_seconds)
             order by r.date desc, r.name)
        from results x join races r on r.id = x.race_id
       where x.runner_id = me.id), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'name', g.name, 'date', g.date, 'end_date', g.end_date, 'place', g.place,
               'mine_created', g.created_by = me.id, 'race_type', g.race_type, 'circuit', g.circuit, 'suspended', g.suspended, 'subtype', g.subtype, 'km', g.km,
               'my_result', (select jsonb_build_object('position', e.self_position, 'podium_type', e.self_podium_type, 'time_seconds', e.self_time_seconds)
                               from registration_entries e where e.registration_id = g.id and e.runner_id = me.id and e.self_position is not null),
               'province', g.province, 'country', g.country, 'modality', g.modality, 'notes', g.notes,
               'entries', coalesce((
                  select jsonb_agg(jsonb_build_object('runner_id', r.id, 'name', r.name, 'category', e.category,
                                     'paid', e.paid_at is not null, 'paid_amount', case when r.id = me.id then e.paid_amount end)
                                   order by r.name)
                    from registration_entries e join runners r on r.id = e.runner_id
                   where e.registration_id = g.id), '[]'::jsonb))
             order by g.date, g.name)
        from registrations g), '[]'::jsonb));
end $$;

-- El corredor marca (o desmarca) que ha pagado su inscripción; el importe es opcional y solo lo ve él (y la dirección).
create or replace function public.runner_set_paid(p_code text, p_registration uuid, p_paid boolean, p_amount numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if p_amount is not null and (p_amount < 0 or p_amount > 10000) then raise exception 'importe_no_valido'; end if;
  update registration_entries
     set paid_at = case when coalesce(p_paid, true) then coalesce(paid_at, now()) else null end,
         paid_amount = case when coalesce(p_paid, true) then p_amount else null end
   where registration_id = p_registration and runner_id = v_runner;
  if not found then raise exception 'no_inscrito'; end if;
end $$;
revoke execute on function public.runner_set_paid(text, uuid, boolean, numeric) from public, anon;
grant execute on function public.runner_set_paid(text, uuid, boolean, numeric) to anon, authenticated;
