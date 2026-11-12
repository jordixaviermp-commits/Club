-- =====================================================================
--  Cambio del 12/11/2026 · PARTE 1 de 3: historial de cambios
--  Historial de cambios, paso automático a resultados y «completar
--  datos» por los corredores.
--  Pega y ejecuta las partes en orden: 1, 2 y 3. Se pueden repetir.
-- =====================================================================

-- Historial de cambios: quién cambió qué y cuándo (carreras, inscripciones, resultados puestos por los corredores
-- y pasos automáticos a resultados). Solo lo ve la dirección. Se rellena solo, con disparadores y funciones.
create table if not exists public.change_log (
  id        uuid primary key default gen_random_uuid(),
  at        timestamptz not null default now(),
  actor     text not null,
  entity    text not null,
  entity_id uuid,
  action    text not null,
  summary   text not null
);
create index if not exists change_log_at_idx on public.change_log(at desc);
alter table public.change_log enable row level security;  -- permisos: ver «Seguridad» más abajo

drop policy if exists admin_all on public.change_log;
create policy admin_all on public.change_log for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.change_log from anon, public;
grant select, insert, update, delete on public.change_log to authenticated;

create or replace function public.log_change(p_actor text, p_entity text, p_entity_id uuid, p_action text, p_summary text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into change_log (actor, entity, entity_id, action, summary) values (p_actor, p_entity, p_entity_id, p_action, left(p_summary, 500));
  if random() < 0.01 then delete from change_log where at < now() - interval '2 years'; end if;
end $$;

create or replace function public.log_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row jsonb; v_actor text; v_what text; v_sum text; v_changes text := ''; k text;
begin
  if current_setting('app.skip_log', true) = 'on' then return coalesce(new, old); end if;
  v_row := coalesce(v_new, v_old);
  v_what := case tg_table_name when 'races' then 'la carrera' else 'la inscripción' end;
  v_actor := nullif(current_setting('app.actor', true), '');
  if v_actor is null and public.is_admin() then v_actor := 'Dirección'; end if;
  if v_actor is null and (v_row->>'created_by') is not null then
    select name into v_actor from runners where id = (v_row->>'created_by')::uuid;
  end if;
  v_actor := coalesce(v_actor, 'Corredor');
  if tg_op = 'INSERT' then
    v_sum := format('creó %s %s (%s)', v_what, v_row->>'name', v_row->>'date');
  elsif tg_op = 'DELETE' then
    v_sum := format('borró %s %s (%s)', v_what, v_row->>'name', v_row->>'date');
  else
    foreach k in array array['name','date','end_date','place','province','country','modality','notes','race_type','circuit','subtype','km','suspended'] loop
      if v_old->k is distinct from v_new->k then
        v_changes := v_changes || case when v_changes = '' then '' else '; ' end
                     || k || ': ' || coalesce(v_old->>k, '—') || ' → ' || coalesce(v_new->>k, '—');
      end if;
    end loop;
    if v_changes = '' then return new; end if;
    v_sum := format('cambió %s %s: %s', v_what, v_new->>'name', v_changes);
  end if;
  perform public.log_change(v_actor, case tg_table_name when 'races' then 'race' else 'registration' end,
                            (v_row->>'id')::uuid, lower(tg_op), v_sum);
  return coalesce(new, old);
end $$;

drop trigger if exists registrations_log on public.registrations;
create trigger registrations_log after insert or update or delete on public.registrations
  for each row execute function public.log_row_change();
drop trigger if exists races_log on public.races;
create trigger races_log after insert or update or delete on public.races
  for each row execute function public.log_row_change();


-- Solo las funciones y disparadores de dentro escriben en el historial: nadie de fuera.
revoke execute on function public.log_change(text, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.log_row_change() from public, anon, authenticated;
