import type { Env } from './tipos';

/**
 * Paso 9.1 — de una URL a una FICHA.
 *
 * Esto NO toca la base y NO usa Google Places. Es a proposito: lo mas
 * riesgoso del paso 9 no es Places —que es una API estructurada y va a
 * andar— sino si el modelo extrae bien servicios y precios de webs
 * desordenadas. Ese riesgo esta entero de este lado, asi que se prueba
 * primero y solo.
 *
 * La regla que manda: EL ASISTENTE NUNCA INVENTA UN PRECIO. Y eso no se
 * delega en el prompt. Un precio que no aparece escrito en el HTML se
 * borra despues, en codigo, aunque el modelo lo haya devuelto. Una
 * instruccion se esquiva; un `if` no.
 */

/** El modelo que extrae. Barato: son centavos por ficha. */
const MODELO_EXTRACCION = 'claude-haiku-4-5';

/**
 * Tope de HTML limpio que se le manda al modelo. Una web de clinica
 * limpia entra comoda en 40k; el que se pasa suele ser un blog entero
 * y el excedente no aporta servicios ni precios.
 */
const MAX_CARACTERES = 40_000;

/** Subdominios del sistema. Un slug no puede ser ninguno de estos. */
const RESERVADOS = new Set(['panel', 'www', 'api', 'admin', 'app', 'demo', 'uptempo', 'mail', 'blog']);

export interface ServicioFicha {
  nombre: string;
  /** null si el negocio no lo publica. NUNCA un numero inventado. */
  precio: number | null;
  precio_nota: string | null;
  duracion_min: number | null;
  descripcion: string | null;
}

export interface HorarioFicha {
  dia_semana: number; // ISO: 1 = lunes … 7 = domingo
  desde: string;      // 'HH:MM:SS'
  hasta: string;
}

export interface Ficha {
  nombre: string;
  slug: string;
  rubro: string | null;
  descripcion_corta: string | null;
  direccion: string | null;
  telefono_display: string | null;
  formas_pago: string | null;
  servicios: ServicioFicha[];
  horarios: HorarioFicha[];
  base_conocimiento: string;
  // Estos cuatro NO salen del sitio web: los aporta Google Places en
  // el 9.4. Van en la ficha para que insertarFicha no tenga que saber
  // de donde vino cada dato.
  lat?: number | null;
  lon?: number | null;
  google_place_id?: string | null;
  maps_url?: string | null;
  /** Para revisar a ojo que salio bien y por que. */
  origen: {
    url: string | null;
    /** Todas las URLs que se leyeron para armar esta ficha. */
    paginas: string[];
    caracteres: number;
    precios_descartados: string[];
    /** place_id, cuando la ficha paso por Places. */
    places?: string;
  };
}

// ── 1. Bajar y limpiar ──────────────────────────────────────────

/** Cuantas paginas internas se leen ademas de la que nos dieron. */
const MAX_PAGINAS = 5;
/** Tope por pagina, antes de juntarlas y cortar el total. */
const MAX_POR_PAGINA = 15_000;

export async function bajarSitio(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: {
      // Sin User-Agent, varios hostings uruguayos devuelven 403.
      'user-agent': 'Mozilla/5.0 (compatible; UptempoBot/1.0; +https://uptempo.uy)',
      'accept-language': 'es-UY,es;q=0.9',
    },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`El sitio contestó ${r.status}. No hay de dónde sacar la ficha.`);
  const tipo = r.headers.get('content-type') ?? '';
  if (!tipo.includes('html') && !tipo.includes('text')) {
    throw new Error(`El sitio devolvió "${tipo}", no HTML.`);
  }
  return await r.text();
}

const ENTIDADES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', euro: '€',
};

