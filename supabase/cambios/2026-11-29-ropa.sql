-- Tallas de ropa (maillot, culot, calcetines). Dos trozos cortos; se pueden repetir.

-- ===== TROZO 1: columnas =====
alter table public.runners add column if not exists kit_jersey text check (kit_jersey is null or length(kit_jersey) <= 20);
alter table public.runners add column if not exists kit_bibs text check (kit_bibs is null or length(kit_bibs) <= 20);
alter table public.runners add column if not exists kit_socks text check (kit_socks is null or length(kit_socks) <= 20);

-- ===== TROZO 2: que cada corredor vea la suya =====
create or replace function public.runner_my_kit(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r runners;
begin
  select * into r from runners where code = p_code;
  if not found then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return jsonb_build_object('jersey', r.kit_jersey, 'bibs', r.kit_bibs, 'socks', r.kit_socks);
end $$;
grant execute on function public.runner_my_kit(text) to anon, authenticated;
