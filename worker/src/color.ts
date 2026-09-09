/**
 * El color de marca del cliente, usado sin romper el contraste.
 *
 * Cada cliente trae UN color (`color_primario`) y la página lo usa en
 * tres lugares que necesitan cosas distintas:
 *
 *   1. como FONDO de un botón   -> hace falta saber si el texto encima
 *                                  va blanco o negro
 *   2. como TEXTO sobre blanco  -> hace falta oscurecerlo hasta que se
 *                                  lea
 *   3. como anillo de FOCO      -> hace falta que se vea contra el fondo
 *
 * Hasta ahora el botón escribía blanco fijo encima del color del
 * cliente. Con un azul oscuro funciona; con el dorado o el rosa claro
 * de una clínica de estética —que son colores frecuentísimos en el
 * rubro— el texto desaparece. No es hipotético: es lo que pasa hoy en
 * las demos generadas, donde el color sale de la web del negocio.
 *
 * Todo esto es WCAG 2.1: luminancia relativa y razón de contraste,
 * con el piso en 4,5:1 para texto normal.
 */

/**
 * El celeste de Uptempo. Es el color de la casa, y ademas el valor por
 * defecto cuando no se le pudo sacar el color a la web del negocio.
 *
 * Antes ese defecto era un gris pizarra, que en una pagina se lee como
 * "sin terminar". El celeste se lee como una decision — y en Uruguay
 * es el unico color que no es de ningun cuadro.
 *
 * Si varias demos comparten este celeste no es un accidente como lo
 * era el rosa de WordPress: es nuestro color, en una pagina que arriba
 * de todo dice que la armo Uptempo.
 */
export const CELESTE = '#00a8e8';

type Rgb = [number, number, number];

const CLARO: Rgb = [255, 255, 255];
const OSCURO: Rgb = [16, 20, 24];

export function aRgb(hex: string): Rgb | null {
  const h = String(hex ?? '').trim().replace(/^#/, '');
  const s = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

function aHex(rgb: Rgb): string {
  return '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v)))
    .toString(16).padStart(2, '0')).join('');
}

/** Luminancia relativa (WCAG 2.1). 0 = negro, 1 = blanco. */
export function luminancia(rgb: Rgb): number {
  const [r, g, b] = rgb.map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste entre dos colores. 21 es el máximo (negro/blanco). */
export function contraste(a: Rgb, b: Rgb): number {
  const la = luminancia(a), lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * ¿Qué color de texto va ENCIMA de este fondo? El que más contraste dé.
 *
 * Un color inválido devuelve blanco: es lo que había antes, así que
 * ante un dato roto la página se ve como se veía y no peor.
 */
export function sobreColor(fondo: string): string {
  const rgb = aRgb(fondo);
  if (!rgb) return aHex(CLARO);
  return contraste(rgb, CLARO) >= contraste(rgb, OSCURO) ? aHex(CLARO) : aHex(OSCURO);
}

/**
 * El mismo color de marca, corrido hasta que se pueda LEER sobre el
 * fondo dado. Oscurece si el fondo es claro y aclara si es oscuro.
 *
 * Conserva el tono: se multiplica cada canal, no se lo manda a gris.
 * Un rosa sigue siendo rosa, solo que uno que se lee.
 */
export function paraTexto(color: string, fondo = '#ffffff'): string {
  let rgb = aRgb(color);
  const fondoRgb = aRgb(fondo) ?? CLARO;
  if (!rgb) return aHex(luminancia(fondoRgb) > 0.5 ? OSCURO : CLARO);

  const aclarar = luminancia(fondoRgb) <= 0.5;
  // 30 pasos de 6% cubren de cualquier color a casi blanco o casi negro.
  for (let i = 0; i < 30 && contraste(rgb, fondoRgb) < 4.5; i++) {
    rgb = rgb.map(v => aclarar ? v + (255 - v) * 0.12 : v * 0.9) as Rgb;
  }
  return aHex(rgb);
}

/**
 * Una versión muy suave del color de marca, para fondos de sección.
 * `mezcla` va de 0 (el color puro) a 1 (el fondo puro).
 */
export function mezclar(color: string, fondo: string, mezcla: number): string {
  const a = aRgb(color), b = aRgb(fondo);
  if (!a || !b) return fondo;
  const t = Math.max(0, Math.min(1, mezcla));
  return aHex([0, 1, 2].map(i => a[i] * (1 - t) + b[i] * t) as Rgb);
}
