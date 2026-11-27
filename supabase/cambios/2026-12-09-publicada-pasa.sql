-- Al marcar una crónica como «Ya publicada», si la inscripción ya se disputó y TODOS los inscritos tienen su resultado (o abandono), pasa sola a «Carreras hechas»
-- (se hace lo mismo que el botón «Pasar a resultados» de la dirección). Si falta algún resultado, no pasa y sigue la regla de siempre (a los 7 días). UN trozo; se puede repetir.
create or replace function public.trg_chronicle_published() returns trigger language plpgsql security definer set search_path = public as $$
declare g registrations;
begin
  if new.status = 'publicada' and old.status is distinct from 'publicada' then
    select * into g from registrations
     where not suspended and to_char(date, 'YYYY-MM-DD') || '|' || public.cron_name_key(name) = new.race_key limit 1;
    if found and coalesce(g.end_date, g.date) < current_date
       and exists (select 1 from registration_entries e where e.registration_id = g.id)
       and not exists (select 1 from registration_entries e where e.registration_id = g.id and e.self_position is null and not e.self_dnf) then
      begin perform public.promote_registration(g.id);
      exception when others then null;   -- si no lo puede hacer quien lo marca (no es dirección), no se bloquea nada: seguirá la regla de los 7 días
      end;
    end if;
  end if;
  return null;
end $$;
revoke all on function public.trg_chronicle_published() from public, anon, authenticated;
drop trigger if exists chronicle_published on public.chronicle_posts;
create trigger chronicle_published after update of status on public.chronicle_posts for each row execute function public.trg_chronicle_published();
