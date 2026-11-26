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
select pg_temp.check(jsonb_array_length(admin_movements()) >= 1 and admin_movements()::text like '%se inscribió en Volta Futura%', 'movimientos: la dirección ve las inscripciones');
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
select runner_update_registration('CCCCCCCCCC', :'nueva', jsonb_build_object('name','Marxa Nova Editada','date', current_date + 11, 'modality','Gravel', 'place','Corregido por otro'));
select pg_temp.check(runner_view('BBBBBBBBBB')::text like '%Corregido por otro%', 'cualquier corredor puede corregir los datos de una carrera');
select pg_temp.expect_fail($q$select runner_update_registration('CCCCCCCCCC', '00000000-0000-0000-0000-0000000000ff', '{"name":"Hack","date":"2099-01-01"}')$q$, 'no edita una carrera que no existe');
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
select runner_report_result('BBBBBBBBBB', 'reg', '20000000-0000-0000-0000-000000000050', 3, 'Élite', 'campeonato');
select runner_report_result('BBBBBBBBBB', 'reg', '20000000-0000-0000-0000-000000000050', 2, 'Élite', 'campeonato');
select pg_temp.check((select (g->'my_result'->>'position')::int from jsonb_array_elements(runner_view('BBBBBBBBBB')->'registrations') g where g->>'id' = '20000000-0000-0000-0000-000000000050') = 2, 'puede cambiar su propio resultado');
-- puesto en la general: opcional, nunca por delante del de su categoría, y viaja con la inscripción
select runner_set_general('BBBBBBBBBB', 'reg', '20000000-0000-0000-0000-000000000050', 5);
select pg_temp.check((runner_generals('BBBBBBBBBB')->'regs'->>'20000000-0000-0000-0000-000000000050')::int = 5, 'puesto general: lo guarda y lo lee');
select pg_temp.expect_fail($q$select runner_set_general('BBBBBBBBBB', 'reg', '20000000-0000-0000-0000-000000000050', 1)$q$, 'puesto general: no puede ir por delante de su categoría');
select pg_temp.expect_fail($q$select runner_set_general('BBBBBBBBBB', 'reg', '20000000-0000-0000-0000-000000000050', 10000)$q$, 'puesto general: máximo 9999');
select pg_temp.expect_fail($q$select runner_set_general('CCCCCCCCCC', 'reg', '20000000-0000-0000-0000-000000000050', 9)$q$, 'puesto general: solo el suyo');
select pg_temp.expect_fail($q$select runner_set_general('XXXXXXXXXXXX', 'reg', '20000000-0000-0000-0000-000000000050', 9)$q$, 'puesto general: enlace falso no escribe');
select pg_temp.expect_fail($q$select runner_report_result('BBBBBBBBBB', 'reg', '20000000-0000-0000-0000-000000000009', 1, null, null)$q$, 'no pone resultado donde no está apuntado');
select pg_temp.check((select (g->'my_result'->>'position')::int from jsonb_array_elements(runner_view('BBBBBBBBBB')->'registrations') g where g->>'id' = '20000000-0000-0000-0000-000000000050') = 2, 've su resultado enviado');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select promote_registration('20000000-0000-0000-0000-000000000050') as rp \gset
select pg_temp.check((select position from results where race_id = :'rp' and runner_id = '10000000-0000-0000-0000-000000000002') = 2, 'pasar a resultados copia su puesto');
select pg_temp.check((select podium_type from results where race_id = :'rp' and runner_id = '10000000-0000-0000-0000-000000000002') = 'campeonato', 'y su tipo de podio');
select pg_temp.check((select self_reported from results where race_id = :'rp' and runner_id = '10000000-0000-0000-0000-000000000002'), 'marcado como puesto por el corredor');
select pg_temp.check((select general_position from results where race_id = :'rp' and runner_id = '10000000-0000-0000-0000-000000000002') = 5, 'pasar a resultados copia su puesto general (trigger)');
reset role;
set role anon;
select runner_report_result('CCCCCCCCCC', 'race', :'rp', 7, null, null);
select runner_report_result('CCCCCCCCCC', 'race', :'rp', 6, null, null);
select runner_report_result('CCCCCCCCCC', 'race', :'rp', 7, null, null);
select runner_set_general('CCCCCCCCCC', 'race', :'rp', 21);
select pg_temp.check(exists (select 1 from jsonb_array_elements(runner_generals('BBBBBBBBBB')->'results') x where x->>0 = :'rp' and (x->>2)::int = 21), 'puesto general: el resumen del equipo lo incluye');
select runner_set_general('CCCCCCCCCC', 'race', :'rp', null);
select pg_temp.check(not exists (select 1 from jsonb_array_elements(runner_generals('BBBBBBBBBB')->'results') x where x->>0 = :'rp' and (x->>2)::int = 21), 'puesto general: se puede quitar');
select pg_temp.expect_fail($q$select runner_set_general('CCCCCCCCCC', 'race', '$q$ || :'rp' || $q$', 1)$q$, 'puesto general en carrera hecha: no por delante de su categoría');
select pg_temp.expect_fail($q$select runner_report_result('XXXXXXXXXXXX', 'race', '$q$ || :'rp' || $q$', 1, null, null)$q$, 'sin enlace no cambia puestos');
select pg_temp.check(jsonb_array_length(runner_view('BBBBBBBBBB')->'my_results') >= 1, 'mis carreras: ve sus resultados');
select pg_temp.check((runner_view('BBBBBBBBBB')->'my_results')::text not like '%Pere Soler%', 'mis carreras: solo las suyas');
select pg_temp.check(jsonb_array_length(runner_team('BBBBBBBBBB')->'races') >= 1, 'resumen equipo: ve las carreras del equipo');
select pg_temp.check(runner_team('BBBBBBBBBB')::text !~ '(BBBBBBBBBB|AAAAAAAAAA|contract|renovacion|"notes")', 'resumen equipo: sin enlaces, contratos ni notas');
select pg_temp.expect_fail($q$select runner_team('XXXXXXXXXXXX')$q$, 'resumen equipo: sin enlace no');
select pg_temp.check(jsonb_typeof(runner_team_moves('BBBBBBBBBB')) = 'array', 'movimientos del equipo: devuelve una lista');
select pg_temp.check(runner_team_moves('BBBBBBBBBB')::text !~ '(BBBBBBBBBB|AAAAAAAAAA|contract)', 'movimientos del equipo: sin enlaces ni contratos');
select pg_temp.expect_fail($q$select runner_team_moves('XXXXXXXXXXXX')$q$, 'movimientos del equipo: sin enlace no');
-- clasificación de la racha «al día»
reset role;
insert into runners (id, name, code) values ('10000000-0000-0000-0000-0000000000a1', 'Racha Uno', 'RRRRRRRRR1'), ('10000000-0000-0000-0000-0000000000a2', 'Racha Dos', 'RRRRRRRRR2');
insert into races (id, name, date) values
  ('30000000-0000-0000-0000-0000000000a1', 'Marxa Ñandú', current_date - 60), ('30000000-0000-0000-0000-0000000000a2', 'Cursa Dos', current_date - 40),
  ('30000000-0000-0000-0000-0000000000a3', 'Cursa Tres', current_date - 20), ('30000000-0000-0000-0000-0000000000a4', 'Cursa Reciente', current_date - 3);
insert into results (race_id, runner_id, runner_name, position) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'Racha Uno', 5), ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a1', 'Racha Uno', 4),
  ('30000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-0000000000a1', 'Racha Uno', 3), ('30000000-0000-0000-0000-0000000000a4', '10000000-0000-0000-0000-0000000000a1', 'Racha Uno', 9),
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a2', 'Racha Dos', 8), ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a2', 'Racha Dos', 6),
  ('30000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-0000000000a2', 'Racha Dos', 7);
-- crónicas pasadas por alguien: la 1ª (con ñ y mayúsculas), la 2ª y la 3ª; la reciente aún no (está en plazo)
insert into chronicles (runner_id, race_key) values
  ('10000000-0000-0000-0000-0000000000a1', to_char(current_date - 60, 'YYYY-MM-DD') || '|marxa nandu'), ('10000000-0000-0000-0000-0000000000a1', to_char(current_date - 20, 'YYYY-MM-DD') || '|cursa tres'),
  ('10000000-0000-0000-0000-0000000000a2', to_char(current_date - 40, 'YYYY-MM-DD') || '|cursa dos');
set role anon;
select pg_temp.check((select (e->>'streak')::int from jsonb_array_elements(runner_streaks('RRRRRRRRR1')) e where e->>'name' = 'Racha Uno') = 3, 'racha: tres seguidas al día y la reciente (en plazo) no la rompe');
select pg_temp.check((select (e->>'streak')::int from jsonb_array_elements(runner_streaks('RRRRRRRRR1')) e where e->>'name' = 'Racha Dos') = 3, 'racha: la crónica la pasó otro y vale para todos');
select pg_temp.check(runner_streaks('RRRRRRRRR1')::text !~ '(RRRRRRRRR|code)', 'racha: sin enlaces');
select pg_temp.expect_fail($q$select runner_streaks('XXXXXXXXXXXX')$q$, 'racha: sin enlace no');
select pg_temp.expect_fail($q$select admin_movements()$q$, 'movimientos: un corredor no los lee');
reset role;
select pg_temp.check(exists (select 1 from change_log where action = 'baja' and summary like 'se borró de %'), 'movimientos: se anota cuando alguien se borra de una carrera');
set role anon;
reset role;
delete from chronicles where runner_id in ('10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a2');
delete from races where id::text like '30000000-0000-0000-0000-0000000000a%';
delete from runners where id in ('10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a2');
set role anon;

