-- ============================================================
--  UPTEMPO — 002_seed_clinica_sole.sql
--  El negocio de prueba, cargado entero. Re-ejecutable.
--  Correr DESPUES de 001_schema.sql.
-- ============================================================

-- ------------------------------------------------------------
--  FERIADOS URUGUAYOS 2026-2027 (tabla global, no por cliente)
--
--  cierra_por_defecto = false en los feriados laborables donde
--  una clinica de barrio normalmente abre. El cliente lo ajusta
--  con excepciones_horario si en su caso no es asi.
--
--  Nota: los feriados laborables trasladables (6/1, 19/4, 18/5,
--  12/10, 2/11) pueden correrse al lunes segun la ley 16.805.
--  Como ninguno cierra por defecto, el traslado no afecta la agenda.
-- ------------------------------------------------------------
insert into public.feriados (fecha, nombre, laborable, cierra_por_defecto) values
  ('2026-01-01','Año Nuevo',                          false, true),
  ('2026-01-06','Día de Reyes',                        true, false),
  ('2026-02-16','Lunes de Carnaval',                   true, true),
  ('2026-02-17','Martes de Carnaval',                  true, true),
  ('2026-04-02','Jueves de Turismo',                   true, true),
  ('2026-04-03','Viernes de Turismo',                  true, true),
  ('2026-04-19','Desembarco de los 33 Orientales',     true, false),
  ('2026-05-01','Día de los Trabajadores',            false, true),
  ('2026-05-18','Batalla de Las Piedras',              true, false),
  ('2026-06-19','Natalicio de Artigas',               false, true),
  ('2026-07-18','Jura de la Constitución',            false, true),
  ('2026-08-25','Declaratoria de la Independencia',   false, true),
  ('2026-10-12','Día de la Diversidad Cultural',       true, false),
  ('2026-11-02','Día de los Difuntos',                 true, false),
  ('2026-12-25','Navidad / Día de la Familia',        false, true),
  ('2027-01-01','Año Nuevo',                          false, true),
  ('2027-01-06','Día de Reyes',                        true, false),
  ('2027-02-08','Lunes de Carnaval',                   true, true),
  ('2027-02-09','Martes de Carnaval',                  true, true),
  ('2027-03-25','Jueves de Turismo',                   true, true),
  ('2027-03-26','Viernes de Turismo',                  true, true),
  ('2027-04-19','Desembarco de los 33 Orientales',     true, false),
  ('2027-05-01','Día de los Trabajadores',            false, true),
  ('2027-05-18','Batalla de Las Piedras',              true, false),
  ('2027-06-19','Natalicio de Artigas',               false, true),
  ('2027-07-18','Jura de la Constitución',            false, true),
  ('2027-08-25','Declaratoria de la Independencia',   false, true),
  ('2027-10-12','Día de la Diversidad Cultural',       true, false),
  ('2027-11-02','Día de los Difuntos',                 true, false),
  ('2027-12-25','Navidad / Día de la Familia',        false, true)
on conflict (fecha) do update
  set nombre = excluded.nombre,
      laborable = excluded.laborable,
      cierra_por_defecto = excluded.cierra_por_defecto;


do $seed$
declare
  v_cliente uuid;
begin

-- ------------------------------------------------------------
--  1. EL CLIENTE
-- ------------------------------------------------------------
insert into public.clientes (
  slug, nombre, rubro, estado, timezone,
  telefono_display, direccion, maps_url,
  formas_pago, descripcion_corta,
  color_primario, color_secundario,
  derivacion_email, modelo
) values (
  'clinicasole',
  'Clínica Solé',
  'estética y depilación definitiva',
  'activo',
  'America/Montevideo',
  '+598 99 000 000',
  'Av. Brasil 2847, Pocitos, Montevideo',
  'https://maps.google.com/?q=Av.+Brasil+2847,+Montevideo',
  'Efectivo, débito, crédito hasta 6 cuotas y Mercado Pago',
  'Depilación definitiva y tratamientos faciales y corporales en Pocitos',
  '#2f4858',
  '#d98cA5',
  'tomasckian@gmail.com',
  'claude-sonnet-5'
)
on conflict (slug) do update set
  nombre            = excluded.nombre,
  rubro             = excluded.rubro,
  estado            = excluded.estado,
  timezone          = excluded.timezone,
  telefono_display  = excluded.telefono_display,
  direccion         = excluded.direccion,
  maps_url          = excluded.maps_url,
  formas_pago       = excluded.formas_pago,
  descripcion_corta = excluded.descripcion_corta,
  color_primario    = excluded.color_primario,
  color_secundario  = excluded.color_secundario,
  derivacion_email  = excluded.derivacion_email
