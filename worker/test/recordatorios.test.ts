/**
 * Pruebas del recordatorio, sin red y sin base.
 * Correr con: npm run test
 *
 * Lo que se prueba acá es lo que se rompe en silencio: cómo se escribe
 * "cuándo" en el mensaje que le llega a una persona, en qué hora del
 * negocio estamos (y no en la del servidor, que es UTC), y que el
 * botón de la plantilla vuelva identificable.
 */
import { cuandoLegible, horaLocal, destinatario } from '../src/recordatorios';
import { normalizarTelefono } from '../src/db';
import { parsearWebhook } from '../src/whatsapp';
import { BTN_CONFIRMO, BTN_CAMBIO, DEFINICIONES, RECORDATORIO } from '../src/plantillas';

let ok = 0, mal = 0;
function comprobar(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) { ok++; console.log(`  ok  ${nombre}`); }
  else { mal++; console.log(`  MAL ${nombre}${detalle ? '  → ' + detalle : ''}`); }
}

const TZ = 'America/Montevideo';

// ── cuándo, escrito para que lo lea una persona ─────────────────
console.log('\n— cómo se escribe el cuándo —');

{
  // Montevideo es UTC-3: las 18:00 UTC son las 15:00 allá.
  const hoy = new Date('2026-03-10T12:00:00Z');            // 09:00 local
  const turnoHoy = new Date('2026-03-10T18:00:00Z');       // 15:00 local
  comprobar('el mismo día dice "hoy" y no la fecha',
    cuandoLegible(turnoHoy, TZ, hoy) === 'hoy a las 15:00',
    cuandoLegible(turnoHoy, TZ, hoy));

  const turnoManana = new Date('2026-03-11T18:00:00Z');    // miércoles 11
  const texto = cuandoLegible(turnoManana, TZ, hoy);
  comprobar('el día siguiente dice "mañana" con día y número',
    texto === 'mañana miércoles 11 a las 15:00', texto);

  // Puede pasar si el turno se movió y el recordatorio se soltó.
  const pasado = new Date('2026-03-13T18:00:00Z');
  comprobar('más lejos no miente diciendo "mañana"',
    !cuandoLegible(pasado, TZ, hoy).includes('mañana'),
    cuandoLegible(pasado, TZ, hoy));
}

{
  // El caso que rompe si se compara con la fecha UTC en vez de la
  // local: a las 02:00 UTC en Montevideo todavía es el día anterior.
  const ahora = new Date('2026-03-11T02:00:00Z');          // 10/03 23:00 local
  const turno = new Date('2026-03-11T13:00:00Z');          // 11/03 10:00 local
  const texto = cuandoLegible(turno, TZ, ahora);
  comprobar('cruzando la medianoche UTC sigue contando en hora del negocio',
    texto === 'mañana miércoles 11 a las 10:00', texto);
}

// ── la hora del negocio, no la del servidor ─────────────────────
console.log('\n— la hora del negocio —');

comprobar('las 12:00 UTC son las 09:00 en Montevideo',
  horaLocal(TZ, new Date('2026-03-10T12:00:00Z')) === 9);
comprobar('las 02:00 UTC son las 23:00 del día anterior',
  horaLocal(TZ, new Date('2026-03-11T02:00:00Z')) === 23);
comprobar('la medianoche local da 0 y no 24',
  horaLocal(TZ, new Date('2026-03-11T03:00:00Z')) === 0);
{
  // Sin esto, el corte de las 21:00 se evalúa contra UTC y a las
  // 21:00 de Montevideo (00:00 UTC) el cron se creería que es de día.
  const nocheUy = new Date('2026-03-11T00:30:00Z');        // 21:30 local
  comprobar('las 21:30 locales caen fuera de la franja civilizada',
    horaLocal(TZ, nocheUy) >= 21);
}

// ── el botón vuelve identificable ───────────────────────────────
console.log('\n— la respuesta al botón —');

function webhookBoton(payload: string, texto: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: '102290129340398',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '598999000000', phone_number_id: '106540352242922' },
          contacts: [{ profile: { name: 'Ana Pérez' }, wa_id: '59899111222' }],
          messages: [{
            from: '59899111222',
            id: 'wamid.HBgLNTk4OTkxMTEyMjIVAgAS',
            timestamp: '1757000000',
            type: 'button',
            button: { payload, text: texto },
          }],
        },
      }],
    }],
  };
}

{
  const [e] = parsearWebhook(webhookBoton(BTN_CONFIRMO, 'Confirmar'));
  comprobar('el payload del botón llega entero', e?.mensaje.payloadBoton === BTN_CONFIRMO);
  comprobar('y el texto visible también', e?.mensaje.texto === 'Confirmar');
  comprobar('se sigue leyendo como un mensaje de texto', e?.mensaje.tipo === 'otro' || e?.mensaje.tipo === 'texto');
}

