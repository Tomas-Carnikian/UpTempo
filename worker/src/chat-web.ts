import type { Negocio } from './tipos';
import { sobreColor, paraTexto, mezclar, CELESTE } from './color';
import { estadoApertura, iniciales } from './pagina-turnos';

/**
 * La pagina de chat del canal web.
 *
 * Cumple dos funciones distintas con el mismo codigo:
 *   1. Es como probamos el asistente mientras lo construimos.
 *   2. Es el demo de ventas: es lo que abre un negocio que todavia no
 *      es cliente y al que no le podemos conectar su WhatsApp porque
 *      el numero es de el.
 *
 * De las tres pantallas es la que mas se juega: la pagina de turnos
 * impresiona, pero es acá donde el dueño entiende QUE compro. Si esto
 * parece un formulario de contacto, no hay venta.
 *
 * Se ve como WhatsApp a proposito y lleva el nombre y el color del
 * negocio: el dueño tiene que reconocerse en dos segundos.
 */

/**
 * `precargado` llega desde los botones de la pagina de turnos cuando el
 * negocio es una demo: ahi no hay WhatsApp que abrir, asi que el boton
 * trae el mensaje hasta aca. Se escribe en el campo pero NO se manda
 * solo: el que aprieta enter tiene que ser el dueño, no nosotros.
 */
