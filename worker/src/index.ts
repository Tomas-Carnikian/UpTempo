import { Hono } from 'hono';
import type { Env, MensajeEntrante } from './tipos';
import { negocioPorSlug, invalidarCache } from './db';
import { responder } from './cerebro';
import { paginaChat } from './chat-web';

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

/** Saca el slug del host, o null si es un host que no es de cliente. */
function slugDeHost(host: string): string | null {
  const h = host.split(':')[0].toLowerCase();
  if (h.endsWith('.uptempo.uy')) {
    const sub = h.slice(0, -'.uptempo.uy'.length);
    return sub && !sub.includes('.') && sub !== 'www' ? sub : null;
  }
  return null;
}

app.get('/health', c => c.json({ ok: true, entorno: c.env.ENTORNO }));

/** Purga el cache de config sin desplegar. Util despues de editar precios. */
app.post('/admin/recargar', c => { invalidarCache(); return c.json({ ok: true }); });

// ── Chat web ────────────────────────────────────────────────────
app.get('/', async c => {
  const slug = slugDeHost(c.req.header('host') ?? '');
  if (!slug) {
    return c.text('Uptempo. Para probar un negocio: /c/<slug>', 200);
  }
  return chatDe(c, slug, '/api/chat');
});

app.get('/c/:slug', async c => chatDe(c, c.req.param('slug'), `/c/${c.req.param('slug')}/chat`));

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

// ── WhatsApp: paso 7 ────────────────────────────────────────────
// El webhook entra acá, saca el phone_number_id, llama a
// negocioPorNumero() y usa el MISMO responder(). Mismo cerebro.

export default app;
