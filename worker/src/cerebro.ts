import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Env, Negocio, Conversacion, MensajeEntrante, Respuesta,
  MensajeApi, RespuestaApi, Bloque, BloqueToolResult,
} from './tipos';
import { db, hashTelefono } from './db';
import { construirSystem } from './prompt';
import { HERRAMIENTAS, ejecutar } from './herramientas';

const MAX_VUELTAS = 5;       // tope del loop de herramientas
const HISTORIAL = 20;        // mensajes de contexto que se recuperan
const VENTANA_CONV_H = 12;   // tras 12 h de silencio, empieza una conversacion nueva

/** Respuesta fija ante una foto. No la escribe el modelo: es codigo. */
const TEXTO_FOTO =
  'Perdón, por acá no puedo ver fotos. Ya le paso tu mensaje a alguien del equipo y en un rato te escriben.';
const TEXTO_AUDIO =
  '¿Me lo podés escribir? Por acá no puedo escuchar los audios.';

export async function responder(
  env: Env, negocio: Negocio, entrada: MensajeEntrante,
): Promise<Respuesta> {
  const t0 = Date.now();
  const sb = db(env);
  const esWhatsapp = entrada.canal === 'whatsapp';
  const hash = await hashTelefono(env, entrada.identificador);

  // ── Idempotencia. Meta reintenta el webhook si no le contestamos
  //    rapido; sin esto el asistente responde dos veces y cobra dos veces.
  if (entrada.waMessageId) {
    const { data: ya } = await sb.from('mensajes')
      .select('id').eq('wa_message_id', entrada.waMessageId).maybeSingle();
    if (ya) return { texto: null, conversacionId: '', derivada: false, latenciaMs: 0 };
  }

  const conversacion = await obtenerConversacion(sb, negocio, entrada, hash, esWhatsapp);

  await sb.from('mensajes').insert({
    conversacion_id: conversacion.id,
    rol: 'usuario',
    texto: entrada.texto,
    tipo: entrada.tipo,
    wa_message_id: entrada.waMessageId ?? null,
  });
  await sb.from('conversaciones')
    .update({ ultimo_mensaje_en: new Date().toISOString() })
    .eq('id', conversacion.id);

  // ── Silencio tras derivar. El bot no le pisa la respuesta a una persona.
  const silenciada = conversacion.estado === 'derivada'
    && conversacion.silenciado_hasta !== null
    && new Date(conversacion.silenciado_hasta) > new Date();
  if (silenciada) {
    return { texto: null, conversacionId: conversacion.id, derivada: true, latenciaMs: Date.now() - t0 };
  }

  // ── Reglas duras que NO delegamos en el modelo ────────────────
  // Una foto de una lesion es el caso mas delicado del rubro. Que el
  // modelo "sepa" que no debe mirarla no alcanza: aca ni siquiera se
  // le manda. Es codigo, no una instruccion que se pueda esquivar.
  if (entrada.tipo === 'imagen') {
    return derivarPorCodigo(sb, env, negocio, conversacion, TEXTO_FOTO, 'mando una foto', t0);
  }
  if (entrada.tipo === 'audio' && !entrada.texto.trim()) {
    await guardarRespuesta(sb, conversacion.id, TEXTO_AUDIO);
    await registrarEvento(sb, negocio, conversacion, 'consulta', Date.now() - t0, entrada.canal);
    return { texto: TEXTO_AUDIO, conversacionId: conversacion.id, derivada: false, latenciaMs: Date.now() - t0 };
  }

  // ── El modelo ─────────────────────────────────────────────────
  const historial = await cargarHistorial(sb, conversacion.id);
  const mensajes: MensajeApi[] = [...historial, { role: 'user', content: entrada.texto }];
  const system = construirSystem(negocio);

  let textoFinal = '';
  let derivo = false;

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const r = await llamarModelo(env, negocio.cliente.modelo, system, mensajes);

    const textos = r.content.filter(b => b.type === 'text').map(b => (b as any).text as string);
    const usos = r.content.filter(b => b.type === 'tool_use') as Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }>;
    if (textos.length) textoFinal = textos.join('\n').trim();

    if (!usos.length) break;

    mensajes.push({ role: 'assistant', content: r.content as Bloque[] });

    const resultados: BloqueToolResult[] = [];
    for (const uso of usos) {
      const res = await ejecutar(uso.name, uso.input, { env, sb, negocio, conversacion });
      if (res.derivo) derivo = true;
      if (res.agendo) {
        await registrarEvento(sb, negocio, conversacion, 'turno', null, entrada.canal, res.agendo.servicio);
      }
      resultados.push({ type: 'tool_result', tool_use_id: uso.id, content: res.salida });
    }
    mensajes.push({ role: 'user', content: resultados });
  }

  if (!textoFinal) {
    textoFinal = 'Dejame que lo confirmo con el equipo y te escribo.';
    derivo = true;
    await marcarDerivada(sb, negocio, conversacion, 'el asistente no supo que contestar');
  }

  await guardarRespuesta(sb, conversacion.id, textoFinal);
  const latencia = Date.now() - t0;
  await registrarEvento(sb, negocio, conversacion, 'consulta', latencia, entrada.canal);
  if (derivo) await registrarEvento(sb, negocio, conversacion, 'derivacion', null, entrada.canal);

  return { texto: textoFinal, conversacionId: conversacion.id, derivada: derivo, latenciaMs: latencia };
}

// ────────────────────────────────────────────────────────────────