{
  const [e] = parsearWebhook(webhookBoton(BTN_CAMBIO, 'Necesito cambiarlo'));
  comprobar('el otro botón no se confunde con el de confirmar',
    e?.mensaje.payloadBoton === BTN_CAMBIO && e?.mensaje.payloadBoton !== BTN_CONFIRMO);
}

{
  // Un mensaje escrito a mano NO puede parecer un botón: si esto
  // fallara, escribir "Confirmar" confirmaría un turno sin querer.
  const normal = {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: '106540352242922' },
      messages: [{ from: '59899111222', id: 'wamid.X', type: 'text', text: { body: 'Confirmar' } }],
    } }] }],
  };
  const [e] = parsearWebhook(normal);
  comprobar('escribir "Confirmar" a mano no cuenta como botón',
    e?.mensaje.payloadBoton === undefined);
}

// ── la plantilla, contra las reglas de Meta ─────────────────────
console.log('\n— la plantilla que se manda a aprobar —');

{
  const rec = DEFINICIONES.find(d => d.name === RECORDATORIO)!;
  const body = rec.components.find(c => c.type === 'BODY') as any;
  const botones = rec.components.find(c => c.type === 'BUTTONS') as any;

  const vars = [...String(body.text).matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]));
  comprobar('las variables están numeradas 1..n sin saltos',
    JSON.stringify(vars) === JSON.stringify([1, 2, 3, 4]), JSON.stringify(vars));
  comprobar('hay un ejemplo por cada variable',
    body.example.body_text[0].length === vars.length);
  comprobar('el cuerpo no empieza con una variable',
    !String(body.text).trimStart().startsWith('{{'));
  comprobar('el cuerpo no termina con una variable',
    !/\{\{\d+\}\}\s*$/.test(String(body.text)));
  comprobar('no hay dos variables pegadas',
    !/\}\}\s*\{\{/.test(String(body.text)));
  comprobar('es UTILITY y no MARKETING', rec.category === 'UTILITY');
  comprobar('los botones entran en los 25 caracteres de Meta',
    botones.buttons.every((b: any) => b.text.length <= 25));
}

// ── el número al que se manda ───────────────────────────────────
console.log('\n— el teléfono —');

{
  // La misma persona escrita de cinco formas. Si estas no dan todas
  // lo mismo, el recordatorio rebota con 131030 y además cancelar y
  // reprogramar no encuentran el turno de quien está escribiendo.
  const formas = ['59899123456', '+598 99 123 456', '099 123 456', '099123456', '99123456'];
  const normalizadas = formas.map(normalizarTelefono);
  comprobar('las cinco formas del mismo celular dan el mismo número',
    new Set(normalizadas).size === 1 && normalizadas[0] === '59899123456',
    normalizadas.join(' | '));

  comprobar('el 00 internacional se saca', normalizarTelefono('0059899123456') === '59899123456');
  comprobar('un fijo de Montevideo también queda con código de país',
    normalizarTelefono('2712 3456') === '59827123456');
  comprobar('un número de otro país se deja intacto y no se le pega 598',
    normalizarTelefono('+54 9 11 2345 6789') === '5491123456789');
  comprobar('vacío es vacío, no "598"', normalizarTelefono('') === '');
}

{
  const base = {
    id: 't1', cliente_id: 'c1', servicio_nombre: 'Limpieza facial',
    inicio: '2026-03-11T18:00:00Z', nombre: 'Ana Pérez',
    clientes: { slug: 'x', nombre: 'X', timezone: TZ, wa_phone_number_id: '1' },
  };

  // El caso real que falló: ella tipeó su número en formato local y
  // Meta rechazó el envío con "el destinatario no está en la lista".
  comprobar('manda al número de WhatsApp, no al que tipeó la persona',
    destinatario({ ...base, telefono: '099123456',
      conversaciones: { telefono: '59899123456', canal: 'whatsapp' } } as any) === '59899123456');

  comprobar('sin conversación de WhatsApp usa el del turno, normalizado',
    destinatario({ ...base, telefono: '099123456', conversaciones: null } as any) === '59899123456');

  // Una conversación web tiene un id de sesión donde iría el teléfono.
  comprobar('una conversación web no se usa como destinatario',
    destinatario({ ...base, telefono: '099123456',
      conversaciones: { telefono: null, canal: 'web' } } as any) === '59899123456');
}

console.log(`\n${ok} bien, ${mal} mal`);
if (mal) process.exit(1);