/**
 * Saca lo que no aporta y deja texto plano.
 *
 * Se va el `nav` —que es el menu y no trae ni un dato— pero el `header`
 * y el `footer` SE QUEDAN. En la primera corrida los borraba junto con
 * el menu y las tres fichas salieron sin direccion ni telefono: en una
 * web de clinica el pie de pagina es justo donde viven la direccion, el
 * telefono y los horarios. Lo repetido se limpia despues, deduplicando
 * lineas, que era el problema real.
 *
 * Los `alt` de las imagenes tambien se conservan, porque en varias
 * clinicas la lista de precios es una imagen y el alt es lo unico
 * legible.
 */
export function limpiarHtml(html: string): string {
  let t = html;
  t = t.replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(/<(script|style|noscript|svg|iframe|head|nav|form|select)\b[\s\S]*?<\/\1>/gi, ' ');
  t = t.replace(/<img\b[^>]*?\balt=["']([^"']{3,120})["'][^>]*>/gi, ' $1 ');
  t = t.replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  t = t.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
  t = t.replace(/&([a-z]+);/gi, (m, e) => ENTIDADES[e] ?? m);
  t = t.replace(/[ \t ]+/g, ' ');
  t = t.replace(/\n\s*\n\s*\n+/g, '\n\n');
  t = t.split('\n').map(l => l.trim()).join('\n').trim();
  return t.slice(0, MAX_CARACTERES);
}

/** Lo que dice el <title>. Suele traer la marca cuando el <h1> es una promo. */
export function tituloDe(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]{1,200}?)<\/title>/i);
  if (!m) return null;
  const t = m[1].replace(/\s+/g, ' ').trim();
  return t || null;
}

/**
 * Las paginas internas que vale la pena leer.
 *
 * Una ficha NO se arma con una sola pagina: en la primera corrida
 * Beauty Planet salio con 27 servicios y precios porque le apuntamos a
 * la pagina correcta de casualidad, y Depilife salio con CERO servicios
 * porque su pagina de "precios" habla de por que varian los precios sin
 * listar ninguno. La informacion esta repartida y hay que ir a buscarla.
 *
 * Se puntua por lo que dice el link y se eligen las mejores. Mismo
 * dominio siempre: no seguimos a Instagram ni a un blog externo.
 */
type Categoria = 'precio' | 'servicio' | 'contacto' | 'otro';

/**
 * Que tipo de pagina es, y cuanto vale dentro de su tipo.
 *
 * La categoria importa mas que el puntaje: en Depilaser los cuatro
 * mejores links eran todos de precios y packs, asi que la pagina de
 * contacto —la unica con la direccion y el telefono— quedaba afuera y
 * la ficha salia sin donde queda la clinica. Por eso hay cupo por
 * categoria y no un ranking libre.
 */
const CATEGORIAS: Array<[Categoria, RegExp, number]> = [
  ['precio',   /precio|tarifa|arancel|lista|pack|promo/i, 10],
  ['servicio', /servicio|tratamiento|depilaci|categoria|laser/i, 8],
  ['contacto', /contacto|ubicaci|sucursal|local|horario|donde|centro/i, 7],
  ['otro',     /nosotros|quienes|empresa|about|faq|preguntas/i, 3],
];
const EXTENSION_MALA = /\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|doc|xls)($|\?)/i;

/** Al menos una pagina de cada uno de estos tipos, si el sitio la tiene. */
const CUPOS: Categoria[] = ['precio', 'servicio', 'contacto'];

