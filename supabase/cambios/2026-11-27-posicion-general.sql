-- Puesto en la clasificación GENERAL (todas las categorías), opcional, además del puesto en su categoría. Son TRES trozos cortos:
-- pégalos y ejecútalos uno a uno, en este orden (cada uno se puede repetir sin problema), o todo el archivo de golpe.

-- ===== TROZO 1: columnas y copia automática al pasar a resultados =====
alter table public.results add column if not exists general_position integer;
alter table public.results drop constraint if exists results_general_position_check;
alter table public.results add constraint results_general_position_check check (general_position is null or (general_position > 0 and general_position <= 9999));
alter table public.registration_entries add column if not exists self_general_position integer;
alter table public.registration_entries drop constraint if exists entries_self_general_check;
alter table public.registration_entries add constraint entries_self_general_check check (self_general_position is null or (self_general_position > 0 and self_general_position <= 9999));

create or replace function public.results_fill_general()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.general_position is null and new.runner_id is not null then
    select e.self_general_position into new.general_position
      from registration_entries e
      join registrations g on g.id = e.registration_id
      join races r on r.id = new.race_id
     where e.runner_id = new.runner_id and g.name = r.name and g.date = r.date
     limit 1;
  end if;
  return new;
end $$;
drop trigger if exists results_fill_general on public.results;
create trigger results_fill_general before insert on public.results
  for each row execute function public.results_fill_general();

-- ===== TROZO 2: el corredor pone o quita su puesto general =====
create or replace function public.runner_set_general(p_code text, p_kind text, p_id uuid, p_general int)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_pos int;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if p_kind = 'reg' then
    select self_position into v_pos from registration_entries where registration_id = p_id and runner_id = v_runner;
  elsif p_kind = 'race' then
    select position into v_pos from results where race_id = p_id and runner_id = v_runner;
  else
    raise exception 'tipo_no_valido';
  end if;
  if not found then raise exception 'no_es_tuya' using errcode = '42501'; end if;
  if p_general is not null and (v_pos is null or p_general < v_pos or p_general > 9999) then raise exception 'puesto_general_no_valido'; end if;
  if p_kind = 'reg' then
    update registration_entries set self_general_position = p_general where registration_id = p_id and runner_id = v_runner;
  else
    update results set general_position = p_general where race_id = p_id and runner_id = v_runner;
  end if;
end $$;
grant execute on function public.runner_set_general(text, text, uuid, int) to anon, authenticated;

-- ===== TROZO 3: lectura de los puestos generales =====
create or replace function public.runner_generals(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from runners where code = p_code;
  if v is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return jsonb_build_object(
    'regs', coalesce((select jsonb_object_agg(registration_id::text, self_general_position)
                        from registration_entries where runner_id = v and self_general_position is not null), '{}'::jsonb),
    'results', coalesce((select jsonb_agg(jsonb_build_array(race_id, runner_id, general_position))
                           from results where general_position is not null), '[]'::jsonb));
end $$;
grant execute on function public.runner_generals(text) to anon, authenticated;

select 'posicion-general ejecutada' as resultado;
