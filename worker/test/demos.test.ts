/**
 * Pruebas del paso 9.2, sin red ni base.
 *
 * Lo que se prueba es lo que rompe un lote de 20 en la mitad: un slug
 * que el `check` de la base rechaza, dos servicios con el mismo nombre
 * (el `unique` tira el insert ENTERO, no solo esa fila) y dos tramos de
 * horario que empiezan a la misma hora el mismo día.
 *
 * La regla de "nunca tocar un cliente que no sea demo" no se prueba acá
 * porque necesita la base; se verifica a mano contra clinicasole.
 */
import { slugValido, demosAPurgar, asuntoDeContacto, type CandidataPurga } from '../src/demos';
import { slugificar, nombreDeNegocio } from '../src/extraccion';
import { numeroWa } from '../src/pagina-turnos';
import { horariosDePlaces } from '../src/places';
import { mensajeDeContacto } from '../src/demos';
import type { Ficha } from '../src/extraccion';
import type { Negocio } from '../src/tipos';

let ok = 0, mal = 0;
function comprobar(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) { ok++; console.log(`  ok  ${nombre}`); }
  else { mal++; console.log(`  MAL ${nombre}${detalle ? '  → ' + detalle : ''}`); }
}

/** El mismo check que tiene la base en 001_schema.sql. */
const CHECK = /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$/;

