-- Notas personales del corredor en cada carrera a la que está inscrito (hotel, coche, quién va contigo…).
-- Solo las ve y las edita el propio corredor (por su enlace); la dirección no las ve en la app. Si se borra de la carrera, la nota desaparece.
-- Ejecutar entero en Supabase → SQL Editor.
create table if not exists public.runner_entry_notes (
  runner_id       uuid not null,
  registration_id uuid not null,
  note            text not null check (length(note) between 1 and 1000),
  updated_at      timestamptz not null default now(),
  primary key (runner_id, registration_id),
  foreign key (registration_id, runner_id) references public.registration_entries (registration_id, runner_id) on delete cascade
);
alter table public.runner_entry_notes enable row level security;
revoke all on public.runner_entry_notes from anon, authenticated, public;

create or replace function public.runner_notes_list(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from runners where code = p_code;
  if v is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((select jsonb_object_agg(registration_id::text, note) from runner_entry_notes where runner_id = v), '{}'::jsonb);
end $$;

create or replace function public.runner_note_set(p_code text, p_registration uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid; n text := btrim(coalesce(p_note, ''));
begin
  select id into v from runners where code = p_code;
  if v is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if length(n) > 1000 then raise exception 'nota_demasiado_larga'; end if;
  if n = '' then delete from runner_entry_notes where runner_id = v and registration_id = p_registration; return; end if;
  if not exists (select 1 from registration_entries where registration_id = p_registration and runner_id = v) then raise exception 'no_inscrito'; end if;
  insert into runner_entry_notes (runner_id, registration_id, note) values (v, p_registration, n)
    on conflict (runner_id, registration_id) do update set note = excluded.note, updated_at = now();
end $$;

grant execute on function public.runner_notes_list(text), public.runner_note_set(text, uuid, text) to anon, authenticated;

select 'notas-inscripcion ejecutada' as resultado;
