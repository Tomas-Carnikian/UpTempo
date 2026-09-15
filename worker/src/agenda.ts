import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env, Negocio, Servicio, Recurso } from './tipos';
import { hayGoogle, ocupadoEnCalendar } from './google';

/**
 * Disponibilidad real. Un hueco se ofrece solo si sobrevive a cinco
 * filtros:
 *   1. el horario semanal del negocio,
 *   2. los feriados que cierran y las excepciones del cliente,
 *   3. lo que esté ocupado en su Google Calendar,
 *   4. los turnos que ocupan el negocio entero,
 *   5. la CAPACIDAD del recurso que ese servicio necesita.
 *
 * Todo eso se carga UNA vez para todo el rango de fechas, no por día:
 * buscar en 21 días eran 63 consultas y ahora son 3.
 *
 * El punto 5 es lo que agregó la migración 009. Antes la pregunta era
 * "¿hay algo pisando este hueco?" y la respuesta valía para todo el
 * negocio: una clienta a las 11:00 bloqueaba las 11:00 para todo el
 * mundo. En una clínica con dos camillas eso es sub-vender la mitad de
 * la agenda. Ahora la pregunta es "¿cuántas unidades del recurso que
 * este servicio necesita están ocupadas?".
 */

const PASO_MIN = 15;       // granularidad con que se buscan huecos
const SEPARACION_MIN = 45; // piso: dos opciones nunca salen mas juntas que esto
/**
 * Margen dentro del cual NO se OFRECE un horario.
 *
 * Ojo con la palabra: no se ofrece, pero sí se toma. Ofrecerle a
 * alguien un turno dentro de una hora es empujarlo a algo que
 * probablemente no pueda; que lo PIDA es otra cosa completamente
 * distinta —ya sabe que puede ir— y ahi negarselo es perder un turno
 * real por una regla nuestra.
 *
 * Esa asimetria es a proposito. `buscarHuecos` la respeta; `estaLibre`
 * no la mira, y esta bien que no la mire.
 */
export const ANTICIPACION_H = 2;
const ANTICIPACION_MS = ANTICIPACION_H * 3600_000;

/**
 * ¿Este horario cae dentro del margen que no se ofrece? Lo usa la
 * prueba para verificar que los huecos que salen de `buscarHuecos`
 * respeten la regla; no es una puerta que haya que cerrar al agendar.
 */
export function sobreLaHora(inicio: Date, ahora = new Date()): boolean {
  return inicio.getTime() < ahora.getTime() + ANTICIPACION_MS;
}

/**
 * ¿Este horario ya pasó?
 *
 * Esto no es politica sino imposibilidad, y por eso si vale para las
 * tres puertas. `estaLibre` mira el horario de atencion y los choques,
 * no el reloj: sin esta guarda, "dame turno hoy a las 9" siendo las
 * 10:07 agenda un turno en el pasado, entra al calendario del negocio
 * y no lo detecta nadie.
 */
export function yaPaso(inicio: Date, ahora = new Date()): boolean {
  return inicio.getTime() <= ahora.getTime();
}

export interface Hueco { inicio: Date; fin: Date; }
interface Tramo { desde: number; hasta: number; }
interface Intervalo { inicio: number; fin: number; }

export interface ContextoAgenda {
  tramos: Map<string, Tramo[]>;
  /**
   * Lo que cierra el NEGOCIO ENTERO en ese rato:
   *   - lo que el dueño puso a mano en su Google Calendar,
   *   - los turnos con `recurso_id` en null.
   *
   * Para un negocio sin recursos definidos, TODOS sus turnos caen acá
   * y esto se comporta igual que el `choca()` de antes de 009.
   */
  globales: Intervalo[];
  /** recurso_id -> los ratos que ya tiene tomados. */
  porRecurso: Map<string, Intervalo[]>;
}

/**
 * ¿Qué recurso necesita este servicio?
 *
 * `null` quiere decir "ocupa el negocio entero", y es el caso por
 * defecto: un negocio sin recursos cargados tiene todos sus servicios
 * en null y se comporta como siempre.
 *
 * Un `recurso_id` que apunta a un recurso que ya no está (lo dieron de
 * baja) también cae en null, o sea que bloquea todo. Es a propósito:
 * ante una configuración rota, sobre-bloquear se ve enseguida y
 * sobre-vender termina en dos clientas en la misma camilla.
 */