export function paginaChat(
  n: Negocio, rutaApi: string, precargado = '', rutaTurnos = '', rutaPanel = '',
): string {
  const c = n.cliente;
  const esDemo = c.estado === 'demo';

  /**
   * Las sugerencias salen de los servicios REALES del negocio. Antes
   * estaban escritas a mano ("precio piernas", "limpieza facial") y en
   * la demo de una odontologia el asistente arrancaba ofreciendo
   * depilacion — que es justo lo que no puede pasar en los primeros
   * tres segundos, que es lo unico que dura la atencion del dueño.
   */
  const agendables = n.servicios.filter(s => s.agendable);
  const sugerencias: Array<{ etiqueta: string; texto: string }> = [];
  const conPrecio = agendables.find(s => s.precio !== null);
  if (conPrecio) {
    sugerencias.push({ etiqueta: `precio ${primeraPalabra(conPrecio.nombre)}`,
                       texto: `Hola! Cuánto sale ${conPrecio.nombre.toLowerCase()}?` });
  } else if (agendables[0]) {
    sugerencias.push({ etiqueta: `precio ${primeraPalabra(agendables[0].nombre)}`,
                       texto: `Hola! Cuánto sale ${agendables[0].nombre.toLowerCase()}?` });
  }
  sugerencias.push({ etiqueta: 'horario sábado', texto: '¿Qué horario tienen los sábados?' });
  const paraTurno = agendables[1] ?? agendables[0];
  if (paraTurno) {
    sugerencias.push({ etiqueta: 'sacar turno',
                       texto: `Quiero sacar un turno para ${paraTurno.nombre.toLowerCase()}` });
  }

  const esc = (s: string) => s.replace(/[&<>"]/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m] as string));

  // El color del cliente resuelto para cada uso. Sin esto, el dorado o
  // el rosa pastel de una clinica de estetica dejan la cabecera entera
  // ilegible: es texto blanco sobre un fondo claro.
  const marca = c.color_primario || CELESTE;
  const sobreMarca = sobreColor(marca);
  const marcaTextoClaro = paraTexto(marca, '#ffffff');
  const marcaTextoOscuro = paraTexto(marca, '#0f1417');

  /**
   * El subtitulo de la cabecera dice el estado REAL del local.
   *
   * Es el argumento de venta entero en cuatro palabras: el dueño abre
   * la demo a las 22:40, lee "el local está cerrado", le escribe, y le
   * contestan igual. Eso no se explica mejor con una diapositiva.
   */
  const apertura = estadoApertura(n);
  const subtitulo = apertura ? `en línea · ${apertura.corto}`
                             : 'en línea · contesta a cualquier hora';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="${esc(marca)}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1a2127" media="(prefers-color-scheme: dark)">
<title>${esc(c.nombre)}</title>
<style>
  :root {
    --marca: ${esc(marca)};
    --sobre-marca: ${esc(sobreMarca)};
    --marca-texto: ${esc(marcaTextoClaro)};
    /* En claro la cabecera ES el color del cliente: sobre un fondo
       blanco eso se lee como su marca. En oscuro no — ver abajo. */
    --cabecera: var(--marca);
    --sobre-cabecera: var(--sobre-marca);
    --av-fondo: color-mix(in srgb, var(--sobre-marca) 20%, transparent);
    --fondo: #e7e0d9;
    --panel: #f4efe9;
    --burbuja-yo: ${esc(mezclar(marca, '#ffffff', 0.86))};
    --burbuja-otro: #ffffff;
    --texto: #14181c;
    --tenue: #6b7280;
    --borde: #d6cec6;
    --sombra: 0 1px 1.5px rgba(20,24,28,.10);
  }
  /* ── Por qué en oscuro la cabecera NO es el color del cliente ──
     Un color saturado ocupando una franja entera sobre un fondo casi
     negro deja de leerse como una marca y pasa a leerse como una
     camiseta de futbol. En Uruguay eso no es un detalle: dorado sobre
     negro es Peñarol, azul sobre blanco es Nacional, y el pais esta
     partido al medio entre los dos. Una demo en frio no puede perderse
     a la mitad de sus prospectos por el color de fondo.
     Cambiarle el color al cliente no sirve —seria elegir el otro
     cuadro— y ademas es SU color, sacado de su web: es lo que hace
     que se reconozca. Lo que cambia es cuanto espacio ocupa: en
     oscuro es acento (el avatar, el boton de enviar, su burbuja),
     nunca una pared. */
  @media (prefers-color-scheme: dark) {
    :root {
      --marca-texto: ${esc(marcaTextoOscuro)};
      --cabecera: #1a2127;
      --sobre-cabecera: #eef1f3;
      --av-fondo: var(--marca);
      --fondo: #0f1417;
      --panel: #161c20;
      --burbuja-yo: ${esc(mezclar(marca, '#0f1417', 0.74))};
      --burbuja-otro: #1e262b;
      --texto: #eef1f3;
      --tenue: #97a1a8;
      --borde: #2b343a;
      --sombra: 0 1px 2px rgba(0,0,0,.45);
    }
  }

  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--fondo); color: var(--texto);
    font: 15px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    display: flex; justify-content: center; min-height: 100dvh;
  }
  .tel { width: 100%; max-width: 460px; display: flex; flex-direction: column;
         background: var(--fondo); box-shadow: 0 0 40px rgba(0,0,0,.14); }

  /* ── cabecera ─────────────────────────────────────────────── */
  header { background: var(--cabecera); color: var(--sobre-cabecera); padding: 11px 14px;
           display: flex; align-items: center; gap: 11px;
           position: sticky; top: 0; z-index: 2; }
  .av { width: 38px; height: 38px; border-radius: 50%; flex: none;
        background: var(--av-fondo); color: var(--sobre-marca);
        display: grid; place-items: center; font-weight: 700; font-size: 14px; }
  .quien { min-width: 0; }
  .tit { font-weight: 650; line-height: 1.2; letter-spacing: -.01em;
         white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { font-size: 12px; opacity: .82; display: flex; align-items: center; gap: 5px;
         white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vivo { width: 6px; height: 6px; border-radius: 50%; flex: none;
          background: currentColor; opacity: .9; }
  .acciones { margin-left: auto; display: flex; align-items: center; gap: 6px; }

  .chip-cab { display: inline-flex; align-items: center; gap: 5px;
              color: var(--sobre-cabecera); text-decoration: none; border: 0;
              background: color-mix(in srgb, var(--sobre-cabecera) 16%, transparent);
              border-radius: 14px; padding: 0 11px; font-size: 12px; font-weight: 560;
              min-height: 36px; cursor: pointer; font-family: inherit;
              transition: background .18s ease; }
  .chip-cab:hover { background: color-mix(in srgb, var(--sobre-cabecera) 30%, transparent); }
  /* Con las tres etiquetas escritas, en un celular de 390 px el nombre
     del negocio quedaba en "Beauty…" y el subtitulo en "en línea · e".
     El nombre es lo unico que el dueño tiene que reconocer al abrir:
     los botones se achican a su icono antes que comerse el nombre. */
  @media (max-width: 460px) {
    .chip-cab span { display: none; }
    .chip-cab { padding: 0 10px; }
  }

  a:focus-visible, button:focus-visible, input:focus-visible {
    outline: 3px solid var(--sobre-cabecera); outline-offset: 2px; border-radius: 8px;
  }
  #hilo a:focus-visible, form :focus-visible { outline-color: var(--marca-texto); }
  @media (prefers-reduced-motion: reduce) {
    * { transition-duration: .01ms !important; animation: none !important; }
  }

  .demo { background: #fdf0d5; color: #6b4310; font-size: 12px; text-align: center;
          padding: 7px 12px; border-bottom: 1px solid #f0dcb4; }
  @media (prefers-color-scheme: dark) {
    .demo { background: #2a2113; color: #e8c98a; border-bottom-color: #3d301b; }
  }

  /* ── el hilo ──────────────────────────────────────────────── */
  #hilo { flex: 1; overflow-y: auto; padding: 16px 12px 10px; display: flex;
          flex-direction: column; gap: 7px; overflow-anchor: none; }
  /* Los mensajes se apoyan ABAJO, como en cualquier chat. Arriba
     dejaba un hueco vacio de media pantalla en el primer mensaje, que
     es justo el cuadro que ve el dueño cuando abre la demo.
     Va con margin-top:auto y no con justify-content:flex-end, que
     recorta los primeros mensajes cuando el hilo ya no entra. */
  #hilo > :first-child { margin-top: auto; }
  .m { max-width: 84%; padding: 8px 11px 6px; border-radius: 14px; white-space: pre-wrap;
       word-wrap: break-word; box-shadow: var(--sombra); font-size: 15px; line-height: 1.42; }
  .m.yo { align-self: flex-end; background: var(--burbuja-yo);
          border-bottom-right-radius: 4px; }
  .m.otro { align-self: flex-start; background: var(--burbuja-otro);
            border-bottom-left-radius: 4px; }
  .hora { display: block; font-size: 10.5px; color: var(--tenue); text-align: right;
          margin-top: 1px; font-variant-numeric: tabular-nums; }

  /* Los tres puntos. El indicador anterior era la palabra "escribiendo…"
     en cursiva, que se lee como un cartel de sistema. Esto se lee como
     alguien del otro lado, que es todo lo que tiene que pasar en los
     dos segundos que tarda el modelo. */
  .esc { align-self: flex-start; display: flex; gap: 4px; align-items: center;
         background: var(--burbuja-otro); box-shadow: var(--sombra);
         padding: 13px 14px; border-radius: 14px; border-bottom-left-radius: 4px; }
  .esc i { width: 7px; height: 7px; border-radius: 50%; background: var(--tenue);
           animation: latir 1.25s infinite ease-in-out; }
  .esc i:nth-child(2) { animation-delay: .16s; }
  .esc i:nth-child(3) { animation-delay: .32s; }
  @keyframes latir {
    0%, 62%, 100% { opacity: .28; transform: translateY(0); }
    31%           { opacity: 1;   transform: translateY(-3px); }
  }
  @media (prefers-reduced-motion: reduce) { .esc i { opacity: .5; } }

  /* ── sugerencias y campo ──────────────────────────────────── */
  .sug { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 12px 10px; }
  .sug button { border-radius: 15px; padding: 0 14px; font-size: 13px; font-weight: 560;
                background: var(--burbuja-otro); color: var(--marca-texto);
                border: 1px solid var(--borde); min-height: 40px; cursor: pointer;
                font-family: inherit; transition: border-color .18s ease, background .18s ease; }
  .sug button:hover { border-color: var(--marca-texto); }

  form { display: flex; gap: 8px; padding: 10px 10px calc(10px + env(safe-area-inset-bottom));
         background: var(--panel); position: sticky; bottom: 0;
         border-top: 1px solid var(--borde); }
  input[type=text] { flex: 1; border: 1px solid var(--borde); border-radius: 21px;
                     padding: 11px 15px; font-size: 16px; background: var(--burbuja-otro);
                     color: var(--texto); font-family: inherit; min-height: 44px; }
  input[type=text]::placeholder { color: var(--tenue); }
  #b { border: 0; background: var(--marca); color: var(--sobre-marca); border-radius: 50%;
       width: 44px; height: 44px; cursor: pointer; flex: none;
       display: grid; place-items: center; transition: filter .18s ease; }
  #b:hover { filter: brightness(1.12); }
  #b:disabled { opacity: .45; cursor: default; }
</style>
</head>
<body>
<div class="tel">
  <header>
    <div class="av">${esc(iniciales(c.nombre))}</div>
    <div class="quien">
      <div class="tit">${esc(c.nombre)}</div>
      <div class="sub"><span class="vivo"></span>${esc(subtitulo)}</div>
    </div>
    <div class="acciones">
      ${rutaTurnos ? `<a class="chip-cab" href="${esc(rutaTurnos)}"
         aria-label="Volver a precios y horarios"><svg width="14" height="14" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
         <span>precios</span></a>` : ''}
      ${esDemo && rutaPanel ? `<a class="chip-cab" href="${esc(rutaPanel)}"
         aria-label="Ver el panel"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
         <path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg><span>panel</span></a>` : ''}
      <button type="button" class="chip-cab" id="reset"
              title="Empezar una conversación nueva" aria-label="Conversación nueva"><svg width="14"
        height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg><span>nueva</span></button>
    </div>
  </header>
  ${esDemo ? '<div class="demo">Demostración. Este no es el WhatsApp real del negocio.</div>' : ''}
  <div id="hilo" role="log" aria-live="polite" aria-label="Conversación"></div>
  <div class="sug">
    ${sugerencias.map(s => `<button type="button" data-t="${esc(s.texto)}">${esc(s.etiqueta)}</button>`).join('\n    ')}
  </div>
  <form id="f" autocomplete="off">
    <input type="text" id="t" placeholder="Escribí un mensaje" required
           enterkeyhint="send" autocapitalize="sentences" aria-label="Tu mensaje">
    <button type="submit" id="b" aria-label="Enviar"><svg width="19" height="19"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 12h15"/><path d="M13 6l6 6-6 6"/></svg></button>
  </form>
</div>
<script>
(function () {
  var API = ${JSON.stringify(rutaApi)};
  var hilo = document.getElementById('hilo');
  var form = document.getElementById('f');
  var input = document.getElementById('t');
  var boton = document.getElementById('b');

  // Id de sesion del navegador. Es lo que hace de "numero de telefono"
  // en el canal web: identifica la conversacion, nada mas.
  var sesion;
  try {
    sesion = localStorage.getItem('uptempo_sesion');
    if (!sesion) { sesion = 'web-' + crypto.randomUUID(); localStorage.setItem('uptempo_sesion', sesion); }
  } catch (e) { sesion = 'web-' + Math.random().toString(36).slice(2); }

  function hora() {
    var d = new Date();
    return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }
  function abajo() { hilo.scrollTop = hilo.scrollHeight; }

  function burbuja(texto, quien) {
    var d = document.createElement('div');
    d.className = 'm ' + quien;
    d.textContent = texto;
    var h = document.createElement('span');
    h.className = 'hora'; h.textContent = hora();
    d.appendChild(h);
    hilo.appendChild(d);
    abajo();
    return d;
  }

  function escribiendo(on) {
    var e = document.getElementById('esc');
    if (on && !e) {
      e = document.createElement('div');
      e.id = 'esc'; e.className = 'esc';
      e.setAttribute('aria-label', 'escribiendo');
      e.innerHTML = '<i></i><i></i><i></i>';
      hilo.appendChild(e); abajo();
    } else if (!on && e) { e.remove(); }
  }

  async function enviar(texto) {
    burbuja(texto, 'yo');
    input.value = ''; boton.disabled = true; escribiendo(true);
    try {
      var r = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sesion: sesion, texto: texto })
      });
      var j = await r.json();
      escribiendo(false);
      if (j.texto) burbuja(j.texto, 'otro');
      else if (j.derivada) burbuja('(la conversación quedó con una persona del equipo)', 'otro');
      else burbuja('Uy, algo falló de mi lado. Probá de nuevo.', 'otro');
    } catch (e) {
      escribiendo(false);
      burbuja('No pude conectarme. Probá de nuevo.', 'otro');
    }
    boton.disabled = false; input.focus();
  }

  var precargado = ${JSON.stringify(precargado.slice(0, 300))};
  if (precargado) { input.value = precargado; setTimeout(function () { input.focus(); }, 60); }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var t = input.value.trim();
    if (t) enviar(t);
  });
  document.querySelectorAll('.sug button').forEach(function (b) {
    b.addEventListener('click', function () { enviar(b.dataset.t); });
  });

  // Conversación nueva: hace falta para probar las derivaciones (después
  // de derivar, el bot se calla 24 h en esa conversación) y para grabar
  // un demo desde cero.
  document.getElementById('reset').addEventListener('click', function () {
    try { localStorage.removeItem('uptempo_sesion'); } catch (e) {}
    location.reload();
  });

  burbuja(${JSON.stringify('Hola! Soy de ' + c.nombre + '. ¿En qué te puedo ayudar?')}, 'otro');
})();
</script>
</body>
</html>`;
}

/** "Depilación definitiva axilas" -> "axilas". Para la etiqueta corta. */
function primeraPalabra(nombre: string): string {
  const p = nombre.trim().split(/\s+/);
  return (p[p.length - 1] ?? nombre).toLowerCase().slice(0, 14);
}