function main() {
  console.log('\n— el slug pasa el check de la base —');
  const nombres = [
    'Beauty Planet', 'Depilaser', 'DepiLife', 'Láser Sur',
    'Centro de Estética y Depilación Definitiva Punta Carretas Montevideo',
    'Dr. Ana Pérez — Odontología', 'AB', 'A', '★★★', 'Panel',
    'Clínica Soñé', 'Estética & Salud, S.R.L.',
  ];
  for (const n of nombres) {
    const s = slugValido(slugificar(n));
    comprobar(`"${n}" → "${s}"`, CHECK.test(s), s);
  }

  console.log('\n— el slug es un link que se manda por WhatsApp —');
  // Cortar por letra daba "clinicadeesteticamedicaalmalas.uptempo.uy".
  comprobar('saca las genéricas del principio',
    slugificar('Clínica de Estética Médica ALMA LÁSER') === 'almalaser',
    slugificar('Clínica de Estética Médica ALMA LÁSER'));
  comprobar('nunca corta una palabra por la mitad',
    !slugificar('Centro Integral de Depilación Definitiva Punta Carretas').endsWith('carre'),
    slugificar('Centro Integral de Depilación Definitiva Punta Carretas'));
  comprobar('conserva la sucursal de una cadena',
    slugificar('DepiLife Tres Cruces') === 'depilifetrescruces',
    slugificar('DepiLife Tres Cruces'));
  comprobar('un nombre corto queda igual',
    slugificar('Goodbye Pelos') === 'goodbyepelos', slugificar('Goodbye Pelos'));
  // En un nombre corto la palabra genérica ES parte del nombre: sacarla
  // dejaba "sone" para "Clínica Soñé" y "saludsrl" para "Estética &
  // Salud, S.R.L.". Solo se descarta en nombres de 4 palabras o más.
  comprobar('en un nombre corto NO saca la genérica',
    slugificar('Clínica Estética') === 'clinicaestetica', slugificar('Clínica Estética'));
  comprobar('tampoco en uno de tres palabras',
    slugificar('Estética & Salud, S.R.L.') === 'esteticasaludsrl',
    slugificar('Estética & Salud, S.R.L.'));
  comprobar('nunca pasa de 30', slugificar('Depilación Definitiva Integral Montevideo Uruguay').length <= 30);

  console.log('\n— el relleno de SEO de Google Maps —');
  // En Maps muchas fichas traen palabras puestas para posicionar. Sin
  // limpiarlas, Clínica Jamelia quedaba en depilacionlaser.uptempo.uy:
  // genérico, y encima chocaría con la clínica siguiente.
  comprobar('el relleno va adelante',
    nombreDeNegocio('Depilación Laser Definitiva y Estética | Clínica Jamelia') === 'Clínica Jamelia',
    nombreDeNegocio('Depilación Laser Definitiva y Estética | Clínica Jamelia'));
  comprobar('el relleno va atrás',
    nombreDeNegocio('Depimed | Depilación Láser Definitiva') === 'Depimed',
    nombreDeNegocio('Depimed | Depilación Láser Definitiva'));
  comprobar('un nombre sin separador queda intacto',
    nombreDeNegocio('Beauty Planet') === 'Beauty Planet');
  comprobar('y el slug sale del nombre real',
    slugificar('Depilación Laser Definitiva y Estética | Clínica Jamelia') === 'clinicajamelia',
    slugificar('Depilación Laser Definitiva y Estética | Clínica Jamelia'));

  console.log('\n— largo —');
  comprobar('nunca más de 30', slugValido('a'.repeat(60)).length === 30);
  comprobar('nunca menos de 3', slugValido('a').length === 3, slugValido('a'));
  comprobar('un slug vacío igual sale válido', CHECK.test(slugValido('')), slugValido(''));
  comprobar('no termina en guión', !slugValido('abc-'.repeat(10)).endsWith('-'),
    slugValido('abc-'.repeat(10)));
  comprobar('no empieza con guión', !slugValido('---hola').startsWith('-'), slugValido('---hola'));
  comprobar('el sufijo numérico sigue siendo válido',
    CHECK.test(slugValido('beautyplanet2')), slugValido('beautyplanet2'));
  comprobar('un nombre largo con sufijo tampoco se pasa',
    slugValido(slugificar('Centro de Estética y Depilación Definitiva Punta Carretas') + '2').length <= 30);

  console.log('\n— la purga a los 30 días —');
  const hoy = new Date('2026-10-15T03:00:00Z');
  const hace = (dias: number) => new Date(hoy.getTime() - dias * 86400000).toISOString();
  const filas: CandidataPurga[] = [
    { slug: 'vieja-sin-uso',  estado: 'demo',       creado_en: hace(40), eventos: 0 },
    { slug: 'vieja-usada',    estado: 'demo',       creado_en: hace(40), eventos: 3 },
    { slug: 'nueva-sin-uso',  estado: 'demo',       creado_en: hace(5),  eventos: 0 },
    { slug: 'justo-29',       estado: 'demo',       creado_en: hace(29), eventos: 0 },
    { slug: 'justo-31',       estado: 'demo',       creado_en: hace(31), eventos: 0 },
    { slug: 'cliente-activo', estado: 'activo',     creado_en: hace(90), eventos: 0 },
    { slug: 'suspendido',     estado: 'suspendido', creado_en: hace(90), eventos: 0 },
    { slug: 'fecha-basura',   estado: 'demo',       creado_en: 'no es una fecha', eventos: 0 },
  ];
  const purgar = demosAPurgar(filas, hoy);

  comprobar('borra la demo vieja que nadie abrió', purgar.includes('vieja-sin-uso'));
  comprobar('NO borra una demo que alguien usó', !purgar.includes('vieja-usada'));
  comprobar('NO borra una demo nueva', !purgar.includes('nueva-sin-uso'));
  comprobar('a los 29 días todavía no', !purgar.includes('justo-29'));
  comprobar('a los 31 días sí', purgar.includes('justo-31'));
  // Lo más importante de todo el archivo: esto decide un DELETE.
  comprobar('NUNCA borra un cliente activo', !purgar.includes('cliente-activo'));
  comprobar('NUNCA borra un suspendido', !purgar.includes('suspendido'));
  comprobar('una fecha ilegible no se borra (ante la duda, se queda)',
    !purgar.includes('fecha-basura'));
  comprobar('borra exactamente dos', purgar.length === 2, JSON.stringify(purgar));

  // El tope por corrida: si algo sale mal, el daño está acotado.
  const muchas: CandidataPurga[] = Array.from({ length: 50 }, (_, i) =>
    ({ slug: 'd' + i, estado: 'demo', creado_en: hace(60), eventos: 0 }));
  comprobar('nunca borra más de 20 en una corrida', demosAPurgar(muchas, hoy).length === 20,
    String(demosAPurgar(muchas, hoy).length));
  comprobar('una lista vacía no rompe', demosAPurgar([], hoy).length === 0);

  console.log('\n— los horarios de Google Places —');
  // Places usa 0 = domingo … 6 = sábado; la base usa ISO, 1 = lunes … 7 = domingo.
  // Sin la conversión, TODOS los horarios quedan corridos un día y la
  // agenda ofrece turnos con el local cerrado.
  const per = (day: number, oh: number, ch: number) =>
    ({ open: { day, hour: oh, minute: 0 }, close: { day, hour: ch, minute: 30 } });
  const h = horariosDePlaces([per(1, 9, 19), per(0, 10, 13), per(6, 9, 15)]);
  comprobar('el lunes de Places (1) es el lunes ISO (1)',
    h.some(x => x.dia_semana === 1 && x.desde === '09:00:00'), JSON.stringify(h));
  comprobar('el DOMINGO de Places (0) es el 7 ISO, no el 0',
    h.some(x => x.dia_semana === 7 && x.desde === '10:00:00'), JSON.stringify(h));
  comprobar('el sábado de Places (6) es el 6 ISO',
    h.some(x => x.dia_semana === 6), JSON.stringify(h));
  comprobar('los minutos se conservan', h[0]?.hasta === '19:30:00', h[0]?.hasta);
  comprobar('un período sin cierre (abierto 24 h) se descarta',
    horariosDePlaces([{ open: { day: 1, hour: 0, minute: 0 } }]).length === 0);
  comprobar('un tramo que cruza la medianoche se descarta',
    horariosDePlaces([{ open: { day: 1, hour: 22, minute: 0 },
                        close: { day: 2, hour: 2, minute: 0 } }]).length === 0);
  comprobar('una lista vacía no rompe', horariosDePlaces([]).length === 0);
  comprobar('basura no rompe', horariosDePlaces([{}, { open: {} }] as any).length === 0);

  console.log('\n— el mensaje de contacto —');
  const fichaCon = (servicios: any[], horarios: any[] = []): Ficha => ({
    nombre: 'Beauty Planet', slug: '', rubro: null, descripcion_corta: null,
    direccion: 'Julio Herrera 1234', telefono_display: null, formas_pago: null,
    servicios, horarios, base_conocimiento: '',
    origen: { url: null, paginas: [], caracteres: 0, precios_descartados: [] },
  });
  const s3 = [
    { nombre: 'Axilas', precio: 790, precio_nota: null, duracion_min: null, descripcion: null },
    { nombre: 'Bozo', precio: 790, precio_nota: null, duracion_min: null, descripcion: null },
    { nombre: 'Espalda', precio: 2300, precio_nota: null, duracion_min: null, descripcion: null },
  ];
  const m = mensajeDeContacto(fichaCon(s3, [{ dia_semana: 1, desde: '09:00:00', hasta: '19:00:00' }]),
                              'beautyplanet');
  comprobar('trae el nombre del negocio', m.includes('Beauty Planet'));
  comprobar('trae el link con el subdominio', m.includes('beautyplanet.uptempo.uy'));
  comprobar('menciona un precio real de la ficha', m.includes('790'));
  // El gancho tiene que ser el MÁS BARATO, no el primero de la lista:
  // en Goodbye Pelos el primero era "depilación con cera - abdomen
  // $620", que no es lo que le mostrás a una clínica de definitiva.
  const barato = mensajeDeContacto(fichaCon([
    { nombre: 'Espalda', precio: 2300, precio_nota: null, duracion_min: null, descripcion: null },
    { nombre: 'Axilas', precio: 790, precio_nota: null, duracion_min: null, descripcion: null },
    { nombre: 'Piernas', precio: 1650, precio_nota: null, duracion_min: null, descripcion: null },
  ]), 'x');
  comprobar('el gancho es el servicio más barato', barato.includes('axilas $790'), barato);

  // Goodbye Pelos vende definitiva Y con cera; el más barato de toda la
  // lista era "depilación con cera - narinas $80".
  const mixto = fichaCon([
    { nombre: 'Depilación con cera - narinas', precio: 80, precio_nota: null, duracion_min: null, descripcion: null },
    { nombre: 'Depilación definitiva axilas', precio: 790, precio_nota: null, duracion_min: null, descripcion: null },
    { nombre: 'Depilación definitiva bozo', precio: 790, precio_nota: null, duracion_min: null, descripcion: null },
    { nombre: 'Depilación definitiva piernas', precio: 1650, precio_nota: null, duracion_min: null, descripcion: null },
  ]);
  const conInteres = mensajeDeContacto(mixto, 'x', 'depilacion definitiva Montevideo');
  comprobar('el gancho es del rubro que se buscó, no la cera de $80',
    conInteres.includes('790') && !conInteres.includes('$80'), conInteres);
  comprobar('sin interés, cae en el más barato de todos',
    mensajeDeContacto(mixto, 'x').includes('$80'));
  // VAIG tenía 6 servicios con precio y el mensaje no mencionaba
  // ninguno, porque solo uno coincidía con la búsqueda.
  const pocosDelRubro = fichaCon([
    { nombre: 'Depilación definitiva axilas', precio: 790, precio_nota: null, duracion_min: null, descripcion: null },
    { nombre: 'Limpieza facial', precio: 1200, precio_nota: null, duracion_min: null, descripcion: null },
    { nombre: 'Masaje descontracturante', precio: 1500, precio_nota: null, duracion_min: null, descripcion: null },
    { nombre: 'Peeling', precio: 1800, precio_nota: null, duracion_min: null, descripcion: null },
  ]);
  comprobar('con pocos del rubro pero varios con precio, igual menciona uno',
    /\$\s?\d/.test(mensajeDeContacto(pocosDelRubro, 'x', 'depilacion definitiva Montevideo')),
    mensajeDeContacto(pocosDelRubro, 'x', 'depilacion definitiva Montevideo'));
  comprobar('dice cuántos servicios más', m.includes('2 más'), m);
  comprobar('ofrece borrar la página', m.toLowerCase().includes('borro'));
  comprobar('no inventa precios si no hay',
    !/\$\s?\d/.test(mensajeDeContacto(fichaCon([]), 'x')),
    mensajeDeContacto(fichaCon([]), 'x'));
  comprobar('sin servicios igual sale un mensaje mandable',
    mensajeDeContacto(fichaCon([]), 'x').includes('x.uptempo.uy'));

  comprobar('el asunto nombra al negocio',
    asuntoDeContacto(fichaCon([])).includes('Beauty Planet'), asuntoDeContacto(fichaCon([])));
  comprobar('el asunto dice qué es',
    /demo|asistente/i.test(asuntoDeContacto(fichaCon([]))));

  console.log('\n— el número de WhatsApp de la página —');
  const conTel = (t: string | null) => ({ cliente: { telefono_display: t } } as unknown as Negocio);
  // Beauty Planet publica "2711 9115 / 095 374 187": el primero es el
  // FIJO, y un wa.me a un fijo no abre nada.
  comprobar('elige el celular y no el fijo',
    numeroWa(conTel('2711 9115 / 095 374 187')) === '59895374187',
    numeroWa(conTel('2711 9115 / 095 374 187')));
  comprobar('un celular ya con código de país queda igual',
    numeroWa(conTel('+598 99 123 456')) === '59899123456', numeroWa(conTel('+598 99 123 456')));
  comprobar('un celular suelto se completa',
    numeroWa(conTel('099 123 456')) === '59899123456', numeroWa(conTel('099 123 456')));
  comprobar('si SOLO hay fijo, usa el fijo',
    numeroWa(conTel('2711 9115')) === '59827119115', numeroWa(conTel('2711 9115')));
  comprobar('varios teléfonos con etiquetas: agarra un celular',
    numeroWa(conTel('Carrasco: 2601 5785 | WhatsApp: 092 050 005')) === '59892050005',
    numeroWa(conTel('Carrasco: 2601 5785 | WhatsApp: 092 050 005')));
  comprobar('sin teléfono no rompe', numeroWa(conTel(null)) === '');
  comprobar('un texto sin números no rompe', numeroWa(conTel('consultar por Instagram')) === '');

  console.log(`\n${ok} bien, ${mal} mal\n`);
  process.exit(mal === 0 ? 0 : 1);
}

main();
