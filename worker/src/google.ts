import type { Env } from './tipos';

/**
 * Google Calendar desde un Worker, sin librerias.
 *
 * `googleapis` no corre en Workers (asume Node), asi que se firma el
 * JWT a mano con WebCrypto y se habla con la REST API por fetch. Son
 * unas cien lineas y evita arrastrar 20 MB de dependencias.
 *
 * Autenticacion: CUENTA DE SERVICIO, no OAuth por cliente. El dueño
 * comparte su calendario con la direccion de la cuenta de servicio y
 * listo. OAuth habria significado el tramite de verificacion de Google
 * y, peor, refresh tokens que expiran a los 7 dias mientras la app
 * este en estado Testing: cada semana se caerian todas las agendas
 * juntas.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar';

export function hayGoogle(env: Env): boolean {
  return Boolean(env.GOOGLE_SA_EMAIL?.trim() && env.GOOGLE_SA_PRIVATE_KEY?.trim());
}

// ── JWT ─────────────────────────────────────────────────────────

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function textoAB64url(t: string): string {
  return b64url(new TextEncoder().encode(t));
}

/** PEM a ArrayBuffer. Tolera la clave con \n escapados, que es como
 *  queda al pegarla desde el JSON en un archivo de variables. */
function pemADer(pem: string): ArrayBuffer {
  const limpio = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(limpio);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// Cache del token en memoria del isolate. Dura una hora; se renueva
// un minuto antes para no cortarse en el medio de una peticion.
let tokenCache: { token: string; vence: number } | null = null;

export async function tokenGoogle(env: Env): Promise<string> {
  if (tokenCache && tokenCache.vence > Date.now()) return tokenCache.token;

  if (!hayGoogle(env)) {
    throw new Error('Faltan GOOGLE_SA_EMAIL o GOOGLE_SA_PRIVATE_KEY.');
  }
  const ahora = Math.floor(Date.now() / 1000);
  const header = textoAB64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = textoAB64url(JSON.stringify({
    iss: env.GOOGLE_SA_EMAIL!.trim(),
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: ahora,
    exp: ahora + 3600,
  }));

  const clave = await crypto.subtle.importKey(
    'pkcs8', pemADer(env.GOOGLE_SA_PRIVATE_KEY!),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const firma = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', clave, new TextEncoder().encode(`${header}.${claims}`),
  );
  const jwt = `${header}.${claims}.${b64url(new Uint8Array(firma))}`;

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!r.ok) throw new Error(`Google token ${r.status}: ${(await r.text()).slice(0, 300)}`);

  const j = await r.json() as { access_token: string; expires_in: number };
  tokenCache = { token: j.access_token, vence: Date.now() + (j.expires_in - 60) * 1000 };
  return j.access_token;
}

async function llamar(env: Env, ruta: string, init: RequestInit = {}): Promise<any> {
  const token = await tokenGoogle(env);
  const r = await fetch(`${API}${ruta}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
  if (r.status === 204) return null;
  if (!r.ok) throw new Error(`Google Calendar ${r.status} en ${ruta}: ${(await r.text()).slice(0, 300)}`);
  return await r.json();
}

// ── Lo que usa la agenda ────────────────────────────────────────

/**
 * Intervalos ocupados del calendario del negocio.
 * Se pide con freeBusy y no listando eventos: devuelve solo los
 * horarios, sin titulos ni invitados. Menos datos ajenos en el
 * sistema es mejor, sobre todo en un rubro con datos de salud.
 */
export async function ocupadoEnCalendar(
  env: Env, calendarId: string, desde: Date, hasta: Date,
): Promise<Array<{ inicio: number; fin: number }>> {
  const j = await llamar(env, '/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin: desde.toISOString(),
      timeMax: hasta.toISOString(),
      items: [{ id: calendarId }],
    }),
  });

  const cal = j?.calendars?.[calendarId];
  if (cal?.errors?.length) {
    throw new Error(
      `El calendario "${calendarId}" no se puede leer (${cal.errors[0]?.reason}). ` +
      `Revisá que esté compartido con ${env.GOOGLE_SA_EMAIL} con permiso para hacer cambios.`,
    );
  }
  return (cal?.busy ?? []).map((b: { start: string; end: string }) => ({
    inicio: new Date(b.start).getTime(),
    fin: new Date(b.end).getTime(),
  }));
}

export async function crearEvento(env: Env, calendarId: string, ev: {
  titulo: string; descripcion: string; inicio: Date; fin: Date; timezone: string;
}): Promise<string> {
  const j = await llamar(env, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify({
      summary: ev.titulo,
      description: ev.descripcion,
      start: { dateTime: ev.inicio.toISOString(), timeZone: ev.timezone },
      end: { dateTime: ev.fin.toISOString(), timeZone: ev.timezone },
    }),
  });
  return j.id as string;
}

export async function moverEvento(
  env: Env, calendarId: string, eventoId: string, inicio: Date, fin: Date, timezone: string,
): Promise<void> {
  await llamar(env, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventoId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      start: { dateTime: inicio.toISOString(), timeZone: timezone },
      end: { dateTime: fin.toISOString(), timeZone: timezone },
    }),
  });
}

export async function borrarEvento(env: Env, calendarId: string, eventoId: string): Promise<void> {
  const token = await tokenGoogle(env);
  const r = await fetch(
    `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventoId)}`,
    { method: 'DELETE', headers: { authorization: `Bearer ${token}` } },
  );
  // 404 o 410 = ya no está. Es el resultado que queríamos.
  if (!r.ok && r.status !== 404 && r.status !== 410) {
    throw new Error(`Google Calendar ${r.status} al borrar el evento`);
  }
}
