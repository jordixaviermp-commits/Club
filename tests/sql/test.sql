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
-- carreras de varios días
select save_race('{"name":"Volta etapas","date":"2027-06-12","end_date":"2027-06-14"}', '[]') as multi \gset
select pg_temp.check((select end_date from races where id = :'multi') = '2027-06-14', 'carrera por etapas guarda último día');
select save_race(jsonb_build_object('id', :'multi', 'name','Volta etapas','date','2027-06-12','end_date','2027-06-12'), '[]');
select pg_temp.check((select end_date from races where id = :'multi') is null, 'último día igual al primero = un solo día');
select pg_temp.expect_fail($q$select save_race('{"name":"Mal","date":"2027-06-12","end_date":"2027-06-10"}', '[]')$q$, 'fin anterior al inicio rechazado');
select save_registration('{"name":"Reg etapas","date":"2099-07-01","end_date":"2099-07-03"}', '[]') as reg2 \gset
select promote_registration(:'reg2') as race2 \gset
select pg_temp.check((select end_date from races where id = :'race2') = '2099-07-03', 'pasar a resultados conserva último día');
-- etapas dentro de una misma carrera
select save_race(jsonb_build_object('id', :'multi', 'name','Volta etapas','date','2027-06-12','end_date','2027-06-14',
  'stages', '["Prólogo","Etapa 1","Etapa 2"]'::jsonb),
  '[{"runner_id":"10000000-0000-0000-0000-000000000002","runner_name":"Anna Puig","position":2,"podium_type":"general","stage_positions":[1,null,3]}]');
select pg_temp.check((select stages->>0 from races where id = :'multi') = 'Prólogo', 'nombres de etapa guardados');
select pg_temp.check((select stage_positions from results where race_id = :'multi') = '[1,null,3]'::jsonb, 'puestos por etapa guardados');
select save_race(jsonb_build_object('id', :'multi', 'name','Volta etapas','date','2027-06-12','stages','[]'::jsonb), '[]');
select pg_temp.check((select stages from races where id = :'multi') is null, 'sin etapas = null');
-- bonos
insert into settings values ('bonus', jsonb_build_object(extract(year from current_date)::int::text,
  '{"tiers":[{"races":12,"amount":150}],"minimum":12,"penalty":{"renovado":100,"nuevo":175},"nuevos":["10000000-0000-0000-0000-000000000002"]}'::jsonb));
select save_race(jsonb_build_object('name','Bono 3 días','date', current_date - 1, 'end_date', current_date + 1),
  '[{"runner_id":"10000000-0000-0000-0000-000000000002","runner_name":"Anna Puig"}]');