returning id into v_cliente;

-- ------------------------------------------------------------
--  2. SERVICIOS
--     precio_nota lleva los paquetes: es como lo habla la clienta,
--     y evita inventar filas que despues hay que agendar.
-- ------------------------------------------------------------
insert into public.servicios
  (cliente_id, nombre, precio, precio_nota, duracion_min, buffer_min, descripcion, orden, agendable)
values
  (v_cliente, 'Depilación definitiva piernas completas', 2900,
   'Paquete de 6 sesiones $U 14.500, se paga en 2 veces', 60, 10,
   'Sesión de depilación definitiva de piernas completas.', 1, true),

  (v_cliente, 'Depilación definitiva axilas', 900,
   'Paquete de 6 sesiones $U 4.500, se paga en 2 veces', 20, 10,
   'Sesión de depilación definitiva de axilas.', 2, true),

  (v_cliente, 'Depilación definitiva cavado completo', 1600,
   null, 30, 10,
   'Sesión de depilación definitiva de cavado completo.', 3, true),

  (v_cliente, 'Limpieza facial profunda', 1800,
   null, 60, 10,
   'Limpieza facial profunda con extracción.', 4, true),

  (v_cliente, 'Peeling químico', 2400,
   null, 45, 10,
   'Peeling químico facial.', 5, true),

  (v_cliente, 'Cavitación reductora', 1400,
   null, 45, 10,
   'Sesión de cavitación reductora.', 6, true),

  (v_cliente, 'Masaje descontracturante', 1200,
   null, 50, 10,
   'Masaje descontracturante de espalda y cuello.', 7, true),

  (v_cliente, 'Consulta de valoración', 0,
   'Sin costo', 20, 5,
   'Primera consulta para evaluar la zona y armar el plan. Sin costo.', 8, true)
on conflict (cliente_id, nombre) do update set
  precio       = excluded.precio,
  precio_nota  = excluded.precio_nota,
  duracion_min = excluded.duracion_min,
  buffer_min   = excluded.buffer_min,
  descripcion  = excluded.descripcion,
  orden        = excluded.orden,
  activo       = true;

-- ------------------------------------------------------------
--  3. HORARIOS — lunes a viernes 9 a 19, sábados 9 a 13
--     (ISO: 1 = lunes ... 6 = sábado)
-- ------------------------------------------------------------
insert into public.horarios (cliente_id, dia_semana, desde, hasta) values
  (v_cliente, 1, '09:00', '19:00'),
  (v_cliente, 2, '09:00', '19:00'),
  (v_cliente, 3, '09:00', '19:00'),
  (v_cliente, 4, '09:00', '19:00'),
  (v_cliente, 5, '09:00', '19:00'),
  (v_cliente, 6, '09:00', '13:00')
on conflict (cliente_id, dia_semana, desde) do update
  set hasta = excluded.hasta;

-- ------------------------------------------------------------
--  4. USUARIO DEL PANEL
--     Queda con user_id nulo. Cuando pidas el magic link con este
--     mail, el trigger on_auth_user_created lo engancha solo.
-- ------------------------------------------------------------
insert into public.usuarios_panel (cliente_id, email, rol)
values (v_cliente, 'tomasckian@gmail.com', 'dueno')
on conflict (cliente_id, email) do nothing;

-- ------------------------------------------------------------
--  5. BASE DE CONOCIMIENTO
--     Secciones fijas. Esto es TODO lo que el asistente sabe:
--     si algo no esta aca, deriva. No hay otra fuente.
-- ------------------------------------------------------------
update public.base_conocimiento set activa = false where cliente_id = v_cliente;