-- notas personales de inscripción (con una carrera en la que Anna está inscrita)
select set_config('t.reg', (select r->>'id' from jsonb_array_elements(runner_view('BBBBBBBBBB')->'registrations') r where r->'entries' @> '[{"runner_id":"10000000-0000-0000-0000-000000000002"}]'::jsonb limit 1), false);
reset role;
insert into runners (id, name, code) values ('10000000-0000-0000-0000-000000000009', 'Eva Test', 'EEEEEEEEEE');
set role anon;
select pg_temp.check(runner_notes_list('BBBBBBBBBB') = '{}'::jsonb, 'notas: al principio vacías');
select runner_note_set('BBBBBBBBBB', current_setting('t.reg')::uuid, '  Hotel Plaza 12-13 ene  ');
select pg_temp.check(runner_notes_list('BBBBBBBBBB')->>current_setting('t.reg') = 'Hotel Plaza 12-13 ene', 'notas: se guarda y se recorta');
select pg_temp.check(runner_notes_list('EEEEEEEEEE') = '{}'::jsonb, 'notas: otro corredor no las ve');
select pg_temp.expect_fail($q$select runner_note_set('EEEEEEEEEE', current_setting('t.reg')::uuid, 'x')$q$, 'notas: solo en carreras en las que estás inscrito');
select pg_temp.expect_fail($q$select runner_note_set('BBBBBBBBBB', current_setting('t.reg')::uuid, repeat('x', 1001))$q$, 'notas: máximo 1000 letras');
select pg_temp.expect_fail($q$select runner_notes_list('XXXXXXXXXXXX')$q$, 'notas: sin enlace no');
select runner_note_set('BBBBBBBBBB', current_setting('t.reg')::uuid, '');
select pg_temp.check(runner_notes_list('BBBBBBBBBB') = '{}'::jsonb, 'notas: vacío = borrar');
select runner_note_set('BBBBBBBBBB', current_setting('t.reg')::uuid, 'otra');
reset role;
delete from registration_entries where registration_id = current_setting('t.reg')::uuid and runner_id = '10000000-0000-0000-0000-000000000002';
select pg_temp.check((select count(*) from runner_entry_notes) = 0, 'notas: si te borras de la carrera, la nota desaparece');
insert into registration_entries (registration_id, runner_id) values (current_setting('t.reg')::uuid, '10000000-0000-0000-0000-000000000002');
set role anon;

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
select runner_set_race_type('CCCCCCCCCC', :'cop', 'circuito', ' Copa Aragón XCM ');
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
select runner_set_race_details('CCCCCCCCCC', :'fmt', 'XCO', 42);
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
  ('20000000-0000-0000-0000-000000000080', 'Auto Uno', current_date - 9, 'Huesca'),
  ('20000000-0000-0000-0000-000000000081', 'Auto Reciente', current_date - 5, null),
  ('20000000-0000-0000-0000-000000000082', 'Auto Sin Puesto', current_date - 12, null);
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
select pg_temp.check((select count(*) from races where name = 'Auto Uno') = 1 and not exists (select 1 from registrations where name = 'Auto Uno'), 'auto: con puesto puesto y una semana pasada, pasa sola a resultados');
select pg_temp.check((select count(*) from results x join races r on r.id = x.race_id where r.name = 'Auto Uno') = 1, 'auto: solo entra quien puso su puesto');
select pg_temp.check((select x.position from results x join races r on r.id = x.race_id where r.name = 'Auto Uno') = 2 and (select x.podium_type from results x join races r on r.id = x.race_id where r.name = 'Auto Uno') = 'campeonato', 'auto: con su puesto y tipo de podio');
select pg_temp.check((select x.time_seconds from results x join races r on r.id = x.race_id where r.name = 'Auto Uno') = 3725, 'tiempo: el paso automático copia el tiempo del corredor');
select pg_temp.check(exists (select 1 from registrations where name = 'Auto Reciente'), 'auto: no antes de una semana');
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
select pg_temp.check((select jsonb_array_length(n->'yes_list') = 1 and (n->'yes_list'->0->>'guests')::int = 2 and (n->'yes_list'->0->>'name') is not null from jsonb_array_elements(runner_news('CCCCCCCCCC')) n where n->>'id' = '40000000-0000-0000-0000-000000000001'), 'rsvp: se ve quién asiste (nombre y acompañantes) y no los que dijeron que no');
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
insert into registrations (id, name, date) values ('20000000-0000-0000-0000-000000000095', 'Corrige Despues', current_date - 9);
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
insert into registrations (id, name, date) values ('20000000-0000-0000-0000-00000000f001', 'Redes Proxima', current_date + 5);
insert into registration_entries (registration_id, runner_id) values ('20000000-0000-0000-0000-00000000f001', '10000000-0000-0000-0000-000000000004'), ('20000000-0000-0000-0000-00000000f001', '10000000-0000-0000-0000-000000000003');
update registration_entries set category = 'M40' where registration_id = '20000000-0000-0000-0000-00000000f001' and runner_id = '10000000-0000-0000-0000-000000000004';
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
select pg_temp.check((select u->'people_cat' from jsonb_array_elements(social_view('SOCIALCODE12345')->'upcoming') u where u->>'name' = 'Redes Proxima') @> '["Dani Test (M40)"]'::jsonb, 'redes: cada inscrito sale con su categoría');
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
-- contratos por tipo
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select upload_contract_template('renovacion_sin_licencia', 'Contrato sin licencia', 'c1.pdf', 'application/pdf', encode('%PDF-1.4 uno'::bytea, 'base64'));
select upload_contract_template('renovacion_sin_licencia', 'Contrato sin licencia v2', 'c2.pdf', 'application/pdf', encode('%PDF-1.4 dos'::bytea, 'base64'));
select pg_temp.check((select count(*) from contract_templates) = 1, 'tipo: subir otra vez el mismo tipo lo reemplaza');
select pg_temp.expect_fail($q$select upload_contract_template('otro', 'x', 'x.pdf', 'application/pdf', 'aGk=')$q$, 'tipo: contrato desconocido rechazado');
select pg_temp.expect_fail($q$select upload_contract_template('nuevo', 'x', 'x.exe', 'application/x-msdownload', 'aGk=')$q$, 'tipo: solo PDF o imágenes');
select pg_temp.check(convert_from(decode(get_contract_template('renovacion_sin_licencia')->>'b64', 'base64'), 'UTF8') = '%PDF-1.4 dos', 'tipo: la dirección descarga el vigente');
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check(runner_contract_template('BBBBBBBBBB')->>'title' = 'Contrato sin licencia v2', 'tipo: el corredor ve el contrato de su tipo');
select pg_temp.check(convert_from(decode(runner_get_contract_template('BBBBBBBBBB')->>'b64', 'base64'), 'UTF8') = '%PDF-1.4 dos', 'tipo: y lo descarga');
select pg_temp.check(runner_contract_template('CCCCCCCCCC') is null, 'tipo: quien tiene otro tipo (o ninguno) no ve ese contrato');
select pg_temp.expect_fail($q$select runner_get_contract_template('CCCCCCCCCC')$q$, 'tipo: ni lo descarga');
select pg_temp.expect_fail($q$select runner_contract_template('XXXXXXXXXXXX')$q$, 'tipo: sin enlace válido no');
select pg_temp.expect_fail($q$select upload_contract_template('nuevo', 'x', 'x.pdf', 'application/pdf', 'aGk=')$q$, 'tipo: anon no sube');
select pg_temp.expect_fail('select * from contract_templates', 'tipo: anon no lee la tabla');
reset role;
-- estadísticas de Instagram: la tarea automática guarda con su token; nadie más
reset role;
select token as igtok from ig_secret \gset
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.headers', '{}', false);
select pg_temp.expect_fail($q$select ig_save('[{"kind":"day","key":"2026-11-13","data":{"views":10}}]')$q$, 'instagram: sin token no guarda');
select set_config('request.headers', '{"x-ig-token":"falso"}', false);
select pg_temp.expect_fail($q$select ig_save('[{"kind":"day","key":"2026-11-13","data":{"views":10}}]')$q$, 'instagram: token falso no guarda');
select set_config('request.headers', json_build_object('x-ig-token', :'igtok')::text, false);
select ig_save('[{"kind":"day","key":"2026-11-13","data":{"views":10,"reach":4}},{"kind":"media","key":"m1","data":{"views":50}},{"kind":"otro","key":"x","data":{}}]') as igguardadas \gset
select pg_temp.check(:igguardadas = 2, 'instagram: guarda las filas válidas y descarta tipos desconocidos');
select ig_save('[{"kind":"day","key":"2026-11-13","data":{"views":12}}]');
select pg_temp.expect_fail('select * from ig_snapshots', 'instagram: anon no lee las cifras');
select pg_temp.expect_fail('select * from ig_secret', 'instagram: anon no lee el token');
select pg_temp.expect_fail($q$select ig_save('{"kind":"day"}')$q$, 'instagram: tiene que ser una lista');
select set_config('request.headers', '{}', false);
reset role;
select pg_temp.check((select (data->>'views')::int from ig_snapshots where kind = 'day' and key = '2026-11-13') = 12
                 and (select (data->>'reach')::int from ig_snapshots where kind = 'day' and key = '2026-11-13') = 4, 'instagram: al repetir se actualiza y conserva lo que no venía');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.check((select count(*) from ig_snapshots) = 2, 'instagram: la dirección lee las cifras');