export function linksInternos(html: string, base: string): string[] {
  let raiz: URL;
  try { raiz = new URL(base); } catch { return []; }

  const vistos = new Map<string, { punto: number; cat: Categoria }>();
  const re = /<a\b[^>]*\bhref=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    if (/^(mailto:|tel:|javascript:|whatsapp:)/i.test(href)) continue;
    if (EXTENSION_MALA.test(href)) continue;

    let u: URL;
    try { u = new URL(href, raiz); } catch { continue; }
    if (u.hostname.replace(/^www\./, '') !== raiz.hostname.replace(/^www\./, '')) continue;
    u.hash = '';
    const limpia = u.toString().replace(/\/$/, '');
    if (limpia === base.replace(/\/$/, '')) continue;

    // El texto del link y la propia ruta cuentan igual: muchos menues
    // son imagenes y lo unico legible es la URL.
    const contexto = `${u.pathname} ${m[2].replace(/<[^>]+>/g, ' ')}`;
    let punto = 0;
    let cat: Categoria | null = null;
    for (const [c, re2, p] of CATEGORIAS) {
      if (!re2.test(contexto)) continue;
      punto += p;
      if (cat === null) cat = c;   // gana la categoria de mas peso
    }
    if (cat === null) continue;
    // Cuanto mas profunda la ruta, menos probable que sea una seccion.
    punto -= (u.pathname.split('/').filter(Boolean).length - 1);

    const previo = vistos.get(limpia);
    if (!previo || punto > previo.punto) vistos.set(limpia, { punto, cat });
  }

  const ordenados = [...vistos.entries()].sort((a, b) => b[1].punto - a[1].punto);
  const elegidos: string[] = [];

  // Primero el cupo de cada tipo, despues se llena por puntaje.
  for (const cupo of CUPOS) {
    const mejor = ordenados.find(([u, v]) => v.cat === cupo && !elegidos.includes(u));
    if (mejor) elegidos.push(mejor[0]);
  }
  for (const [u] of ordenados) {
    if (elegidos.length >= MAX_PAGINAS) break;
    if (!elegidos.includes(u)) elegidos.push(u);
  }
  return elegidos.slice(0, MAX_PAGINAS);
}

/**
 * Junta varias paginas en un solo texto, con la URL de cada una a la
 * vista. Que el modelo sepa de donde salio cada bloque es lo que evita
 * que mezcle el precio de una sucursal con la direccion de otra.
 *
 * Las lineas repetidas se borran una sola vez, al final: el pie de
 * pagina aparece en las cinco paginas y sin esto ocupa el 40% del
 * texto que le mandamos al modelo.
 */
export function juntarPaginas(paginas: Array<{ url: string; texto: string }>): string {
  const vistas = new Set<string>();
  const bloques: string[] = [];

  for (const p of paginas) {
    const lineas: string[] = [];
    for (const linea of p.texto.split('\n')) {
      const clave = linea.trim().toLowerCase();
      // Las lineas muy cortas no se deduplican: un "Axilas" o un "$790"
      // suelto se repite legitimamente en una lista de precios.
      if (clave.length > 12) {
        if (vistas.has(clave)) continue;
        vistas.add(clave);
      }
      lineas.push(linea);
    }
    const cuerpo = lineas.join('\n').trim();
    // El umbral es bajo a proposito: lo que queda despues de deduplicar
    // puede ser corto y aun asi ser lo mas valioso del sitio — una
    // pagina de precios es "Axilas / $790 / Bozo / $790" y nada mas.
    if (cuerpo.replace(/\s/g, '').length > 10) {
      bloques.push(`=== ${p.url} ===\n${cuerpo}`);
    }
  }
  return bloques.join('\n\n').slice(0, MAX_CARACTERES);
}

/**
 * De una URL a todo el texto util del sitio: la pagina que nos dieron
 * mas hasta MAX_PAGINAS internas, bajadas en paralelo.
 *
 * Si una interna falla se ignora en silencio. Es a proposito: el
 * generador corre por lotes de 20 y no puede frenarse porque una
 * clinica tenga un link roto en el menu.
 */
export async function bajarSitios(
  url: string,
): Promise<{ texto: string; paginas: string[]; titulo: string | null }> {
  const principal = await bajarSitio(url);
  const titulo = tituloDe(principal);
  const internas = linksInternos(principal, url);

  const otras = await Promise.all(internas.map(async u => {
    try { return { url: u, html: await bajarSitio(u) }; } catch { return null; }
  }));

  const paginas = [{ url, html: principal }, ...otras.filter((x): x is { url: string; html: string } => x !== null)]
    .map(p => ({ url: p.url, texto: limpiarHtml(p.html).slice(0, MAX_POR_PAGINA) }));

  return { texto: juntarPaginas(paginas), paginas: paginas.map(p => p.url), titulo };
}

