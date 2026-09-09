import { aRgb, luminancia } from './color';

/**
 * El color de marca de un negocio, sacado de su propio sitio.
 *
 * POR QUE NO LO HACE EL MODELO. Los colores viven en el CSS, y para
 * cuando el modelo ve el sitio ya pasó por limpiarHtml, que deja texto
 * plano: no hay un solo hex ahi. Se le podria mandar el CSS crudo,
 * pero pedirle a un modelo que devuelva un color es pedirle que
 * invente uno — es exactamente el error de los precios, y la defensa
 * tiene que ser la misma: el dato sale del origen o no sale.
 *
 * Asi que esto es determinista y trabaja sobre el HTML CRUDO, antes de
 * limpiarlo. No cuesta una llamada al modelo.
 *
 * Y cuando no encuentra nada, no inventa: devuelve null y dice por
 * que. Una demo con el color por defecto es peor que una con el color
 * del negocio, pero es muchisimo mejor que una con un color inventado
 * que no es el de nadie.
 */

/** De donde salio el color, para poder revisarlo a ojo. */
export type FuenteColor = 'theme-color' | 'variable-css' | 'frecuencia' | 'ninguna';

export interface ColorDeMarca {
  /** null = no habia ningun candidato que fuera un color de marca. */
  color: string | null;
  fuente: FuenteColor;
  /** Que se miro y por que se descarto. Es lo que se revisa a ojo. */
  nota: string;
}

/**
 * Nombres de variable CSS que un sitio usa para SU color, no para un
 * gris de texto. Es la segunda mejor pista despues de theme-color.
 *
 * OJO con `color` a secas: estaba en esta lista y fue un error caro.
 * WordPress mete su paleta entera en :root de todo sitio con el editor
 * de bloques, con nombres del estilo --wp--preset--color--pale-pink.
 * Eso contiene "color", asi que matcheaba; las tres primeras de la
 * paleta son neutras y las descarta el filtro de croma, y la cuarta
 * —#f78da7, el rosa palido de WordPress— ganaba. Tres clinicas de
 * Montevideo sin relacion entre si quedaron con el MISMO color, que es
 * exactamente el efecto de "plantilla con mi nombre" que la demo tiene
 * que evitar.
 */
const NOMBRE_DE_MARCA =
  /(^|[-_])(primary|primario|brand|marca|accent|acento|principal|main|theme)([-_]|$)/i;

/**
 * Y aunque el nombre parezca de marca, esto NO es la marca: es una
 * paleta que trae el framework. WordPress, Bootstrap y Tailwind
 * declaran decenas de colores que no eligio nadie del negocio.
 */
const PALETA_AJENA = /preset|palette|paleta|swatch|^wp--|--wp--|^tw-|^bs-|bootstrap/i;

/**
 * Cuanto color tiene que tener un color para ser una marca.
 *
 * `croma` es la distancia entre el canal mas alto y el mas bajo, en
 * 0-255. Es el filtro que hace todo el trabajo: en cualquier web, el
 * 90% de los hex son texto, bordes y sombras, o sea grises. Un gris
 * tiene croma casi cero por definicion.
 *
 * 40 deja pasar un azul apagado o un verde oliva —que son marcas
 * reales— y descarta #1f2937 (croma 24), que es el gris pizarra que
 * justamente tenemos de valor por defecto.
 */
const CROMA_MINIMO = 40;
/** Ni el negro del texto ni el blanco del fondo son la marca. */
const LUZ_MINIMA = 0.03;
const LUZ_MAXIMA = 0.90;

function croma(rgb: [number, number, number]): number {
  return Math.max(...rgb) - Math.min(...rgb);
}

/** ¿Este color puede ser el de una marca, o es un gris de interfaz? */
export function esColorDeMarca(hex: string): boolean {
  const rgb = aRgb(hex);
  if (!rgb) return false;
  if (croma(rgb) < CROMA_MINIMO) return false;
  const l = luminancia(rgb);
  return l >= LUZ_MINIMA && l <= LUZ_MAXIMA;
}

const aHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v)))
    .toString(16).padStart(2, '0')).join('');

/**
 * Un color escrito de cualquiera de las formas que usa la web, a hex.
 * Devuelve null si no es un color o si es transparente.
 */
