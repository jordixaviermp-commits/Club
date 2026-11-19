-- =====================================================================
--  Cambio del 19/11/2026: «Por valorar».
--  Cada corredor puede guardarse carreras que le gustan pero en las que aún no
--  se inscribe (con fecha, web, precio, plazo y notas), para decidir con calma.
--  Es personal: solo lo ve el propio corredor. Se puede ejecutar más de una vez.
-- =====================================================================
-- ---------- «Por valorar»: carreras que el corredor se guarda para decidir más adelante ----------
-- Es personal: solo lo ve el propio corredor (sin política de lectura: se accede únicamente con las funciones de abajo,
-- ni la dirección ni los compañeros lo ven). No lleva clave foránea para que restaurar una copia no lo borre.
create table if not exists public.runner_watch (
  id         uuid primary key default gen_random_uuid(),
  runner_id  uuid not null,
  name       text not null check (length(btrim(name)) between 3 and 120),
  date       date not null,
  end_date   date,
  place      text check (place is null or length(place) <= 120),
  province   text check (province is null or length(province) <= 60),
  country    text check (country is null or length(country) <= 60),
  modality   text not null default 'Carretera' check (modality in ('Carretera','BTT','Gravel','Ciclocross','Pista','Otra')),
  subtype    text check (subtype is null or length(subtype) <= 40),
  km         numeric check (km is null or (km > 0 and km <= 1000)),
  url        text check (url is null or (length(url) <= 500 and url ~* '^https?://[^[:space:]]+$')),
  price      numeric check (price is null or (price >= 0 and price <= 10000)),
  deadline   date,                                                       -- último día para inscribirse
  notes      text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists runner_watch_runner on public.runner_watch (runner_id);
alter table public.runner_watch enable row level security;
revoke all on public.runner_watch from anon, authenticated, public;

-- Al borrar un corredor se borra lo suyo (salvo al restaurar una copia, que borra y vuelve a crear a todos).
create or replace function public.runner_watch_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.skip_log', true) = 'on' then return old; end if;
  delete from runner_watch where runner_id = old.id;
  return old;
end $$;
drop trigger if exists runner_watch_cleanup on public.runners;
create trigger runner_watch_cleanup after delete on public.runners for each row execute function public.runner_watch_cleanup();

create or replace function public.runner_watch_list(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(to_jsonb(w) - 'runner_id' order by w.date, w.created_at) from runner_watch w where w.runner_id = v_runner), '[]'::jsonb);
end $$;

-- Guarda (p_id nulo) o corrige (p_id) una carrera por valorar. Si ya tenía una con el mismo nombre y fecha, no la duplica.
create or replace function public.runner_watch_save(p_code text, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_runner uuid; v_id uuid;
  v_name text := btrim(regexp_replace(coalesce(p_data->>'name',''), '\s+', ' ', 'g'));
  v_date date := nullif(p_data->>'date','')::date;
  v_end date := nullif(nullif(p_data->>'end_date',''), p_data->>'date')::date;
  v_deadline date := nullif(p_data->>'deadline','')::date;
  v_url text := nullif(btrim(coalesce(p_data->>'url','')), '');
  v_price numeric := nullif(btrim(coalesce(p_data->>'price','')), '')::numeric;
  v_km numeric := nullif(btrim(coalesce(p_data->>'km','')), '')::numeric;
  v_mod text := coalesce(nullif(p_data->>'modality',''), 'Carretera');
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'nombre_no_valido'; end if;
  if v_date is null or v_date < make_date(extract(year from current_date)::int - 1, 1, 1) or v_date > current_date + 730 then raise exception 'fecha_no_valida'; end if;
  if v_end is not null and (v_end < v_date or v_end > v_date + 30) then raise exception 'fecha_no_valida'; end if;
  if v_deadline is not null and (v_deadline > v_date or v_deadline < v_date - 730) then raise exception 'plazo_no_valido'; end if;
  if v_url is not null and (length(v_url) > 500 or v_url !~* '^https?://[^[:space:]]+$') then raise exception 'enlace_web_no_valido'; end if;
  if v_price is not null and (v_price < 0 or v_price > 10000) then raise exception 'precio_no_valido'; end if;
  if v_km is not null and (v_km <= 0 or v_km > 1000) then raise exception 'km_no_validos'; end if;
  if v_mod not in ('Carretera','BTT','Gravel','Ciclocross','Pista','Otra') then raise exception 'modalidad_no_valida'; end if;
  if p_id is null then
    select id into v_id from runner_watch where runner_id = v_runner and date = v_date and lower(name) = lower(v_name) limit 1;
    if v_id is not null then return v_id; end if;
    if (select count(*) from runner_watch where runner_id = v_runner) >= 60 then raise exception 'demasiadas_guardadas'; end if;
    insert into runner_watch (runner_id, name, date, end_date, place, province, country, modality, subtype, km, url, price, deadline, notes)
    values (v_runner, v_name, v_date, v_end, nullif(left(btrim(coalesce(p_data->>'place','')), 120), ''), nullif(left(btrim(coalesce(p_data->>'province','')), 60), ''),
            nullif(left(btrim(coalesce(p_data->>'country','')), 60), ''), v_mod, nullif(left(btrim(coalesce(p_data->>'subtype','')), 40), ''), v_km, v_url, v_price, v_deadline,
            nullif(left(btrim(coalesce(p_data->>'notes','')), 500), ''))
    returning id into v_id;
  else
    update runner_watch set name = v_name, date = v_date, end_date = v_end, place = nullif(left(btrim(coalesce(p_data->>'place','')), 120), ''),
           province = nullif(left(btrim(coalesce(p_data->>'province','')), 60), ''), country = nullif(left(btrim(coalesce(p_data->>'country','')), 60), ''), modality = v_mod,
           subtype = nullif(left(btrim(coalesce(p_data->>'subtype','')), 40), ''), km = v_km, url = v_url, price = v_price, deadline = v_deadline,
           notes = nullif(left(btrim(coalesce(p_data->>'notes','')), 500), '')
     where id = p_id and runner_id = v_runner returning id into v_id;
    if v_id is null then raise exception 'no_encontrada'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.runner_watch_delete(p_code text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  delete from runner_watch where id = p_id and runner_id = v_runner;
end $$;

revoke execute on function public.runner_watch_list(text), public.runner_watch_save(text, uuid, jsonb), public.runner_watch_delete(text, uuid) from public, anon;
grant execute on function public.runner_watch_list(text), public.runner_watch_save(text, uuid, jsonb), public.runner_watch_delete(text, uuid) to anon, authenticated;
