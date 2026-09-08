-- ============================================================
--  UPTEMPO — 005_geo_en_clientes.sql
--
--  Coordenadas para el mapa de la pagina de turnos.
--
--  Se guardan en la fila y no se resuelven en cada visita: geocodificar
--  al vuelo agrega una llamada a un tercero en el camino critico de una
--  pagina que tiene que cargar en menos de 2 segundos, y la direccion
--  de una clinica no se mueve.
--
--  Se cargan una sola vez al dar de alta el cliente, con Nominatim
--  (gratis, sin clave). El generador de demos lo hace solo.
-- ============================================================

alter table public.clientes
  add column if not exists lat numeric(9,6),
  add column if not exists lon numeric(9,6);

comment on column public.clientes.lat is
  'Latitud para el mapa. Si es null, la pagina muestra la direccion sin mapa.';

-- Clínica Solé: Av. Brasil 2847, Pocitos.
update public.clientes
   set lat = -34.908641, lon = -56.155122
 where slug = 'clinicasole';

select slug, direccion, lat, lon from public.clientes order by slug;
