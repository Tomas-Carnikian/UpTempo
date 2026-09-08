import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './tipos';
import { db, hashTelefono, normalizarTelefono } from './db';
import { enviarPlantilla, ErrorWa, hayWhatsapp } from './whatsapp';
import { RECORDATORIO, IDIOMA, BTN_CONFIRMO, BTN_CAMBIO } from './plantillas';

/**
 * Recordatorio 24 h antes.
 *
 * Es lo unico del sistema que ocurre sin que nadie escriba nada: un
 * Cron Trigger de Cloudflare despierta al Worker cada 15 minutos y
 * este archivo decide a quien le toca.
 *
 * Todo lo demas (contestar, agendar, derivar) pasa dentro de la ventana
 * de 24 h que abre la persona al escribir, y por eso es gratis. Esto no:
 * cada recordatorio es un mensaje de plantilla que se paga.
 */

/** No se recuerda algo que ya esta encima: no da tiempo a reaccionar. */
const MIN_ANTICIPACION_H = 2;
/** Ventana del recordatorio. El nombre del paso. */
const VENTANA_H = 24;
/** Si lo reservaste hace un rato, no te lo recuerdo: te acordas. */
const EDAD_MINIMA_H = 3;
/** Horario civilizado, en hora del NEGOCIO. Un WhatsApp a las 3 AM es un problema, no un servicio. */
const DESDE_HORA = 8;
const HASTA_HORA = 21;
/** Tope por corrida. Con 15 minutos de cadencia sobra muchisimo. */
const TOPE = 100;
/** Igual que en el cerebro: tras 12 h de silencio empieza otra conversacion. */
const VENTANA_CONV_H = 12;

/**
 * "La plantilla no existe" de Meta. Es un 400, o sea permanente segun
 * el status, pero NO lo es: es exactamente lo que contesta Meta
 * mientras la plantilla esta en PENDING, que son las primeras horas de
 * cada cliente nuevo. Tratarlo como permanente significaba que todos
 * los turnos de las proximas 24 h de un cliente recien dado de alta
 * quedaban marcados como recordados sin que saliera ningun mensaje, en
 * silencio y sin manera de recuperarlos.
 *
 * Reintentar no es peligroso: cuando el turno queda a menos de 2 h se
 * cae solo de la consulta. El reintento se agota, no se eterniza.
 */
const PLANTILLA_TODAVIA_NO = 132001;

interface FilaTurno {
  id: string;
  cliente_id: string;
  servicio_nombre: string;
  inicio: string;
  nombre: string;
  telefono: string;
  clientes: {
    slug: string;
    nombre: string;
    timezone: string;
    wa_phone_number_id: string | null;
  };
  conversaciones: { telefono: string | null; canal: string } | null;
}

/**
 * A que numero se le manda.
 *
 * Manda el de la CONVERSACION de WhatsApp, no el del turno. Son dos
 * cosas distintas y se parecen lo suficiente como para confundirse: el
 * de la conversacion es el remitente real que reporta Meta
 * ("59899123456"); el del turno es lo que la persona tipeo cuando el
 * asistente se lo pidio ("099 123 456"). Mandarle al segundo devuelve
 * 131030, "el destinatario no esta en la lista".
 *
 * El del turno queda como respaldo para lo que no vino por WhatsApp:
 * un turno cargado a mano, o uno que nazca de la web.
 */
export function destinatario(fila: FilaTurno): string {
  const deLaConversacion = fila.conversaciones?.canal === 'whatsapp'
    ? normalizarTelefono(fila.conversaciones.telefono ?? '')
    : '';
  return deLaConversacion || normalizarTelefono(fila.telefono ?? '');
}