export function aHexNormal(valor: string): string | null {
  const v = String(valor ?? '').trim().toLowerCase();

  const hex = v.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const d = hex[1];
    if (d.length === 3 || d.length === 4) {
      const [r, g, b] = d.slice(0, 3).split('').map(c => parseInt(c + c, 16));
      return aHex(r, g, b);
    }
    if (d.length === 6 || d.length === 8) {
      return aHex(parseInt(d.slice(0, 2), 16), parseInt(d.slice(2, 4), 16), parseInt(d.slice(4, 6), 16));
    }
    return null;
  }

  const rgb = v.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const p = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.slice(0, 3).some(Number.isNaN)) return null;
    if (p.length >= 4 && p[3] < 0.5) return null;  // casi transparente
    return aHex(p[0], p[1], p[2]);
  }

  // hsl() aparece bastante en sitios modernos.
  const hsl = v.match(/^hsla?\(([^)]+)\)$/);
  if (hsl) {
    const p = hsl[1].replace(/%/g, '').split(/[,\s/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.slice(0, 3).some(Number.isNaN)) return null;
    if (p.length >= 4 && p[3] < 0.5) return null;
    const [h, s, l] = [((p[0] % 360) + 360) % 360, p[1] / 100, p[2] / 100];
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const t: number[] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
                      : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return aHex((t[0] + m) * 255, (t[1] + m) * 255, (t[2] + m) * 255);
  }

  return null;
}

const COLOR_SUELTO = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]{5,40}\)|hsla?\([^)]{5,40}\)/g;

/**
 * El color de marca de un sitio, del HTML crudo de sus paginas.
 *
 * Tres fuentes, en orden de confianza:
 *   1. <meta name="theme-color">, que es el sitio declarando su color.
 *   2. una variable CSS que se llame como una marca.
 *   3. el color no-gris que mas veces aparece.
 */
export function colorDeMarca(htmlCrudo: string | string[]): ColorDeMarca {
  const paginas = (Array.isArray(htmlCrudo) ? htmlCrudo : [htmlCrudo])
    .map(h => String(h ?? '').slice(0, 400_000));
  const todo = paginas.join('\n');

  const descartados = new Set<string>();
  const anotar = (hex: string | null) => { if (hex) descartados.add(hex); };

  // ── 1. theme-color ───────────────────────────────────────────
  for (const m of todo.matchAll(/<meta[^>]*>/gi)) {
    const tag = m[0];
    if (!/name\s*=\s*["']?theme-color/i.test(tag)) continue;
    const c = tag.match(/content\s*=\s*["']([^"']+)["']/i);
    const hex = c ? aHexNormal(c[1]) : null;
    if (hex && esColorDeMarca(hex)) {
      return { color: hex, fuente: 'theme-color',
               nota: 'lo declara el propio sitio en <meta name="theme-color">' };
    }
    anotar(hex);
  }

  // ── 2. variables CSS con nombre de marca ─────────────────────
  for (const m of todo.matchAll(/--([a-z0-9_-]{2,60})\s*:\s*([^;}"'<]{2,60})/gi)) {
    if (!NOMBRE_DE_MARCA.test(m[1]) || PALETA_AJENA.test(m[1])) continue;
    const hex = aHexNormal(m[2].trim());
    if (hex && esColorDeMarca(hex)) {
      return { color: hex, fuente: 'variable-css',
               nota: `de la variable CSS --${m[1]}` };
    }
    anotar(hex);
  }

  // ── 3. el que mas se repite ──────────────────────────────────
  const cuenta = new Map<string, number>();
  for (const m of todo.matchAll(COLOR_SUELTO)) {
    const hex = aHexNormal(m[0]);
    if (!hex) continue;
    if (!esColorDeMarca(hex)) { anotar(hex); continue; }
    cuenta.set(hex, (cuenta.get(hex) ?? 0) + 1);
  }

  const orden = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  if (orden.length) {
    const [hex, veces] = orden[0];
    return { color: hex, fuente: 'frecuencia',
             nota: `aparece ${veces} ${veces === 1 ? 'vez' : 'veces'} en el sitio` };
  }

  const vistos = [...descartados].slice(0, 6).join(', ');
  return {
    color: null, fuente: 'ninguna',
    nota: descartados.size
      ? `ningún color del sitio parece una marca (se descartaron grises y neutros: ${vistos})`
      : 'no se encontró ningún color en el HTML',
  };
}
