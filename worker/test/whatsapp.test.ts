/**
 * Pruebas del canal WhatsApp, sin red.
 * Correr con: npm run test
 *
 * Lo que se prueba acá es lo que no se puede probar contra Meta sin
 * un número real: que el payload se lea bien, que la firma rechace lo
 * que tiene que rechazar, y que la atribución de la página no se
 * dispare de más.
 */
import {
  parsearWebhook, firmaValida, vinoDeLaPagina, verificarWebhook,
  fechaDeMeta, demasiadoViejo, EDAD_MAXIMA_MIN,
} from '../src/whatsapp';
import type { Env } from '../src/tipos';

let ok = 0, mal = 0;
function comprobar(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) { ok++; console.log(`  ok  ${nombre}`); }
  else { mal++; console.log(`  MAL ${nombre}${detalle ? '  → ' + detalle : ''}`); }
}

const env = {
  WA_VERIFY_TOKEN: 'token-de-verificacion-inventado',
  WA_APP_SECRET: 'secreto-de-la-app',
} as unknown as Env;

/** Payload como el que manda Meta de verdad. */
function webhookTexto(texto: string, tipo = 'text', extra: any = {}) {
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
            type: tipo,
            ...(tipo === 'text' ? { text: { body: texto } } : {}),
            ...extra,
          }],
        },
      }],
    }],
  };
}

