import { Hono } from 'hono';
import type { Env, MensajeEntrante } from './tipos';
import { negocioPorSlug, negocioPorNumero, invalidarCache } from './db';
import {
  verificarWebhook, firmaValida, parsearWebhook, enviarTexto, marcarLeido, hayWhatsapp,
} from './whatsapp';
import { responder } from './cerebro';
import { paginaChat } from './chat-web';
import { paginaPanel } from './panel';
import { paginaTurnos } from './pagina-turnos';
import { revisarEnv, textoProblemas, esClaveSecreta } from './config';
import { hayGoogle } from './google';

/**
 * UN SOLO Worker para los 30 clientes.
 *
 * A que negocio pertenece un mensaje se decide siempre por como entro,
 * nunca por algo que mande el usuario:
 *   - web:      por el subdominio (clinicasole.uptempo.uy) o /c/<slug>
 *   - whatsapp: por el phone_number_id que recibio el mensaje (paso 7)
 *
 * Agregar un cliente es insertar filas. No se despliega nada.
 */
const app = new Hono<{ Bindings: Env }>();

/**
 * Subdominios del sistema. No pueden ser el slug de un cliente, y
 * conviene que esten reservados desde el principio: renombrarle el
 * subdominio a una clinica despues de imprimirlo en una tarjeta no
 * es una conversacion agradable.
 */
const RESERVADOS = new Set(['panel', 'www', 'api', 'admin', 'app', 'demo', 'uptempo', 'mail', 'blog']);

/** Saca el slug del host, o null si es un host que no es de cliente. */
function slugDeHost(host: string): string | null {
  const h = host.split(':')[0].toLowerCase();
  if (h.endsWith('.uptempo.uy')) {
    const sub = h.slice(0, -'.uptempo.uy'.length);
    return sub && !sub.includes('.') && !RESERVADOS.has(sub) ? sub : null;
  }
  return null;
}

function esHostDelPanel(host: string): boolean {
  return host.split(':')[0].toLowerCase() === 'panel.uptempo.uy';
}

/**
 * Antes que nada, las claves. Una credencial mal pegada produce
 * errores ilegibles ("Invalid header value") a tres capas de
 * distancia; mejor cortar acá y decir cual es y por que.
 */
app.use('*', async (c, next) => {
  if (c.req.path === '/health') return next();
  const problemas = revisarEnv(c.env);
  if (problemas.length) {
    console.error('[config]', problemas.map(p => `${p.clave}: ${p.que}`).join(' | '));
    return c.text(textoProblemas(problemas), 500);
  }
  return next();
});

app.get('/health', c => {
  const problemas = revisarEnv(c.env);
  return c.json({
    ok: problemas.length === 0,
    entorno: c.env.ENTORNO,
    claves: problemas.length ? problemas : 'las obligatorias están bien',
    google: hayGoogle(c.env)
      ? 'configurado'
      : 'sin configurar (la agenda usa solo los turnos de la base)',
    whatsapp: hayWhatsapp(c.env)
      ? 'configurado'
      : 'sin configurar (solo funciona el chat web)',
  }, problemas.length ? 500 : 200);
});

/** Purga el cache de config sin desplegar. Util despues de editar precios. */
app.post('/admin/recargar', c => { invalidarCache(); return c.json({ ok: true }); });

// ── Panel del dueño ─────────────────────────────────────────────
app.get('/panel', c => panelDe(c, '/panel'));

/**
 * Entrar al panel SIN mandar correo. Solo desde localhost.
 *
 * Supabase limita los correos de auth a 2 por hora y en el plan
 * gratis ese numero no se puede subir, asi que probar el panel tres
 * veces seguidas es imposible por correo. Esto usa la Admin API para
 * generar el mismo enlace magico y saltear el envio.
 *
 * La puerta esta cerrada por el HOST, no por una variable de entorno:
 * en produccion el host nunca es localhost, asi que no hay forma de
 * olvidarse de apagarla.
 */
