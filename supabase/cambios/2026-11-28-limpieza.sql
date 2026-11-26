-- Limpieza de datos antiguos (solo dirección, a mano, cuando haga falta: cada varias temporadas).
-- Borra lo anterior al 1 de enero del año siguiente al elegido; se conserva lo posterior y las carreras que se prolongan hasta el año siguiente.
-- Necesita antes los SQL de «notas», «coche compartido»: ejecútalos si no lo has hecho. Son DOS trozos cortos (pégalos uno a uno; se pueden repetir).

-- ===== TROZO 1: cuánto se borraría (vista previa, no borra nada) =====
create or replace function public.admin_purge_counts(p_upto int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c date;
begin
  perform public.require_admin();
  if p_upto is null or p_upto not between 2000 and 2100 then raise exception 'datos_no_validos'; end if;
  c := make_date(p_upto + 1, 1, 1);
  return jsonb_build_object(
    'races', (select count(*) from races where coalesce(end_date, date) < c),
    'results', (select count(*) from results x join races r on r.id = x.race_id where coalesce(r.end_date, r.date) < c),
    'circuits', (select count(*) from circuit_podiums where year <= p_upto),
    'regs', (select count(*) from registrations where coalesce(end_date, date) < c),
    'entries', (select count(*) from registration_entries e join registrations g on g.id = e.registration_id where coalesce(g.end_date, g.date) < c),
    'notes', (select count(*) from runner_entry_notes n join registrations g on g.id = n.registration_id where coalesce(g.end_date, g.date) < c),
    'cars', (select count(*) from car_offers o join registrations g on g.id = o.registration_id where coalesce(g.end_date, g.date) < c),
    'marks', (select count(*) from chronicles where left(race_key, 10) < c::text)
           + (select count(*) from social_posts where substring(key from '\d{4}-\d{2}-\d{2}') < c::text)
           + (select count(*) from correction_requests where race_date < c),
    'log', (select count(*) from change_log where at < c));
end $$;
grant execute on function public.admin_purge_counts(int) to authenticated;

-- ===== TROZO 2: borrar =====
create or replace function public.admin_purge(p_upto int, p_what text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare c date; n jsonb;
begin
  perform public.require_admin();
  if p_upto is null or p_upto not between 2000 and 2100 or p_what is null or not (p_what <@ array['races','regs','marks','log']) then raise exception 'datos_no_validos'; end if;
  c := make_date(p_upto + 1, 1, 1);
  n := public.admin_purge_counts(p_upto);
  perform set_config('app.skip_log', 'on', true);
  if 'races' = any(p_what) then
    delete from circuit_podiums where year <= p_upto;
    delete from races where coalesce(end_date, date) < c;
  end if;
  if 'regs' = any(p_what) then delete from registrations where coalesce(end_date, date) < c; end if;
  if 'marks' = any(p_what) then
    delete from chronicles where left(race_key, 10) < c::text;
    delete from social_posts where substring(key from '\d{4}-\d{2}-\d{2}') < c::text;
    delete from correction_requests where race_date < c;
  end if;
  if 'log' = any(p_what) then delete from change_log where at < c; end if;
  perform set_config('app.skip_log', 'off', true);
  perform public.log_change('Dirección', 'purga', null, 'borrado', format('borró datos hasta %s (%s)', p_upto, array_to_string(p_what, ', ')));
  return jsonb_build_object('upto', p_upto, 'what', to_jsonb(p_what), 'counts', n);
end $$;
grant execute on function public.admin_purge(int, text[]) to authenticated;

select 'limpieza ejecutada' as resultado;
