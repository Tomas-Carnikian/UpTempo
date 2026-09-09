-- ============================================================
--  007 — El celeste de Uptempo como color por defecto
--
--  Hasta ahora, una demo sin color de marca detectable quedaba con
--  un gris pizarra (#1f2937). En una página eso se lee como "sin
--  terminar", y son bastantes: de diez clínicas reales, tres solo
--  tienen Instagram y otras tres tienen el color dentro de una
--  imagen, no en el CSS.
--
--  Pasa a ser el celeste de Uptempo (#00a8e8). Si varias demos lo
--  comparten no es un accidente —como sí lo fue el rosa de
--  WordPress— sino nuestro color, en una página que arriba de todo
--  dice que la armó Uptempo. Y en Uruguay es el único color que no
--  es de ningún cuadro.
--
--  El valor vive en worker/src/color.ts como CELESTE. Si se cambia
--  allá, hay que cambiarlo acá: son los dos únicos lugares.
-- ============================================================

alter table public.clientes
  alter column color_primario set default '#00a8e8';

comment on column public.clientes.color_primario is
  'Color de marca. Sale del CSS del sitio del negocio (worker/src/marca.ts). '
  'Si no se pudo detectar, queda el celeste de Uptempo. Una corrección hecha '
  'a mano no la pisa el generador.';

-- ── Las que ya están publicadas ───────────────────────────────
-- #1f2937 es el gris viejo por defecto.
-- #f78da7 es el rosa pálido de la paleta de WordPress, que el
-- detector tomaba por marca y le puso igual a tres clínicas
-- distintas. Ninguno de los dos lo eligió nadie.
update public.clientes
   set color_primario = '#00a8e8'
 where estado = 'demo'
   and lower(color_primario) in ('#1f2937', '#f78da7');

-- Control: ninguna demo debería quedar con el gris ni con el rosa.
select color_primario, count(*) as cuantas,
       string_agg(slug, ', ' order by slug) as demos
from public.clientes
where estado = 'demo'
group by color_primario
order by cuantas desc;
