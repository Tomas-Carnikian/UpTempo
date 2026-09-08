import type { Env } from './tipos';

/**
 * Revision de las variables de entorno.
 *
 * Existe porque los errores de credenciales mal pegadas son horribles
 * de diagnosticar: Supabase contesta "Invalid header value" y no te
 * dice cual de las cuatro claves esta mal ni por que. Esto lo dice,
 * y NUNCA muestra el valor.
 */

export interface Problema { clave: string; que: string; }

interface Regla {
  clave: keyof Env;
  minimo: number;
  prefijo?: string;
  pista?: string;
  /** true = puede tener saltos de línea (una clave PEM los tiene). */
  multilinea?: boolean;
}

const REGLAS: Regla[] = [
  { clave: 'SUPABASE_URL', minimo: 20, prefijo: 'https://',
    pista: 'Project Settings → API Keys. Es la URL del proyecto, no la del dashboard.' },
  { clave: 'SUPABASE_SERVICE_ROLE_KEY', minimo: 20,
    pista: 'Tiene que ser la SECRET key (sb_secret_… o el service_role viejo). ' +
           'La publishable (sb_publishable_…) no sirve: no puede escribir.' },
  { clave: 'ANTHROPIC_API_KEY', minimo: 20, prefijo: 'sk-ant-',
    pista: 'console.anthropic.com → Settings → API keys. Se muestra una sola vez.' },
  { clave: 'PEPPER_TELEFONO', minimo: 16,
    pista: 'Lo inventás vos una vez. En PowerShell: ' +
           "-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })" },
];

/**
 * Google es opcional: sin estas dos, el asistente funciona igual pero
 * no mira ni escribe en ningun calendario. Se revisan solo si estan.
 */
const REGLAS_OPCIONALES: Regla[] = [
  { clave: 'SUPABASE_PUBLISHABLE_KEY', minimo: 20,
    pista: 'Es la PUBLISHABLE key (sb_publishable_…), la pública. Se imprime en el HTML del panel.' },
  { clave: 'GOOGLE_SA_EMAIL', minimo: 10,
    pista: 'Es el client_email del JSON de la cuenta de servicio, algo@algo.iam.gserviceaccount.com' },
  { clave: 'GOOGLE_SA_PRIVATE_KEY', minimo: 100, multilinea: true,
    pista: 'Es la private_key del JSON, completa, incluyendo las líneas BEGIN y END.' },
  { clave: 'WA_TOKEN', minimo: 40,
    pista: 'Token de acceso de la app de Meta (System User token, o el temporal de 24 h para probar).' },
  { clave: 'WA_VERIFY_TOKEN', minimo: 16,
    pista: 'Lo inventás vos y lo pegás igual en Meta al configurar el webhook.' },
  { clave: 'WA_APP_SECRET', minimo: 16,
    pista: 'App Secret de la app de Meta (Configuración → Básica). Valida la firma de cada webhook.' },
];

/** Las tres de WhatsApp van juntas o no va ninguna. */
const TRIO_WA: Array<keyof Env> = ['WA_TOKEN', 'WA_VERIFY_TOKEN', 'WA_APP_SECRET'];

const PLACEHOLDERS = ['pegar-aca', 'sb_secret_...', 'sk-ant-...', '...'];

