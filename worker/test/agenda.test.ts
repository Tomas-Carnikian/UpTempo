/**
 * Pruebas de la agenda y del prompt, sin red y sin base.
 * Correr con: npm run test
 *
 * Prueban lo que se rompe callado: zonas horarias, feriados,
 * solapamientos, el respiro entre turnos, y que la base de
 * conocimiento entre completa en el prompt.
 *
 * Google Calendar no se prueba acá: se pasa `env` en null, que es
 * como decirle "no mires ningún calendario". Esa parte se prueba en
 * vivo contra un calendario real, que es la única forma seria.
 */
import { buscarServicio, buscarHuecos, estaLibre, localAUTC, formatearHueco, cargarContexto, FRANJAS,
         buscarTurnoVigente, sobreLaHora, ANTICIPACION_H, yaPaso } from '../src/agenda';
import { limpiarMotivo } from '../src/plantillas';
import { construirSystem } from '../src/prompt';
import { hashIdentificador } from '../src/db';
import { esClaveSecreta } from '../src/config';
import type { Negocio } from '../src/tipos';

let ok = 0, mal = 0;
function comprobar(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) { ok++; console.log(`  ok  ${nombre}`); }
  else { mal++; console.log(`  MAL ${nombre}${detalle ? '  → ' + detalle : ''}`); }
}

// ── Clínica Solé, igual que en la base ──────────────────────────
const SOLE: Negocio = {
  cliente: {
    id: 'c1', slug: 'clinicasole', nombre: 'Clínica Solé', rubro: 'estética',
    estado: 'activo', timezone: 'America/Montevideo',
    wa_phone_number_id: null, telefono_display: '+598 99 000 000', calendar_id: null,
    color_primario: '#2f4858', color_secundario: '#d98ca5', logo_url: null, fotos: [],
    direccion: 'Av. Brasil 2847, Pocitos', maps_url: null, google_place_id: null,
    formas_pago: 'Efectivo, débito, crédito y Mercado Pago',
    descripcion_corta: 'Depilación definitiva en Pocitos',
    modelo: 'claude-sonnet-5', derivacion_telefono: null,
    derivacion_email: 'duenio@test.uy', silencio_derivacion_h: 24,
  },
  servicios: [
    { id: 's1', nombre: 'Depilación definitiva piernas completas', precio: 2900,
      precio_nota: 'Paquete de 6 sesiones $U 14.500', duracion_min: 60, buffer_min: 10,
      descripcion: null, orden: 1, agendable: true },
    { id: 's2', nombre: 'Depilación definitiva axilas', precio: 900,
      precio_nota: 'Paquete de 6 $U 4.500', duracion_min: 20, buffer_min: 10,
      descripcion: null, orden: 2, agendable: true },
    { id: 's3', nombre: 'Limpieza facial profunda', precio: 1800, precio_nota: null,
      duracion_min: 60, buffer_min: 10, descripcion: null, orden: 4, agendable: true },
  ],
  horarios: [
    { dia_semana: 1, desde: '09:00:00', hasta: '19:00:00' },
    { dia_semana: 2, desde: '09:00:00', hasta: '19:00:00' },
    { dia_semana: 3, desde: '09:00:00', hasta: '19:00:00' },
    { dia_semana: 4, desde: '09:00:00', hasta: '19:00:00' },
    { dia_semana: 5, desde: '09:00:00', hasta: '19:00:00' },
    { dia_semana: 6, desde: '09:00:00', hasta: '13:00:00' },
  ],
  baseConocimiento: '# Clínica Solé\n\n## Qué no responder\n\nNunca dar consejo clínico.\n',
};

/** Supabase de mentira: le pasamos nosotros feriados, excepciones y turnos. */
function sbFalso(opts: {
  feriados?: string[];
  excepciones?: Record<string, { cerrado: boolean; desde?: string; hasta?: string }>;
  turnos?: Array<{ inicio: string; fin: string; buffer_min?: number }>;
} = {}) {
  const { feriados = [], excepciones = {}, turnos = [] } = opts;
  return {
    from(tabla: string) {
      const api: any = {
        select: () => api, eq: () => api, in: () => api, lt: () => api, gt: () => api,
        gte: () => api, lte: () => api, order: () => api, limit: () => api,
        maybeSingle: async () => ({ data: null }),
        then: (resolver: any) => {
          if (tabla === 'feriados') {
            return resolver({ data: feriados.map(f => ({ fecha: f, cierra_por_defecto: true })) });
          }
          if (tabla === 'excepciones_horario') {
            return resolver({
              data: Object.entries(excepciones).map(([fecha, e]) => ({
                fecha, cerrado: e.cerrado, desde: e.desde ?? null, hasta: e.hasta ?? null,
              })),
            });
          }
          if (tabla === 'turnos') return resolver({ data: turnos });
          return resolver({ data: [] });
        },
      };
      return api;
    },
  } as any;
}

