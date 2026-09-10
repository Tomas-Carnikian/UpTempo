import { Hono } from 'hono';
import type { Env, MensajeEntrante } from './tipos';
import { db, negocioPorSlug, negocioPorNumero, invalidarCache } from './db';
import {
  verificarWebhook, firmaValida, parsearWebhook, enviarTexto, marcarLeido, hayWhatsapp,
} from './whatsapp';
import { responder } from './cerebro';
import { paginaChat } from './chat-web';
import { paginaPanel } from './panel';
import { paginaTurnos } from './pagina-turnos';
import { paginaWeb, faviconSvg } from './web';
import { revisarEnv, textoProblemas, esClaveSecreta } from './config';
import { hayGoogle } from './google';
import { procesarRecordatorios } from './recordatorios';
import { crearPlantillas, estadoPlantillas } from './plantillas';
import { extraerFicha, slugificar, nombreDeNegocio, esRedSocial } from './extraccion';
import {
  insertarFicha, listarDemos, borrarDemo, purgarDemos, mensajeDeContacto, asuntoDeContacto,
} from './demos';
import { buscarLugares, combinar, hayPlaces, MAX_POR_LOTE } from './places';

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

// ── Alta de plantillas de un cliente ────────────────────────────
/**
 * Cerrado por HOST, igual que /panel/enlace-dev: solo desde localhost,
 * con `wrangler dev`. Es herramienta de alta, no una ruta publica, y
 * cerrarla por host en vez de por una variable significa que no hay
 * forma de olvidarse de apagarla en produccion.
 *
 *   GET  /admin/plantillas/clinicasole  -> como estan
 *   POST /admin/plantillas/clinicasole  -> las crea (idempotente)
 */
function soloLocal(c: any): boolean {
  const host = (c.req.header('host') ?? '').split(':')[0].toLowerCase();
  const ok = host === 'localhost' || host === '127.0.0.1';
  // Cuando rechaza, dice QUE host vio. Sin esto, una ruta de admin que
  // deja de funcionar da un 404 mudo, identico al de una ruta que no
  // existe, y no hay forma de distinguir "la puerta te rechazo" de
  // "escribiste mal la URL".
  if (!ok) console.log('[admin] rechazado, host =', JSON.stringify(host), c.req.path);
  return ok;
}

async function wabaDe(c: any, slug: string): Promise<string | Response> {
  const negocio = await negocioPorSlug(c.env, slug);
  if (!negocio) {
    // Es ruta de alta y de localhost: decir cuales HAY vale mucho mas
    // que un 404 seco. Un slug mal escrito es el error mas facil de
    // cometer y el mas molesto de diagnosticar a ciegas.
    const { data } = await db(c.env).from('clientes')
      .select('slug, estado').order('slug').limit(50);
    const lista = (data ?? []).map((x: any) => `${x.slug} (${x.estado})`).join(', ');
    return c.text(`No encuentro el negocio "${slug}". Los que hay: ${lista || 'ninguno'}.`, 404);
  }
  const waba = negocio.cliente.wa_business_account_id;
  if (!waba) {
    return c.text(
      `A "${slug}" le falta wa_business_account_id en la base. Es el ID de la cuenta de ` +
      `WhatsApp Business (no el del numero): sin eso no hay donde crear las plantillas.`, 400);
  }
  return waba;
}

app.get('/admin/plantillas/:slug', async c => {
  if (!soloLocal(c)) return c.notFound();
  const waba = await wabaDe(c, c.req.param('slug'));
  if (typeof waba !== 'string') return waba;
  try {
    return c.json(await estadoPlantillas(c.env, waba));
  } catch (e: any) { return c.text(e?.message ?? 'error', 500); }
});

app.post('/admin/plantillas/:slug', async c => {
  if (!soloLocal(c)) return c.notFound();
  const waba = await wabaDe(c, c.req.param('slug'));
  if (typeof waba !== 'string') return waba;
  try {
    return c.json(await crearPlantillas(c.env, waba));
  } catch (e: any) { return c.text(e?.message ?? 'error', 500); }
});

