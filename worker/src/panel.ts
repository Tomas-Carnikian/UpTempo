import { sobreColor, paraTexto, mezclar, CELESTE } from './color';

/**
 * El panel del dueño.
 *
 * Es una pagina estatica que habla DIRECTO con Supabase: la
 * publishable key mas el JWT del usuario, y RLS lo encierra en su
 * cliente_id. El Worker no interviene en la lectura — no hay ninguna
 * ruta del Worker por la que se puedan pedir los datos de otro.
 *
 * Cinco numeros, y no un sexto. El de fuera de horario va arriba y
 * mas grande porque es literalmente lo que se vende: la consulta de
 * las 22:40 que antes se perdia. Y el panel INFORMA, no argumenta: el
 * que lo abre ya compro.
 *
 * A diferencia de la pagina de turnos y del chat, aca NO entra el
 * color del cliente. Esta pantalla es de Uptempo, no del negocio, y
 * es la unica de las tres donde elegimos nosotros. Va celeste: en
 * Uruguay es el unico color que no es de ningun cuadro.
 */

export function paginaPanel(
  supabaseUrl: string, publishableKey: string, rutaPanel: string,
): string {
  // Derivados con las mismas funciones que usan las otras dos
  // pantallas: un celeste con texto blanco encima da 2,4:1 y no se
  // lee, asi que el texto de los botones lo decide el contraste.
  const sobreCeleste = sobreColor(CELESTE);
  const celesteTextoClaro = paraTexto(CELESTE, '#f9f9f7');
  const celesteTextoOscuro = paraTexto(CELESTE, '#0d0d0d');
  const celestePisoClaro = mezclar(CELESTE, '#f9f9f7', 0.90);
  const celestePisoOscuro = mezclar(CELESTE, '#0d0d0d', 0.86);

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Panel · Uptempo</title>
<style>
  :root {
    color-scheme: light;
    --plano:      #f9f9f7;
    --superficie: #fcfcfb;
    --tinta:      #0b0b0b;
    --tinta-2:    #52514e;
    --tinta-3:    #898781;
    --borde:      rgba(11,11,11,0.10);
    --linea:      #e1e0d9;
    --acento:      ${CELESTE};
    --sobre-acento:${sobreCeleste};
    --acento-texto:${celesteTextoClaro};
    --acento-piso: ${celestePisoClaro};
    --ok:          #006300;
    --critico:     #d03b3b;
    --r:           12px;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --plano:      #0d0d0d;
      --superficie: #1a1a19;
      --tinta:      #ffffff;
      --tinta-2:    #c3c2b7;
      --tinta-3:    #898781;
      --borde:      rgba(255,255,255,0.10);
      --linea:      #2c2c2a;
      --acento:      ${CELESTE};
      --sobre-acento:${sobreCeleste};
      --acento-texto:${celesteTextoOscuro};
      --acento-piso: ${celestePisoOscuro};
      --ok:          #4bbd6b;
      --critico:     #e66767;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--plano); color: var(--tinta);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .envoltorio { max-width: 900px; margin: 0 auto; padding: 24px 18px 64px; }

  /* La cabecera en DOS renglones: el nombre del negocio arriba solo,
     y abajo el periodo y las acciones. Los cinco elementos en una
     misma fila con flex-wrap se apilaban de cualquier forma en un
     celular, y el nombre —que es lo que ubica al que entra— quedaba
     mezclado con el boton de salir. */
  header.barra { display: grid; gap: 10px; margin-bottom: 4px; }
  .titulo { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  header.barra h1 { font-size: 21px; margin: 0; font-weight: 660; letter-spacing: -.015em; }
  .es-demo { font-size: 11.5px; font-weight: 600; letter-spacing: .05em;
             text-transform: uppercase; padding: 3px 8px; border-radius: 5px;
             background: var(--acento-piso); color: var(--acento-texto); }
  .herramientas { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

  /* Todo lo clickeable de la cabecera comparte forma. Antes cada uno
     traia sus propios colores escritos a mano —#fff, #d6cec6,
     #59636e— que en modo oscuro quedaban como un desplegable blanco
     sobre fondo negro. Ahora todos salen de los mismos tokens. */
  #cambiar-negocio, .ir, .salir {
    font: inherit; font-size: 13px; padding: 0 11px; border-radius: 9px;
    border: 1px solid var(--linea); background: var(--superficie);
    color: var(--tinta-2); min-height: 36px; cursor: pointer;
    display: inline-flex; align-items: center; text-decoration: none;
    transition: background .18s ease, color .18s ease, border-color .18s ease;
  }
  #cambiar-negocio:hover, .ir:hover, .salir:hover {
    color: var(--tinta); border-color: var(--tinta-3);
  }
  .salir { margin-left: auto; }
  a:focus-visible, button:focus-visible, select:focus-visible, input:focus-visible {
    outline: 3px solid var(--acento-texto); outline-offset: 2px; border-radius: 9px;
  }
  @media (prefers-reduced-motion: reduce) {
    * { transition-duration: .01ms !important; animation-duration: .01ms !important; }
  }
  /* Sin text-transform: capitalize, que ponia mayuscula en TODAS las
     palabras y escribia "Setiembre De 2026". La primera letra la sube
     el JS, que sabe cual es la primera. */
  .periodo { color: var(--tinta-3); font-size: 13px; margin-right: 4px; }

  .tarjeta { background: var(--superficie); border: 1px solid var(--borde);
             border-radius: var(--r); padding: 18px 20px; }

  /* Hero: el número que sostiene la mensualidad. */
  .hero { margin: 18px 0 12px; background: var(--acento-piso);
          border-color: color-mix(in srgb, var(--acento) 30%, transparent); }
  .hero .rotulo { font-size: 14px; color: var(--tinta-2); font-weight: 560; }
  .hero .cifra { font-size: clamp(52px, 13vw, 68px); line-height: 1.02; font-weight: 690;
                 letter-spacing: -.035em; margin: 4px 0 2px; color: var(--acento-texto);
                 font-variant-numeric: tabular-nums; }
  .hero .pie { font-size: 14px; color: var(--tinta-2); max-width: 46ch; }
  /* En pantalla ancha el numero va al lado del texto: solo, dejaba
     media tarjeta vacia y parecia sin terminar. */
  @media (min-width: 680px) {
    .hero { display: grid; grid-template-columns: auto 1fr; column-gap: 26px;
            align-items: center; }
    .hero .rotulo { grid-column: 1 / -1; }
    .hero .cifra { grid-row: 2; margin: 2px 0 0; }
    .hero .pie { grid-row: 2; }
  }

  .fila { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 12px; }
  .tile { padding: 15px 17px; }
  .tile .rotulo { font-size: 13px; color: var(--tinta-2); }
  /* tabular-nums para que 11 y 44 ocupen lo mismo: sin esto las cuatro
     cifras bailan de ancho cada vez que se recarga. */
  .tile .cifra { font-size: 30px; font-weight: 650; letter-spacing: -.025em; margin-top: 3px;
                 font-variant-numeric: tabular-nums; }
  .tile .nota { font-size: 12px; color: var(--tinta-3); margin-top: 1px; }

  h2 { font-size: 15px; font-weight: 620; margin: 30px 0 10px; }
  /* La tabla scrollea DENTRO de su caja. Sin esto, en un celular la
     ultima columna quedaba cortada contra el borde y la pagina entera
     se movia de costado. */
  .tabla { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 440px; }
  th { text-align: left; font-weight: 550; color: var(--tinta-3); font-size: 12.5px;
       text-transform: uppercase; letter-spacing: .04em; padding: 0 8px 7px 0; }
  td { padding: 9px 8px 9px 0; border-top: 1px solid var(--linea); vertical-align: top; }
  td.num { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--tinta-2); }
  .marca { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; }
  .marca.fuera { color: var(--acento-texto); }
  .marca.cancel { color: var(--critico); }
  .marca.ok { color: var(--ok); }
  .marca.neutro { color: var(--tinta-2); }
  .vacio { color: var(--tinta-3); font-size: 14px; padding: 14px 0; }
  .privacidad { color: var(--tinta-3); font-size: 12.5px; margin-top: 10px; }

  /* Login */
  .login { max-width: 380px; margin: 12vh auto; }
  .login h1 { font-size: 22px; margin: 0 0 6px; }
  .login p { color: var(--tinta-2); margin: 0 0 18px; font-size: 14px; }
  .login input { width: 100%; padding: 11px 13px; font-size: 15px;
                 border: 1px solid var(--linea); border-radius: 9px;
                 background: var(--superficie); color: var(--tinta); }
  .login button { width: 100%; margin-top: 10px; padding: 12px; font-size: 15px;
                  font-weight: 600; border: 0; border-radius: 9px; min-height: 46px;
                  background: var(--acento); color: var(--sobre-acento); cursor: pointer;
                  transition: filter .18s ease; }
  .login button:hover { filter: brightness(1.08); }
  .login button:disabled { opacity: .55; cursor: default; }
  .aviso { margin-top: 14px; font-size: 14px; color: var(--tinta-2); }
  .aviso.mal { color: var(--critico); }
</style>
</head>
<body>

<div id="pantalla-login" class="envoltorio login" hidden>
  <h1>Panel de turnos</h1>
  <p>Poné tu correo y te mandamos un enlace para entrar. No hay contraseña.</p>
  <form id="form-login">
    <input type="email" id="email" placeholder="tu@correo.com" required autocomplete="email">
    <button type="submit" id="boton-login">Mandame el enlace</button>
  </form>
  <div class="aviso" id="aviso-login" hidden></div>
</div>

<div id="pantalla-panel" class="envoltorio" hidden>
  <header class="barra">
    <div class="titulo">
      <h1 id="negocio">…</h1>
      <span class="es-demo" id="etiqueta-demo" hidden>demo</span>
    </div>
    <div class="herramientas">
      <span class="periodo" id="periodo"></span>
      <select id="cambiar-negocio" hidden aria-label="Cambiar de negocio"></select>
      <a id="ver-pagina" class="ir" hidden target="_blank" rel="noopener">Ver la página</a>
      <button class="salir" id="salir">Salir</button>
    </div>
  </header>

  <section class="tarjeta hero">
    <div class="rotulo">Consultas fuera de horario</div>
    <div class="cifra" id="m-fuera">–</div>
    <div class="pie">Noches, fines de semana y feriados.</div>
  </section>

  <section class="fila">
    <div class="tarjeta tile">
      <div class="rotulo">Turnos agendados</div>
      <div class="cifra" id="m-turnos">–</div>
    </div>
    <div class="tarjeta tile">
      <div class="rotulo">Consultas atendidas</div>
      <div class="cifra" id="m-consultas">–</div>
    </div>
    <div class="tarjeta tile">
      <div class="rotulo">Tiempo de respuesta</div>
      <div class="cifra" id="m-tiempo">–</div>
      <div class="nota">promedio</div>
    </div>
    <div class="tarjeta tile">
      <div class="rotulo">Pasadas a una persona</div>
      <div class="cifra" id="m-derivadas">–</div>
    </div>
  </section>

  <h2>Últimos turnos</h2>
  <div id="tabla-turnos" class="tabla"></div>

  <h2>Última actividad</h2>
  <div id="tabla-actividad" class="tabla"></div>
  <p class="privacidad">Se muestran solo los datos del turno y la hora de cada consulta.
  El texto de las conversaciones no se muestra acá.</p>
</div>

<script>
(function () {
  var URL_SB = ${JSON.stringify(supabaseUrl)};
  var KEY = ${JSON.stringify(publishableKey)};
  var RUTA_PANEL = ${JSON.stringify(rutaPanel)};
  var CLAVE_SESION = 'uptempo_panel_sesion';

  var $ = function (id) { return document.getElementById(id); };

  // ── sesión ────────────────────────────────────────────────────
  function guardar(s) { try { localStorage.setItem(CLAVE_SESION, JSON.stringify(s)); } catch (e) {} }
  function leer() {
    try { return JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null'); } catch (e) { return null; }
  }
  function borrar() { try { localStorage.removeItem(CLAVE_SESION); } catch (e) {} }

  // El enlace del correo vuelve con los tokens en el fragmento.
  function tomarDelHash() {
    if (!location.hash || location.hash.indexOf('access_token') === -1) return null;
    var p = new URLSearchParams(location.hash.slice(1));
    var s = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token') };
    history.replaceState(null, '', location.pathname + location.search);
    return s.access_token ? s : null;
  }

  async function refrescar(s) {
    var r = await fetch(URL_SB + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: KEY },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    if (!r.ok) return null;
    var j = await r.json();
    var nueva = { access_token: j.access_token, refresh_token: j.refresh_token };
    guardar(nueva);
    return nueva;
  }

  // ── datos ─────────────────────────────────────────────────────
  var sesion = null;

  async function api(ruta) {
    var r = await fetch(URL_SB + '/rest/v1/' + ruta, {
      headers: { apikey: KEY, Authorization: 'Bearer ' + sesion.access_token }
    });
    if (r.status === 401 && sesion.refresh_token) {
      var nueva = await refrescar(sesion);
      if (!nueva) return null;
      sesion = nueva;
      return api(ruta);
    }
    if (!r.ok) return null;
    return await r.json();
  }

  // ── pintar ────────────────────────────────────────────────────
  function mes(iso, tz) {
    return new Intl.DateTimeFormat('es-UY', { timeZone: tz, month: 'long', year: 'numeric' })
      .format(new Date(iso));
  }
  function cuando(iso, tz) {
    return new Intl.DateTimeFormat('es-UY', {
      timeZone: tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(iso)).replace(',', '');
  }
  function tiempo(ms) {
    if (!ms) return '–';
    return ms < 60000 ? (ms / 1000).toFixed(1) + ' s' : Math.round(ms / 60000) + ' min';
  }
  function mayus(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
    });
  }

  var ETIQUETA = {
    consulta: 'Consulta', turno: 'Turno agendado', derivacion: 'Pasada a una persona',
    recordatorio: 'Recordatorio', cancelacion: 'Cancelación',
    reprogramacion: 'Reprogramación', error: 'Error'
  };
  var CANAL = { whatsapp: 'WhatsApp', web: 'Web', pagina: 'Página', cron: 'Automático' };
  // El dueño estaba leyendo el valor crudo de la base: "no_asistio",
  // "agendado". Es su pantalla, no la consola de nadie.
  var ESTADO = {
    agendado: 'Agendado', confirmado: 'Confirmado', cancelado: 'Cancelado',
    reprogramado: 'Reprogramado', no_asistio: 'No asistió', cumplido: 'Cumplido'
  };

  function tablaTurnos(filas, tz) {
    if (!filas || !filas.length) return '<p class="vacio">Todavía no hay turnos este mes.</p>';
    return '<table><thead><tr><th>Cuándo</th><th>Servicio</th><th>Estado</th><th>Vino de</th>' +
      '</tr></thead><tbody>' + filas.map(function (t) {
        // El tilde verde es "ya pasó y salió bien". Un turno de mañana
        // todavia no es ninguna de las dos cosas: va neutro.
        var cls = (t.estado === 'cancelado' || t.estado === 'no_asistio') ? 'cancel'
                : t.estado === 'cumplido' ? 'ok' : 'neutro';
        var icono = cls === 'cancel' ? '✕' : cls === 'ok' ? '✓' : '•';
        return '<tr><td class="num">' + cuando(t.inicio, tz) + '</td><td>' +
          esc(t.servicio_nombre) + '</td><td><span class="marca ' + cls + '">' + icono + ' ' +
          esc(ESTADO[t.estado] || t.estado) + '</span></td><td>' + esc(CANAL[t.origen] || t.origen || '–') +
          '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function tablaActividad(filas, tz) {
    if (!filas || !filas.length) return '<p class="vacio">Todavía no hay actividad este mes.</p>';
    return '<table><thead><tr><th>Cuándo</th><th>Qué pasó</th><th>Servicio</th><th>Canal</th>' +
      '</tr></thead><tbody>' + filas.map(function (e) {
        return '<tr><td class="num">' + cuando(e.ocurrido_en, tz) +
          (e.fuera_de_horario ? ' <span class="marca fuera" title="Fuera de horario">•</span>' : '') +
          '</td><td>' + esc(ETIQUETA[e.tipo] || e.tipo) + '</td><td>' +
          esc(e.servicio || '–') + '</td><td>' + esc(CANAL[e.origen] || e.origen || '–') +
          '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  async function cargar() {
    // OJO: un usuario puede tener MAS DE UN negocio. Pasa con Tomas,
    // que queda enganchado a cada demo, y con una cadena que tiene una
    // fila por sucursal. La primera version pedia un solo cliente y no
    // filtraba nada mas: el panel mostraba el nombre de un negocio con
    // los eventos de TODOS mezclados. RLS no lo evita porque los dos
    // son suyos. Por eso ahora se elige uno y se filtra por cliente_id
    // en cada consulta.
    //
    // Y OJO CON LOS BACKTICKS: este archivo entero es un template
    // literal. Uno solo, hasta en un comentario, corta el literal y el
    // build falla con un "Expected ; but found ..." que apunta a
    // cualquier lado menos al backtick.
    var negocios = await api('clientes?select=id,nombre,slug,timezone,estado&order=nombre');
    if (!negocios) { mostrarLogin(); return; }
    if (!negocios.length) {
      mostrarLogin('Ese correo no tiene ningún negocio asociado. Escribinos y lo damos de alta.');
      return;
    }

    var pedido = new URLSearchParams(location.search).get('n');
    var guardado = null;
    try { guardado = localStorage.getItem('uptempo_panel_negocio'); } catch (e) {}
    var cliente = negocios.filter(function (x) { return x.id === pedido; })[0]
               || negocios.filter(function (x) { return x.id === guardado; })[0]
               || negocios[0];
    try { localStorage.setItem('uptempo_panel_negocio', cliente.id); } catch (e) {}

    var tz = cliente.timezone || 'America/Montevideo';
    $('negocio').textContent = cliente.nombre;
    $('etiqueta-demo').hidden = cliente.estado !== 'demo';

    var ver = $('ver-pagina');
    ver.href = '/p/' + cliente.slug;
    ver.hidden = false;

    var selector = $('cambiar-negocio');
    if (negocios.length > 1) {
      selector.innerHTML = negocios.map(function (x) {
        return '<option value="' + esc(x.id) + '"' + (x.id === cliente.id ? ' selected' : '') +
               '>' + esc(x.nombre) + (x.estado === 'demo' ? ' (demo)' : '') + '</option>';
      }).join('');
      selector.hidden = false;
      selector.onchange = function () {
        try { localStorage.setItem('uptempo_panel_negocio', selector.value); } catch (e) {}
        cargar();
      };
    } else {
      selector.hidden = true;
    }

    // Todo lo que sigue va filtrado por ESTE negocio.
    var soloEste = '&cliente_id=eq.' + encodeURIComponent(cliente.id);

    var m = await api('panel_metricas_mes?select=*' + soloEste + '&limit=1');
    var d = (m && m[0]) || {};
    $('periodo').textContent = d.mes_desde ? mayus(mes(d.mes_desde, tz)) : '';
    $('m-fuera').textContent = d.consultas_fuera_horario || 0;
    $('m-turnos').textContent = d.turnos_agendados || 0;
    $('m-consultas').textContent = d.consultas_atendidas || 0;
    $('m-tiempo').textContent = tiempo(d.latencia_media_ms);
    $('m-derivadas').textContent = d.derivaciones || 0;

    var turnos = await api('turnos?select=inicio,servicio_nombre,estado,origen' + soloEste +
      '&order=inicio.desc&limit=8');
    $('tabla-turnos').innerHTML = tablaTurnos(turnos, tz);

    var act = await api('eventos?select=ocurrido_en,tipo,servicio,fuera_de_horario,origen' + soloEste +
      '&order=ocurrido_en.desc&limit=12');
    $('tabla-actividad').innerHTML = tablaActividad(act, tz);

    $('pantalla-login').hidden = true;
    $('pantalla-panel').hidden = false;
  }

  function mostrarLogin(mensaje) {
    $('pantalla-panel').hidden = true;
    $('pantalla-login').hidden = false;
    if (mensaje) {
      var a = $('aviso-login');
      a.textContent = mensaje; a.className = 'aviso mal'; a.hidden = false;
    }
  }

  $('form-login').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var boton = $('boton-login'), aviso = $('aviso-login');
    boton.disabled = true;
    aviso.hidden = true;
    // Se permite crear el usuario: el trigger on_auth_user_created lo
    // engancha con su fila de usuarios_panel por el correo. Si el
    // correo no corresponde a ningún negocio, el usuario se crea pero
    // RLS no le muestra una sola fila, y el panel se lo dice.
    //
    // Dos cosas que cuestan una tarde si se hacen mal:
    //  - la ruta es explícita, no location.pathname: el panel vive en
    //    /panel en local y en la raíz de panel.uptempo.uy;
    //  - redirect_to va en la QUERY STRING. Dentro de "options" (que es
    //    la forma del SDK de JS) la API REST lo ignora sin avisar y
    //    manda al Site URL del proyecto, que por defecto es
    //    http://localhost:3000.
    var vuelta = location.origin + RUTA_PANEL;
    var r = await fetch(URL_SB + '/auth/v1/otp?redirect_to=' + encodeURIComponent(vuelta), {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: KEY },
      body: JSON.stringify({ email: $('email').value.trim() })
    });
    if (r.ok) {
      aviso.textContent = 'Listo. Te llegó un enlace al correo: abrilo desde este mismo dispositivo.';
      aviso.className = 'aviso';
    } else {
      // El motivo real, no "algo falló". Supabase limita los correos
      // de auth a unos pocos por hora en el plan gratis, y sin este
      // detalle uno se pasa media hora revisando el correo.
      var det = await r.json().catch(function () { return {}; });
      var msg = det.msg || det.error_description || det.message || ('error ' + r.status);
      aviso.textContent = r.status === 429
        ? 'Supabase no deja mandar más correos por ahora (' + msg + '). Esperá unos minutos.'
        : 'No pude mandar el enlace: ' + msg;
      aviso.className = 'aviso mal';
    }
    aviso.hidden = false;
    boton.disabled = false;
  });

  $('salir').addEventListener('click', function () { borrar(); location.reload(); });

  // ── arranque ──────────────────────────────────────────────────
  (async function () {
    sesion = tomarDelHash() || leer();
    if (!sesion) { mostrarLogin(); return; }
    guardar(sesion);
    try { await cargar(); } catch (e) { mostrarLogin(); }
  })();
})();
</script>
</body>
</html>`;
}
