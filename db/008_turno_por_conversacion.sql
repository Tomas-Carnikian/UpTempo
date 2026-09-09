-- ============================================================
--  008 — Encontrar el turno por la conversación
--
--  Cuando alguien toca "Confirmar" en el recordatorio, o pide
--  cambiar el turno, hay que saber DE CUÁL turno habla. Hasta ahora
--  eso se buscaba por `telefono_hash`, y el 8/9 falló en los dos
--  casos con un turno real:
--
--    Confirmar          → "Listo, gracias por avisar."  (texto de
--                          descarte; el turno quedó en 'agendado')
--    Necesito cambiarlo → derivó a una persona
--
--  El motivo: `telefono_hash` es el hash del número TAL COMO SE
--  ESCRIBIÓ. Un turno agendado dictando "095023935" y una
--  conversación de WhatsApp, donde Meta manda "59895023935", dan
--  hashes distintos para la misma persona. Al escribir ya se
--  normaliza (normalizarTelefono en worker/src/db.ts), pero las
--  filas anteriores a ese arreglo quedaron con el hash viejo, y
--  ninguna migración las puede recalcular: el hash lleva pepper y
--  el pepper solo lo tiene el Worker.
--
--  La solución no toca los datos. `turnos.conversacion_id` ya
--  existe y ya se llena al agendar; el código ahora busca por ahí
--  primero y deja el teléfono como segundo intento (turno agendado
--  por el chat web y retomado por WhatsApp, o una madre que reserva
--  a nombre de la hija). Esta migración solo agrega el índice para
--  que esa búsqueda no recorra la tabla.
-- ============================================================

create index if not exists turnos_conversacion_idx
  on public.turnos (conversacion_id, inicio)
  where estado in ('agendado','confirmado');

comment on column public.turnos.conversacion_id is
  'Hilo donde se agendó el turno. Es la forma exacta de saber de qué turno '
  'habla alguien que contesta un recordatorio: el teléfono puede estar '
  'escrito de dos maneras, la conversación no.';

-- Control: los turnos futuros que NO se pueden encontrar por
-- conversación. Deberían ser solo los cargados a mano.
select estado,
       count(*) filter (where conversacion_id is null) as sin_conversacion,
       count(*)                                        as total
from public.turnos
where inicio >= now()
group by estado
order by estado;
