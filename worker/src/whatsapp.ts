import type { Env, MensajeEntrante, TipoMensaje } from './tipos';

/**
 * Canal WhatsApp — Cloud API de Meta, directa.
 *
 * Este archivo solo traduce: convierte lo que manda Meta en un
 * MensajeEntrante y convierte una respuesta en una llamada a la API.
 * El cerebro (responder()) es exactamente el mismo que el del chat web.
 *
 * Un solo token para todos los clientes: el System User token de la
 * app administra todas las WABAs a las que se le dio acceso. A que
 * negocio pertenece un mensaje lo dice el phone_number_id que lo
 * recibio, nunca algo que venga del remitente.
 */

/**
 * Version de la Graph API. Meta la rota cada tanto y las viejas dejan
 * de responder. Confirmá cuál te muestra el panel de la app al crearla
 * y, si no coincide, cargá WA_API_VERSION como variable.
 */
const VERSION_POR_DEFECTO = 'v21.0';

export function api(env: Env): string {
  const v = (env.WA_API_VERSION ?? '').trim() || VERSION_POR_DEFECTO;
  return `https://graph.facebook.com/${v}`;
}

/**
 * Un fallo de la API de Meta con el codigo a la vista.
 *
 * La diferencia importa mucho en el cron del recordatorio: ante un 500
 * o un 429 hay que reintentar dentro de 15 minutos, y ante un 400
 * ("la plantilla no existe", "el numero no es valido") hay que dejar de
 * intentar y avisar. Reintentar un error permanente cada 15 minutos
 * para siempre es la forma mas rapida de quemar el numero.
 */
export class ErrorWa extends Error {
  constructor(mensaje: string, readonly status: number, readonly codigo?: number) {
    super(mensaje);
    this.name = 'ErrorWa';
  }
  /** true = no tiene sentido reintentar: reintentar no lo va a arreglar. */
  get permanente(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 429;
  }
}

async function fallo(r: Response, contexto: string): Promise<ErrorWa> {
  const cuerpo = await r.text();
  let codigo: number | undefined;
  try { codigo = JSON.parse(cuerpo)?.error?.code; } catch { /* no era JSON */ }
  return new ErrorWa(`WhatsApp ${r.status} ${contexto}: ${cuerpo.slice(0, 300)}`, r.status, codigo);
}

export function hayWhatsapp(env: Env): boolean {
  return Boolean(env.WA_TOKEN?.trim() && env.WA_VERIFY_TOKEN?.trim());
}

// ── 1. Verificación del webhook ─────────────────────────────────
// Meta pega un GET con estos tres parámetros cuando configurás la URL
// y espera que le devuelvas el challenge tal cual, en texto plano.

export function verificarWebhook(env: Env, url: URL): Response {
  const modo = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge') ?? '';

  if (modo === 'subscribe' && token && token === env.WA_VERIFY_TOKEN?.trim()) {
    return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
  }
  console.error('[wa] verificación rechazada: el verify token no coincide');
  return new Response('no', { status: 403 });
}

// ── 2. Firma ────────────────────────────────────────────────────
/**
 * Meta firma cada POST con HMAC-SHA256 del cuerpo crudo usando el
 * secreto de la app. Sin esta comprobación, cualquiera que descubra
 * la URL puede hacer que el asistente conteste y gaste llamadas al
 * modelo — y peor, escribirle a numeros reales en nombre del cliente.
 *
 * Si no hay WA_APP_SECRET cargado, NO se acepta el mensaje: es
 * preferible un webhook que no anda a uno que acepta cualquier cosa.
 */
export async function firmaValida(env: Env, cuerpo: string, cabecera: string | null): Promise<boolean> {
  const secreto = env.WA_APP_SECRET?.trim();
  if (!secreto) { console.error('[wa] falta WA_APP_SECRET'); return false; }
  if (!cabecera?.startsWith('sha256=')) return false;

  const clave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(cuerpo));
  const esperado = [...new Uint8Array(firma)].map(b => b.toString(16).padStart(2, '0')).join('');
  const recibido = cabecera.slice('sha256='.length);

  // Comparación de tiempo constante: comparar con === filtra
  // información por el tiempo que tarda en fallar.
  if (esperado.length !== recibido.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ recibido.charCodeAt(i);
  return dif === 0;
}

