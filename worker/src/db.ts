import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env, Negocio, Cliente, Servicio, Horario } from './tipos';

/**
 * El Worker usa la service_role key: bypassa RLS a proposito.
 * El aislamiento entre clientes lo hace el panel (anon + JWT + RLS).
 * Aca el aislamiento lo hace el codigo: TODA consulta filtra por
 * cliente_id, y el cliente_id sale siempre del numero o del slug
 * por el que entro el mensaje. Nunca de algo que mande el usuario.
 */
export function db(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cache de negocios en memoria del isolate.
 *
 * Sirve para no pegarle a Postgres en cada mensaje de una misma
 * conversacion. TTL corto a proposito: la regla del producto es que
 * la config se edita sin desplegar codigo, asi que un cambio de
 * precio tiene que verse en menos de un minuto.
 */
const CACHE = new Map<string, { negocio: Negocio; vence: number }>();
const TTL_MS = 45_000;

export function invalidarCache(clave?: string) {
  if (clave) CACHE.delete(clave); else CACHE.clear();
}

async function cargar(
  env: Env,
  columna: 'slug' | 'wa_phone_number_id',
  valor: string,
): Promise<Negocio | null> {
  const sb = db(env);

  const { data, error } = await sb
    .from('clientes')
    .select('*')
    .eq(columna, valor)
    .maybeSingle();

  if (error) throw new Error(`No pude cargar el negocio (${columna}=${valor}): ${error.message}`);
  if (!data) return null;

  const cliente = data as unknown as Cliente;
  // Un cliente que dejo de pagar no responde: ni el bot, ni la pagina.
  if (cliente.estado === 'baja' || cliente.estado === 'suspendido') return null;

  const [servicios, horarios, kb] = await Promise.all([
    sb.from('servicios')
      .select('id, nombre, precio, precio_nota, duracion_min, buffer_min, descripcion, orden, agendable')
      .eq('cliente_id', cliente.id).eq('activo', true).order('orden'),
    sb.from('horarios')
      .select('dia_semana, desde, hasta')
      .eq('cliente_id', cliente.id).order('dia_semana'),
    sb.from('base_conocimiento')
      .select('contenido_md')
      .eq('cliente_id', cliente.id).eq('activa', true).maybeSingle(),
  ]);

  return {
    cliente,
    servicios: (servicios.data ?? []) as unknown as Servicio[],
    horarios: (horarios.data ?? []) as unknown as Horario[],
    baseConocimiento: (kb.data as { contenido_md?: string } | null)?.contenido_md ?? '',
  };
}

/** Web: se identifica al negocio por el subdominio. */
export async function negocioPorSlug(env: Env, slug: string): Promise<Negocio | null> {
  return cacheado(env, `slug:${slug}`, () => cargar(env, 'slug', slug));
}

/** WhatsApp: se identifica al negocio por el numero que RECIBIO el mensaje. */
export async function negocioPorNumero(env: Env, phoneNumberId: string): Promise<Negocio | null> {
  return cacheado(env, `wa:${phoneNumberId}`, () => cargar(env, 'wa_phone_number_id', phoneNumberId));
}

async function cacheado(
  _env: Env, clave: string, fn: () => Promise<Negocio | null>,
): Promise<Negocio | null> {
  const hit = CACHE.get(clave);
  if (hit && hit.vence > Date.now()) return hit.negocio;
  const negocio = await fn();
  if (negocio) CACHE.set(clave, { negocio, vence: Date.now() + TTL_MS });
  return negocio;
}

/**
 * Hash del telefono del consumidor final, para metricas.
 *
 * Va con pepper porque un celular uruguayo son ~10^7 combinaciones:
 * un sha256 pelado se revierte por fuerza bruta en segundos y no
 * protegeria nada. El pepper vive en los secrets, nunca en la base.
 */
export async function hashTelefono(env: Env, telefono: string): Promise<string> {
  const normalizado = telefono.replace(/[^0-9]/g, '');
  const datos = new TextEncoder().encode(`${env.PEPPER_TELEFONO}:${normalizado}`);
  const digest = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
