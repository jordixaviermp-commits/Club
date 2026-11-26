-- Imita lo mínimo de Supabase para probar schema.sql en un PostgreSQL local.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- Supabase concede por defecto todo a anon en tablas/funciones nuevas: lo imitamos
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;

-- pg_net y Vault (solo lo que usa la corrección de crónicas)
create schema net;
create table net._http_response (id bigint primary key, status_code int, content text, error_msg text);
create table net.calls (id bigserial primary key, url text, headers jsonb, body jsonb);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language plpgsql as $$
declare i bigint; begin insert into net.calls (url, headers, body) values (url, headers, body) returning id into i; return i; end $$;
create schema vault;
create table vault.decrypted_secrets (name text, decrypted_secret text);
