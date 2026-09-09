import type { Negocio, Servicio } from './tipos';
import { sobreColor, paraTexto, mezclar, CELESTE } from './color';

/**
 * La pagina de turnos. Plantilla fija, siete secciones, siempre en
 * el mismo orden. Lo unico que cambia entre un cliente y otro:
 * logo, dos colores, fotos, servicios con precios, horarios,
 * direccion y el link de WhatsApp. Nada mas, nunca.
 *
 * Su unico trabajo es mostrar precios y abrir WhatsApp. No reemplaza
 * la web que el negocio ya tenga.
 *
 * DOS COSAS QUE MANDAN SOBRE CUALQUIER DECISION DE DISEÑO:
 *
 * 1. No carga NADA de afuera. Ni tipografias, ni iconos, ni scripts.
 *    Esta pagina se manda como link en frio y se abre en el 4G de
 *    alguien que va en el omnibus: una hoja de estilos de Google Fonts
 *    son dos peticiones mas y un bloqueo de render antes de que se vea
 *    una letra. Un link en frio que tarda no se abre dos veces.
 *
 * 2. Se lee de noche. El momento que vende el producto es la persona
 *    escribiendo a las 22:40, y esa persona tiene el telefono en modo
 *    oscuro. Por eso la pagina tiene tema oscuro de verdad, no un
 *    blanco que encandila.
 */

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/**
 * "Beauty Planet" -> "BP". Las iniciales de las palabras, no las dos
 * primeras letras: con `slice(0,2)` el chat mostraba "BE" y la pagina
 * "BP" para el mismo negocio, que es la clase de detalle que hace que
 * dos pantallas no parezcan del mismo producto.
 */
export function iniciales(nombre: string): string {
  return nombre.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, '')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map(p => p[0]).join('').toUpperCase() || '?';
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m] as string));
}

/**
 * El numero de WhatsApp, sacado de `telefono_display`.
 *
 * OJO: muchos negocios publican dos numeros juntos —"2711 9115 / 095
 * 374 187"— y el primero es el FIJO. Un wa.me a un fijo no abre nada:
 * WhatsApp dice que el numero no existe. Por eso se busca el celular
 * (09X o 598 9X) antes de caer en el primero que aparezca.
 */
export function numeroWa(n: Negocio): string {
  const crudo = n.cliente.telefono_display ?? '';
  const candidatos = (crudo.match(/[\d][\d\s.()-]{5,}/g) ?? [])
    .map(x => x.replace(/[^0-9]/g, ''))
    .filter(Boolean)
    .map(d => d.startsWith('598') ? d
            : d.length === 9 && d.startsWith('0') ? '598' + d.slice(1)
            : d.length === 8 ? '598' + d : d);

  const celular = candidatos.find(d => /^5989\d{7}$/.test(d));
  return celular ?? candidatos[0] ?? '';
}

function linkWa(n: Negocio, mensaje: string): string {
  const num = numeroWa(n);
  const base = num ? `https://wa.me/${num}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(mensaje)}`;
}

function precioDe(s: Servicio): string {
  if (s.precio === null) return 'Consultar';
  if (Number(s.precio) === 0) return 'Sin costo';
  return `$U ${Number(s.precio).toLocaleString('es-UY', { maximumFractionDigits: 0 })}`;
}

/** Agrupa los horarios en renglones legibles: "Lunes a viernes 9 a 19". */
function horariosLegibles(n: Negocio): string[] {
  const porDia = new Map<number, string[]>();
  for (const h of n.horarios) {
    const t = `${h.desde.slice(0, 5)} a ${h.hasta.slice(0, 5)}`;
    porDia.set(h.dia_semana, [...(porDia.get(h.dia_semana) ?? []), t]);
  }
  const filas: string[] = [];
  let i = 1;
  while (i <= 7) {
    const tramos = porDia.get(i);
    if (!tramos) { i++; continue; }
    const clave = tramos.join(' y ');
    let j = i;
    while (j + 1 <= 7 && (porDia.get(j + 1) ?? []).join(' y ') === clave) j++;
    const etiqueta = i === j ? DIAS[i] : `${DIAS[i]} a ${DIAS[j]}`;
    filas.push(`${etiqueta} · ${clave}`);
    i = j + 1;
  }
  const cerrados = [1, 2, 3, 4, 5, 6, 7].filter(d => !porDia.has(d)).map(d => DIAS[d]);
  if (cerrados.length) filas.push(`${cerrados.join(' y ')} · cerrado`);
  return filas;
}