// ── 3. Parseo ───────────────────────────────────────────────────

export interface EntranteWa {
  phoneNumberId: string;
  mensaje: MensajeEntrante;
  mediaId?: string;
}

/**
 * El `timestamp` de Meta, en segundos, a Date. undefined si no vino o
 * es basura: sin fecha, el mensaje se trata como recien llegado.
 */
export function fechaDeMeta(ts: unknown): Date | undefined {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return new Date(n * 1000);
}

/**
 * ¿Este mensaje es tan viejo que contestarlo es peor que no hacerlo?
 *
 * Meta reintenta durante HORAS lo que no pudo entregar. El 8/9, con el
 * webhook apuntando a una URL muerta, se acumularon tres mensajes; al
 * arreglar la URL, Meta vacio la cola de a poco y el asistente los
 * contesto a las 19:27 y a las 20:22 — uno y dos horas tarde. El codigo
 * hizo lo correcto y el resultado igual estuvo mal: a una clienta le
 * habria llegado "¿Para que servicio te interesa el turno?" dos horas
 * despues, sin contexto, y parece un bot roto.
 *
 * La idempotencia evita contestar DOS VECES el mismo mensaje; esto
 * evita contestar TARDE uno viejo. Son cosas distintas.
 *
 * Quince minutos: los retrasos normales de Meta son de segundos.
 */
export const EDAD_MAXIMA_MIN = 15;

export function demasiadoViejo(
  enviadoEn: Date | undefined, ahora = new Date(), minutos = EDAD_MAXIMA_MIN,
): boolean {
  if (!enviadoEn || Number.isNaN(enviadoEn.getTime())) return false;
  return (ahora.getTime() - enviadoEn.getTime()) > minutos * 60_000;
}

const TIPOS: Record<string, TipoMensaje> = {
  text: 'texto', audio: 'audio', voice: 'audio', image: 'imagen',
  video: 'otro', sticker: 'imagen', document: 'documento',
  location: 'otro', contacts: 'otro',
};

/**
 * Un solo webhook puede traer varios mensajes y de varios numeros.
 * Los `statuses` (entregado, leido) llegan por el mismo canal y se
 * ignoran: no son mensajes de nadie.
 */
export function parsearWebhook(cuerpo: any): EntranteWa[] {
  const salida: EntranteWa[] = [];

  for (const entrada of cuerpo?.entry ?? []) {
    for (const cambio of entrada?.changes ?? []) {
      const valor = cambio?.value;
      if (!valor?.messages?.length) continue;

      const phoneNumberId = valor?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const nombres = new Map<string, string>();
      for (const c of valor.contacts ?? []) {
        if (c?.wa_id && c?.profile?.name) nombres.set(c.wa_id, c.profile.name);
      }

      for (const m of valor.messages) {
        const tipo = TIPOS[m?.type] ?? 'otro';
        const texto = m?.text?.body
          ?? m?.button?.text
          ?? m?.interactive?.list_reply?.title
          ?? m?.interactive?.button_reply?.title
          ?? m?.image?.caption
          ?? m?.video?.caption
          ?? '';

        // Tocar un boton de una plantilla llega como type:"button" con
        // el payload que pusimos al enviarla. Un boton de un mensaje
        // interactivo (no plantilla) llega como interactive.button_reply.
        const payloadBoton = m?.button?.payload
          ?? m?.interactive?.button_reply?.id
          ?? undefined;

        salida.push({
          phoneNumberId,
          mediaId: m?.image?.id ?? m?.audio?.id ?? m?.voice?.id ?? m?.document?.id,
          mensaje: {
            canal: 'whatsapp',
            texto: String(texto).slice(0, 4000),
            tipo,
            identificador: String(m?.from ?? ''),
            nombreContacto: nombres.get(String(m?.from ?? '')),
            waMessageId: String(m?.id ?? ''),
            enviadoEn: fechaDeMeta(m?.timestamp),
            payloadBoton: payloadBoton ? String(payloadBoton).slice(0, 128) : undefined,
          },
        });
      }
    }
  }
  return salida;
}

// ── 4. Envío ────────────────────────────────────────────────────

/**
 * Contestar dentro de la ventana de 24 h es gratis y va como texto
 * libre. La ventana se abre cada vez que la persona escribe.
 */
