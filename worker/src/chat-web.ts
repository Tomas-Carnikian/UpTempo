import type { Negocio } from './tipos';

/**
 * La pagina de chat del canal web.
 *
 * Cumple dos funciones distintas con el mismo codigo:
 *   1. Es como probamos el asistente mientras lo construimos.
 *   2. Es el demo de ventas: de acá sale el video de 40 segundos que
 *      se le manda a un negocio que todavia no es cliente y al que
 *      no le podemos conectar su WhatsApp porque el numero es de el.
 *
 * Por eso se ve como WhatsApp y lleva el nombre y los colores del
 * negocio: el dueño tiene que reconocerse en dos segundos.
 */
/**
 * `precargado` llega desde los botones de la pagina de turnos cuando el
 * negocio es una demo: ahi no hay WhatsApp que abrir, asi que el boton
 * trae el mensaje hasta aca. Se escribe en el campo pero NO se manda
 * solo: el que aprieta enter tiene que ser el dueño, no nosotros.
 */
export function paginaChat(n: Negocio, rutaApi: string, precargado = ''): string {
  const c = n.cliente;
  const esc = (s: string) => s.replace(/[&<>"]/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m] as string));

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(c.nombre)}</title>
<style>
  :root {
    --primario: ${esc(c.color_primario ?? '#2f4858')};
    --fondo: #e9e2dc;
    --burbuja-yo: #d6f2c7;
    --burbuja-otro: #ffffff;
    --texto: #14181c;
    --tenue: #6b7280;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--fondo); color: var(--texto);
    font: 15px/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    display: flex; justify-content: center; min-height: 100dvh;
  }
  .tel { width: 100%; max-width: 460px; display: flex; flex-direction: column;
         background: var(--fondo); box-shadow: 0 0 40px rgba(0,0,0,.12); }
  header { background: var(--primario); color: #fff; padding: 12px 16px;
           display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 2; }
  #reset { margin-left: auto; background: rgba(255,255,255,.16); border: 0; color: #fff;
           width: auto; height: auto; border-radius: 14px; padding: 5px 10px;
           font-size: 12px; cursor: pointer; }
  #reset:hover { background: rgba(255,255,255,.28); }
  .av { width: 38px; height: 38px; border-radius: 50%; background: rgba(255,255,255,.22);
        display: grid; place-items: center; font-weight: 600; font-size: 15px; flex: none; }
  .tit { font-weight: 600; line-height: 1.2; }
  .sub { font-size: 12px; opacity: .8; }
  .demo { background: #fef3c7; color: #78350f; font-size: 12px; text-align: center;
          padding: 6px 10px; border-bottom: 1px solid #fde68a; }
  #hilo { flex: 1; overflow-y: auto; padding: 14px 12px 8px; display: flex;
          flex-direction: column; gap: 8px; }
  .m { max-width: 82%; padding: 8px 11px; border-radius: 12px; white-space: pre-wrap;
       word-wrap: break-word; box-shadow: 0 1px 1px rgba(0,0,0,.07); }
  .m.yo { align-self: flex-end; background: var(--burbuja-yo); border-bottom-right-radius: 3px; }
  .m.otro { align-self: flex-start; background: var(--burbuja-otro); border-bottom-left-radius: 3px; }
  .hora { display: block; font-size: 11px; color: var(--tenue); text-align: right; margin-top: 2px; }
  .esc { align-self: flex-start; color: var(--tenue); font-size: 13px; font-style: italic; padding: 2px 4px; }
  form { display: flex; gap: 8px; padding: 10px; background: #f4efe9; position: sticky; bottom: 0; }
  input[type=text] { flex: 1; border: 1px solid #d6cec6; border-radius: 20px;
                     padding: 10px 14px; font-size: 15px; background: #fff; }
  input[type=text]:focus { outline: 2px solid var(--primario); outline-offset: -1px; }
  button { border: 0; background: var(--primario); color: #fff; border-radius: 50%;
           width: 42px; height: 42px; font-size: 17px; cursor: pointer; flex: none; }
  button:disabled { opacity: .5; cursor: default; }
  .sug { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 12px 10px; }
  .sug button { width: auto; height: auto; border-radius: 14px; padding: 6px 11px;
                font-size: 13px; background: #fff; color: var(--primario);
                border: 1px solid #d6cec6; }
</style>
</head>
<body>
<div class="tel">
  <header>
    <div class="av">${esc(c.nombre.slice(0, 2).toUpperCase())}</div>
    <div>
      <div class="tit">${esc(c.nombre)}</div>
      <div class="sub">en línea</div>
    </div>
    <button type="button" id="reset" title="Empezar una conversación nueva">nueva</button>
  </header>
  ${c.estado === 'demo' ? '<div class="demo">Demostración. Este no es el WhatsApp real del negocio.</div>' : ''}
  <div id="hilo"></div>
  <div class="sug">
    <button type="button" data-t="Hola, cuánto sale la depilación definitiva de piernas?">precio piernas</button>
    <button type="button" data-t="Qué horario tienen los sábados?">horario sábado</button>
    <button type="button" data-t="Quiero sacar un turno para limpieza facial">sacar turno</button>
  </div>
  <form id="f" autocomplete="off">
    <input type="text" id="t" placeholder="Escribí un mensaje" required>
    <button type="submit" id="b" aria-label="Enviar">➤</button>
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
  function burbuja(texto, quien) {
    var d = document.createElement('div');
    d.className = 'm ' + quien;
    d.textContent = texto;
    var h = document.createElement('span');
    h.className = 'hora'; h.textContent = hora();
    d.appendChild(h);
    hilo.appendChild(d);
    hilo.scrollTop = hilo.scrollHeight;
    return d;
  }
  function escribiendo(on) {
    var e = document.getElementById('esc');
    if (on && !e) {
      e = document.createElement('div');
      e.id = 'esc'; e.className = 'esc'; e.textContent = 'escribiendo…';
      hilo.appendChild(e); hilo.scrollTop = hilo.scrollHeight;
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