export function revisarEnv(env: Env): Problema[] {
  const problemas: Problema[] = [];

  // Si cargaste una de las dos de Google, tienen que estar las dos.
  const gMail = env.GOOGLE_SA_EMAIL?.trim();
  const gKey = env.GOOGLE_SA_PRIVATE_KEY?.trim();
  if (Boolean(gMail) !== Boolean(gKey)) {
    problemas.push({
      clave: gMail ? 'GOOGLE_SA_PRIVATE_KEY' : 'GOOGLE_SA_EMAIL',
      que: 'falta. Las dos de Google van juntas o no va ninguna.',
    });
  }
  if (gKey && !gKey.includes('BEGIN PRIVATE KEY')) {
    problemas.push({
      clave: 'GOOGLE_SA_PRIVATE_KEY',
      que: 'no parece una clave PEM: tiene que incluir la línea -----BEGIN PRIVATE KEY-----. ' +
           'Copiala completa del JSON, entre comillas dobles y con los \\n tal como vienen.',
    });
  }

  // WhatsApp a medio configurar es peor que sin configurar: el webhook
  // acepta mensajes y no los puede contestar, o no valida la firma.
  const cargadas = TRIO_WA.filter(k => (env as any)[k]?.trim());
  if (cargadas.length > 0 && cargadas.length < TRIO_WA.length) {
    for (const k of TRIO_WA) {
      if (!(env as any)[k]?.trim()) {
        problemas.push({ clave: k, que: 'falta. Las tres de WhatsApp van juntas o no va ninguna.' });
      }
    }
  }

  const activas = [...REGLAS, ...REGLAS_OPCIONALES.filter(r => (env as any)[r.clave])];

  for (const r of activas) {
    const bruto = (env as any)[r.clave] as string | undefined;

    if (bruto === undefined || bruto === null || bruto === '') {
      problemas.push({ clave: r.clave, que: `falta. ${r.pista ?? ''}`.trim() });
      continue;
    }

    if (!r.multilinea && bruto !== bruto.trim()) {
      problemas.push({ clave: r.clave, que: 'tiene espacios o un salto de línea al principio o al final.' });
    }
    const v = bruto.trim();

    if (PLACEHOLDERS.some(p => v === p) || v.endsWith('...')) {
      problemas.push({ clave: r.clave, que: `sigue con el valor de ejemplo. ${r.pista ?? ''}`.trim() });
      continue;
    }

    // Lo que rompe las cabeceras HTTP: caracteres de control y no-ASCII.
    // La clave PEM no va en una cabecera, asi que puede tener saltos.
    const raros = [...v].filter(c => {
      const n = c.codePointAt(0)!;
      if (r.multilinea && (n === 0x0a || n === 0x0d)) return false;
      return n < 0x20 || n > 0x7e;
    });
    if (raros.length) {
      const primero = raros[0].codePointAt(0)!;
      const hex = 'U+' + primero.toString(16).toUpperCase().padStart(4, '0');
      const pista = primero === 0x2022
        ? ' Son los puntitos con los que Supabase tapa la clave: hay que revelarla o usar el botón de copiar antes de pegarla.'
        : primero === 0x0a || primero === 0x0d
        ? ' Es un salto de línea: la clave quedó cortada en dos líneas.'
        : '';
      problemas.push({
        clave: r.clave,
        que: `tiene ${raros.length} carácter(es) que no pueden ir en una cabecera HTTP. ` +
             `El primero es ${hex}.${pista}`,
      });
      continue;
    }

    if (v.length < r.minimo) {
      problemas.push({ clave: r.clave, que: `es demasiado corta (${v.length} caracteres). ${r.pista ?? ''}`.trim() });
      continue;
    }

    if (r.prefijo && !v.startsWith(r.prefijo)) {
      problemas.push({ clave: r.clave, que: `no empieza con "${r.prefijo}". ${r.pista ?? ''}`.trim() });
      continue;
    }

    if (r.clave === 'SUPABASE_SERVICE_ROLE_KEY' && v.startsWith('sb_publishable_')) {
      problemas.push({ clave: r.clave, que: 'es la publishable key, no la secret. La publishable no puede escribir en la base.' });
    }

    // La inversa es MUCHO peor: esta clave se imprime en el HTML del
    // panel. Una secret key acá queda publicada en una página web.
    if (r.clave === 'SUPABASE_PUBLISHABLE_KEY' && esClaveSecreta(v)) {
      problemas.push({
        clave: r.clave,
        que: 'parece una clave SECRETA, y esta variable se imprime en el HTML del panel. ' +
             'Poné la publishable (sb_publishable_…). Y rotá la secreta que cargaste por error: ' +
             'un secreto que estuvo en el lugar equivocado se rota, no se corrige.',
      });
    }
  }

  return problemas;
}

/**
 * ¿Este valor parece una credencial que NO puede hacerse pública?
 * Cubre el esquema nuevo de Supabase (sb_secret_…) y el viejo, donde
 * la service_role era un JWT con el rol adentro del payload.
 */
export function esClaveSecreta(v: string): boolean {
  if (v.startsWith('sb_secret_')) return true;
  const partes = v.split('.');
  if (partes.length === 3) {
    try {
      const payload = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload?.role === 'service_role') return true;
    } catch { /* no era un JWT legible */ }
  }
  return false;
}

/** Texto para mostrar en pantalla. No incluye ningún valor. */
export function textoProblemas(problemas: Problema[]): string {
  return 'Hay un problema con las claves de .dev.vars:\n\n' +
    problemas.map(p => `  ${p.clave}\n    ${p.que}`).join('\n\n') +
    '\n\nCorregí .dev.vars y guardá: wrangler recarga solo.\n' +
    'Ningún valor se muestra acá a propósito.\n';
}
