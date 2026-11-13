-- =====================================================================
--  Cambio del 13/11/2026: contratos por tipo (nuevo, renovación,
--  renovación sin licencia). La dirección sube uno por tipo y cada
--  corredor ve el de su tipo en la pestaña «Contrato».
--  Se puede ejecutar más de una vez. 
-- =====================================================================

create table if not exists public.contract_templates (
  contract   text primary key check (contract in ('nuevo','renovacion','renovacion_sin_licencia')),
  title      text not null default 'Contrato',
  filename   text not null,
  mime       text not null check (mime in ('application/pdf','image/jpeg','image/png','image/webp')),
  size       integer not null check (size > 0 and size <= 5000000),
  data       bytea not null,
  updated_at timestamptz default now()
);
alter table public.contract_templates enable row level security;
drop policy if exists admin_all on public.contract_templates;
create policy admin_all on public.contract_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.contract_templates from anon, public;
grant select, insert, update, delete on public.contract_templates to authenticated;

create or replace function public.upload_contract_template(p_contract text, p_title text, p_filename text, p_mime text, p_b64 text)
returns void language plpgsql set search_path = public as $$
declare v_data bytea := decode(p_b64, 'base64');
begin
  perform public.require_admin();
  insert into contract_templates (contract, title, filename, mime, size, data)
  values (p_contract, left(coalesce(nullif(btrim(p_title), ''), 'Contrato'), 120), left(p_filename, 200), p_mime, length(v_data), v_data)
  on conflict (contract) do update set title = excluded.title, filename = excluded.filename, mime = excluded.mime,
    size = excluded.size, data = excluded.data, updated_at = now();
end $$;

create or replace function public.get_contract_template(p_contract text)
returns jsonb language plpgsql stable set search_path = public as $$
declare d contract_templates;
begin
  perform public.require_admin();
  select * into d from contract_templates where contract = p_contract;
  if not found then raise exception 'no_existe'; end if;
  return jsonb_build_object('filename', d.filename, 'mime', d.mime, 'b64', encode(d.data, 'base64'));
end $$;

-- El corredor ve (datos) y descarga solo el contrato de SU tipo.
create or replace function public.runner_contract_template(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_contract text; d contract_templates;
begin
  select contract into v_contract from runners where code = p_code;
  if not found then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  select * into d from contract_templates where contract = v_contract;
  if not found then return null; end if;
  return jsonb_build_object('contract', d.contract, 'title', d.title, 'filename', d.filename, 'mime', d.mime, 'size', d.size, 'updated_at', d.updated_at);
end $$;

create or replace function public.runner_get_contract_template(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_contract text; d contract_templates;
begin
  select contract into v_contract from runners where code = p_code;
  if not found then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  select * into d from contract_templates where contract = v_contract;
  if not found then raise exception 'no_existe'; end if;
  return jsonb_build_object('filename', d.filename, 'mime', d.mime, 'b64', encode(d.data, 'base64'));
end $$;

revoke execute on function public.runner_contract_template(text), public.runner_get_contract_template(text),
  public.upload_contract_template(text, text, text, text, text), public.get_contract_template(text) from public, anon;
grant execute on function public.runner_contract_template(text), public.runner_get_contract_template(text) to anon, authenticated;
grant execute on function public.upload_contract_template(text, text, text, text, text), public.get_contract_template(text) to authenticated;