export async function procesarRecordatorios(env: Env): Promise<{ enviados: number; fallados: number }> {
  if (!hayWhatsapp(env)) {
    console.log('[cron] WhatsApp sin configurar, no hay recordatorios que mandar');
    return { enviados: 0, fallados: 0 };
  }

  const sb = db(env);
  const ahora = Date.now();

  // Una sola consulta para TODOS los clientes. El indice parcial
  // turnos_recordatorio_idx existe para esto desde el paso 1.
  const { data, error } = await sb.from('turnos')
    .select('id, cliente_id, servicio_nombre, inicio, nombre, telefono, ' +
            'clientes!inner(slug, nombre, timezone, wa_phone_number_id), ' +
            'conversaciones(telefono, canal)')
    .is('recordatorio_enviado_en', null)
    .in('estado', ['agendado', 'confirmado'])
    .gte('inicio', new Date(ahora + MIN_ANTICIPACION_H * 3600_000).toISOString())
    .lte('inicio', new Date(ahora + VENTANA_H * 3600_000).toISOString())
    .lte('creado_en', new Date(ahora - EDAD_MINIMA_H * 3600_000).toISOString())
    .not('telefono', 'is', null)
    .eq('clientes.estado', 'activo')
    .not('clientes.wa_phone_number_id', 'is', null)
    .order('inicio')
    .limit(TOPE);

  if (error) { console.error('[cron] no pude leer los turnos:', error.message); return { enviados: 0, fallados: 0 }; }

  let enviados = 0, fallados = 0;

  for (const fila of (data ?? []) as unknown as FilaTurno[]) {
    const c = fila.clientes;
    const tz = c.timezone;

    // Horario civilizado ANTES de reservar la fila: si no es hora, no
    // se toca nada y en la proxima corrida se vuelve a evaluar.
    const hora = horaLocal(tz, new Date());
    if (hora < DESDE_HORA || hora >= HASTA_HORA) continue;

    const para = destinatario(fila);
    if (!para) { console.error(`[cron] turno ${fila.id} sin telefono usable`); continue; }

    // ── Reserva de la fila ──────────────────────────────────────
    // El update condicional es lo que hace que dos ejecuciones
    // solapadas no manden el mismo recordatorio dos veces: la
    // segunda no encuentra la fila con recordatorio_enviado_en null
    // y no actualiza nada.
    const { data: tomada } = await sb.from('turnos')
      .update({ recordatorio_enviado_en: new Date().toISOString() })
      .eq('id', fila.id)
      .is('recordatorio_enviado_en', null)
      .select('id').maybeSingle();
    if (!tomada) continue;

    try {
      const inicio = new Date(fila.inicio);
      await enviarPlantilla(env, c.wa_phone_number_id!, para, {
        nombre: RECORDATORIO,
        idioma: IDIOMA,
        variables: [
          primerNombre(fila.nombre),
          c.nombre,
          fila.servicio_nombre,
          cuandoLegible(inicio, tz),
        ],
        botones: [BTN_CONFIRMO, BTN_CAMBIO],
      });

      await registrar(sb, env, fila, inicio, tz);
      enviados++;
    } catch (e: any) {
      fallados++;
      const permanente = e instanceof ErrorWa && e.permanente
                      && e.codigo !== PLANTILLA_TODAVIA_NO;
      console.error(`[cron] ${c.slug} turno ${fila.id}`,
                    permanente ? 'ERROR PERMANENTE' : 'error temporal', e?.message);

      if (permanente) {
        // La reserva se DEJA puesta: reintentar cada 15 minutos una
        // plantilla que no existe o un numero invalido no lo arregla,
        // solo hace ruido. Queda el evento de error para verlo.
        await sb.from('eventos').insert({
          cliente_id: fila.cliente_id, tipo: 'error', origen: 'cron',
          metadata: { que: 'recordatorio', turno_id: fila.id, error: String(e?.message).slice(0, 400) },
        });
      } else {
        // Temporal: se suelta la reserva y se reintenta en 15 minutos.
        await sb.from('turnos')
          .update({ recordatorio_enviado_en: null }).eq('id', fila.id);
      }
    }
  }

  if (enviados || fallados) console.log(`[cron] recordatorios: ${enviados} enviados, ${fallados} fallados`);
  return { enviados, fallados };
}

// ────────────────────────────────────────────────────────────────

