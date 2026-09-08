-- ============================================================
--  UPTEMPO — 004_buffer_en_turnos.sql
--
--  Por que existe esta migracion:
--  `servicios.buffer_min` son los minutos de respiro despues de un
--  turno (limpiar la cabina, que la clienta se vista). Se estaba
--  aplicando solo al turno que se esta por agendar, no a los que ya
--  estan. Resultado: si habia un turno de 13:00 a 14:00, el sistema
--  ofrecia el siguiente a las 14:00 en punto.
--
--  El buffer del turno se congela en la fila, igual que
--  servicio_nombre: si manana cambia el buffer del servicio, los
--  turnos ya agendados no se mueven.
-- ============================================================

alter table public.turnos
  add column if not exists buffer_min int not null default 0
    check (buffer_min >= 0);

comment on column public.turnos.buffer_min is
  'Minutos de respiro DESPUES de este turno. Congelado del servicio al agendar.';

-- Los turnos que ya existen heredan el buffer de su servicio.
update public.turnos t
   set buffer_min = s.buffer_min
  from public.servicios s
 where s.id = t.servicio_id
   and t.buffer_min = 0
   and s.buffer_min > 0;

-- Verificacion: el turno de prueba tiene que quedar con 10 minutos.
select servicio_nombre,
       to_char(inicio at time zone 'America/Montevideo','YYYY-MM-DD HH24:MI') as inicio_local,
       to_char(fin    at time zone 'America/Montevideo','HH24:MI')            as fin_local,
       buffer_min,
       to_char((fin + make_interval(mins => buffer_min)) at time zone 'America/Montevideo','HH24:MI') as libre_desde
  from public.turnos
 order by inicio;
