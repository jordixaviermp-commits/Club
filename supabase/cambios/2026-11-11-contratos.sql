-- =====================================================================
--  Cambio del 11/11/2026: documentos (contratos) de cada corredor.
--  Versión corta para pegar desde el móvil (equivale a ejecutar
--  supabase/schema.sql completo). Se puede ejecutar más de una vez.
--  Termina en la línea «grant execute … to anon, authenticated;».
-- =====================================================================

-- Documentos de cada corredor (p. ej. su contrato de la temporada). Solo los ven él y la dirección.
create table if not exists public.runner_documents (
  id         uuid primary key default gen_random_uuid(),
  runner_id  uuid not null references public.runners(id) on delete cascade,
  year       integer not null,
  title      text not null default 'Contrato',
  filename   text not null,
  mime       text not null check (mime in ('application/pdf','image/jpeg','image/png','image/webp')),
  size       integer not null check (size > 0 and size <= 5000000),
  data       bytea not null,
  created_at timestamptz default now()
);
create index if not exists runner_documents_runner_idx on public.runner_documents(runner_id);
alter table public.runner_documents enable row level security;
drop policy if exists admin_all on public.runner_documents;
create policy admin_all on public.runner_documents for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.runner_documents from anon, public;
grant select, insert, update, delete on public.runner_documents to authenticated;

-- Documentos: la dirección sube y descarga; el corredor ve y descarga solo los suyos.
create or replace function public.upload_document(p_runner uuid, p_year int, p_title text, p_filename text, p_mime text, p_b64 text)
returns uuid language plpgsql set search_path = public as $$
declare v_id uuid; v_data bytea := decode(p_b64, 'base64');
begin
  perform public.require_admin();
  insert into runner_documents (runner_id, year, title, filename, mime, size, data)
  values (p_runner, p_year, left(coalesce(nullif(btrim(p_title), ''), 'Contrato'), 120), left(p_filename, 200), p_mime, length(v_data), v_data)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.get_document(p_id uuid)
returns jsonb language plpgsql stable set search_path = public as $$
declare d runner_documents;
begin
  perform public.require_admin();
  select * into d from runner_documents where id = p_id;
  if not found then raise exception 'no_existe'; end if;
  return jsonb_build_object('filename', d.filename, 'mime', d.mime, 'b64', encode(d.data, 'base64'));
end $$;

create or replace function public.runner_documents_list(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'year', year, 'title', title, 'filename', filename,
                                                       'mime', mime, 'size', size, 'created_at', created_at)
                                    order by year desc, created_at desc)
                     from runner_documents where runner_id = v_runner), '[]'::jsonb);
end $$;

create or replace function public.runner_get_document(p_code text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_runner uuid; d runner_documents;
begin
  select id into v_runner from runners where code = p_code;
  if v_runner is null then raise exception 'enlace_no_valido' using errcode = '28000'; end if;
  select * into d from runner_documents where id = p_id and runner_id = v_runner;
  if not found then raise exception 'no_es_tuya' using errcode = '42501'; end if;
  return jsonb_build_object('filename', d.filename, 'mime', d.mime, 'b64', encode(d.data, 'base64'));
end $$;

revoke execute on function public.upload_document(uuid, int, text, text, text, text), public.get_document(uuid),
  public.runner_documents_list(text), public.runner_get_document(text, uuid) from public, anon;
grant execute on function public.upload_document(uuid, int, text, text, text, text), public.get_document(uuid) to authenticated;
grant execute on function public.runner_documents_list(text), public.runner_get_document(text, uuid) to anon, authenticated;
