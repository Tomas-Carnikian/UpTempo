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
  // trim() a proposito: un espacio o un salto de linea pegado sin
  // querer en .dev.vars rompe la cabecera HTTP con un error ilegible.
  return createClient(env.SUPABASE_URL.trim(), env.SUPABASE_SERVICE_ROLE_KEY.trim(), {
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
 * Hash con pepper. Un celular uruguayo son ~10^7 combinaciones: un
 * sha256 pelado se revierte por fuerza bruta en segundos y no
 * protegeria nada. El pepper vive en los secrets, nunca en la base.
 */
export async function hashValor(env: Env, valor: string): Promise<string> {
  const datos = new TextEncoder().encode(`${env.PEPPER_TELEFONO}:${valor}`);
  const digest = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Un telefono uruguayo escrito SIEMPRE de la misma forma: 598 + numero
 * nacional, sin ceros de tronco, sin espacios y sin +.
 *
 * Existe porque la misma persona aparece de dos formas distintas en el
 * mismo turno: WhatsApp la identifica como "59899123456" (el remitente
 * real) y ella escribe "099 123 456" cuando el asistente le pide el
 * telefono. Quedandonos solo con los digitos, esos dos valores dan
 * hashes distintos, y entonces:
 *   - el recordatorio sale al numero tipeado, que Meta rechaza porque
 *     no tiene codigo de pais;
 *   - cancelar y reprogramar no encuentran el turno de quien escribe.
 *
 * Lo que no reconoce lo deja pasar tal cual: un numero de otro pais
 * tiene que llegar entero a Meta, no mutilado por una regla uruguaya.
 *
 * OJO: cambiar esta funcion cambia TODOS los hashes. Se puede hacer
 * hoy porque los unicos datos son de prueba. Con clientes reales
 * adentro, cambiarla parte el historial al medio, igual que cambiar
 * el pepper.
 */
export function normalizarTelefono(valor: string): string {
  let d = (valor ?? '').replace(/[^0-9]/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);        // 00598… → 598…
  if (d.startsWith('598')) return d;             // ya viene bien
  if (d.length === 9 && d.startsWith('0')) return '598' + d.slice(1);  // 09X XXX XXX
  if (d.length === 8) return '598' + d;          // 9X XXX XXX, o un fijo
  return d;                                      // otro pais: intacto
}

/**
 * Hash de un TELEFONO, sobre la forma normalizada, para que
 * "+598 99 123 456", "099 123 456" y "59899123456" sean una sola
 * persona y no tres.
 */
export async function hashTelefono(env: Env, telefono: string): Promise<string> {
  return hashValor(env, normalizarTelefono(telefono));
}

/**
 * Hash del identificador de una conversacion.
 *
 * OJO: en whatsapp el identificador es un telefono y hay que
 * normalizarlo; en web es un id de sesion del navegador ("web-a3f9…")
 * y NO se puede tocar. Normalizarlo le sacaba las letras y dejaba dos
 * o tres digitos, con lo cual dos visitantes distintos terminaban en
 * la misma conversacion — y leyendo lo que escribio el otro.
 */
export async function hashIdentificador(
  env: Env, valor: string, canal: 'web' | 'whatsapp',
): Promise<string> {
  return canal === 'whatsapp' ? hashTelefono(env, valor) : hashValor(env, valor);
}
