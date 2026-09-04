import type { SupabaseClient } from '@supabase/supabase-js';
import type { Negocio, Servicio } from './tipos';

/**
 * Disponibilidad real, calculada contra:
 *   - los horarios del negocio,
 *   - los feriados que cierran y las excepciones del cliente,
 *   - los turnos ya agendados en la base.
 *
 * En el paso 3 se suma Google Calendar como fuente extra de ocupacion:
 * es una funcion mas en `ocupados`, nada mas. El resto no cambia.
 */

const PASO_MIN = 15;        // granularidad con que se buscan huecos
const SEPARACION_MIN = 120; // distancia minima entre dos horarios ofrecidos

export interface Hueco { inicio: Date; fin: Date; }

/** Normaliza para comparar nombres de servicio sin acentos ni mayusculas. */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

/** Encuentra el servicio que mas se parece a lo que dijo la persona. */
export function buscarServicio(n: Negocio, texto: string): Servicio | null {
  const t = norm(texto);
  const exacto = n.servicios.find(s => norm(s.nombre) === t);
  if (exacto) return exacto;
  const contiene = n.servicios.find(s => norm(s.nombre).includes(t) || t.includes(norm(s.nombre)));
  if (contiene) return contiene;
  // Ultimo intento: el que comparte mas palabras.
  const palabras = t.split(' ').filter(p => p.length > 3);
  let mejor: Servicio | null = null, mejorPuntaje = 0;
  for (const s of n.servicios) {
    const ns = norm(s.nombre);
    const puntaje = palabras.filter(p => ns.includes(p)).length;
    if (puntaje > mejorPuntaje) { mejor = s; mejorPuntaje = puntaje; }
  }
  return mejorPuntaje > 0 ? mejor : null;
}

/** Partes de fecha/hora de un instante, en la zona del negocio. */
function partesLocales(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(d);
  const g = (t: string) => p.find(x => x.type === t)?.value ?? '';
  return { fecha: `${g('year')}-${g('month')}-${g('day')}`, hora: `${g('hour')}:${g('minute')}` };
}

/**
 * Convierte 'YYYY-MM-DD' + 'HH:MM' de la zona del negocio a un Date UTC.
 * Se hace por tanteo del offset porque los Workers no tienen una
 * libreria de zonas horarias y Uruguay ya no tiene horario de verano,
 * pero esto funciona igual si algun dia vuelve.
 */
export function localAUTC(fecha: string, hora: string, tz: string): Date {
  const tentativo = new Date(`${fecha}T${hora}:00Z`);
  const leido = partesLocales(tentativo, tz);
  const deseado = Date.parse(`${fecha}T${hora}:00Z`);
  const obtenido = Date.parse(`${leido.fecha}T${leido.hora}:00Z`);
  return new Date(tentativo.getTime() + (deseado - obtenido));
}

function diaSemanaISO(fecha: string): number {
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay(); // 0=domingo
  return d === 0 ? 7 : d;
}

function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function aHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** Tramos de atencion de un dia concreto, ya resueltos feriados y excepciones. */
async function tramosDelDia(
  sb: SupabaseClient, n: Negocio, fecha: string,
): Promise<Array<{ desde: number; hasta: number }>> {
  const [exc, fer] = await Promise.all([
    sb.from('excepciones_horario').select('cerrado, desde, hasta')
      .eq('cliente_id', n.cliente.id).eq('fecha', fecha).maybeSingle(),
    sb.from('feriados').select('cierra_por_defecto').eq('fecha', fecha).maybeSingle(),
  ]);

  // 1. La excepcion del cliente manda sobre todo.
  if (exc.data) {
    if (exc.data.cerrado) return [];
    return [{ desde: aMinutos(exc.data.desde as string), hasta: aMinutos(exc.data.hasta as string) }];
  }
  // 2. Feriado que cierra.
  if (fer.data?.cierra_por_defecto) return [];
  // 3. Horario semanal.
  const dow = diaSemanaISO(fecha);
  return n.horarios.filter(h => h.dia_semana === dow)
    .map(h => ({ desde: aMinutos(h.desde), hasta: aMinutos(h.hasta) }));
}

