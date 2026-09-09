/**
 * El color de marca, sacado del sitio del negocio.
 * Correr con: npm run test
 *
 * La prueba que manda es la última: **el color devuelto tiene que
 * estar literalmente en el HTML de origen.** Es la misma guarda que
 * tienen los precios, y por el mismo motivo — inventarle un color a
 * una clínica es igual de grave que inventarle un precio, y se ve
 * igual de bien cuando está mal.
 */
import { colorDeMarca, aHexNormal, esColorDeMarca } from '../src/marca';
import { esRedSocial } from '../src/extraccion';

let ok = 0, mal = 0;
function comprobar(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) { ok++; console.log(`  ok  ${nombre}`); }
  else { mal++; console.log(`  MAL ${nombre}${detalle ? '  → ' + detalle : ''}`); }
}

// ── 1. leer un color escrito de cualquier forma ─────────────────
console.log('\n— las formas en que la web escribe un color —');

comprobar('#00aeef', aHexNormal('#00aeef') === '#00aeef');
comprobar('mayúsculas', aHexNormal('#00AEEF') === '#00aeef');
comprobar('tres dígitos', aHexNormal('#0af') === '#00aaff');
comprobar('ocho dígitos (con alfa)', aHexNormal('#00aeefcc') === '#00aeef');
comprobar('rgb()', aHexNormal('rgb(0, 174, 239)') === '#00aeef');
comprobar('rgb() moderno', aHexNormal('rgb(0 174 239)') === '#00aeef');
// Verificado a mano: h=196 s=1 l=.47 -> c=.94, x=.689, m=0 -> (0,176,240).
comprobar('hsl()', aHexNormal('hsl(196, 100%, 47%)') === '#00b0f0',
  String(aHexNormal('hsl(196, 100%, 47%)')));
comprobar('hsl() sin comas', aHexNormal('hsl(196 100% 47%)') === '#00b0f0');
comprobar('transparente no es un color', aHexNormal('rgba(0,174,239,0.2)') === null);
comprobar('una palabra no es un color', aHexNormal('inherit') === null);
comprobar('vacío tampoco', aHexNormal('') === null);

// ── 2. qué es una marca y qué es un gris de interfaz ────────────
console.log('\n— marca o gris —');

for (const [hex, esMarca, que] of [
  ['#00aeef', true,  'celeste'],
  ['#e8c66a', true,  'dorado'],
  ['#10b981', true,  'verde'],
  ['#1a2b6d', true,  'azul oscuro de marca'],
  ['#1f2937', false, 'el gris pizarra que tenemos por defecto'],
  ['#6b7280', false, 'gris de texto'],
  ['#000000', false, 'negro'],
  ['#ffffff', false, 'blanco'],
  ['#fafafa', false, 'casi blanco'],
  ['#e5e7eb', false, 'gris de borde'],
] as Array<[string, boolean, string]>) {
  comprobar(`${que} (${hex}) → ${esMarca ? 'marca' : 'descartado'}`,
    esColorDeMarca(hex) === esMarca);
}

// ── 3. sacarlo de un HTML de verdad ─────────────────────────────
console.log('\n— de dónde lo saca —');

{
  const html = `<!doctype html><html><head>
    <meta charset="utf-8">
    <meta name="theme-color" content="#00aeef">
    <style>body{color:#111827;background:#ffffff}</style>
  </head><body><h1>Beauty Planet</h1></body></html>`;
  const r = colorDeMarca(html);
  comprobar('el theme-color gana sobre todo', r.color === '#00aeef' && r.fuente === 'theme-color',
    JSON.stringify(r));
}

{
  // Sin theme-color, manda la variable CSS que se llama como una marca.
  const html = `<style>
    :root { --texto: #111827; --borde: #e5e7eb; --color-primario: #c2185b; }
    a { color: var(--color-primario) }
  </style>`;
  const r = colorDeMarca(html);
  comprobar('la variable con nombre de marca gana sobre los grises',
    r.color === '#c2185b' && r.fuente === 'variable-css', JSON.stringify(r));
}

{
  // Un theme-color gris no sirve: hay que seguir buscando.
  const html = `<meta name="theme-color" content="#ffffff">
    <style>.b{background:#7b1fa2}.c{border-color:#7b1fa2}.d{color:#7b1fa2}</style>`;
  const r = colorDeMarca(html);
  comprobar('un theme-color blanco no frena la búsqueda',
    r.color === '#7b1fa2' && r.fuente === 'frecuencia', JSON.stringify(r));
}

{
  // Lo más común: sin theme-color y sin variables con buen nombre.
  const html = `<style>
    body{color:#333333;background:#fff;border:1px solid #dddddd}
    .btn{background:#e8c66a}.link{color:#e8c66a}.tit{border-bottom:2px solid #e8c66a}
  </style>`;
  const r = colorDeMarca(html);
  comprobar('gana el color no-gris que más se repite',
    r.color === '#e8c66a' && r.fuente === 'frecuencia', JSON.stringify(r));
}

{
  // Varias páginas del mismo sitio: los votos se suman.
  const r = colorDeMarca([
    '<style>.a{color:#333}.b{background:#00897b}</style>',
    '<style>.c{color:#666}.d{border:1px solid #00897b}</style>',
  ]);
  comprobar('suma los colores de todas las páginas del sitio', r.color === '#00897b',
    JSON.stringify(r));
}

// ── 4. lo que NO puede hacer ────────────────────────────────────
console.log('\n— cuando no hay color, no se inventa —');

