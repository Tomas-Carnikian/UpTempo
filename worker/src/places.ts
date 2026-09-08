import type { Env } from './tipos';
import { slugificar, nombreDeNegocio, type Ficha, type HorarioFicha } from './extraccion';

/**
 * Paso 9.4 — Google Places como fuente de la ficha.
 *
 * Places es la mejor fuente para un negocio local y la unica
 * estructurada: nombre, direccion, telefono, horarios, sitio y
 * coordenadas. Y resuelve el caso mas comun en Montevideo, la clinica
 * que no tiene web y solo tiene Instagram: en Google Maps igual esta.
 *
 * REPARTO DE TAREAS, y no se negocia:
 *   - Places manda en direccion, telefono, horarios y coordenadas. Es
 *     dato estructurado, no interpretado por un modelo.
 *   - El sitio web manda en servicios y precios. Places no los tiene.
 *
 * Se usa la API NUEVA (places.googleapis.com/v1). La vieja
 * (maps.googleapis.com/maps/api/place) esta en retiro y tiene otros
 * endpoints y otro formato.
 */

const BUSQUEDA = 'https://places.googleapis.com/v1/places:searchText';

/**
 * Lo que se pide. Cada campo se cobra, asi que se piden estos y no
 * "todos": el FieldMask es lo que separa una busqueda barata de una
 * cara, y pedir de mas no avisa — llega en la factura.
 */
const CAMPOS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.location',
  'places.regularOpeningHours.periods',
  'places.primaryTypeDisplayName',
  'places.businessStatus',
  'nextPageToken',
].join(',');

/** Tope duro por lote. 20 es lo que devuelve una pagina de Places. */
export const MAX_POR_LOTE = 20;

export interface Lugar {
  place_id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  sitio: string | null;
  maps_url: string | null;
  lat: number | null;
  lon: number | null;
  horarios: HorarioFicha[];
  rubro: string | null;
  abierto: boolean;
}

export function hayPlaces(env: Env): boolean {
  return Boolean(env.GOOGLE_PLACES_KEY?.trim());
}

/**
 * Los `periods` de Places a los horarios de la base.
 *
 * OJO CON EL DIA: Places usa 0 = domingo … 6 = sabado, y la base usa
 * ISO, 1 = lunes … 7 = domingo. Sin esta conversion todos los horarios
 * quedan corridos un dia y la agenda ofrece turnos cuando el negocio
 * esta cerrado — un error que no se ve hasta que alguien va.
 */
export function horariosDePlaces(periods: any[]): HorarioFicha[] {
  const salida: HorarioFicha[] = [];
  for (const p of periods ?? []) {
    const d = p?.open?.day;
    if (typeof d !== 'number') continue;
    // Sin `close` el lugar abre 24 h: no es un tramo agendable y
    // meterlo como 00:00-23:59 haria ofrecer turnos a las 4 de la
    // mañana. Se ignora y el horario se corrige a mano en el alta.
    if (!p?.close) continue;

    const dia = d === 0 ? 7 : d;
    const hh = (x: any) => String(x ?? 0).padStart(2, '0');
    const desde = `${hh(p.open.hour)}:${hh(p.open.minute)}:00`;
    const hasta = `${hh(p.close.hour)}:${hh(p.close.minute)}:00`;
    // Un tramo que cruza la medianoche no sirve para una clinica de
    // turnos y romperia el check (desde < hasta) de la base.
    if (desde >= hasta) continue;
    salida.push({ dia_semana: dia, desde, hasta });
  }
  return salida;
}