export function recursoDe(n: Negocio, s: Servicio): Recurso | null {
  if (!s.recurso_id) return null;
  return (n.recursos ?? []).find(r => r.id === s.recurso_id) ?? null;
}

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
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find(x => x.type === t)?.value ?? '';
  return { fecha: `${g('year')}-${g('month')}-${g('day')}`, hora: `${g('hour')}:${g('minute')}` };
}

/**
 * 'YYYY-MM-DD' + 'HH:MM' en la zona del negocio -> Date UTC.
 * Por tanteo del offset: los Workers no traen base de zonas horarias
 * mas alla de Intl, y esto funciona igual si Uruguay vuelve a tener
 * horario de verano.
 */
export function localAUTC(fecha: string, hora: string, tz: string): Date {
  const tentativo = new Date(`${fecha}T${hora}:00Z`);
  const leido = partesLocales(tentativo, tz);
  const deseado = Date.parse(`${fecha}T${hora}:00Z`);
  const obtenido = Date.parse(`${leido.fecha}T${leido.hora}:00Z`);
  return new Date(tentativo.getTime() + (deseado - obtenido));
}

function diaSemanaISO(fecha: string): number {
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function sumarDias(fecha: string, n: number): string {
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

/**
 * Carga de una sola vez todo lo que hace falta para decidir huecos
 * en un rango de fechas.
 *
 * `env` en null = no se consulta Google (los tests y el caso de un
 * cliente sin calendario conectado).
 */
export async function cargarContexto(
  sb: SupabaseClient, env: Env | null, n: Negocio, fechaDesde: string, dias: number,
  opts: { excluirTurnoId?: string } = {},
): Promise<ContextoAgenda> {
  const tz = n.cliente.timezone;
  const fechaHasta = sumarDias(fechaDesde, dias);
  const desdeUTC = localAUTC(fechaDesde, '00:00', tz);
  const hastaUTC = localAUTC(fechaHasta, '00:00', tz);

  const usaGoogle = env !== null && hayGoogle(env) && Boolean(n.cliente.calendar_id);

  const [exc, fer, turnos, google] = await Promise.all([
    sb.from('excepciones_horario').select('fecha, cerrado, desde, hasta')
      .eq('cliente_id', n.cliente.id).gte('fecha', fechaDesde).lte('fecha', fechaHasta),
    sb.from('feriados').select('fecha, cierra_por_defecto')
      .gte('fecha', fechaDesde).lte('fecha', fechaHasta).eq('cierra_por_defecto', true),
    sb.from('turnos').select('id, inicio, fin, buffer_min, recurso_id')
      .eq('cliente_id', n.cliente.id).in('estado', ['agendado', 'confirmado'])
      .lt('inicio', hastaUTC.toISOString()).gt('fin', desdeUTC.toISOString()),
    usaGoogle
      ? ocupadoEnCalendar(env!, n.cliente.calendar_id!, desdeUTC, hastaUTC)
      : Promise.resolve([] as Intervalo[]),
  ]);

  const excPorFecha = new Map<string, { cerrado: boolean; desde: string | null; hasta: string | null }>();
  for (const e of (exc.data ?? []) as any[]) excPorFecha.set(e.fecha, e);
  const feriados = new Set((fer.data ?? []).map((f: any) => f.fecha as string));

  const tramos = new Map<string, Tramo[]>();
  for (let i = 0; i <= dias; i++) {
    const fecha = sumarDias(fechaDesde, i);

    // 1. La excepcion del cliente manda sobre todo.
    const e = excPorFecha.get(fecha);
    if (e) {
      tramos.set(fecha, e.cerrado ? []
        : [{ desde: aMinutos(e.desde!), hasta: aMinutos(e.hasta!) }]);
      continue;
    }
    // 2. Feriado que cierra.
    if (feriados.has(fecha)) { tramos.set(fecha, []); continue; }
    // 3. Horario semanal.
    const dow = diaSemanaISO(fecha);
    tramos.set(fecha, n.horarios.filter(h => h.dia_semana === dow)
      .map(h => ({ desde: aMinutos(h.desde), hasta: aMinutos(h.hasta) })));
  }

  // Lo que el negocio puso a mano en su Google Calendar cierra TODO.
  //
  // Nuestros propios turnos ya no vuelven por acá: se escriben con
  // `transparency: 'transparent'` (ver crearEvento en google.ts), así
  // que el freeBusy no los devuelve. Lo único que queda opaco en ese
  // calendario es lo que puso el dueño, y eso es justo lo que tiene
  // que cerrar el negocio entero: cuando bloquea de 14 a 16 no hay
  // forma de saber a qué camilla se refiere, así que se cierran todas.
  const globales: Intervalo[] = [...google];
  const porRecurso = new Map<string, Intervalo[]>();

  for (const t of (turnos.data ?? []) as any[]) {
    // Al reprogramar, el turno que se está moviendo no compite consigo
    // mismo. Sin esto, correrlo 15 minutos choca contra su propia fila.
    if (opts.excluirTurnoId && t.id === opts.excluirTurnoId) continue;

    const intervalo: Intervalo = {
      inicio: new Date(t.inicio).getTime(),
      // El buffer del turno que YA existe cuenta como ocupado: si uno
      // termina 14:00 con 10 min de respiro, el siguiente no puede
      // empezar 14:00.
      fin: new Date(t.fin).getTime() + ((t.buffer_min as number | null) ?? 0) * 60_000,
    };
    const rec = (t.recurso_id as string | null) ?? null;
    if (rec === null) { globales.push(intervalo); continue; }
    const lista = porRecurso.get(rec);
    if (lista) lista.push(intervalo); else porRecurso.set(rec, [intervalo]);
  }

  return { tramos, globales, porRecurso };
}

/**
 * Cuántos intervalos se pisan ENTRE SÍ, como máximo, dentro de
 * [inicio, fin).
 *
 * No alcanza con contar cuántos tocan el rango, y la diferencia
 * importa. Con capacidad 2, un turno de 10:00 a 10:30 y otro de 11:00
 * a 11:30 son dos turnos que tocan el rango 10:15-11:15, pero nunca
 * hay dos a la vez: contándolos planos daría 2, "no hay lugar", y es
 * mentira. Lo que hay que mirar es la simultaneidad.
 *
 * La ocupación solo puede subir donde ARRANCA un intervalo, así que
 * alcanza con mirar el inicio del rango y cada arranque de adentro.
 */
export function ocupacionMaxima(intervalos: Intervalo[], inicio: number, fin: number): number {
  const cortes = [inicio];
  for (const o of intervalos) if (o.inicio > inicio && o.inicio < fin) cortes.push(o.inicio);

  let max = 0;
  for (const p of cortes) {
    let n = 0;
    for (const o of intervalos) if (o.inicio <= p && o.fin > p) n++;
    if (n > max) max = n;
  }
  return max;
}

/**
 * ¿Entra un turno más de este servicio en [inicio, fin)?
 *
 * `recurso` en null = el servicio ocupa el negocio entero: no entra si
 * hay CUALQUIER cosa pisando, ni un bloqueo del dueño ni un turno de
 * ningún recurso. Es el comportamiento de siempre y el de un negocio
 * sin recursos cargados.
 */
export function librePara(
  ctx: ContextoAgenda, recurso: Recurso | null, inicio: number, fin: number,
): boolean {
  const pisa = (o: Intervalo) => o.inicio < fin && o.fin > inicio;

  // Un bloqueo del dueño cierra todo, tenga el servicio el recurso que tenga.
  if (ctx.globales.some(pisa)) return false;

  if (recurso === null) {
    for (const lista of ctx.porRecurso.values()) if (lista.some(pisa)) return false;
    return true;
  }

  const cantidad = Math.max(1, recurso.cantidad || 1);
  return ocupacionMaxima(ctx.porRecurso.get(recurso.id) ?? [], inicio, fin) + 1 <= cantidad;
}

interface Candidato extends Hueco { minuto: number; }

/**
 * Elige `k` opciones REPARTIDAS a lo largo de la lista, no las
 * primeras `k`.
 *
 * Tomar las primeras daba siempre "9:00, 11:00 y 13:00": sonaba a
 * maquina, y ademas amontonaba todos los turnos a la mañana y dejaba
 * la tarde vacia. Una recepcionista ofrece una temprano, una al medio
 * y una tarde.
 */
function repartir(cand: Candidato[], k: number): Candidato[] {
  if (k <= 0) return [];
  if (cand.length <= k) return cand;
  if (k === 1) return [cand[0]];

  const elegidos: Candidato[] = [];
  for (let i = 0; i < k; i++) {
    const c = cand[Math.round((i * (cand.length - 1)) / (k - 1))];
    const ultimo = elegidos[elegidos.length - 1];
    if (ultimo && c.inicio.getTime() - ultimo.inicio.getTime() < SEPARACION_MIN * 60_000) continue;
    elegidos.push(c);
  }
  return elegidos;
}

export interface OpcionesBusqueda {
  cantidad?: number;
  diasMax?: number;
  /** Acota a una franja del dia, en minutos locales. Ej: tarde = 780 a 1440. */
  desdeMin?: number;
  hastaMin?: number;
  /** Ordena por cercania a esta hora local (minutos) en vez de repartir. */
  cercaDeMin?: number;
  /** Al reprogramar: el turno que se esta moviendo no compite consigo mismo. */
  excluirTurnoId?: string;
}

export const FRANJAS: Record<string, { desdeMin: number; hastaMin: number }> = {
  mañana: { desdeMin: 0, hastaMin: 13 * 60 },
  manana: { desdeMin: 0, hastaMin: 13 * 60 },
  mediodia: { desdeMin: 11 * 60, hastaMin: 15 * 60 },
  tarde: { desdeMin: 13 * 60, hastaMin: 19 * 60 },
  noche: { desdeMin: 18 * 60, hastaMin: 24 * 60 },
};

/** Hasta `cantidad` huecos reales a partir de una fecha. */
export async function buscarHuecos(
  sb: SupabaseClient,
  env: Env | null,
  n: Negocio,
  servicio: Servicio,
  fechaDesde: string,
  opts: OpcionesBusqueda = {},
): Promise<Hueco[]> {
  const { cantidad = 3, diasMax = 21, desdeMin = 0, hastaMin = 24 * 60, cercaDeMin,
          excluirTurnoId } = opts;
  const tz = n.cliente.timezone;
  const duracion = servicio.duracion_min + servicio.buffer_min;
  const ahora = Date.now();
  const ctx = await cargarContexto(sb, env, n, fechaDesde, diasMax, { excluirTurnoId });
  const recurso = recursoDe(n, servicio);
  const encontrados: Hueco[] = [];

  for (let i = 0; i < diasMax && encontrados.length < cantidad; i++) {
    const fecha = sumarDias(fechaDesde, i);
    const tramosDia = ctx.tramos.get(fecha) ?? [];
    if (!tramosDia.length) continue;

    // Todos los huecos que sirven ese dia, sin elegir todavia.
    const candidatos: Candidato[] = [];
    for (const tramo of tramosDia) {
      for (let m = tramo.desde; m + duracion <= tramo.hasta; m += PASO_MIN) {
        if (m < desdeMin || m >= hastaMin) continue;
        const inicio = localAUTC(fecha, aHHMM(m), tz);
        if (inicio.getTime() < ahora + ANTICIPACION_MS) continue;
        if (!librePara(ctx, recurso, inicio.getTime(), inicio.getTime() + duracion * 60_000)) continue;
        candidatos.push({
          inicio,
          fin: new Date(inicio.getTime() + servicio.duracion_min * 60_000),
          minuto: m,
        });
      }
    }
    if (!candidatos.length) continue;

    const faltan = cantidad - encontrados.length;

    // Si la persona pidio una hora concreta que no estaba libre,
    // lo util es lo MAS CERCANO a esa hora, no tres opciones repartidas.
    if (cercaDeMin !== undefined) {
      const cerca = [...candidatos]
        .sort((a, b) => Math.abs(a.minuto - cercaDeMin) - Math.abs(b.minuto - cercaDeMin))
        .slice(0, faltan)
        .sort((a, b) => a.minuto - b.minuto);
      encontrados.push(...cerca);
      continue;
    }

    // Nadie ofrece un turno "a las 17:45". Si hay suficientes en punto
    // o y media, se ofrecen solo esos; si no, vale cualquiera.
    const redondos = candidatos.filter(c => c.minuto % 30 === 0);
    const base = redondos.length >= faltan ? redondos : candidatos;

    encontrados.push(...repartir(base, faltan));
  }
  return encontrados.slice(0, cantidad);
}

/**
 * ¿Ese horario exacto sigue libre?
 * Se vuelve a preguntar al agendar: entre que se ofrecio el hueco y
 * que la persona lo confirmo pudieron pasar minutos, y en ese rato
 * otra clienta pudo tomarlo o el dueño pudo poner algo en su agenda.
 */
export async function estaLibre(
  sb: SupabaseClient, env: Env | null, n: Negocio, servicio: Servicio, inicio: Date,
  opts: { excluirTurnoId?: string } = {},
): Promise<boolean> {
  const tz = n.cliente.timezone;
  const { fecha, hora } = partesLocales(inicio, tz);
  const ctx = await cargarContexto(sb, env, n, fecha, 1, opts);

  const min = aMinutos(hora);
  const duracion = servicio.duracion_min + servicio.buffer_min;
  const dentro = (ctx.tramos.get(fecha) ?? []).some(t => min >= t.desde && min + duracion <= t.hasta);
  if (!dentro) return false;

  return librePara(ctx, recursoDe(n, servicio), inicio.getTime(), inicio.getTime() + duracion * 60_000);
}

// ── Encontrar EL turno del que se está hablando ─────────────────
/**
 * El turno vigente mas proximo de una persona.
 *
 * Se busca en dos pasadas y el orden importa:
 *
 * 1. Por CONVERSACION. Es exacto: el turno se agendo en este mismo
 *    hilo, y el recordatorio se mando a este mismo hilo. Si la persona
 *    toca "Confirmar" o pide cambiarlo, es de este turno que habla.
 * 2. Por TELEFONO, como hasta ahora. Cubre lo que la conversacion no
 *    puede: un turno agendado por el chat web y retomado por WhatsApp,
 *    o una madre que reserva a nombre de la hija y despues escribe.
 *
 * Por que la conversacion va primero: `telefono_hash` es el hash del
 * numero TAL COMO SE ESCRIBIO. Un turno agendado dictando "095023935"
 * y una conversacion de WhatsApp, donde Meta manda "59895023935",
 * dan hashes distintos para la misma persona. Normalizamos al escribir
 * (ver normalizarTelefono en db.ts), pero las filas anteriores a ese
 * arreglo quedaron con el hash viejo y ninguna migracion las puede
 * recalcular: el hash lleva pepper y el pepper solo lo tiene el Worker.
 * Buscar por conversacion las encuentra igual, sin tocar la base.
 *
 * `estados` se pasa desde afuera porque no es lo mismo confirmar que
 * reprogramar: confirmar tiene que poder ver un turno ya confirmado
 * para contestar bien si tocan el boton dos veces.
 */
export interface TurnoVigente {
  id: string;
  servicio_id: string | null;
  servicio_nombre: string;
  inicio: string;
  estado: string;
  calendar_event_id: string | null;
}

const COLUMNAS_TURNO = 'id, servicio_id, servicio_nombre, inicio, estado, calendar_event_id';

export async function buscarTurnoVigente(
  sb: SupabaseClient, clienteId: string,
  llaves: { conversacionId?: string | null; hashes?: string[] },
  estados: string[] = ['agendado', 'confirmado'],
): Promise<TurnoVigente | null> {
  const desde = new Date().toISOString();

  const base = () => sb.from('turnos')
    .select(COLUMNAS_TURNO)
    .eq('cliente_id', clienteId)
    .in('estado', estados)
    .gte('inicio', desde)
    .order('inicio').limit(1);

  if (llaves.conversacionId) {
    const { data } = await base().eq('conversacion_id', llaves.conversacionId).maybeSingle();
    if (data) return data as unknown as TurnoVigente;
  }

  for (const hash of llaves.hashes ?? []) {
    if (!hash) continue;
    const { data } = await base().eq('telefono_hash', hash).maybeSingle();
    if (data) return data as unknown as TurnoVigente;
  }

  return null;
}

/** 'jueves 11 de septiembre a las 15:00' */
export function formatearHueco(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('es-UY', {
    timeZone: tz, weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).replace(',', '');
}
