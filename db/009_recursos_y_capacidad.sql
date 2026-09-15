-- ============================================================
--  UPTEMPO — 009_recursos_y_capacidad.sql
--
--  POR QUE EXISTE
--
--  Hasta acá la agenda asumía UN solo recurso por negocio: la
--  disponibilidad salía de "¿hay algún turno o algún evento pisando
--  este hueco?". Para un consultorio de un sillón está bien. Para una
--  clínica de depilación con dos camillas está mal en la dirección
--  peor: una clienta a las 11:00 bloquea las 11:00 para todo el mundo,
--  y el asistente le dice "no hay lugar" a gente que sí tenía lugar.
--  Todos los días, y el dueño lo ve en la primera semana.
--
--  LA IDEA, EN DOS LINEAS
--
--  La capacidad NO va en el servicio: va en el RECURSO.
--  Un recurso es un puesto de trabajo con una cantidad ("Camillas: 2",
--  "Puesto de uñas: 1"). Es anónimo a propósito: nadie reserva LA
--  camilla 2, reserva "una camilla". Un servicio consume un recurso, y
--  dos servicios que consumen el mismo recurso compiten entre sí.
--
--  Eso es lo que resuelve el caso que motivó todo esto: depilación y
--  masaje pelean por las mismas camillas, uñas no pelea con ninguno
--  de los dos.
--
--  LA REGLA DEL NULL — importa, y es la que hace que nada se rompa
--
--  `servicios.recurso_id` y `turnos.recurso_id` en NULL significan
--  "ocupa el negocio entero". De ahí sale que:
--
--    * Un cliente SIN ninguna fila en `recursos` se comporta EXACTO
--      como hoy: todos sus servicios son NULL, todos sus turnos se
--      bloquean entre sí, capacidad 1. Ninguna fila existente cambia
--      de sentido y no hay nada que migrar.
--
--    * Un cliente CON recursos donde alguien se olvidó de asignarle
--      recurso a un servicio: ese servicio bloquea todo. Sobre-bloquea
--      en vez de sobre-vender, que es el lado correcto del error —
--      se ve enseguida y no termina en dos clientas en la misma
--      camilla.
--
--  LO QUE ESTE MODELO NO EXPRESA
--
--  Un servicio que consume DOS recursos a la vez (una camilla Y el
--  aparato láser). Para eso hace falta una tabla intermedia
--  servicio_recursos con cantidad por línea. No se construye hasta que
--  un cliente que paga lo necesite: la migración es mecánica —una fila
--  por turno existente— y no se parece en nada al lío de telefono_hash,
--  donde el dato viejo era irrecuperable.
--
--  Tampoco expresa elegir profesional ("quiero con Ana"). Eso son
--  recursos CON identidad y es otro producto.
-- ============================================================

-- ── 1. Los recursos ─────────────────────────────────────────────
create table if not exists public.recursos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  nombre      text not null,
  -- Cuántos puestos de ese tipo hay. El tope de 50 no es técnico: es
  -- para que un cero de más en el alta no le abra la agenda entera.
  cantidad    int  not null default 1 check (cantidad between 1 and 50),
  -- Reservado para el día que un cliente quiera bloquear UN recurso
  -- desde Google Calendar en vez de bloquear todo el negocio. Hoy
  -- siempre null; ver la nota de "bloqueos del dueño" más abajo.
  calendar_id text,
  activo      boolean not null default true,
  orden       int  not null default 0,
  creado_en   timestamptz not null default now(),
  unique (cliente_id, nombre)
);

comment on table public.recursos is
  'Puestos de trabajo con cantidad: "Camillas: 2". Anonimos: no se reserva '
  'LA camilla 2, se reserva una camilla. La capacidad vive aca, no en el servicio.';
comment on column public.recursos.cantidad is
  'Cuantos turnos simultaneos admite este recurso. 1 = como se comportaba todo antes de 009.';
comment on column public.recursos.calendar_id is
  'Sin usar. El dia que se quiera un Google Calendar por recurso, el freeBusy '
  'acepta varios calendarios en UNA sola llamada, asi que no cuesta llamadas extra.';

create index if not exists recursos_cliente_idx
  on public.recursos (cliente_id, orden) where activo;

-- ── 2. Qué recurso consume cada servicio ────────────────────────
alter table public.servicios
  add column if not exists recurso_id uuid references public.recursos(id) on delete set null;

comment on column public.servicios.recurso_id is
  'Recurso que ocupa este servicio. NULL = ocupa el negocio entero (capacidad 1). '
  'Dos servicios con el mismo recurso compiten entre si; con recursos distintos, no.';

-- ── 3. Qué recurso ocupó cada turno ─────────────────────────────
--  Se guarda en el turno aunque se pueda deducir del servicio, por la
--  misma razón que servicio_nombre y buffer_min: si mañana el dueño
--  mueve un servicio de recurso, los turnos YA TOMADOS tienen que
--  seguir contando contra el recurso que ocupaban. Deducirlo al vuelo
--  reescribe el pasado.
alter table public.turnos
  add column if not exists recurso_id uuid references public.recursos(id) on delete set null;

comment on column public.turnos.recurso_id is
  'Congelado al agendar. NULL = este turno ocupa el negocio entero.';

-- El índice de la consulta nueva: "cuántos turnos de ESTE recurso
-- pisan este rato". Sin él, cada hueco evaluado recorre la tabla.
create index if not exists turnos_recurso_idx
  on public.turnos (cliente_id, recurso_id, inicio)
  where estado in ('agendado','confirmado');

-- ── 4. Verificación ─────────────────────────────────────────────
-- Después de correr esto, TODO tiene que seguir igual que antes:
-- ningún cliente tiene recursos, así que ningún servicio cambia.
select (select count(*) from public.recursos)                             as recursos,
       (select count(*) from public.servicios where recurso_id is not null) as servicios_con_recurso,
       (select count(*) from public.turnos    where recurso_id is not null) as turnos_con_recurso;

-- ── 5. Cómo se configura un cliente con dos camillas y uñas ─────
-- (ejemplo, no se ejecuta: cambiar el slug y los nombres)
--
--   insert into public.recursos (cliente_id, nombre, cantidad, orden)
--   select id, 'Camillas', 2, 1 from public.clientes where slug = 'ejemplo';
--   insert into public.recursos (cliente_id, nombre, cantidad, orden)
--   select id, 'Puesto de uñas', 1, 2 from public.clientes where slug = 'ejemplo';
--
--   update public.servicios s set recurso_id = r.id
--     from public.recursos r
--    where r.cliente_id = s.cliente_id and r.nombre = 'Camillas'
--      and s.cliente_id = (select id from public.clientes where slug = 'ejemplo')
--      and s.nombre ilike any (array['%depilacion%','%masaje%']);
--
-- Y el control que hay que mirar SIEMPRE después de configurar:
-- servicios agendables que quedaron sin recurso en un cliente que sí
-- tiene recursos. Cada uno de esos bloquea el negocio entero.
--
--   select c.slug, s.nombre
--     from public.servicios s
--     join public.clientes  c on c.id = s.cliente_id
--    where s.activo and s.agendable and s.recurso_id is null
--      and exists (select 1 from public.recursos r
--                   where r.cliente_id = s.cliente_id and r.activo);