select pg_temp.expect_fail('select * from ig_secret', 'instagram: ni la dirección lee el token desde la app');
reset role;
-- resúmenes por periodo de Insights (kind «period»): se guardan con la clave de captura y los ve la dirección
reset role;
select token as igtok2 from ig_secret \gset
set role anon;
select set_config('request.headers', json_build_object('x-ig-token', :'igtok2')::text, false);
select ig_save('[{"kind":"period","key":"2026-10-15_2026-11-13","data":{"views":11736,"net_follows":3}}]') as igper \gset
select pg_temp.check(:igper = 1, 'periodo: se guarda con la clave de captura');
select ig_save('[{"kind":"period","key":"2026-10-15_2026-11-13","data":{"interactions":294}}]');
select set_config('request.headers', '{}', false);
reset role;
select pg_temp.check((select (data->>'views')::int from ig_snapshots where kind='period') = 11736 and (select (data->>'interactions')::int from ig_snapshots where kind='period') = 294, 'periodo: al repetir se fusionan los campos');
select pg_temp.expect_fail($q$insert into ig_snapshots (kind, key, data) values ('rarito', 'x', '{}')$q$, 'periodo: tipo desconocido rechazado');
-- ===== El creador sigue pudiendo editar/borrar su carrera después de pasar a resultados =====
reset role;
set role anon;
select runner_create_registration('BBBBBBBBBB', jsonb_build_object('name','Cursa Creador','date', current_date - 2), 'Élite') as creada \gset
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select promote_registration(:'creada') as rcreada \gset
reset role;
select pg_temp.check((select created_by from races where id = :'rcreada') = '10000000-0000-0000-0000-000000000002', 'la carrera conserva quién la añadió');
set role anon;
select pg_temp.check((select (x->>'mine_created')::boolean from jsonb_array_elements(runner_view('BBBBBBBBBB')->'my_results') x where x->>'race_id' = :'rcreada'), 'el corredor sabe que la añadió él');
select runner_update_race('BBBBBBBBBB', :'rcreada', jsonb_build_object('name','Cursa Creador Editada','date', current_date - 3, 'modality','Gravel', 'km', '72.5', 'race_type', 'circuito', 'circuit', 'Open Test'));
reset role;
select pg_temp.check((select name = 'Cursa Creador Editada' and modality = 'Gravel' and km = 72.5 and circuit = 'Open Test' from races where id = :'rcreada'), 'edita su carrera ya en resultados');
select pg_temp.check(exists (select 1 from change_log where entity_id = :'rcreada' and actor = 'Anna Puig'), 'el historial dice quién la editó');
set role anon;
select runner_update_race('CCCCCCCCCC', :'rcreada', jsonb_build_object('name','Cursa Creador Editada','date', current_date - 3, 'modality','Gravel', 'km', '72.5', 'race_type', 'circuito', 'circuit', 'Open Test', 'place', 'Corregido por otro'));
reset role;
select pg_temp.check((select place = 'Corregido por otro' from races where id = :'rcreada'), 'cualquier corredor puede corregir una carrera en resultados');
select pg_temp.check(exists (select 1 from change_log where entity_id = :'rcreada' and actor = (select name from runners where code = 'CCCCCCCCCC')), 'el historial dice quién la corrigió');
set role anon;
select pg_temp.expect_fail($q$select runner_update_race('BBBBBBBBBB', '$q$ || :'rcreada' || $q$', jsonb_build_object('name','Futura','date', current_date + 5))$q$, 'una carrera en resultados no puede ir a fecha futura');
select pg_temp.expect_fail($q$select runner_delete_race('CCCCCCCCCC', '$q$ || :'rcreada' || $q$')$q$, 'no borra la carrera de otro');
select runner_join_race('CCCCCCCCCC', :'rcreada', null);
select pg_temp.expect_fail($q$select runner_delete_race('BBBBBBBBBB', '$q$ || :'rcreada' || $q$')$q$, 'no borra si otros tienen resultado');
reset role;
delete from results where race_id = :'rcreada' and runner_id = '10000000-0000-0000-0000-000000000003';
set role anon;
select runner_delete_race('BBBBBBBBBB', :'rcreada');
reset role;
select pg_temp.check(not exists (select 1 from races where id = :'rcreada'), 'borra su carrera si solo está él');
-- crónicas de carrera: el corredor marca las suyas con su enlace; la dirección las lee; el resto, nada
reset role;
select code as crcode from runners order by name limit 1 \gset
select id as crid from runners where code = :'crcode' \gset
select code as crcode2 from runners where code <> :'crcode' limit 1 \gset
select name as crname from runners where code = :'crcode' \gset
set role anon;
select set_config('request.headers', '{}', false);
select pg_temp.check(runner_chronicles(:'crcode') = '[]'::jsonb, 'crónicas: al principio ninguna');
select runner_chronicle_set(:'crcode', '2026-11-08|vii btt', true);
select runner_chronicle_set(:'crcode', '2026-11-08|vii btt', true);
select runner_chronicle_set(:'crcode', '2026-10-25|salida', true);
select pg_temp.check(jsonb_array_length(runner_chronicles(:'crcode')) = 2, 'crónicas: marcar dos veces la misma no duplica');
select pg_temp.check(runner_chronicles(:'crcode2') = '[]'::jsonb, 'crónicas: cada corredor ve solo las suyas');
select runner_chronicle_set(:'crcode', '2026-10-25|salida', false);
select pg_temp.check(runner_chronicles(:'crcode') = '["2026-11-08|vii btt"]'::jsonb, 'crónicas: se puede desmarcar');
select runner_chronicle_set(:'crcode2', '2026-11-08|vii btt', true);
select runner_chronicle_set(:'crcode2', '2026-11-08|vii btt', false);
select pg_temp.check(runner_chronicles(:'crcode') = '[]'::jsonb and runner_chronicles(:'crcode2') = '[]'::jsonb, 'crónicas: deshacer la deja pendiente para todos');
select runner_chronicle_set(:'crcode', '2026-11-08|vii btt', true);
select pg_temp.expect_fail($q$select runner_chronicles('codigo-falso')$q$, 'crónicas: enlace falso no lee');
select pg_temp.expect_fail($q$select runner_chronicle_set('codigo-falso', 'abc|def', true)$q$, 'crónicas: enlace falso no marca');
select pg_temp.expect_fail($q$select runner_chronicle_set('$$ || :'crcode' || $$', 'x', true)$q$, 'crónicas: clave demasiado corta');
select pg_temp.check((select (e->>'mine')::boolean from jsonb_array_elements(runner_chronicles_team(:'crcode')) e where e->>'key' = '2026-11-08|vii btt') and (select not (e->>'mine')::boolean from jsonb_array_elements(runner_chronicles_team(:'crcode2')) e where e->>'key' = '2026-11-08|vii btt'), 'crónicas: la que pasó un compañero la ve como pasada (y no es suya)');
select pg_temp.check((select e->>'by' from jsonb_array_elements(runner_chronicles_team(:'crcode2')) e where e->>'key' = '2026-11-08|vii btt') = :'crname', 'crónicas: se sabe quién la pasó');
select pg_temp.expect_fail($q$select runner_chronicles_team('codigo-falso')$q$, 'crónicas: enlace falso no lee las del equipo');
select pg_temp.expect_fail('select * from chronicles', 'crónicas: anon no lee la tabla');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.check((select count(*) from chronicles) = 1, 'crónicas: la dirección las lee');
reset role;

-- ===== Pago de la inscripción =====
reset role;
insert into registrations (id, name, date) values ('20000000-0000-0000-0000-00000000f0a9', 'Prueba de pago', current_date + 30);
create function pg_temp.ent(p_code text, p_id text) returns jsonb language sql as $f$
  select e from jsonb_array_elements(runner_view(p_code)->'registrations') g, jsonb_array_elements(g->'entries') e
   where g->>'id' = '20000000-0000-0000-0000-00000000f0a9' and e->>'runner_id' = p_id $f$;
set role anon;
select set_config('request.headers', '{}', false);
select runner_join(:'crcode', '20000000-0000-0000-0000-00000000f0a9', 'Élite');
select pg_temp.check((pg_temp.ent(:'crcode2', :'crid')->>'paid')::boolean = false, 'pago: al apuntarse aún no está pagada');
select runner_set_paid(:'crcode', '20000000-0000-0000-0000-00000000f0a9', true, 25.5);
select pg_temp.check((pg_temp.ent(:'crcode2', :'crid')->>'paid')::boolean, 'pago: los compañeros ven que está pagada');
select pg_temp.check(pg_temp.ent(:'crcode2', :'crid')->'paid_amount' = 'null'::jsonb, 'pago: el importe no se ve a los compañeros');
select pg_temp.check((pg_temp.ent(:'crcode', :'crid')->>'paid_amount')::numeric = 25.5, 'pago: el importe lo ve su dueño');
select runner_set_paid(:'crcode', '20000000-0000-0000-0000-00000000f0a9', true, 10, current_date - 3);
select pg_temp.check((pg_temp.ent(:'crcode', :'crid')->>'paid_on')::date = current_date - 3, 'pago: el día del pago lo ve su dueño');
select pg_temp.check(pg_temp.ent(:'crcode', :'crid')->>'joined_on' is not null, 'pago: el día de la inscripción lo ve su dueño');
select pg_temp.check(pg_temp.ent(:'crcode2', :'crid')->'paid_on' = 'null'::jsonb and pg_temp.ent(:'crcode2', :'crid')->'joined_on' = 'null'::jsonb, 'pago: los compañeros no ven ni el día del pago ni el de inscripción');
select pg_temp.expect_fail($q$select runner_set_paid('$q$ || :'crcode' || $q$', '20000000-0000-0000-0000-00000000f0a9', true, null, '2001-01-01')$q$, 'pago: fecha absurda rechazada');
select runner_join(:'crcode', '20000000-0000-0000-0000-00000000f0a9', 'M40');
select pg_temp.check((pg_temp.ent(:'crcode2', :'crid')->>'paid')::boolean, 'pago: cambiar de categoría no borra el pago');
select runner_set_paid(:'crcode', '20000000-0000-0000-0000-00000000f0a9', false, null);
select pg_temp.check(not (pg_temp.ent(:'crcode2', :'crid')->>'paid')::boolean, 'pago: se puede desmarcar');
select pg_temp.expect_fail($q$select runner_set_paid('codigo-falso', '20000000-0000-0000-0000-00000000f0a9', true, null)$q$, 'pago: enlace falso no marca');
select pg_temp.expect_fail($q$select runner_set_paid('$q$ || :'crcode' || $q$', '20000000-0000-0000-0000-00000000f0a9', true, -5)$q$, 'pago: importe negativo rechazado');
select pg_temp.expect_fail($q$select runner_set_paid('$q$ || :'crcode2' || $q$', '20000000-0000-0000-0000-00000000f0a9', true, null)$q$, 'pago: sin estar inscrito no se puede marcar');
reset role;
-- actividad: abrir la app guarda la última vez (como mucho una vez por hora)
set role anon;
select runner_ping(:'crcode');
reset role;
select pg_temp.check((select last_seen from runners where code = :'crcode') > now() - interval '1 minute', 'actividad: abrir la app guarda la última vez');
update runners set last_seen = now() - interval '10 minutes' where code = :'crcode';
set role anon;
select runner_ping(:'crcode');
select runner_ping('codigo-falso');
reset role;
select pg_temp.check((select last_seen from runners where code = :'crcode') < now() - interval '9 minutes', 'actividad: no se reescribe dentro de la misma hora');
-- por valorar: personal de cada corredor, con validación y límite
select id as wid2 from runners where code = :'crcode2' \gset
set role anon;
select runner_watch_save(:'crcode', null, jsonb_build_object('name', 'Gran Fondo Monzón', 'date', (current_date + 40)::text, 'modality', 'Carretera', 'url', 'https://ejemplo.org/gf',
  'price', '28.5', 'deadline', (current_date + 20)::text, 'km', '120', 'notes', 'Subida larga')) as wid \gset