reset role;
set role anon;
select pg_temp.check((runner_view('BBBBBBBBBB')->'bonus'->>'done')::int >= 3, 'bono: carrera de 3 días cuenta 3');
select pg_temp.check((runner_view('BBBBBBBBBB')->'bonus'->>'nuevo')::boolean, 'bono: sabe que es nuevo');
select pg_temp.check(runner_view('BBBBBBBBBB')->'bonus'->'config' ? 'nuevos' = false, 'bono: no ve la lista de nuevos');
select pg_temp.expect_fail('select * from settings', 'anon no lee ajustes');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update runners set contract = 'renovacion_sin_licencia' where code = 'BBBBBBBBBB';
select pg_temp.expect_fail($q$update runners set contract = 'otro' where code = 'BBBBBBBBBB'$q$, 'tipo de contrato no válido rechazado');
reset role;
set role anon;
select pg_temp.check(runner_view('BBBBBBBBBB')->'bonus'->>'contract' = 'renovacion_sin_licencia', 'bono: el corredor ve su tipo de contrato');
select pg_temp.check(not (runner_view('BBBBBBBBBB')->'bonus'->>'nuevo')::boolean, 'bono: el contrato manda sobre la lista antigua');
-- corredores que crean carreras
reset role;
set role anon;
select runner_create_registration('BBBBBBBBBB', jsonb_build_object('name','  Marxa   Nova ','date', current_date + 10, 'modality','BTT'), 'Élite') as nueva \gset
reset role;
select pg_temp.check((select name from registrations where id = :'nueva') = 'Marxa Nova', 'corredor crea carrera (nombre limpio)');
select pg_temp.check((select count(*) from registration_entries where registration_id = :'nueva') = 1, 'y queda apuntado');
select pg_temp.check((select created_by from registrations where id = :'nueva') = '10000000-0000-0000-0000-000000000002', 'consta quién la creó');
set role anon;
select pg_temp.check(runner_create_registration('BBBBBBBBBB', jsonb_build_object('name','marxa nova','date', current_date + 10), null) = :'nueva', 'mismo nombre y día: no duplica');
select pg_temp.expect_fail($q$select runner_create_registration('BBBBBBBBBB', '{"name":"Muy Vieja","date":"2000-01-01"}', null)$q$, 'no crea carreras de antes del año anterior');
select pg_temp.expect_fail($q$select runner_create_registration('BBBBBBBBBB', '{"name":"ab","date":"2099-01-01"}', null)$q$, 'nombre demasiado corto');
select pg_temp.expect_fail($q$select runner_create_registration('XXXXXXXXXXXX', '{"name":"Hack","date":"2099-01-01"}', null)$q$, 'sin enlace no crea');
select pg_temp.expect_fail($q$select runner_create_registration('BBBBBBBBBB', '{"name":"Rara","date":"2099-01-01","modality":"Patinete"}', null)$q$, 'modalidad inválida');
do $$ begin for i in 1..9 loop perform runner_create_registration('BBBBBBBBBB', jsonb_build_object('name','Spam '||i,'date', current_date + 5), null); end loop; end $$;
select pg_temp.expect_fail($q$select runner_create_registration('BBBBBBBBBB', jsonb_build_object('name','Spam 11','date', current_date + 5), null)$q$, 'límite de 10 al día');
select pg_temp.expect_fail($q$update registrations set name = 'x'$q$, 'anon no edita inscripciones');
-- editar / borrar las suyas
reset role;
insert into runners (id, name, code) values ('10000000-0000-0000-0000-000000000003', 'Carla Test', 'CCCCCCCCCC');
set role anon;
select pg_temp.check((select bool_or((g->>'mine_created')::boolean) from jsonb_array_elements(runner_view('BBBBBBBBBB')->'registrations') g), 'sabe cuáles creó');
select runner_update_registration('BBBBBBBBBB', :'nueva', jsonb_build_object('name','Marxa Nova Editada','date', current_date + 11, 'modality','Gravel'));
select pg_temp.check(runner_view('BBBBBBBBBB')::text like '%Marxa Nova Editada%', 'edita la suya');
select pg_temp.expect_fail($q$select runner_update_registration('CCCCCCCCCC', '$q$ || :'nueva' || $q$', '{"name":"Hack","date":"2099-01-01"}')$q$, 'no edita la de otro');
select pg_temp.expect_fail($q$select runner_delete_registration('CCCCCCCCCC', '$q$ || :'nueva' || $q$')$q$, 'no borra la de otro');
select runner_join('CCCCCCCCCC', :'nueva', null);
select pg_temp.expect_fail($q$select runner_delete_registration('BBBBBBBBBB', '$q$ || :'nueva' || $q$')$q$, 'no borra si hay otros apuntados');
select runner_leave('CCCCCCCCCC', :'nueva');
select runner_delete_registration('BBBBBBBBBB', :'nueva');
select pg_temp.check(runner_view('BBBBBBBBBB')::text not like '%Marxa Nova Editada%', 'borra la suya si va solo');
-- resultado propio
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into registrations (id, name, date) values ('20000000-0000-0000-0000-000000000050', 'Ayer', current_date - 1);
insert into registration_entries (registration_id, runner_id) values ('20000000-0000-0000-0000-000000000050', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000050', '10000000-0000-0000-0000-000000000003');
set role anon;
select runner_report_result('BBBBBBBBBB', 'reg', '20000000-0000-0000-0000-000000000050', 2, 'Élite', 'campeonato');
select pg_temp.expect_fail($q$select runner_report_result('BBBBBBBBBB', 'reg', '20000000-0000-0000-0000-000000000050', 1, null, null)$q$, 'no puede corregir su resultado');
select pg_temp.expect_fail($q$select runner_report_result('BBBBBBBBBB', 'reg', '20000000-0000-0000-0000-000000000009', 1, null, null)$q$, 'no pone resultado donde no está apuntado');
select pg_temp.check((select (g->'my_result'->>'position')::int from jsonb_array_elements(runner_view('BBBBBBBBBB')->'registrations') g where g->>'id' = '20000000-0000-0000-0000-000000000050') = 2, 've su resultado enviado');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select promote_registration('20000000-0000-0000-0000-000000000050') as rp \gset
select pg_temp.check((select position from results where race_id = :'rp' and runner_id = '10000000-0000-0000-0000-000000000002') = 2, 'pasar a resultados copia su puesto');
select pg_temp.check((select podium_type from results where race_id = :'rp' and runner_id = '10000000-0000-0000-0000-000000000002') = 'campeonato', 'y su tipo de podio');
select pg_temp.check((select self_reported from results where race_id = :'rp' and runner_id = '10000000-0000-0000-0000-000000000002'), 'marcado como puesto por el corredor');
reset role;
set role anon;
select runner_report_result('CCCCCCCCCC', 'race', :'rp', 7, null, null);
select pg_temp.expect_fail($q$select runner_report_result('CCCCCCCCCC', 'race', '$q$ || :'rp' || $q$', 1, null, null)$q$, 'en carrera ya en resultados tampoco corrige');
select pg_temp.expect_fail($q$select runner_report_result('BBBBBBBBBB', 'race', '$q$ || :'rp' || $q$', 1, null, null)$q$, 'no cambia un puesto ya puesto');
select pg_temp.check(jsonb_array_length(runner_view('BBBBBBBBBB')->'my_results') >= 1, 'mis carreras: ve sus resultados');
select pg_temp.check((runner_view('BBBBBBBBBB')->'my_results')::text not like '%Pere Soler%', 'mis carreras: solo las suyas');
select pg_temp.check(jsonb_array_length(runner_team('BBBBBBBBBB')->'races') >= 1, 'resumen equipo: ve las carreras del equipo');
select pg_temp.check(runner_team('BBBBBBBBBB')::text !~ '(BBBBBBBBBB|AAAAAAAAAA|contract|renovacion|"notes")', 'resumen equipo: sin enlaces, contratos ni notas');
select pg_temp.expect_fail($q$select runner_team('XXXXXXXXXXXX')$q$, 'resumen equipo: sin enlace no');
-- carreras olvidadas (ya pasadas)
reset role;
insert into runners (id, name, code) values ('10000000-0000-0000-0000-000000000004', 'Dani Test', 'DDDDDDDDDD');
set role anon;
select runner_create_registration('DDDDDDDDDD', jsonb_build_object('name','Olvidada','date', current_date - 3), 'M40') as olv \gset
select pg_temp.check((select count(*) from jsonb_array_elements(runner_view('DDDDDDDDDD')->'registrations') g
                       where g->>'id' = :'olv' and g->'entries' @> '[{"name":"Dani Test"}]') = 1, 'olvidada: crea una carrera pasada y queda apuntado');
select runner_report_result('DDDDDDDDDD', 'reg', :'olv', 5, null, null);
select pg_temp.check((select (g->'my_result'->>'position')::int from jsonb_array_elements(runner_view('DDDDDDDDDD')->'registrations') g where g->>'id' = :'olv') = 5, 'olvidada: pone su resultado');
select pg_temp.expect_fail($q$select runner_leave('DDDDDDDDDD', '$q$ || :'olv' || $q$')$q$, 'olvidada: con resultado puesto ya no se borra');
select runner_join('CCCCCCCCCC', :'olv', null);
select runner_leave('CCCCCCCCCC', :'olv');
select pg_temp.check((select jsonb_array_length(g->'entries') from jsonb_array_elements(runner_view('CCCCCCCCCC')->'registrations') g where g->>'id' = :'olv') = 1, 'olvidada: otro se apunta y se borra (sin resultado)');
select pg_temp.check(runner_create_registration('DDDDDDDDDD', jsonb_build_object('name','ayer','date', current_date - 1), null) = :'rp', 'ya en resultados: se le añade a esa carrera');
select pg_temp.check((select count(*) from jsonb_array_elements(runner_view('DDDDDDDDDD')->'my_results') x where x->>'race_id' = :'rp' and x->'position' = 'null') = 1, 'ya en resultados: aparece sin puesto');
select runner_report_result('DDDDDDDDDD', 'race', :'rp', 9, null, null);
select runner_join_race('DDDDDDDDDD', :'rp', null);
select pg_temp.check((select (x->>'position')::int from jsonb_array_elements(runner_view('DDDDDDDDDD')->'my_results') x where x->>'race_id' = :'rp') = 9, 'añadirse otra vez no borra su puesto');
select pg_temp.expect_fail($q$select runner_join_race('XXXXXXXXXXXX', '$q$ || :'rp' || $q$', null)$q$, 'sin enlace no se añade');
select pg_temp.expect_fail($q$select runner_join_race('DDDDDDDDDD', gen_random_uuid(), null)$q$, 'carrera inexistente');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into races (id, name, date) values ('30000000-0000-0000-0000-000000000001', 'Futura', current_date + 5);
set role anon;
select pg_temp.expect_fail($q$select runner_join_race('DDDDDDDDDD', '30000000-0000-0000-0000-000000000001', null)$q$, 'no se añade a resultados de una carrera futura');
-- tipo de carrera y podios de circuito
select runner_create_registration('DDDDDDDDDD', jsonb_build_object('name','Copa Prueba 1','date', current_date + 20), null) as cop \gset
select runner_set_race_type('DDDDDDDDDD', :'cop', 'circuito', ' Copa Aragón XCM ');
select pg_temp.check((select g->>'circuit' from jsonb_array_elements(runner_view('DDDDDDDDDD')->'registrations') g where g->>'id' = :'cop') = 'Copa Aragón XCM', 'tipo: el corredor marca su carrera como puntuable de un circuito');
select pg_temp.expect_fail($q$select runner_set_race_type('CCCCCCCCCC', '$q$ || :'cop' || $q$', 'campeonato', null)$q$, 'tipo: no cambia la de otro');
select pg_temp.expect_fail($q$select runner_set_race_type('DDDDDDDDDD', '$q$ || :'cop' || $q$', 'inventado', null)$q$, 'tipo: valor inválido');
select runner_propose_circuit('DDDDDDDDDD', 'Copa Aragón XCM', extract(year from current_date)::int, 2, 'categoria') as cp \gset
select pg_temp.check((runner_view('DDDDDDDDDD')->'bonus'->>'extra')::int = 0, 'circuito: pendiente no suma');
select pg_temp.expect_fail($q$select runner_propose_circuit('DDDDDDDDDD', 'copa aragón xcm', extract(year from current_date)::int, 1, 'absoluta')$q$, 'circuito: no se repite');
select pg_temp.expect_fail($q$select runner_propose_circuit('DDDDDDDDDD', 'Otra Copa', extract(year from current_date)::int, 4, 'absoluta')$q$, 'circuito: solo podio');
select pg_temp.expect_fail($q$update circuit_podiums set status = 'confirmado'$q$, 'circuito: el corredor no se lo confirma');
select runner_propose_circuit('CCCCCCCCCC', 'Open Retirado', extract(year from current_date)::int, 3, 'absoluta') as cp2 \gset
select pg_temp.expect_fail($q$select runner_cancel_circuit('DDDDDDDDDD', '$q$ || :'cp2' || $q$')$q$, 'circuito: no retira el de otro');
select runner_cancel_circuit('CCCCCCCCCC', :'cp2');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update circuit_podiums set status = 'confirmado' where id = :'cp';
select pg_temp.check((select count(*) from circuit_podiums) = 1, 'circuito: la dirección lo ve y el retirado ya no está');
select promote_registration(:'cop') as copr \gset
select pg_temp.check((select circuit from races where id = :'copr') = 'Copa Aragón XCM', 'tipo: pasar a resultados conserva el circuito');
reset role;
set role anon;
select pg_temp.check((runner_view('DDDDDDDDDD')->'bonus'->>'extra')::int = 4, 'circuito: confirmado suma +4 al bono');
select pg_temp.check(jsonb_array_length(runner_view('DDDDDDDDDD')->'circuits') = 1, 'circuito: el corredor ve el suyo');
select pg_temp.check(jsonb_array_length(runner_view('CCCCCCCCCC')->'circuits') = 0, 'circuito: no ve los de otros');
select pg_temp.expect_fail($q$select runner_cancel_circuit('DDDDDDDDDD', '$q$ || :'cp' || $q$')$q$, 'circuito: confirmado ya no se retira');
select pg_temp.expect_fail($q$delete from circuit_podiums$q$, 'circuito: el corredor no lo borra directamente');
-- la dirección SÍ puede quitar un plus ya confirmado (por si se equivoca al confirmar)
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.check((select count(*) from circuit_podiums where id = :'cp' and status = 'confirmado') = 1, 'circuito: el plus sigue ahí, confirmado');
delete from circuit_podiums where id = :'cp';
select pg_temp.check((select count(*) from circuit_podiums where id = :'cp') = 0, 'circuito: la dirección sí puede borrar un plus confirmado');
-- una inscripción ya disputada cuenta en cuanto el corredor pone su puesto (sin pasarla a resultados)
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into registrations (id, name, date, end_date) values ('20000000-0000-0000-0000-000000000060', 'Etapas Pasadas', current_date - 5, current_date - 3);
insert into registration_entries (registration_id, runner_id) values ('20000000-0000-0000-0000-000000000060', '10000000-0000-0000-0000-000000000004');
set role anon;
select pg_temp.check((runner_view('DDDDDDDDDD')->'bonus'->>'planned')::int >= 3, 'cuenta: sin resultado puesto solo es prevista');
select (runner_view('DDDDDDDDDD')->'bonus'->>'done')::int as antes, (runner_view('DDDDDDDDDD')->'bonus'->>'planned')::int as plan_antes \gset
select runner_report_result('DDDDDDDDDD', 'reg', '20000000-0000-0000-0000-000000000060', 6, null, null);
select pg_temp.check((runner_view('DDDDDDDDDD')->'bonus'->>'done')::int = :antes + 3, 'cuenta: al poner su puesto suma los 3 días a lo hecho');
select pg_temp.check((runner_view('DDDDDDDDDD')->'bonus'->>'planned')::int = :plan_antes - 3, 'cuenta: y deja de ser prevista');
-- noticias de la dirección
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into announcements (title, body) values ('Quedada social', E'Cena del club\nhttps://example.com');
insert into announcements (title, body, expires_at) values ('Pedido de ropa', 'Hasta el viernes', current_date + 3);
insert into announcements (title, body, expires_at) values ('Ya pasada', 'No debe verse', current_date - 1);
select pg_temp.expect_fail($q$insert into announcements (title) values ('ab')$q$, 'noticia: título demasiado corto');
reset role;
set role anon;
select pg_temp.check(jsonb_array_length(runner_news('BBBBBBBBBB')) = 2, 'noticias: el corredor ve las vigentes y no la caducada');
select pg_temp.check(runner_news('BBBBBBBBBB')->0->>'title' = 'Pedido de ropa', 'noticias: la más reciente primero');
select pg_temp.expect_fail($q$select runner_news('XXXXXXXXXXXX')$q$, 'noticias: sin enlace no');
select pg_temp.expect_fail('select * from announcements', 'noticias: anon no lee la tabla');
select pg_temp.expect_fail($q$insert into announcements (title) values ('Hack hack')$q$, 'noticias: anon no escribe');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect_fail($q$insert into announcements (title) values ('No soy dirección')$q$, 'noticias: un usuario que no es dirección no escribe');
reset role;
set role anon;
-- carrera suspendida: cuenta para el mínimo, no para el bono ni para poner resultado
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into registrations (id, name, date, end_date, suspended) values ('20000000-0000-0000-0000-000000000070', 'Suspendida Test', current_date + 15, current_date + 16, true);
insert into registration_entries (registration_id, runner_id) values ('20000000-0000-0000-0000-000000000070', '10000000-0000-0000-0000-000000000004');
set role anon;
select pg_temp.check((runner_view('DDDDDDDDDD')->'bonus'->>'suspended')::int = 2, 'suspendida: sus días se cuentan aparte');
select pg_temp.check((select (g->>'suspended')::boolean from jsonb_array_elements(runner_view('DDDDDDDDDD')->'registrations') g where g->>'id' = '20000000-0000-0000-0000-000000000070'), 'suspendida: el corredor la ve marcada');
select pg_temp.check((runner_view('CCCCCCCCCC')->'bonus'->>'suspended')::int = 0, 'suspendida: no afecta a otros');
select pg_temp.expect_fail($q$select runner_report_result('DDDDDDDDDD', 'reg', '20000000-0000-0000-0000-000000000070', 3, null, null)$q$, 'suspendida: no se pone resultado');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.expect_fail($q$select promote_registration('20000000-0000-0000-0000-000000000070')$q$, 'suspendida: no se pasa a resultados');
reset role;
set role anon;
-- formato y km de la carrera
reset role;
set role anon;
select runner_create_registration('DDDDDDDDDD', jsonb_build_object('name','Cursa de Formato','date', current_date + 30, 'modality','BTT'), null) as fmt \gset
select runner_set_race_details('DDDDDDDDDD', :'fmt', ' XCM ', 85.46);
select pg_temp.check((select g->>'subtype' from jsonb_array_elements(runner_view('DDDDDDDDDD')->'registrations') g where g->>'id' = :'fmt') = 'XCM', 'formato: el corredor indica el formato de su carrera');
select pg_temp.check((select (g->>'km')::numeric from jsonb_array_elements(runner_view('DDDDDDDDDD')->'registrations') g where g->>'id' = :'fmt') = 85.5, 'formato: y los km (redondeados a 1 decimal)');
select runner_set_race_details('DDDDDDDDDD', :'fmt', '', -5);
select pg_temp.check((select g->>'km' from jsonb_array_elements(runner_view('DDDDDDDDDD')->'registrations') g where g->>'id' = :'fmt') is null, 'formato: km inválidos se dejan vacíos');
select runner_set_race_details('DDDDDDDDDD', :'fmt', 'XCO', 42);
select pg_temp.expect_fail($q$select runner_set_race_details('CCCCCCCCCC', '$q$ || :'fmt' || $q$', 'XCO', 10)$q$, 'formato: no cambia el de otro');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select promote_registration(:'fmt') as fmtr \gset
select pg_temp.check((select subtype from races where id = :'fmtr') = 'XCO' and (select km from races where id = :'fmtr') = 42, 'formato: pasar a resultados conserva formato y km');
select pg_temp.expect_fail($q$update races set km = 5000 where id = '$q$ || :'fmtr' || $q$'$q$, 'formato: km fuera de rango');
reset role;
set role anon;
select pg_temp.check((runner_team('DDDDDDDDDD')::text like '%"subtype": "XCO"%'), 'formato: el resumen del equipo lo lleva');
-- historial de cambios, paso automático a resultados y completar datos
reset role;
truncate change_log;
set role anon;
select set_config('request.jwt.claim.sub', '', false);   -- los corredores no llevan sesión
select runner_create_registration('DDDDDDDDDD', jsonb_build_object('name','Cursa Historial','date', current_date + 40, 'modality','Gravel'), null) as hist \gset
select runner_update_registration('DDDDDDDDDD', :'hist', jsonb_build_object('name','Cursa Historial','date', current_date + 41, 'modality','Gravel'));
reset role;
select pg_temp.check((select count(*) from change_log where actor = 'Dani Test' and action = 'insert' and summary like '%Cursa Historial%') = 1, 'historial: la carrera que crea un corredor sale con su nombre');
select pg_temp.check((select count(*) from change_log where actor = 'Dani Test' and action = 'update' and summary like '%date:%') = 1, 'historial: y el cambio de fecha, con antes y después');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update registrations set notes = 'nota nueva' where id = :'hist';
select pg_temp.check((select count(*) from change_log where actor = 'Dirección' and summary like '%notes:%') = 1, 'historial: lo que cambia la dirección sale como «Dirección»');
update registrations set notes = 'nota nueva' where id = :'hist';
select pg_temp.check((select count(*) from change_log where actor = 'Dirección') = 1, 'historial: guardar sin cambios no apunta nada');
select pg_temp.check((select count(*) from change_log) >= 3, 'historial: la dirección lo lee');
reset role;
set role anon;
select pg_temp.expect_fail('select * from change_log', 'historial: anon no lo lee');
select pg_temp.expect_fail($q$select log_change('x','race',null,'insert','x')$q$, 'historial: nadie de fuera apunta en él');
-- paso automático
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into registrations (id, name, date, province) values
  ('20000000-0000-0000-0000-000000000080', 'Auto Uno', current_date - 6, 'Huesca'),
  ('20000000-0000-0000-0000-000000000081', 'Auto Reciente', current_date - 2, null),
  ('20000000-0000-0000-0000-000000000082', 'Auto Sin Puesto', current_date - 9, null);
insert into registration_entries (registration_id, runner_id, self_position, self_podium_type) values
  ('20000000-0000-0000-0000-000000000080', '10000000-0000-0000-0000-000000000004', 2, 'campeonato'),
  ('20000000-0000-0000-0000-000000000081', '10000000-0000-0000-0000-000000000004', 5, null);
insert into registration_entries (registration_id, runner_id) values
  ('20000000-0000-0000-0000-000000000080', '10000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000082', '10000000-0000-0000-0000-000000000003');
update registration_entries set self_time_seconds = 3725 where registration_id = '20000000-0000-0000-0000-000000000080' and runner_id = '10000000-0000-0000-0000-000000000004';
truncate change_log;
set role anon;
select runner_view('DDDDDDDDDD') is not null as vio \gset
reset role;
select pg_temp.check((select count(*) from races where name = 'Auto Uno') = 1 and not exists (select 1 from registrations where name = 'Auto Uno'), 'auto: con puesto puesto y 3 días pasados, pasa sola a resultados');
select pg_temp.check((select count(*) from results x join races r on r.id = x.race_id where r.name = 'Auto Uno') = 1, 'auto: solo entra quien puso su puesto');
select pg_temp.check((select x.position from results x join races r on r.id = x.race_id where r.name = 'Auto Uno') = 2 and (select x.podium_type from results x join races r on r.id = x.race_id where r.name = 'Auto Uno') = 'campeonato', 'auto: con su puesto y tipo de podio');
select pg_temp.check((select x.time_seconds from results x join races r on r.id = x.race_id where r.name = 'Auto Uno') = 3725, 'tiempo: el paso automático copia el tiempo del corredor');
select pg_temp.check(exists (select 1 from registrations where name = 'Auto Reciente'), 'auto: no antes de 3 días');
select pg_temp.check(exists (select 1 from registrations where name = 'Auto Sin Puesto'), 'auto: no si nadie puso su puesto');
select pg_temp.check((select count(*) from change_log where actor = 'Sistema' and action = 'auto_resultados') = 1 and (select count(*) from change_log where summary like '%Auto Uno%' and action in ('insert','delete')) = 0, 'auto: queda una sola línea en el historial');
-- completar datos: solo lo que falta
insert into races (id, name, date, province, km) values ('30000000-0000-0000-0000-000000000090', 'Completa Esta', current_date - 20, 'Lleida', 50);
insert into results (race_id, runner_id, runner_name) values ('30000000-0000-0000-0000-000000000090', '10000000-0000-0000-0000-000000000004', 'Dani Test');
set role anon;
select runner_complete_race('DDDDDDDDDD', 'race', '30000000-0000-0000-0000-000000000090', '{"province":"Huesca","place":"Graus","km":"99","subtype":"XCM"}');
select pg_temp.check((select r->>'province' from jsonb_array_elements(runner_team('DDDDDDDDDD')->'races') r where r->>'id' = '30000000-0000-0000-0000-000000000090') = 'Lleida', 'completar: no cambia lo que ya está escrito');
select pg_temp.check((select r->>'place' from jsonb_array_elements(runner_team('DDDDDDDDDD')->'races') r where r->>'id' = '30000000-0000-0000-0000-000000000090') = 'Graus', 'completar: rellena lo que faltaba (lugar)');
select pg_temp.check((select (r->>'km')::numeric from jsonb_array_elements(runner_team('DDDDDDDDDD')->'races') r where r->>'id' = '30000000-0000-0000-0000-000000000090') = 50, 'completar: ni los km ya puestos');
select pg_temp.check((select r->>'subtype' from jsonb_array_elements(runner_team('DDDDDDDDDD')->'races') r where r->>'id' = '30000000-0000-0000-0000-000000000090') = 'XCM', 'completar: y el formato que faltaba');
select pg_temp.expect_fail($q$select runner_complete_race('CCCCCCCCCC', 'race', '30000000-0000-0000-0000-000000000090', '{"place":"x"}')$q$, 'completar: solo quien participó');
select pg_temp.expect_fail($q$select runner_complete_race('XXXXXXXXXXXX', 'race', '30000000-0000-0000-0000-000000000090', '{}')$q$, 'completar: sin enlace no');
reset role;
select pg_temp.check((select count(*) from change_log where actor = 'Dani Test' and summary like '%Completa Esta%' and summary like '%place:%') = 1, 'completar: queda en el historial con su nombre');
set role anon;
-- noticias con confirmación (quedadas)
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into announcements (id, title, body, rsvp) values ('40000000-0000-0000-0000-000000000001', 'Quedada con RSVP', 'Cena', true);
insert into announcements (id, title, body) values ('40000000-0000-0000-0000-000000000002', 'Aviso sin RSVP', 'Solo informa');
insert into announcements (id, title, body, rsvp, expires_at) values ('40000000-0000-0000-0000-000000000003', 'RSVP caducado', 'x', true, current_date - 1);
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check((select (n->>'rsvp')::boolean from jsonb_array_elements(runner_news('DDDDDDDDDD')) n where n->>'id' = '40000000-0000-0000-0000-000000000001'), 'rsvp: la noticia lo pide');
select pg_temp.check((select n->>'my_answer' from jsonb_array_elements(runner_news('DDDDDDDDDD')) n where n->>'id' = '40000000-0000-0000-0000-000000000001') is null, 'rsvp: aún sin responder');
select runner_reply_news('DDDDDDDDDD', '40000000-0000-0000-0000-000000000001', 'si', 2);
select runner_reply_news('CCCCCCCCCC', '40000000-0000-0000-0000-000000000001', 'no', 5);
select pg_temp.check((select (n->>'yes_count')::int from jsonb_array_elements(runner_news('CCCCCCCCCC')) n where n->>'id' = '40000000-0000-0000-0000-000000000001') = 3, 'rsvp: cuenta él y sus 2 acompañantes');
select pg_temp.check((select (n->>'no_count')::int from jsonb_array_elements(runner_news('DDDDDDDDDD')) n where n->>'id' = '40000000-0000-0000-0000-000000000001') = 1 and (select (n->>'my_guests')::int from jsonb_array_elements(runner_news('CCCCCCCCCC')) n where n->>'id' = '40000000-0000-0000-0000-000000000001') = 0, 'rsvp: un «no» no lleva acompañantes');
select runner_reply_news('DDDDDDDDDD', '40000000-0000-0000-0000-000000000001', 'no', 0);
select pg_temp.check((select (n->>'yes_count')::int from jsonb_array_elements(runner_news('DDDDDDDDDD')) n where n->>'id' = '40000000-0000-0000-0000-000000000001') = 0, 'rsvp: puede cambiar su respuesta');
select pg_temp.expect_fail($q$select runner_reply_news('DDDDDDDDDD', '40000000-0000-0000-0000-000000000002', 'si', 0)$q$, 'rsvp: una noticia que no lo pide no se responde');
select pg_temp.expect_fail($q$select runner_reply_news('DDDDDDDDDD', '40000000-0000-0000-0000-000000000003', 'si', 0)$q$, 'rsvp: ni una caducada');
select pg_temp.expect_fail($q$select runner_reply_news('DDDDDDDDDD', '40000000-0000-0000-0000-000000000001', 'quizas', 0)$q$, 'rsvp: respuesta inválida');
select pg_temp.expect_fail($q$select runner_reply_news('XXXXXXXXXXXX', '40000000-0000-0000-0000-000000000001', 'si', 0)$q$, 'rsvp: sin enlace no');
select pg_temp.expect_fail('select * from announcement_replies', 'rsvp: anon no lee las respuestas');
-- correcciones de puesto
select pg_temp.check((select count(*) from jsonb_array_elements(runner_corrections('CCCCCCCCCC'))) = 0, 'corrección: ninguna al principio');
select runner_request_correction('CCCCCCCCCC', 'race', :'rp', 6, null, null, 'Me equivoqué al teclear') as corr \gset
select pg_temp.check((select c->>'status' from jsonb_array_elements(runner_corrections('CCCCCCCCCC')) c where c->>'id' = :'corr') = 'pendiente' and (select (c->>'old_position')::int from jsonb_array_elements(runner_corrections('CCCCCCCCCC')) c) = 7, 'corrección: queda pendiente con el puesto de antes');
select pg_temp.expect_fail($q$select runner_request_correction('CCCCCCCCCC', 'race', '$q$ || :'rp' || $q$', 5, null, null, null)$q$, 'corrección: no dos pendientes de la misma carrera');
select pg_temp.expect_fail($q$select runner_request_correction('CCCCCCCCCC', 'race', '$q$ || :'rp' || $q$', 7, null, null, null)$q$, 'corrección: sin cambios no');
reset role;
select id as autouno from races where name = 'Auto Uno' \gset
set role anon;
select pg_temp.expect_fail($q$select runner_request_correction('CCCCCCCCCC', 'race', '$q$ || :'autouno' || $q$', 1, null, null, null)$q$, 'corrección: solo de una carrera donde corrió');
select pg_temp.expect_fail($q$select runner_request_correction('CCCCCCCCCC', 'race', '$q$ || :'rp' || $q$', 1000, null, null, null)$q$, 'corrección: puesto válido');
select pg_temp.expect_fail('select * from correction_requests', 'corrección: anon no lee la tabla');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect_fail($q$select resolve_correction('$q$ || :'corr' || $q$', true, null)$q$, 'corrección: quien no es dirección no resuelve');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select resolve_correction(:'corr', true, 'Corregido');
select pg_temp.check((select position from results where race_id = :'rp' and runner_id = '10000000-0000-0000-0000-000000000003') = 6, 'corrección: al aceptar se aplica el puesto nuevo');
select pg_temp.check((select count(*) from change_log where actor = 'Dirección' and summary like '%aceptó la corrección%') = 1, 'corrección: queda en el historial');
select pg_temp.expect_fail($q$select resolve_correction('$q$ || :'corr' || $q$', true, null)$q$, 'corrección: no se resuelve dos veces');
reset role;
-- corrección de una inscripción que ya pasó a resultados (se busca por nombre y fecha)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into registrations (id, name, date) values ('20000000-0000-0000-0000-000000000095', 'Corrige Despues', current_date - 5);
insert into registration_entries (registration_id, runner_id, self_position) values ('20000000-0000-0000-0000-000000000095', '10000000-0000-0000-0000-000000000004', 4);
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select runner_request_correction('DDDDDDDDDD', 'reg', '20000000-0000-0000-0000-000000000095', 3, null, 'campeonato', null) as corr2 \gset
select runner_view('DDDDDDDDDD') is not null as vio2 \gset
reset role;
select pg_temp.check(exists (select 1 from races where name = 'Corrige Despues') and not exists (select 1 from registrations where name = 'Corrige Despues'), 'corrección: la inscripción ya pasó sola a resultados');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select resolve_correction(:'corr2', true, null);
select pg_temp.check((select x.position from results x join races r on r.id = x.race_id where r.name = 'Corrige Despues') = 3 and (select x.podium_type from results x join races r on r.id = x.race_id where r.name = 'Corrige Despues') = 'campeonato', 'corrección: se aplica en la carrera aunque la inscripción ya no exista');
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check((select c->>'status' from jsonb_array_elements(runner_corrections('DDDDDDDDDD')) c where c->>'id' = :'corr2') = 'aceptada', 'corrección: el corredor ve que se aceptó');
select runner_request_correction('CCCCCCCCCC', 'race', :'rp', 2, null, null, null) as corr3 \gset
select runner_cancel_correction('CCCCCCCCCC', :'corr3');
select pg_temp.expect_fail($q$select runner_cancel_correction('CCCCCCCCCC', '$q$ || :'corr' || $q$')$q$, 'corrección: una ya resuelta no se retira');
-- encargado de redes
reset role;
insert into settings (key, value) values ('social', '{"code":"SOCIALCODE12345"}') on conflict (key) do update set value = excluded.value;
insert into registrations (id, name, date) values ('20000000-0000-0000-0000-0000000000a1', 'Redes Proxima', current_date + 5);
insert into registration_entries (registration_id, runner_id) values ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000004'), ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000003');
insert into registrations (id, name, date, suspended) values ('20000000-0000-0000-0000-0000000000a2', 'Redes Suspendida', current_date + 5, true);
insert into registration_entries (registration_id, runner_id) values ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000004');
insert into registrations (id, name, date) values ('20000000-0000-0000-0000-0000000000a3', 'Redes Sin Inscritos', current_date + 6);
insert into registrations (id, name, date) values ('20000000-0000-0000-0000-0000000000a4', 'Redes Lejana', current_date + 90);
insert into registration_entries (registration_id, runner_id) values ('20000000-0000-0000-0000-0000000000a4', '10000000-0000-0000-0000-000000000004');
insert into races (id, name, date) values ('30000000-0000-0000-0000-0000000000b1', 'Redes Reciente', current_date - 4);
insert into results (race_id, runner_id, runner_name, position) values ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000004', 'Dani Test', 2), ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000003', 'Carla Test', 9);
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check(exists (select 1 from jsonb_array_elements(social_view('SOCIALCODE12345')->'upcoming') u where u->>'name' = 'Redes Proxima')
                  and not exists (select 1 from jsonb_array_elements(social_view('SOCIALCODE12345')->'upcoming') u where u->>'name' in ('Redes Suspendida', 'Redes Sin Inscritos', 'Redes Lejana')), 'redes: próximas con inscritos, sin suspendidas, sin inscritos ni lejanas');