/**
 * El recordatorio se guarda como un mensaje mas de la conversacion, no
 * aparte. Dos razones: la purga a 90 dias lo alcanza igual que a todo
 * lo demas, y sobre todo, si la persona contesta "no puedo", el modelo
 * lee arriba de que le esta contestando. Sin esto la respuesta llega a
 * una conversacion vacia y el asistente no entiende nada.
 */
async function registrar(
  sb: SupabaseClient, env: Env, fila: FilaTurno, inicio: Date, tz: string,
) {
  const texto = `Hola ${primerNombre(fila.nombre)}, te recordamos tu turno en ` +
                `${fila.clientes.nombre}: ${fila.servicio_nombre}, ${cuandoLegible(inicio, tz)}.`;

  const conversacionId = await conversacionDe(sb, env, fila);
  if (!conversacionId) return;

  await sb.from('mensajes').insert({
    conversacion_id: conversacionId, rol: 'asistente', texto, tipo: 'texto',
  });
  await sb.from('conversaciones')
    .update({ ultimo_mensaje_en: new Date().toISOString() })
    .eq('id', conversacionId);

  await sb.from('eventos').insert({
    cliente_id: fila.cliente_id,
    conversacion_id: conversacionId,
    tipo: 'recordatorio',
    origen: 'cron',
    servicio: fila.servicio_nombre,
    metadata: { turno_id: fila.id },
  });
}

/** La conversacion viva de esa persona, o una nueva si no hay ninguna reciente. */
async function conversacionDe(
  sb: SupabaseClient, env: Env, fila: FilaTurno,
): Promise<string | null> {
  const hash = await hashTelefono(env, destinatario(fila));
  const corte = new Date(Date.now() - VENTANA_CONV_H * 3600_000).toISOString();

  const { data: previa } = await sb.from('conversaciones')
    .select('id')
    .eq('cliente_id', fila.cliente_id).eq('canal', 'whatsapp').eq('telefono_hash', hash)
    .gte('ultimo_mensaje_en', corte)
    .order('ultimo_mensaje_en', { ascending: false })
    .limit(1).maybeSingle();
  if (previa) return previa.id as string;

  const { data, error } = await sb.from('conversaciones').insert({
    cliente_id: fila.cliente_id, canal: 'whatsapp',
    telefono: destinatario(fila), telefono_hash: hash,
    nombre_contacto: fila.nombre, estado: 'activa',
  }).select('id').single();

  if (error) { console.error('[cron] no pude abrir la conversacion:', error.message); return null; }
  return data.id as string;
}

function primerNombre(nombre: string): string {
  return (nombre ?? '').trim().split(/\s+/)[0] || 'hola';
}

/** Hora del dia (0-23) en la zona del negocio. */
export function horaLocal(tz: string, d: Date): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(d);
  return Number(h.slice(0, 2));
}

/**
 * "hoy a las 15:00" / "mañana jueves 11 a las 15:00".
 *
 * La ventana es de 2 a 24 h, asi que siempre es hoy o mañana. Poner la
 * fecha completa en un recordatorio de mañana es ruido; no ponerla
 * cuando es mañana deja lugar a la duda.
 */
export function cuandoLegible(inicio: Date, tz: string, ahora = new Date()): string {
  const dia = (d: Date) => new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  const hora = new Intl.DateTimeFormat('es-UY', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(inicio);

  if (dia(inicio) === dia(ahora)) return `hoy a las ${hora}`;

  const p = new Intl.DateTimeFormat('es-UY', {
    timeZone: tz, weekday: 'long', day: 'numeric',
  }).formatToParts(inicio);
  const diaSemana = p.find(x => x.type === 'weekday')?.value ?? '';
  const numero = p.find(x => x.type === 'day')?.value ?? '';

  const manana = new Date(ahora.getTime() + 86_400_000);
  const prefijo = dia(inicio) === dia(manana) ? 'mañana ' : 'el ';
  return `${prefijo}${diaSemana} ${numero} a las ${hora}`;
}
