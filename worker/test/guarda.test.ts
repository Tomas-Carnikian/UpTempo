/**
 * La guarda del "turno fantasma".
 *
 * El asistente contestó "Turno agendado: Masajes, mañana a las 10:00"
 * sin que la herramienta hubiera agendado nada: ni turno en la base ni
 * evento. Es el peor error posible del producto — la persona espera un
 * turno que no existe — así que la defensa es código, no prompt.
 *
 * Lo que se prueba acá es la mitad determinista: distinguir una
 * AFIRMACIÓN ("quedó agendado") de una PREGUNTA ("¿te lo agendo?").
 * Un falso positivo hace que el asistente derive cuando no hacía falta;
 * un falso negativo deja pasar el bug entero.
 */
import { afirmaQueAgendo } from '../src/cerebro';

let ok = 0, mal = 0;
function comprobar(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) { ok++; console.log(`  ok  ${nombre}`); }
  else { mal++; console.log(`  MAL ${nombre}${detalle ? '  → ' + detalle : ''}`); }
}

function main() {
  console.log('\n— afirma que agendó (tiene que dar SÍ) —');
  const afirma = [
    'Turno agendado: Masajes, mañana 9 de setiembre a las 10:00.',
    'Listo, quedó agendado para el jueves a las 15:00.',
    'Perfecto Tomás, te esperamos mañana a las 10.',
    'Ya te lo anoté para el viernes.',
    'Quedó el turno el martes 14:30.',
    'Listo. Reservado a las 9:00.',
    'Tu turno quedó agendado. ¿Necesitás algo más?',
  ];
  for (const t of afirma) comprobar(`"${t.slice(0, 46)}…"`, afirmaQueAgendo(t) === true);

  console.log('\n— NO afirma (tiene que dar NO) —');
  const noAfirma = [
    '¿Te lo agendo para mañana a las 10:00?',
    '¿Querés que te lo reserve?',
    'Tenemos lugar mañana a las 8:00, 10:30 o 12:30. ¿Cuál te viene mejor?',
    '¿Cómo te llamás?',
    'Dura 30 minutos.',
    'Ofrecemos depilación definitiva, masajes y estética facial.',
    'Ese horario ya no está libre, ¿te va otro?',
    '¿Te lo dejo agendado a las 10?',
    'Dejame que lo confirmo con el equipo y te escribo.',
  ];
  for (const t of noAfirma) comprobar(`"${t.slice(0, 46)}…"`, afirmaQueAgendo(t) === false);

  console.log(`\n${ok} bien, ${mal} mal\n`);
  process.exit(mal === 0 ? 0 : 1);
}

main();