const TZ = 'America/Montevideo';
const hhmm = (d: Date) => new Intl.DateTimeFormat('es-UY',
  { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
const diaSem = (d: Date) => new Intl.DateTimeFormat('es-UY',
  { timeZone: TZ, weekday: 'long' }).format(d);
const fechaDe = (d: Date) => new Intl.DateTimeFormat('en-CA',
  { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/**
 * La próxima fecha que caiga en ese día de la semana (ISO: 1 = lunes),
 * al menos `minDias` días adelante.
 *
 * Las fechas de las pruebas TIENEN que ser relativas a hoy. Con fechas
 * fijas la suite caduca sola: un caso escrito para "el lunes 7" empieza
 * a fallar cuando llega el lunes 7, porque la agenda no ofrece nada
 * dentro de las próximas 2 horas. El código estaba bien y el test rojo.
 */
function proximoLunes(minDias = 3): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + minDias);
  for (let i = 0; i < 8; i++) {
    if ((d.getUTCDay() === 0 ? 7 : d.getUTCDay()) === 1) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

function masDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Todos los días salen del MISMO lunes futuro: así el sábado siempre
// cae después del lunes y dentro del rango que carga el contexto.
const LUNES     = proximoLunes();
const MARTES    = masDias(LUNES, 1);
const MIERCOLES = masDias(LUNES, 2);
const VIERNES   = masDias(LUNES, 4);
const SABADO    = masDias(LUNES, 5);
const DOMINGO   = masDias(LUNES, 6);

/** Un intervalo ocupado, escrito en hora local del negocio. */
function ocupa(fecha: string, desde: string, hasta: string, buffer_min?: number) {
  return {
    inicio: localAUTC(fecha, desde, TZ).toISOString(),
    fin: localAUTC(fecha, hasta, TZ).toISOString(),
    ...(buffer_min === undefined ? {} : { buffer_min }),
  };
}

async function main() {
  console.log('\n— zonas horarias —');
  const t = localAUTC('2026-09-08', '15:00', TZ);
  comprobar('15:00 en Montevideo es 18:00 UTC', t.toISOString() === '2026-09-08T18:00:00.000Z', t.toISOString());
  comprobar('y vuelve a leerse como 15:00', hhmm(t) === '15:00', hhmm(t));

  console.log('\n— reconocer el servicio —');
  comprobar('exacto', buscarServicio(SOLE, 'Depilación definitiva piernas completas')?.id === 's1');
  comprobar('sin acentos ni mayúsculas', buscarServicio(SOLE, 'depilacion definitiva axilas')?.id === 's2');
  comprobar('como lo escribe una clienta', buscarServicio(SOLE, 'limpieza facial')?.id === 's3');
  comprobar('algo que no existe da null', buscarServicio(SOLE, 'botox') === null);

  console.log('\n— huecos —');
  const desde = LUNES;
  const h1 = await buscarHuecos(sbFalso(), null, SOLE, SOLE.servicios[0], desde);
  comprobar('ofrece 3 horarios', h1.length === 3, String(h1.length));
  comprobar('todos dentro de 9 a 19',
    h1.every(h => hhmm(h.inicio) >= '09:00' && hhmm(h.inicio) < '19:00'),
    h1.map(h => hhmm(h.inicio)).join(' '));
  comprobar('separados entre sí',
    h1.every((h, i) => i === 0 || h.inicio.getTime() - h1[i - 1].inicio.getTime() >= 45 * 60_000),
    h1.map(h => hhmm(h.inicio)).join(' '));
  comprobar('un turno de 60 min entra antes de las 19',
    h1.every(h => hhmm(h.fin) <= '19:00'), h1.map(h => hhmm(h.fin)).join(' '));
  comprobar('reparte a lo largo del día, no solo a la mañana',
    hhmm(h1[0].inicio) < '11:00' && hhmm(h1[h1.length - 1].inicio) >= '16:00',
    h1.map(h => hhmm(h.inicio)).join(' '));
  comprobar('los horarios son en punto o y media',
    h1.every(h => ['00', '30'].includes(hhmm(h.inicio).slice(3))),
    h1.map(h => hhmm(h.inicio)).join(' '));

  // Sábado: tramo corto de 9 a 13. Igual tiene que repartir.
  const hSab = await buscarHuecos(sbFalso(), null, SOLE, SOLE.servicios[1], SABADO);
  const delSabado = hSab.filter(h => fechaDe(h.inicio) === SABADO);
  comprobar('en un tramo corto también reparte',
    delSabado.length === 3 && hhmm(delSabado[0].inicio) < '10:00'
      && hhmm(delSabado[2].inicio) >= '11:00',
    delSabado.map(h => hhmm(h.inicio)).join(' '));

  const h2 = await buscarHuecos(sbFalso(), null, SOLE, SOLE.servicios[0], DOMINGO);
  comprobar('nunca ofrece un domingo', h2.every(h => diaSem(h.inicio) !== 'domingo'),
    h2.map(h => diaSem(h.inicio)).join(' '));

  const h3 = await buscarHuecos(sbFalso({ feriados: [MARTES] }), null, SOLE, SOLE.servicios[0], MARTES);
  comprobar('salta un feriado que cierra',
    h3.every(h => fechaDe(h.inicio) !== MARTES),
    h3.map(h => fechaDe(h.inicio)).join(' '));

  const h4 = await buscarHuecos(
    sbFalso({ excepciones: { [LUNES]: { cerrado: false, desde: '15:00:00', hasta: '18:00:00' } } }),
    null, SOLE, SOLE.servicios[1], LUNES);
  const delLunes = h4.filter(h => fechaDe(h.inicio) === LUNES);
  comprobar('respeta un horario especial del cliente',
    delLunes.length > 0 && delLunes.every(h => hhmm(h.inicio) >= '15:00' && hhmm(h.inicio) < '18:00'),
    delLunes.map(h => hhmm(h.inicio)).join(' '));

  console.log('\n— franja y hora pedida —');
  const hTarde = await buscarHuecos(sbFalso(), null, SOLE, SOLE.servicios[0], MARTES,
    { ...FRANJAS.tarde });
  comprobar('"de tarde" solo devuelve horarios de tarde',
    hTarde.length > 0 && hTarde.every(h => hhmm(h.inicio) >= '13:00'),
    hTarde.map(h => hhmm(h.inicio)).join(' '));
  const hManana = await buscarHuecos(sbFalso(), null, SOLE, SOLE.servicios[0], MARTES,
    { ...FRANJAS['mañana'] });
  comprobar('"de mañana" solo devuelve horarios de mañana',
    hManana.length > 0 && hManana.every(h => hhmm(h.inicio) < '13:00'),
    hManana.map(h => hhmm(h.inicio)).join(' '));

  comprobar('las 17:00 están libres un martes normal',
    (await estaLibre(sbFalso(), null, SOLE, SOLE.servicios[0], localAUTC(MARTES, '17:00', TZ))) === true);

  // Si la hora pedida está ocupada, lo útil es lo más cercano.
  const ocupa17 = [ocupa(MARTES, '17:00', '18:00', 10)];
  const cerca = await buscarHuecos(sbFalso({ turnos: ocupa17 }), null, SOLE, SOLE.servicios[0], MARTES,
    { cercaDeMin: 17 * 60, diasMax: 1, cantidad: 2 });
  comprobar('lo más cercano a las 17 es cercano de verdad',
    cerca.length === 2 && cerca.every(h => Math.abs(
      Number(hhmm(h.inicio).slice(0, 2)) * 60 + Number(hhmm(h.inicio).slice(3)) - 17 * 60) <= 150),
    cerca.map(h => hhmm(h.inicio)).join(' '));

  console.log('\n— no pisar un turno existente —');
  const ocupado = [ocupa(LUNES, '09:00', '19:00')];
  const h5 = await buscarHuecos(sbFalso({ turnos: ocupado }), null, SOLE, SOLE.servicios[0], LUNES);
  comprobar('no ofrece nada del día ocupado',
    h5.every(h => fechaDe(h.inicio) !== '2026-09-07'),
    h5.map(h => fechaDe(h.inicio)).join(' '));

  const chocado = localAUTC(LUNES, '15:00', TZ);
  comprobar('estaLibre dice que no sobre un turno tomado',
    (await estaLibre(sbFalso({ turnos: ocupado }), null, SOLE, SOLE.servicios[0], chocado)) === false);
  comprobar('estaLibre dice que sí en un hueco real',
    (await estaLibre(sbFalso(), null, SOLE, SOLE.servicios[0], chocado)) === true);
  comprobar('estaLibre dice que no un domingo',
    (await estaLibre(sbFalso(), null, SOLE, SOLE.servicios[0], localAUTC(DOMINGO, '11:00', TZ))) === false);
  comprobar('estaLibre dice que no a las 18:30 para 60 min',
    (await estaLibre(sbFalso(), null, SOLE, SOLE.servicios[0], localAUTC(MARTES, '18:30', TZ))) === false);

  console.log('\n— el respiro entre turnos —');
  // Un turno de 13:00 a 14:00 con 10 minutos de buffer: el siguiente
  // NO puede empezar 14:00, sí puede 14:15.
  const conBuffer = [ocupa(MIERCOLES, '13:00', '14:00', 10)];
  comprobar('no deja empezar justo cuando termina el anterior',
    (await estaLibre(sbFalso({ turnos: conBuffer }), null, SOLE, SOLE.servicios[2],
      localAUTC(MIERCOLES, '14:00', TZ))) === false);
  comprobar('sí deja después del respiro',
    (await estaLibre(sbFalso({ turnos: conBuffer }), null, SOLE, SOLE.servicios[2],
      localAUTC(MIERCOLES, '14:15', TZ))) === true);
  comprobar('tampoco deja terminar encima del anterior',
    (await estaLibre(sbFalso({ turnos: conBuffer }), null, SOLE, SOLE.servicios[2],
      localAUTC(MIERCOLES, '12:30', TZ))) === false);
  const huecosBuf = await buscarHuecos(sbFalso({ turnos: conBuffer }), null, SOLE, SOLE.servicios[2], MIERCOLES);
  comprobar('no ofrece las 14:00 del día ocupado',
    !huecosBuf.some(h => fechaDe(h.inicio) === MIERCOLES && hhmm(h.inicio) === '14:00'),
    huecosBuf.map(h => hhmm(h.inicio)).join(' '));

  console.log('\n— el contexto se carga una sola vez —');
  let consultas = 0;
  const sbContado = {
    from(tabla: string) {
      consultas++;
      const api: any = {
        select: () => api, eq: () => api, in: () => api, lt: () => api, gt: () => api,
        gte: () => api, lte: () => api, order: () => api, limit: () => api,
        maybeSingle: async () => ({ data: null }),
        then: (r: any) => r({ data: [] }),
      };
      return api;
    },
  } as any;
  await buscarHuecos(sbContado, null, SOLE, SOLE.servicios[0], LUNES);
  comprobar('busca en 21 días con 3 consultas, no con 63', consultas === 3, `${consultas} consultas`);

  const ctx = await cargarContexto(sbFalso(), null, SOLE, LUNES, 7);
  comprobar('el contexto trae los 8 días del rango', ctx.tramos.size === 8, String(ctx.tramos.size));
  comprobar('el domingo queda sin tramos', (ctx.tramos.get(DOMINGO) ?? []).length === 0);
  comprobar('el sábado corta a las 13',
    (ctx.tramos.get(SABADO) ?? [])[0]?.hasta === 13 * 60);

  console.log('\n— identificar la conversación —');
  const envFalso = { PEPPER_TELEFONO: 'pepper-de-prueba-1234567890' } as any;
  const wa1 = await hashIdentificador(envFalso, '+598 99 123 456', 'whatsapp');
  const wa2 = await hashIdentificador(envFalso, '59899123456', 'whatsapp');
  comprobar('el mismo teléfono escrito distinto es la misma persona', wa1 === wa2);
  const web1 = await hashIdentificador(envFalso, 'web-a3f9x1', 'web');
  const web2 = await hashIdentificador(envFalso, 'web-b7k2z4', 'web');
  comprobar('dos visitantes web distintos NO comparten conversación', web1 !== web2);
  const web3 = await hashIdentificador(envFalso, 'web-aaaaaa', 'web');
  const web4 = await hashIdentificador(envFalso, 'web-bbbbbb', 'web');
  comprobar('tampoco si sus ids no tienen ningún dígito', web3 !== web4);
  comprobar('el mismo visitante vuelve a su conversación',
    web1 === await hashIdentificador(envFalso, 'web-a3f9x1', 'web'));
  comprobar('el hash tiene 64 caracteres', web1.length === 64, String(web1.length));

  console.log('\n— guarda de claves —');
  comprobar('reconoce una secret key nueva', esClaveSecreta('sb_secret_AbCd1234efgh'));
  comprobar('deja pasar una publishable', !esClaveSecreta('sb_publishable_AbCd1234efgh'));
  // JWT viejo de Supabase con role=service_role en el payload
  const jwtServicio = 'x.' + btoa(JSON.stringify({ role: 'service_role', iss: 'supabase' }))
    .replace(/=+$/, '') + '.y';
  comprobar('reconoce el service_role del esquema viejo', esClaveSecreta(jwtServicio));
  const jwtAnon = 'x.' + btoa(JSON.stringify({ role: 'anon', iss: 'supabase' }))
    .replace(/=+$/, '') + '.y';
  comprobar('deja pasar el anon del esquema viejo', !esClaveSecreta(jwtAnon));

  console.log('\n— prompt —');
  const sys = construirSystem(SOLE);
  comprobar('son dos bloques', sys.length === 2);
  comprobar('el bloque estable se cachea', sys[0].cache_control?.type === 'ephemeral');
  comprobar('la fecha va FUERA de la cache', sys[1].cache_control === undefined);
  comprobar('entra la base de conocimiento entera', sys[0].text.includes('Nunca dar consejo clínico'));
  comprobar('entran los precios', sys[0].text.includes('$U 2.900'));
  comprobar('entra el paquete', sys[0].text.includes('14.500'));
  comprobar('está la regla de la foto', /foto/i.test(sys[0].text));
  comprobar('está la prohibición de consejo clínico', /consejo clínico/i.test(sys[0].text));
  comprobar('prohíbe las viñetas', /viñetas/i.test(sys[0].text));
  comprobar('prohíbe agradecer y los emojis', /no uses emojis/i.test(sys[0].text));
  comprobar('ofrece agendar una sola vez', /una sola vez/i.test(sys[0].text));
  comprobar('prohíbe el saludo de cartel', /Bienvenido a Clínica Solé/.test(sys[0].text)
    && /es un cartel, no una persona/.test(sys[0].text));

  // ── Encontrar el turno del que se está hablando ───────────────
  //
  // El caso real del 8/9: el turno se agendó dictando "095023935" y
  // el recordatorio llegó por WhatsApp, donde Meta manda
  // "59895023935". Dos hashes para la misma persona. Buscar por
  // conversación lo encuentra igual.
  console.log('\n— buscar el turno vigente —');

  const AHORA = new Date();
  const futuro = (h: number) => new Date(AHORA.getTime() + h * 3600_000).toISOString();
  const pasado = (h: number) => new Date(AHORA.getTime() - h * 3600_000).toISOString();

  const CONV = 'conv-de-la-clienta';
  const CLIENTE = 'cli-sole';

  function sbTurnos(filas: any[]) {
    let pedidos = 0;
    const api = {
      pedidos: () => pedidos,
      from(tabla: string) {
        const f: any = { eq: {} as Record<string, any>, in: {} as Record<string, any[]>, gte: '' };
        const q: any = {
          select: () => q,
          eq: (col: string, val: any) => { f.eq[col] = val; return q; },
          in: (col: string, val: any[]) => { f.in[col] = val; return q; },
          gte: (_col: string, val: string) => { f.gte = val; return q; },
          order: () => q,
          limit: () => q,
          maybeSingle: async () => {
            pedidos++;
            if (tabla !== 'turnos') return { data: null };
            const halladas = filas
              .filter(r => Object.entries(f.eq).every(([c, v]) => r[c] === v))
              .filter(r => Object.entries(f.in).every(([c, v]) => (v as any[]).includes(r[c])))
              .filter(r => !f.gte || r.inicio >= f.gte)
              .sort((a, b) => a.inicio.localeCompare(b.inicio));
            return { data: halladas[0] ?? null };
          },
        };
        return q;
      },
    };
    return api;
  }

  const turnoDeLaConv = {
    id: 't-conv', cliente_id: CLIENTE, conversacion_id: CONV,
    telefono_hash: 'hash-viejo-del-dictado', estado: 'agendado',
    inicio: futuro(20), servicio_id: 's1', servicio_nombre: 'Limpieza facial profunda',
    calendar_event_id: null,
  };

  let sbT = sbTurnos([turnoDeLaConv]);
  let tv = await buscarTurnoVigente(sbT as any, CLIENTE,
    { conversacionId: CONV, hashes: ['hash-de-whatsapp'] });
  comprobar('lo encuentra por conversación aunque el hash del teléfono no coincida',
    tv?.id === 't-conv', String(tv?.id));
  comprobar('con la conversación alcanza: no busca por teléfono', sbT.pedidos() === 1,
    String(sbT.pedidos()));

  // Turno agendado por el chat web y retomado por WhatsApp: la
  // conversación es otra, el teléfono es lo único que los une.
  const turnoDeLaWeb = { ...turnoDeLaConv, id: 't-web', conversacion_id: 'conv-web',
    telefono_hash: 'hash-de-whatsapp' };
  sbT = sbTurnos([turnoDeLaWeb]);
  tv = await buscarTurnoVigente(sbT as any, CLIENTE,
    { conversacionId: CONV, hashes: ['hash-de-whatsapp'] });
  comprobar('si por conversación no aparece, cae al teléfono', tv?.id === 't-web', String(tv?.id));
  comprobar('y para eso sí hace las dos consultas', sbT.pedidos() === 2, String(sbT.pedidos()));

  tv = await buscarTurnoVigente(sbTurnos([turnoDeLaConv]) as any, CLIENTE,
    { conversacionId: null, hashes: ['no-es-ninguno'] });
  comprobar('sin conversación ni hash que coincida, no inventa', tv === null);

  tv = await buscarTurnoVigente(sbTurnos([turnoDeLaConv]) as any, CLIENTE,
    { conversacionId: CONV, hashes: [] });
  comprobar('sin teléfono, la conversación sola sirve', tv?.id === 't-conv');

  // Aislamiento: el turno es de otra clínica.
  tv = await buscarTurnoVigente(sbTurnos([turnoDeLaConv]) as any, 'otra-clinica',
    { conversacionId: CONV, hashes: ['hash-viejo-del-dictado'] });
  comprobar('nunca cruza el turno de otro cliente', tv === null);

  // Un turno que ya pasó no es "el próximo".
  tv = await buscarTurnoVigente(
    sbTurnos([{ ...turnoDeLaConv, inicio: pasado(2) }]) as any, CLIENTE,
    { conversacionId: CONV, hashes: [] });
  comprobar('un turno que ya pasó no cuenta', tv === null);

  // Cancelado tampoco.
  tv = await buscarTurnoVigente(
    sbTurnos([{ ...turnoDeLaConv, estado: 'cancelado' }]) as any, CLIENTE,
    { conversacionId: CONV, hashes: [] });
  comprobar('un turno cancelado no cuenta', tv === null);

  // Confirmar tiene que VER el ya confirmado para contestar bien si
  // tocan el botón dos veces; reprogramar también.
  tv = await buscarTurnoVigente(
    sbTurnos([{ ...turnoDeLaConv, estado: 'confirmado' }]) as any, CLIENTE,
    { conversacionId: CONV, hashes: [] });
  comprobar('un turno ya confirmado sí se encuentra', tv?.estado === 'confirmado');

  // Dos turnos futuros: gana el más próximo.
  tv = await buscarTurnoVigente(sbTurnos([
    { ...turnoDeLaConv, id: 't-lejos', inicio: futuro(200) },
    { ...turnoDeLaConv, id: 't-cerca', inicio: futuro(5) },
  ]) as any, CLIENTE, { conversacionId: CONV, hashes: [] });
  comprobar('con dos turnos futuros agarra el más próximo', tv?.id === 't-cerca', String(tv?.id));

  // El orden de los teléfonos importa: primero el que dijo el modelo
  // (el turno puede estar a nombre de otra persona).
  sbT = sbTurnos([
    { ...turnoDeLaConv, id: 't-hija', conversacion_id: null, telefono_hash: 'hash-hija' },
    { ...turnoDeLaConv, id: 't-madre', conversacion_id: null, telefono_hash: 'hash-madre',
      inicio: futuro(3) },
  ]);
  tv = await buscarTurnoVigente(sbT as any, CLIENTE,
    { conversacionId: null, hashes: ['hash-hija', 'hash-madre'] });
  comprobar('respeta el orden de los teléfonos: primero el que dijo el modelo',
    tv?.id === 't-hija', String(tv?.id));

  comprobar('trae las columnas que hacen falta para reprogramar',
    typeof tv?.servicio_id === 'string' && typeof tv?.servicio_nombre === 'string'
    && 'calendar_event_id' in (tv as any));

  // ── Ofrecer y tomar no son lo mismo ───────────────────────────
  //
  // No se OFRECE nada dentro de las próximas 2 h: empujar a alguien a
  // un turno que probablemente no pueda cumplir es un mal servicio.
  // Pero si lo PIDE, se toma: ya sabe que puede ir, y negárselo es
  // perder un turno real por una regla nuestra. La asimetría es a
  // propósito.
  console.log('\n— ofrecer vs. tomar —');

  const ahoraFijo = new Date('2026-09-09T13:07:00Z'); // 10:07 en Montevideo
  const enHoras = (h: number) => new Date(ahoraFijo.getTime() + h * 3600_000);

  comprobar('lo que está dentro de las 2 h no se ofrece',
    sobreLaHora(enHoras(1.9), ahoraFijo) === true);
  comprobar('justo en el límite ya se ofrece',
    sobreLaHora(enHoras(ANTICIPACION_H), ahoraFijo) === false);
  comprobar('los huecos que salen respetan esa regla',
    h1.every(x => !sobreLaHora(x.inicio)), h1.map(x => hhmm(x.inicio)).join(' '));
  comprobar('pero pedir dentro de esa franja NO está prohibido: no pasó',
    yaPaso(enHoras(1.9), ahoraFijo) === false);

  // Lo que sí es imposible: agendar en el pasado. estaLibre mira el
  // horario de atención y los choques, no el reloj.
  comprobar('una hora que ya pasó no se puede', yaPaso(enHoras(-1), ahoraFijo) === true);
  comprobar('"hoy a las 9" siendo las 10:07',
    yaPaso(new Date('2026-09-09T12:00:00Z'), ahoraFijo) === true);
  comprobar('ahora mismo tampoco', yaPaso(ahoraFijo, ahoraFijo) === true);
  comprobar('dentro de un minuto sí', yaPaso(enHoras(1 / 60), ahoraFijo) === false);
  comprobar('mañana, obviamente', yaPaso(enHoras(24), ahoraFijo) === false);

  // ── El motivo del aviso de derivación ─────────────────────────
  console.log('\n— el motivo del aviso —');
  comprobar('saca el punto final para que no queden dos',
    limpiarMotivo('no se encuentra turno futuro asociado a su número.')
      === 'no se encuentra turno futuro asociado a su número');
  comprobar('no toca un motivo sin punto',
    limpiarMotivo('pidió hablar con alguien') === 'pidió hablar con alguien');
  comprobar('saca varios puntos y los puntos suspensivos',
    limpiarMotivo('no sé qué hacer...') === 'no sé qué hacer');
  comprobar('aplasta los saltos de línea (Meta rechaza la variable)',
    limpiarMotivo('pidió\n\nreprogramar  el turno') === 'pidió reprogramar el turno');
  comprobar('un motivo vacío no manda una variable vacía',
    limpiarMotivo('   ') === 'el asistente no pudo resolverlo');
  comprobar('recorta a 200 y no deja un punto colgando',
    (() => { const l = limpiarMotivo('a'.repeat(199) + '. y sigue'); return l.length <= 200
      && !l.endsWith('.'); })());

  console.log(`\n${ok} bien, ${mal} mal\n`);
  process.exit(mal === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
