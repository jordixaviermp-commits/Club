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
\echo TODAS LAS PRUEBAS SQL OK
