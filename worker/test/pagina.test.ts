/**
 * La página de turnos: lo que no se ve fallar.
 * Correr con: npm run test
 *
 * Dos cosas se prueban acá porque se rompen en silencio y en la
 * pantalla de otro:
 *
 *  1. El contraste. El color lo pone el cliente y sale de su web, así
 *     que puede ser cualquier cosa. Un botón dorado con texto blanco
 *     no da error: simplemente no se lee, y nos enteramos cuando un
 *     prospecto no toca el botón.
 *  2. El "abierto ahora". Se calcula en la zona del negocio, no en la
 *     del servidor, que es UTC. En Montevideo eso son tres horas de
 *     diferencia: a las 00:30 UTC del martes allá son las 21:30 del
 *     lunes, y el cartel diría el día equivocado.
 */
import { sobreColor, paraTexto, contraste, aRgb, mezclar } from '../src/color';
import { estadoApertura, numeroWa } from '../src/pagina-turnos';
import type { Negocio, Horario } from '../src/tipos';

let ok = 0, mal = 0;
function comprobar(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) { ok++; console.log(`  ok  ${nombre}`); }
  else { mal++; console.log(`  MAL ${nombre}${detalle ? '  → ' + detalle : ''}`); }
}

const AA = 4.5;
const razon = (a: string, b: string) => contraste(aRgb(a)!, aRgb(b)!);

// ── 1. el color del cliente, sea cual sea ───────────────────────
console.log('\n— el texto encima del color de marca —');

{
  // Los dos primeros son los que rompían: en una clínica de estética
  // el dorado y el rosa claro son colores de marca frecuentísimos, y
  // el código escribía blanco fijo encima.
  const marcas = [
    ['#2f4858', 'azul oscuro'],
    ['#e8c66a', 'dorado claro'],
    ['#f6c9d6', 'rosa pastel'],
    ['#ffffff', 'blanco'],
    ['#000000', 'negro'],
    ['#10b981', 'verde medio'],
    ['#7c3aed', 'violeta'],
  ];
  for (const [hex, nombre] of marcas) {
    const encima = sobreColor(hex);
    comprobar(`${nombre} (${hex}) → texto ${encima} pasa AA`,
      razon(hex, encima) >= AA, `contraste ${razon(hex, encima).toFixed(2)}`);
  }
  comprobar('un color roto no rompe la página',
    sobreColor('no-es-un-color') === '#ffffff');
}

console.log('\n— el color de marca usado como TEXTO —');

{
  // Sobre fondo claro tiene que oscurecer; sobre fondo oscuro, aclarar.
  for (const hex of ['#e8c66a', '#f6c9d6', '#10b981', '#2f4858', '#ffffff']) {
    const claro = paraTexto(hex, '#ffffff');
    comprobar(`${hex} sobre blanco → ${claro}`,
      razon(claro, '#ffffff') >= AA, `contraste ${razon(claro, '#ffffff').toFixed(2)}`);
    const oscuro = paraTexto(hex, '#12161a');
    comprobar(`${hex} sobre oscuro → ${oscuro}`,
      razon(oscuro, '#12161a') >= AA, `contraste ${razon(oscuro, '#12161a').toFixed(2)}`);
  }
}

console.log('\n— el color suave de fondo —');

{
  // Tiene que quedar CERCA del fondo, no ser el color a media asta:
  // es un fondo de botón secundario, no un botón primario pálido.
  const suave = mezclar('#7c3aed', '#ffffff', 0.92);
  comprobar('mezclado al 92% queda casi blanco', razon(suave, '#ffffff') < 1.3, suave);
  comprobar('y el texto de marca se lee encima',
    razon(paraTexto('#7c3aed', '#ffffff'), suave) >= AA);
}

// ── 2. abierto o cerrado, en hora del negocio ───────────────────
console.log('\n— abierto ahora —');

const TZ = 'America/Montevideo';

function negocio(horarios: Array<[number, string, string]>): Negocio {
  return {
    cliente: { timezone: TZ } as any,
    servicios: [],
    horarios: horarios.map(([d, desde, hasta]) =>
      ({ dia_semana: d, desde: desde + ':00', hasta: hasta + ':00' } as Horario)),
    baseConocimiento: '',
  } as Negocio;
}

// Lunes a viernes 9-19, sábado 9-13. Como Clínica Solé.
const solé = negocio([
  [1, '09:00', '19:00'], [2, '09:00', '19:00'], [3, '09:00', '19:00'],
  [4, '09:00', '19:00'], [5, '09:00', '19:00'], [6, '09:00', '13:00'],
]);

