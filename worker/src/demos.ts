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
      .select('id, slug, nombre, estado').eq('slug', slug).maybeSingle();

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

  // ── clientes ──────────────────────────────────────────────────
  // Solo los campos que salen de la ficha. wa_phone_number_id,
  // calendar_id y los colores NO se tocan: si esta demo ya se conecto
  // a algo, volver a correr el generador no se lo puede desarmar.
  const fila = {
    slug,
    nombre: ficha.nombre,
    rubro: ficha.rubro,
    estado: 'demo',
    direccion: ficha.direccion,
    telefono_display: ficha.telefono_display,
    formas_pago: ficha.formas_pago,
    descripcion_corta: ficha.descripcion_corta,
    actualizado_en: new Date().toISOString(),
  };

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
