-- =====================================================================
--  Cambio del 11/11/2026: los corredores pueden añadir carreras (lupa).
--  Versión corta para pegar desde el móvil. Equivale a ejecutar
--  supabase/schema.sql completo. Se puede ejecutar más de una vez.
-- =====================================================================

alter table public.registrations add column if not exists created_by uuid references public.runners(id) on delete set null;

-- Un corredor añade una carrera que no estaba y queda apuntado.
-- Si ya hay una con el mismo nombre el mismo día, no se duplica: se le apunta a esa.
-- Límites contra errores o abusos: nombre de 3 a 120 caracteres, fecha entre hoy y dos años,
-- como mucho 10 carreras creadas por corredor y día. Solo la dirección puede editarlas o borrarlas.
create or replace function public.runner_create_registration(p_code text, p_reg jsonb, p_category text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_runner uuid; v_id uuid;
  v_name text := btrim(regexp_replace(coalesce(p_reg->>'name',''), '\s+', ' ', 'g'));
  v_date date := nullif(p_reg->>'date','')::date;
  v_end  date := nullif(nullif(p_reg->>'end_date',''), p_reg->>'date')::date;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'nombre_no_valido'; end if;
  if v_date is null or v_date < current_date or v_date > current_date + 730 then raise exception 'fecha_no_valida'; end if;
  if v_end is not null and (v_end < v_date or v_end > v_date + 30) then raise exception 'fecha_no_valida'; end if;
  if (select count(*) from registrations where created_by = v_runner and created_at > now() - interval '1 day') >= 10 then
    raise exception 'demasiadas_carreras';
  end if;
  select id into v_id from registrations where date = v_date and lower(name) = lower(v_name) limit 1;
  if v_id is null then
    insert into registrations (name, date, end_date, place, province, country, modality, notes, created_by)
    values (v_name, v_date, v_end,
            nullif(left(btrim(coalesce(p_reg->>'place','')), 120), ''), nullif(left(btrim(coalesce(p_reg->>'province','')), 60), ''),
            coalesce(nullif(left(btrim(coalesce(p_reg->>'country','')), 60), ''), 'España'),
            coalesce(nullif(p_reg->>'modality',''), 'Carretera'), nullif(left(btrim(coalesce(p_reg->>'notes','')), 500), ''), v_runner)
    returning id into v_id;
  end if;
  insert into registration_entries (registration_id, runner_id, category)
  values (v_id, v_runner, nullif(p_category, ''))
  on conflict (registration_id, runner_id) do update set category = excluded.category;
  return v_id;
end $$;

revoke execute on function public.runner_create_registration(text, jsonb, text) from public;
grant execute on function public.runner_create_registration(text, jsonb, text) to anon, authenticated;
