-- ============================================================
--  UPTEMPO — 003_test_aislamiento.sql
--
--  Prueba que un cliente NO puede ver los datos de otro.
--  Es la prueba que importa: adentro de conversaciones hay
--  datos de salud, y "un link secreto" no es aislamiento.
--
--  Todo corre dentro de una transaccion que termina en ROLLBACK.
--  No deja una sola fila. Se puede correr en produccion cuando
--  quieras, incluso con clientes reales adentro.
--
--  Correr entero, de una, en el SQL Editor.
-- ============================================================

begin;

-- ------------------------------------------------------------
--  Dos clinicas de prueba con ids fijos, dos duenos, y datos
--  de cada una.
-- ------------------------------------------------------------
insert into public.clientes (id, slug, nombre, estado) values
  ('11111111-1111-4111-8111-111111111111','test-clinica-a','Clinica A de prueba','demo'),
  ('22222222-2222-4222-8222-222222222222','test-clinica-b','Clinica B de prueba','demo');

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','duenoa@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','duenob@test.local');

insert into public.usuarios_panel (cliente_id, user_id, email) values
  ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','duenoa@test.local'),
  ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','duenob@test.local');

insert into public.conversaciones (cliente_id, canal, telefono_hash) values
  ('11111111-1111-4111-8111-111111111111','web','hash-de-a'),
  ('22222222-2222-4222-8222-222222222222','web','hash-de-b');

insert into public.eventos (cliente_id, tipo, origen) values
  ('11111111-1111-4111-8111-111111111111','consulta','web'),
  ('22222222-2222-4222-8222-222222222222','consulta','web');

-- ------------------------------------------------------------
--  PRUEBA 1 — el dueno de A
--  Las cinco columnas tienen que dar TRUE.
-- ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

select
  'dueno de A' as quien,
  (select count(*) from public.conversaciones
     where cliente_id = '11111111-1111-4111-8111-111111111111') = 1 as ok_ve_su_conversacion,
  (select count(*) from public.conversaciones
     where cliente_id = '22222222-2222-4222-8222-222222222222') = 0 as ok_no_ve_la_ajena,
  (select count(*) from public.eventos
     where cliente_id = '22222222-2222-4222-8222-222222222222') = 0 as ok_no_ve_eventos_ajenos,
  (select count(*) from public.clientes
     where id = '22222222-2222-4222-8222-222222222222') = 0 as ok_no_ve_al_otro_negocio,
  (select count(*) from public.usuarios_panel) = 1 as ok_solo_su_propio_usuario;

-- ------------------------------------------------------------
--  PRUEBA 2 — el dueno de B, el espejo exacto
-- ------------------------------------------------------------
set local role none;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';

select
  'dueno de B' as quien,
  (select count(*) from public.conversaciones
     where cliente_id = '22222222-2222-4222-8222-222222222222') = 1 as ok_ve_su_conversacion,
  (select count(*) from public.conversaciones
     where cliente_id = '11111111-1111-4111-8111-111111111111') = 0 as ok_no_ve_la_ajena,
  (select count(*) from public.eventos
     where cliente_id = '11111111-1111-4111-8111-111111111111') = 0 as ok_no_ve_eventos_ajenos,
  (select count(*) from public.clientes
     where id = '11111111-1111-4111-8111-111111111111') = 0 as ok_no_ve_al_otro_negocio,
  (select count(*) from public.usuarios_panel) = 1 as ok_solo_su_propio_usuario;

-- ------------------------------------------------------------
--  PRUEBA 3 — sin sesion (anon). Tiene que ver CERO de todo,
--  salvo feriados, que no tienen nada sensible.
-- ------------------------------------------------------------
set local role none;
set local role anon;
set local request.jwt.claims = '';

select
  'sin sesion' as quien,
  (select count(*) from public.feriados) > 0 as ok_ve_feriados;

-- Un anon consultando conversaciones tiene que fallar por permisos
-- o devolver cero. Se prueba aparte para que el error no corte el script:
--   set local role anon;
--   select count(*) from public.conversaciones;   -- permission denied

set local role none;

-- ------------------------------------------------------------
--  Nada de esto queda.
-- ------------------------------------------------------------
rollback;
