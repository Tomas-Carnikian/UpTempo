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
import { afirmaQueAgendo, cargarHistorial, contextoDeConversacion } from '../src/cerebro';
import type { TurnoVigente } from '../src/agenda';

let ok = 0, mal = 0;
function comprobar(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) { ok++; console.log(`  ok  ${nombre}`); }
  else { mal++; console.log(`  MAL ${nombre}${detalle ? '  → ' + detalle : ''}`); }
}

async function main() {
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

  // ── El recordatorio que el modelo nunca llegaba a leer ────────
  //
  // 9/9, 09:56. El recordatorio decía "Peeling químico, hoy a las
  // 14:00"; tres minutos después, ante "Necesito cambiarlo", el
  // asistente preguntó de qué servicio era el turno.
  //
  // La causa: como habían pasado más de 12 h del último mensaje, el
  // recordatorio abrió una conversación NUEVA y era el único mensaje
  // que había. La API exige que el historial empiece por el usuario,
  // así que el `while` del final lo descartaba. El modelo recibía un
  // solo mensaje: "Necesito cambiarlo".
  console.log('\n— el historial no puede tirar contexto —');

  const sbMensajes = (filas: any[]) => ({
    from: () => {
      const q: any = {
        select: () => q, eq: () => q, order: () => q,
        limit: async () => ({ data: [...filas].reverse() }),  // la consulta va desc
      };
      return q;
    },
  }) as any;

  const RECORDATORIO = 'Hola Tomás, te recordamos tu turno en Clínica Solé: ' +
    'Peeling químico, hoy a las 14:00. Si necesitás cambiarlo, respondé este mensaje.';

  // Orden real: recordatorio (nuestro) y después el botón (suyo).
  let h = await cargarHistorial(sbMensajes([
    { rol: 'asistente', texto: RECORDATORIO, tipo: 'texto' },
    { rol: 'usuario', texto: 'Necesito cambiarlo', tipo: 'texto' },
  ]), 'conv-1');
  comprobar('el historial que se manda arranca por el usuario (lo exige la API)',
    h.mensajes.every((m, i) => i > 0 || m.role === 'user'));
  comprobar('el recordatorio NO se pierde: queda como huérfano',
    h.huerfanos.length === 1 && h.huerfanos[0].includes('Peeling químico'),
    JSON.stringify(h.huerfanos));

  // Conversación normal: nada huérfano y no se pierde nada.
  h = await cargarHistorial(sbMensajes([
    { rol: 'usuario', texto: 'hola, cuánto sale el peeling?', tipo: 'texto' },
    { rol: 'asistente', texto: 'Sale $U 1.800.', tipo: 'texto' },
    { rol: 'usuario', texto: 'y dura mucho?', tipo: 'texto' },
  ]), 'conv-2');
  comprobar('una conversación normal no deja huérfanos', h.huerfanos.length === 0);
  comprobar('y conserva los mensajes previos', h.mensajes.length === 2,
    JSON.stringify(h.mensajes));

  comprobar('una conversación vacía no rompe',
    (await cargarHistorial(sbMensajes([{ rol: 'usuario', texto: 'hola', tipo: 'texto' }]), 'c'))
      .mensajes.length === 0);

  console.log('\n— el contexto que se le pasa al modelo —');

  const TZ = 'America/Montevideo';
  const turno: TurnoVigente = {
    id: 't1', servicio_id: 's3', servicio_nombre: 'Peeling químico',
    inicio: new Date(Date.now() + 4 * 3600_000).toISOString(),
    estado: 'agendado', calendar_event_id: null,
  };

  const ctx = contextoDeConversacion(turno, [RECORDATORIO], TZ) ?? '';
  comprobar('le dice de qué servicio es el turno', ctx.includes('Peeling químico'));
  comprobar('le prohíbe preguntar cuál es', /NO se lo preguntes/.test(ctx));
  comprobar('le pasa lo último que escribimos', ctx.includes('te recordamos tu turno'));
  comprobar('deja agendar otro turno distinto', /turno nuevo y distinto/.test(ctx));

  const ctxConfirmado = contextoDeConversacion({ ...turno, estado: 'confirmado' }, [], TZ) ?? '';
  comprobar('dice si ya estaba confirmado', ctxConfirmado.includes('ya confirmado'));
  comprobar('sin turno y sin huérfanos, no agrega nada al system',
    contextoDeConversacion(null, [], TZ) === undefined);
  comprobar('con huérfanos pero sin turno, igual pasa el contexto',
    (contextoDeConversacion(null, [RECORDATORIO], TZ) ?? '').includes('Peeling químico'));

  console.log(`\n${ok} bien, ${mal} mal\n`);
  process.exit(mal === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
