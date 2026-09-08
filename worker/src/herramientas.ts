import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env, Negocio, Conversacion } from './tipos';
import { hashTelefono, normalizarTelefono } from './db';
import { buscarServicio, buscarHuecos, estaLibre, formatearHueco, localAUTC, FRANJAS } from './agenda';
import { fechaISOLocal } from './prompt';
import { hayGoogle, crearEvento, moverEvento, borrarEvento } from './google';

export const HERRAMIENTAS = [
  {
    name: 'consultar_disponibilidad',
    description:
      'Consulta la agenda real. Usala SIEMPRE antes de ofrecer o confirmar un horario: nunca ' +
      'inventes ni supongas que algo esta libre. ' +
      'Si la persona pidio una hora concreta, pasala en hora_preferida: te digo si esa hora ' +
      'exacta esta libre, y si no lo esta te doy las mas cercanas. ' +
      'Si dijo solo una franja ("de tarde", "a la mañana"), pasala en franja.',
    input_schema: {
      type: 'object',
      properties: {
        servicio: { type: 'string', description: 'Nombre del servicio, tal como lo dijo la persona.' },
        fecha_preferida: {
          type: 'string',
          description: 'Fecha desde la que buscar, en formato YYYY-MM-DD. Omitir si da lo mismo.',
        },
        hora_preferida: {
          type: 'string',
          description: 'Hora exacta que pidio la persona, formato HH:MM. Usala siempre que diga una hora.',
        },
        franja: {
          type: 'string',
          enum: ['mañana', 'mediodia', 'tarde', 'noche'],
          description: 'Franja del dia que prefiere, si lo dijo.',
        },
      },
      required: ['servicio'],
    },
  },
  {
    name: 'agendar_turno',
    description:
      'Agenda el turno. Solo despues de tener las cuatro cosas: servicio, fecha y hora exacta, ' +
      'nombre y telefono. La fecha y hora tienen que salir de consultar_disponibilidad.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        telefono: { type: 'string' },
        servicio: { type: 'string' },
        fecha_hora: { type: 'string', description: 'YYYY-MM-DD HH:MM, hora local del negocio.' },
      },
      required: ['nombre', 'telefono', 'servicio', 'fecha_hora'],
    },
  },
  {
    name: 'reprogramar_turno',
    description:
      'Mueve el proximo turno de esa persona a otra fecha y hora. ' +
      'Por WhatsApp NO hace falta el telefono: uso el numero desde el que escribe. ' +
      'Pedilo solo si la persona dice que el turno esta a nombre de otra.',
    input_schema: {
      type: 'object',
      properties: {
        telefono: { type: 'string', description: 'Solo si el turno esta a nombre de otro numero.' },
        nueva_fecha_hora: { type: 'string', description: 'YYYY-MM-DD HH:MM, hora local del negocio.' },
      },
      required: ['nueva_fecha_hora'],
    },
  },
  {
    name: 'cancelar_turno',
    description:
      'Cancela el proximo turno de esa persona. Por WhatsApp NO hace falta el telefono: ' +
      'uso el numero desde el que escribe.',
    input_schema: {
      type: 'object',
      properties: {
        telefono: { type: 'string', description: 'Solo si el turno esta a nombre de otro numero.' },
      },
      required: [],
    },
  },
  {
    name: 'derivar_a_humano',
    description:
      'Pasa la conversacion a una persona del equipo y deja de contestar. Usala ante una foto, ' +
      'cualquier consulta clinica, algo que no este en la base de conocimiento, un reclamo, ' +
      'o si piden hablar con alguien.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: {
          type: 'string',
          description: 'Por que derivas, en pocas palabras. Lo lee el dueno del negocio, no la persona.',
        },
      },
      required: ['motivo'],
    },
  },
] as const;

export interface ResultadoHerramienta {
  salida: string;
  derivo?: boolean;
  agendo?: { servicio: string; inicio: Date };
}