/** Dia ISO (1 = lunes) y minutos desde medianoche, en la zona del negocio. */
function momentoLocal(tz: string, d: Date): { dia: number; minutos: number } {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find(x => x.type === t)?.value ?? '';
  const mapa: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  // Algunos entornos devuelven "24" a la medianoche en vez de "00".
  const hora = Number(g('hour')) % 24;
  return { dia: mapa[g('weekday')] ?? 1, minutos: hora * 60 + Number(g('minute')) };
}

const aMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * "Abierto ahora, cierra 19:00" o "Cerrado, abre mañana 9:00".
 *
 * Es el dato que mas le sirve a quien abre la pagina, y ademas es el
 * argumento del producto puesto en la propia pagina: si dice CERRADO y
 * el boton de escribir sigue ahi, ya entendio para que sirve esto.
 *
 * Devuelve null si el negocio no tiene horarios cargados, que en una
 * demo recien generada pasa seguido: mejor no decir nada que mentir.
 */
export interface Apertura {
  abierto: boolean;
  /** Para el encabezado de la pagina: "Abierto ahora · cierra 19:00". */
  texto: string;
  /**
   * Para la cabecera del chat, que es angosta: "abierto hasta 19:00".
   * Existe como campo y no como un replace() del otro porque cortar
   * strings de otro modulo se rompe en silencio el dia que alguien
   * cambia una palabra.
   */
  corto: string;
}

export function estadoApertura(n: Negocio, ahora = new Date()): Apertura | null {
  if (!n.horarios.length) return null;

  const { dia, minutos } = momentoLocal(n.cliente.timezone, ahora);
  const deDia = (d: number) => n.horarios
    .filter(h => h.dia_semana === d)
    .map(h => ({ desde: aMin(h.desde), hasta: aMin(h.hasta), texto: h.desde.slice(0, 5) }))
    .sort((a, b) => a.desde - b.desde);

  const hoy = deDia(dia);
  const abierto = hoy.find(t => minutos >= t.desde && minutos < t.hasta);
  if (abierto) {
    const cierra = String(Math.floor(abierto.hasta / 60)).padStart(2, '0')
                 + ':' + String(abierto.hasta % 60).padStart(2, '0');
    return { abierto: true, texto: `Abierto ahora · cierra ${cierra}`,
             corto: `abierto hasta ${cierra}` };
  }

  const masTarde = hoy.find(t => t.desde > minutos);
  if (masTarde) {
    return { abierto: false, texto: `Cerrado · abre hoy ${masTarde.texto}`,
             corto: `abre hoy ${masTarde.texto}` };
  }

  for (let i = 1; i <= 7; i++) {
    const d = ((dia - 1 + i) % 7) + 1;
    const tramos = deDia(d);
    if (!tramos.length) continue;
    const cuando = i === 1 ? 'mañana' : DIAS[d].toLowerCase();
    return { abierto: false, texto: `Cerrado · abre ${cuando} ${tramos[0].texto}`,
             corto: `abre ${cuando} ${tramos[0].texto}` };
  }
  return null;
}