select pg_temp.check((select count(*) from jsonb_array_elements(runner_watch_list(:'crcode')) e where e->>'name' = 'Gran Fondo Monzón' and (e->>'price')::numeric = 28.5) = 1, 'por valorar: se guarda y se lista con sus datos');
select pg_temp.check(runner_watch_list(:'crcode2') = '[]'::jsonb, 'por valorar: el compañero no ve lo mío');
select pg_temp.check(not (runner_watch_list(:'crcode')->0 ? 'runner_id'), 'por valorar: no se devuelve el id del corredor');
select pg_temp.check(runner_watch_save(:'crcode', null, jsonb_build_object('name', 'gran fondo monzón', 'date', (current_date + 40)::text)) = :'wid'::uuid, 'por valorar: guardar dos veces la misma no la duplica');
select pg_temp.expect_fail($q$select runner_watch_save('$q$ || :'crcode2' || $q$', '$q$ || :'wid' || $q$', '{"name":"Robada","date":"$q$ || (current_date + 10)::text || $q$"}')$q$, 'por valorar: el compañero no puede editar la mía');
select runner_watch_delete(:'crcode2', :'wid');
select pg_temp.check(jsonb_array_length(runner_watch_list(:'crcode')) = 1, 'por valorar: el compañero no puede borrar la mía');
select runner_watch_save(:'crcode', :'wid', jsonb_build_object('name', 'Gran Fondo Monzón', 'date', (current_date + 41)::text, 'price', '30'));
select pg_temp.check((select (e->>'price')::numeric = 30 and e->>'url' is null and e->>'date' = (current_date + 41)::text from jsonb_array_elements(runner_watch_list(:'crcode')) e limit 1), 'por valorar: se corrige');
select pg_temp.expect_fail($q$select runner_watch_save('$q$ || :'crcode' || $q$', null, '{"name":"Con web mala","date":"$q$ || (current_date + 10)::text || $q$","url":"javascript:alert(1)"}')$q$, 'por valorar: solo enlaces http(s)');
select pg_temp.expect_fail($q$select runner_watch_save('$q$ || :'crcode' || $q$', null, '{"name":"Precio malo","date":"$q$ || (current_date + 10)::text || $q$","price":"-3"}')$q$, 'por valorar: precio negativo rechazado');
select pg_temp.expect_fail($q$select runner_watch_save('$q$ || :'crcode' || $q$', null, '{"name":"Plazo tarde","date":"$q$ || (current_date + 10)::text || $q$","deadline":"$q$ || (current_date + 12)::text || $q$"}')$q$, 'por valorar: el plazo no puede ser después de la carrera');
select pg_temp.expect_fail($q$select runner_watch_save('$q$ || :'crcode' || $q$', null, '{"name":"Sin fecha"}')$q$, 'por valorar: sin fecha no se guarda');
select pg_temp.expect_fail($q$select runner_watch_save('codigo-falso', null, '{"name":"Falsa","date":"$q$ || (current_date + 10)::text || $q$"}')$q$, 'por valorar: enlace falso rechazado');
select pg_temp.expect_fail($q$select * from runner_watch$q$, 'por valorar: la tabla no se lee directamente');
reset role;
insert into runner_watch (runner_id, name, date) select :'crid'::uuid, 'Relleno ' || i, current_date + 100 from generate_series(1, 59) i;
select pg_temp.check((select count(*) from runner_watch where runner_id = :'crid') = 60, 'por valorar: relleno de prueba hasta el límite');
set role anon;
select pg_temp.expect_fail($q$select runner_watch_save('$q$ || :'crcode' || $q$', null, '{"name":"Una de más","date":"$q$ || (current_date + 11)::text || $q$"}')$q$, 'por valorar: hay un límite de carreras guardadas');
reset role;
insert into runners (name, code) values ('Temporal Watch', 'codigo-temporal-0001') returning id as tmpid \gset
insert into runner_watch (runner_id, name, date) values (:'tmpid', 'De prueba', current_date + 5);
select set_config('app.skip_log', 'on', false);
delete from runners where id = :'tmpid';
select set_config('app.skip_log', 'off', false);
select pg_temp.check((select count(*) from runner_watch where runner_id = :'tmpid') = 1, 'por valorar: restaurar una copia no borra las guardadas');
insert into runners (id, name, code) values (:'tmpid', 'Temporal Watch', 'codigo-temporal-0001');
delete from runners where id = :'tmpid';
select pg_temp.check((select count(*) from runner_watch where runner_id = :'tmpid') = 0, 'por valorar: al borrar al corredor se borra lo suyo');
-- por valorar → Carreras: se crea sin inscritos ni dueño, sin duplicados, y se limpia sola
insert into runners (name, code) values ('Valorador Uno', 'codigo-valorador-uno-01'), ('Valorador Dos', 'codigo-valorador-dos-02');
select (select count(*) from change_log) as logn0 \gset
set role anon;
select runner_watch_save('codigo-valorador-uno-01', null, jsonb_build_object('name', 'Gran Fondo Monzón Prueba', 'date', (current_date + 60)::text, 'place', 'Monzón', 'province', 'Huesca',
  'modality', 'Carretera', 'subtype', 'Ciclodeportiva', 'km', '120', 'price', '30', 'notes', 'privado', 'url', 'https://ejemplo.org/x')) as w1 \gset
select pg_temp.check((select count(*) from jsonb_array_elements(runner_view('codigo-valorador-dos-02')->'registrations') g where g->>'name' = 'Gran Fondo Monzón Prueba' and g->>'place' = 'Monzón' and jsonb_array_length(g->'entries') = 0 and g->>'notes' is null and coalesce((g->>'mine_created')::boolean, false) = false) = 1,
  'por valorar→carreras: otro corredor la encuentra con sus datos, sin inscritos, sin notas y sin dueño');