interface Ctx {
  env: Env;
  sb: SupabaseClient;
  negocio: Negocio;
  conversacion: Conversacion;
}

/** ¿Este negocio tiene calendario conectado y credenciales cargadas? */
function conCalendario(ctx: Ctx): string | null {
  const id = ctx.negocio.cliente.calendar_id;
  return id && hayGoogle(ctx.env) ? id : null;
}

export async function ejecutar(
  nombre: string, args: Record<string, unknown>, ctx: Ctx,
): Promise<ResultadoHerramienta> {
  const t0 = Date.now();
  const r = await ejecutarInterno(nombre, args, ctx);
  // Toda llamada a una herramienta queda en el log, con lo que le
  // contestamos al modelo. Sin esto, "el asistente dijo que agendo y
  // no agendo" solo se puede investigar adivinando: no se sabe si la
  // herramienta fallo, si devolvio un error que el modelo ignoro, o si
  // nunca la llamo. Con esto se ve en `wrangler tail` en un minuto.
  console.log('[tool]', ctx.negocio.cliente.slug, nombre,
    JSON.stringify(args).slice(0, 200), '->', r.salida.slice(0, 200),
    `${Date.now() - t0}ms`);
  return r;
}

async function ejecutarInterno(
  nombre: string, args: Record<string, unknown>, ctx: Ctx,
): Promise<ResultadoHerramienta> {
  const { env, sb, negocio, conversacion } = ctx;
  const tz = negocio.cliente.timezone;

  switch (nombre) {
    // ---------------------------------------------------------------
    case 'consultar_disponibilidad': {
      const servicio = buscarServicio(negocio, String(args.servicio ?? ''));
      if (!servicio) {
        return { salida: `No tengo un servicio que se llame asi. Los que hay son: ` +
                         negocio.servicios.map(s => s.nombre).join('; ') +
                         `. Preguntale a la persona a cual se refiere, o deriva.` };
      }
      if (!servicio.agendable) {
        return { salida: `"${servicio.nombre}" no se agenda solo. Deriva a una persona.` };
      }
      const desde = typeof args.fecha_preferida === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.fecha_preferida)
        ? args.fecha_preferida
        : fechaISOLocal(tz);

      // ¿Pidió una hora concreta? Entonces la pregunta no es "que
      // horarios tenés" sino "¿tenés ESA hora?". Antes el asistente
      // se negaba a agendar cualquier cosa fuera de las tres que
      // habia ofrecido, aunque estuviera libre.
      const horaPedida = typeof args.hora_preferida === 'string'
        ? args.hora_preferida.trim().match(/^(\d{1,2}):?(\d{2})?$/) : null;
      if (horaPedida) {
        const hh = String(horaPedida[1]).padStart(2, '0');
        const mm = horaPedida[2] ?? '00';
        const exacta = localAUTC(desde, `${hh}:${mm}`, tz);
        try {
          if (await estaLibre(sb, env, negocio, servicio, exacta)) {
            return { salida: `SÍ, ${formatearHueco(exacta, tz)} está libre para "${servicio.nombre}". ` +
                             `Confirmaselo y pedile los datos. fecha_hora exacta: ${aFechaHoraLocal(exacta, tz)}` };
          }
        } catch (e: any) {
          console.error('[agenda]', negocio.cliente.slug, e?.message);
          return { salida: 'No pude consultar la agenda. No ofrezcas ningun horario y usa derivar_a_humano.' };
        }
        // No está libre: lo útil es lo más cercano a esa hora.
        const cerca = await buscarHuecos(sb, env, negocio, servicio, desde, {
          cercaDeMin: Number(hh) * 60 + Number(mm), diasMax: 1,
        }).catch(() => []);
        if (!cerca.length) {
          return { salida: `${hh}:${mm} no está libre y ese día no queda nada. Ofrecele otro día.` };
        }
        return { salida: `${hh}:${mm} NO está libre. Lo más cercano ese día:\n` +
                 cerca.map(h => `${formatearHueco(h.inicio, tz)}  (fecha_hora exacta: ${aFechaHoraLocal(h.inicio, tz)})`).join('\n') };
      }

      const franja = typeof args.franja === 'string' ? FRANJAS[args.franja.toLowerCase()] : undefined;

      let huecos;
      try {
        huecos = await buscarHuecos(sb, env, negocio, servicio, desde, { ...franja });
      } catch (e: any) {
        // Si no se puede leer la agenda, NO se inventan horarios.
        // Ofrecer un hueco sin poder mirar el calendario es peor que
        // no ofrecer nada: termina en dos clientas en la misma camilla.
        console.error('[agenda]', negocio.cliente.slug, e?.message);
        return { salida: 'No pude consultar la agenda en este momento. No ofrezcas ningun horario: ' +
                         'decile que en un rato le confirman y usa derivar_a_humano.' };
      }

      if (!huecos.length) {
        return { salida: `No hay ningun hueco para "${servicio.nombre}" en las proximas 3 semanas ` +
                         `desde ${desde}. Ofrecele derivar a una persona.` };
      }
      const lista = huecos.map(h =>
        `${formatearHueco(h.inicio, tz)}  (fecha_hora exacta: ${aFechaHoraLocal(h.inicio, tz)})`
      ).join('\n');
      return { salida: `Horarios libres para "${servicio.nombre}" (${servicio.duracion_min} min):\n${lista}` };
    }

    // ---------------------------------------------------------------
    case 'agendar_turno': {
      const servicio = buscarServicio(negocio, String(args.servicio ?? ''));
      if (!servicio) return { salida: 'No reconozco ese servicio. Volve a preguntar cual es.' };

      const inicio = parsearFechaHora(String(args.fecha_hora ?? ''), tz);
      if (!inicio) return { salida: 'La fecha y hora tienen que venir como YYYY-MM-DD HH:MM.' };

      // ── Idempotencia del agendado ───────────────────────────────
      // El modelo puede volver a llamar a esta herramienta en el mismo
      // hilo: pasa cuando la persona escribe "gracias" o pregunta algo
      // despues de que el turno ya quedo confirmado.
      //
      // Sin esta guarda, el rechequeo de mas abajo encuentra el
      // horario ocupado POR EL TURNO QUE ACABAMOS DE CREAR, y el
      // asistente le dice a la clienta que su propio turno "recien se
      // ocupo" y le ofrece otros tres. Ademas, si el rechequeo pasara,
      // quedarian dos turnos iguales.
      const { data: yaHay } = await sb.from('turnos')
        .select('id, servicio_nombre, inicio')
        .eq('cliente_id', negocio.cliente.id)
        .eq('conversacion_id', conversacion.id)
        .in('estado', ['agendado', 'confirmado'])
        .eq('inicio', inicio.toISOString())
        .maybeSingle();

      if (yaHay) {
        return { salida:
          `Ese turno YA está agendado en esta misma conversación: ` +
          `${yaHay.servicio_nombre}, ${formatearHueco(new Date(yaHay.inicio as string), tz)}. ` +
          `NO lo agendes de nuevo ni consultes disponibilidad. Contestá lo que te preguntaron ` +
          `y, si no preguntaron nada, decí algo corto y cortá.` };
      }

      // Se rechequea ACA, no solo al ofrecer: entre que se ofrecio el
      // horario y que la persona lo confirmo pudieron pasar minutos, y
      // en ese rato otra clienta pudo tomarlo o el dueño pudo anotar
      // algo a mano en su calendario.
      try {
        if (!(await estaLibre(sb, env, negocio, servicio, inicio))) {
          return { salida: 'Ese horario ya no esta libre. Volve a consultar disponibilidad y ofrece otro.' };
        }
      } catch (e: any) {
        console.error('[agenda]', negocio.cliente.slug, e?.message);
        return { salida: 'No pude verificar la agenda. No confirmes el turno: usa derivar_a_humano.' };
      }

      // Se guarda normalizado, no como lo tipeo la persona. Es el
      // numero al que despues hay que mandarle el recordatorio, y Meta
      // rechaza cualquier cosa sin codigo de pais.
      const telefono = normalizarTelefono(String(args.telefono ?? ''));
      const nombrePersona = String(args.nombre ?? '').trim();
      const fin = new Date(inicio.getTime() + servicio.duracion_min * 60_000);
      const calendarId = conCalendario(ctx);

      // Primero el calendario, despues la base. El calendario es lo
      // que el negocio mira; si eso falla, no hay turno.
      let eventoId: string | null = null;
      if (calendarId) {
        try {
          eventoId = await crearEvento(env, calendarId, {
            titulo: `${servicio.nombre} — ${nombrePersona}`,
            descripcion: `Agendado por Uptempo.\nTeléfono: ${telefono}\nCanal: ${conversacion.canal}`,
            inicio, fin, timezone: tz,
          });
        } catch (e: any) {
          console.error('[calendar]', negocio.cliente.slug, e?.message);
          return { salida: 'No pude escribir en la agenda del negocio. NO le digas que quedo agendado: ' +
                           'decile que en un rato se lo confirman y usa derivar_a_humano.' };
        }
      }

      const { data, error } = await sb.from('turnos').insert({
        cliente_id: negocio.cliente.id,
        conversacion_id: conversacion.id,
        servicio_id: servicio.id,
        servicio_nombre: servicio.nombre,
        inicio: inicio.toISOString(),
        fin: fin.toISOString(),
        buffer_min: servicio.buffer_min,
        nombre: nombrePersona,
        telefono,
        telefono_hash: await hashTelefono(env, telefono),
        estado: 'agendado',
        calendar_event_id: eventoId,
        origen: conversacion.canal,
      }).select('id').single();

      if (error) {
        // La base fallo despues de crear el evento: se deshace, para
        // no dejar un turno fantasma en el calendario del negocio.
        if (calendarId && eventoId) {
          try { await borrarEvento(env, calendarId, eventoId); } catch { /* nada que hacer */ }
        }
        return { salida: `No pude agendar: ${error.message}. Usa derivar_a_humano.` };
      }

      return {
        salida: `Turno agendado (id ${data.id}${eventoId ? ', ya está en el calendario' : ''}): ` +
                `${servicio.nombre}, ${formatearHueco(inicio, tz)}. Confirmaselo en una linea.`,
        agendo: { servicio: servicio.nombre, inicio },
      };
    }

    // ---------------------------------------------------------------
    case 'reprogramar_turno':
    case 'cancelar_turno': {
      // Por WhatsApp el telefono ya lo sabemos: es el numero desde el
      // que escribe. Preguntarselo a alguien que nos esta escribiendo
      // por WhatsApp es la clase de detalle que delata que del otro
      // lado hay un formulario y no una persona. Igual se prueba
      // primero el que haya dicho el modelo: el turno puede estar a
      // nombre de otra (una madre que reserva para su hija).
      const candidatos = [...new Set(
        [String(args.telefono ?? '').trim(), (conversacion.telefono ?? '').trim()].filter(Boolean),
      )];
      if (!candidatos.length) {
        return { salida: 'No tengo el telefono. Pediselo antes de seguir.' };
      }

      let turno: any = null;
      for (const tel of candidatos) {
        const { data } = await sb.from('turnos')
          .select('id, servicio_nombre, inicio, servicio_id, calendar_event_id')
          .eq('cliente_id', negocio.cliente.id)
          .eq('telefono_hash', await hashTelefono(env, tel))
          .in('estado', ['agendado', 'confirmado'])
          .gte('inicio', new Date().toISOString())
          .order('inicio').limit(1).maybeSingle();
        if (data) { turno = data; break; }
      }

      if (!turno) return { salida: 'No encuentro ningun turno futuro con ese telefono. Deriva a una persona.' };

      const calendarId = conCalendario(ctx);
      const eventoId = turno.calendar_event_id as string | null;

      if (nombre === 'cancelar_turno') {
        if (calendarId && eventoId) {
          try { await borrarEvento(env, calendarId, eventoId); }
          catch (e: any) {
            console.error('[calendar]', negocio.cliente.slug, e?.message);
            return { salida: 'No pude sacarlo de la agenda del negocio. Usa derivar_a_humano.' };
          }
        }
        await sb.from('turnos').update({ estado: 'cancelado' }).eq('id', turno.id);
        return { salida: `Turno cancelado: ${turno.servicio_nombre}, ` +
                         `${formatearHueco(new Date(turno.inicio as string), tz)}.` };
      }

      const nueva = parsearFechaHora(String(args.nueva_fecha_hora ?? ''), tz);
      if (!nueva) return { salida: 'La nueva fecha y hora tienen que venir como YYYY-MM-DD HH:MM.' };

      const servicio = negocio.servicios.find(s => s.id === turno.servicio_id)
                    ?? buscarServicio(negocio, turno.servicio_nombre as string);
      if (!servicio) return { salida: 'No reconozco el servicio del turno. Deriva a una persona.' };

      try {
        if (!(await estaLibre(sb, env, negocio, servicio, nueva))) {
          return { salida: 'Ese horario no esta libre. Consulta disponibilidad y ofrece otro.' };
        }
      } catch (e: any) {
        console.error('[agenda]', negocio.cliente.slug, e?.message);
        return { salida: 'No pude verificar la agenda. Usa derivar_a_humano.' };
      }

      const finNuevo = new Date(nueva.getTime() + servicio.duracion_min * 60_000);
      if (calendarId && eventoId) {
        try { await moverEvento(env, calendarId, eventoId, nueva, finNuevo, tz); }
        catch (e: any) {
          console.error('[calendar]', negocio.cliente.slug, e?.message);
          return { salida: 'No pude moverlo en la agenda del negocio. Usa derivar_a_humano.' };
        }
      }
      await sb.from('turnos').update({
        inicio: nueva.toISOString(), fin: finNuevo.toISOString(), recordatorio_enviado_en: null,
      }).eq('id', turno.id);
      return { salida: `Turno reprogramado para ${formatearHueco(nueva, tz)}.` };
    }

    // ---------------------------------------------------------------
    case 'derivar_a_humano': {
      const motivo = String(args.motivo ?? 'sin motivo');
      const horas = negocio.cliente.silencio_derivacion_h || 24;
      const hasta = new Date(Date.now() + horas * 3600_000);
      await sb.from('conversaciones').update({
        estado: 'derivada',
        silenciado_hasta: hasta.toISOString(),
        motivo_derivacion: motivo,
      }).eq('id', conversacion.id);

      return {
        // Este texto lo lee el modelo, no la persona. Nada de "quedo
        // derivado" ni de "no contesto por 24 horas": si se filtra a
        // la respuesta, la clienta lee jerga interna nuestra.
        salida: 'Hecho. Ahora escribile a la persona UNA sola linea, sin dramatizar, diciendole que ' +
                'en un rato le escribe alguien del equipo. No menciones que la conversacion se derivo, ' +
                'ni que dejas de contestar, ni por cuanto tiempo.',
        derivo: true,
      };
      // Paso 7: aca sale el aviso al dueno por WhatsApp o mail.
    }
  }

  return { salida: `Herramienta desconocida: ${nombre}` };
}

/** 'YYYY-MM-DD HH:MM' (hora local del negocio) -> Date UTC */
function parsearFechaHora(texto: string, tz: string): Date | null {
  const m = texto.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  return localAUTC(m[1], `${m[2]}:${m[3]}`, tz);
}

function aFechaHoraLocal(d: Date, tz: string): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find(x => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
}
