import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env, Negocio, Conversacion } from './tipos';
import { hashTelefono } from './db';
import { buscarServicio, buscarHuecos, estaLibre, formatearHueco, localAUTC } from './agenda';
import { fechaISOLocal } from './prompt';

export const HERRAMIENTAS = [
  {
    name: 'consultar_disponibilidad',
    description:
      'Devuelve hasta 3 horarios libres reales para un servicio. Usala SIEMPRE antes de ofrecer ' +
      'un horario: nunca inventes ni supongas que algo esta libre. Si la persona no dijo cuando, ' +
      'llamala sin fecha_preferida y ofrece lo primero que haya.',
    input_schema: {
      type: 'object',
      properties: {
        servicio: { type: 'string', description: 'Nombre del servicio, tal como lo dijo la persona.' },
        fecha_preferida: {
          type: 'string',
          description: 'Fecha desde la que buscar, en formato YYYY-MM-DD. Omitir si da lo mismo.',
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
    description: 'Mueve el proximo turno de esa persona a otra fecha y hora.',
    input_schema: {
      type: 'object',
      properties: {
        telefono: { type: 'string' },
        nueva_fecha_hora: { type: 'string', description: 'YYYY-MM-DD HH:MM, hora local del negocio.' },
      },
      required: ['telefono', 'nueva_fecha_hora'],
    },
  },
  {
    name: 'cancelar_turno',
    description: 'Cancela el proximo turno de esa persona.',
    input_schema: {
      type: 'object',
      properties: { telefono: { type: 'string' } },
      required: ['telefono'],
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

export async function ejecutar(
  nombre: string,
  args: Record<string, unknown>,
  ctx: { env: Env; sb: SupabaseClient; negocio: Negocio; conversacion: Conversacion },
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
      const huecos = await buscarHuecos(sb, negocio, servicio, desde);
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

      const parseado = parsearFechaHora(String(args.fecha_hora ?? ''), tz);
      if (!parseado) return { salida: 'La fecha y hora tienen que venir como YYYY-MM-DD HH:MM.' };

      // Se vuelve a chequear ACA, no solo al ofrecer: entre que se
      // ofrecio el horario y que la persona lo confirmo pueden haber
      // pasado varios minutos y otra persona pudo tomarlo.
      if (!(await estaLibre(sb, negocio, servicio, parseado))) {
        return { salida: 'Ese horario ya no esta libre. Volve a consultar disponibilidad y ofrece otro.' };
      }

      const telefono = String(args.telefono ?? '').trim();
      const fin = new Date(parseado.getTime() + servicio.duracion_min * 60_000);
      const { data, error } = await sb.from('turnos').insert({
        cliente_id: negocio.cliente.id,
        conversacion_id: conversacion.id,
        servicio_id: servicio.id,
        servicio_nombre: servicio.nombre,
        inicio: parseado.toISOString(),
        fin: fin.toISOString(),
        buffer_min: servicio.buffer_min,
        nombre: String(args.nombre ?? '').trim(),
        telefono,
        telefono_hash: await hashTelefono(env, telefono),
        estado: 'agendado',
        origen: conversacion.canal,
      }).select('id').single();

      if (error) return { salida: `No pude agendar: ${error.message}. Deriva a una persona.` };

      return {
        salida: `Turno agendado (id ${data.id}): ${servicio.nombre}, ${formatearHueco(parseado, tz)}. ` +
                `Confirmaselo en una linea.`,
        agendo: { servicio: servicio.nombre, inicio: parseado },
      };
      // Paso 3: aca se crea tambien el evento en Google Calendar y se
      // guarda calendar_event_id.
    }

    // ---------------------------------------------------------------
    case 'reprogramar_turno':
    case 'cancelar_turno': {
      const telefono = String(args.telefono ?? '').trim();
      const hash = await hashTelefono(env, telefono);
      const { data: turno } = await sb.from('turnos')
        .select('id, servicio_nombre, inicio, servicio_id')
        .eq('cliente_id', negocio.cliente.id)
        .eq('telefono_hash', hash)
        .in('estado', ['agendado', 'confirmado'])
        .gte('inicio', new Date().toISOString())
        .order('inicio').limit(1).maybeSingle();

      if (!turno) return { salida: 'No encuentro ningun turno futuro con ese telefono. Deriva a una persona.' };

      if (nombre === 'cancelar_turno') {
        await sb.from('turnos').update({ estado: 'cancelado' }).eq('id', turno.id);
        return { salida: `Turno cancelado: ${turno.servicio_nombre}, ${formatearHueco(new Date(turno.inicio as string), tz)}.` };
      }

      const nueva = parsearFechaHora(String(args.nueva_fecha_hora ?? ''), tz);
      if (!nueva) return { salida: 'La nueva fecha y hora tienen que venir como YYYY-MM-DD HH:MM.' };
      const servicio = negocio.servicios.find(s => s.id === turno.servicio_id)
                    ?? buscarServicio(negocio, turno.servicio_nombre as string);
      if (!servicio) return { salida: 'No reconozco el servicio del turno. Deriva a una persona.' };
      if (!(await estaLibre(sb, negocio, servicio, nueva))) {
        return { salida: 'Ese horario no esta libre. Consulta disponibilidad y ofrece otro.' };
      }
      const fin = new Date(nueva.getTime() + servicio.duracion_min * 60_000);
      await sb.from('turnos').update({
        inicio: nueva.toISOString(), fin: fin.toISOString(), recordatorio_enviado_en: null,
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
        salida: `Listo, la conversacion quedo derivada y no vas a contestar mas por ${horas} horas. ` +
                `Decile a la persona, en una linea y sin dramatizar, que en un rato le escribe alguien del equipo.`,
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