reset role;
select pg_temp.check((select created_by is null and candidate and subtype = 'Ciclodeportiva' and km = 120 from registrations where name = 'Gran Fondo Monzón Prueba'), 'por valorar→carreras: sin dueño, marcada como candidata, con disciplina y km');
select pg_temp.check((select count(*) from change_log) = :'logn0', 'por valorar→carreras: no llena el historial de cambios');
set role anon;
select runner_watch_save('codigo-valorador-dos-02', null, jsonb_build_object('name', 'gran fondo monzon prueba', 'date', (current_date + 60)::text));
reset role;
select pg_temp.check((select count(*) from registrations where public.norm_name(name) = 'granfondomonzonprueba') = 1, 'por valorar→carreras: otro corredor la guarda con otra grafía y no se duplica');
set role anon;
select runner_create_registration('codigo-valorador-dos-02', jsonb_build_object('name', 'GRAN FONDO MONZON PRUEBA!', 'date', (current_date + 60)::text), 'M40') as rid \gset
reset role;
select pg_temp.check((select count(*) from registrations where public.norm_name(name) = 'granfondomonzonprueba') = 1 and (select id::text from registrations where public.norm_name(name) = 'granfondomonzonprueba') = :'rid', 'por valorar→carreras: inscribirse usa la que ya existe');
select pg_temp.check((select not candidate and created_by is null from registrations where id = :'rid'), 'por valorar→carreras: al apuntarse alguien deja de ser candidata');
set role anon;
select runner_watch_delete('codigo-valorador-uno-01', :'w1');
reset role;
select pg_temp.check((select count(*) from registrations where public.norm_name(name) = 'granfondomonzonprueba') = 1, 'por valorar→carreras: con inscritos no se borra al descartarla');
-- dos corredores valoran la misma; solo desaparece cuando ya no la valora nadie
set role anon;
select runner_watch_save('codigo-valorador-uno-01', null, jsonb_build_object('name', 'Solo Valorar Candidata', 'date', (current_date + 30)::text)) as w3 \gset
select runner_watch_save('codigo-valorador-dos-02', null, jsonb_build_object('name', 'Solo Valorar Candidata', 'date', (current_date + 30)::text)) as w4 \gset
select runner_watch_delete('codigo-valorador-uno-01', :'w3');
reset role;
select pg_temp.check((select count(*) from registrations where name = 'Solo Valorar Candidata') = 1, 'por valorar→carreras: si otro aún la valora, sigue en Carreras');
set role anon;
select runner_watch_delete('codigo-valorador-dos-02', :'w4');
reset role;
select pg_temp.check((select count(*) from registrations where name = 'Solo Valorar Candidata') = 0, 'por valorar→carreras: cuando nadie la valora, desaparece');
-- una candidata cuya fecha ya pasó sin inscritos se limpia al abrir la app
insert into registrations (name, date, candidate) values ('Candidata Vieja', current_date - 2, true);
select auto_promote_registrations();
select pg_temp.check((select count(*) from registrations where name = 'Candidata Vieja') = 0, 'por valorar→carreras: la que ya pasó sin inscritos se limpia sola');
select pg_temp.check(public.norm_name('Marxa del Montsení – 2ª Ç!') = 'marxadelmontseni2c', 'nombre normalizado sin tildes ni signos');
-- web de la carrera: la puede poner, cambiar o quitar cualquier corredor
set role anon;
select runner_create_registration('codigo-valorador-uno-01', jsonb_build_object('name', 'Carrera Con Web', 'date', (current_date + 45)::text, 'url', 'https://carrera.example/web'), 'M40') as rweb \gset
select pg_temp.check((select g->>'url' = 'https://carrera.example/web' from jsonb_array_elements(runner_view('codigo-valorador-uno-01')->'registrations') g where g->>'name' = 'Carrera Con Web'), 'web: el que la crea la ve');
select pg_temp.check((select g->>'url' = 'https://carrera.example/web' from jsonb_array_elements(runner_view('codigo-valorador-dos-02')->'registrations') g where g->>'name' = 'Carrera Con Web'), 'web: los demás la ven');
select runner_set_registration_url('codigo-valorador-dos-02', :'rweb', 'https://otra.example');
reset role;
select pg_temp.check((select url = 'https://otra.example' from registrations where id = :'rweb'), 'web: cualquier corredor puede cambiar la web');
set role anon;
select runner_set_registration_url('codigo-valorador-uno-01', :'rweb', 'https://carrera.example/nueva');
reset role;
select pg_temp.check((select url = 'https://carrera.example/nueva' from registrations where id = :'rweb'), 'web: y el otro también');
set role anon;
select pg_temp.expect_fail($q$select runner_set_registration_url('codigo-valorador-uno-01', '$q$ || :'rweb' || $q$', 'javascript:alert(1)')$q$, 'web: solo http(s)');
select pg_temp.expect_fail($q$select runner_set_registration_url('codigo-falso', '$q$ || :'rweb' || $q$', 'https://x.example')$q$, 'web: enlace falso rechazado');
select runner_set_registration_url('codigo-valorador-dos-02', :'rweb', '');
reset role;
select pg_temp.check((select url is null and url_by is null from registrations where id = :'rweb'), 'web: cualquiera puede quitarla');
set role anon;
select runner_set_registration_url('codigo-valorador-dos-02', :'rweb', 'https://dos.example');
reset role;
select pg_temp.check((select url = 'https://dos.example' from registrations where id = :'rweb'), 'web: y volver a ponerla');
set role anon;
-- guardada en «Por valorar» con web: se comparte; no pisa la que ya existe
select runner_watch_save('codigo-valorador-uno-01', null, jsonb_build_object('name', 'Carrera Con Web', 'date', (current_date + 45)::text, 'url', 'https://uno.example'));
reset role;
select pg_temp.check((select url = 'https://dos.example' from registrations where id = :'rweb'), 'web: Por valorar no pisa la web que ya había');
set role anon;
select runner_watch_save('codigo-valorador-uno-01', null, jsonb_build_object('name', 'Valorada Con Web', 'date', (current_date + 50)::text, 'url', 'https://valorada.example')) as wv \gset
select pg_temp.check((select g->>'url' = 'https://valorada.example' from jsonb_array_elements(runner_view('codigo-valorador-dos-02')->'registrations') g where g->>'name' = 'Valorada Con Web'), 'web: lo guardado en Por valorar con web se comparte con los demás');
select runner_watch_save('codigo-valorador-dos-02', null, jsonb_build_object('name', 'Sin Web Aun', 'date', (current_date + 52)::text));
select runner_watch_save('codigo-valorador-uno-01', null, jsonb_build_object('name', 'Sin Web Aun', 'date', (current_date + 52)::text, 'url', 'https://ahora.example'));
reset role;
select pg_temp.check((select url = 'https://ahora.example' from registrations where name = 'Sin Web Aun'), 'web: si otro la guarda con web y la carrera no tenía, queda para todos');
select pg_temp.expect_fail($q$update registrations set url = 'ftp://mal' where name = 'Sin Web Aun'$q$, 'web: la base de datos rechaza webs que no son http(s)');
-- al pasar a resultados la web se conserva
insert into registrations (name, date, url) values ('Con Web Pasada', current_date - 6, 'https://pasada.example') returning id as rpas \gset
insert into registration_entries (registration_id, runner_id, category, self_position) select :'rpas', id, 'M40', 3 from runners where code = 'codigo-valorador-uno-01';
select auto_promote_registrations();
select pg_temp.check((select url = 'https://pasada.example' from races where name = 'Con Web Pasada'), 'web: se conserva al pasar a resultados');
-- desnivel y precio de la inscripción (cualquier corredor completa lo que falta de una inscripción)
set role anon;
select runner_create_registration('codigo-valorador-uno-01', jsonb_build_object('name', 'Carrera Con Desnivel', 'date', (current_date + 48)::text, 'elevation', '1850', 'price', '27.5'), 'M40') as rdes \gset
select pg_temp.check((select (g->>'elevation')::int = 1850 and (g->>'price')::numeric = 27.5 from jsonb_array_elements(runner_view('codigo-valorador-dos-02')->'registrations') g where g->>'name' = 'Carrera Con Desnivel'), 'desnivel/precio: se guardan al crear y los demás los ven');
select runner_create_registration('codigo-valorador-dos-02', jsonb_build_object('name', 'Carrera Con Desnivel', 'date', (current_date + 48)::text, 'elevation', '999', 'price', '99'), 'M40');
reset role;
select pg_temp.check((select elevation = 1850 and price = 27.5 from registrations where id = :'rdes'), 'desnivel/precio: lo que aporta otro no pisa lo que ya había');
set role anon;
select runner_create_registration('codigo-valorador-uno-01', jsonb_build_object('name', 'Sin Datos Extra', 'date', (current_date + 49)::text, 'elevation', '99999', 'price', '-5'), 'M40') as rsin \gset
reset role;
select pg_temp.check((select elevation is null and price is null from registrations where id = :'rsin'), 'desnivel/precio: valores absurdos se ignoran');
set role anon;
select runner_complete_race('codigo-valorador-dos-02', 'reg', :'rsin', jsonb_build_object('elevation', '640', 'price', '0'));
reset role;
select pg_temp.check((select elevation = 640 and price = 0 from registrations where id = :'rsin'), 'desnivel/precio: un inscrito los completa si faltan (precio 0 = gratis)');
set role anon;
select runner_complete_race('codigo-valorador-uno-01', 'reg', :'rsin', jsonb_build_object('elevation', '1', 'price', '50'));
reset role;
select pg_temp.check((select elevation = 640 and price = 0 from registrations where id = :'rsin'), 'desnivel/precio: completar no cambia lo que ya está');
set role anon;
select runner_update_registration('codigo-valorador-uno-01', :'rsin', jsonb_build_object('name', 'Sin Datos Extra', 'date', (current_date + 49)::text, 'modality', 'Carretera', 'elevation', '700', 'price', '12'));
reset role;
select pg_temp.check((select elevation = 700 and price = 12 from registrations where id = :'rsin'), 'desnivel/precio: quien creó la carrera puede corregirlos');
set role anon;
select runner_watch_save('codigo-valorador-uno-01', null, jsonb_build_object('name', 'Valorada Con Desnivel', 'date', (current_date + 55)::text, 'elevation', '2100', 'price', '35')) as wvd \gset
select pg_temp.check((select (g->>'elevation')::int = 2100 and (g->>'price')::numeric = 35 from jsonb_array_elements(runner_view('codigo-valorador-dos-02')->'registrations') g where g->>'name' = 'Valorada Con Desnivel'), 'desnivel/precio: lo guardado en Por valorar se comparte');
select pg_temp.expect_fail($q$select runner_watch_save('codigo-valorador-uno-01', null, '{"name":"Desnivel absurdo","date":"$q$ || (current_date + 20)::text || $q$","elevation":"20000"}')$q$, 'desnivel/precio: desnivel absurdo rechazado en Por valorar');
reset role;
select pg_temp.expect_fail($q$update registrations set elevation = 0 where id = '$q$ || :'rsin' || $q$'$q$, 'desnivel/precio: la base de datos rechaza desniveles no válidos');
insert into registrations (name, date, elevation, price) values ('Con Datos Pasada', current_date - 6, 1500, 22) returning id as rdp \gset
insert into registration_entries (registration_id, runner_id, category, self_position) select :'rdp', id, 'M40', 5 from runners where code = 'codigo-valorador-uno-01';
select auto_promote_registrations();
select pg_temp.check((select elevation = 1500 and price = 22 from races where name = 'Con Datos Pasada'), 'desnivel/precio: se conservan al pasar a resultados');
select pg_temp.check((select (r->>'elevation')::int = 1500 and (r->>'price')::numeric = 22 from jsonb_array_elements(runner_team('codigo-valorador-dos-02')->'races') r where r->>'name' = 'Con Datos Pasada'), 'desnivel/precio: el resumen del equipo los incluye');
-- ubicación de la carrera para los desplazamientos
reset role;
insert into registrations (name, date, place, province, lat, lon, geo_key) values ('Con Ubicacion', current_date + 70, 'Pueblo Raro', 'Huesca', 42.01234, 0.55432, 'pueblo raro|huesca') returning id as rgeo \gset
set role anon;
select pg_temp.check((select (g->>'lat')::numeric = 42.01234 and (g->>'lon')::numeric = 0.55432 and g->>'geo_key' = 'pueblo raro|huesca' from jsonb_array_elements(runner_view('codigo-valorador-dos-02')->'registrations') g where g->>'name' = 'Con Ubicacion'), 'ubicación: los corredores reciben las coordenadas de la carrera');
reset role;
select pg_temp.expect_fail($q$update registrations set lat = 200 where name = 'Con Ubicacion'$q$, 'ubicación: la base de datos rechaza coordenadas imposibles');
insert into registrations (name, date, place, province, lat, lon, geo_key) values ('Ubicacion Pasada', current_date - 6, 'Pueblo Raro', 'Huesca', 42.01234, 0.55432, 'pueblo raro|huesca') returning id as rgp \gset
insert into registration_entries (registration_id, runner_id, category, self_position) select :'rgp', id, 'M40', 4 from runners where code = 'codigo-valorador-uno-01';
select auto_promote_registrations();
select pg_temp.check((select lat = 42.01234 and lon = 0.55432 and geo_key = 'pueblo raro|huesca' from races where name = 'Ubicacion Pasada'), 'ubicación: se conserva al pasar a resultados');
select pg_temp.check((select (r->>'lat')::numeric = 42.01234 from jsonb_array_elements(runner_team('codigo-valorador-dos-02')->'races') r where r->>'name' = 'Ubicacion Pasada'), 'ubicación: el resumen del equipo la incluye');

-- impacto en redes: el corredor ve las publicaciones del club y las cifras agregadas de 30 días
reset role;
delete from ig_snapshots where kind = 'period';   -- sin periodos, usa los días de los últimos 30
insert into social_posts (key, posted_by) values ('2026-11-01|impacto prueba', 'Redes'), ('res|2026-11-01|impacto prueba', 'Redes') on conflict do nothing;
insert into ig_snapshots (kind, key, data) values
  ('day', to_char(current_date - 2, 'YYYY-MM-DD'), '{"views": 100, "reach": 40, "interactions": 7, "follows": 2}'),
  ('day', to_char(current_date - 3, 'YYYY-MM-DD'), '{"views": 50, "reach": 20, "interactions": 3, "follows": 1}'),
  ('day', to_char(current_date - 90, 'YYYY-MM-DD'), '{"views": 9999, "reach": 1, "interactions": 1, "follows": 1}'),
  ('account', to_char(current_date - 1, 'YYYY-MM-DD'), '{"followers": 951}') on conflict (kind, key) do update set data = excluded.data;