{
  // Un sitio en blanco y negro es un caso real, no un error.
  const html = `<style>body{color:#111;background:#fff}
    .x{border:1px solid #e5e7eb}.y{color:#6b7280}.z{background:#1f2937}</style>`;
  const r = colorDeMarca(html);
  comprobar('un sitio todo gris devuelve null', r.color === null, JSON.stringify(r));
  comprobar('y dice qué descartó', r.nota.includes('#1f2937') || r.nota.includes('gris'),
    r.nota);
  comprobar('la fuente queda en "ninguna"', r.fuente === 'ninguna');
}

comprobar('un HTML sin un solo color devuelve null',
  colorDeMarca('<p>Hola</p>').color === null);
comprobar('un HTML vacío no rompe', colorDeMarca('').color === null);
comprobar('undefined tampoco rompe', colorDeMarca(undefined as any).color === null);

{
  // LA prueba. Si el color no está escrito en el HTML, salió de la
  // imaginación de alguien y no puede publicarse con el nombre de una
  // clínica real encima.
  const sitios = [
    '<meta name="theme-color" content="#00aeef"><style>.a{color:#333}</style>',
    '<style>:root{--brand:#c2185b}</style>',
    '<style>.b{background:#e8c66a}.c{color:#e8c66a}</style>',
    '<style>.d{background:rgb(0, 137, 123)}.e{color:rgb(0, 137, 123)}</style>',
  ];
  let todos = true;
  for (const s of sitios) {
    const r = colorDeMarca(s);
    if (!r.color) { todos = false; break; }
    // El hex, o la forma rgb() de la que salió, tienen que estar en el
    // texto original.
    const rgb = r.color.match(/#(..)(..)(..)/)!;
    const comoRgb = `rgb(${parseInt(rgb[1],16)}, ${parseInt(rgb[2],16)}, ${parseInt(rgb[3],16)})`;
    if (!s.toLowerCase().includes(r.color) && !s.includes(comoRgb)) { todos = false; break; }
  }
  comprobar('EL COLOR DEVUELTO ESTÁ LITERALMENTE EN EL HTML DE ORIGEN', todos);
}

// ── 4b. la paleta del framework no es la marca del negocio ──────
console.log('\n— la paleta de WordPress no es de nadie —');

{
  // Pasó de verdad: clinicajamelia, esteticaespaciohifu y goodbyepelos
  // quedaron las tres con #f78da7. No es casualidad: es el rosa pálido
  // de la paleta por defecto de WordPress, y era la primera de esa
  // lista que pasaba el filtro de croma.
  const wp = `<style>:root{
    --wp--preset--color--black: #000000;
    --wp--preset--color--cyan-bluish-gray: #abb8c3;
    --wp--preset--color--white: #ffffff;
    --wp--preset--color--pale-pink: #f78da7;
    --wp--preset--color--vivid-red: #cf2e2e;
    --wp--preset--color--luminous-vivid-orange: #ff6900;
  }
  .btn{background:#8e44ad}.link{color:#8e44ad}.tit{border-bottom:2px solid #8e44ad}
  </style>`;
  const r = colorDeMarca(wp);
  comprobar('no se queda con el rosa de WordPress', r.color !== '#f78da7', JSON.stringify(r));
  comprobar('se queda con el color que el sitio usa de verdad', r.color === '#8e44ad',
    JSON.stringify(r));

  // Pero una variable con nombre de marca de verdad sigue ganando,
  // aunque el sitio sea WordPress.
  const conMarca = `<style>:root{
    --wp--preset--color--pale-pink: #f78da7;
    --color-primario: #0b7285;
  }</style>`;
  comprobar('una variable de marca real sigue ganando sobre la paleta',
    colorDeMarca(conMarca).color === '#0b7285', JSON.stringify(colorDeMarca(conMarca)));
}

// ── 5. el perfil de una red social no es el sitio del negocio ───
console.log('\n— un Instagram no es una web —');

{
  // Pasó de verdad: Places dio instagram.com/studioamelie.uy como
  // "sitio web", el detector le sacó el color a Instagram, y la clínica
  // quedó publicada con #0095f6 — el azul de Meta.
  for (const u of [
    'https://instagram.com/studioamelie.uy?igshid=YmMyMTA2M2Y=',
    'https://www.instagram.com/algo/',
    'https://facebook.com/laclinica',
    'https://m.me/laclinica',
    'https://linktr.ee/laclinica',
    'https://www.tiktok.com/@laclinica',
    'https://wa.me/59899123456',
  ]) {
    comprobar(`${u.slice(0, 44)} → red social`, esRedSocial(u) === true);
  }
  for (const u of [
    'https://clinicajamelia.com/',
    'http://www.depilife.com.uy/',
    'https://vaigdepilacionlaser.com/',
    // El nombre de una red DENTRO del dominio no lo convierte en una.
    'https://instagram-marketing.com.uy/',
    'no-es-una-url',
  ]) {
    comprobar(`${u.slice(0, 44)} → sitio propio`, esRedSocial(u) === false);
  }
  // Y el azul de Instagram, si llegara a colarse, sigue pareciendo una
  // marca: por eso el filtro NO alcanza y hace falta cortar por dominio.
  comprobar('el azul de Instagram pasa el filtro de color: por eso hay que cortar antes',
    esColorDeMarca('#0095f6') === true);
}

console.log(`\n${ok} bien, ${mal} mal`);
if (mal) process.exit(1);