async function firmarComo(secreto: string, cuerpo: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const f = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(cuerpo));
  return 'sha256=' + [...new Uint8Array(f)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
  console.log('\n— leer el webhook —');
  const m = parsearWebhook(webhookTexto('hola, cuánto sale la limpieza facial?'));
  comprobar('saca un mensaje', m.length === 1, String(m.length));
  comprobar('identifica el número que RECIBIÓ el mensaje',
    m[0]?.phoneNumberId === '106540352242922', m[0]?.phoneNumberId);
  comprobar('el remitente es el identificador de la conversación',
    m[0]?.mensaje.identificador === '59899111222');
  comprobar('el canal es whatsapp', m[0]?.mensaje.canal === 'whatsapp');
  comprobar('trae el texto', m[0]?.mensaje.texto === 'hola, cuánto sale la limpieza facial?');
  comprobar('trae el nombre del contacto', m[0]?.mensaje.nombreContacto === 'Ana Pérez');
  comprobar('guarda el id para deduplicar',
    m[0]?.mensaje.waMessageId === 'wamid.HBgLNTk4OTkxMTEyMjIVAgAS');
  comprobar('guarda cuándo lo mandó la persona',
    m[0]?.mensaje.enviadoEn?.getTime() === 1757000000 * 1000,
    String(m[0]?.mensaje.enviadoEn));

  const img = parsearWebhook(webhookTexto('', 'image', { image: { id: 'media-123', caption: 'mirá' } }));
  comprobar('una imagen se marca como imagen', img[0]?.mensaje.tipo === 'imagen');
  comprobar('y guarda el id del archivo', img[0]?.mediaId === 'media-123');
  comprobar('el epígrafe de la foto entra como texto', img[0]?.mensaje.texto === 'mirá');

  const aud = parsearWebhook(webhookTexto('', 'audio', { audio: { id: 'aud-9' } }));
  comprobar('un audio se marca como audio', aud[0]?.mensaje.tipo === 'audio');

  // Los avisos de "entregado" y "leído" vienen por el mismo webhook.
  const est = parsearWebhook({
    object: 'whatsapp_business_account',
    entry: [{ id: '1', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      metadata: { phone_number_id: '106540352242922' },
      statuses: [{ id: 'wamid.x', status: 'delivered', recipient_id: '59899111222' }],
    } }] }],
  });
  comprobar('los avisos de entrega se ignoran', est.length === 0, String(est.length));
  comprobar('un webhook vacío no rompe', parsearWebhook({}).length === 0);
  comprobar('un webhook basura no rompe', parsearWebhook({ entry: [{ changes: [{}] }] }).length === 0);

  console.log('\n— mensajes viejos (cola de reintentos de Meta) —');
  comprobar('el timestamp de Meta viene en segundos',
    fechaDeMeta('1757000000')?.toISOString() === new Date(1757000000 * 1000).toISOString(),
    String(fechaDeMeta('1757000000')));
  comprobar('acepta el timestamp como número', fechaDeMeta(1757000000) instanceof Date);
  comprobar('sin timestamp, undefined', fechaDeMeta(undefined) === undefined);
  comprobar('un timestamp basura no rompe', fechaDeMeta('mañana') === undefined);
  comprobar('un timestamp en cero no cuenta', fechaDeMeta(0) === undefined);
  comprobar('un timestamp negativo no cuenta', fechaDeMeta(-5) === undefined);

  const ahora = new Date('2026-09-08T20:22:00Z');
  const hace = (min: number) => new Date(ahora.getTime() - min * 60_000);
  comprobar('recién llegado: se contesta', !demasiadoViejo(hace(0), ahora));
  comprobar('un minuto tarde: se contesta', !demasiadoViejo(hace(1), ahora));
  comprobar('justo en el límite: se contesta',
    !demasiadoViejo(hace(EDAD_MAXIMA_MIN), ahora));
  comprobar('un minuto pasado el límite: no se contesta',
    demasiadoViejo(hace(EDAD_MAXIMA_MIN + 1), ahora));
  // El caso real del 8/9: el mensaje de las 18:37 contestado a las 20:22.
  comprobar('el de hace dos horas: no se contesta', demasiadoViejo(hace(105), ahora));
  comprobar('sin fecha se contesta igual (no perdemos mensajes)',
    !demasiadoViejo(undefined, ahora));
  comprobar('una fecha inválida se trata como sin fecha',
    !demasiadoViejo(new Date('x'), ahora));
  // Reloj de Meta adelantado: un futuro cercano no es viejo.
  comprobar('un mensaje del futuro no es viejo', !demasiadoViejo(hace(-3), ahora));
  comprobar('el límite se puede ajustar', demasiadoViejo(hace(3), ahora, 2));

  console.log('\n— firma —');
  const cuerpo = JSON.stringify(webhookTexto('hola'));
  comprobar('acepta la firma correcta',
    await firmaValida(env, cuerpo, await firmarComo('secreto-de-la-app', cuerpo)));
  comprobar('rechaza una firma de otro secreto',
    !(await firmaValida(env, cuerpo, await firmarComo('otro-secreto', cuerpo))));
  comprobar('rechaza si el cuerpo fue modificado',
    !(await firmaValida(env, cuerpo + ' ', await firmarComo('secreto-de-la-app', cuerpo))));
  comprobar('rechaza sin cabecera', !(await firmaValida(env, cuerpo, null)));
  comprobar('rechaza una cabecera con otro formato', !(await firmaValida(env, cuerpo, 'sha1=abc')));
  comprobar('rechaza si NO hay secreto configurado',
    !(await firmaValida({} as Env, cuerpo, await firmarComo('secreto-de-la-app', cuerpo))));

  console.log('\n— verificación de la URL —');
  const okUrl = new URL('https://x/wa/webhook?hub.mode=subscribe&hub.challenge=1234' +
    '&hub.verify_token=token-de-verificacion-inventado');
  const res = verificarWebhook(env, okUrl);
  comprobar('devuelve el challenge', res.status === 200 && (await res.text()) === '1234');
  const malUrl = new URL('https://x/wa/webhook?hub.mode=subscribe&hub.challenge=1234&hub.verify_token=otro');
  comprobar('rechaza un token que no es el nuestro', verificarWebhook(env, malUrl).status === 403);

  console.log('\n— atribución de la página de turnos —');
  comprobar('reconoce el texto del botón',
    vinoDeLaPagina('Hola! Quiero consultar por Depilación definitiva piernas completas.')?.servicio
      === 'Depilación definitiva piernas completas');
  comprobar('tolera que le saquen el signo',
    vinoDeLaPagina('Hola quiero consultar por Peeling químico')?.servicio === 'Peeling químico');
  comprobar('no marca un mensaje escrito a mano',
    vinoDeLaPagina('hola, queria saber cuanto sale el peeling') === null);
  comprobar('no marca un saludo suelto', vinoDeLaPagina('Hola!') === null);

  console.log(`\n${ok} bien, ${mal} mal\n`);
  process.exit(mal === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
