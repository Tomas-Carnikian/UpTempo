import { CELESTE } from './color';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './tipos';
import { db, invalidarCache } from './db';
import type { Ficha } from './extraccion';

/**
 * Paso 9.2 — de una FICHA a filas.
 *
 * Sin tocar el esquema: `clientes.estado` ya tiene el valor 'demo'
 * desde el paso 1. Un cliente nuevo son filas, nunca codigo.
 *
 * Dos reglas mandan sobre todo este archivo:
 *
 *  1. NUNCA se toca un cliente que no sea 'demo'. El generador corre
 *     por lotes y un slug repetido no puede, bajo ninguna
 *     circunstancia, pisarle los precios a una clinica que paga.
 *  2. Es idempotente por slug. Correrlo dos veces sobre la misma
 *     clinica actualiza; no duplica. Sin esto, el primer lote que se
 *     re-corra deja veinte clinicas repetidas y no hay forma limpia de
 *     saber cual es cual.
 */

/**
 * Cuanto dura un turno cuando el sitio no lo dice, que es casi siempre.
 * 30 minutos es lo tipico de una sesion de depilacion por zona. El dueño
 * lo corrige en el alta; para la demo alcanza y sobra.
 */
const DURACION_POR_DEFECTO = 30;

export interface ResultadoInsercion {
  slug: string;
  nombre: string;
  /** true = se creo, false = ya existia y se actualizo. */
  creado: boolean;
  servicios: number;
  horarios: number;
  /** Lo que hubo que ajustar. Se lee antes de mandar el link. */
  avisos: string[];
}

/**
 * El slug contra el `check` de la base:
 * `^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$` — o sea entre 3 y 30
 * caracteres. `slugificar` ya saca tildes y puntuacion; esto se ocupa
 * del largo, que es lo que el check rechaza y lo unico que haria
 * fallar un insert en la mitad de un lote.
 */
export function slugValido(slug: string): string {
  let s = slug.replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
  if (s.length < 3) s = (s + 'uy0').slice(0, 3);
  if (s.length > 30) s = s.slice(0, 30).replace(/-+$/, '');
  return s;
}

/**
 * Busca un slug libre. Si el que toca ya lo tiene OTRO negocio, prueba
 * con sufijo numerico. Dos clinicas distintas pueden llamarse parecido
 * y no se puede parar un lote de 20 por eso.
 */
async function slugLibre(
  sb: SupabaseClient, base: string, nombre: string,
): Promise<{ slug: string; existente: any | null }> {
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : slugValido(`${base}${i + 1}`);
    const { data } = await sb.from('clientes')
      .select('id, slug, nombre, estado, color_primario').eq('slug', slug).maybeSingle();

    if (!data) return { slug, existente: null };

    // El mismo negocio: se actualiza.
    if (mismoNombre(data.nombre as string, nombre)) {
      if (data.estado !== 'demo') {
        throw new Error(
          `"${slug}" existe y su estado es "${data.estado}", no "demo". No lo toco: ` +
          `el generador nunca pisa un cliente que no sea una demo.`);
      }
      return { slug, existente: data };
    }
    // Otro negocio con el mismo slug: se prueba el siguiente.
  }
  throw new Error(`No pude encontrar un slug libre a partir de "${base}".`);
}

function mismoNombre(a: string, b: string): boolean {
  const n = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
  return n(a) === n(b);
}

