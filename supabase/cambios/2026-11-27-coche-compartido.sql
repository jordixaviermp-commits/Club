-- Coche compartido: un corredor inscrito ofrece su coche (plazas, de dónde sale y a qué hora) y los demás inscritos se apuntan.
-- Lo ven todos los corredores en la ficha de la carrera. Si alguien se borra de la carrera, su coche o su plaza desaparecen solos.
-- Son CUATRO trozos cortos (para pegarlos desde el móvil): ejecútalos uno a uno, en este orden; cada uno se puede repetir.

-- ===== TROZO 1: tablas =====
create table if not exists public.car_offers (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  driver_id       uuid not null,
  seats           int not null check (seats between 1 and 8),
  from_place      text check (length(from_place) <= 60),
  depart          text check (length(depart) <= 30),
  note            text check (length(note) <= 80),
  created_at      timestamptz not null default now(),
  unique (registration_id, driver_id),
  foreign key (registration_id, driver_id) references public.registration_entries (registration_id, runner_id) on delete cascade
);
create table if not exists public.car_riders (
  offer_id        uuid not null references public.car_offers(id) on delete cascade,
  registration_id uuid not null,
  runner_id       uuid not null,
  created_at      timestamptz not null default now(),
  primary key (offer_id, runner_id),
  unique (registration_id, runner_id),
  foreign key (registration_id, runner_id) references public.registration_entries (registration_id, runner_id) on delete cascade
);
alter table public.car_offers enable row level security;
alter table public.car_riders enable row level security;
revoke all on public.car_offers, public.car_riders from anon, authenticated, public;

-- ===== TROZO 2: lectura de los coches =====
create or replace function public.runner_cars(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from runners where code = p_code) then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id, 'reg', o.registration_id, 'driver_id', o.driver_id, 'driver', d.name,
             'seats', o.seats, 'from', o.from_place, 'depart', o.depart, 'note', o.note,
             'riders', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) order by r.name)
                                   from car_riders cr join runners r on r.id = cr.runner_id where cr.offer_id = o.id), '[]'::jsonb))
           order by o.created_at)
      from car_offers o join runners d on d.id = o.driver_id join registrations g on g.id = o.registration_id
     where g.date >= current_date - 1), '[]'::jsonb);
end $$;
grant execute on function public.runner_cars(text) to anon, authenticated;

-- ===== TROZO 3: ofrecer, cambiar o quitar mi coche =====
create or replace function public.runner_car_save(p_code text, p_reg uuid, p_seats int, p_from text, p_depart text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid; n int;
begin
  select id into v from runners where code = p_code;
  if v is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if not exists (select 1 from registration_entries where registration_id = p_reg and runner_id = v) then raise exception 'no_inscrito'; end if;
  if exists (select 1 from registrations where id = p_reg and (suspended or date < current_date)) then raise exception 'carrera_cerrada'; end if;
  if p_seats is null or p_seats < 1 or p_seats > 8 then raise exception 'datos_no_validos'; end if;
  select count(*) into n from car_riders cr join car_offers o on o.id = cr.offer_id where o.registration_id = p_reg and o.driver_id = v;
  if p_seats < n then raise exception 'plazas_ocupadas'; end if;
  delete from car_riders where registration_id = p_reg and runner_id = v;
  insert into car_offers (registration_id, driver_id, seats, from_place, depart, note)
  values (p_reg, v, p_seats, nullif(left(btrim(coalesce(p_from, '')), 60), ''), nullif(left(btrim(coalesce(p_depart, '')), 30), ''), nullif(left(btrim(coalesce(p_note, '')), 80), ''))
  on conflict (registration_id, driver_id) do update set seats = excluded.seats, from_place = excluded.from_place, depart = excluded.depart, note = excluded.note;
end $$;
grant execute on function public.runner_car_save(text, uuid, int, text, text, text) to anon, authenticated;

create or replace function public.runner_car_delete(p_code text, p_reg uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from runners where code = p_code;
  if v is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  delete from car_offers where registration_id = p_reg and driver_id = v;
end $$;
grant execute on function public.runner_car_delete(text, uuid) to anon, authenticated;

-- ===== TROZO 4: apuntarse a un coche y salir =====
create or replace function public.runner_car_join(p_code text, p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid; o car_offers; n int;
begin
  select id into v from runners where code = p_code;
  if v is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  select * into o from car_offers where id = p_offer for update;
  if not found then raise exception 'no_existe'; end if;
  if o.driver_id = v or exists (select 1 from car_offers where registration_id = o.registration_id and driver_id = v) then raise exception 'ya_conduces'; end if;
  if not exists (select 1 from registration_entries where registration_id = o.registration_id and runner_id = v) then raise exception 'no_inscrito'; end if;
  if exists (select 1 from registrations where id = o.registration_id and (suspended or date < current_date)) then raise exception 'carrera_cerrada'; end if;
  select count(*) into n from car_riders where offer_id = p_offer and runner_id <> v;
  if n >= o.seats then raise exception 'coche_lleno'; end if;
  delete from car_riders where registration_id = o.registration_id and runner_id = v and offer_id <> p_offer;
  insert into car_riders (offer_id, registration_id, runner_id) values (p_offer, o.registration_id, v) on conflict do nothing;
end $$;
grant execute on function public.runner_car_join(text, uuid) to anon, authenticated;

create or replace function public.runner_car_leave(p_code text, p_reg uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from runners where code = p_code;
  if v is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  delete from car_riders where registration_id = p_reg and runner_id = v;
end $$;
grant execute on function public.runner_car_leave(text, uuid) to anon, authenticated;

select 'coche-compartido ejecutada' as resultado;
