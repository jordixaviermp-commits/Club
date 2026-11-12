-- =====================================================================
--  Cambio del 12/11/2026: enlace propio del encargado de redes y marcas
--  de «publicada» compartidas (Delegar en los corredores, 3/3).
--  Se puede ejecutar más de una vez.
-- =====================================================================

-- Carreras ya publicadas en redes (marca compartida entre la dirección y el encargado de redes).
-- La clave es «fecha|nombre normalizado»: no cambia cuando una inscripción pasa a resultados.
create table if not exists public.social_posts (
  key       text primary key check (length(key) between 5 and 200),
  posted_at timestamptz not null default now(),
  posted_by text not null default 'Dirección'
);
alter table public.social_posts enable row level security;  -- permisos: ver «Seguridad» más abajo

drop policy if exists admin_all on public.social_posts;
create policy admin_all on public.social_posts for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.social_posts from anon, public;
grant select, insert, update, delete on public.social_posts to authenticated;

create or replace function public.social_check(p_code text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_code is null or length(p_code) < 10
     or not exists (select 1 from settings where key = 'social' and value->>'code' = p_code) then
    raise exception 'enlace_no_valido' using errcode = '28000';
  end if;
end $$;

create or replace function public.social_view(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.social_check(p_code);
  return jsonb_build_object(
    'today', current_date,
    'upcoming', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', g.name, 'date', g.date, 'end_date', g.end_date, 'place', g.place, 'province', g.province, 'country', g.country,
               'modality', g.modality, 'subtype', g.subtype, 'km', g.km, 'race_type', g.race_type, 'circuit', g.circuit,
               'people', (select coalesce(jsonb_agg(rn.name order by rn.name), '[]'::jsonb)
                            from registration_entries e join runners rn on rn.id = e.runner_id where e.registration_id = g.id))
             order by g.date, g.name)
        from registrations g
       where not g.suspended and coalesce(g.end_date, g.date) >= current_date - 1 and g.date <= current_date + 45
         and exists (select 1 from registration_entries e where e.registration_id = g.id)), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', x.name, 'date', x.date, 'end_date', x.end_date, 'place', x.place, 'province', x.province, 'country', x.country,
               'modality', x.modality, 'subtype', x.subtype, 'km', x.km, 'race_type', x.race_type, 'circuit', x.circuit,
               'participants', (select count(*) from results s where s.race_id = x.id),
               'podium', (select coalesce(jsonb_agg(jsonb_build_object('position', s.position, 'name', s.runner_name, 'category', s.category)
                                                    order by s.position), '[]'::jsonb)
                            from results s where s.race_id = x.id and s.position between 1 and 3))
             order by x.date desc)
        from races x
       where x.date >= current_date - 21 and x.date <= current_date
         and exists (select 1 from results s where s.race_id = x.id)), '[]'::jsonb),
    'posted', coalesce((select jsonb_agg(key) from social_posts where posted_at > now() - interval '120 days'), '[]'::jsonb));
end $$;

create or replace function public.social_mark(p_code text, p_key text, p_posted boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.social_check(p_code);
  if p_key is null or length(p_key) not between 5 and 200 then raise exception 'tipo_no_valido'; end if;
  if p_posted then
    insert into social_posts (key, posted_by) values (p_key, 'Redes') on conflict (key) do nothing;
  else
    delete from social_posts where key = p_key;
  end if;
end $$;

revoke execute on function public.social_check(text) from public, anon, authenticated;
revoke execute on function public.social_view(text), public.social_mark(text, text, boolean) from public;
grant execute on function public.social_view(text), public.social_mark(text, text, boolean) to anon, authenticated;