export function paginaTurnos(n: Negocio, rutaChat = '', rutaPanel = ''): string {
  const c = n.cliente;
  const esDemo = c.estado === 'demo';

  /**
   * En una demo NO hay WhatsApp: el numero es del negocio y el negocio
   * todavia no es cliente. Los botones abren el chat web con el mismo
   * mensaje precargado, que ademas es lo que queremos que el dueño
   * pruebe. Mandarlo al WhatsApp real seria mandarlo a su propio
   * telefono, que no tiene nada del otro lado.
   */
  const accion = (mensaje: string) =>
    esDemo ? `${rutaChat}?m=${encodeURIComponent(mensaje)}` : linkWa(n, mensaje);

  const fotos = (Array.isArray(c.fotos) ? c.fotos : []).slice(0, 4);
  const horarios = horariosLegibles(n);
  const servicios = n.servicios; // ya vienen filtrados por activo y ordenados
  const apertura = estadoApertura(n);

  const waGeneral = accion(`Hola! Quiero consultar por un turno en ${c.nombre}.`);
  const textoBoton = esDemo ? 'Probar el asistente' : 'Pedir turno por WhatsApp';
  const textoBarra = esDemo ? 'Probar' : 'Escribir';
  const sigla = iniciales(c.nombre);

  // ── El color del cliente, resuelto para cada uso ────────────────
  // Un solo hex entra; salen cuatro valores que no rompen el contraste
  // en ningun tema. Ver color.ts para el por que.
  const marca = c.color_primario || CELESTE;
  const sobreMarca = sobreColor(marca);
  const marcaTextoClaro = paraTexto(marca, '#ffffff');
  const marcaTextoOscuro = paraTexto(marca, '#12161a');
  const marcaSuaveClaro = mezclar(marca, '#ffffff', 0.92);
  const marcaSuaveOscuro = mezclar(marca, '#12161a', 0.86);

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.nombre)}${c.direccion ? ' · Turnos' : ''}</title>
<meta name="description" content="${esc(c.descripcion_corta ?? c.nombre)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="${esc(marca)}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#12161a" media="(prefers-color-scheme: dark)">
${esDemo ? '<meta name="robots" content="noindex, nofollow">' : ''}
<style>
  /* ── Sistema ─────────────────────────────────────────────────
     Un solo color viene del cliente. Todo lo demas son neutros con
     un sesgo calido, no grises muertos, y se definen enteros aca
     para que el tema oscuro solo tenga que redefinir valores. */
  :root {
    --marca: ${esc(marca)};
    --sobre-marca: ${esc(sobreMarca)};
    --marca-texto: ${esc(marcaTextoClaro)};
    --marca-suave: ${esc(marcaSuaveClaro)};
    /* Verde WhatsApp oscurecido. El #25d366 de la marca con texto
       blanco da 1,98:1 — muy por debajo del 4,5:1 de WCAG AA.
       Este da 5,22:1 y se sigue leyendo como WhatsApp. */
    --wa: #0f7a6c;
    --sobre-wa: #ffffff;
    --tinta: #14181c;
    --tinta-2: #59636e;
    --tinta-3: #68727d;
    --plano: #ffffff;
    --piso: #f7f6f4;
    --linea: #e6e3de;
    --linea-suave: #f0eeea;
    --abierto: #0f7a4a;
    --sombra: 0 1px 2px rgba(20,24,28,.05), 0 8px 24px -12px rgba(20,24,28,.14);
    --r: 14px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --marca-texto: ${esc(marcaTextoOscuro)};
      --marca-suave: ${esc(marcaSuaveOscuro)};
      --wa: #1c9b87;
      --sobre-wa: #05201c;
      --tinta: #eef1f3;
      --tinta-2: #a4aeb6;
      --tinta-3: #8d979f;
      --plano: #12161a;
      --piso: #191e23;
      --linea: #272e34;
      --linea-suave: #1e242a;
      --abierto: #4ec08a;
      --sombra: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px -12px rgba(0,0,0,.6);
    }
  }

  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
  body {
    margin: 0; color: var(--tinta); background: var(--plano);
    font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .caja { max-width: 720px; margin: 0 auto; padding: 0 20px; }
  a { color: inherit; }
  a, button { cursor: pointer; }

  /* Nadie navega esta pagina con teclado hasta que alguien lo hace: el
     dueño que la revisa en su notebook, o quien no puede usar el mouse.
     Sin foco visible, esa persona no sabe donde esta parada. */
  a:focus-visible, button:focus-visible {
    outline: 3px solid var(--marca-texto); outline-offset: 2px; border-radius: 8px;
  }
  /* Ni una animacion para quien pidio que no las haya. */
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    * { transition-duration: .01ms !important; animation-duration: .01ms !important; }
  }

  /* ── Tipografia: una escala, y se respeta ─────────────────── */
  h1 { font-size: clamp(30px, 7vw, 40px); line-height: 1.1; letter-spacing: -.03em;
       font-weight: 700; margin: 0 0 12px; text-wrap: balance; }
  h2 { font-size: 12.5px; text-transform: uppercase; letter-spacing: .09em;
       color: var(--tinta-3); font-weight: 650; margin: 0 0 16px; }
  h3 { font-size: 14px; margin: 0 0 8px; font-weight: 650; letter-spacing: -.005em; }
  .lead { color: var(--tinta-2); font-size: 17.5px; line-height: 1.5; margin: 0 0 20px;
          text-wrap: pretty; }

  /* ── 1. barra ─────────────────────────────────────────────── */
  .barra { position: sticky; top: 0; z-index: 20; background: var(--plano);
           border-bottom: 1px solid var(--linea-suave); }
  .barra .caja { display: flex; align-items: center; gap: 11px; height: 62px; }
  .logo { width: 34px; height: 34px; border-radius: 10px; background: var(--marca);
          color: var(--sobre-marca); display: grid; place-items: center;
          font-weight: 700; font-size: 13px; letter-spacing: .02em;
          flex: none; overflow: hidden; }
  .logo img { width: 100%; height: 100%; object-fit: cover; }
  .marca { font-weight: 650; font-size: 16.5px; letter-spacing: -.015em;
           white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .acciones { margin-left: auto; display: flex; align-items: center; gap: 6px; }

  .btn { text-decoration: none; border-radius: 999px; font-weight: 620;
         white-space: nowrap; min-height: 44px; display: inline-flex;
         align-items: center; justify-content: center; gap: 7px;
         transition: filter .18s ease, background .18s ease; }
  .btn-wa { background: var(--wa); color: var(--sobre-wa); padding: 0 18px; font-size: 14.5px; }
  .btn-wa:hover { filter: brightness(1.1); }
  .btn-wa:active { filter: brightness(.94); }
  .btn-grande { font-size: 17px; padding: 16px 28px; box-shadow: var(--sombra); }
  /* Secundario, y solo en demos: el panel es del dueño, no de la clienta. */
  .btn-fantasma { color: var(--tinta-2); font-size: 14px; font-weight: 580;
                  padding: 0 12px; }
  .btn-fantasma:hover { background: var(--piso); color: var(--tinta); }
  @media (max-width: 430px) { .btn-fantasma span { display: none; } }

  /* ── 2. encabezado ────────────────────────────────────────── */
  .cabecera { padding: 40px 0 30px; }
  .estado { display: inline-flex; align-items: center; gap: 7px;
            font-size: 13.5px; font-weight: 600; color: var(--tinta-2);
            margin-bottom: 16px; }
  .punto { width: 8px; height: 8px; border-radius: 50%; background: var(--tinta-3); flex: none; }
  .estado.si .punto { background: var(--abierto); }
  .estado.si { color: var(--abierto); }
  .meta { color: var(--tinta-3); font-size: 14.5px; margin: 18px 0 0; }

  /* ── 3. fotos (solo si hay: los huecos punteados quedaban en las
         demos que se mandan en frio, con el texto "Foto 1") ────── */
  .fotos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 6px 0 0; }
  @media (max-width: 560px) { .fotos { grid-template-columns: repeat(2, 1fr); } }
  .foto { aspect-ratio: 4/3; border-radius: 10px; overflow: hidden; background: var(--piso); }
  .foto img { width: 100%; height: 100%; object-fit: cover; display: block; }

  /* ── 4. servicios: la seccion que importa ─────────────────── */
  section { margin-top: 44px; }
  .lista { border-top: 1px solid var(--linea); }
  .servicio { display: flex; align-items: center; gap: 16px; padding: 16px 0;
              border-bottom: 1px solid var(--linea); }
  .servicio .datos { flex: 1; min-width: 0; }
  .servicio .nombre { font-weight: 600; letter-spacing: -.008em; }
  .servicio .detalle { color: var(--tinta-3); font-size: 13.5px; margin-top: 3px; }
  .servicio .precio { font-weight: 700; font-size: 17px; white-space: nowrap;
                      font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
  .servicio .precio.consultar { font-size: 14px; font-weight: 600; color: var(--tinta-3);
                                letter-spacing: 0; }
  .pedir { background: var(--marca-suave); color: var(--marca-texto);
           text-decoration: none; padding: 0 16px; border-radius: 999px;
           font-size: 13.5px; font-weight: 620; white-space: nowrap; flex: none;
           min-height: 44px; display: inline-flex; align-items: center;
           transition: background .18s ease; }
  .pedir:hover { background: var(--marca); color: var(--sobre-marca); }
  @media (max-width: 520px) {
    .servicio { flex-wrap: wrap; gap: 10px 16px; }
    .servicio .datos { flex-basis: 100%; }
    .servicio .precio { margin-right: auto; }
  }

  /* ── 5. horarios, direccion, mapa ─────────────────────────── */
  .info { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
  @media (max-width: 560px) { .info { grid-template-columns: 1fr; gap: 20px; } }
  .info ul { list-style: none; margin: 0; padding: 0; color: var(--tinta-2); font-size: 15px; }
  .info li { padding: 3px 0; }
  .mapa { margin-top: 20px; border-radius: var(--r); overflow: hidden;
          border: 1px solid var(--linea); background: var(--piso); }
  .mapa iframe { display: block; width: 100%; height: 240px; border: 0; }
  .enlace { display: inline-block; margin-top: 12px; font-size: 14.5px;
            color: var(--marca-texto); font-weight: 620; text-decoration: none; }
  .enlace:hover { text-decoration: underline; }

  /* ── 6-7. reseñas y cierre ────────────────────────────────── */
  .resenas a { display: inline-flex; align-items: center; min-height: 44px;
               border: 1px solid var(--linea); border-radius: 12px;
               padding: 0 18px; text-decoration: none; font-size: 15px;
               transition: background .18s ease; }
  .resenas a:hover { background: var(--piso); }
  .cierre { margin-top: 52px; padding: 40px 20px 44px; border-top: 1px solid var(--linea);
            text-align: center; background: var(--piso); }
  .cierre p { color: var(--tinta-2); margin: 0 0 20px; font-size: 17px; }
  .creditos { color: var(--tinta-3); font-size: 12.5px; margin-top: 28px; }

  /* ── El CTA fijo, abajo, donde llega el pulgar ────────────────
     En el celular el boton de arriba se va de pantalla apenas
     scrollea la lista de precios, que es justo cuando la persona
     decide escribir. */
  .pie-fijo { display: none; }
  @media (max-width: 640px) {
    .barra .btn-wa { display: none; }
    /* Y tampoco el del encabezado: con la barra fija abajo se veian
       DOS botones verdes identicos en la misma pantalla, que parece
       un error de maquetado mas que insistencia. En el celular manda
       el del pulgar; en el escritorio, donde la barra fija no existe,
       el del encabezado sigue siendo el principal. */
    .cabecera .btn-grande { display: none; }
    .cabecera { padding: 26px 0 24px; }
    .pie-fijo {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
      display: block; padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
      background: color-mix(in srgb, var(--plano) 88%, transparent);
      backdrop-filter: blur(12px);
      border-top: 1px solid var(--linea);
    }
    .pie-fijo .btn { width: 100%; font-size: 16.5px; }
    body { padding-bottom: 84px; }
  }

  /* ── El cartel de demo, que no es opcional ────────────────── */
  /* Se achica pero no se acorta: cada afirmacion del cartel tiene que
     estar. Es lo que separa una demo honesta de una pagina que se hace
     pasar por la del negocio. */
  .demo { background: #fdf0d5; color: #6b4310; font-size: 12.5px; text-align: center;
          padding: 9px 18px; line-height: 1.4; border-bottom: 1px solid #f0dcb4;
          text-wrap: pretty; }
  .demo b { font-weight: 680; }
  @media (prefers-color-scheme: dark) {
    .demo { background: #2a2113; color: #e8c98a; border-bottom-color: #3d301b; }
  }
</style>
</head>
<body>

${esDemo ? `<div class="demo">
  <b>Demostración</b> — esta página la armó <b>Uptempo</b> con información pública de
  ${esc(c.nombre)}. No es su sitio oficial y el negocio no la publicó.
  Los precios y horarios pueden estar desactualizados.
</div>` : ''}

<!-- 1. barra -->
<div class="barra"><div class="caja">
  <div class="logo">${c.logo_url ? `<img src="${esc(c.logo_url)}" alt="">` : esc(sigla)}</div>
  <div class="marca">${esc(c.nombre)}</div>
  <div class="acciones">
    ${esDemo && rutaPanel ? `<a class="btn btn-fantasma" href="${esc(rutaPanel)}" title="Ver el panel de este negocio">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>
      <span>Ver el panel</span></a>` : ''}
    <a class="btn btn-wa" href="${esc(waGeneral)}" rel="noopener">${esc(textoBarra)}</a>
  </div>
</div></div>

<!-- 2. encabezado -->
<header class="caja cabecera">
  ${apertura ? `<div class="estado${apertura.abierto ? ' si' : ''}">
    <span class="punto"></span>${esc(apertura.texto)}
  </div>` : ''}
  <h1>${esc(c.nombre)}</h1>
  ${c.descripcion_corta ? `<p class="lead">${esc(c.descripcion_corta)}</p>` : ''}
  <a class="btn btn-wa btn-grande" href="${esc(waGeneral)}" rel="noopener">${esc(textoBoton)}</a>
  ${c.direccion ? `<p class="meta">${esc(c.direccion)}</p>` : ''}
</header>

${fotos.length ? `<!-- 3. fotos -->
<section class="caja" style="margin-top:8px">
  <div class="fotos">
    ${fotos.map((f: string) => `<div class="foto"><img src="${esc(f)}" alt="" loading="lazy"></div>`).join('\n    ')}
  </div>
</section>` : ''}

<!-- 4. servicios -->
<section class="caja">
  <h2>Servicios y precios</h2>
  <div class="lista">
  ${servicios.map(s => `<div class="servicio">
    <div class="datos">
      <div class="nombre">${esc(s.nombre)}</div>
      <div class="detalle">${esc(s.duracion_min)} min${s.precio_nota ? ' · ' + esc(s.precio_nota) : ''}</div>
    </div>
    <div class="precio${s.precio === null ? ' consultar' : ''}">${esc(precioDe(s))}</div>
    <a class="pedir" rel="noopener"
       href="${esc(accion(`Hola! Quiero consultar por ${s.nombre}.`))}">Consultar</a>
  </div>`).join('\n  ')}
  </div>
</section>

<!-- 5. horarios, dirección y mapa -->
<section class="caja">
  <h2>Dónde y cuándo</h2>
  <div class="info">
    <div>
      <h3>Horarios</h3>
      <ul>${horarios.map(h => `<li>${esc(h)}</li>`).join('')}</ul>
    </div>
    <div>
      <h3>Dirección</h3>
      <ul><li>${esc(c.direccion ?? 'A confirmar')}</li></ul>
      ${c.formas_pago ? `<h3 style="margin-top:16px">Formas de pago</h3>
      <ul><li>${esc(c.formas_pago)}</li></ul>` : ''}
    </div>
  </div>
  ${c.lat !== null && c.lon !== null ? `
  <div class="mapa">
    <iframe loading="lazy" referrerpolicy="no-referrer"
      title="Mapa de ${esc(c.nombre)}"
      src="https://www.openstreetmap.org/export/embed.html?bbox=${Number(c.lon) - 0.004}%2C${Number(c.lat) - 0.002}%2C${Number(c.lon) + 0.004}%2C${Number(c.lat) + 0.002}&amp;layer=mapnik&amp;marker=${c.lat}%2C${c.lon}"></iframe>
  </div>
  <a class="enlace" rel="noopener"
     href="${esc(c.maps_url ?? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lon}`)}">Cómo llegar →</a>
  ` : (c.maps_url ? `<a class="enlace" rel="noopener" href="${esc(c.maps_url)}">Cómo llegar →</a>` : '')}
</section>

<!-- 6. reseñas -->
${c.google_place_id ? `<section class="caja resenas">
  <h2>Reseñas</h2>
  <a rel="noopener" href="https://search.google.com/local/reviews?placeid=${esc(c.google_place_id)}">
    Ver las reseñas en Google →</a>
</section>` : ''}

<!-- 7. cierre -->
<footer class="cierre">
  <div class="caja">
    <p>${esDemo ? 'Preguntale lo que quieras. Contesta a cualquier hora.' : 'Escribinos y te damos hora.'}</p>
    <a class="btn btn-wa btn-grande" href="${esc(waGeneral)}" rel="noopener">${esc(textoBoton)}</a>
    <div class="creditos">${esc(c.nombre)}${c.direccion ? ' · ' + esc(c.direccion) : ''}</div>
  </div>
</footer>

<!-- el pulgar -->
<div class="pie-fijo">
  <a class="btn btn-wa" href="${esc(waGeneral)}" rel="noopener">${esc(textoBoton)}</a>
</div>

</body>
</html>`;
}