// ── 2. Slug ─────────────────────────────────────────────────────

/**
 * Del nombre al slug, contra el mismo `check` que ya tiene la base:
 * minusculas, sin tildes, sin espacios, un solo nivel.
 *
 * Si cae en un reservado se le pega un sufijo en vez de fallar: el
 * generador corre por lotes de 20 y no puede frenarse porque una
 * clinica se llame "App Estetica".
 */
/**
 * Palabras que van adelante del nombre y no lo identifican. Se sacan
 * SOLO del principio: "Clinica de Estetica Medica ALMA LASER" es
 * "almalaser", pero "Centro" en el medio de un nombre se respeta.
 */
const GENERICAS = new Set([
  'clinica', 'centro', 'estudio', 'instituto', 'consultorio', 'policlinica',
  'spa', 'medica', 'medico', 'estetica', 'integral', 'de', 'del', 'la', 'el',
  'los', 'las', 'y', 'dr', 'dra', 'doctor', 'doctora',
]);

/**
 * El nombre real, cuando en Google Maps viene con relleno de SEO.
 *
 * Muchas fichas de Maps son "Depilacion Laser Definitiva y Estetica |
 * Clinica Jamelia" o "Depimed | Depilacion Laser Definitiva": el
 * negocio se llama Clinica Jamelia y Depimed, y lo demas son palabras
 * puestas para aparecer en las busquedas. Si no se limpia, el slug
 * sale "depilacionlaser.uptempo.uy" —generico, y encima chocaria con
 * la clinica siguiente— y el mensaje de contacto arranca con un
 * nombre con una barra en el medio.
 *
 * Entre los pedazos separados por | – — · gana EL MAS CORTO en
 * palabras: el relleno siempre es la parte larga.
 */
export function nombreDeNegocio(nombre: string): string {
  const partes = nombre.split(/\s*[|–—·]\s*/).map(p => p.trim()).filter(Boolean);
  if (partes.length < 2) return nombre.trim();
  return partes.reduce((a, b) =>
    b.split(/\s+/).length < a.split(/\s+/).length ? b : a);
}

/** Tope propio, mas corto que el de la base: un subdominio se manda por WhatsApp. */
const LARGO_SLUG = 24;

export function slugificar(nombreCrudo: string): string {
  const nombre = nombreDeNegocio(nombreCrudo);
  const limpio = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');

  const palabras = nombre.split(/\s+/).map(limpio).filter(Boolean);

  // Las genericas del principio se descartan SOLO en nombres largos.
  // En "Clinica de Estetica Medica ALMA LASER" (6 palabras) las
  // primeras cuatro sobran y el negocio es "almalaser". Pero en
  // "Clinica Soñe" o "Estetica & Salud SRL" la palabra generica ES
  // parte del nombre, y sacarla dejaba "sone" y "saludsrl": el slug de
  // un negocio que no existe.
  let i = 0;
  if (palabras.length >= 4) {
    while (i < palabras.length - 1 && GENERICAS.has(palabras[i])) i++;
  }
  const utiles = palabras.slice(i);

  // Se corta por PALABRA, nunca por letra: cortar por letra daba
  // "clinicadeesteticamedicaalmalas.uptempo.uy", que es un link que
  // nadie abre.
  let s = '';
  for (const p of utiles) {
    if (s && (s + p).length > LARGO_SLUG) break;
    s += p;
  }
  if (!s) s = limpio(nombre).slice(0, LARGO_SLUG);
  if (!s) s = 'negocio';

  // El check de la base exige entre 3 y 30 caracteres. Pasarse no da un
  // error legible: revienta el insert en la mitad de un lote de 20.
  s = s.slice(0, 30);
  if (s.length < 3) s = (s + 'uy0').slice(0, 3);
  if (RESERVADOS.has(s)) s = s + 'uy';
  return s;
}

// ── 3. Horarios ─────────────────────────────────────────────────

