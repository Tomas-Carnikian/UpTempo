/**
 * La web de la empresa: uptempo.uy y uptempo.uy/en
 *
 * ES LA WEB DE LA AGENCIA, NO LA DE TURNOS 24/7. La distincion no es
 * cosmetica y define toda la estructura del archivo: la marca
 * identifica a la EMPRESA, no al producto (§1 del manual). Turnos
 * 24/7 entra como UNA seccion —el caso que muestra como trabajamos—
 * y no como el tema de la pagina. Cuando haya un segundo producto,
 * se agrega otra seccion al lado y no hay que rehacer nada.
 *
 * NO es la pagina de turnos de un cliente (esa es pagina-turnos.ts,
 * vive en <slug>.uptempo.uy y cambia por cliente). Esta es fija, no
 * toca la base y no depende de ninguna fila: se arma entera en
 * memoria y se cachea. Por eso no recibe `Negocio` ni `Env`.
 *
 * TRES COSAS QUE MANDAN SOBRE CUALQUIER DECISION DE DISEÑO:
 *
 * 1. Manda el manual de marca, no el gusto del dia.
 *    Los tokens de :root son copia literal del §9. Las dos reglas
 *    que no se negocian:
 *      - HIELO (#B4D2EE) es la MARCA: acentos, bordes, iconos,
 *        numeros. Nunca es un boton.
 *      - AZUL (#4A9EFF) es la ACCION: si algo azul no se puede
 *        tocar, esta mal puesto.
 *    Radio 3px en todo. 999px SOLO en pildoras y chips de estado.
 *    Nada de sombras ni degradados sobre el isotipo.
 *
 * 2. A diferencia de pagina-turnos.ts, esta SI carga las fuentes de
 *    Google. La pagina de turnos no carga nada porque se manda como
 *    link en frio a alguien en el 4G del omnibus; esta se visita a
 *    proposito y la identidad tipografica (Chivo + Instrument Serif)
 *    ES la marca. Va con preconnect y display=swap, y cada familia
 *    tiene su pila de respaldo en los tokens: si Google no contesta,
 *    la pagina se ve, no se queda en blanco.
 *
 * 3. Todo lo que dice es verificable. El manual pide numeros reales.
 *    Los cuatro del caso salen de cosas que existen en este repo: el
 *    cron de 15 minutos (wrangler.toml), el recordatorio de 24 h
 *    (recordatorios.ts), la cantidad de pruebas (worker/test) y la
 *    verificacion de precios (extraccion.ts).
 *    LA UNICA AFIRMACION NO VERIFICABLE de toda la pagina es
 *    "el precio mas bajo del mercado", y esta puesta a proposito
 *    despues del mecanismo que la explica, no antes.
 *
 * BILINGUE, sin JavaScript ni cookies: `/` es español, `/en` ingles.
 * Cada version se sirve entera desde el servidor con su <html lang>
 * y su <link rel="alternate" hreflang>, que es lo que Google lee. Un
 * selector que traduce en el cliente no lo lee nadie.
 *
 * OJO CON LOS BACKTICKS: este archivo es un template literal enorme
 * y eso incluye los comentarios del CSS. Un backtick adentro de un
 * comentario corta el literal y el error apunta a cualquier lado
 * menos al backtick. Ya paso en panel.ts y volvio a pasar aca.
 */

type Idioma = 'es' | 'en';

/**
 * El WhatsApp de UpTempo. Es lo unico de este archivo que hay que
 * tocar antes de publicar.
 *
 * OJO: hoy no hay numero de empresa (ruta A de la §9 del estado:
 * linea nueva sin comprar todavia). Mientras este vacio, TODOS los
 * botones de contacto caen al correo automaticamente — no queda
 * ningun boton roto ni ningun wa.me a la nada.
 *
 * Formato: solo digitos, con pais. Ej: '59899123456'.
 */
const WHATSAPP = '';
const CORREO = 'hola@uptempo.uy';

/**
 * La demo publica que se enlaza desde la seccion del caso.
 *
 * Vacio = el boton no aparece. Es a proposito: una demo dice que es
 * una demo y su link se le manda al dueño, no se publica (regla dura
 * del §3 del estado). Poner aca una demo de una clinica real seria
 * publicarla. Cuando exista una demo de clinica FICTICIA hecha para
 * mostrar, va su URL completa.
 */
const DEMO_PUBLICA = '';

/** Los cuatro numeros del caso. Verificables en este mismo repo. */
const NUMEROS = { pruebas: 401, cron: 15, recordatorio: 24 };

// ────────────────────────────────────────────────────────────────
// Isotipo e iconos
// ────────────────────────────────────────────────────────────────
/**
 * Escrito a mano desde el §9 del manual. No se toca: la relacion
 * trazo-hueco es 1:1 y es la unica proporcion del isotipo. Si cambia,
 * cambia la marca.
 */
function isotipo(alto: number, unaTinta = false): string {
  const arriba = unaTinta ? 'currentColor' : '#4A9EFF';
  const abajo = unaTinta ? 'currentColor' : '#B4D2EE';
  const ancho = Math.round((alto * 44) / 42);
  return `<svg viewBox="0 0 44 42" width="${ancho}" height="${alto}" aria-hidden="true" focusable="false">
    <polygon points="0,15 22,0 44,15 44,24 22,9 0,24" fill="${arriba}"/>
    <polygon points="0,33 22,18 44,33 44,42 22,27 0,42" fill="${abajo}"/>
  </svg>`;
}

/**
 * El favicon, servido desde /favicon.svg.
 *
 * No es el isotipo suelto: es el archivo de icono del §3 del manual,
 * o sea fondo lleno y el isotipo al 46 % del ancho, centrado. Suelto
 * y transparente, en la pestaña de un navegador en tema claro el
 * hielo desaparece.
 */