set role anon;
select pg_temp.check((select count(*) filter (where r->>'kind' = 'day') >= 3 and count(*) filter (where r->>'kind' = 'period') = 0 and count(*) filter (where r->>'kind' = 'account' and (r->'data'->>'followers')::int = 951) = 1 from jsonb_array_elements(runner_social_impact('codigo-valorador-dos-02')->'ig_rows') r), 'impacto: entrega los días y el último nº de seguidores');
select pg_temp.check(runner_social_impact('codigo-valorador-dos-02')->'posted' @> '["2026-11-01|impacto prueba"]'::jsonb, 'impacto: ve lo publicado');
select pg_temp.expect_fail($q$select runner_social_impact('codigo-falso')$q$, 'impacto: enlace falso no lee');
select pg_temp.expect_fail('select * from social_posts', 'impacto: anon sigue sin leer la tabla de publicaciones');
-- con periodos (capturas de Insights) manda el último periodo, no los días
reset role;
insert into ig_snapshots (kind, key, data) values
  ('period', '2026-09-01_2026-09-30', '{"views": 1000, "interactions": 10, "viewers": 300, "net_follows": 3, "ages": {"35-44": 30}, "posts": [{"t": "x"}]}'),
  ('period', '2026-10-01_2026-10-31', '{"views": 4200, "interactions": 85, "viewers": 900, "net_follows": 12}') on conflict (kind, key) do update set data = excluded.data;
set role anon;
select pg_temp.check((select count(*) filter (where r->>'kind' = 'period') = 2 and count(*) filter (where r->>'kind' = 'day') >= 3 and count(*) filter (where r->>'kind' = 'account') = 1 and bool_and(not (r->'data' ? 'ages') and not (r->'data' ? 'posts')) from jsonb_array_elements(runner_social_impact('codigo-valorador-dos-02')->'ig_rows') r), 'impacto: entrega días y periodos (sin audiencia ni publicaciones) y los seguidores');
reset role;
delete from ig_snapshots where kind = 'period' and key in ('2026-09-01_2026-09-30', '2026-10-01_2026-10-31');
set role anon;

-- cualquier corredor marca (y reabre) una carrera como suspendida
reset role;
insert into registrations (id, name, date) values ('20000000-0000-0000-0000-0000000000a7', 'Suspendible Ajena', current_date + 4);
set role anon;
select runner_set_suspended('codigo-valorador-dos-02', '20000000-0000-0000-0000-0000000000a7', true);
reset role;
select pg_temp.check((select suspended from registrations where id = '20000000-0000-0000-0000-0000000000a7'), 'suspender: cualquier corredor la marca como suspendida');
set role anon;
select runner_set_suspended('codigo-valorador-uno-01', '20000000-0000-0000-0000-0000000000a7', false);
reset role;
select pg_temp.check(not (select suspended from registrations where id = '20000000-0000-0000-0000-0000000000a7'), 'suspender: otro corredor la reabre');
set role anon;
select pg_temp.expect_fail($q$select runner_set_suspended('codigo-falso', '20000000-0000-0000-0000-0000000000a7', true)$q$, 'suspender: enlace falso no puede');
select pg_temp.expect_fail($q$select runner_set_suspended('codigo-valorador-dos-02', '20000000-0000-0000-0000-0000000000ff', true)$q$, 'suspender: carrera inexistente');
-- turnos: el corredor ve solo su escamot; la dirección lo fija; valores raros se rechazan
reset role;
update runners set shift_group = 'E4' where code = 'codigo-valorador-dos-02';
set role anon;
select pg_temp.check(runner_my_shift('codigo-valorador-dos-02') = 'E4', 'turnos: el corredor ve su escamot');
select pg_temp.check(runner_my_shift('codigo-valorador-uno-01') is null, 'turnos: sin escamot devuelve vacío');
select pg_temp.expect_fail($q$select runner_my_shift('codigo-falso')$q$, 'turnos: enlace falso no lee');
select pg_temp.expect_fail($q$select shift_group from runners$q$, 'turnos: anon no lee la tabla de corredores');
reset role;
select pg_temp.expect_fail($q$update runners set shift_group = 'E9' where code = 'codigo-valorador-dos-02'$q$, 'turnos: escamot inválido rechazado');
update runners set shift_group = null where code = 'codigo-valorador-dos-02';
set role anon;
-- turnos: solo los habilitados por la dirección eligen su escamot (y solo el suyo)
select pg_temp.expect_fail($q$select runner_set_my_shift('codigo-valorador-dos-02', 'E2')$q$, 'turnos propios: sin habilitar no puede elegir');
select pg_temp.check((runner_shift_info('codigo-valorador-dos-02')->>'enabled')::boolean = false, 'turnos propios: por defecto no está habilitado');
reset role;
update runners set shift_enabled = true where code = 'codigo-valorador-dos-02';
set role anon;
select runner_set_my_shift('codigo-valorador-dos-02', 'E2');
select pg_temp.check(runner_my_shift('codigo-valorador-dos-02') = 'E2' and runner_shift_info('codigo-valorador-dos-02') = '{"enabled": true, "group": "E2"}'::jsonb, 'turnos propios: el habilitado elige su escamot');
select pg_temp.check(runner_my_shift('codigo-valorador-uno-01') is null, 'turnos propios: no toca el de otro corredor');
select runner_set_my_shift('codigo-valorador-dos-02', '');
select pg_temp.check(runner_my_shift('codigo-valorador-dos-02') is null, 'turnos propios: se puede quitar');
select pg_temp.expect_fail($q$select runner_set_my_shift('codigo-valorador-dos-02', 'E7')$q$, 'turnos propios: escamot inválido rechazado');
select pg_temp.expect_fail($q$select runner_set_my_shift('codigo-falso', 'E1')$q$, 'turnos propios: enlace falso no escribe');
select pg_temp.expect_fail($q$select runner_shift_info('codigo-falso')$q$, 'turnos propios: enlace falso no lee');
reset role;
update runners set shift_enabled = false where code = 'codigo-valorador-dos-02';
set role anon;
-- coche compartido: solo inscritos, plazas limitadas, un coche por carrera y limpieza al borrarse de la carrera
reset role;
insert into runners (id, name, code) values ('10000000-0000-0000-0000-0000000000c3', 'Pere Coche', 'CARPERE00001'), ('10000000-0000-0000-0000-0000000000c7', 'Anna Coche', 'CARANNA00001'), ('10000000-0000-0000-0000-0000000000c4', 'Dani Coche', 'CARDANI0001'), ('10000000-0000-0000-0000-0000000000c5', 'Eva Coche', 'CAREVA00001'), ('10000000-0000-0000-0000-0000000000c6', 'Fer Fuera', 'CARFER00001');
insert into registrations (id, name, date, modality) values ('20000000-0000-0000-0000-0000000000c1', 'Cursa del Coche', current_date + 10, 'Carretera'), ('20000000-0000-0000-0000-0000000000c2', 'Cursa Pasada', current_date - 3, 'Carretera');
insert into registration_entries (registration_id, runner_id) values
  ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c3'), ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c7'),
  ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c4'), ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c5'),
  ('20000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c3');
set role anon;
select runner_car_save('CARPERE00001', '20000000-0000-0000-0000-0000000000c1', 2, 'Monzón, plaza', '7:00', 'Sin parar');
select pg_temp.check((select (c->>'seats')::int = 2 and c->>'driver' = 'Pere Coche' and c->>'from' = 'Monzón, plaza' and c->>'depart' = '7:00' from jsonb_array_elements(runner_cars('CARDANI0001')) c where c->>'reg' = '20000000-0000-0000-0000-0000000000c1'), 'coche: lo ofrece un inscrito y lo ven los demás');
select pg_temp.expect_fail($q$select runner_car_save('CARFER00001', '20000000-0000-0000-0000-0000000000c1', 3, null, null, null)$q$, 'coche: no inscrito no puede ofrecer');
select pg_temp.expect_fail($q$select runner_car_save('CARPERE00001', '20000000-0000-0000-0000-0000000000c2', 3, null, null, null)$q$, 'coche: no en carreras ya pasadas');
select pg_temp.expect_fail($q$select runner_car_save('CARPERE00001', '20000000-0000-0000-0000-0000000000c1', 9, null, null, null)$q$, 'coche: máximo 8 plazas');
select pg_temp.expect_fail($q$select runner_car_save('XXXXXXXXXXXX', '20000000-0000-0000-0000-0000000000c1', 3, null, null, null)$q$, 'coche: enlace falso no escribe');
select runner_car_join('CARANNA00001', (select (c->>'id')::uuid from jsonb_array_elements(runner_cars('CARANNA00001')) c limit 1));
select runner_car_join('CARDANI0001', (select (c->>'id')::uuid from jsonb_array_elements(runner_cars('CARANNA00001')) c limit 1));
select pg_temp.check((select jsonb_array_length(c->'riders') = 2 from jsonb_array_elements(runner_cars('CARANNA00001')) c limit 1), 'coche: dos inscritos se apuntan');
select pg_temp.expect_fail($q$select runner_car_join('CAREVA00001', (select (c->>'id')::uuid from jsonb_array_elements(runner_cars('CARANNA00001')) c limit 1))$q$, 'coche: lleno');
select pg_temp.expect_fail($q$select runner_car_join('CARFER00001', (select (c->>'id')::uuid from jsonb_array_elements(runner_cars('CARANNA00001')) c limit 1))$q$, 'coche: no inscrito no se apunta');
select pg_temp.expect_fail($q$select runner_car_join('CARPERE00001', (select (c->>'id')::uuid from jsonb_array_elements(runner_cars('CARANNA00001')) c limit 1))$q$, 'coche: el conductor no se apunta a su coche');
select pg_temp.expect_fail($q$select runner_car_save('CARPERE00001', '20000000-0000-0000-0000-0000000000c1', 1, null, null, null)$q$, 'coche: no puede reducir las plazas por debajo de los apuntados');
select runner_car_save('CAREVA00001', '20000000-0000-0000-0000-0000000000c1', 3, 'Fraga', '7:30', null);
select runner_car_join('CARDANI0001', (select (c->>'id')::uuid from jsonb_array_elements(runner_cars('CARANNA00001')) c where c->>'driver' = 'Eva Coche'));
select pg_temp.check((select count(*) = 1 from (select r from jsonb_array_elements(runner_cars('CARANNA00001')) c, jsonb_array_elements(c->'riders') r where r->>'name' = 'Dani Coche') x), 'coche: solo en un coche por carrera (cambia de uno a otro)');
select runner_car_leave('CARDANI0001', '20000000-0000-0000-0000-0000000000c1');
select pg_temp.check((select count(*) = 0 from jsonb_array_elements(runner_cars('CARANNA00001')) c, jsonb_array_elements(c->'riders') r where r->>'name' = 'Dani Coche'), 'coche: puede salir');
select runner_car_delete('CARPERE00001', '20000000-0000-0000-0000-0000000000c1');
select pg_temp.check((select count(*) = 1 from jsonb_array_elements(runner_cars('CARANNA00001'))), 'coche: quitarlo lo borra');
reset role;
select pg_temp.check((select count(*) = 0 from car_riders where runner_id = '10000000-0000-0000-0000-0000000000c7'), 'coche: sus pasajeros se quedan sin plaza');
delete from registration_entries where registration_id = '20000000-0000-0000-0000-0000000000c1' and runner_id = '10000000-0000-0000-0000-0000000000c5';
select pg_temp.check((select count(*) = 0 from car_offers), 'coche: si el conductor se borra de la carrera, su coche desaparece');
set role anon;
select pg_temp.expect_fail('select * from car_offers', 'coche: anon no lee las tablas');
-- limpieza de datos antiguos (solo dirección): borra hasta el año elegido y conserva lo posterior y las carreras que se prolongan al año siguiente
reset role;
insert into races (id, name, date, end_date, modality) values
  ('30000000-0000-0000-0000-0000000000f1', 'Purga Antigua', '2023-05-01', null, 'Carretera'), ('30000000-0000-0000-0000-0000000000f2', 'Purga Continua', '2024-12-30', '2025-01-02', 'Carretera'),
  ('30000000-0000-0000-0000-0000000000f3', 'Purga 2025', '2025-06-01', null, 'Carretera'), ('30000000-0000-0000-0000-0000000000f4', 'Purga Dic2024', '2024-12-10', null, 'Carretera');