// ── Generador de demos: la extracción (paso 9.1) ────────────────
/**
 * De una URL sale una FICHA en JSON. Todavía no toca la base ni usa
 * Places: eso es el 9.2 y el 9.4.
 *
 *   POST /admin/extraer  {"url":"https://…"}
 *   POST /admin/extraer  {"url":"…","extra":"bio y posts pegados a mano"}
 *
 * Cerrada por host como todas las de alta. Se revisa a ojo: mirar
 * `origen.precios_descartados`, que es donde se ve si el modelo intentó
 * inventar un precio y el código se lo borró.
 */
app.post('/admin/extraer', async c => {
  if (!soloLocal(c)) return c.notFound();
  const body = await c.req.json().catch(() => ({} as any));
  const url = String(body.url ?? '').trim();
  const extra = String(body.extra ?? '').trim();
  if (!url && !extra) return c.text('Mandá {"url":"https://…"} o al menos {"extra":"…"}.', 400);
  if (url && !/^https?:\/\//i.test(url)) return c.text('La url tiene que empezar con http:// o https://', 400);
  try {
    return c.json(await extraerFicha(c.env, { url: url || undefined, extra: extra || undefined }));
  } catch (e: any) {
    return c.text(e?.message ?? 'error', 502);
  }
});

// ── Generador de demos: las demos (paso 9.2) ────────────────────
/**
 * De una URL a una demo en linea, en una sola llamada.
 *
 *   POST   /admin/demos  {"url":"https://…"}   la genera (o la actualiza)
 *   GET    /admin/demos                        las lista
 *   DELETE /admin/demos/<slug>                 borra una
 *
 * Idempotente por slug: correrlo dos veces sobre la misma clinica
 * actualiza, no duplica. Y nunca toca un cliente que no sea 'demo'.
 */
app.post('/admin/demos', async c => {
  if (!soloLocal(c)) return c.notFound();
  const body = await c.req.json().catch(() => ({} as any));
  const url = String(body.url ?? '').trim();
  const extra = String(body.extra ?? '').trim();
  if (!url && !extra) return c.text('Mandá {"url":"https://…"} o al menos {"extra":"…"}.', 400);
  if (url && !/^https?:\/\//i.test(url)) return c.text('La url tiene que empezar con http:// o https://', 400);

  try {
    const ficha = await extraerFicha(c.env, { url: url || undefined, extra: extra || undefined });
    const r = await insertarFicha(c.env, ficha);
    return c.json({
      ...r,
      pagina: `/p/${r.slug}`,
      chat: `/c/${r.slug}`,
      precios_descartados: ficha.origen.precios_descartados,
      paginas_leidas: ficha.origen.paginas,
    });
  } catch (e: any) {
    return c.text(e?.message ?? 'error', 502);
  }
});

app.get('/admin/demos', async c => {
  if (!soloLocal(c)) return c.notFound();
  try { return c.json(await listarDemos(c.env)); }
  catch (e: any) { return c.text(e?.message ?? 'error', 500); }
});

// ── El lote (paso 9.4) ──────────────────────────────────────────
/**
 * Una busqueda de Places -> hasta 20 demos + 20 mensajes listos.
 *
 *   POST /admin/demos/lote {"busqueda":"depilación definitiva Montevideo"}
 *   POST /admin/demos/lote {"busqueda":"…","max":5,"saltar":5}
 *
 * `max` y `saltar` existen porque veinte negocios son veinte busquedas
 * de sitio (hasta 5 paginas cada una) mas veinte llamadas al modelo:
 * en una sola invocacion eso se pasa de tiempo. De a 5 anda comodo y
 * se sigue con saltar=5, 10, 15.
 *
 * Un negocio que falla NO frena el lote: queda en `fallaron` con el
 * motivo. Diecinueve demos y un error es un buen resultado; cero
 * demos porque una clinica tiene el sitio caido, no.
 */
app.post('/admin/demos/lote', async c => {
  if (!soloLocal(c)) return c.notFound();
  if (!hayPlaces(c.env)) {
    return c.text('Falta GOOGLE_PLACES_KEY. Cargala en .dev.vars y con wrangler secret put.', 400);
  }

  const body = await c.req.json().catch(() => ({} as any));
  const busqueda = String(body.busqueda ?? '').trim();
  if (!busqueda) return c.text('Mandá {"busqueda":"depilación definitiva Montevideo"}.', 400);

  const max = Math.min(Number(body.max) || 5, MAX_POR_LOTE);
  const saltar = Math.max(Number(body.saltar) || 0, 0);

  let lugares;
  try {
    lugares = await buscarLugares(c.env, busqueda, MAX_POR_LOTE);
  } catch (e: any) {
    return c.text(e?.message ?? 'error', 502);
  }

  const hechas: any[] = [];
  const fallaron: any[] = [];
  const repetidos: any[] = [];

  /**
   * Una cadena aparece en Places una vez POR SUCURSAL, y las sucursales
   * se llaman todas igual. En el primer lote real, DepiLife salio dos
   * veces —la home y la pagina del WTC— y las dos cayeron en el slug
   * "depilife": la segunda le pasó por encima a la primera. De cinco
   * lugares del lote salieron cuatro negocios, y se pagaron dos
   * llamadas al modelo y diez bajadas de paginas para tener una demo.
   *
   * El slug se puede adivinar ANTES de gastar nada, porque sale del
   * nombre que ya devolvio Places. El repetido no cuenta contra `max`:
   * el lugar libre lo usa el siguiente de la lista, asi un lote de
   * cinco devuelve cinco negocios distintos.
   */
  const yaEnEsteLote = new Set<string>();
  let i = saltar;

  while (hechas.length + fallaron.length < max && i < lugares.length) {
    const lugar = lugares[i++];

    const slugPrevisto = slugificar(nombreDeNegocio(lugar.nombre));
    if (yaEnEsteLote.has(slugPrevisto)) {
      repetidos.push({
        nombre: lugar.nombre, sitio: lugar.sitio,
        motivo: `otra sucursal de "${slugPrevisto}", que ya salió en este lote`,
      });
      continue;
    }
    yaEnEsteLote.add(slugPrevisto);

    try {
      // El sitio web es opcional: sin el sale una ficha sin servicios,
      // que es el caso de la clinica que solo tiene Instagram.
      let web = null;
      let avisoRed: string | null = null;
      if (lugar.sitio && esRedSocial(lugar.sitio)) {
        // Ni se intenta: son cinco bajadas y una llamada al modelo para
        // sacar cero servicios y el color de Meta.
        avisoRed = `el "sitio" de Places es una red social (${lugar.sitio}), no una web: ` +
                   `no se extrajo nada. Pegá la bio a mano con /admin/demos {"url":…,"extra":…}`;
      } else if (lugar.sitio) {
        web = await extraerFicha(c.env, { url: lugar.sitio }).catch((e: any) => {
          console.log('[lote] sin web utilizable', lugar.nombre, e?.message);
          return null;
        });
      }
      const ficha = combinar(lugar, web);
      const r = await insertarFicha(c.env, ficha);
      hechas.push({
        ...r,
        avisos: avisoRed ? [avisoRed, ...r.avisos] : r.avisos,
        url: `${r.slug}.uptempo.uy`,
        // Sobre los que quedaron INSERTADOS, no sobre los de la ficha:
        // insertarFicha descarta los repetidos y si no, el resumen
        // decia "42 servicios, 48 con precio".
        servicios_con_precio: Math.min(
          ficha.servicios.filter(s => s.precio !== null).length, r.servicios),
        sitio: lugar.sitio,
        asunto: asuntoDeContacto(ficha),
        mensaje: mensajeDeContacto(ficha, r.slug, busqueda),
      });
    } catch (e: any) {
      fallaron.push({ nombre: lugar.nombre, sitio: lugar.sitio, motivo: e?.message ?? 'error' });
    }
  }

  // Cuantos lugares de la lista se consumieron, no cuantas demos
  // salieron: con esto `siguiente` no vuelve a mandar una sucursal que
  // ya se saltó.
  const consumidos = i - saltar;

  return c.json({
    busqueda,
    encontrados: lugares.length,
    procesados: `${saltar + 1}-${saltar + consumidos} de ${lugares.length}`,
    siguiente: i < lugares.length ? { busqueda, max, saltar: i } : null,
    hechas, fallaron, repetidos,
  });
});

/**
 * La purga a mano. Sin ?ahora= no borra nada que no corresponda; con
 * ?ahora=2026-12-01 se puede ver que pasaria en el futuro sin esperar
 * 30 dias. Es la unica forma comoda de probar el 9.5.
 */
app.post('/admin/demos/purga', async c => {
  if (!soloLocal(c)) return c.notFound();
  const q = c.req.query('ahora');
  const ahora = q ? new Date(q) : new Date();
  if (Number.isNaN(ahora.getTime())) return c.text('?ahora= tiene que ser una fecha válida.', 400);
  try { return c.json(await purgarDemos(c.env, ahora)); }
  catch (e: any) { return c.text(e?.message ?? 'error', 500); }
});

app.delete('/admin/demos/:slug', async c => {
  if (!soloLocal(c)) return c.notFound();
  try { return c.text(await borrarDemo(c.env, c.req.param('slug'))); }
  catch (e: any) { return c.text(e?.message ?? 'error', 400); }
});

/** Corre el cron a mano, para no esperar 15 minutos al probarlo. */
app.post('/admin/recordatorios', async c => {
  if (!soloLocal(c)) return c.notFound();
  return c.json(await procesarRecordatorios(c.env));
});

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

// ── La web de la empresa ────────────────────────────────────────
/**
 * uptempo.uy y uptempo.uy/en. Reemplaza a la página PUENTE, que era
 * un renglón de texto con un link al panel.
 *
 * DOS COSAS QUE NO SE PUEDEN PERDER AL TOCAR ESTO:
 *
 * 1. El rescate del enlace mágico. Los tokens de Supabase vuelven en
 *    el fragmento (#access_token=…), que el navegador NO manda al
 *    servidor: desde acá no hay forma de saber que la visita trae una
 *    sesión. Si el enlace del correo cae en la raíz en vez de en
 *    /panel, hay que reenviarlo con el fragmento intacto. Eso lo hace
 *    ahora el script de web.ts (punto 4) y por eso ese script no es
 *    decoración: sin él, el correo de login lleva a la home y no
 *    entra nadie.
 *
 * 2. Es SOLO del dominio raíz. En el subdominio de un cliente la raíz
 *    sigue siendo su página de turnos, y /en ahí no existe.
 */
function web(c: any, idioma: 'es' | 'en') {
  return c.html(paginaWeb(idioma), 200, {
    // 5 minutos en el navegador, una semana en el borde de Cloudflare
    // revalidando de fondo. La página es fija y no toca la base, así
    // que se puede cachear de verdad — pero el `max-age` largo es una
    // trampa mientras se está editando: se despliega un cambio, se
    // recarga, y el navegador sigue mostrando la vieja hasta un día
    // después. Eso se ve igual que "el deploy no funcionó" y ya nos
    // costó horas una vez con la URL muerta de workers.dev.
    // `s-maxage` es lo que importa para el costo: el borde sirve la
    // página sin invocar el Worker.
    'cache-control': 'public, max-age=300, s-maxage=604800, stale-while-revalidate=604800',
  });
}

app.get('/favicon.svg', c => c.body(faviconSvg(), 200, {
  'content-type': 'image/svg+xml; charset=utf-8',
  'cache-control': 'public, max-age=604800, immutable',
}));

app.get('/en', c => {
  // En clinicasole.uptempo.uy/en no hay nada que mostrar: la web de
  // la empresa no vive en el subdominio de un cliente.
  if (slugDeHost(c.req.header('host') ?? '')) return c.notFound();
  return web(c, 'en');
});

// ── Página de turnos y chat ─────────────────────────────────────
//
// En el subdominio del cliente, la raíz es la PÁGINA DE TURNOS: es lo
// que se publica y lo que ve una clienta. El chat vive en /chat y es
// para los demos de venta, donde todavía no hay un WhatsApp que usar.
app.get('/', async c => {
  const host = c.req.header('host') ?? '';
  if (esHostDelPanel(host)) return panelDe(c, '/');
  const slug = slugDeHost(host);
  if (!slug) return web(c, 'es');
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
  // En el subdominio del cliente el chat vive en /chat; en local, en
  // /c/<slug>. La pagina no puede adivinarlo: se lo decimos.
  const enSubdominio = Boolean(slugDeHost(c.req.header('host') ?? ''));
  const rutaChat = enSubdominio ? '/chat' : `/c/${slug}`;
  // El panel solo se enlaza en las demos: en la pagina publica de un
  // cliente, el panel es del dueño y no tiene nada que hacer a la
  // vista de quien viene a sacar un turno.
  const rutaPanel = await panelSiHayDueno(c, negocio, enSubdominio);
  return c.html(paginaTurnos(negocio, rutaChat, rutaPanel), 200, {
    // La página cambia cuando cambian los precios, no en cada visita.
    'cache-control': 'public, max-age=120, stale-while-revalidate=600',
  });
}

/**
 * El link al panel: solo en demos, y solo si esa demo tiene a alguien
 * cargado en usuarios_panel.
 *
 * OJO CON EL ALCANCE, porque es facil creer que hace mas de lo que
 * hace: NO sabe quien esta mirando. La pagina es HTML estatico y se
 * cachea 120 s, asi que cuando se arma no hay sesion de nadie. La
 * pregunta que responde es "¿hay alguien autorizado en esta demo?",
 * no "¿el que esta mirando lo esta?".
 *
 * Lo que evita: mandar una demo sin haber cargado el mail y que el
 * dueño caiga en "tu correo no tiene ningun negocio asociado", que es
 * pesima primera impresion en la pagina que le mandamos para
 * impresionarlo.
 *
 * Lo que NO evita: que un tercero vea el boton y caiga en ese mismo
 * cartel. Se acepta porque el link de una demo se le manda al dueño y
 * no se publica, asi que en la practica el unico que la abre es el.
 * Y del otro lado del boton no hay ningun dato: sin enlace magico no
 * se entra, y con el, RLS solo muestra lo que esa persona tenga en
 * usuarios_panel.
 *
 * En un cliente 'activo' devuelve vacio siempre: el panel es del
 * dueño y no tiene nada que hacer en su pagina publica.
 *
 * La consulta corre SOLO en demos, que son pocas y de poco trafico, y
 * el negocio ya viene del cache de 45 s.
 */
async function panelSiHayDueno(c: any, negocio: any, enSubdominio: boolean): Promise<string> {
  if (negocio.cliente.estado !== 'demo') return '';
  try {
    const { count } = await db(c.env).from('usuarios_panel')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', negocio.cliente.id);
    if (!count) return '';
  } catch { return ''; }
  return enSubdominio ? 'https://panel.uptempo.uy' : '/panel';
}

async function chatDe(c: any, slug: string, rutaApi: string) {
  const negocio = await negocioPorSlug(c.env, slug);
  if (!negocio) return c.text(`No encuentro el negocio "${slug}".`, 404);
  // ?m= lo ponen los botones de la pagina de turnos de una demo.
  const precargado = (c.req.query('m') ?? '').slice(0, 300);
  const enSubdominio = Boolean(slugDeHost(c.req.header('host') ?? ''));
  const rutaTurnos = enSubdominio ? '/' : `/p/${slug}`;
  const rutaPanel = await panelSiHayDueno(c, negocio, enSubdominio);
  return c.html(paginaChat(negocio, rutaApi, precargado, rutaTurnos, rutaPanel));
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

/**
 * Hasta el paso 8 este archivo exportaba el `app` de Hono pelado. Ya no
 * alcanza: un Worker que ademas corre por cron tiene que exportar las
 * dos entradas, `fetch` para las visitas y `scheduled` para el reloj.
 *
 * El recordatorio va en waitUntil por la misma razon que el webhook de
 * WhatsApp: el handler devuelve enseguida y el trabajo sigue.
 */
export default {
  fetch: app.fetch,
  async scheduled(_evento: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(procesarRecordatorios(env));

    // La purga de demos va en el mismo reloj pero UNA VEZ POR DIA: el
    // cron corre cada 15 minutos por el recordatorio, y recorrer todas
    // las demos 96 veces al dia para borrar algo que cambia una vez
    // seria pagar 96 veces lo mismo. A las 06:00 UTC, o sea las 3 de
    // la mañana en Montevideo: no hay nadie usando nada.
    const ahora = new Date();
    if (ahora.getUTCHours() === 6 && ahora.getUTCMinutes() < 15) {
      ctx.waitUntil(purgarDemos(env).catch(e => console.error('[purga]', e?.message)));
    }
  },
};
