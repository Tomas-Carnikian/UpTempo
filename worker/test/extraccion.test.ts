/**
 * Pruebas de la extraccion (paso 9.1), sin red ni base.
 * Correr con: npm run test
 *
 * Lo que importa acá no es que el modelo acierte —eso se verifica a ojo
 * contra tres clínicas reales— sino que TODO lo que rodea al modelo sea
 * determinista: la limpieza, el slug, los horarios y, sobre todo, la
 * guarda que borra un precio que el sitio no publica.
 */
import {
  limpiarHtml, slugificar, diaISO, normalizarHora, validarPrecios, armarFicha,
  tituloDe, linksInternos, juntarPaginas,
} from '../src/extraccion';

let ok = 0, mal = 0;
function comprobar(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) { ok++; console.log(`  ok  ${nombre}`); }
  else { mal++; console.log(`  MAL ${nombre}${detalle ? '  → ' + detalle : ''}`); }
}

const HTML = `<!doctype html><html><head><title>Láser Sur</title>
<style>.x{color:red}</style><script>var a=1;</script></head>
<body>
<nav><a href="/">Inicio</a><a href="/precios">Precios</a></nav>
<h1>L&aacute;ser Sur</h1>
<p>Depilaci&oacute;n definitiva en Pocitos.</p>
<ul>
  <li>Axilas &mdash; $ 1.200 por sesi&oacute;n</li>
  <li>Piernas completas &mdash; $ 3.500</li>
  <li>Rostro completo &mdash; consultar</li>
</ul>
<img src="precios.jpg" alt="Pack de 6 sesiones de cavitación 9.900">
<footer>Av. Brasil 1234, Pocitos · Tel 2711 0000 · Lunes a viernes de 9 a 19</footer>
</body></html>`;

const HTML_LINKS = `<html><body>
<a href="/precios">Lista de precios</a>
<a href="/servicios/depilacion">Depilación definitiva</a>
<a href="/contacto">Contacto</a>
<a href="/nosotros">Quiénes somos</a>
<a href="/blog/2024/05/una-nota-cualquiera">Una nota</a>
<a href="/precios">Precios (repetido)</a>
<a href="https://instagram.com/laclinica">Instagram</a>
<a href="mailto:hola@lasersur.uy">Escribinos</a>
<a href="/tarifas.pdf">Tarifas PDF</a>
<a href="/">Inicio</a>
</body></html>`;