insert into results (race_id, runner_id, runner_name, position) select id, '10000000-0000-0000-0000-0000000000c3', 'Pere Coche', 5 from races where name like 'Purga%';
insert into registrations (id, name, date, modality) values ('20000000-0000-0000-0000-0000000000f5', 'Purga Insc 2024', '2024-11-01', 'Carretera'), ('20000000-0000-0000-0000-0000000000f6', 'Purga Insc futura', '2099-03-01', 'Carretera');
insert into registration_entries (registration_id, runner_id) values ('20000000-0000-0000-0000-0000000000f5', '10000000-0000-0000-0000-0000000000c3'), ('20000000-0000-0000-0000-0000000000f6', '10000000-0000-0000-0000-0000000000c3');
insert into car_offers (registration_id, driver_id, seats) values ('20000000-0000-0000-0000-0000000000f5', '10000000-0000-0000-0000-0000000000c3', 2);
insert into runner_entry_notes (runner_id, registration_id, note) values ('10000000-0000-0000-0000-0000000000c3', '20000000-0000-0000-0000-0000000000f5', 'hotel');
insert into chronicles (runner_id, race_key) values ('10000000-0000-0000-0000-0000000000c3', '2024-12-10|purga dic2024'), ('10000000-0000-0000-0000-0000000000c3', '2025-06-01|purga 2025');
insert into social_posts (key) values ('2024-12-10|purga dic2024'), ('res|2024-12-10|purga dic2024'), ('2025-06-01|purga 2025');
insert into circuit_podiums (runner_id, year, circuit, position) values ('10000000-0000-0000-0000-0000000000c3', 2024, 'Circuito Purga', 1), ('10000000-0000-0000-0000-0000000000c3', 2025, 'Circuito Purga', 2);
insert into change_log (at, actor, entity, action, summary) values ('2024-05-05', 'Test', 'race', 'x', 'purga vieja'), (now(), 'Test', 'race', 'x', 'purga reciente');
set role anon;
select pg_temp.expect_fail($q$select admin_purge_counts(2024)$q$, 'limpieza: anónimo no puede');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ee', false);
select pg_temp.expect_fail($q$select admin_purge(2024, array['races'])$q$, 'limpieza: un usuario sin ser dirección no puede');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.check((admin_purge_counts(2024)->>'races')::int >= 2 and (admin_purge_counts(2024)->>'regs')::int >= 1 and (admin_purge_counts(2024)->>'cars')::int = 1 and (admin_purge_counts(2024)->>'notes')::int = 1 and (admin_purge_counts(2024)->>'circuits')::int = 1, 'limpieza: la vista previa cuenta lo que se borraría');
select pg_temp.check(exists (select 1 from races where name = 'Purga Antigua'), 'limpieza: la vista previa no borra nada');
select pg_temp.expect_fail($q$select admin_purge(2024, array['todo'])$q$, 'limpieza: categoría desconocida rechazada');
select pg_temp.expect_fail($q$select admin_purge(1900, array['races'])$q$, 'limpieza: año no válido rechazado');
-- solo marcas: las carreras siguen
select admin_purge(2024, array['marks']);
select pg_temp.check(exists (select 1 from races where name = 'Purga Antigua') and not exists (select 1 from chronicles where race_key like '2024-12-10%') and exists (select 1 from chronicles where race_key like '2025-06-01%'), 'limpieza: solo las marcas, y solo las de hasta 2024');
select pg_temp.check(not exists (select 1 from social_posts where key like '%2024-12-10%') and exists (select 1 from social_posts where key like '2025-06-01%'), 'limpieza: publicaciones marcadas, hasta 2024');
-- todo
select admin_purge(2024, array['races','regs','marks','log']);
select pg_temp.check(not exists (select 1 from races where name in ('Purga Antigua', 'Purga Dic2024')), 'limpieza: borra las carreras de hasta 2024');
select pg_temp.check(exists (select 1 from races where name = 'Purga Continua') and exists (select 1 from races where name = 'Purga 2025'), 'limpieza: conserva la que se prolonga a 2025 y las de después');
select pg_temp.check(not exists (select 1 from results x join races r on r.id = x.race_id where r.name in ('Purga Antigua', 'Purga Dic2024')) and exists (select 1 from results x join races r on r.id = x.race_id where r.name = 'Purga Continua'), 'limpieza: sus resultados siguen a su carrera');
select pg_temp.check(not exists (select 1 from registrations where name = 'Purga Insc 2024') and exists (select 1 from registrations where name = 'Purga Insc futura'), 'limpieza: inscripciones antiguas fuera, futuras se quedan');
reset role;
select pg_temp.check((select count(*) from car_offers where registration_id = '20000000-0000-0000-0000-0000000000f5') = 0 and (select count(*) from runner_entry_notes where registration_id = '20000000-0000-0000-0000-0000000000f5') = 0, 'limpieza: coches y notas de las inscripciones borradas se van con ellas');
select pg_temp.check(not exists (select 1 from circuit_podiums where circuit = 'Circuito Purga' and year = 2024) and exists (select 1 from circuit_podiums where circuit = 'Circuito Purga' and year = 2025), 'limpieza: podios de circuito hasta 2024');
select pg_temp.check(not exists (select 1 from change_log where summary = 'purga vieja') and exists (select 1 from change_log where summary = 'purga reciente') and exists (select 1 from change_log where entity = 'purga' and summary like 'borró datos hasta 2024%'), 'limpieza: historial antiguo fuera, el reciente y el aviso de la propia limpieza se quedan');
reset role;
update runners set kit_jersey = 'M', kit_bibs = 'L' where code = 'codigo-valorador-dos-02';
set role anon;
select pg_temp.check(runner_my_kit('codigo-valorador-dos-02') = '{"jersey": "M", "bibs": "L", "socks": null}'::jsonb, 'ropa: el corredor ve sus tallas');
select pg_temp.check(runner_my_kit('codigo-valorador-uno-01') = '{"jersey": null, "bibs": null, "socks": null}'::jsonb, 'ropa: sin tallas devuelve vacío');
select pg_temp.expect_fail($q$select runner_my_kit('codigo-falso')$q$, 'ropa: enlace falso no lee');
select pg_temp.expect_fail($q$select kit_jersey from runners$q$, 'ropa: anónimo no lee la tabla');
select runner_chronicle_send('codigo-valorador-dos-02', '2026-03-01|cronica test', 'Cronica Test', '2026-03-01', 'Una cronica de prueba', 'AAAA', 'BBBB');
select pg_temp.check((select (j->0->>'body') = 'Una cronica de prueba' and (j->0->>'status') = 'enviada' and (j->0->>'photos')::int = 2 from (select runner_chronicle_posts('codigo-valorador-dos-02') j) q), 'cronicas: el corredor ve la suya con 2 fotos');
select pg_temp.check(runner_chronicle_posts('codigo-valorador-uno-01') = '[]'::jsonb, 'cronicas: no ve las de otro');
select pg_temp.check(runner_chronicles('codigo-valorador-dos-02') ? '2026-03-01|cronica test', 'cronicas: al enviarla queda como pasada');
select runner_chronicle_send('codigo-valorador-dos-02', '2026-03-01|cronica test', 'Cronica Test', '2026-03-01', 'Texto corregido', null, null);
select pg_temp.check((select (j->0->>'body') = 'Texto corregido' and (j->0->>'photos')::int = 2 from (select runner_chronicle_posts('codigo-valorador-dos-02') j) q), 'cronicas: editar el texto conserva las fotos');
select pg_temp.expect_fail($q$select runner_chronicle_send('codigo-falso', 'k-123', 'x', null, 'texto', null, null)$q$, 'cronicas: enlace falso no envia');
select pg_temp.expect_fail($q$select runner_chronicle_send('codigo-valorador-dos-02', 'k-123', 'x', null, '   ', null, null)$q$, 'cronicas: texto vacio no vale');
select pg_temp.expect_fail($q$select count(*) from chronicle_photos$q$, 'cronicas: el anonimo no lee las fotos');
select pg_temp.expect_fail($q$select count(*) from chronicle_posts$q$, 'cronicas: el anonimo no lee la tabla');
reset role;
update chronicle_posts set status = 'lista' where race_key = '2026-03-01|cronica test';
set role anon;
select pg_temp.expect_fail($q$select runner_chronicle_send('codigo-valorador-dos-02', '2026-03-01|cronica test', 'x', null, 'cambio tardio', null, null)$q$, 'cronicas: ya revisada, el corredor no la cambia');
reset role;
-- ===== Corrección automática de crónicas =====
insert into settings (key, value) values ('sponsors', '{"handles": ["@patro_uno", "@patro_dos"]}') on conflict (key) do update set value = excluded.value;
set role anon;
select runner_chronicle_send('codigo-valorador-dos-02', '2026-04-01|ia sin clave', 'Carrera IA', '2026-04-01', 'Sin clave no se manda nada', 'AAAA', null);
reset role;
select pg_temp.check((select ai_state is null and ai_req is null from chronicle_posts where race_key = '2026-04-01|ia sin clave'), 'ia: sin clave en Vault no se manda nada');
insert into vault.decrypted_secrets values ('anthropic_key', 'sk-test-123');
set role anon;
select runner_chronicle_send('codigo-valorador-dos-02', '2026-04-02|ia con clave', 'Carrera IA 2', '2026-04-02', 'Mi cronica con faltas de ortografia', 'AAAA', null);
reset role;
select pg_temp.check((select ai_state = 'pendiente' and ai_req is not null and ai_tries = 1 from chronicle_posts where race_key = '2026-04-02|ia con clave'), 'ia: al enviar la crónica se manda a Claude');
select pg_temp.check((select headers->>'x-api-key' = 'sk-test-123' and url = 'https://api.anthropic.com/v1/messages' and body->>'model' = 'claude-sonnet-5-5' and body::text like '%@patro_uno%' and body::text like '%Mi cronica con faltas%' from net.calls order by id desc limit 1), 'ia: petición con clave, modelo, texto y etiquetas');
select pg_temp.check((select body::text not like '%Valorador Dos%' from net.calls order by id desc limit 1), 'ia: solo se manda el nombre de pila');
insert into net._http_response select ai_req, 200, '{"content":[{"type":"text","text":"Mi crónica corregida.\n\n@patro_uno @patro_dos"}]}', null from chronicle_posts where race_key = '2026-04-02|ia con clave';
set role anon;
select pg_temp.expect_fail($q$select admin_chronicle_ai_collect()$q$, 'ia: el anónimo no recoge respuestas');
select pg_temp.expect_fail($q$select chronicle_ai_queue('00000000-0000-0000-0000-000000000000')$q$, 'ia: el anónimo no manda peticiones');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.check(admin_chronicle_ai_collect() = 1, 'ia: dirección recoge la respuesta');
select pg_temp.check((select ai_state = 'hecho' and final_text like 'Mi crónica corregida.%' from chronicle_posts where race_key = '2026-04-02|ia con clave'), 'ia: el texto corregido queda como texto final');
select set_config('request.jwt.claim.sub', '', false);
reset role;
update chronicle_posts set final_text = 'Texto de dirección' where race_key = '2026-04-02|ia con clave';
set role anon;
select runner_chronicle_send('codigo-valorador-dos-02', '2026-04-02|ia con clave', 'Carrera IA 2', '2026-04-02', 'Cronica editada otra vez', null, null);
select runner_chronicle_send('codigo-valorador-dos-02', '2026-04-02|ia con clave', 'Carrera IA 2', '2026-04-02', 'Cronica editada tres', null, null);
select runner_chronicle_send('codigo-valorador-dos-02', '2026-04-02|ia con clave', 'Carrera IA 2', '2026-04-02', 'Cronica editada cuatro', null, null);
reset role;
select pg_temp.check((select ai_tries = 3 from chronicle_posts where race_key = '2026-04-02|ia con clave'), 'ia: máximo 3 peticiones por crónica');
select pg_temp.check((select final_text = 'Texto de dirección' from chronicle_posts where race_key = '2026-04-02|ia con clave'), 'ia: nunca pisa el texto que dirección ya puso');
update chronicle_posts set status = 'lista' where race_key = '2026-04-02|ia con clave';
select pg_temp.check((select count(*) from net.calls) = 3, 'ia: ya revisada no se vuelve a mandar');
-- los datos de la carrera y del resultado viajan con la crónica
insert into vault.decrypted_secrets values ('anthropic_key', 'sk-test-123');
insert into races (id, name, date, place, province, modality, km, elevation) values ('00000000-0000-0000-0000-0000000000d1', 'Carrera Datos', '2026-05-01', 'Lleida', 'Lleida', 'BTT', 70, 1200);
insert into results (race_id, runner_id, runner_name, category, position, general_position, time_seconds)
  select '00000000-0000-0000-0000-0000000000d1', id, name, 'M40', case when code = 'codigo-valorador-dos-02' then 3 else 1 end, case when code = 'codigo-valorador-dos-02' then 12 else null end, case when code = 'codigo-valorador-dos-02' then 9005 else 8000 end
  from runners where code in ('codigo-valorador-dos-02', 'codigo-valorador-uno-01');