select pg_temp.check((select jsonb_array_length(u->'people') from jsonb_array_elements(social_view('SOCIALCODE12345')->'upcoming') u where u->>'name' = 'Redes Proxima') = 2, 'redes: con los nombres de quién va');
select pg_temp.check((select jsonb_array_length(x->'podium') from jsonb_array_elements(social_view('SOCIALCODE12345')->'recent') x where x->>'name' = 'Redes Reciente') = 1
                 and (select x->'podium'->0->>'name' from jsonb_array_elements(social_view('SOCIALCODE12345')->'recent') x where x->>'name' = 'Redes Reciente') = 'Dani Test', 'redes: resultados recientes con su podio');
select pg_temp.check(social_view('SOCIALCODE12345')::text not like '%code%' and social_view('SOCIALCODE12345')::text not like '%contract%', 'redes: sin enlaces ni contratos');
select pg_temp.expect_fail($q$select social_view('OTROCODIGO12345')$q$, 'redes: código equivocado');
select pg_temp.expect_fail($q$select social_view('')$q$, 'redes: sin código');
select pg_temp.expect_fail($q$select social_view('AAAAAAAAAA')$q$, 'redes: el enlace de un corredor no vale');
select pg_temp.expect_fail($q$select social_check('SOCIALCODE12345')$q$, 'redes: la comprobación interna no es pública');
select social_mark('SOCIALCODE12345', '2026-11-20|redes proxima', true);
select pg_temp.check(social_view('SOCIALCODE12345')->'posted' ? '2026-11-20|redes proxima', 'redes: marca como publicada');
select social_mark('SOCIALCODE12345', '2026-11-20|redes proxima', false);
select pg_temp.check(not (social_view('SOCIALCODE12345')->'posted' ? '2026-11-20|redes proxima'), 'redes: y la desmarca');
select pg_temp.expect_fail($q$select social_mark('SOCIALCODE12345', 'a', true)$q$, 'redes: clave inválida');
select pg_temp.expect_fail($q$select social_mark('OTROCODIGO12345', '2026-11-20|redes proxima', true)$q$, 'redes: marcar sin código válido');
select pg_temp.expect_fail('select * from social_posts', 'redes: anon no lee las marcas');
select pg_temp.expect_fail('select * from settings', 'redes: ni los ajustes (donde está el código)');
-- documentos (contratos)
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select upload_document('10000000-0000-0000-0000-000000000002', 2026, 'Contrato 2026', 'contrato.pdf', 'application/pdf', encode('%PDF-1.4 hola'::bytea, 'base64')) as doc \gset
select pg_temp.check(convert_from(decode(get_document(:'doc')->>'b64', 'base64'), 'UTF8') = '%PDF-1.4 hola', 'dirección sube y descarga');
select pg_temp.expect_fail($q$select upload_document('10000000-0000-0000-0000-000000000002', 2026, 'x', 'x.exe', 'application/x-msdownload', 'aGk=')$q$, 'solo PDF o imágenes');
reset role;
set role anon;
select pg_temp.check(jsonb_array_length(runner_documents_list('BBBBBBBBBB')) = 1, 'el corredor ve su contrato');
select pg_temp.check(runner_documents_list('BBBBBBBBBB')::text not like '%hola%', 'la lista no lleva el archivo');
select pg_temp.check(convert_from(decode(runner_get_document('BBBBBBBBBB', :'doc')->>'b64', 'base64'), 'UTF8') = '%PDF-1.4 hola', 'el corredor descarga el suyo');
select pg_temp.check(jsonb_array_length(runner_documents_list('CCCCCCCCCC')) = 0, 'otro corredor no lo ve');
select pg_temp.expect_fail($q$select runner_get_document('CCCCCCCCCC', '$q$ || :'doc' || $q$')$q$, 'otro corredor no lo descarga');
select pg_temp.expect_fail('select * from runner_documents', 'anon no lee la tabla');
select pg_temp.expect_fail($q$select upload_document('10000000-0000-0000-0000-000000000002', 2026, 'x', 'x.pdf', 'application/pdf', 'aGk=')$q$, 'anon no sube');
reset role;
-- tiempo de carrera
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into registrations (id, name, date) values ('20000000-0000-0000-0000-000000000090', 'Con Tiempo', current_date - 1);
insert into registration_entries (registration_id, runner_id) values
  ('20000000-0000-0000-0000-000000000090', '10000000-0000-0000-0000-000000000004'),
  ('20000000-0000-0000-0000-000000000090', '10000000-0000-0000-0000-000000000003');
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_fail($q$select runner_report_result('DDDDDDDDDD', 'reg', '20000000-0000-0000-0000-000000000090', 4, null, null, 0)$q$, 'tiempo: cero rechazado');
select pg_temp.expect_fail($q$select runner_report_result('DDDDDDDDDD', 'reg', '20000000-0000-0000-0000-000000000090', 4, null, null, 4000000)$q$, 'tiempo: absurdo rechazado');
select runner_report_result('DDDDDDDDDD', 'reg', '20000000-0000-0000-0000-000000000090', 4, null, null, 7200);
select pg_temp.check((select (g->'my_result'->>'time_seconds')::int from jsonb_array_elements(runner_view('DDDDDDDDDD')->'registrations') g where g->>'id' = '20000000-0000-0000-0000-000000000090') = 7200, 'tiempo: el corredor ve el suyo');
select pg_temp.check(runner_view('CCCCCCCCCC') is not null, 'tiempo: el tiempo es opcional (otros siguen sin él)');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select promote_registration('20000000-0000-0000-0000-000000000090') as rt \gset
reset role;
select pg_temp.check((select time_seconds from results where race_id = :'rt' and position = 4) = 7200, 'tiempo: al pasar a resultados se copia');
set role anon;
select pg_temp.check((select (x->>'time_seconds')::int from jsonb_array_elements(runner_team('DDDDDDDDDD')->'races') r, jsonb_array_elements(r->'results') x where r->>'id' = :'rt' and x->>'position' = '4') = 7200, 'tiempo: el equipo ve el tiempo de las carreras');
reset role;
\echo TODAS LAS PRUEBAS SQL OK