const DIAS: Record<string, number> = {
  lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7,
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
};

export function diaISO(x: unknown): number | null {
  if (typeof x === 'number' && x >= 1 && x <= 7) return x;
  if (typeof x !== 'string') return null;
  const k = x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return DIAS[k] ?? null;
}

/** '9', '9:30', '09:30:00' → '09:30:00'. Cualquier otra cosa → null. */
export function normalizarHora(x: unknown): string | null {
  if (typeof x === 'number') x = String(x);
  if (typeof x !== 'string') return null;
  const m = x.trim().match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
}

// ── 4. La guarda de precios ─────────────────────────────────────

/** Los digitos del texto, sin separadores: '$ 4.500' → '4500'. */
function digitos(texto: string): string {
  return texto.replace(/[.\s,]/g, '');
}

/**
 * Borra todo precio que NO aparezca escrito en el sitio.
 *
 * Esta es la unica linea de defensa que no depende del modelo. Un
 * precio inventado en una pagina con el nombre de una clinica real es
 * exactamente el error que no se perdona en un mercado donde todos se
 * conocen. Ante la duda, `null`: el asistente contesta que el precio se
 * lo confirma alguien del equipo, que es verdad.
 */
export function validarPrecios(
  servicios: ServicioFicha[], fuente: string,
): { servicios: ServicioFicha[]; descartados: string[] } {
  const plano = digitos(fuente);
  const descartados: string[] = [];
  const limpios = servicios.map(s => {
    if (s.precio === null || s.precio === undefined) return { ...s, precio: null };
    const n = Number(s.precio);
    if (!Number.isFinite(n) || n <= 0) {
      descartados.push(`${s.nombre}: ${s.precio} (no es un número)`);
      return { ...s, precio: null };
    }
    if (!plano.includes(String(Math.round(n)))) {
      descartados.push(`${s.nombre}: ${n} (no está escrito en el sitio)`);
      return { ...s, precio: null };
    }
    return { ...s, precio: n };
  });
  return { servicios: limpios, descartados };
}

// ── 5. El modelo ────────────────────────────────────────────────

const ESQUEMA = {
  type: 'object',
  properties: {
    nombre: { type: 'string', description: 'Nombre comercial del negocio, como lo escribe él.' },
    rubro: { type: ['string', 'null'], description: 'Ej: "depilación definitiva", "odontología", "centro de estética".' },
    descripcion_corta: { type: ['string', 'null'], description: 'Una línea, máximo 140 caracteres, con las palabras del propio sitio.' },
    direccion: { type: ['string', 'null'], description: 'Calle y número, y barrio o ciudad si aparece.' },
    telefono_display: { type: ['string', 'null'], description: 'El teléfono tal como lo publica.' },
    formas_pago: { type: ['string', 'null'], description: 'Solo si el sitio lo dice.' },
    servicios: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          precio: { type: ['number', 'null'], description: 'SOLO si el número está escrito en el texto. Si no, null. Sin símbolos ni separadores.' },
          precio_nota: { type: ['string', 'null'], description: 'Ej: "por sesión", "desde", "pack de 6".' },
          duracion_min: { type: ['number', 'null'], description: 'Solo si el sitio la dice.' },
          descripcion: { type: ['string', 'null'] },
        },
        required: ['nombre', 'precio', 'precio_nota', 'duracion_min', 'descripcion'],
      },
    },
    horarios: {
      type: 'array',
      description: 'Solo si el sitio publica horarios. Un tramo por fila; si cierra al mediodía, dos filas para ese día.',
      items: {
        type: 'object',
        properties: {
          dia_semana: { type: 'number', description: '1 = lunes … 7 = domingo' },
          desde: { type: 'string', description: 'HH:MM' },
          hasta: { type: 'string', description: 'HH:MM' },
        },
        required: ['dia_semana', 'desde', 'hasta'],
      },
    },
    base_conocimiento: {
      type: 'string',
      description:
        'Markdown para el asistente, con estas secciones exactas: "## Sobre el lugar", ' +
        '"## Cómo llegar", "## Preguntas frecuentes", "## Qué no responder". Solo hechos del sitio.',
    },
  },
  required: ['nombre', 'rubro', 'descripcion_corta', 'direccion', 'telefono_display',
             'formas_pago', 'servicios', 'horarios', 'base_conocimiento'],
} as const;

