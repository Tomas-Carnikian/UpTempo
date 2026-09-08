-- ============================================================
--  006 — Lo que el paso 8 necesita saber de cada cliente
--
--  Dos datos que hasta ahora no hacían falta y ahora sí:
--
--  1. wa_business_account_id — el ID de la cuenta de WhatsApp
--     Business (la WABA), que NO es el ID del número. Las plantillas
--     viven en la WABA, así que sin este dato no hay dónde crearlas
--     ni desde dónde mandar un recordatorio.
--
--     Dónde sale: developers.facebook.com → la app → Casos de uso →
--     Conectar con los clientes → Configuración de la API. Ahí figuran
--     los dos IDs, uno debajo del otro. El del número es el que ya
--     está cargado en wa_phone_number_id; este es el otro.
--
--  2. derivacion_telefono — a qué número le avisamos cuando el
--     asistente deriva. Sin esto la derivación es un agujero: le
--     decimos a la persona que en un rato le escriben y no le escribe
--     nadie, porque el dueño nunca se entera.
--
--     En producción es el celular del dueño de la clínica. Mientras
--     estemos con el número de prueba de Meta tiene que ser un número
--     verificado como destinatario, o el envío rebota.
--
--  Formato del teléfono: código de país sin +, sin espacios y sin
--  guiones. Un celular uruguayo queda 598 + 9X XXX XXX → 59899123456.
-- ============================================================

update public.clientes set
  wa_business_account_id = '2284430865652281',
  -- ↓↓↓ CAMBIAR por el celular que recibe los avisos ↓↓↓
  derivacion_telefono    = '598XXXXXXXX'
where slug = 'clinicasole';

-- Control: las tres columnas de WhatsApp tienen que estar completas.
select slug,
       wa_phone_number_id     as id_numero,
       wa_business_account_id as id_waba,
       derivacion_telefono    as avisos_a
from public.clientes
where slug = 'clinicasole';