async function llamarModelo(
  env: Env, modelo: string, system: unknown, mensajes: MensajeApi[],
): Promise<RespuestaApi> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 700,        // una recepcionista escribe corto
      temperature: 0.3,       // bajo: no queremos creatividad con los precios
      system,
      tools: HERRAMIENTAS,
      messages: mensajes,
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 400)}`);
  return await r.json() as RespuestaApi;
}

async function obtenerConversacion(
  sb: SupabaseClient, negocio: Negocio, entrada: MensajeEntrante,
  hash: string, guardarTelefono: boolean,
): Promise<Conversacion> {
  const corte = new Date(Date.now() - VENTANA_CONV_H * 3600_000).toISOString();

  const { data: previa } = await sb.from('conversaciones')
    .select('id, cliente_id, canal, estado, silenciado_hasta, telefono, telefono_hash, nombre_contacto')
    .eq('cliente_id', negocio.cliente.id)
    .eq('canal', entrada.canal)
    .eq('telefono_hash', hash)
    .gte('ultimo_mensaje_en', corte)
    .order('ultimo_mensaje_en', { ascending: false })
    .limit(1).maybeSingle();

  if (previa) return previa as Conversacion;

  const { data, error } = await sb.from('conversaciones').insert({
    cliente_id: negocio.cliente.id,
    canal: entrada.canal,
    telefono_hash: hash,
    // El numero en claro solo para WhatsApp, que es donde hay que
    // poder contestar y mandar el recordatorio. La purga a 90 dias
    // lo borra y deja el hash.
    telefono: guardarTelefono ? entrada.identificador : null,
    nombre_contacto: entrada.nombreContacto ?? null,
    estado: 'activa',
  }).select('id, cliente_id, canal, estado, silenciado_hasta, telefono, telefono_hash, nombre_contacto')
    .single();

  if (error) throw new Error(`No pude abrir la conversacion: ${error.message}`);
  return data as Conversacion;
}

async function cargarHistorial(sb: SupabaseClient, conversacionId: string): Promise<MensajeApi[]> {
  const { data } = await sb.from('mensajes')
    .select('rol, texto, tipo')
    .eq('conversacion_id', conversacionId)
    .order('creado_en', { ascending: false })
    .limit(HISTORIAL + 1);

  const filas = (data ?? []).reverse();
  // El ultimo es el mensaje que estamos contestando: se agrega aparte.
  filas.pop();

  const salida: MensajeApi[] = [];
  for (const f of filas) {
    const rol = f.rol as string;
    if (rol !== 'usuario' && rol !== 'asistente' && rol !== 'humano') continue;
    const texto = (f.texto as string | null) ?? (f.tipo === 'imagen' ? '[foto]' : '[mensaje sin texto]');
    salida.push({ role: rol === 'usuario' ? 'user' : 'assistant', content: texto });
  }
  // La API exige alternancia y que el primero sea del usuario.
  while (salida.length && salida[0].role !== 'user') salida.shift();
  return salida.filter((m, i) => i === 0 || m.role !== salida[i - 1].role);
}

async function guardarRespuesta(sb: SupabaseClient, conversacionId: string, texto: string) {
  await sb.from('mensajes').insert({ conversacion_id: conversacionId, rol: 'asistente', texto, tipo: 'texto' });
}

async function marcarDerivada(
  sb: SupabaseClient, negocio: Negocio, conversacion: Conversacion, motivo: string,
) {
  const horas = negocio.cliente.silencio_derivacion_h || 24;
  await sb.from('conversaciones').update({
    estado: 'derivada',
    silenciado_hasta: new Date(Date.now() + horas * 3600_000).toISOString(),
    motivo_derivacion: motivo,
  }).eq('id', conversacion.id);
}

async function derivarPorCodigo(
  sb: SupabaseClient, _env: Env, negocio: Negocio, conversacion: Conversacion,
  texto: string, motivo: string, t0: number,
): Promise<Respuesta> {
  await marcarDerivada(sb, negocio, conversacion, motivo);
  await guardarRespuesta(sb, conversacion.id, texto);
  const latencia = Date.now() - t0;
  await registrarEvento(sb, negocio, conversacion, 'consulta', latencia, conversacion.canal);
  await registrarEvento(sb, negocio, conversacion, 'derivacion', null, conversacion.canal, undefined, { motivo });
  return { texto, conversacionId: conversacion.id, derivada: true, latenciaMs: latencia };
}

/**
 * Todo evento se escribe EN EL MOMENTO en que ocurre.
 * El panel es la parte facil; si esto no corre desde la primera
 * conversacion, el primer mes del primer cliente queda vacio y no
 * se recupera. `fuera_de_horario` lo decide la base con la misma
 * funcion que usa la agenda, para que nunca discrepen.
 */
async function registrarEvento(
  sb: SupabaseClient, negocio: Negocio, conversacion: Conversacion,
  tipo: 'consulta' | 'turno' | 'derivacion' | 'error',
  latenciaMs: number | null, origen: string,
  servicio?: string, metadata: Record<string, unknown> = {},
) {
  let fuera = false;
  try {
    const { data } = await sb.rpc('es_fuera_de_horario', {
      p_cliente: negocio.cliente.id,
      p_momento: new Date().toISOString(),
    });
    fuera = data === true;
  } catch { /* si falla, el evento igual se guarda */ }

  await sb.from('eventos').insert({
    cliente_id: negocio.cliente.id,
    conversacion_id: conversacion.id,
    tipo,
    fuera_de_horario: fuera,
    servicio: servicio ?? null,
    origen,
    latencia_ms: latenciaMs,
    metadata,
  });
}