app.get('/panel/enlace-dev', async c => {
  const host = (c.req.header('host') ?? '').split(':')[0].toLowerCase();
  if (host !== 'localhost' && host !== '127.0.0.1') return c.notFound();

  const email = (c.req.query('email') ?? '').trim();
  if (!email) return c.text('Falta ?email=', 400);

  const r = await fetch(`${c.env.SUPABASE_URL.trim()}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: c.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
      authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY.trim()}`,
    },
    // OJO: en la API REST `redirect_to` va en la RAIZ del body. Dentro
    // de `options` (que es la forma del SDK de JS) se ignora en
    // silencio y Supabase manda al Site URL del proyecto, que por
    // defecto es http://localhost:3000.
    body: JSON.stringify({
      type: 'magiclink',
      email,
      redirect_to: `http://${c.req.header('host')}/panel`,
    }),
  });
  if (!r.ok) return c.text(`Supabase: ${r.status} ${(await r.text()).slice(0, 300)}`, 500);

  const j = await r.json() as { action_link?: string };
  if (!j.action_link) return c.text('Supabase no devolvió un enlace.', 500);
  return c.redirect(j.action_link, 302);
});

function panelDe(c: any, ruta: string) {
  const key = (c.env.SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  if (!key) {
    return c.text(
      'Falta SUPABASE_PUBLISHABLE_KEY. Es la publishable key de Supabase ' +
      '(Settings → API Keys), la pública: va en el HTML del panel a propósito.', 500);
  }
  // Ultima linea antes de publicar la clave en una pagina web. Si acá
  // hay una credencial secreta, el panel NO se sirve: es preferible un
  // panel caído a una service_role escrita en el HTML.
  if (esClaveSecreta(key)) {
    console.error('[panel] SUPABASE_PUBLISHABLE_KEY contiene una clave secreta. Panel bloqueado.');
    return c.text(
      'El panel está apagado por seguridad: SUPABASE_PUBLISHABLE_KEY tiene una clave secreta, ' +
      'y esa variable se imprime en el HTML. Cargá la publishable (sb_publishable_…) y rotá la ' +
      'secreta que quedó mal puesta.', 500);
  }
  return c.html(paginaPanel(c.env.SUPABASE_URL.trim(), key, ruta));
}

/**
 * Puente para el enlace del correo.
 *
 * Los tokens vuelven en el fragmento (#access_token=…), que el
 * navegador NO manda al servidor: desde acá no hay forma de saber que
 * la visita trae una sesión. Si por lo que sea el enlace cae en la
 * raíz en vez de en /panel, esta página lo reenvía con el fragmento
 * intacto en vez de dejar al dueño mirando un texto que no entiende.
 */
const PUENTE = `<!doctype html><meta charset="utf-8">
<title>Uptempo</title>
<style>body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;
margin:14vh auto;max-width:34rem;padding:0 1.2rem;color:#0b0b0b;background:#f9f9f7}
a{color:#2a78d6}@media(prefers-color-scheme:dark){body{background:#0d0d0d;color:#fff}}</style>
<p id="m">Uptempo. <a href="/panel">Ir al panel</a></p>
<script>
if (location.hash && location.hash.indexOf('access_token') !== -1) {
  document.getElementById('m').textContent = 'Entrando…';
  location.replace('/panel' + location.hash);
}
</script>`;

// ── Página de turnos y chat ─────────────────────────────────────
//
// En el subdominio del cliente, la raíz es la PÁGINA DE TURNOS: es lo
// que se publica y lo que ve una clienta. El chat vive en /chat y es
// para los demos de venta, donde todavía no hay un WhatsApp que usar.
app.get('/', async c => {
  const host = c.req.header('host') ?? '';
  if (esHostDelPanel(host)) return panelDe(c, '/');
  const slug = slugDeHost(host);
  if (!slug) return c.html(PUENTE);
  return turnosDe(c, slug);
});

app.get('/chat', async c => {
  const slug = slugDeHost(c.req.header('host') ?? '');
  if (!slug) return c.notFound();
  return chatDe(c, slug, '/api/chat');
});

// En local no hay subdominios: /p/<slug> es la página, /c/<slug> el chat.
app.get('/p/:slug', async c => turnosDe(c, c.req.param('slug')));
app.get('/c/:slug', async c => chatDe(c, c.req.param('slug'), `/c/${c.req.param('slug')}/chat`));

async function turnosDe(c: any, slug: string) {
  const negocio = await negocioPorSlug(c.env, slug);
  if (!negocio) return c.text(`No encuentro el negocio "${slug}".`, 404);
  return c.html(paginaTurnos(negocio), 200, {
    // La página cambia cuando cambian los precios, no en cada visita.
    'cache-control': 'public, max-age=120, stale-while-revalidate=600',
  });
}

async function chatDe(c: any, slug: string, rutaApi: string) {
  const negocio = await negocioPorSlug(c.env, slug);
  if (!negocio) return c.text(`No encuentro el negocio "${slug}".`, 404);
  return c.html(paginaChat(negocio, rutaApi));
}

// ── API del chat ────────────────────────────────────────────────
app.post('/api/chat', async c => {
  const slug = slugDeHost(c.req.header('host') ?? '');
  if (!slug) return c.json({ error: 'sin negocio' }, 400);
  return conversar(c, slug);
});

app.post('/c/:slug/chat', async c => conversar(c, c.req.param('slug')));

async function conversar(c: any, slug: string) {
  const negocio = await negocioPorSlug(c.env, slug);
  if (!negocio) return c.json({ error: 'negocio inexistente' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const texto = String(body.texto ?? '').slice(0, 2000).trim();
  const sesion = String(body.sesion ?? '').slice(0, 100).trim();
  if (!texto || !sesion) return c.json({ error: 'faltan texto o sesion' }, 400);

  const entrada: MensajeEntrante = {
    canal: 'web',
    texto,
    tipo: (body.tipo === 'imagen' || body.tipo === 'audio') ? body.tipo : 'texto',
    identificador: sesion,
  };

  try {
    const r = await responder(c.env, negocio, entrada);
    return c.json({ texto: r.texto, derivada: r.derivada, ms: r.latenciaMs });
  } catch (e: any) {
    console.error('[chat]', slug, e?.message, e?.stack);
    return c.json({ error: 'error interno' }, 500);
  }
}

// ── WhatsApp ────────────────────────────────────────────────────

/** Verificación de la URL. Meta pega este GET una sola vez, al configurarla. */
app.get('/wa/webhook', c => verificarWebhook(c.env, new URL(c.req.url)));

/**
 * Los mensajes.
 *
 * Se le contesta 200 a Meta ANTES de procesar: si tardamos más de unos
 * segundos, Meta da el webhook por fallido y lo reintenta, y entonces
 * el asistente contestaría dos veces. Por eso el trabajo real va en
 * waitUntil, y por eso existe la deduplicación por wa_message_id.
 */
app.post('/wa/webhook', async c => {
  const crudo = await c.req.text();

  // La firma es lo único que separa este webhook de cualquiera que
  // descubra la URL y haga que el asistente escriba a números reales
  // en nombre de una clínica.
  if (!(await firmaValida(c.env, crudo, c.req.header('x-hub-signature-256') ?? null))) {
    console.error('[wa] firma inválida, mensaje descartado');
    return c.text('firma inválida', 403);
  }

  let entrantes: ReturnType<typeof parsearWebhook> = [];
  try {
    entrantes = parsearWebhook(JSON.parse(crudo));
  } catch (e: any) {
    console.error('[wa] no pude leer el webhook:', e?.message);
    return c.text('ok', 200); // 200 igual: no queremos que reintente algo ilegible
  }

  if (entrantes.length) c.executionCtx.waitUntil(procesarLote(c.env, entrantes));
  return c.text('ok', 200);
});

async function procesarLote(env: Env, entrantes: ReturnType<typeof parsearWebhook>) {
  for (const e of entrantes) {
    try {
      // A qué negocio pertenece lo dice el número que RECIBIÓ el
      // mensaje, nunca quien lo manda.
      const negocio = await negocioPorNumero(env, e.phoneNumberId);
      if (!negocio) {
        console.error('[wa] llegó un mensaje a un número que no está en la base:', e.phoneNumberId);
        continue;
      }

      if (e.mensaje.waMessageId) {
        await marcarLeido(env, e.phoneNumberId, e.mensaje.waMessageId);
      }

      const r = await responder(env, negocio, e.mensaje);
      // texto null = conversación derivada y en silencio. No se contesta.
      if (r.texto) {
        await enviarTexto(env, e.phoneNumberId, e.mensaje.identificador, r.texto);
      }
    } catch (err: any) {
      console.error('[wa]', e.phoneNumberId, err?.message, err?.stack);
    }
  }
}

export default app;