{
  // 2026-03-10 es martes. Montevideo es UTC-3.
  const e = (iso: string) => estadoApertura(solé, new Date(iso));

  comprobar('martes 15:00 local → abierto, cierra 19:00',
    e('2026-03-10T18:00:00Z')?.texto === 'Abierto ahora · cierra 19:00',
    JSON.stringify(e('2026-03-10T18:00:00Z')));

  comprobar('martes 08:00 local → cerrado, abre hoy',
    e('2026-03-10T11:00:00Z')?.texto === 'Cerrado · abre hoy 09:00',
    JSON.stringify(e('2026-03-10T11:00:00Z')));

  comprobar('martes 21:30 local → cerrado, abre mañana',
    e('2026-03-11T00:30:00Z')?.texto === 'Cerrado · abre mañana 09:00',
    JSON.stringify(e('2026-03-11T00:30:00Z')));

  // El caso que rompe si se usa el día UTC: a las 00:30 UTC del
  // miércoles, en Montevideo todavía es martes de noche.
  comprobar('a las 00:30 UTC sigue siendo el día anterior allá',
    e('2026-03-11T00:30:00Z')?.abierto === false);

  // Sábado 14 de marzo, después de las 13:00: el domingo cierra, así
  // que lo próximo es el lunes.
  comprobar('sábado de tarde → abre el lunes',
    e('2026-03-14T17:00:00Z')?.texto === 'Cerrado · abre lunes 09:00',
    JSON.stringify(e('2026-03-14T17:00:00Z')));

  comprobar('justo a las 19:00 ya está cerrado',
    e('2026-03-10T22:00:00Z')?.abierto === false,
    JSON.stringify(e('2026-03-10T22:00:00Z')));

  comprobar('justo a las 09:00 ya está abierto',
    e('2026-03-10T12:00:00Z')?.abierto === true,
    JSON.stringify(e('2026-03-10T12:00:00Z')));
}

{
  // Una demo recién generada puede no tener horarios. Mejor no decir
  // nada que decir "cerrado" sobre un negocio que está abierto.
  comprobar('sin horarios cargados no inventa un estado',
    estadoApertura(negocio([])) === null);

  // Corte de mediodía: 9-13 y 15-19.
  const conCorte = negocio([[2, '09:00', '13:00'], [2, '15:00', '19:00']]);
  comprobar('en el corte del mediodía dice que abre más tarde',
    estadoApertura(conCorte, new Date('2026-03-10T17:00:00Z'))?.texto === 'Cerrado · abre hoy 15:00',
    JSON.stringify(estadoApertura(conCorte, new Date('2026-03-10T17:00:00Z'))));
}

// La forma corta, que usa la cabecera del chat: sin ella el subtítulo
// se cortaba en "en línea · el local abre mañan".
console.log('\n— la forma corta para el chat —');
{
  const e = (iso: string) => estadoApertura(solé, new Date(iso));
  comprobar('abierto → "abierto hasta 19:00"',
    e('2026-03-10T18:00:00Z')?.corto === 'abierto hasta 19:00', e('2026-03-10T18:00:00Z')?.corto);
  comprobar('cerrado → "abre mañana 09:00"',
    e('2026-03-11T00:30:00Z')?.corto === 'abre mañana 09:00', e('2026-03-11T00:30:00Z')?.corto);
  comprobar('la forma corta entra en la cabecera (≤ 22 caracteres)',
    ['2026-03-10T18:00:00Z','2026-03-11T00:30:00Z','2026-03-10T11:00:00Z','2026-03-14T17:00:00Z']
      .every(i => (e(i)?.corto.length ?? 99) <= 22));
}

// ── 3. el número de WhatsApp (regresión del paso 9) ─────────────
console.log('\n— el número de WhatsApp —');

function conTelefono(t: string): Negocio {
  return { cliente: { telefono_display: t } as any, servicios: [], horarios: [], baseConocimiento: '' } as Negocio;
}

comprobar('elige el celular y no el fijo',
  numeroWa(conTelefono('2711 9115 / 095 374 187')) === '59895374187',
  numeroWa(conTelefono('2711 9115 / 095 374 187')));
comprobar('un celular solo, en formato local', numeroWa(conTelefono('099 123 456')) === '59899123456');
comprobar('ya internacional queda igual', numeroWa(conTelefono('+598 99 123 456')) === '59899123456');
comprobar('sin teléfono devuelve vacío', numeroWa(conTelefono('')) === '');

console.log(`\n${ok} bien, ${mal} mal`);
if (mal) process.exit(1);
