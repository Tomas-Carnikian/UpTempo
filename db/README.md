# Uptempo — base de datos

Paso 1 del orden de construcción. Postgres en Supabase.

## Orden de ejecución

En el SQL Editor de Supabase, uno por vez:

1. `001_schema.sql` — tablas, índices, funciones, vista del panel y RLS.
2. `002_seed_clinica_sole.sql` — feriados uruguayos 2026-2027 y Clínica Solé entera.

Los dos son **re-ejecutables**: se pueden correr de nuevo sin romper nada.

## Terminado del paso 1

Al final de `002` hay cuatro consultas de verificación. El paso está cerrado cuando:

- La primera devuelve **8 servicios** con sus precios y duraciones.
- La segunda devuelve **6 filas** de horario (lunes a viernes 9-19, sábado 9-13).
- La tercera devuelve exactamente `false, true, true, true, false`.
  Es decir: el martes a las 15 está abierto, el martes a las 22:40 no,
  el domingo no, Navidad no, y el sábado a las 10 sí.
- La cuarta devuelve una fila con los cinco números en cero
  (todavía no hay eventos: eso es el paso 4).

Y la prueba de aislamiento, que es la que de verdad importa:
con un usuario logueado de otro cliente, `select * from conversaciones`
tiene que devolver **cero filas**. No "las suyas primero": cero.

## Decisiones que están dentro de este esquema

**El hash del teléfono no se calcula acá.** Un celular uruguayo son ~10 millones
de combinaciones: un sha256 sin pepper se revierte por fuerza bruta en segundos y
no protege nada. El hash lo calcula el Worker con un pepper que vive en los secrets
de Cloudflare. La base solo recibe el hash ya hecho.

**El teléfono en claro existe, y tiene que existir.** Sin él no le podés contestar
por WhatsApp ni mandarle el recordatorio. Vive mientras hay obligación operativa
(conversación viva o turno futuro) y lo borra `purgar_datos_viejos()` a los 90 días,
que deja el hash y los eventos agregados. Eso es lo que pide la 18.331.

**`silenciado_hasta` en vez de un boolean `derivada`.** La regla es "24 horas",
que es un momento. Con la fecha, el Worker pregunta `silenciado_hasta < now()`
y no hace falta ningún proceso que ande apagando banderas.

**`mensajes.wa_message_id` con índice único.** Meta reintenta el webhook si no le
respondés rápido. Sin esto el asistente contesta dos veces y te cobra dos veces.

**Los feriados son una tabla global.** Los uruguayos son los mismos para todos:
se cargan una vez y no suman ni un minuto por cliente nuevo. Las vacaciones de
enero de cada clínica van en `excepciones_horario`.

**El magic link se engancha solo.** Das de alta el email en `usuarios_panel`;
cuando el dueño pide su enlace por primera vez, el trigger `on_auth_user_created`
lo vincula. Cero pasos manuales en la implementación.

## Lo que el panel puede y no puede hacer

El panel es **solo lectura**. Entra con la anon key más el JWT del usuario, y las
políticas de RLS lo dejan ver únicamente su `cliente_id`. Todo lo que escribe pasa
por el Worker con `service_role`.

Por eso no hay políticas de insert ni update: si en algún momento hace falta que el
dueño edite algo desde el panel, se agrega la política de esa tabla y nada más.