export function faviconSvg(): string {
  // Copia exacta del simbolo #avatar del manual visual: caja 100, el
  // isotipo con translate(27, 28.05) scale(1.0455), o sea 46 % del
  // ancho. Redondo, porque la foto de perfil se recorta en circulo y
  // el manual la muestra asi.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#0B0E14"/>
  <g transform="translate(27,28.05) scale(1.0455)">
    <polygon points="0,15 22,0 44,15 44,24 22,9 0,24" fill="#4A9EFF"/>
    <polygon points="0,33 22,18 44,33 44,42 22,27 0,42" fill="#B4D2EE"/>
  </g>
</svg>`;
}

/**
 * El logo de la barra y del pie.
 *
 * Es la FICHA de la "version simplificada" del manual —el isotipo
 * dentro de un disco— junto al nombre en Chivo 700. El disco es
 * `#1C222D` (superficie 2) y el isotipo mide el 52 % del ancho, que
 * es la proporcion exacta de la ficha del manual (54 sobre 104).
 *
 * OJO CON EL HEX: la ficha es #1C222D, NO #242C3A. #242C3A es la
 * linea —bordes y divisores—; un disco de ese color se lee como un
 * borde grueso y no como una pieza de marca.
 */
function logo(altoIso = 17): string {
  const disco = Math.round((altoIso * 44 / 42) / 0.52);
  return `<span class="logo">
    <span class="logo-ficha" style="width:${disco}px;height:${disco}px">${isotipo(altoIso)}</span>
    <span class="logo-nombre">UpTempo</span>
  </span>`;
}

/**
 * SVG de trazo, nunca emoji: un emoji lo dibuja el sistema operativo
 * y sale distinto en cada telefono, que es justo lo contrario de una
 * marca. Todos heredan currentColor y van en hielo.
 */
const ICONOS: Record<string, string> = {
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-4-.9L3 21l1.9-4.5A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/>',
  engranaje: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  datos: '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/>',
  codigo: '<path d="M8.5 8L4 12l4.5 4M15.5 8l4.5 4-4.5 4M13.5 5l-3 14"/>',
  pagina: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M8 13h8M8 16.5h5"/>',
  panel: '<path d="M3 3v18h18"/><path d="M7 15l3.5-4 3 2.5L21 6"/>',
  escudo: '<path d="M12 3l7.5 3v5.4c0 4.4-3 8.2-7.5 9.6-4.5-1.4-7.5-5.2-7.5-9.6V6z"/><path d="M9 12l2.2 2.2L15.4 10"/>',
  flecha: '<path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/>',
  cruz: '<path d="M6 6l12 12M18 6L6 18"/>',
  pin: '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  enchufe: '<path d="M9 3v6M15 3v6"/><path d="M6 9h12v3a6 6 0 0 1-12 0z"/><path d="M12 18v3"/>',
  wa: '<path d="M20.5 11.6a8.4 8.4 0 0 1-12.3 7.5L3.5 20.5l1.5-4.6a8.4 8.4 0 1 1 15.5-4.3z"/><path d="M8.9 8.4c.3-.6 1.4-.6 1.7 0l.6 1.2c.2.4 0 .8-.3 1.1-.3.3-.4.5-.2.9.4.8 1 1.4 1.8 1.8.4.2.6.1.9-.2.3-.3.7-.5 1.1-.3l1.2.6c.6.3.6 1.4 0 1.7-1.6.9-3.6.1-5.2-1.5s-2.4-3.6-1.6-5.3z"/>',
};

function icono(nombre: string, clase = 'ico'): string {
  return `<svg class="${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${ICONOS[nombre]}</svg>`;
}

// ────────────────────────────────────────────────────────────────
// Textos
// ────────────────────────────────────────────────────────────────
/**
 * Los dos idiomas, uno al lado del otro y en el mismo objeto: es la
 * unica forma de que agregar una frase en español no deje un hueco
 * mudo en ingles. Si falta una clave, TypeScript avisa al compilar.
 *
 * La voz es la del §7 del manual: rioplatense, de vos, concreto,
 * sin promesas de agencia. El ingles no es traduccion literal — es
 * la misma voz, directa y sin adornos.
 */
type Bloque = Record<Idioma, string>;
const t = (es: string, en: string): Bloque => ({ es, en });

const COPY = {
  metaTitulo: t(
    'UpTempo — Agencia de automatización con IA en Montevideo',
    'UpTempo — AI automation studio in Montevideo',
  ),
  metaDesc: t(
    'Automatizamos el trabajo que hoy alguien hace a mano. Agentes de IA, automatización de procesos, datos e integraciones y software a medida. Escribimos el sistema, no revendemos una plataforma.',
    'We automate the work someone still does by hand. AI agents, process automation, data and integrations, custom software. We write the system — we do not resell somebody else’s platform.',
  ),

  navServicios: t('Servicios', 'Services'),
  navComo: t('Cómo trabajamos', 'How we work'),
  // El nav no nombra el producto: nombra lo que importa, que es que
  // hay algo andando. "Agentes" repetiria el servicio 01.
  navCaso: t('En producción', 'In production'),
  navPreguntas: t('Preguntas', 'FAQ'),
  navContacto: t('Escribinos', 'Get in touch'),
  navAbrir: t('Abrir el menú', 'Open menu'),
  navIrA: t('Ir al contenido', 'Skip to content'),

  // ── Hero ──
  heroEtiqueta: t(
    'Automatización con IA · Montevideo',
    'AI automation · Montevideo, Uruguay',
  ),
  // El dato va en Instrument Serif cursiva y en hielo: ese contraste
  // —grotesca pesada + serif cursiva en el dato— es EL gesto
  // tipografico de la marca (§7). No se cambia por otro estilo.
  // El titular usa LOS DOS cortes de Instrument Serif, y la
  // diferencia significa algo: la CURSIVA es el dato ("horas"), la
  // REDONDA es la promesa ("Te devolvemos tu tiempo"). Instrument
  // Serif no tiene negrita —solo Regular y cursiva— asi que esos dos
  // cortes son todo lo que hay, y usarlos con roles distintos es lo
  // que evita que la segunda mitad parezca un error de estilo.
  heroTituloA: t('Cada semana tu equipo pierde ', 'Every week your team loses '),
  heroDato: t('horas', 'hours'),
  heroTituloB: t(
    ' haciendo a mano lo que puede hacer una máquina.',
    ' doing by hand what a machine can do.',
  ),
  heroPromesa: t('Te devolvemos tu tiempo.', 'We give you your time back.'),
  heroBajada: t(
    'UpTempo es una agencia de automatización con IA de Montevideo. Escribimos el sistema entero: no revendemos una plataforma con tu logo arriba. Eso es lo que hace que funcione en producción, y lo que nos deja poner el precio que ponemos.',
    'UpTempo is an AI automation studio based in Montevideo. We write the whole system — we do not resell a platform with your logo on top. That is what makes it work in production, and what lets us charge what we charge.',
  ),
  heroCtaA: t('Ver qué hacemos', 'See what we do'),
  heroCtaB: t('Escribinos', 'Talk to us'),
  heroNota: t(
    'Hablás con quien lo construye. No hay gerente de cuentas ni ticket que escala.',
    'You talk to the person who builds it. No account manager, no ticket to escalate.',
  ),

  // ── Servicios ──
  servEtiqueta: t('Servicios', 'Services'),
  servTitulo: t('En qué trabajamos', 'What we work on'),
  servBajada: t(
    'Cuatro familias, un mismo criterio: un trabajo que hoy se hace a mano, con reglas claras, que una máquina puede hacer sin inventar nada.',
    'Four families, one test: work that is done by hand today, with clear rules, that a machine can do without making anything up.',
  ),
  serv1T: t('Agentes de IA', 'AI agents'),
  serv1D: t(
    'Asistentes que atienden y resuelven en los canales donde ya te escriben: WhatsApp, tu web, y por teléfono. Contestan con tu información, hacen la tarea —agendar, cotizar, derivar— y saben cuándo pasarle la conversación a una persona.',
    'Assistants that answer and resolve in the channels people already write to: WhatsApp, your site, and over the phone. They answer with your own information, do the job — book, quote, hand over — and know when to pass the conversation to a human.',
  ),
  serv2T: t('Automatización de procesos', 'Process automation'),
  serv2D: t(
    'El trabajo repetitivo que hoy hace alguien: mover datos entre dos sistemas que no se hablan, armar el reporte del lunes, mandar los recordatorios y los seguimientos, avisar cuando algo se rompe antes de que lo note un cliente.',
    'The repetitive work someone does today: moving data between two systems that do not talk, building Monday’s report, sending reminders and follow-ups, flagging that something broke before a customer notices.',
  ),
  serv3T: t('Datos e integraciones', 'Data and integrations'),
  serv3D: t(
    'Sacar la información de donde está y dejarla donde sirve: sitios, PDFs, planillas, sistemas viejos sin API. Migraciones, limpieza y estructuración. Y conectar lo que ya usás con lo que te falta.',
    'Getting information out of where it lives and into where it is useful: sites, PDFs, spreadsheets, legacy systems with no API. Migrations, cleaning and structuring. And connecting what you already use to what you are missing.',
  ),
  serv4T: t('Software a medida', 'Custom software'),
  serv4D: t(
    'Paneles, páginas y herramientas internas construidas para un negocio puntual, no una plantilla con tu logo arriba. Lo que hoy es una planilla que solo entiende una persona, con la lógica adentro y no en la cabeza de nadie.',
    'Dashboards, pages and internal tools built for one specific business, not a template with your logo on it. What is a spreadsheet only one person understands, turned into something with the logic inside it instead of in someone’s head.',
  ),
  servCierre: t(
    '<strong>¿Lo que necesitás no está acá?</strong> Escribinos igual. Si se puede hacer y sabemos hacerlo, te decimos cómo y cuánto. Si no, te decimos que no y te ahorramos la reunión. Averiguarlo no se cobra.',
    '<strong>Not seeing what you need?</strong> Write anyway. If it can be done and we know how, we will tell you how and how much. If not, we will say no and save you the meeting. Finding out costs nothing.',
  ),
  servCierreCta: t('Contanos qué necesitás', 'Tell us what you need'),

  // ── Código propio ──
  codEtiqueta: t('Cómo trabajamos', 'How we work'),
  codTitulo: t(
    'Escribimos el sistema. No revendemos el de otro.',
    'We write the system. We do not resell somebody else’s.',
  ),
  codBajada: t(
    'Es la decisión de la que se desprende todo lo demás: cómo funciona, por qué se puede arreglar cuando falla, y por qué el precio es el que es.',
    'This is the decision everything else follows from: how it works, why it can be fixed when it breaks, and why the price is what it is.',
  ),
  cod1T: t('Código propio, no herramientas reempaquetadas', 'Our own code, not repackaged tools'),
  cod1D: t(
    'Casi todo lo que se vende como «agencia de IA» es un flujo armado arriba de una plataforma de terceros, con la licencia adentro del precio y el logo del cliente en la portada. Nosotros escribimos el sistema: TypeScript, base de datos propia, las API oficiales de cada canal. La diferencia se ve en el resultado y se ve en la factura.',
    'Most of what is sold as an “AI agency” is a flow assembled on top of somebody else’s platform, with the licence baked into the price and the client’s logo on the cover. We write the system: TypeScript, our own database, each channel’s official API. The difference shows in the result and it shows on the invoice.',
  ),
  cod2T: t('Sabemos por qué falla, porque lo escribimos nosotros', 'We know why it breaks, because we wrote it'),
  cod2D: t(
    'Un asistente nuestro confirmó una vez un turno que no existía. En una plataforma cerrada eso no se arregla: se convive. Acá se agregó una verificación contra la base antes de que el mensaje salga, y no volvió a pasar. Esa es la distancia entre configurar una herramienta y entender el problema.',
    'One of our assistants once confirmed an appointment that did not exist. On a closed platform you do not fix that — you live with it. Here we added a check against the database before the message goes out, and it never happened again. That is the distance between configuring a tool and understanding the problem.',
  ),
  cod3T: t('Y por eso el precio', 'And that is why the price'),
  cod3D: t(
    'Sin licencia por cliente, la infraestructura de un negocio andando cuesta dólares por mes, no cientos. Ese margen no lo tenemos que financiar con tu mensualidad: es la razón por la que podemos poner <em class="serif acento-serif">el precio más bajo del mercado</em> y aun así mantener el sistema todos los meses. No es un descuento de lanzamiento — es una consecuencia de cómo está construido.',
    'With no per-client licence, keeping a business running costs dollars a month, not hundreds. We do not have to fund that margin out of your monthly fee: it is the reason we can charge <em class="serif acento-serif">the lowest price on the market</em> and still maintain the system every month. It is not a launch discount — it is a consequence of how it is built.',
  ),
  cod4T: t('Construimos sobre lo que ya usás', 'We build on what you already use'),
  cod4D: t(
    'No te pedimos que cambies de sistema ni que tu equipo aprenda uno nuevo. Nos conectamos a tu WhatsApp, tu calendario, tu planilla y tu CRM, y las claves quedan en tu cuenta, no en la nuestra.',
    'We do not ask you to change systems or to have your team learn a new one. We connect to your WhatsApp, your calendar, your spreadsheet and your CRM — and the credentials stay in your account, not ours.',
  ),

  // ── Stack ──
  stackEtiqueta: t('El stack', 'The stack'),
  stackTitulo: t(
    'Nos conectamos a lo que tu equipo abre todos los días',
    'We connect to what your team opens every day',
  ),
  stackA: t('Nos conectamos a', 'We connect to'),
  stackB: t('Construimos con', 'We build with'),
  stackNota: t(
    'Si tiene API, se conecta. Si no tiene, se evalúa — y a veces la respuesta es que no vale la pena, y también te la damos.',
    'If it has an API, we connect to it. If it does not, we look into it — and sometimes the answer is that it is not worth it, and we tell you that too.',
  ),

  // ── Proceso ──
  procEtiqueta: t('El proceso', 'The process'),
  procTitulo: t('De la consulta a producción', 'From first message to production'),
  proc1T: t('La consulta', 'The first conversation'),
  proc1D: t(
    'Contanos qué trabajo se hace a mano hoy y con qué frecuencia. De esa charla salen tres respuestas: si se puede, cuánto lleva y cuánto sale. Si no se puede, te lo decimos ahí y no cobramos por averiguarlo.',
    'Tell us what work gets done by hand today, and how often. Three answers come out of that conversation: whether it can be done, how long it takes and what it costs. If it cannot be done, we say so right there — and finding out is free.',
  ),
  proc2T: t('El mapa', 'The map'),
  proc2D: t(
    'Miramos tus sistemas y tu proceso real, no el que está escrito en el manual. Sale un alcance con un criterio de «terminado» que se puede verificar sin discutir.',
    'We look at your systems and your actual process, not the one written in the manual. Out of it comes a scope with a definition of “done” that can be verified without arguing.',
  ),
  proc3T: t('Construcción', 'Build'),
  proc3D: t(
    'Se escribe, se prueba con tus datos reales y se te muestra andando. Nada se da por bueno porque pase un test: los mejores hallazgos salieron siempre de usar el sistema, no de mirarlo pasar en verde.',
    'We write it, test it against your real data and show it running. Nothing is called good because a test passed: every real finding we have had came from using the system, not from watching it go green.',
  ),
  proc4T: t('Producción', 'Production'),
  proc4D: t(
    'Queda andando, con las claves en tu cuenta y la documentación escrita. Semanas, no trimestres. Un agente de atención, que ya está empaquetado, son 48 horas.',
    'It goes live, with the credentials in your account and the documentation written down. Weeks, not quarters. An answering agent, which is already packaged, takes 48 hours.',
  ),
  proc5T: t('Operación', 'Operation'),
  proc5D: t(
    'Se monitorea, se ajusta y se reporta. Y cuando escribís, contesta el que lo construyó — que es también el que sabe por qué está hecho así.',
    'We monitor it, adjust it and report on it. And when you write, the person who built it answers — the same person who knows why it is built the way it is.',
  ),

  // ── El caso ──
  casoEtiqueta: t('En producción', 'In production'),
  casoTitulo: t(
    'Agentes que se integran a tu negocio fluidamente',
    'Agents that fit into your business, seamlessly',
  ),
  casoBajada: t(
    'El primer producto de UpTempo y el que muestra cómo trabajamos. Un asistente que atiende el WhatsApp de un negocio de turnos las 24 horas, contesta con su información, agenda en su Google Calendar y manda el recordatorio de 24 horas antes. Está en producción.',
    'UpTempo’s first product, and the one that shows how we work. An assistant that answers a booking business’s WhatsApp around the clock, replies with their own information, books into their Google Calendar and sends the 24-hour reminder. It is in production.',
  ),
  casoBoton: t('Reproducir', 'Play'),
  casoBotonOtra: t('De nuevo', 'Again'),
  casoAbrir: t('Abrir la demo en vivo', 'Open the live demo'),
  casoPie: t(
    'Recreación de una conversación real, a la velocidad a la que pasa.',
    'A real conversation, recreated at the speed it actually happens.',
  ),

  num1: t('antes del turno sale el recordatorio', 'before the appointment, the reminder goes out'),
  num2: t('cada cuánto el reloj busca algo para recordar', 'how often the clock looks for something to remind'),
  num3: t('pruebas automáticas antes de cada despliegue', 'automated tests before every deploy'),
  num4Valor: t('0', '0'),
  num4: t('precios inventados: si no está en tu lista, no existe', 'invented prices: if it is not on your list, it does not exist'),

  limTitulo: t(
    'Lo que no puede fallar es código, no una instrucción',
    'What must not fail is code, not an instruction',
  ),
  lim1: t('Nunca inventa un precio', 'It never invents a price'),
  lim2: t('Nunca da consejo clínico', 'It never gives clinical advice'),
  lim3: t('Nunca interpreta fotos', 'It never interprets photos'),
  lim4: t('No ofrece turnos dentro de las próximas 2 horas', 'It will not offer a slot inside the next 2 hours'),
  lim5: t('No trae clientes nuevos: recupera los que ya te escriben', 'It brings no new customers: it recovers the ones already writing to you'),
  limCierre: t(
    'Ninguna de estas cinco es una opción de configuración: son código. <span class="serif cita">Una instrucción escrita se esquiva con la frase correcta; un <code>if</code> no.</span> Así se construye todo lo que hacemos, no solo esto.',
    'None of these five is a configuration switch: they are code. <span class="serif cita">A written instruction can be talked around with the right sentence; an <code>if</code> cannot.</span> That is how everything we build works, not just this.',
  ),

  // ── Empresa ──
  empresaEtiqueta: t('La empresa', 'The company'),
  empresaTitulo: t('Quién está atrás', 'Who is behind this'),
  empresaP1: t(
    'UpTempo es una agencia de automatización con IA de Montevideo. Trabajamos con negocios de acá y remoto para afuera. El primero ya está en producción —un agente que atiende, agenda y recuerda por un negocio de turnos— y va a haber más: el criterio para construir el siguiente es siempre el mismo — un trabajo que hoy alguien hace a mano, de noche, que una máquina puede hacer sin inventar nada.',
    'UpTempo is an AI automation studio in Montevideo, Uruguay. We work with businesses here and remotely elsewhere. The first one is already in production — an agent that answers, books and reminds for a booking business — and there will be more: the bar for building the next one is always the same — work someone does by hand, at night, that a machine can do without making anything up.',
  ),
  empresaP2: t(
    'No hay gerente de cuentas. Está Tomás, que es quien lo construye y quien te contesta. Cuando algo se rompe, no hay a quién derivarte — y esa es una parte del precio, no una limitación.',
    'There is no account manager. There is Tomás, who builds it and who answers you. When something breaks, there is nobody to pass you along to — and that is part of the price, not a limitation.',
  ),
  empresaSello1: t('Montevideo, Uruguay', 'Montevideo, Uruguay'),
  empresaSello2: t('API oficiales, nunca puentes no oficiales', 'Official APIs, never unofficial bridges'),
  empresaSello3: t('Ley 18.331 de datos personales', 'Uruguayan data-protection law 18.331'),

  // ── FAQ ──
  faqEtiqueta: t('Preguntas', 'FAQ'),
  faqTitulo: t('Lo que preguntan siempre', 'What everyone asks'),
  faqBajada: t(
    'Las respuestas de acá son las mismas que damos por teléfono. La respuesta honesta vende mejor que la cómoda.',
    'These are the same answers we give on the phone. The honest answer sells better than the comfortable one.',
  ),
  faqGrupo1: t('De la agencia', 'About the studio'),
  faqGrupo2: t('De los agentes', 'About the agents'),

  // ── Cierre y pie ──
  ctaTitulo: t(
    '¿Qué trabajo se hace a mano en tu negocio?',
    'What work still gets done by hand in your business?',
  ),
  ctaBajada: t(
    'Contanos qué es y con qué frecuencia. Si esto no te sirve, te lo decimos.',
    'Tell us what it is and how often. If this is not for you, we will say so.',
  ),
  ctaBoton: t('Escribinos por WhatsApp', 'Message us on WhatsApp'),
  ctaBotonCorreo: t('Escribinos por correo', 'Email us'),
  ctaNota: t('Contestamos nosotros, no un bot.', 'A person answers, not a bot.'),

  pieBajada: t('Automatización con IA', 'AI automation'),
  pieDerechos: t('Todos los derechos reservados.', 'All rights reserved.'),
  pieSecciones: t('Secciones', 'Sections'),
  pieContacto: t('Contacto', 'Contact'),
  pieIdioma: t('English', 'Español'),

  // ── Maquetas de chat ──
  //
  // HAY DOS Y NO DICEN LO MISMO, a proposito:
  //
  //  - La del HERO es una charla sobre la agencia: la pregunta que
  //    mas nos hacen. No lleva sello de verificacion porque no es
  //    una demo del producto — poner ahi "verificado contra la
  //    agenda" seria un sello de otra cosa.
  //  - La del CASO si es una demo del producto y lleva el sello.
  //
  // Las dos usan el mismo nombre, "Agente de UpTempo": el producto
  // no se nombra en ningun lado de la pagina. Lo que se nombra es la
  // tecnologia y lo que hace.
  chatNombre: t('Agente de UpTempo', 'UpTempo Agent'),
  chatEstado: t('En línea', 'Online'),
  chatHora: t('22:40', '10:40 pm'),

  heroChatM1: t(
    '¿Es verdad que manejan el código ustedes mismos?',
    'Is it true you write all the code yourselves?',
  ),
  heroChatM2: t(
    'Sí. Nada de herramientas revendidas.',
    'Yes. Nothing resold, nothing rented.',
  ),
  heroChatM3: t('¿Y por qué es mejor?', 'And why is that better?'),
  heroChatM4: t(
    'Ajustamos la herramienta a tu empresa, no tu empresa a la herramienta. Por eso lideramos en precio, y por eso cuando algo falla lo arreglamos nosotros.',
    'We fit the tool to your business, not your business to the tool. That is why we lead on price — and why, when something breaks, we are the ones who fix it.',
  ),

  chatM1: t(
    '¿Hacen depilación definitiva de piernas? ¿Cuánto sale?',
    'Do you do laser hair removal on legs? How much is it?',
  ),
  chatM2: t(
    'Sí. Piernas completas, $U 2.400 la sesión. ¿Querés que te busque un horario?',
    'We do. Full legs, $2,400 per session. Want me to find you a slot?',
  ),
  chatM3: t('Dale, el jueves de tarde si puede ser', 'Sure — Thursday afternoon if possible'),
  chatM4: t(
    'El jueves 17 tengo <strong>15:30</strong> y <strong>17:00</strong> libres. ¿Cuál te queda mejor?',
    'On Thursday the 17th I have <strong>3:30 pm</strong> and <strong>5:00 pm</strong> free. Which works better?',
  ),
  chatSello: t(
    'Verificado contra la agenda antes de mandarse',
    'Checked against the real calendar before sending',
  ),
};

/**
 * Las pildoras del stack. Solo lo que se usa DE VERDAD hoy — es la
 * misma regla que los numeros: si no se puede verificar, no va. Una
 * grilla de logos de herramientas que nunca se tocaron es lo primero
 * que un cliente tecnico descubre.
 */
const STACK_CONECTA = [
  'WhatsApp Business API', 'Google Calendar', 'Instagram', 'Google Maps',
  'Mercado Pago', 'Planillas', 'Tu CRM',
];
const STACK_CONSTRUYE = [
  'TypeScript', 'Cloudflare Workers', 'PostgreSQL', 'Supabase', 'Claude', 'Hono',
];

/** Las preguntas, en el orden en que las hacen de verdad. */
type Pregunta = { p: Bloque; r: Bloque };

const FAQ_AGENCIA: Pregunta[] = [
  {
    p: t('¿Qué hacen exactamente?', 'What exactly do you do?'),
    r: t(
      'Automatizamos trabajo que hoy alguien hace a mano. Puede ser un asistente que contesta y agenda, un proceso que mueve datos entre dos sistemas que no se hablan, un panel que hoy es una planilla que entiende una sola persona, o algo que no está en la lista de arriba. La conversación empieza siempre igual: contanos qué se hace a mano y con qué frecuencia.',
      'We automate work that someone still does by hand. It might be an assistant that answers and books, a process that moves data between two systems that do not talk, a dashboard that is currently a spreadsheet only one person understands, or something not on the list above. The conversation always starts the same way: tell us what gets done by hand, and how often.',
    ),
  },
  {
    p: t('¿Por qué código propio y no una plataforma?', 'Why your own code instead of a platform?'),
    r: t(
      'Por dos razones que se sienten en momentos distintos. La primera aparece cuando algo falla: en una plataforma cerrada no hay dónde meter mano, así que se convive con el problema o se cambia de proveedor. La segunda aparece todos los meses: la licencia de esa plataforma la terminás pagando vos, adentro de un precio que nunca discutiste. Escribir el sistema cuesta más al principio y menos siempre.',
      'For two reasons, felt at different moments. The first shows up when something breaks: on a closed platform there is nowhere to reach in, so you either live with the problem or change vendor. The second shows up every month: that platform’s licence is ultimately paid by you, inside a price you never negotiated. Writing the system costs more up front and less forever.',
    ),
  },
  {
    p: t('¿Se integran con lo que ya uso?', 'Do you integrate with what I already use?'),
    r: t(
      'Sí, y es el punto entero. Nos conectamos a WhatsApp por la API oficial, a Google Calendar, a tu planilla, a tu CRM. Si algo tiene API, se conecta; si no, se evalúa, y a veces la respuesta honesta es que no vale la pena. Lo que no hacemos es pedirte que cambies de sistema para que nuestro producto funcione.',
      'Yes, and that is the whole point. We connect to WhatsApp through the official API, to Google Calendar, to your spreadsheet, to your CRM. If it has an API, we connect; if not, we look into it — and sometimes the honest answer is that it is not worth it. What we will not do is ask you to change systems so that our product works.',
    ),
  },
  {
    p: t('¿Cuánto tarda?', 'How long does it take?'),
    r: t(
      'Depende del alcance, y te lo decimos en la primera charla, no después de una auditoría paga. Un agente de atención, que ya está empaquetado, queda andando en 48 horas desde el pago —con una salvedad: las plantillas de WhatsApp las aprueba Meta y suelen tardar cerca de un día, así que van primero—. Un desarrollo a medida se mide en semanas, no en trimestres.',
      'It depends on scope, and we tell you in the first conversation, not after a paid audit. An answering agent, already packaged, is live 48 hours after payment — with one caveat: WhatsApp templates are approved by Meta and usually take about a day, so they go in first. Custom work is measured in weeks, not quarters.',
    ),
  },
  {
    p: t('¿Cómo cobran?', 'How do you charge?'),
    r: t(
      'Los productos: una instalación y una mensualidad fija, sin cobro por conversación ni por tarea ejecutada — un mes bueno no te sale más caro. Los desarrollos a medida: un precio cerrado por alcance, y si querés que lo mantengamos, una mensualidad aparte. El número va por escrito antes de empezar, no después.',
      'Products: a one-off setup fee and a flat monthly fee, with nothing charged per conversation or per task executed — a busy month does not cost you more. Custom work: a fixed price per scope, plus a separate monthly fee if you want us to maintain it. The figure goes in writing before we start, not after.',
    ),
  },
  {
    p: t('¿Y si lo que necesito no está en la lista?', 'What if what I need is not on the list?'),
    r: t(
      'Escribinos igual. Si se puede hacer y sabemos hacerlo, te decimos cómo y cuánto. Si se puede pero no sabemos, te lo decimos también. Y si es una mala idea, esa es la respuesta que más te sirve y es la que vas a recibir. Averiguarlo no se cobra.',
      'Write anyway. If it can be done and we know how, we will tell you how and how much. If it can be done but we do not know how, we will tell you that too. And if it is a bad idea, that is the most useful answer you can get and it is the one you will get. Finding out costs nothing.',
    ),
  },
  {
    p: t('¿Qué pasa después de que queda andando?', 'What happens after it goes live?'),
    r: t(
      'Se monitorea, se ajusta y se reporta. Hablás con quien lo construyó: no hay gerente de cuentas, ni ticket que escala, ni nadie que te explique tu propio sistema de memoria. Y si dejás de pagar, se apaga lo que hospedamos nosotros — tus datos son tuyos y están donde siempre estuvieron: tu calendario, tu planilla, tu cuenta.',
      'We monitor it, adjust it and report on it. You talk to whoever built it: no account manager, no ticket to escalate, nobody explaining your own system from memory. And if you stop paying, what we host switches off — your data is yours and stays where it always was: your calendar, your spreadsheet, your account.',
    ),
  },
  {
    p: t('¿Qué pasa con los datos?', 'What happens to the data?'),
    r: t(
      'Ley 18.331. Con datos sensibles —salud, por ejemplo— el cuerpo de los mensajes se borra a los 90 días, los teléfonos quedan hasheados para las métricas, no se usa nada para entrenar ningún modelo y cada cliente ve solo lo suyo. Las claves de tus servicios quedan en tu cuenta.',
      'Uruguayan law 18.331 applies. With sensitive data — health records, for instance — message bodies are deleted after 90 days, phone numbers are hashed for the metrics, nothing is used to train any model, and each client sees only their own data. Your services’ credentials stay in your account.',
    ),
  },
];

const FAQ_PRODUCTO: Pregunta[] = [
  {
    p: t('¿Tengo que cambiar mi número de WhatsApp?', 'Do I have to change my WhatsApp number?'),
    r: t(
      'Hay dos caminos. El rápido es un número nuevo, dedicado al asistente, que va en tu página, tu Instagram y tu Google; el tuyo de siempre queda como está, para vos. El otro es usar el tuyo, que se puede pero lleva trámite. Para arrancar recomendamos el nuevo, y si después lo querés mudar, se muda. Lo que no te vamos a decir es «no pasa nada, seguís usando el tuyo igual»: con la API oficial de WhatsApp eso no es cierto.',
      'There are two routes. The fast one is a new number, dedicated to the assistant, that goes on your page, your Instagram and your Google listing — your usual number stays untouched, for you. The other is using your existing number, which is possible but takes paperwork. To start we recommend the new one, and it can be migrated later. What we will not tell you is “don’t worry, you keep using yours as always”: with the official WhatsApp API that is not true.',
    ),
  },
  {
    p: t('¿Y si contesta cualquier cosa o inventa un precio?', 'What if it makes something up, like a price?'),
    r: t(
      'No le pedimos que no invente: se lo impedimos. Un precio que no está en tu lista no existe para el asistente. Y si llegara a escribir «ya te agendé» sin haber agendado, el sistema lo agarra antes de que el mensaje salga — nos pasó una vez, y por eso hoy cada confirmación se verifica contra la base. Ante cualquier duda no improvisa: te la pasa a vos.',
      'We do not ask it not to invent things: we make it impossible. A price that is not on your list does not exist for the assistant. And if it ever wrote “you’re booked” without booking anything, the system catches it before the message leaves — it happened once, which is why every confirmation is now verified against the database. When in doubt it does not improvise: it hands the conversation to you.',
    ),
  },
  {
    p: t('¿Me traés clientes nuevos?', 'Will this bring me new customers?'),
    r: t(
      'No. Recuperás los que ya te escriben y no contestás. La métrica que vas a mirar en el panel es literalmente cuántas consultas te entraron fuera de horario.',
      'No. You recover the ones already writing to you and getting no answer. The number you will watch on the dashboard is, literally, how many enquiries arrived outside your opening hours.',
    ),
  },
  {
    p: t('¿Escucha audios? ¿Mira fotos?', 'Does it listen to voice notes? Does it look at photos?'),
    r: t(
      'Audios: pide que te lo escriban. Fotos: deriva sin mirarlas, y es deliberado. En un rubro donde la foto suele ser de una piel irritada, mirar es opinar.',
      'Voice notes: it asks the person to write instead. Photos: it hands the conversation over without looking at them, on purpose. In a field where the photo is usually of irritated skin, looking is the same as giving an opinion.',
    ),
  },
];

// ────────────────────────────────────────────────────────────────
// Estilos
// ────────────────────────────────────────────────────────────────
/**
 * Todo en linea, en un solo <style>. Son ~10 KB antes de comprimir:
 * un archivo aparte serian dos peticiones y un round-trip mas para
 * ahorrar bytes que gzip ya se lleva.
 *
 * Las proporciones del manual (75 % fondo · 20 % texto · 4 % hielo ·
 * 1 % azul) se sostienen solas si se respeta la regla: el azul
 * aparece unicamente en .boton, en los links de texto y en el foco.
 */
const CSS = `
:root{
  --tinta:#0B0E14; --superficie:#141922; --superficie-2:#1C222D; --linea:#242C3A;
  --hielo:#B4D2EE; --azul:#4A9EFF; --azul-hondo:#1C6FD6;
  --hueso:#EDF1F7; --niebla:#8794A8; --verde:#2ECFC4;
  --display:"Chivo","Segoe UI",system-ui,sans-serif;
  --texto:"Inter","Segoe UI",system-ui,sans-serif;
  --serif:"Instrument Serif",Georgia,"Times New Roman",serif;
  --mono:"Chivo Mono",ui-monospace,"SF Mono",Menlo,monospace;
  --ancho:1120px; --gutter:clamp(20px,5vw,40px);
  --seccion:clamp(72px,10vw,128px);
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:88px}
body{margin:0;background:var(--tinta);color:var(--hueso);
  font-family:var(--texto);font-size:16px;line-height:1.6;
  -webkit-font-smoothing:antialiased;overflow-x:hidden}
img,svg{max-width:100%}
h1,h2,h3{font-family:var(--display);font-weight:800;letter-spacing:-.045em;line-height:1.03;margin:0;
  text-wrap:balance}
p{margin:0}
code{font-family:var(--mono);font-size:.92em;color:var(--hielo)}
strong{font-weight:600;color:var(--hueso)}

/* El azul es lo tocable. Nada mas. */
a{color:var(--azul);text-decoration:none}
a:hover{color:var(--azul-hondo)}
:focus-visible{outline:2px solid var(--azul);outline-offset:3px;border-radius:3px}

.env{max-width:var(--ancho);margin:0 auto;padding-inline:var(--gutter)}
.seccion{padding-block:var(--seccion);position:relative}
.linea-arriba{border-top:1px solid var(--linea)}

.etiqueta{font-family:var(--mono);font-weight:500;font-size:11.5px;letter-spacing:.13em;
  text-transform:uppercase;color:var(--niebla);margin:0}
/* nowrap: el dato del titular es una unidad. Partido en dos
   renglones deja un "pm" solo en serif cursiva al principio de una
   linea y el gesto tipografico se pierde. */
.momento{font-family:var(--serif);font-weight:400;font-style:italic;color:var(--hielo);
  letter-spacing:normal;white-space:nowrap}
/* La otra mitad del acento: Instrument Serif REDONDA. Va un punto mas
   grande que el Chivo que la rodea porque una serif de contraste alto
   pesa menos a igual cuerpo — al mismo tamaño se ve chica. */
.promesa{font-family:var(--serif);font-weight:400;font-style:normal;color:var(--hielo);
  letter-spacing:-.01em;font-size:1.1em;line-height:1.15}
/* El acento tipografico fuera del hero: una cita, un cierre. Nunca
   texto corrido ni interfaz (§5 del manual). */
.serif{font-family:var(--serif);font-weight:400;letter-spacing:-.01em}
.niebla{color:var(--niebla)}

.h2{font-size:clamp(28px,4.2vw,42px);letter-spacing:-.04em}
.bajada{color:var(--niebla);font-size:clamp(16px,1.6vw,18px);max-width:58ch;margin-top:18px}
.cabecera-seccion{margin-bottom:clamp(36px,5vw,56px)}
.cabecera-seccion .etiqueta{margin-bottom:16px}

/* ── Botones ────────────────────────────────────────────────── */
.boton{display:inline-flex;align-items:center;gap:9px;min-height:46px;
  padding:11px 20px;border-radius:3px;border:1px solid transparent;
  font-family:var(--display);font-weight:700;font-size:15px;letter-spacing:-.01em;
  cursor:pointer;transition:background .18s ease,border-color .18s ease,color .18s ease}
.boton-1{background:var(--azul);color:#08101C}
.boton-1:hover{background:var(--azul-hondo);color:#08101C}
.boton-2{background:transparent;color:var(--hueso);border-color:var(--linea)}
.boton-2:hover{border-color:var(--hielo);color:var(--hueso);background:var(--superficie)}
.boton .ico{width:17px;height:17px;flex:none}

/* ── Cabecera ───────────────────────────────────────────────── */
.saltar{position:absolute;left:-9999px;top:0;z-index:60;background:var(--azul);
  color:#08101C;padding:10px 16px;border-radius:3px;font-weight:600}
.saltar:focus{left:12px;top:12px}
.cabecera{position:sticky;top:0;z-index:50;background:rgba(11,14,20,.82);
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  border-bottom:1px solid var(--linea)}
.cabecera .env{display:flex;align-items:center;gap:22px;height:68px}
.logo{display:inline-flex;align-items:center;gap:11px;color:var(--hueso)}
/* La ficha de la "version simplificada" del manual. #1C222D, no
   #242C3A: ese es el color de linea y un disco de linea se lee como
   un borde grueso, no como marca. */
.logo-ficha{display:inline-flex;align-items:center;justify-content:center;
  background:var(--superficie-2);border-radius:999px;flex:none}
.logo-nombre{font-family:var(--display);font-weight:700;font-size:21px;letter-spacing:-.035em}
.nav{display:flex;align-items:center;gap:26px;margin-left:auto}
/* :not(.boton) NO ES ADORNO. Sin eso, ".nav a" (0,2,0) le gana a
   ".boton-1" (0,1,0) y el boton azul del nav se pinta de niebla:
   texto gris sobre azul, 1.12:1, ilegible. Se veia como "el boton
   quedo raro" y era una regla de especificidad. */
.nav a:not(.boton){color:var(--niebla);font-size:14.5px;font-weight:500;padding-block:6px}
.nav a:not(.boton):hover{color:var(--hueso)}
.idioma{font-family:var(--mono);font-size:11.5px;letter-spacing:.13em;text-transform:uppercase;
  color:var(--niebla);border:1px solid var(--linea);border-radius:999px;padding:5px 12px}
.idioma:hover{color:var(--hueso);border-color:var(--hielo)}
.nav a.idioma{padding:6px 12px}
.menu-boton{display:none;margin-left:auto;background:none;border:1px solid var(--linea);
  border-radius:3px;color:var(--hueso);width:44px;height:40px;cursor:pointer;
  align-items:center;justify-content:center}

/* ── Hero ───────────────────────────────────────────────────── */
.hero{padding-top:clamp(56px,8vw,96px);padding-bottom:var(--seccion);
  position:relative;overflow:hidden}
/* Rejilla de fondo: la linea al 50 %, apagandose hacia abajo. Es el
   unico adorno de la pagina y no compite con nada porque no tiene
   contraste suficiente para leerse como elemento. */
.hero::before{content:"";position:absolute;inset:-1px 0 auto;height:640px;pointer-events:none;
  background-image:linear-gradient(var(--linea) 1px,transparent 1px),
    linear-gradient(90deg,var(--linea) 1px,transparent 1px);
  background-size:72px 72px;opacity:.5;
  -webkit-mask-image:radial-gradient(120% 78% at 50% 0%,#000 0%,transparent 72%);
  mask-image:radial-gradient(120% 78% at 50% 0%,#000 0%,transparent 72%)}
.hero .env{position:relative;display:grid;grid-template-columns:1.18fr .82fr;
  gap:clamp(40px,5vw,56px);align-items:center}
.pildora{display:inline-flex;align-items:center;gap:9px;border:1px solid var(--linea);
  border-radius:999px;padding:6px 14px;background:var(--superficie)}
.punto{width:6px;height:6px;border-radius:999px;background:var(--verde);flex:none;
  box-shadow:0 0 0 3px rgba(46,207,196,.16)}
/* 44 px y no 58: el titular son DOS oraciones (~110 caracteres). A
   58 px caia en seis renglones, empujaba el hero fuera de la primera
   pantalla y dejaba el panel del costado flotando contra un muro de
   texto. El tamaño de un titular lo decide su largo, no el gusto. */
.hero h1{font-size:clamp(30px,3.9vw,44px);letter-spacing:-.04em;line-height:1.07;margin-top:26px}
.hero .bajada{font-size:clamp(16px,1.65vw,18px);max-width:54ch;margin-top:22px}
.acciones{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}
.hero-nota{margin-top:22px;color:var(--niebla);font-size:14px;max-width:46ch}

/* ── Maqueta de chat ────────────────────────────────────────── */
.chat-rotulo{margin-bottom:12px;color:var(--hielo)}
.chat,.demo-panel{background:var(--superficie);border:1px solid var(--linea);border-radius:3px;
  padding:18px;display:flex;flex-direction:column;gap:12px}
.chat-cabecera{display:flex;align-items:center;gap:11px;padding-bottom:14px;
  border-bottom:1px solid var(--linea)}
.chat-disco{width:34px;height:34px;border-radius:999px;background:var(--superficie-2);
  display:flex;align-items:center;justify-content:center;color:var(--hielo);flex:none}
.chat-disco .ico{width:17px;height:17px}
.chat-quien{font-family:var(--display);font-weight:700;font-size:14.5px;letter-spacing:-.02em;
  display:block}
.chat-estado{display:flex;align-items:center;gap:6px;color:var(--verde);font-size:12px}
.chat-hora{margin-left:auto;font-family:var(--mono);font-size:11.5px;letter-spacing:.13em;
  color:var(--niebla)}
.burbuja{max-width:88%;padding:11px 14px;border-radius:3px;font-size:14.5px;line-height:1.55}
.b-ella{align-self:flex-start;background:var(--superficie-2);color:var(--hueso);
  border-left:2px solid var(--linea)}
.b-bot{align-self:flex-end;background:rgba(74,158,255,.09);color:var(--hueso);
  border-right:2px solid var(--hielo)}
.chat-sello{display:flex;align-items:center;gap:8px;margin-top:2px;padding-top:13px;
  border-top:1px solid var(--linea);color:var(--niebla);font-size:12.5px}
.chat-sello .ico{width:15px;height:15px;color:var(--hielo);flex:none}
.puntitos{display:inline-flex;gap:4px;align-self:flex-end;padding:13px 15px;
  background:rgba(74,158,255,.09);border-radius:3px;border-right:2px solid var(--hielo)}
.puntitos i{width:5px;height:5px;border-radius:999px;background:var(--niebla);
  animation:latir 1.25s infinite ease-in-out}
.puntitos i:nth-child(2){animation-delay:.16s}
.puntitos i:nth-child(3){animation-delay:.32s}
@keyframes latir{0%,60%,100%{opacity:.28;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
/* OJO CON EL ORDEN: la conversacion se ve ENTERA por defecto y solo
   se esconde cuando el script la va a reproducir (.armado). Al reves
   —esconder por CSS y mostrar por JS— alcanza con que el script no
   corra para que quede un recuadro vacio en el medio de la pagina,
   que es peor que no tener la animacion. */
.demo-panel.armado .burbuja,
.demo-panel.armado .puntitos,
.demo-panel.armado .chat-sello{opacity:0;transform:translateY(8px);
  transition:opacity .34s ease,transform .34s ease}
.demo-panel.armado .visible{opacity:1;transform:none}
.demo-panel .puntitos{display:none}
.demo-panel.armado .puntitos{display:inline-flex}

/* ── Servicios ──────────────────────────────────────────────── */
.servicios{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--linea);
  border:1px solid var(--linea);border-radius:3px;overflow:hidden}
.servicio{background:var(--superficie);padding:30px 28px 34px;transition:background .2s ease}
.servicio:hover{background:var(--superficie-2)}
.servicio-alto{display:flex;align-items:center;gap:12px;margin-bottom:20px}
.servicio-n{font-family:var(--mono);font-weight:500;font-size:12.5px;letter-spacing:.13em;
  color:var(--hielo)}
.servicio-alto .ico{width:19px;height:19px;color:var(--hielo);margin-left:auto}
.servicio h3{font-size:20px;letter-spacing:-.035em;font-weight:700}
.servicio p{color:var(--niebla);font-size:15px;margin-top:12px;max-width:46ch}
.cierre-servicios{display:flex;flex-wrap:wrap;align-items:center;gap:20px;
  justify-content:space-between;margin-top:26px;
  border:1px solid var(--linea);border-left:2px solid var(--hielo);border-radius:3px;
  padding:22px 24px}
.cierre-servicios p{color:var(--niebla);font-size:15.5px;max-width:62ch}

/* ── Código propio ──────────────────────────────────────────── */
.dos{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.bloque{background:var(--superficie);border:1px solid var(--linea);border-radius:3px;
  padding:28px 26px 30px}
.bloque h3{font-size:18px;letter-spacing:-.03em;font-weight:700;line-height:1.2}
.bloque p{color:var(--niebla);font-size:15px;margin-top:13px}
/* El bloque del precio es el unico con borde de marca: es la
   afirmacion mas fuerte de la pagina y conviene que se vea que lo
   sabemos. Hielo, no azul: no se puede tocar. */
.bloque-marca{border-left:2px solid var(--hielo)}

/* ── Stack ──────────────────────────────────────────────────── */
.stack-fila+.stack-fila{margin-top:28px}
.stack-fila h3{font-family:var(--mono);font-weight:500;font-size:11.5px;letter-spacing:.13em;
  text-transform:uppercase;color:var(--niebla);margin-bottom:14px}
.pastillas{display:flex;flex-wrap:wrap;gap:9px;list-style:none;margin:0;padding:0}
.pastillas li{border:1px solid var(--linea);border-radius:999px;padding:8px 15px;
  background:var(--superficie);font-size:14px;color:var(--hueso)}
.stack-nota{color:var(--niebla);font-size:14.5px;margin-top:28px;max-width:64ch}

/* ── Proceso ────────────────────────────────────────────────── */
/* En renglones, no en cinco columnas. Con cinco columnas dentro de
   1120 px cada paso queda en 155 px de texto y las descripciones
   caen en siete renglones de tres palabras: se lee como una tabla
   apretada, no como una secuencia. */
.pasos{border-top:1px solid var(--linea)}
.paso{display:grid;grid-template-columns:56px minmax(180px,250px) 1fr;
  gap:clamp(16px,3vw,40px);align-items:start;
  padding:26px 0;border-bottom:1px solid var(--linea)}
.paso b{font-family:var(--mono);font-weight:500;font-size:12.5px;letter-spacing:.13em;
  color:var(--hielo);padding-top:3px}
.paso h3{font-size:19px;letter-spacing:-.035em;font-weight:700}
.paso p{color:var(--niebla);font-size:15px;max-width:62ch}

/* ── El caso ────────────────────────────────────────────────── */
.caso{display:grid;grid-template-columns:.95fr 1.05fr;gap:clamp(36px,5vw,60px);align-items:start}
.caso-pie{margin-top:16px;color:var(--niebla);font-size:13px}
.numeros{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--linea);
  border:1px solid var(--linea);border-radius:3px;overflow:hidden;margin-top:clamp(40px,5vw,56px)}
.numero{background:var(--tinta);padding:26px 22px}
.numero b{display:block;font-family:var(--display);font-weight:800;font-size:clamp(28px,3.2vw,38px);
  letter-spacing:-.045em;color:var(--hielo);line-height:1}
.numero span{display:block;margin-top:10px;color:var(--niebla);font-size:13.5px;line-height:1.45}
.limites{display:grid;grid-template-columns:1fr 1fr;gap:clamp(28px,4vw,52px);align-items:start;
  margin-top:clamp(40px,5vw,56px)}
.limites h3{font-size:clamp(21px,2.6vw,27px);letter-spacing:-.035em}
.lista-no{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px;
  background:var(--linea);border:1px solid var(--linea);border-radius:3px;overflow:hidden}
.lista-no li{background:var(--superficie);padding:15px 18px;display:flex;align-items:center;gap:13px;
  font-size:15px}
.lista-no .ico{width:16px;height:16px;color:var(--hielo);flex:none}
.lim-cierre{color:var(--niebla);font-size:15.5px;margin-top:20px;max-width:52ch}

/* ── Empresa ────────────────────────────────────────────────── */
.empresa{display:grid;grid-template-columns:1fr 1fr;gap:clamp(32px,5vw,64px);align-items:start}
.empresa p+p{margin-top:18px}
.sellos{display:flex;flex-direction:column;gap:1px;background:var(--linea);
  border:1px solid var(--linea);border-radius:3px;overflow:hidden}
.sellos div{background:var(--superficie);padding:16px 18px;display:flex;align-items:center;gap:13px;
  font-size:14.5px;color:var(--niebla)}
.sellos .ico{width:17px;height:17px;color:var(--hielo);flex:none}

/* ── FAQ ────────────────────────────────────────────────────── */
.faq{max-width:880px}
.faq-grupo{font-family:var(--mono);font-weight:500;font-size:11.5px;letter-spacing:.13em;
  text-transform:uppercase;color:var(--hielo);margin:0 0 4px;padding-top:8px}
.faq-grupo+details{border-top:1px solid var(--linea)}
.faq-grupo:not(:first-child){margin-top:44px}
details{border-bottom:1px solid var(--linea)}
summary{list-style:none;cursor:pointer;padding:22px 40px 22px 0;position:relative;
  font-family:var(--display);font-weight:700;font-size:17px;letter-spacing:-.03em;color:var(--hueso)}
summary::-webkit-details-marker{display:none}
summary::after{content:"";position:absolute;right:6px;top:50%;width:11px;height:11px;
  border-right:1.6px solid var(--hielo);border-bottom:1.6px solid var(--hielo);
  transform:translateY(-70%) rotate(45deg);transition:transform .22s ease}
details[open] summary::after{transform:translateY(-30%) rotate(225deg)}
summary:hover{color:var(--hielo)}
details p{color:var(--niebla);font-size:15.5px;padding:0 40px 24px 0;max-width:70ch}

/* ── Cierre ─────────────────────────────────────────────────── */
.cierre-cta{background:var(--superficie);border:1px solid var(--linea);border-radius:3px;
  padding:clamp(36px,5vw,60px);text-align:center}
/* El cierre entero en Instrument Serif. Es exactamente el uso que
   describe el §5 del manual —"el cierre de una propuesta"— y es lo
   que hace que la ultima pantalla no suene igual que las anteriores.
   Regular, porque Instrument Serif no tiene negrita. */
.cierre-cta h2{font-family:var(--serif);font-weight:400;font-size:clamp(30px,4.4vw,50px);
  letter-spacing:-.015em;line-height:1.13;max-width:20ch;margin-inline:auto}
.acento-serif{font-size:1.06em;font-style:normal;color:var(--hielo)}
.cita{color:var(--hielo);font-size:1.1em;line-height:1.35;display:block;margin-bottom:8px}
.cita code{color:var(--hielo)}
.cierre-cta .bajada{margin-inline:auto;text-align:center}
.cierre-cta .acciones{justify-content:center}

/* ── Pie ────────────────────────────────────────────────────── */
.pie{border-top:1px solid var(--linea);padding-block:52px 40px;color:var(--niebla);font-size:14px}
.pie-grilla{display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:36px}
.pie h4{font-family:var(--mono);font-weight:500;font-size:11.5px;letter-spacing:.13em;
  text-transform:uppercase;color:var(--niebla);margin:0 0 16px}
.pie ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
/* 24 px de alto minimo (WCAG 2.5.8): un link de pie de 16 px de alto
   se falla con el pulgar. El padding hace el objetivo, no la letra. */
.pie ul a{color:var(--niebla);display:inline-block;padding-block:6px}
.pie ul a:hover{color:var(--hueso)}
.pie-bajada{margin-top:16px;max-width:36ch}
.pie-linea{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;
  margin-top:44px;padding-top:22px;border-top:1px solid var(--linea);font-size:13px}

/* ── El aura del cursor ─────────────────────────────────────── */
/*
 * Dos efectos distintos, uno por zona, y esa es la gracia: el hero
 * enciende su rejilla alrededor del puntero, y los titulos de
 * seccion se iluminan con un aura blanca que da vuelta el texto a
 * tinta para que se siga leyendo.
 *
 * SOLO EN PUNTERO FINO. En una pantalla tactil no hay cursor: el
 * efecto no existiria y las dos copias extra del texto serian peso
 * muerto. Fuera del media query estan en display:none, asi que el
 * titulo es un <h2> comun y no cambia nada del layout.
 *
 * Y NO TOCA EL LAYOUT tampoco en escritorio: la copia oscura va con
 * inset:0 —calza letra por letra con el texto de abajo— y la luz se
 * desborda con inset negativo, compensando ese corrimiento en las
 * coordenadas de su gradiente. Si en vez de eso se le pusiera
 * padding al titulo, habria que compensar el margen en cada h2 y el
 * primero que se agregue sin compensar queda desplazado.
 */
.aura-luz,.aura-copia{display:none}
/* min-width:1000px ADEMAS de puntero fino: la luz se desborda 96 px
   a cada lado del titulo y en un viewport angosto eso empuja el
   ancho del documento — 76 px de scroll horizontal, medidos. Aparte
   del bug, un halo de 96 px no tiene sentido en una pantalla de
   390: taparia media pantalla. */
@media (hover:hover) and (pointer:fine) and (min-width:1000px){
  /* isolation:isolate NO ES OPCIONAL: sin el, la luz —que se desborda
     del titulo con inset negativo— compite por z-index con la
     etiqueta de arriba y la bajada de abajo, y las tapa. Con el, el
     titulo entero se pinta como una unidad en el orden del flujo y
     los textos vecinos quedan encima, legibles sobre el halo. */
  .aura{position:relative;isolation:isolate;--mx:-999px;--my:-999px;--r:120px;--luz:96px}
  .aura-txt{position:relative;z-index:1}
  .aura-luz,.aura-copia{display:block;position:absolute;pointer-events:none;
    opacity:0;transition:opacity .3s ease}
  /* --luz tiene que ser MAYOR que el alcance del halo (≈0.78 × --r) o
     el circulo se corta contra el borde del box y se ve un tajo
     recto. Con --r:120 el alcance es ~94 px, de ahi los 96. */
  .aura-luz{inset:calc(var(--luz) * -1);z-index:2;
    background:radial-gradient(var(--r) circle at
      calc(var(--mx) + var(--luz)) calc(var(--my) + var(--luz)),
      #FFFFFF 0%, #E4EEFA 24%, rgba(180,210,238,.28) 50%, rgba(180,210,238,0) 76%)}
  /* LA MASCARA DE LA COPIA ES DURA Y LA DE LA LUZ ES SUAVE, y no es
     descuido. Si las dos se desvanecen igual, en el punto medio el
     fondo es gris a medias y el texto tambien: se cruzan en el mismo
     valor y la letra desaparece. Cortando el texto oscuro al 46 %
     —bien adentro de la zona clara— nunca hay letra a medio camino:
     o es tinta sobre claro, o es hueso sobre tinta. */
  .aura-copia{inset:0;z-index:3;color:var(--tinta);
    -webkit-mask-image:radial-gradient(var(--r) circle at var(--mx) var(--my),
      #000 0%, #000 36%, transparent 46%);
    mask-image:radial-gradient(var(--r) circle at var(--mx) var(--my),
      #000 0%, #000 36%, transparent 46%)}
  .aura.encendida .aura-luz,.aura.encendida .aura-copia{opacity:1}

  /* La rejilla del hero, encendida en hielo alrededor del puntero.
     Dos mascaras compuestas: la del cursor Y la del desvanecido
     hacia abajo del ::before. Sin la segunda, la rejilla iluminada
     aparece tambien donde la rejilla apagada ya no esta. */
  .hero{--hx:-999px;--hy:-999px}
  .hero::after{content:"";position:absolute;inset:-1px 0 auto;height:640px;
    pointer-events:none;opacity:0;transition:opacity .45s ease;
    background-image:linear-gradient(rgba(180,210,238,.85) 1px,transparent 1px),
      linear-gradient(90deg,rgba(180,210,238,.85) 1px,transparent 1px);
    background-size:72px 72px;
    -webkit-mask-image:radial-gradient(240px circle at var(--hx) var(--hy),#000 0%,transparent 66%),
      radial-gradient(120% 78% at 50% 0%,#000 0%,transparent 72%);
    mask-image:radial-gradient(240px circle at var(--hx) var(--hy),#000 0%,transparent 66%),
      radial-gradient(120% 78% at 50% 0%,#000 0%,transparent 72%);
    -webkit-mask-composite:source-in;mask-composite:intersect}
  .hero.encendida::after{opacity:1}
}

/* ── Revelado al scroll ─────────────────────────────────────── */
.rev{opacity:0;transform:translateY(14px)}
.rev.dentro{opacity:1;transform:none;transition:opacity .5s ease,transform .5s ease}

/* ── Responsive ─────────────────────────────────────────────── */
@media (max-width:1000px){
  .hero .env,.caso,.limites,.empresa,.dos{grid-template-columns:1fr}
  .numeros{grid-template-columns:1fr 1fr}
  .pie-grilla{grid-template-columns:1fr 1fr}
}
@media (max-width:720px){
  .nav{display:none}
  .nav.abierto{display:flex;position:absolute;left:0;right:0;top:68px;flex-direction:column;
    align-items:stretch;gap:0;background:var(--tinta);border-bottom:1px solid var(--linea);
    padding:8px var(--gutter) 20px;margin:0}
  .nav.abierto a:not(.boton){padding:13px 0;border-bottom:1px solid var(--linea);font-size:16px}
  .nav.abierto .idioma,.nav.abierto .boton{align-self:flex-start;margin-top:16px}
  .nav.abierto a.idioma{border-bottom:1px solid var(--linea)}
  .menu-boton{display:flex}
  .servicios{grid-template-columns:1fr}
  /* El numero pasa arriba del titulo: 56 px de columna fija se comen
     un tercio de una pantalla de 360. */
  .paso{grid-template-columns:1fr;gap:8px;padding:22px 0}
  .paso b{padding-top:0}
  .pie-grilla{grid-template-columns:1fr}
  .acciones .boton{flex:1 1 auto;justify-content:center}
  .cierre-servicios .boton{width:100%;justify-content:center}
}
@media (max-width:420px){ .numeros{grid-template-columns:1fr} }

/* Nadie tiene que marearse para leer una web. Con reduced-motion no
   hay revelado, no hay puntitos y no hay scroll suave: se ve el
   estado final directamente. */
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;
    transition-duration:.01ms!important}
  .rev{opacity:1;transform:none}
  .demo-panel.armado .burbuja,.demo-panel.armado .puntitos,
  .demo-panel.armado .chat-sello{opacity:1;transform:none}
}
`;

// ────────────────────────────────────────────────────────────────
// Piezas
// ────────────────────────────────────────────────────────────────
/** El destino de todos los botones de contacto. Sin WhatsApp, correo. */
function linkContacto(l: Idioma): string {
  if (!WHATSAPP) {
    const asunto = l === 'es' ? 'Consulta para UpTempo' : 'Enquiry for UpTempo';
    return `mailto:${CORREO}?subject=${encodeURIComponent(asunto)}`;
  }
  const texto = l === 'es'
    ? 'Hola! Vi la web de UpTempo y quiero consultarles algo.'
    : 'Hi! I saw the UpTempo site and I’d like to ask about something.';
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
}

function textoContacto(l: Idioma): string {
  return WHATSAPP ? COPY.ctaBoton[l] : COPY.ctaBotonCorreo[l];
}

/** target=_blank solo cuando el link SALE del sitio (wa.me). */
function afuera(): string {
  return WHATSAPP ? ' target="_blank" rel="noopener"' : '';
}

/**
 * La hora es opcional: en el caso, el "22:40" ES el punto —muestra a
 * que hora contesta el agente—. En el hero la charla es sobre la
 * agencia y una hora ahi no significa nada, asi que no va.
 */
function cabeceraChat(l: Idioma, conHora: boolean): string {
  return `<div class="chat-cabecera">
    <span class="chat-disco">${icono('wa')}</span>
    <span>
      <span class="chat-quien">${COPY.chatNombre[l]}</span>
      <span class="chat-estado">${COPY.chatEstado[l]}</span>
    </span>
    ${conHora ? `<span class="chat-hora">${COPY.chatHora[l]}</span>` : ''}
  </div>`;
}

/**
 * La maqueta del hero: estatica, ya resuelta, sin animar nada.
 *
 * SIN SELLO DE VERIFICACION. El sello dice "verificado contra la
 * agenda antes de mandarse" y eso es una propiedad del producto de
 * turnos, no de esta charla. Puesto aca seria el sello de otra cosa.
 */
function chatHero(l: Idioma): string {
  return `<div class="chat">
    ${cabeceraChat(l, false)}
    <div class="burbuja b-ella">${COPY.heroChatM1[l]}</div>
    <div class="burbuja b-bot">${COPY.heroChatM2[l]}</div>
    <div class="burbuja b-ella">${COPY.heroChatM3[l]}</div>
    <div class="burbuja b-bot">${COPY.heroChatM4[l]}</div>
  </div>`;
}

/**
 * La misma conversacion, pero por partes y con los puntitos entre
 * medio. Es una recreacion y lo dice abajo: el manual pide numeros
 * reales y frases sostenibles, y una maqueta que se hace pasar por
 * una sesion en vivo no lo es.
 */
function chatDemo(l: Idioma): string {
  return `<div class="demo-panel" id="replay">
    ${cabeceraChat(l, true)}
    <div class="burbuja b-ella" data-paso>${COPY.chatM1[l]}</div>
    <div class="puntitos" data-paso data-espera><i></i><i></i><i></i></div>
    <div class="burbuja b-bot" data-paso>${COPY.chatM2[l]}</div>
    <div class="burbuja b-ella" data-paso>${COPY.chatM3[l]}</div>
    <div class="puntitos" data-paso data-espera><i></i><i></i><i></i></div>
    <div class="burbuja b-bot" data-paso>${COPY.chatM4[l]}</div>
    <div class="chat-sello" data-paso>${icono('escudo')}<span>${COPY.chatSello[l]}</span></div>
  </div>`;
}

function servicio(n: string, ico: string, titulo: string, texto: string): string {
  return `<article class="servicio rev">
    <div class="servicio-alto">
      <span class="servicio-n">${n}</span>
      ${icono(ico)}
    </div>
    <h3>${titulo}</h3>
    <p>${texto}</p>
  </article>`;
}

function bloque(titulo: string, texto: string, marca = false): string {
  return `<article class="bloque rev${marca ? ' bloque-marca' : ''}">
    <h3>${titulo}</h3><p>${texto}</p>
  </article>`;
}

function paso(n: string, titulo: string, texto: string): string {
  return `<article class="paso rev"><b>${n}</b><h3>${titulo}</h3><p>${texto}</p></article>`;
}

/**
 * Un titulo de seccion con el aura del cursor.
 *
 * El texto va TRES veces en el DOM y solo una la lee un lector de
 * pantalla: las otras dos son aria-hidden. La copia oscura tiene que
 * ser texto de verdad —no una imagen ni un filtro— porque es la que
 * se ve adentro del aura, y tiene que romper en los mismos renglones
 * que el original o se ve doble.
 *
 * `radio` cambia el tamaño del aura por seccion: es la variacion que
 * pidio Tomas, chica y consistente, no un efecto distinto por
 * titulo.
 */
function h2Aura(texto: string, radio = 150, estilo = ''): string {
  return `<h2 class="h2 aura" data-aura style="--r:${radio}px${estilo ? ';' + estilo : ''}">
    <span class="aura-luz" aria-hidden="true"></span>
    <span class="aura-txt">${texto}</span>
    <span class="aura-copia" aria-hidden="true">${texto}</span>
  </h2>`;
}

function pastillas(items: string[]): string {
  return `<ul class="pastillas">${items.map(x => `<li>${x}</li>`).join('')}</ul>`;
}

// <details> nativo: el acordeon accesible que no hay que programar.
// Funciona con teclado, con lector de pantalla y con JavaScript
// apagado, y no pesa nada.
function faqHtml(l: Idioma, lista: Pregunta[]): string {
  return lista.map(f => `<details>
    <summary>${f.p[l]}</summary>
    <p>${f.r[l]}</p>
  </details>`).join('\n');
}

/**
 * El script. Tres cosas y ninguna imprescindible: si no corre, la
 * pagina se ve entera igual.
 *
 * OJO — LA CUARTA SI LO ES: es el rescate del enlace magico del
 * panel. Supabase devuelve el access_token en el fragmento de la
 * URL, que nunca llega al servidor; si la raiz no lo reenvia a
 * /panel, el correo de login lleva a la home y no entra nadie. Esto
 * estaba en la pagina PUENTE que esta web reemplaza y tiene que
 * seguir estando.
 */
const SCRIPT = `
(function(){
  var quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1. Menú de mano.
  var b = document.querySelector('.menu-boton'), n = document.querySelector('.nav');
  if (b && n) b.addEventListener('click', function(){
    var abierto = n.classList.toggle('abierto');
    b.setAttribute('aria-expanded', abierto ? 'true' : 'false');
  });

  // 2. Revelado al entrar. Sin IntersectionObserver o con
  //    reduced-motion, todo visible de una.
  var revs = document.querySelectorAll('.rev');
  if (quieto || !('IntersectionObserver' in window)) {
    revs.forEach(function(e){ e.classList.add('dentro'); });
  } else {
    var obs = new IntersectionObserver(function(entradas){
      entradas.forEach(function(x, i){
        if (!x.isIntersecting) return;
        setTimeout(function(){ x.target.classList.add('dentro'); }, i * 70);
        obs.unobserve(x.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .12 });
    revs.forEach(function(e){ obs.observe(e); });
  }

  // 3. La conversación del caso.
  var panel = document.getElementById('replay');
  var play = document.getElementById('play');
  if (panel && play) {
    var pasos = panel.querySelectorAll('[data-paso]');
    var relojes = [];
    function correr(){
      relojes.forEach(clearTimeout); relojes = [];
      // .armado es lo que apaga la conversación. Se pone recién acá:
      // hasta que el script no está seguro de que la va a
      // reproducir, la conversación se ve entera.
      panel.classList.add('armado');
      var espera = 0;
      pasos.forEach(function(p){
        p.classList.remove('visible'); p.style.display = '';
        relojes.push(setTimeout(function(){ p.classList.add('visible'); }, espera));
        var vive = p.hasAttribute('data-espera') ? 1100 : 1500;
        if (p.hasAttribute('data-espera')) {
          relojes.push(setTimeout(function(){
            p.classList.remove('visible'); p.style.display = 'none';
          }, espera + vive));
        }
        espera += vive;
      });
      play.textContent = play.dataset.otra;
    }
    if (quieto) { play.hidden = true; }
    else {
      play.addEventListener('click', correr);
      // Arranca solo la primera vez que se ve, que es cuando la
      // persona está mirando. Después, solo a pedido.
      if ('IntersectionObserver' in window) {
        var o2 = new IntersectionObserver(function(e){
          if (e[0].isIntersecting) { correr(); o2.disconnect(); }
        }, { threshold: .4 });
        o2.observe(panel);
      }
    }
  }

  // 4. El aura del cursor. Solo con puntero fino y sin
  //    reduced-motion: en táctil no hay cursor que seguir, y a quien
  //    pidió menos movimiento no se le pone una luz persiguiéndole
  //    la mano. El CSS ya esconde las capas fuera de (hover:hover),
  //    esto evita además escuchar eventos al pedo.
  var fino = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (fino && !quieto) {
    var seguir = function(el, px, py){
      return function(e){
        var r = el.getBoundingClientRect();
        el.style.setProperty(px, (e.clientX - r.left) + 'px');
        el.style.setProperty(py, (e.clientY - r.top) + 'px');
        el.classList.add('encendida');
      };
    };
    var apagar = function(el){
      return function(){ el.classList.remove('encendida'); };
    };
    document.querySelectorAll('[data-aura]').forEach(function(el){
      el.addEventListener('pointermove', seguir(el, '--mx', '--my'));
      el.addEventListener('pointerleave', apagar(el));
    });
    var hero = document.querySelector('.hero');
    if (hero) {
      hero.addEventListener('pointermove', seguir(hero, '--hx', '--hy'));
      hero.addEventListener('pointerleave', apagar(hero));
    }
  }

  // 5. Rescate del enlace mágico del panel. NO SACAR.
  if (location.hash && location.hash.indexOf('access_token') !== -1) {
    location.replace('/panel' + location.hash);
  }
})();
`;

// ────────────────────────────────────────────────────────────────
// La página
// ────────────────────────────────────────────────────────────────
export function paginaWeb(l: Idioma = 'es'): string {
  const otro: Idioma = l === 'es' ? 'en' : 'es';
  const rutaOtro = otro === 'es' ? '/' : '/en';
  const raiz = l === 'es' ? '/' : '/en';
  const contacto = linkContacto(l);
  const base = 'https://uptempo.uy';

  const nav = `
    <a href="#servicios">${COPY.navServicios[l]}</a>
    <a href="#como">${COPY.navComo[l]}</a>
    <a href="#caso">${COPY.navCaso[l]}</a>
    <a href="#preguntas">${COPY.navPreguntas[l]}</a>
    <a class="idioma" href="${rutaOtro}" hreflang="${otro}" lang="${otro}">${COPY.pieIdioma[l]}</a>
    <a class="boton boton-1" href="${contacto}"${afuera()}>${COPY.navContacto[l]}</a>`;

  return `<!doctype html>
<html lang="${l}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${COPY.metaTitulo[l]}</title>
<meta name="description" content="${COPY.metaDesc[l]}">
<meta name="theme-color" content="#0B0E14">
<link rel="canonical" href="${base}${raiz}">
<link rel="alternate" hreflang="es" href="${base}/">
<link rel="alternate" hreflang="en" href="${base}/en">
<link rel="alternate" hreflang="x-default" href="${base}/">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:title" content="${COPY.metaTitulo[l]}">
<meta property="og:description" content="${COPY.metaDesc[l]}">
<meta property="og:url" content="${base}${raiz}">
<meta property="og:locale" content="${l === 'es' ? 'es_UY' : 'en_US'}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chivo:wght@400;600;700;800&family=Chivo+Mono:wght@400;500&family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap">
<style>${CSS}</style>
</head>
<body>
<a class="saltar" href="#principal">${COPY.navIrA[l]}</a>

<header class="cabecera">
  <div class="env">
    <a href="${raiz}" aria-label="UpTempo">${logo(28)}</a>
    <button class="menu-boton" type="button" aria-expanded="false" aria-label="${COPY.navAbrir[l]}">
      ${icono('menu')}
    </button>
    <nav class="nav">${nav}</nav>
  </div>
</header>

<main id="principal">

  <!-- ── Hero ─────────────────────────────────────────────── -->
  <section class="hero">
    <div class="env">
      <div>
        <p class="pildora etiqueta"><span class="punto"></span>${COPY.heroEtiqueta[l]}</p>
        <h1>${COPY.heroTituloA[l]}<span class="momento">${COPY.heroDato[l]}</span>${COPY.heroTituloB[l]}
          <span class="promesa">${COPY.heroPromesa[l]}</span></h1>
        <p class="bajada">${COPY.heroBajada[l]}</p>
        <div class="acciones">
          <a class="boton boton-1" href="#servicios">${COPY.heroCtaA[l]}${icono('flecha')}</a>
          <a class="boton boton-2" href="${contacto}"${afuera()}>${COPY.heroCtaB[l]}</a>
        </div>
        <p class="hero-nota">${COPY.heroNota[l]}</p>
      </div>
      <div>${chatHero(l)}</div>
    </div>
  </section>

  <!-- ── Servicios ────────────────────────────────────────── -->
  <section class="seccion linea-arriba" id="servicios">
    <div class="env">
      <div class="cabecera-seccion">
        <p class="etiqueta">${COPY.servEtiqueta[l]}</p>
        ${h2Aura(COPY.servTitulo[l], 132)}
        <p class="bajada">${COPY.servBajada[l]}</p>
      </div>
      <div class="servicios">
        ${servicio('01', 'chat', COPY.serv1T[l], COPY.serv1D[l])}
        ${servicio('02', 'engranaje', COPY.serv2T[l], COPY.serv2D[l])}
        ${servicio('03', 'datos', COPY.serv3T[l], COPY.serv3D[l])}
        ${servicio('04', 'codigo', COPY.serv4T[l], COPY.serv4D[l])}
      </div>
      <div class="cierre-servicios rev">
        <p>${COPY.servCierre[l]}</p>
        <a class="boton boton-1" href="${contacto}"${afuera()}>${COPY.servCierreCta[l]}${icono('flecha')}</a>
      </div>
    </div>
  </section>

  <!-- ── Código propio ────────────────────────────────────── -->
  <section class="seccion linea-arriba" id="como">
    <div class="env">
      <div class="cabecera-seccion">
        <p class="etiqueta">${COPY.codEtiqueta[l]}</p>
        ${h2Aura(COPY.codTitulo[l], 118)}
        <p class="bajada">${COPY.codBajada[l]}</p>
      </div>
      <div class="dos">
        ${bloque(COPY.cod1T[l], COPY.cod1D[l])}
        ${bloque(COPY.cod2T[l], COPY.cod2D[l])}
        ${bloque(COPY.cod3T[l], COPY.cod3D[l], true)}
        ${bloque(COPY.cod4T[l], COPY.cod4D[l])}
      </div>
    </div>
  </section>

  <!-- ── Stack ────────────────────────────────────────────── -->
  <section class="seccion linea-arriba">
    <div class="env">
      <div class="cabecera-seccion">
        <p class="etiqueta">${COPY.stackEtiqueta[l]}</p>
        ${h2Aura(COPY.stackTitulo[l], 106)}
      </div>
      <div class="rev">
        <div class="stack-fila">
          <h3>${COPY.stackA[l]}</h3>
          ${pastillas(STACK_CONECTA)}
        </div>
        <div class="stack-fila">
          <h3>${COPY.stackB[l]}</h3>
          ${pastillas(STACK_CONSTRUYE)}
        </div>
        <p class="stack-nota">${COPY.stackNota[l]}</p>
      </div>
    </div>
  </section>

  <!-- ── Proceso ──────────────────────────────────────────── -->
  <section class="seccion linea-arriba">
    <div class="env">
      <div class="cabecera-seccion">
        <p class="etiqueta">${COPY.procEtiqueta[l]}</p>
        ${h2Aura(COPY.procTitulo[l], 124)}
      </div>
      <div class="pasos">
        ${paso('01', COPY.proc1T[l], COPY.proc1D[l])}
        ${paso('02', COPY.proc2T[l], COPY.proc2D[l])}
        ${paso('03', COPY.proc3T[l], COPY.proc3D[l])}
        ${paso('04', COPY.proc4T[l], COPY.proc4D[l])}
        ${paso('05', COPY.proc5T[l], COPY.proc5D[l])}
      </div>
    </div>
  </section>

  <!-- ── En producción: el caso ───────────────────────────── -->
  <section class="seccion linea-arriba" id="caso">
    <div class="env">
      <div class="caso">
        <div>
          <p class="etiqueta">${COPY.casoEtiqueta[l]}</p>
          ${h2Aura(COPY.casoTitulo[l], 128, "margin-top:16px")}
          <p class="bajada">${COPY.casoBajada[l]}</p>
          <div class="acciones">
            <button class="boton boton-2" type="button" id="play"
              data-otra="${COPY.casoBotonOtra[l]}">${COPY.casoBoton[l]}</button>
            ${DEMO_PUBLICA
              ? `<a class="boton boton-2" href="${DEMO_PUBLICA}" target="_blank" rel="noopener">${COPY.casoAbrir[l]}</a>`
              : ''}
          </div>
          <p class="caso-pie">${COPY.casoPie[l]}</p>
        </div>
        <div>${chatDemo(l)}</div>
      </div>

      <div class="numeros rev">
        <div class="numero"><b>${NUMEROS.recordatorio} h</b><span>${COPY.num1[l]}</span></div>
        <div class="numero"><b>${NUMEROS.cron} min</b><span>${COPY.num2[l]}</span></div>
        <div class="numero"><b>${NUMEROS.pruebas}</b><span>${COPY.num3[l]}</span></div>
        <div class="numero"><b>${COPY.num4Valor[l]}</b><span>${COPY.num4[l]}</span></div>
      </div>

      <div class="limites">
        <div>
          <h3>${COPY.limTitulo[l]}</h3>
          <p class="lim-cierre">${COPY.limCierre[l]}</p>
        </div>
        <ul class="lista-no rev">
          <li>${icono('cruz')}${COPY.lim1[l]}</li>
          <li>${icono('cruz')}${COPY.lim2[l]}</li>
          <li>${icono('cruz')}${COPY.lim3[l]}</li>
          <li>${icono('cruz')}${COPY.lim4[l]}</li>
          <li>${icono('cruz')}${COPY.lim5[l]}</li>
        </ul>
      </div>
    </div>
  </section>

  <!-- ── La empresa ───────────────────────────────────────── -->
  <section class="seccion linea-arriba" id="empresa">
    <div class="env empresa">
      <div>
        <p class="etiqueta">${COPY.empresaEtiqueta[l]}</p>
        ${h2Aura(COPY.empresaTitulo[l], 110, "margin-top:16px")}
        <div class="sellos rev" style="margin-top:32px">
          <div>${icono('pin')}${COPY.empresaSello1[l]}</div>
          <div>${icono('enchufe')}${COPY.empresaSello2[l]}</div>
          <div>${icono('escudo')}${COPY.empresaSello3[l]}</div>
        </div>
      </div>
      <div class="rev">
        <p class="niebla">${COPY.empresaP1[l]}</p>
        <p class="niebla">${COPY.empresaP2[l]}</p>
      </div>
    </div>
  </section>

  <!-- ── Preguntas ────────────────────────────────────────── -->
  <section class="seccion linea-arriba" id="preguntas">
    <div class="env">
      <div class="cabecera-seccion">
        <p class="etiqueta">${COPY.faqEtiqueta[l]}</p>
        ${h2Aura(COPY.faqTitulo[l], 114)}
        <p class="bajada">${COPY.faqBajada[l]}</p>
      </div>
      <div class="faq">
        <p class="faq-grupo">${COPY.faqGrupo1[l]}</p>
        ${faqHtml(l, FAQ_AGENCIA)}
        <p class="faq-grupo">${COPY.faqGrupo2[l]}</p>
        ${faqHtml(l, FAQ_PRODUCTO)}
      </div>
    </div>
  </section>

  <!-- ── Cierre ───────────────────────────────────────────── -->
  <section class="seccion linea-arriba">
    <div class="env">
      <div class="cierre-cta rev">
        <h2>${COPY.ctaTitulo[l]}</h2>
        <p class="bajada">${COPY.ctaBajada[l]}</p>
        <div class="acciones">
          <a class="boton boton-1" href="${contacto}"${afuera()}>
            ${WHATSAPP ? icono('wa') : ''}${textoContacto(l)}
          </a>
        </div>
        <p class="hero-nota" style="margin-inline:auto;text-align:center">${COPY.ctaNota[l]}</p>
      </div>
    </div>
  </section>

</main>

<footer class="pie">
  <div class="env">
    <div class="pie-grilla">
      <div>
        ${logo(26)}
        <p class="pie-bajada">${COPY.pieBajada[l]} · Montevideo, Uruguay</p>
      </div>
      <div>
        <h4>${COPY.pieSecciones[l]}</h4>
        <ul>
          <li><a href="#servicios">${COPY.navServicios[l]}</a></li>
          <li><a href="#como">${COPY.navComo[l]}</a></li>
          <li><a href="#caso">${COPY.navCaso[l]}</a></li>
          <li><a href="#empresa">${COPY.empresaEtiqueta[l]}</a></li>
          <li><a href="#preguntas">${COPY.navPreguntas[l]}</a></li>
        </ul>
      </div>
      <div>
        <h4>${COPY.pieContacto[l]}</h4>
        <ul>
          <li><a href="${contacto}"${afuera()}>${textoContacto(l)}</a></li>
          <li><a href="mailto:${CORREO}">${CORREO}</a></li>
          <li><a href="${rutaOtro}" hreflang="${otro}" lang="${otro}">${COPY.pieIdioma[l]}</a></li>
        </ul>
      </div>
    </div>
    <div class="pie-linea">
      <span>© ${new Date().getUTCFullYear()} UpTempo. ${COPY.pieDerechos[l]}</span>
      <span>uptempo.uy</span>
    </div>
  </div>
</footer>

<script>${SCRIPT}</script>
</body>
</html>`;
}
