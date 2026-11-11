-- Pruebas de permisos y funciones. Se ejecuta con tests/sql/run.sh
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'jordi@example.com'),
                              ('00000000-0000-0000-0000-00000000000b', 'otro@example.com');
insert into public.admins select id from auth.users where email = 'jordi@example.com';

create function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'OK (falla como debe): %', label; return; end;
  raise exception 'DEBERÍA HABER FALLADO: %', label;
end $$;
create function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin if not cond then raise exception 'FALLO: %', label; end if; raise notice 'OK: %', label; end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- ===== Dirección =====
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into runners (id, name, category, code) values
  ('10000000-0000-0000-0000-000000000001', 'Pere Soler', 'M40', 'AAAAAAAAAA'),
  ('10000000-0000-0000-0000-000000000002', 'Anna Puig',  'Élite', 'BBBBBBBBBB');
select save_registration('{"name":"Volta Futura","date":"2099-06-14","province":"Girona","country":"España","modality":"BTT"}',
                         '[{"runner_id":"10000000-0000-0000-0000-000000000001","category":"M40"}]') as reg \gset
select pg_temp.check((select count(*) from registration_entries) = 1, 'inscripción con 1 inscrito');
select save_registration(jsonb_build_object('id', :'reg', 'name','Volta Futura','date','2099-06-14','modality','BTT'), '[]');
select pg_temp.check((select count(*) from registration_entries) = 0, 'quitar inscritos al guardar lista vacía');
select save_registration(jsonb_build_object('id', :'reg', 'name','Volta Futura','date','2099-06-14','modality','BTT'),
                         '[{"runner_id":"10000000-0000-0000-0000-000000000001","category":"M40"}]');
insert into registrations (id, name, date) values ('20000000-0000-0000-0000-000000000009', 'Pasada', '2000-01-01');
reset role;

-- ===== Anónimo (sin enlace) no ve nada =====
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_fail('select * from runners', 'anon no puede leer corredores (ni sus enlaces)');
select pg_temp.expect_fail('select * from results', 'anon no puede leer resultados');
select pg_temp.expect_fail('insert into registration_entries values (gen_random_uuid(), gen_random_uuid(), null)', 'anon no inserta');
select pg_temp.expect_fail('select save_race(''{}'',''[]'')', 'anon no guarda carreras');
select pg_temp.expect_fail('select runner_view(''XXXXXXXXXX'')', 'enlace inventado rechazado');
select pg_temp.check(ping() = 'ok', 'ping');

-- ===== Corredor con enlace =====
select pg_temp.check((runner_view('BBBBBBBBBB')->'me'->>'name') = 'Anna Puig', 'corredor se identifica');
select pg_temp.check(jsonb_array_length(runner_view('BBBBBBBBBB')->'registrations') = 2, 've las inscripciones');
select pg_temp.check(runner_view('BBBBBBBBBB')::text not like '%AAAAAAAAAA%', 'no ve los enlaces de otros');
select runner_join('BBBBBBBBBB', :'reg', 'Élite');
select pg_temp.check(jsonb_array_length(runner_view('AAAAAAAAAA')->'registrations'->1->'entries') = 2, 'se apunta');
select runner_leave('BBBBBBBBBB', :'reg');
select pg_temp.check(jsonb_array_length(runner_view('AAAAAAAAAA')->'registrations'->1->'entries') = 1, 'se desapunta sin tocar a otros');
select pg_temp.expect_fail('select runner_join(''BBBBBBBBBB'', ''20000000-0000-0000-0000-000000000009'', null)', 'no se apunta a carrera pasada');
reset role;

-- ===== Usuario logueado que no es dirección =====
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.check((select count(*) from runners) = 0, 'usuario no-dirección no ve corredores');
select pg_temp.expect_fail('select promote_registration(''' || :'reg' || ''')', 'no-dirección no pasa a resultados');
select pg_temp.expect_fail('insert into admins values (''00000000-0000-0000-0000-00000000000b'')', 'no se hace admin a sí mismo');

-- ===== Dirección: pasar a resultados, borrar corredor, copia =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select promote_registration(:'reg') as race \gset
select pg_temp.check((select count(*) from registrations where id = :'reg') = 0, 'inscripción eliminada al pasar');
select pg_temp.check((select runner_name from results where race_id = :'race') = 'Pere Soler', 'participante con nombre');
select save_race(jsonb_build_object('id', :'race', 'name','Volta Futura','date','2099-06-14','modality','BTT','province','Girona'),
  '[{"runner_id":"10000000-0000-0000-0000-000000000001","runner_name":"Pere Soler","category":"M40","position":2,"podium_type":"general"}]');
select pg_temp.check((select position from results where race_id = :'race') = 2, 'puesto guardado');
select pg_temp.expect_fail($q$select save_race('{"name":"X","date":"2026-01-01"}',
  '[{"runner_id":"10000000-0000-0000-0000-000000000001","runner_name":"P"},{"runner_id":"10000000-0000-0000-0000-000000000001","runner_name":"P"}]')$q$,
  'un solo puesto por carrera');
create temp table bk as select jsonb_build_object(
  'runners', (select jsonb_agg(to_jsonb(r)) from runners r),
  'registrations', (select coalesce(jsonb_agg(to_jsonb(r)),'[]') from registrations r),
  'registration_entries', (select coalesce(jsonb_agg(to_jsonb(r)),'[]') from registration_entries r),
  'races', (select jsonb_agg(to_jsonb(r)) from races r),
  'results', (select jsonb_agg(to_jsonb(r)) from results r)) as j;
select delete_runner('10000000-0000-0000-0000-000000000001', false);
select pg_temp.check((select runner_name from results where race_id = :'race') = 'Pere Soler', 'borrar corredor conserva historial');
select import_backup((select j from bk));
select pg_temp.check((select count(*) from runners) = 2, 'restaurar copia');
select delete_runner('10000000-0000-0000-0000-000000000001', true);
select pg_temp.check((select runner_name from results where race_id = :'race') = 'Corredor eliminado', 'borrar y anonimizar');
reset role;
\echo TODAS LAS PRUEBAS SQL OK