export async function enviarTexto(
  env: Env, phoneNumberId: string, para: string, texto: string,
): Promise<void> {
  const r = await fetch(`${api(env)}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.WA_TOKEN!.trim()}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: para,
      type: 'text',
      text: { preview_url: false, body: texto.slice(0, 4096) },
    }),
  });
  if (!r.ok) throw await fallo(r, 'al enviar texto');
}

/**
 * Fuera de la ventana de 24 h no sale texto libre: rebota. Lo unico
 * que entra es una plantilla aprobada por Meta, con las variables
 * rellenadas por posicion.
 *
 * Esta es la parte del producto que se paga por mensaje. Todo lo demas
 * (contestar, agendar, derivar) es gratis porque siempre ocurre dentro
 * de la ventana que abrio la persona al escribir.
 */
export async function enviarPlantilla(
  env: Env, phoneNumberId: string, para: string,
  p: { nombre: string; idioma: string; variables: string[]; botones?: string[] },
): Promise<void> {
  const componentes: any[] = [];

  if (p.variables.length) {
    componentes.push({
      type: 'body',
      // Por posicion: el orden de este array ES el {{1}}, {{2}}, {{3}}.
      parameters: p.variables.map(v => ({ type: 'text', text: String(v).slice(0, 900) })),
    });
  }

  // El payload es lo que nos vuelve cuando tocan el boton. El texto
  // visible no sirve para decidir: cambia con el idioma y con lo que
  // Meta haya aprobado.
  (p.botones ?? []).forEach((payload, i) => {
    componentes.push({
      type: 'button', sub_type: 'quick_reply', index: String(i),
      parameters: [{ type: 'payload', payload }],
    });
  });

  const r = await fetch(`${api(env)}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.WA_TOKEN!.trim()}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: para,
      type: 'template',
      template: {
        name: p.nombre,
        language: { code: p.idioma },
        components: componentes,
      },
    }),
  });
  if (!r.ok) throw await fallo(r, `al enviar la plantilla "${p.nombre}"`);
}

/** Los dos tildes azules. Barato, y le dice a la persona que llegó. */
export async function marcarLeido(env: Env, phoneNumberId: string, messageId: string): Promise<void> {
  try {
    await fetch(`${api(env)}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.WA_TOKEN!.trim()}`,
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
    });
  } catch { /* que falle el tilde no puede tumbar la respuesta */ }
}

// ── 5. Media ────────────────────────────────────────────────────
/**
 * Bajar una imagen es en dos pasos: primero se pide la URL, después
 * se descarga con el token.
 *
 * OJO: hoy no se usa. Ante una imagen el asistente deriva sin mirarla,
 * y esa regla es codigo, no configuracion. Esto queda para el dia que
 * haga falta guardar un comprobante de pago, que es otra cosa.
 */
export async function descargarMedia(
  env: Env, mediaId: string,
): Promise<{ mime: string; datos: ArrayBuffer } | null> {
  const meta = await fetch(`${api(env)}/${mediaId}`, {
    headers: { authorization: `Bearer ${env.WA_TOKEN!.trim()}` },
  });
  if (!meta.ok) return null;
  const j = await meta.json() as { url?: string; mime_type?: string };
  if (!j.url) return null;

  const bin = await fetch(j.url, { headers: { authorization: `Bearer ${env.WA_TOKEN!.trim()}` } });
  if (!bin.ok) return null;
  return { mime: j.mime_type ?? 'application/octet-stream', datos: await bin.arrayBuffer() };
}

// ── 6. Atribución de la página de turnos ────────────────────────
/**
 * Los botones de la pagina abren WhatsApp con un texto ya escrito:
 * "Hola! Quiero consultar por <servicio>." Si el primer mensaje de una
 * conversacion tiene esa forma exacta, vino de la pagina.
 *
 * Es una heuristica y se comporta como tal: si falla, el evento queda
 * como 'whatsapp' y no se rompe nada.
 */
const PATRON_PAGINA = /^\s*hola!?\s+quiero consultar por\s+(.+?)\.?\s*$/i;

export function vinoDeLaPagina(texto: string): { origen: 'pagina'; servicio: string } | null {
  const m = texto.match(PATRON_PAGINA);
  return m ? { origen: 'pagina', servicio: m[1].trim() } : null;
}