set role anon;
select runner_chronicle_send('codigo-valorador-dos-02', '2026-05-01|carrera datos', 'Carrera Datos', '2026-05-01', 'Lo pase fatal en la subida pero acabe feliz', null, null);
reset role;
select pg_temp.check((select (body #>> '{messages,0,content}') like '%Lugar: Lleida, Lleida%' and (body #>> '{messages,0,content}') like '%Distancia: 70.0 km%' and (body #>> '{messages,0,content}') like '%Puesto en su categoría: 3º%' and (body #>> '{messages,0,content}') like '%Puesto en la general: 12º%' and (body #>> '{messages,0,content}') like '%Tiempo: 2:30:05%' from net.calls order by id desc limit 1), 'ia: la petición lleva lugar, distancia, puestos y tiempo');
select pg_temp.check((select (body #>> '{messages,0,content}') like '%Otros del club en la carrera (1): % (M40, 1º)%' and (body #>> '{messages,0,content}') like '%Lo pase fatal%' from net.calls order by id desc limit 1), 'ia: lleva a los compañeros del club y lo que cuenta el corredor');
delete from vault.decrypted_secrets;
set role anon;
reset role;
-- ===== Crónica con los resultados del grupo =====
insert into runners (id, name, code) values ('10000000-0000-0000-0000-0000000000a3', 'Grupo Tres', 'codigo-grupo-tres-03');
insert into registrations (id, name, date) values ('20000000-0000-0000-0000-0000000000a1', 'Carrera Grupo', current_date - 3);
insert into registration_entries (registration_id, runner_id, category)
  select '20000000-0000-0000-0000-0000000000a1', id, 'M40' from runners where code in ('codigo-valorador-uno-01', 'codigo-valorador-dos-02');
update registration_entries set self_position = 5, self_general_position = 20, self_time_seconds = 7000
 where registration_id = '20000000-0000-0000-0000-0000000000a1' and runner_id = (select id from runners where code = 'codigo-valorador-dos-02');
set role anon;
select pg_temp.check(jsonb_array_length(runner_race_group('codigo-valorador-dos-02', 'reg', '20000000-0000-0000-0000-0000000000a1')) = 2 and (runner_race_group('codigo-valorador-dos-02', 'reg', '20000000-0000-0000-0000-0000000000a1')->0->>'me')::boolean, 'grupo: ve a los del club en la carrera, el primero soy yo');
select pg_temp.expect_fail($q$select runner_race_group('codigo-grupo-tres-03', 'reg', '20000000-0000-0000-0000-0000000000a1')$q$, 'grupo: quien no corrió no ve el grupo');
select pg_temp.expect_fail($q$select runner_chronicle_send('codigo-grupo-tres-03', '2026-01-01|carrera grupo', 'Carrera Grupo', null, 'texto de prueba', null, null, 'reg', '20000000-0000-0000-0000-0000000000a1', '[]')$q$, 'grupo: quien no corrió no manda resultados');
select pg_temp.expect_fail($q$select runner_chronicle_send('codigo-valorador-dos-02', '2026-01-01|carrera grupo', 'Carrera Grupo', null, 'texto de prueba', null, null, 'reg', '20000000-0000-0000-0000-0000000000a1', jsonb_build_array(jsonb_build_object('runner_id', '10000000-0000-0000-0000-0000000000a3', 'position', 9, 'general', 3, 'time', 7000)))$q$, 'grupo: la general no puede ser mejor que el puesto');
reset role;
select id as uno_id from runners where code = 'codigo-valorador-uno-01' \gset
select id as dos_id from runners where code = 'codigo-valorador-dos-02' \gset
set role anon;
select runner_chronicle_send('codigo-valorador-dos-02', '2026-01-01|carrera grupo', 'Carrera Grupo', null, 'La crónica de todos', null, null, 'reg', '20000000-0000-0000-0000-0000000000a1',
  jsonb_build_array(jsonb_build_object('runner_id', :'uno_id'::text, 'position', 1, 'general', 4, 'time', 6500), jsonb_build_object('runner_id', :'dos_id'::text, 'position', 1, 'general', 4, 'time', 6500)));
reset role;
select pg_temp.check((select self_position = 1 and self_general_position = 4 and self_time_seconds = 6500 from registration_entries where registration_id = '20000000-0000-0000-0000-0000000000a1' and runner_id = (select id from runners where code = 'codigo-valorador-uno-01')), 'grupo: al enviar la crónica queda puesto el resultado del compañero');
select pg_temp.check((select self_position = 5 and self_time_seconds = 7000 from registration_entries where registration_id = '20000000-0000-0000-0000-0000000000a1' and runner_id = (select id from runners where code = 'codigo-valorador-dos-02')), 'grupo: nunca pisa un resultado ya puesto ni el del propio autor');
select pg_temp.check(exists (select 1 from change_log where summary like 'puso el resultado de Valorador Uno: 1º en Carrera Grupo'), 'grupo: queda anotado en el historial quién lo puso');
reset role;
-- plazo de 2 días: no se pueden poner los resultados de otros si la carrera fue ayer
insert into registrations (id, name, date) values ('20000000-0000-0000-0000-0000000000c9', 'Carrera Reciente', current_date - 1);
insert into registration_entries (registration_id, runner_id, category)
  select '20000000-0000-0000-0000-0000000000c9', id, 'M40' from runners where code in ('codigo-valorador-uno-01', 'codigo-valorador-dos-02');
set role anon;
select pg_temp.expect_fail(format($q$select runner_chronicle_send('codigo-valorador-dos-02', 'k-reciente', 'Carrera Reciente', null, 'texto de prueba', null, null, 'reg', '20000000-0000-0000-0000-0000000000c9', jsonb_build_array(jsonb_build_object('runner_id', %L, 'position', 2, 'general', 6, 'time', 7000)))$q$, :'uno_id'), 'plazo: los 2 primeros días cada uno pone su resultado');
select runner_chronicle_send('codigo-valorador-dos-02', 'k-reciente', 'Carrera Reciente', null, 'texto de prueba', null, null, 'reg', '20000000-0000-0000-0000-0000000000c9', '[]');
select pg_temp.check(true, 'plazo: sin resultados de otros se puede enviar');
set role anon;
set role anon;
\echo TODAS LAS PRUEBAS SQL OK