function main() {
  console.log('\n— limpieza del HTML —');
  const limpio = limpiarHtml(HTML);
  comprobar('saca el script', !limpio.includes('var a=1'));
  comprobar('saca el style', !limpio.includes('color:red'));
  comprobar('saca el nav', !limpio.includes('Inicio'));
  // La primera versión borraba el footer entero y las tres fichas de
  // prueba salieron sin dirección ni teléfono, teniéndolos la web.
  comprobar('CONSERVA la dirección del footer', limpio.includes('Av. Brasil 1234'));
  comprobar('CONSERVA el teléfono del footer', limpio.includes('2711 0000'));
  comprobar('no queda ninguna etiqueta', !/<[a-z/!]/i.test(limpio), limpio.slice(0, 120));
  comprobar('decodifica las entidades', limpio.includes('Láser Sur') && limpio.includes('Depilación'));
  comprobar('conserva los precios', limpio.includes('1.200') && limpio.includes('3.500'));
  comprobar('conserva el alt de la imagen de precios', limpio.includes('9.900'));

  console.log('\n— título —');
  comprobar('lee el title', tituloDe(HTML) === 'Láser Sur', String(tituloDe(HTML)));
  comprobar('sin title devuelve null', tituloDe('<html><body>x</body></html>') === null);

  console.log('\n— links internos —');
  const links = linksInternos(HTML_LINKS, 'https://lasersur.uy/');
  comprobar('elige precios primero', links[0] === 'https://lasersur.uy/precios', links[0]);
  comprobar('no trae más de 5', links.length <= 5, String(links.length));
  comprobar('no repite el mismo link',
    new Set(links).size === links.length, JSON.stringify(links));
  comprobar('no sale del dominio', !links.some(l => l.includes('instagram')));
  comprobar('descarta mailto', !links.some(l => l.startsWith('mailto')));
  comprobar('descarta archivos', !links.some(l => l.endsWith('.pdf')));
  comprobar('descarta el blog (ninguna palabra clave)', !links.some(l => l.includes('/blog/')));
  comprobar('no se incluye a sí misma', !links.includes('https://lasersur.uy'));
  comprobar('trae contacto (dirección y horarios)',
    links.some(l => l.endsWith('/contacto')), JSON.stringify(links));

  // El caso Depilaser: los mejores links son TODOS de precios y packs, y
  // la única página con la dirección quedaba afuera del ranking.
  const soloPrecios = `<html><body>
    <a href="/precios">Precios</a>
    <a href="/packs">Packs</a>
    <a href="/promociones">Promociones</a>
    <a href="/lista-de-tarifas">Tarifas</a>
    <a href="/categoria-producto/depilacion-laser">Depilación láser</a>
    <a href="/contacto">Contacto</a>
  </body></html>`;
  const conCupo = linksInternos(soloPrecios, 'https://x.uy/');
  comprobar('el cupo mete contacto aunque no esté en el podio',
    conCupo.some(l => l.endsWith('/contacto')), JSON.stringify(conCupo));
  comprobar('y aun así trae una de precios',
    conCupo.some(l => /precio|pack|tarifa|promo/.test(l)), JSON.stringify(conCupo));
  comprobar('y una de servicios',
    conCupo.some(l => l.includes('categoria-producto')), JSON.stringify(conCupo));
  comprobar('no trae más de 5', conCupo.length <= 5, String(conCupo.length));
  comprobar('una base inválida no rompe', linksInternos(HTML_LINKS, 'no-es-una-url').length === 0);

  console.log('\n— juntar páginas —');
  const junto = juntarPaginas([
    { url: 'https://x.uy/', texto: 'Bienvenidos a la clínica de Pocitos\nAv. Brasil 1234, Pocitos, Montevideo' },
    { url: 'https://x.uy/precios', texto: 'Av. Brasil 1234, Pocitos, Montevideo\nAxilas\n$790\nBozo\n$790' },
    { url: 'https://x.uy/vacia', texto: 'ok' },
  ]);
  comprobar('marca de qué URL salió cada bloque',
    junto.includes('=== https://x.uy/precios ==='));
  comprobar('borra la línea larga repetida (el pie de página)',
    junto.split('Av. Brasil 1234').length - 1 === 1, junto);
  comprobar('NO deduplica líneas cortas (dos servicios a $790)',
    junto.split('$790').length - 1 === 2);
  comprobar('descarta una página sin contenido', !junto.includes('/vacia'));

  console.log('\n— slug —');
  comprobar('normal', slugificar('Láser Sur') === 'lasersur', slugificar('Láser Sur'));
  comprobar('saca tildes y ñ', slugificar('Clínica Soñé') === 'clinicasone', slugificar('Clínica Soñé'));
  comprobar('saca puntuación', slugificar('Estética & Salud, S.R.L.') === 'esteticasaludsrl',
    slugificar('Estética & Salud, S.R.L.'));
  comprobar('un reservado no queda como reservado', slugificar('Panel') === 'paneluy', slugificar('Panel'));
  comprobar('un nombre sin letras no rompe', slugificar('★★★') === 'negocio', slugificar('★★★'));
  comprobar('nunca tiene puntos ni espacios', !/[^a-z0-9]/.test(slugificar('Dr. Ana Pérez — Odontología')));

  console.log('\n— horarios —');
  comprobar('número ISO', diaISO(3) === 3);
  comprobar('nombre en español con tilde', diaISO('Miércoles') === 3);
  comprobar('nombre en inglés', diaISO('saturday') === 6);
  comprobar('domingo es 7, no 0', diaISO('domingo') === 7);
  comprobar('un día inventado es null', diaISO('lunesmartes') === null);
  comprobar('el 0 es null (evita el off-by-one)', diaISO(0) === null);
  comprobar('hora corta', normalizarHora('9') === '09:00:00');
  comprobar('hora con minutos', normalizarHora('9:30') === '09:30:00');
  comprobar('hora ya completa', normalizarHora('09:30:00') === '09:30:00');
  comprobar('hora imposible es null', normalizarHora('25:00') === null);
  comprobar('texto no es hora', normalizarHora('de mañana') === null);

  console.log('\n— la guarda de precios —');
  const fuente = 'Axilas $ 1.200 por sesión. Piernas completas $3.500. Rostro: consultar.';
  const r = validarPrecios([
    { nombre: 'Axilas', precio: 1200, precio_nota: 'por sesión', duracion_min: 20, descripcion: null },
    { nombre: 'Piernas completas', precio: 3500, precio_nota: null, duracion_min: null, descripcion: null },
    { nombre: 'Rostro completo', precio: 2800, precio_nota: null, duracion_min: null, descripcion: null },
    { nombre: 'Bozo', precio: null, precio_nota: 'consultar', duracion_min: null, descripcion: null },
  ], fuente);
  comprobar('deja el precio que está escrito con separador', r.servicios[0].precio === 1200);
  comprobar('deja el precio que está escrito sin espacio', r.servicios[1].precio === 3500);
  comprobar('BORRA el precio inventado', r.servicios[2].precio === null, String(r.servicios[2].precio));
  comprobar('deja en null lo que ya venía null', r.servicios[3].precio === null);
  comprobar('conserva la nota del que no tiene precio', r.servicios[3].precio_nota === 'consultar');
  comprobar('deja constancia de lo descartado', r.descartados.length === 1, JSON.stringify(r.descartados));
  comprobar('el descarte dice qué servicio fue', r.descartados[0].includes('Rostro completo'));

  console.log('\n— armar la ficha —');
  const ficha = armarFicha({
    nombre: '  Láser Sur  ',
    rubro: 'depilación definitiva',
    descripcion_corta: 'Depilación definitiva en Pocitos.',
    direccion: 'Av. Brasil 1234',
    telefono_display: '2711 0000',
    formas_pago: null,
    servicios: [
      { nombre: 'Axilas', precio: 1200, precio_nota: 'por sesión', duracion_min: 20, descripcion: null },
      { nombre: 'Fantasía', precio: 7777, precio_nota: null, duracion_min: null, descripcion: null },
      { nombre: '', precio: null, precio_nota: null, duracion_min: null, descripcion: null },
    ],
    horarios: [
      { dia_semana: 'lunes', desde: '9', hasta: '18' },
      { dia_semana: 9, desde: '9', hasta: '18' },
      { dia_semana: 2, desde: '18', hasta: '9' },
      { dia_semana: 6, desde: '9:30', hasta: '13:00' },
    ],
    base_conocimiento: '## Sobre el lugar\nEstá en Pocitos.',
  }, fuente, 'https://lasersur.uy', ['https://lasersur.uy', 'https://lasersur.uy/precios']);

  comprobar('recorta el nombre', ficha.nombre === 'Láser Sur', `"${ficha.nombre}"`);
  comprobar('calcula el slug', ficha.slug === 'lasersur', ficha.slug);
  comprobar('tira el servicio sin nombre', ficha.servicios.length === 2, String(ficha.servicios.length));
  comprobar('el precio inventado llegó en null a la ficha',
    ficha.servicios[1].precio === null, String(ficha.servicios[1].precio));
  comprobar('la ficha reporta el precio descartado', ficha.origen.precios_descartados.length === 1);
  comprobar('convierte el día en texto a ISO', ficha.horarios[0]?.dia_semana === 1);
  comprobar('tira el día 9', !ficha.horarios.some(h => h.dia_semana === 9));
  comprobar('tira el tramo al revés', !ficha.horarios.some(h => h.desde > h.hasta));
  comprobar('quedan dos horarios buenos', ficha.horarios.length === 2, JSON.stringify(ficha.horarios));
  comprobar('las horas quedan HH:MM:SS', ficha.horarios[1]?.desde === '09:30:00', ficha.horarios[1]?.desde);
  comprobar('guarda la url de origen', ficha.origen.url === 'https://lasersur.uy');
  comprobar('guarda todas las páginas leídas', ficha.origen.paginas.length === 2,
    JSON.stringify(ficha.origen.paginas));

  const vacia = armarFicha({}, '', null);
  comprobar('una ficha vacía no rompe', vacia.servicios.length === 0 && vacia.horarios.length === 0);
  comprobar('sin nombre igual sale un slug válido', /^[a-z0-9]+$/.test(vacia.slug), vacia.slug);

  console.log(`\n${ok} bien, ${mal} mal\n`);
  process.exit(mal === 0 ? 0 : 1);
}

main();