/** Turnos ya tomados que se solapan con el dia. */
async function ocupados(
  sb: SupabaseClient, n: Negocio, desde: Date, hasta: Date,
): Promise<Array<{ inicio: number; fin: number }>> {
  const { data } = await sb.from('turnos')
    .select('inicio, fin, buffer_min')
    .eq('cliente_id', n.cliente.id)
    .in('estado', ['agendado', 'confirmado'])
    .lt('inicio', hasta.toISOString())
    .gt('fin', desde.toISOString());
  return (data ?? []).map(t => ({
    inicio: new Date(t.inicio as string).getTime(),
    // El buffer del turno que YA existe cuenta como ocupado: si uno
    // termina 14:00 con 10 min de respiro, el siguiente no puede
    // empezar 14:00. Sin esto la proxima clienta entra mientras la
    // anterior se esta vistiendo.
    fin: new Date(t.fin as string).getTime() + ((t.buffer_min as number | null) ?? 0) * 60_000,
  }));
  // Paso 3: acá se concatenan los eventos de Google Calendar.
}

/**
 * Hasta `cantidad` huecos reales a partir de una fecha, mirando
 * como maximo `diasMax` dias hacia adelante.
 */
export async function buscarHuecos(
  sb: SupabaseClient,
  n: Negocio,
  servicio: Servicio,
  fechaDesde: string,
  cantidad = 3,
  diasMax = 21,
): Promise<Hueco[]> {
  const tz = n.cliente.timezone;
  const duracion = servicio.duracion_min + servicio.buffer_min;
  const ahora = Date.now();
  const encontrados: Hueco[] = [];

  for (let i = 0; i < diasMax && encontrados.length < cantidad; i++) {
    const fecha = sumarDias(fechaDesde, i);
    const tramos = await tramosDelDia(sb, n, fecha);
    if (!tramos.length) continue;

    const inicioDia = localAUTC(fecha, '00:00', tz);
    const finDia = new Date(inicioDia.getTime() + 24 * 3600_000);
    const tomados = await ocupados(sb, n, inicioDia, finDia);

    let ultimoOfrecido = 0;
    for (const tramo of tramos) {
      for (let m = tramo.desde; m + duracion <= tramo.hasta; m += PASO_MIN) {
        if (encontrados.length >= cantidad) break;
        const inicio = localAUTC(fecha, aHHMM(m), tz);
        const fin = new Date(inicio.getTime() + servicio.duracion_min * 60_000);
        const finConBuffer = new Date(inicio.getTime() + duracion * 60_000);

        // No ofrecer nada en el pasado ni dentro de las proximas 2 horas.
        if (inicio.getTime() < ahora + 2 * 3600_000) continue;

        // Separar los horarios que se ofrecen: tres opciones pegadas
        // ("9:00, 9:15, 9:30") no le sirven a nadie.
        if (ultimoOfrecido && inicio.getTime() - ultimoOfrecido < SEPARACION_MIN * 60_000) continue;

        const choca = tomados.some(t => t.inicio < finConBuffer.getTime() && t.fin > inicio.getTime());
        if (choca) continue;

        encontrados.push({ inicio, fin });
        ultimoOfrecido = inicio.getTime();
      }
    }
  }
  return encontrados.slice(0, cantidad);
}

/** ¿Ese horario exacto sigue libre? Se vuelve a chequear al agendar. */
export async function estaLibre(
  sb: SupabaseClient, n: Negocio, servicio: Servicio, inicio: Date,
): Promise<boolean> {
  const tz = n.cliente.timezone;
  const { fecha, hora } = partesLocales(inicio, tz);
  const tramos = await tramosDelDia(sb, n, fecha);
  const min = aMinutos(hora);
  const duracion = servicio.duracion_min + servicio.buffer_min;
  const dentro = tramos.some(t => min >= t.desde && min + duracion <= t.hasta);
  if (!dentro) return false;

  const fin = new Date(inicio.getTime() + duracion * 60_000);
  const tomados = await ocupados(sb, n, new Date(inicio.getTime() - 3600_000), new Date(fin.getTime() + 3600_000));
  return !tomados.some(t => t.inicio < fin.getTime() && t.fin > inicio.getTime());
}

/** 'jueves 11 de septiembre a las 15:00' */
export function formatearHueco(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('es-UY', {
    timeZone: tz, weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).replace(',', '');
}
