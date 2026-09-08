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
import { slugValido, demosAPurgar, type CandidataPurga } from '../src/demos';
import { slugificar } from '../src/extraccion';
import { numeroWa } from '../src/pagina-turnos';
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