const SYSTEM_EXTRACCION = `Extraés la ficha de un negocio de turnos de Montevideo a partir del texto de su sitio web.

Reglas, en orden de importancia:

0. EL TEXTO PUEDE VENIR DE VARIAS PÁGINAS del mismo sitio, separadas por líneas "=== url ===". Es un solo negocio: juntá todo. El nombre comercial sale del título de la página o del dominio, no de un <h1> que puede ser el nombre de una promoción o de un equipo.
1. NO INVENTES NADA. Si un dato no está en el texto, va null (o la lista va vacía). Nunca completes con lo típico del rubro, ni con un precio "de referencia", ni con un horario "habitual".
2. LOS PRECIOS SON LO MÁS DELICADO. Solo ponés un precio si el número está escrito en el texto. Si dice "consultar", "a partir de", "según evaluación" o no dice nada: precio null, y lo que sí diga va en precio_nota.
3. COPIÁ LA LISTA DE PRECIOS ENTERA, ítem por ítem. Si hay 27 zonas, van las 27. No agrupes las zonas que comparten precio, no pongas una "de ejemplo", no resumas con "y otras zonas". La lista completa de zonas con su precio es lo más valioso de la ficha.
4. Los servicios son los que el negocio ofrece y se pueden agendar, con el nombre que él usa. No renombres. Si el mismo servicio aparece con varios precios (por zona, por pack), poné uno por variante.
5. "## Qué no responder" de la base de conocimiento siempre incluye: nada de diagnóstico ni consejo clínico, nada sobre resultados médicos, y ningún precio que no esté en la lista de servicios. Ante cualquiera de esas, deriva a una persona.
6. Escribís en español rioplatense, de vos, corto.`;

interface RespuestaModelo {
  content: Array<{ type: string; name?: string; input?: Record<string, unknown> }>;
}

