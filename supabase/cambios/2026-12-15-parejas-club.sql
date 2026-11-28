-- Parejas del club: el corredor escoge a su compañero de la lista del equipo (o escribe un nombre si no es del club).
-- Si es del club, el compañero ve «X te ha marcado como pareja» en esa carrera y, al aceptar, se le copian los resultados por etapa
-- de X (sin pisar lo que ya hubiera puesto). Si rechaza, X ve que no lo ha confirmado. Nada se carga sin que lo acepte.
-- DOS trozos cortos (se pueden repetir). Pégalos EN ORDEN.

-- ===== TROZO 1: columnas nuevas =====
alter table public.race_pairs add column if not exists partner_id uuid references public.runners(id) on delete set null;
alter table public.race_pairs add column if not exists partner_status text;
alter table public.race_pairs drop constraint if exists race_pairs_status_check;
alter table public.race_pairs add constraint race_pairs_status_check check (partner_status is null or partner_status in ('confirmada', 'rechazada'));
drop function if exists public.runner_set_pair(text, text, uuid, text);

-- ===== TROZO 2: funciones =====
create or replace function public.runner_set_pair(p_code text, p_kind text, p_id uuid, p_partner text, p_partner_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_date date; v_name text; v_key text; v_p text := left(btrim(coalesce(p_partner, '')), 60); v_pn text;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  if p_kind = 'reg' then
    select date, name into v_date, v_name from registrations where id = p_id;
    if not exists (select 1 from registration_entries where registration_id = p_id and runner_id = v_runner) then raise exception 'no_es_tuya' using errcode = '42501'; end if;
  elsif p_kind = 'race' then
    select date, name into v_date, v_name from races where id = p_id;
    if not exists (select 1 from results where race_id = p_id and runner_id = v_runner) then raise exception 'no_es_tuya' using errcode = '42501'; end if;
  else raise exception 'tipo_no_valido'; end if;
  if v_date is null then raise exception 'no_existe'; end if;
  if p_partner_id is not null then                                                                      -- compañero del club: se usa su nombre
    if p_partner_id = v_runner then raise exception 'datos_no_validos'; end if;
    select left(name, 60) into v_pn from runners where id = p_partner_id;
    if v_pn is null then raise exception 'datos_no_validos'; end if;
    v_p := v_pn;
  end if;
  perform public.assert_result_open(p_kind, p_id, v_runner);
  v_key := to_char(v_date, 'YYYY-MM-DD') || '|' || public.cron_name_key(v_name);
  if v_p = '' then delete from race_pairs where race_key = v_key and runner_id = v_runner;
  else insert into race_pairs (race_key, runner_id, partner, partner_id, partner_status) values (v_key, v_runner, v_p, p_partner_id, null)
       on conflict (race_key, runner_id) do update set partner = excluded.partner, partner_id = excluded.partner_id, partner_status = null, updated_at = now(); end if;
end $$;
grant execute on function public.runner_set_pair(text, text, uuid, text, uuid) to anon, authenticated;

create or replace function public.runner_pairs(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('key', race_key, 'partner', partner, 'partner_id', partner_id, 'status', partner_status)) from race_pairs where runner_id = v_runner), '[]'::jsonb);
end $$;
grant execute on function public.runner_pairs(text) to anon, authenticated;

create or replace function public.runner_pair_invites(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('key', rp.race_key, 'from_id', rp.runner_id, 'from_name', r.name,
                     'stages', (select count(*) from stage_results sr where sr.race_key = rp.race_key and sr.runner_id = rp.runner_id)))
                     from race_pairs rp join runners r on r.id = rp.runner_id
                    where rp.partner_id = v_runner and rp.partner_status is null
                      and not exists (select 1 from race_pairs m where m.race_key = rp.race_key and m.runner_id = v_runner and m.partner_status = 'confirmada')), '[]'::jsonb);
end $$;
grant execute on function public.runner_pair_invites(text) to anon, authenticated;

create or replace function public.runner_answer_pair(p_code text, p_key text, p_from uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_runner uuid; v_kind text; v_id uuid; v_fname text;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  select 'reg', g.id into v_kind, v_id from registrations g join registration_entries e on e.registration_id = g.id and e.runner_id = v_runner
   where to_char(g.date, 'YYYY-MM-DD') || '|' || public.cron_name_key(g.name) = p_key limit 1;
  if v_id is null then
    select 'race', g.id into v_kind, v_id from races g join results x on x.race_id = g.id and x.runner_id = v_runner
     where to_char(g.date, 'YYYY-MM-DD') || '|' || public.cron_name_key(g.name) = p_key limit 1;
  end if;
  if v_id is null then raise exception 'no_es_tuya' using errcode = '42501'; end if;                    -- solo quien también está en la carrera
  select r.name into v_fname from race_pairs rp join runners r on r.id = rp.runner_id
   where rp.race_key = p_key and rp.runner_id = p_from and rp.partner_id = v_runner;
  if v_fname is null then raise exception 'no_existe'; end if;
  if not coalesce(p_accept, false) then
    update race_pairs set partner_status = 'rechazada', updated_at = now() where race_key = p_key and runner_id = p_from;
    return;
  end if;
  perform public.assert_result_open(v_kind, v_id, v_runner);
  update race_pairs set partner_status = 'confirmada', updated_at = now() where race_key = p_key and runner_id = p_from;
  insert into race_pairs (race_key, runner_id, partner, partner_id, partner_status) values (p_key, v_runner, left(v_fname, 60), p_from, 'confirmada')
  on conflict (race_key, runner_id) do update set partner = excluded.partner, partner_id = excluded.partner_id, partner_status = 'confirmada', updated_at = now();
  insert into stage_results (race_key, runner_id, stage, position, general_position, time_seconds)
    select p_key, v_runner, stage, position, general_position, time_seconds from stage_results where race_key = p_key and runner_id = p_from
  on conflict (race_key, runner_id, stage) do nothing;                                                   -- no pisa lo que ya hubiera puesto
end $$;
grant execute on function public.runner_answer_pair(text, text, uuid, boolean) to anon, authenticated;