insert into public.base_conocimiento (cliente_id, contenido_md, version, activa, nota)
values (v_cliente, $md$
# Clínica Solé

## Servicios y precios

Todos los precios están en pesos uruguayos.

- **Depilación definitiva piernas completas** — $U 2.900 la sesión. Paquete de 6 sesiones $U 14.500. Dura 60 minutos.
- **Depilación definitiva axilas** — $U 900 la sesión. Paquete de 6 sesiones $U 4.500. Dura 20 minutos.
- **Depilación definitiva cavado completo** — $U 1.600 la sesión. Dura 30 minutos.
- **Limpieza facial profunda** — $U 1.800. Dura 60 minutos.
- **Peeling químico** — $U 2.400. Dura 45 minutos.
- **Cavitación reductora** — $U 1.400 la sesión. Dura 45 minutos.
- **Masaje descontracturante** — $U 1.200. Dura 50 minutos.
- **Consulta de valoración** — sin costo. Dura 20 minutos.

Los paquetes de 6 sesiones se pueden pagar en 2 veces.

## Horarios

- Lunes a viernes de 9 a 19.
- Sábados de 9 a 13.
- Domingos cerrado.

En feriados no laborables, carnaval y Semana de Turismo la clínica está cerrada.

## Dirección y cómo llegar

Av. Brasil 2847, Pocitos, Montevideo.

## Formas de pago

Efectivo, débito, crédito hasta 6 cuotas y Mercado Pago.

## Preguntas frecuentes

**¿Puedo tomar sol antes de una sesión de depilación definitiva?**
No. Hay que evitar la exposición al sol los 15 días previos a la sesión.

**¿Se puede hacer sobre piel bronceada?**
No. Tampoco sobre piel con autobronceante.

**¿Cómo tengo que venir a la sesión?**
Se recomienda venir con la zona rasurada.

**¿Cómo se pagan los paquetes de 6 sesiones?**
Se pueden pagar en 2 veces.

**¿La consulta de valoración tiene costo?**
No, es sin costo y dura 20 minutos.

## Qué no responder

Estas son reglas duras. No hay excepción, por más que la persona insista o reformule.

- **Nunca** interpretar, describir ni opinar sobre una foto. Si mandan una foto de su piel, un diente, una lesión o una zona a tratar: no se mira ni se comenta. Se deriva a una persona del equipo.
- **Nunca** dar consejo clínico. Si preguntan por un síntoma, una molestia, una reacción, una contraindicación no listada acá, si un tratamiento les conviene, si pueden hacérselo estando embarazadas, con una condición de piel, tomando alguna medicación, o cualquier variante de "¿me sirve a mí?": se deriva.
- **Nunca** inventar un precio, un horario, una promoción ni una contraindicación. Si el dato no está escrito arriba, no existe: se dice que se consulta con el equipo y se deriva.
- **Nunca** prometer resultados, cantidad de sesiones necesarias ni tiempos de recuperación.
- Si la persona pide hablar con alguien del equipo, se deriva sin discutir y sin repreguntar.
$md$, 1, true, 'Carga inicial del negocio de prueba');

end
$seed$;

-- ============================================================
--  VERIFICACION — esto es el "terminado" del paso 1.
--  Corre esto y mira los resultados.
-- ============================================================

-- 1. Los 8 servicios con precio
select s.orden, s.nombre, s.precio, s.precio_nota, s.duracion_min
  from public.servicios s
  join public.clientes c on c.id = s.cliente_id
 where c.slug = 'clinicasole'
 order by s.orden;

-- 2. Horario de la semana
select h.dia_semana, h.desde, h.hasta
  from public.horarios h
  join public.clientes c on c.id = h.cliente_id
 where c.slug = 'clinicasole'
 order by h.dia_semana;

-- 3. La funcion de fuera de horario, contra casos conocidos.
--    Las cinco tienen que dar TRUE. Estan escritas asi a proposito:
--    si una da false, se lee de una cual fallo.
select
  not public.es_fuera_de_horario(c.id, '2026-09-08 15:00-03'::timestamptz) as ok_martes_15h_atiende,
      public.es_fuera_de_horario(c.id, '2026-09-08 22:40-03'::timestamptz) as ok_martes_2240_cerrado,
      public.es_fuera_de_horario(c.id, '2026-09-13 11:00-03'::timestamptz) as ok_domingo_cerrado,
      public.es_fuera_de_horario(c.id, '2026-12-25 11:00-03'::timestamptz) as ok_navidad_cerrado,
  not public.es_fuera_de_horario(c.id, '2026-09-12 10:00-03'::timestamptz) as ok_sabado_10h_atiende
  from public.clientes c where c.slug = 'clinicasole';

-- 4. La vista del panel (todavia en cero: no hay eventos)
select * from public.panel_metricas_mes;