async function pedirFicha(
  env: Env, texto: string, intento = 0,
): Promise<Record<string, unknown>> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY.trim(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.MODELO_EXTRACCION?.trim() || MODELO_EXTRACCION,
      // 27 zonas de depilacion mas la base de conocimiento no entran en
      // 4000: Beauty Planet devolvio 4 zonas 'de ejemplo' en vez de las 27.
      max_tokens: 8000,
      system: SYSTEM_EXTRACCION,
      // Tool use, no "devolveme JSON": el esquema lo garantiza la API.
      // Pedir JSON en prosa devuelve markdown alrededor una de cada
      // veinte veces, y en un lote de 20 eso es una ficha rota por lote.
      tools: [{ name: 'ficha', description: 'La ficha del negocio.', input_schema: ESQUEMA }],
      tool_choice: { type: 'tool', name: 'ficha' },
      messages: [{ role: 'user', content: texto }],
    }),
  });

  if ((r.status === 429 || r.status >= 500) && intento < 2) {
    await new Promise(res => setTimeout(res, 500 * Math.pow(2, intento)));
    return pedirFicha(env, texto, intento + 1);
  }
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 400)}`);

  const j = await r.json() as RespuestaModelo;
  const uso = j.content.find(b => b.type === 'tool_use' && b.name === 'ficha');
  if (!uso?.input) throw new Error('El modelo no devolvió la ficha.');
  return uso.input;
}

// ── 6. La ficha, de punta a punta ───────────────────────────────

export interface EntradaExtraccion {
  url?: string;
  /** HTML ya bajado. Sirve para los tests y para pegar a mano. */
  html?: string;
  /** Bio y posts de Instagram, pegados a mano cuando no hay web. */
  extra?: string;
}

export async function extraerFicha(env: Env, entrada: EntradaExtraccion): Promise<Ficha> {
  let limpio = '';
  let paginas: string[] = [];
  let titulo: string | null = null;

  if (entrada.html) {
    limpio = limpiarHtml(entrada.html);
    titulo = tituloDe(entrada.html);
  } else if (entrada.url) {
    const r = await bajarSitios(entrada.url);
    limpio = r.texto;
    paginas = r.paginas;
    titulo = r.titulo;
  }

  const extra = (entrada.extra ?? '').trim().slice(0, 8000);
  if (extra) limpio = `${limpio}\n\n=== información pegada a mano ===\n${extra}`.trim();

  if (limpio.replace(/\s/g, '').length < 200) {
    throw new Error(
      'Del sitio salieron menos de 200 caracteres de texto. Suele ser una web hecha toda en ' +
      'JavaScript o una imagen. Pegá la bio y dos o tres posts en "extra".');
  }

  // La cabecera va aparte del cuerpo: el titulo y el dominio son la
  // mejor pista del nombre comercial. Sin esto, Beauty Planet salio
  // como "DEPI PLANET" —el <h1> de una promo— y el slug quedo mal.
  const cabecera = [
    entrada.url ? `Sitio: ${entrada.url}` : null,
    titulo ? `Título de la página: ${titulo}` : null,
    paginas.length > 1 ? `Páginas leídas: ${paginas.join(' · ')}` : null,
  ].filter(Boolean).join('\n');

  const cruda = await pedirFicha(env, cabecera ? `${cabecera}\n\n${limpio}` : limpio);
  return armarFicha(cruda, limpio, entrada.url ?? null, paginas);
}

/**
 * Normaliza y valida lo que devolvio el modelo. Separada de la llamada
 * a proposito: es la parte que se prueba sin red.
 */
export function armarFicha(
  cruda: Record<string, unknown>, fuente: string, url: string | null, paginas: string[] = [],
): Ficha {
  const texto = (x: unknown, max = 400): string | null => {
    const s = typeof x === 'string' ? x.trim() : '';
    return s ? s.slice(0, max) : null;
  };

  const nombre = texto(cruda.nombre, 120) ?? 'Sin nombre';

  const servicios: ServicioFicha[] = (Array.isArray(cruda.servicios) ? cruda.servicios : [])
    .map((s: any) => ({
      nombre: texto(s?.nombre, 120) ?? '',
      precio: typeof s?.precio === 'number' ? s.precio : null,
      precio_nota: texto(s?.precio_nota, 80),
      duracion_min: typeof s?.duracion_min === 'number' && s.duracion_min > 0
        ? Math.min(Math.round(s.duracion_min), 480) : null,
      descripcion: texto(s?.descripcion, 300),
    }))
    .filter(s => s.nombre.length > 1);

  const { servicios: validados, descartados } = validarPrecios(servicios, fuente);

  const horarios: HorarioFicha[] = (Array.isArray(cruda.horarios) ? cruda.horarios : [])
    .map((h: any) => {
      const dia = diaISO(h?.dia_semana);
      const desde = normalizarHora(h?.desde);
      const hasta = normalizarHora(h?.hasta);
      return dia && desde && hasta && desde < hasta ? { dia_semana: dia, desde, hasta } : null;
    })
    .filter((h): h is HorarioFicha => h !== null);

  return {
    nombre,
    slug: slugificar(nombre),
    rubro: texto(cruda.rubro, 60),
    descripcion_corta: texto(cruda.descripcion_corta, 140),
    direccion: texto(cruda.direccion, 300),
    telefono_display: texto(cruda.telefono_display, 120),
    formas_pago: texto(cruda.formas_pago, 200),
    servicios: validados,
    horarios,
    base_conocimiento: texto(cruda.base_conocimiento, 8000) ?? '',
    origen: {
      url,
      paginas: paginas.length ? paginas : (url ? [url] : []),
      caracteres: fuente.length,
      precios_descartados: descartados,
    },
  };
}
