import type { Env, Negocio, Conversacion } from './tipos';
import { api, enviarPlantilla } from './whatsapp';

/**
 * Plantillas de Meta.
 *
 * Una plantilla es un texto con huecos que Meta revisa y aprueba, y es
 * lo UNICO que se puede mandar fuera de la ventana de 24 h. Sin esto no
 * hay recordatorio: a 24 h de distancia la ventana siempre esta cerrada.
 *
 * Viven en la cuenta de WhatsApp Business (WABA) de cada cliente, no en
 * la nuestra. Eso significa que dar de alta un cliente ya no es solo
 * insertar filas: hay que crearle las plantillas una vez y esperar la
 * aprobacion. Por eso estan definidas ACA, en codigo, y se cargan con
 * una llamada — para que sea un boton y no un tramite manual repetido
 * cliente por cliente.
 *
 * La aprobacion de una plantilla de UTILITY suele tardar de minutos a
 * un par de horas. No es instantanea, y es lo primero que hay que
 * disparar al dar de alta a alguien.
 */

/** Meta identifica el idioma por codigo. 'es' cubre todo el castellano. */
export const IDIOMA = 'es';

export const RECORDATORIO = 'recordatorio_turno';
export const AVISO_DERIVACION = 'aviso_derivacion';

/** Payloads de los botones. Lo que nos vuelve por el webhook. */
export const BTN_CONFIRMO = 'CONFIRMO';
export const BTN_CAMBIO = 'CAMBIO';

/**
 * Reglas de Meta que hay que respetar o la plantilla se rechaza:
 *   - el cuerpo no puede empezar ni terminar con una variable
 *   - dos variables no pueden ir pegadas
 *   - toda variable necesita un ejemplo
 *   - nada de precios, promesas ni promocion: eso saca la plantilla de
 *     UTILITY y la manda a MARKETING, que es mas cara y se rechaza mas
 */
export const DEFINICIONES = [
  {
    name: RECORDATORIO,
    language: IDIOMA,
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Hola {{1}}, te recordamos tu turno en {{2}}: {{3}}, {{4}}. ' +
              'Si necesitás cambiarlo, respondé este mensaje.',
        example: {
          body_text: [['Sofía', 'Clínica Solé', 'Limpieza facial', 'mañana jueves 11 a las 15:00']],
        },
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Confirmar' },
          { type: 'QUICK_REPLY', text: 'Necesito cambiarlo' },
        ],
      },
    ],
  },
  {
    name: AVISO_DERIVACION,
    language: IDIOMA,
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Una conversación de {{1}} necesita que la vea alguien del equipo. ' +
              'Motivo: {{2}}. Escribió desde {{3}}. La conversación completa está en el panel.',
        example: {
          body_text: [['Clínica Solé', 'preguntó por una reacción en la piel', '+598 99 123 456']],
        },
      },
    ],
  },
] as const;

function cabeceras(env: Env): Record<string, string> {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${env.WA_TOKEN!.trim()}`,
  };
}

export interface EstadoPlantilla {
  nombre: string;
  estado: string;   // APPROVED | PENDING | REJECTED
  categoria: string;
  idioma: string;
  motivo?: string;
}

/** Que plantillas tiene hoy esa WABA y como estan. */
export async function estadoPlantillas(env: Env, wabaId: string): Promise<EstadoPlantilla[]> {
  const url = `${api(env)}/${wabaId}/message_templates` +
              `?fields=name,status,category,language,rejected_reason&limit=100`;
  const r = await fetch(url, { headers: cabeceras(env) });
  const j = await r.json() as any;
  if (!r.ok) throw new Error(`Meta ${r.status}: ${JSON.stringify(j?.error ?? j).slice(0, 300)}`);
  return (j?.data ?? []).map((t: any) => ({
    nombre: t.name, estado: t.status, categoria: t.category,
    idioma: t.language, motivo: t.rejected_reason,
  }));
}

export interface AltaPlantilla { nombre: string; ok: boolean; detalle: string; }

/**
 * Crea las plantillas que faltan en esa WABA. Es idempotente: si una ya
 * existe, Meta contesta 400 y se informa sin romper nada, asi que se
 * puede volver a llamar sin miedo.
 */
export async function crearPlantillas(env: Env, wabaId: string): Promise<AltaPlantilla[]> {
  const salida: AltaPlantilla[] = [];

  for (const def of DEFINICIONES) {
    const r = await fetch(`${api(env)}/${wabaId}/message_templates`, {
      method: 'POST', headers: cabeceras(env), body: JSON.stringify(def),
    });
    const j = await r.json().catch(() => ({})) as any;
    salida.push({
      nombre: def.name,
      ok: r.ok,
      detalle: r.ok
        ? `creada (id ${j?.id ?? '?'}), estado ${j?.status ?? 'PENDING'}`
        : `${r.status} — ${j?.error?.error_user_msg ?? j?.error?.message ?? 'sin detalle'}`,
    });
  }
  return salida;
}

// ── Aviso al dueño cuando el asistente deriva ───────────────────
/**
 * Cuando el bot deriva, alguien tiene que enterarse. Sin esto la
 * derivacion es un agujero: el asistente le dice a la persona que en un
 * rato le escriben y no le escribe nadie, porque el dueño no sabe.
 *
 * Va como plantilla porque el dueño casi nunca tiene una ventana de
 * 24 h abierta con su propio numero de negocio. Cuesta un mensaje de
 * utilidad por derivacion.
 *
 * NUNCA tira una excepcion hacia afuera: que falle el aviso no puede
 * tumbar la respuesta a la clienta, que es lo importante.
 */
/**
 * El motivo entra en "Motivo: {{2}}." — la plantilla ya pone el punto.
 * El modelo escribe el motivo como una oracion terminada, asi que sin
 * esto sale "…asociado a su número.." con dos puntos. Meta ademas
 * rechaza una variable con saltos de linea o espacios dobles, y eso no
 * falla en el momento sino cuando ya hay alguien esperando el aviso.
 */
export function limpiarMotivo(motivo: string): string {
  // El recorte va ANTES de sacar el punto: si no, cortar en 200 puede
  // dejar el punto de una oracion interna justo al final y volvemos al
  // "..".
  const limpio = (motivo ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
    .replace(/[.\s]+$/, '');
  return limpio || 'el asistente no pudo resolverlo';
}

export async function avisarDerivacion(
  env: Env, negocio: Negocio, conversacion: Conversacion, motivo: string,
): Promise<void> {
  const c = negocio.cliente;
  const destino = (c.derivacion_telefono ?? '').replace(/[^\d]/g, '');
  if (!destino || !c.wa_phone_number_id || !env.WA_TOKEN?.trim()) return;

  try {
    await enviarPlantilla(env, c.wa_phone_number_id, destino, {
      nombre: AVISO_DERIVACION,
      idioma: IDIOMA,
      variables: [
        c.nombre,
        limpiarMotivo(motivo),
        conversacion.telefono ?? conversacion.nombre_contacto ?? 'el chat de la web',
      ],
    });
  } catch (e: any) {
    console.error('[aviso]', c.slug, e?.message);
  }
}