export async function insertarFicha(env: Env, ficha: Ficha): Promise<ResultadoInsercion> {
  const sb = db(env);
  const avisos: string[] = [];

  const base = slugValido(ficha.slug);
  if (base !== ficha.slug) avisos.push(`el slug se ajustó de "${ficha.slug}" a "${base}"`);

  const { slug, existente } = await slugLibre(sb, base, ficha.nombre);
  if (slug !== base) avisos.push(`"${base}" ya era de otro negocio; esta demo quedó como "${slug}"`);

  // ── El color de marca ─────────────────────────────────────────
  // Se escribe SOLO si nadie lo eligio todavia: o la fila es nueva, o
  // tiene alguno de los valores que pone el sistema cuando no encontro
  // nada. Asi una correccion hecha a mano —mirar el logo y poner el
  // color bien— sobrevive a que se vuelva a correr el lote. La maquina
  // completa lo que falta; no corrige a la persona.
  //
  // Y cuando el sitio no tiene un color detectable, la demo NO queda
  // gris: queda con el celeste de Uptempo. Un gris pizarra en una
  // pagina se lee como "sin terminar"; el celeste se lee como una
  // decision, y en una pagina que arriba de todo dice que la armo
  // Uptempo, que sea nuestro color es honesto.
  const SIN_ELEGIR = new Set([CELESTE, '#1f2937']);
  const colorNuevo = ficha.color_primario ?? null;
  const colorViejo = (existente?.color_primario as string | undefined) ?? null;
  const sinElegir = !existente || !colorViejo || SIN_ELEGIR.has(colorViejo.toLowerCase());

  if (!sinElegir && colorNuevo && colorNuevo !== colorViejo) {
    avisos.push(`el color quedó en ${colorViejo}: ya había uno cargado y no se pisa ` +
                `(el sitio ahora dice ${colorNuevo})`);
  }
  if (sinElegir && !colorNuevo) {
    avisos.push(`sin color de marca (${ficha.origen.color ?? 'no se buscó'}): ` +
                `queda el celeste de Uptempo`);
  }

  // ── clientes ──────────────────────────────────────────────────
  // Solo los campos que salen de la ficha. wa_phone_number_id y
  // calendar_id NO se tocan: si esta demo ya se conecto a algo,
  // volver a correr el generador no se lo puede desarmar.
  const fila: Record<string, unknown> = {
    slug,
    nombre: ficha.nombre,
    rubro: ficha.rubro,
    estado: 'demo',
    direccion: ficha.direccion,
    telefono_display: ficha.telefono_display,
    formas_pago: ficha.formas_pago,
    descripcion_corta: ficha.descripcion_corta,
    // De Places (9.4). Si la ficha no paso por Places quedan null, que
    // es lo correcto: la pagina no dibuja el mapa sin coordenadas.
    lat: ficha.lat ?? null,
    lon: ficha.lon ?? null,
    google_place_id: ficha.google_place_id ?? null,
    maps_url: ficha.maps_url ?? null,
    actualizado_en: new Date().toISOString(),
  };
  if (sinElegir) fila.color_primario = colorNuevo ?? CELESTE;

  let clienteId: string;
  if (existente) {
    const { error } = await sb.from('clientes').update(fila).eq('id', existente.id);
    if (error) throw new Error(`No pude actualizar el cliente: ${error.message}`);
    clienteId = existente.id;
  } else {
    const { data, error } = await sb.from('clientes').insert(fila).select('id').single();
    if (error) throw new Error(`No pude crear el cliente: ${error.message}`);
    clienteId = data.id as string;
  }

  // ── servicios ─────────────────────────────────────────────────
  // Se borran y se rehacen. Es una demo: no hay historial que
  // preservar, y un update campo por campo dejaria vivos los
  // servicios que el sitio saco de su lista.
  await sb.from('servicios').delete().eq('cliente_id', clienteId);

  const vistos = new Set<string>();
  const servicios = ficha.servicios
    .filter(s => {
      // `unique (cliente_id, nombre)`: dos servicios con el mismo
      // nombre revientan el insert entero, no solo esa fila.
      const k = s.nombre.trim().toLowerCase();
      if (!k || vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .map((s, i) => ({
      cliente_id: clienteId,
      nombre: s.nombre.trim(),
      precio: s.precio,
      precio_nota: s.precio_nota,
      duracion_min: s.duracion_min ?? DURACION_POR_DEFECTO,
      descripcion: s.descripcion,
      orden: i,
    }));

  if (servicios.length) {
    const { error } = await sb.from('servicios').insert(servicios);
    if (error) throw new Error(`No pude insertar los servicios: ${error.message}`);
  }
  if (ficha.servicios.length !== servicios.length) {
    avisos.push(`${ficha.servicios.length - servicios.length} servicio(s) repetido(s) descartado(s)`);
  }
  if (!servicios.length) avisos.push('la demo quedó SIN servicios: la página de turnos va a estar vacía');
  if (!servicios.some(s => s.precio !== null)) {
    avisos.push('ningún servicio tiene precio: el asistente va a derivar cada consulta de precio');
  }

  // ── horarios ──────────────────────────────────────────────────
  await sb.from('horarios').delete().eq('cliente_id', clienteId);

  const clavesH = new Set<string>();
  const horarios = ficha.horarios.filter(h => {
    // `unique (cliente_id, dia_semana, desde)`
    const k = `${h.dia_semana}|${h.desde}`;
    if (clavesH.has(k)) return false;
    clavesH.add(k);
    return true;
  }).map(h => ({ cliente_id: clienteId, dia_semana: h.dia_semana, desde: h.desde, hasta: h.hasta }));

  if (horarios.length) {
    const { error } = await sb.from('horarios').insert(horarios);
    if (error) throw new Error(`No pude insertar los horarios: ${error.message}`);
  } else {
    // Sin horarios la agenda no ofrece NADA y el asistente parece roto.
    // Es preferible avisar fuerte que rellenar con un horario inventado.
    avisos.push('la demo quedó SIN horarios: la agenda no va a poder ofrecer ningún turno');
  }

  // ── base de conocimiento ──────────────────────────────────────
  if (ficha.base_conocimiento.trim()) {
    await sb.from('base_conocimiento').delete().eq('cliente_id', clienteId);
    const { error } = await sb.from('base_conocimiento').insert({
      cliente_id: clienteId,
      contenido_md: ficha.base_conocimiento,
      activa: true,
      nota: `generada por el generador de demos desde ${ficha.origen.url ?? 'texto pegado'}`,
    });
    if (error) throw new Error(`No pude insertar la base de conocimiento: ${error.message}`);
  }

  // El cache vive 45 s en memoria del isolate: sin esto, abrir la
  // pagina recien generada puede mostrar la version anterior.
  invalidarCache(`slug:${slug}`);

  return {
    slug, nombre: ficha.nombre, creado: !existente,
    servicios: servicios.length, horarios: horarios.length, avisos,
  };
}

/**
 * Las demos que hay, con su antiguedad y si alguien las uso.
 *
 * `eventos` es la señal que importa: una demo con eventos es una demo
 * que el dueño abrio. Es lo que el 9.5 va a mirar para purgar.
 */
export async function listarDemos(env: Env) {
  const sb = db(env);
  const { data, error } = await sb.from('clientes')
    .select('id, slug, nombre, creado_en, actualizado_en')
    .eq('estado', 'demo').order('creado_en', { ascending: false });
  if (error) throw new Error(error.message);

  return await Promise.all((data ?? []).map(async (d: any) => {
    const { count } = await sb.from('eventos')
      .select('id', { count: 'exact', head: true }).eq('cliente_id', d.id);
    return {
      slug: d.slug,
      nombre: d.nombre,
      dias: Math.floor((Date.now() - new Date(d.creado_en).getTime()) / 86_400_000),
      eventos: count ?? 0,
      pagina: `/p/${d.slug}`,
    };
  }));
}

/** Borra una demo. Un cliente que no sea 'demo' no se borra nunca. */
export async function borrarDemo(env: Env, slug: string): Promise<string> {
  const sb = db(env);
  const { data } = await sb.from('clientes')
    .select('id, estado, nombre').eq('slug', slug).maybeSingle();
  if (!data) return `No existe "${slug}".`;
  if (data.estado !== 'demo') {
    throw new Error(`"${slug}" está en estado "${data.estado}". Solo se borran las demos.`);
  }
  // El on delete cascade se lleva servicios, horarios, base de
  // conocimiento, conversaciones, mensajes, eventos y turnos.
  const { error } = await sb.from('clientes').delete().eq('id', data.id);
  if (error) throw new Error(error.message);
  invalidarCache(`slug:${slug}`);
  return `Borrada la demo "${slug}" (${data.nombre}).`;
}

// ── Purga (paso 9.5) ────────────────────────────────────────────

/**
 * Una demo que no convirtio se borra sola a los 30 dias.
 *
 * No es prolijidad: es lo que mantiene sano el trato. Publicamos la
 * pagina de un negocio que no nos la pidio; si no le intereso, lo
 * minimo es que deje de existir sin que nadie tenga que acordarse.
 */
export const DIAS_PARA_PURGAR = 30;

/**
 * Tope por corrida. Si una consulta sale mal o alguien toca el
 * criterio sin querer, el daño maximo son 20 demos y no la base
 * entera. Lo que sobra se borra en la corrida siguiente.
 */
const MAX_POR_CORRIDA = 20;

export interface CandidataPurga {
  slug: string;
  estado: string;
  creado_en: string;
  eventos: number;
}

/**
 * Decide cuales se borran. Funcion pura a proposito: es la parte que
 * se puede probar sin base, y es la que decide un DELETE.
 *
 * Se borra una demo solo si se cumplen las tres:
 *   - estado 'demo' — nunca se toca un cliente que paga;
 *   - cumplio los 30 dias;
 *   - CERO eventos. Un solo evento significa que alguien la abrio, y
 *     una demo que el dueño abrio es una conversacion empezada.
 */
export function demosAPurgar(
  filas: CandidataPurga[], ahora = new Date(), dias = DIAS_PARA_PURGAR,
): string[] {
  const corte = ahora.getTime() - dias * 86_400_000;
  return filas
    .filter(f => f.estado === 'demo')
    .filter(f => f.eventos === 0)
    .filter(f => {
      const t = new Date(f.creado_en).getTime();
      return Number.isFinite(t) && t < corte;
    })
    .map(f => f.slug)
    .slice(0, MAX_POR_CORRIDA);
}

export interface ResultadoPurga {
  revisadas: number;
  borradas: string[];
  /** Cumplieron los 30 dias pero se salvaron porque alguien las uso. */
  conservadas_por_uso: string[];
}

export async function purgarDemos(env: Env, ahora = new Date()): Promise<ResultadoPurga> {
  const sb = db(env);

  const { data, error } = await sb.from('clientes')
    .select('id, slug, estado, creado_en').eq('estado', 'demo');
  if (error) throw new Error(`No pude listar las demos: ${error.message}`);

  const filas: Array<CandidataPurga & { id: string }> = [];
  for (const d of (data ?? []) as any[]) {
    const { count } = await sb.from('eventos')
      .select('id', { count: 'exact', head: true }).eq('cliente_id', d.id);
    filas.push({ id: d.id, slug: d.slug, estado: d.estado, creado_en: d.creado_en, eventos: count ?? 0 });
  }

  const aBorrar = demosAPurgar(filas, ahora);
  const borradas: string[] = [];

  for (const slug of aBorrar) {
    const fila = filas.find(f => f.slug === slug);
    if (!fila) continue;
    // El estado se vuelve a comprobar EN el delete. Entre que se leyo
    // la lista y que se borra pudo convertirse en cliente: improbable,
    // y la linea cuesta cero.
    const { error: err } = await sb.from('clientes')
      .delete().eq('id', fila.id).eq('estado', 'demo');
    if (err) { console.error('[purga]', slug, err.message); continue; }
    invalidarCache(`slug:${slug}`);
    borradas.push(slug);
  }

  const corte = ahora.getTime() - DIAS_PARA_PURGAR * 86_400_000;
  const conservadas = filas
    .filter(f => f.eventos > 0 && new Date(f.creado_en).getTime() < corte)
    .map(f => f.slug);

  if (borradas.length || conservadas.length) {
    console.log('[purga]', 'borradas', borradas.length, borradas.join(', '),
                '| conservadas por uso', conservadas.length);
  }
  return { revisadas: filas.length, borradas, conservadas_por_uso: conservadas };
}

// ── El mensaje de contacto (paso 9.4) ───────────────────────────

/**
 * El texto del primer mensaje que Tomas le manda al dueño.
 *
 * NO lo escribe un modelo, y es a proposito. Veinte mensajes generados
 * salen todos con el mismo aire y se huelen a distancia; ademas un
 * modelo puede inventar un detalle del negocio, que es justo lo que no
 * puede pasar en el primer contacto. Esto arma el mensaje con datos
 * que estan en la ficha, y el "gancho" sale de lo que ese negocio
 * efectivamente publico.
 *
 * Es el texto base: Tomas lo edita si quiere. Lo que no puede es
 * contener nada que no sea verdad.
 */
/**
 * El asunto, cuando el primer contacto va por mail en vez de WhatsApp.
 * Nombra al negocio y dice que es: un asunto vago en frio no se abre.
 */
export function asuntoDeContacto(ficha: Ficha): string {
  return `Una demo del asistente de WhatsApp para ${ficha.nombre}`;
}

export function mensajeDeContacto(ficha: Ficha, slug: string, interes = ''): string {
  const url = `${slug}.uptempo.uy`;
  // El mas barato de los que tienen precio: en depilacion es la zona
  // chica (axilas, bozo), que es la que engancha. El primero de la
  // lista puede ser cualquier cosa — en Goodbye Pelos era "depilacion
  // con cera - abdomen", que no es lo que le queres mostrar a una
  // clinica de depilacion definitiva.
  // De los que tienen precio, primero los que hablan de lo que fuimos
  // a buscar. Goodbye Pelos vende depilacion definitiva Y con cera, y
  // el mas barato de toda la lista era "depilacion con cera - narinas
  // $80": cierto, pero no es lo que le mostras a una clinica de
  // definitiva. Entre los que si aplican, gana el mas barato — en este
  // rubro la zona chica es la que engancha.
  const claves = interes.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().split(/\s+/).filter(p => p.length > 4);
  // Se cuenta CUANTAS palabras de la busqueda tiene cada servicio, no
  // si tiene alguna: "depilacion con cera" y "depilacion definitiva"
  // comparten "depilacion", y quedarse con eso volvia a elegir la
  // cera. Gana el grupo que mas coincide, y dentro de ese, el barato.
  const puntos = (s: any) => {
    const n = s.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return claves.filter((k: string) => n.includes(k)).length;
  };
  const todos = ficha.servicios
    .filter(s => s.precio !== null)
    .sort((a, b) => Number(a.precio) - Number(b.precio));
  const mejor = Math.max(0, ...todos.map(puntos));
  const delRubro = mejor > 0 ? todos.filter(s => puntos(s) === mejor) : todos;
  // Si el grupo del rubro es chico pero la ficha SI tiene precios, se
  // usa la lista entera. VAIG tenia 6 servicios con precio y el
  // mensaje no mencionaba ninguno porque solo uno coincidia con la
  // busqueda: quedaba un mensaje mas debil teniendo el dato a mano.
  const conPrecio = delRubro.length >= 3 ? delRubro : todos;

  // El gancho, por orden de lo mas concreto a lo mas generico.
  let gancho: string;
  if (conPrecio.length >= 3) {
    const s = conPrecio[0];
    gancho = `Le cargué sus servicios con los precios de su web (${s.nombre.toLowerCase()} ` +
             `$${Number(s.precio).toLocaleString('es-UY', { maximumFractionDigits: 0 })}, ` +
             `y ${conPrecio.length - 1} más)`;
  } else if (ficha.servicios.length) {
    gancho = `Le cargué los servicios que tienen publicados`;
  } else {
    gancho = `Está armada con la información que tienen publicada`;
  }

  const cierre = ficha.horarios.length
    ? 'Contesta también cuando el local está cerrado, que es cuando se pierden las consultas.'
    : 'Contesta a cualquier hora, que es cuando se pierden las consultas.';

  return `Hola! Te escribo de Uptempo. Armé una demostración del asistente de WhatsApp ` +
         `para ${ficha.nombre}, para que la veas funcionando antes de decidir nada: ${url}\n\n` +
         `${gancho}. ${cierre}\n\n` +
         `Si te sirve la charlamos, y si no te borro la página y listo.`;
}