function aLugar(p: any): Lugar | null {
  const id = p?.id;
  const nombre = p?.displayName?.text;
  if (!id || !nombre) return null;
  return {
    place_id: id,
    nombre: String(nombre).trim(),
    direccion: p?.formattedAddress ?? null,
    telefono: p?.nationalPhoneNumber ?? null,
    sitio: p?.websiteUri ?? null,
    maps_url: p?.googleMapsUri ?? null,
    lat: typeof p?.location?.latitude === 'number' ? p.location.latitude : null,
    lon: typeof p?.location?.longitude === 'number' ? p.location.longitude : null,
    horarios: horariosDePlaces(p?.regularOpeningHours?.periods ?? []),
    rubro: p?.primaryTypeDisplayName?.text ?? null,
    abierto: p?.businessStatus !== 'CLOSED_PERMANENTLY',
  };
}

export async function buscarLugares(
  env: Env, busqueda: string, max = MAX_POR_LOTE,
): Promise<Lugar[]> {
  if (!hayPlaces(env)) {
    throw new Error('Falta GOOGLE_PLACES_KEY. Cargala con: npx wrangler secret put GOOGLE_PLACES_KEY');
  }

  const r = await fetch(BUSQUEDA, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': env.GOOGLE_PLACES_KEY!.trim(),
      'X-Goog-FieldMask': CAMPOS,
    },
    body: JSON.stringify({
      textQuery: busqueda,
      languageCode: 'es',
      regionCode: 'UY',
      maxResultCount: Math.min(max, MAX_POR_LOTE),
    }),
  });

  if (!r.ok) {
    const detalle = (await r.text()).slice(0, 400);
    if (r.status === 403) {
      throw new Error(
        `Places contestó 403. Casi siempre es una de dos: la clave está restringida a otra ` +
        `API, o habilitaste "Places API" en vez de "Places API (New)". Detalle: ${detalle}`);
    }
    throw new Error(`Places ${r.status}: ${detalle}`);
  }

  const j = await r.json() as { places?: any[] };
  return (j.places ?? [])
    .map(aLugar)
    .filter((l): l is Lugar => l !== null)
    // Un local cerrado para siempre no es un cliente posible, y
    // mandarle una demo es la peor primera impresion.
    .filter(l => l.abierto)
    .slice(0, max);
}

/**
 * Junta lo del sitio web con lo de Places.
 *
 * `web` puede ser null: es la clinica que solo tiene Instagram. En ese
 * caso sale una ficha sin servicios, que es una demo debil pero
 * honesta — y el gancho igual no son los precios, es que conteste a
 * las 23:40.
 */
export function combinar(lugar: Lugar, web: Ficha | null): Ficha {
  const base: Ficha = web ?? {
    nombre: lugar.nombre,
    slug: '',
    rubro: null,
    descripcion_corta: null,
    direccion: null,
    telefono_display: null,
    formas_pago: null,
    servicios: [],
    horarios: [],
    base_conocimiento: '',
    origen: { url: null, paginas: [], caracteres: 0, precios_descartados: [] },
  };

  return {
    ...base,
    // El nombre de Places es el que la gente busca en Maps. El del
    // sitio suele ser un slogan o el nombre de una promo.
    nombre: nombreDeNegocio(lugar.nombre || base.nombre),
    // El slug SIEMPRE se recalcula del nombre final. Antes se
    // heredaba el del sitio web y salian dos cosas mal: si la web no
    // se pudo leer, el slug venia VACIO ("Clínica ALMA LÁSER" quedo
    // como uy0.uptempo.uy), y si se pudo leer pero Places tenia otro
    // nombre, el slug era de un negocio y el nombre de otro
    // (depilifewtc.uptempo.uy mostrando "DepiLife Tres Cruces").
    slug: slugificar(lugar.nombre || base.nombre),
    rubro: base.rubro ?? lugar.rubro,
    // Estructurado le gana a interpretado, siempre.
    direccion: lugar.direccion ?? base.direccion,
    telefono_display: lugar.telefono ?? base.telefono_display,
    horarios: lugar.horarios.length ? lugar.horarios : base.horarios,
    lat: lugar.lat,
    lon: lugar.lon,
    google_place_id: lugar.place_id,
    maps_url: lugar.maps_url,
    origen: {
      ...base.origen,
      places: lugar.place_id,
    },
  } as Ficha;
}
