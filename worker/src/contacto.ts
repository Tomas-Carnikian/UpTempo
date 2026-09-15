// worker/src/contacto.ts
//
// El formulario de contacto de uptempo.uy y el endpoint que lo manda.
//
// POR QUÉ EXISTE
// --------------
// Hasta ahora los cuatro botones de contacto eran `mailto:`, y un `mailto:`
// abre el cliente de correo del sistema — Outlook en Windows, a veces nada en
// absoluto si no hay ninguno configurado. El que entra a la web y quiere
// escribir se encuentra con una ventana ajena, o con nada. Esto lo reemplaza
// por un formulario en la misma página.
//
// CÓMO SALE EL CORREO
// -------------------
// Por Resend, la misma cuenta que ya manda el "Enviar como" de Gmail. **Con
// una API key propia**, no la de Gmail: la regla de `claude/uptempo-correo.md`
// es una clave por uso, para poder rotar una sin voltear la otra.
//
//   De:          Web UpTempo <web@uptempo.uy>   (dominio verificado en Resend)
//   Para:        contacto@uptempo.uy             (alias de Email Routing)
//   Responder a: la dirección que dejó el visitante
//
// **El visitante NUNCA va en el `From`.** Poner ahí su dirección hace que el
// correo salga sin alineación de SPF/DKIM con el dominio del remitente, y va
// derecho a spam. El `Reply-To` es lo que hace que contestar desde Gmail le
// llegue a él igual.
//
// POR QUÉ NO TOCA LA BASE
// -----------------------
// No guarda nada en Supabase. Si algún día se quiere el respaldo —porque un
// envío que falla hoy se pierde— es una tabla y un insert antes del envío. Se
// dejó afuera a propósito: es una decisión, no un olvido.

import type { Context } from 'hono';
import type { Env } from './tipos';

type Idioma = 'es' | 'en';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Adónde llega todo lo del formulario. Un solo buzón, en los dos idiomas. */
const DESTINO = 'contacto@uptempo.uy';

/**
 * El remitente. Tiene que ser una dirección del dominio verificado en Resend
 * (`uptempo.uy`), y no tiene que ser una que alguien lea: las respuestas van
 * al Reply-To. Con el catch-all de Email Routing prendido, lo que llegue a
 * `web@` igual cae en el Gmail de siempre.
 */
const REMITENTE = 'Web UpTempo <web@uptempo.uy>';

const LIMITES = { nombre: 80, correo: 120, mensaje: 4000 };
const MENSAJE_MINIMO = 10;

// ---------------------------------------------------------------------------
// El endpoint
// ---------------------------------------------------------------------------

interface Cuerpo {
  nombre?: unknown;
  correo?: unknown;
  mensaje?: unknown;
  idioma?: unknown;
  token?: unknown;
}

const texto = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

/** Alcanza para descartar basura. La validación de verdad es que conteste. */
const correoValido = (s: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;');

/**
 * POST /api/contacto
 *
 * Contesta siempre JSON `{ ok }`. Cuando falla manda además un `error` con un
 * código corto; el texto que ve el visitante lo pone el navegador, en su
 * idioma, y no viene del servidor.
 */
export async function enviarContacto(c: Context<{ Bindings: Env }>): Promise<Response> {
  const malo = (error: string, status = 400) => c.json({ ok: false, error }, status as 400);

  let cuerpo: Cuerpo;
  try {
    cuerpo = await c.req.json<Cuerpo>();
  } catch {
    return malo('json');
  }

  const nombre = texto(cuerpo.nombre, LIMITES.nombre);
  const correo = texto(cuerpo.correo, LIMITES.correo);
  const mensaje = texto(cuerpo.mensaje, LIMITES.mensaje);
  const idioma: Idioma = cuerpo.idioma === 'en' ? 'en' : 'es';
  const token = texto(cuerpo.token, 4000);

  if (!nombre || !correoValido(correo) || mensaje.length < MENSAJE_MINIMO) {
    return malo('campos');
  }

  // ── Turnstile ────────────────────────────────────────────────────────────
  // Se verifica ANTES de mandar nada. Si falta el secreto, el endpoint se
  // cierra en vez de abrirse: un formulario público sin verificación es correo
  // basura garantizado a los pocos días. Preferible que no ande y se note.
  if (!c.env.TURNSTILE_SECRET_KEY) {
    console.error('[contacto] falta TURNSTILE_SECRET_KEY — el endpoint queda cerrado');
    return malo('config', 500);
  }
  if (!token) return malo('captcha');

  const verificacion = new FormData();
  verificacion.append('secret', c.env.TURNSTILE_SECRET_KEY);
  verificacion.append('response', token);
  const ip = c.req.header('CF-Connecting-IP');
  if (ip) verificacion.append('remoteip', ip);

  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: verificacion,
    });
    const datos = await r.json<{ success?: boolean; 'error-codes'?: string[] }>();
    if (!datos.success) {
      console.log('[contacto] turnstile rechazo:', datos['error-codes']);
      return malo('captcha');
    }
  } catch (e) {
    console.error('[contacto] turnstile no contesto:', e);
    return malo('captcha', 502);
  }

  // ── Resend ───────────────────────────────────────────────────────────────
  if (!c.env.RESEND_API_KEY) {
    console.error('[contacto] falta RESEND_API_KEY');
    return malo('config', 500);
  }

  const asunto = (idioma === 'en' ? '[EN] ' : '') + 'Web · ' + nombre;
  const pie =
    'Idioma: ' + idioma + '\n' +
    'IP: ' + (ip ?? '—') + '\n' +
    'Pais: ' + (c.req.header('CF-IPCountry') ?? '—');

  const plano =
    nombre + ' <' + correo + '>\n\n' + mensaje + '\n\n' +
    '— — —\n' + pie + '\n\nResponder a este correo le llega directo.';

  const html =
    '<div style="font-family:system-ui,sans-serif;line-height:1.55">' +
    '<p style="margin:0 0 4px"><strong>' + esc(nombre) + '</strong></p>' +
    '<p style="margin:0 0 18px"><a href="mailto:' + esc(correo) + '">' + esc(correo) + '</a></p>' +
    '<div style="white-space:pre-wrap;border-left:3px solid #B4D2EE;padding-left:14px;margin-bottom:22px">' +
    esc(mensaje) +
    '</div>' +
    '<p style="color:#8794A8;font-size:12px;white-space:pre-line;margin:0">' + esc(pie) + '</p>' +
    '<p style="color:#8794A8;font-size:12px;margin:10px 0 0">Responder a este correo le llega directo.</p>' +
    '</div>';

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + c.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: REMITENTE,
        to: [DESTINO],
        reply_to: correo,
        subject: asunto,
        text: plano,
        html,
      }),
    });

    if (!r.ok) {
      // El cuerpo del error de Resend es lo único que dice si es la clave, el
      // dominio sin verificar o el remitente. Sin esto, "no anda" y nada más.
      console.error('[contacto] resend', r.status, await r.text());
      return malo('envio', 502);
    }
  } catch (e) {
    console.error('[contacto] resend no contesto:', e);
    return malo('envio', 502);
  }

  return c.json({ ok: true });
}

// ---------------------------------------------------------------------------
// LA INTERFAZ
//
// Las tres piezas siguientes se concatenan adentro de web.ts, igual que las de
// fondo.ts. REGLA PARA EDITARLAS: sin backticks y sin ${ adentro de
// `contactoScript`. Es un template literal y cualquiera de los dos lo rompe o
// interpola algo que no existe. (La trampa que ya mordió en panel.ts y en
// web.ts.) Por eso el JS va con comillas simples y concatenación.
// ---------------------------------------------------------------------------

const T = {
  es: {
    titulo: 'Escribinos',
    bajada: 'Contanos qué trabajo se hace hoy a mano.',
    nombre: 'Nombre',
    correo: 'Tu correo',
    mensaje: 'Mensaje',
    ayudaMensaje: 'Qué hace el negocio y qué te gustaría dejar de hacer a mano.',
    enviar: 'Enviar',
    enviando: 'Enviando…',
    cerrar: 'Cerrar',
    okTitulo: 'Listo.',
    okTexto: 'Enseguida nos ponemos en contacto.',
    errCampos: 'Faltan datos: revisá el nombre, el correo y que el mensaje tenga algo.',
    errCaptcha: 'No se pudo verificar que seas una persona. Probá de nuevo.',
    errEnvio: 'No se pudo enviar. Escribime directo a ',
    errRed: 'Se cortó la conexión. Probá de nuevo, o escribime a ',
    // El de arriba y este decian lo mismo, y son dos problemas
    // distintos: "envio" es Resend rechazando, "config" es un secreto
    // que falta en el Worker. Con el mismo texto no habia forma de
    // saber cual de los dos era sin mirar el log.
    errConfig: 'El formulario no está configurado del todo. Escribime directo a ',
  },
  en: {
    titulo: 'Get in touch',
    bajada: 'Tell us what work gets done by hand today.',
    nombre: 'Name',
    correo: 'Your email',
    mensaje: 'Message',
    ayudaMensaje: 'What the business does and what you would like to stop doing by hand.',
    enviar: 'Send',
    enviando: 'Sending…',
    cerrar: 'Close',
    okTitulo: 'Sent.',
    okTexto: 'We will get back to you shortly.',
    errCampos: 'Something is missing: check the name, the email and the message.',
    errCaptcha: 'We could not verify you are a person. Please try again.',
    errEnvio: 'It could not be sent. Write to me directly at ',
    errRed: 'The connection dropped. Try again, or write to me at ',
    errConfig: 'The form is not fully configured yet. Write to me directly at ',
  },
} as const;

export const contactoCss = `
/* ── Ventana de contacto ─────────────────────────────────────────
   <dialog> nativo: el foco atrapado, Escape para cerrar y el orden
   de apilado los pone el navegador. Hacerlo a mano con un div es
   reimplementar mal tres cosas que ya funcionan. Va en la capa
   superior, así que el fondo animado (z-index:-1) no lo toca. */
.dlg{padding:0;border:1px solid var(--linea);border-radius:3px;background:var(--superficie-2);
  color:var(--hueso);width:min(520px,calc(100vw - 32px));max-height:calc(100dvh - 48px)}
.dlg::backdrop{background:rgba(6,9,14,.72);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.dlg-caja{padding:clamp(22px,4vw,32px)}
.dlg-x{position:absolute;top:12px;right:12px;width:34px;height:34px;display:grid;place-items:center;
  background:transparent;border:1px solid transparent;border-radius:3px;color:var(--niebla);
  cursor:pointer;font-size:19px;line-height:1}
.dlg-x:hover{color:var(--hueso);border-color:var(--linea)}
.dlg h2{font-size:26px;margin-bottom:8px}
.dlg-bajada{color:var(--niebla);font-size:14.5px;margin-bottom:22px}

.campo{display:block;margin-bottom:16px}
/* :first-of-type y no ".campo span" a secas: la ayuda debajo del
   textarea tambien es un span, y con el selector suelto heredaba la
   mayuscula y el mono de la etiqueta. Es la misma trampa de
   especificidad que pinto de niebla el boton del nav — el ojo no la
   agarra, se ve solo como "quedo raro". Asi no puede pasar: el
   selector no la alcanza. */
.campo > span:first-of-type{display:block;font-family:var(--mono);font-size:11.5px;
  letter-spacing:.11em;text-transform:uppercase;color:var(--niebla);margin-bottom:7px}
.campo input,.campo textarea{width:100%;background:var(--tinta);color:var(--hueso);
  border:1px solid var(--linea);border-radius:3px;padding:11px 13px;
  font-family:var(--texto);font-size:15px;line-height:1.5}
.campo textarea{min-height:124px;resize:vertical}
.campo input:focus,.campo textarea:focus{outline:none;border-color:var(--hielo)}
.campo input:focus-visible,.campo textarea:focus-visible{outline:2px solid var(--azul);outline-offset:1px}
.campo-ayuda{color:var(--niebla);font-size:12.5px;margin-top:6px}

.dlg-pie{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:20px}
.dlg-pie .boton[disabled]{opacity:.55;cursor:default}
/* El contenedor de Turnstile no reserva alto porque en el caso normal
   no se dibuja nada: el widget va en modo interaction-only y solo
   aparece si Cloudflare decide que hace falta un desafio. Cuando
   aparece, el margen de arriba lo separa del textarea. Si tuviera un
   min-height fijo, quedaria un hueco vacio en cada visita. */
#upt-captcha:not(:empty){margin-bottom:18px}

.dlg-aviso{font-size:14px;border-radius:3px;padding:11px 13px;margin-top:16px}
.dlg-aviso.mal{background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.4);color:#FFC9C9}
.dlg-ok{text-align:center;padding:12px 0 4px}
.dlg-ok .ico-ok{width:46px;height:46px;border-radius:999px;display:grid;place-items:center;
  margin:0 auto 16px;background:rgba(46,207,196,.12);border:1px solid rgba(46,207,196,.45);
  color:var(--verde);font-size:22px}
.dlg-ok h2{margin-bottom:8px}
.dlg-ok p{color:var(--niebla);font-size:15px}

@media (max-width:480px){
  .dlg{width:100vw;max-width:100vw;max-height:100dvh;height:100dvh;border:0;border-radius:0}
}
`;

/**
 * El markup de la ventana. Va antes de </body>, una sola vez por página.
 * El dialog arranca cerrado; lo abre contactoScript.
 *
 * El contenedor del captcha queda vacio en el caso normal: el widget va en
 * modo interaction-only y solo se dibuja si Cloudflare pide un desafio.
 */
export function contactoHtml(l: Idioma, siteKey: string, correo: string): string {
  const x = T[l];
  return `
<dialog id="upt-dlg" class="dlg" aria-labelledby="upt-dlg-t">
  <button type="button" class="dlg-x" data-cerrar aria-label="${x.cerrar}">&times;</button>
  <div class="dlg-caja">
    <form id="upt-form" novalidate>
      <h2 id="upt-dlg-t">${x.titulo}</h2>
      <p class="dlg-bajada">${x.bajada}</p>

      <label class="campo">
        <span>${x.nombre}</span>
        <input name="nombre" type="text" required maxlength="${LIMITES.nombre}"
               autocomplete="name" enterkeyhint="next">
      </label>

      <label class="campo">
        <span>${x.correo}</span>
        <input name="correo" type="email" required maxlength="${LIMITES.correo}"
               autocomplete="email" inputmode="email" enterkeyhint="next">
      </label>

      <label class="campo">
        <span>${x.mensaje}</span>
        <textarea name="mensaje" required minlength="${MENSAJE_MINIMO}"
                  maxlength="${LIMITES.mensaje}"></textarea>
        <span class="campo-ayuda">${x.ayudaMensaje}</span>
      </label>

      <div id="upt-captcha" data-sitekey="${siteKey}"></div>

      <div class="dlg-pie">
        <button type="submit" class="boton boton-1" data-enviar>${x.enviar}</button>
      </div>

      <p class="dlg-aviso mal" id="upt-error" hidden></p>
    </form>

    <div class="dlg-ok" id="upt-ok" hidden>
      <div class="ico-ok" aria-hidden="true">&check;</div>
      <h2>${x.okTitulo}</h2>
      <p>${x.okTexto}</p>
      <div class="dlg-pie" style="justify-content:center">
        <button type="button" class="boton boton-2" data-cerrar>${x.cerrar}</button>
      </div>
    </div>
  </div>
</dialog>
<script type="application/json" id="upt-textos">${JSON.stringify({
    enviar: x.enviar,
    enviando: x.enviando,
    campos: x.errCampos,
    captcha: x.errCaptcha,
    envio: x.errEnvio + correo + '.',
    red: x.errRed + correo + '.',
    config: x.errConfig + correo + '.',
    idioma: l,
  })}</script>`;
}

export const contactoScript = `
(function () {
  var dlg = document.getElementById('upt-dlg');
  var form = document.getElementById('upt-form');
  var capt = document.getElementById('upt-captcha');
  var crudo = document.getElementById('upt-textos');
  if (!dlg || !form || !capt || !crudo || !dlg.showModal) return;

  var T = JSON.parse(crudo.textContent);
  var siteKey = capt.getAttribute('data-sitekey');
  if (!siteKey) return;

  var elError = document.getElementById('upt-error');
  var elOk = document.getElementById('upt-ok');
  var btn = form.querySelector('[data-enviar]');

  var widget = null;      // id del widget de Turnstile, para poder resetearlo
  var cargando = false;
  var token = '';         // lo deja el callback, no se lee del widget
  var esperando = false;  // hay un envio aguantando a que llegue el token
  var reloj = 0;

  // Turnstile se baja la PRIMERA VEZ que se abre la ventana, no al cargar la
  // página. El que nunca abre el formulario no le pide nada a Cloudflare, y la
  // home sigue con una sola peticion propia.
  function cargarCaptcha() {
    if (widget !== null || cargando) return;
    cargando = true;
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.defer = true;
    s.onload = function () {
      cargando = false;
      if (!window.turnstile) return;
      widget = window.turnstile.render(capt, {
        sitekey: siteKey,
        theme: 'dark',
        // INVISIBLE EN EL CASO NORMAL. Con interaction-only el desafio corre
        // igual y emite el token, pero el recuadro solo se dibuja si
        // Cloudflare decide que hace falta que la persona haga algo. Para eso
        // el widget tiene que estar creado como "Invisible" en el panel de
        // Cloudflare: si esta como "Managed", el recuadro aparece igual.
        appearance: 'interaction-only',
        callback: recibirToken,
        'error-callback': function () { token = ''; soltarEspera('captcha'); },
        'expired-callback': function () { token = ''; }
      });
    };
    s.onerror = function () { cargando = false; };
    document.head.appendChild(s);
  }

  // El token deja de leerse con getResponse() en el momento del submit y pasa
  // a llegar por callback. Con el widget invisible el desafio puede tardar un
  // instante, y preguntar justo cuando la persona aprieta Enviar devolvia
  // vacio y mostraba "no se pudo verificar" con todo funcionando bien.
  function recibirToken(t) {
    token = t || '';
    if (esperando && token) { esperando = false; clearTimeout(reloj); enviar(); }
  }

  function soltarEspera(clave) {
    if (!esperando) return;
    esperando = false;
    clearTimeout(reloj);
    ocupado(false);
    fallar(clave);
  }

  function abrir() {
    elError.hidden = true;
    elOk.hidden = true;
    form.hidden = false;
    esperando = false;
    clearTimeout(reloj);
    ocupado(false);
    cargarCaptcha();
    dlg.showModal();
    // El foco al primer campo, no al botón de cerrar, que es donde lo pone el
    // navegador por ser el primer elemento enfocable del markup.
    var primero = form.querySelector('input[name=nombre]');
    if (primero) primero.focus();
  }

  function ocupado(si) {
    btn.disabled = si;
    btn.textContent = si ? T.enviando : T.enviar;
  }

  function fallar(clave) {
    // El codigo crudo a la consola. El texto que ve el visitante es
    // deliberadamente vago; el que esta depurando necesita saber CUAL de los
    // cuatro fallos fue, y sin esto hay que ir al log del Worker para algo que
    // el navegador ya sabe.
    console.error('[contacto] error:', clave);
    elError.textContent = T[clave] || T.envio;
    elError.hidden = false;
    // El token es de un solo uso: despues de cualquier fallo hay que pedir
    // otro o el segundo intento lo rechaza el servidor.
    token = '';
    if (widget !== null && window.turnstile) window.turnstile.reset(widget);
  }

  // Los botones siguen siendo mailto: en el HTML. Esto los intercepta. Sin
  // JavaScript, o si Turnstile no carga, el mailto sigue funcionando como
  // antes — el formulario es una mejora encima, no un reemplazo que puede
  // dejar la pagina sin forma de contacto.
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="mailto:"]') : null;
    if (!a) return;
    e.preventDefault();
    abrir();
  });

  dlg.addEventListener('click', function (e) {
    if (e.target.closest('[data-cerrar]')) { dlg.close(); return; }
    // Clic en el ::backdrop: el target es el propio <dialog>.
    if (e.target === dlg) dlg.close();
  });

  function enviar() {
    var datos = new FormData(form);
    ocupado(true);

    fetch('/api/contacto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: (datos.get('nombre') || '').trim(),
        correo: (datos.get('correo') || '').trim(),
        mensaje: (datos.get('mensaje') || '').trim(),
        idioma: T.idioma,
        token: token
      })
    })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'envio' }; }); })
      .then(function (d) {
        ocupado(false);
        if (d && d.ok) {
          form.hidden = true;
          elOk.hidden = false;
          form.reset();
          token = '';
          if (widget !== null && window.turnstile) window.turnstile.reset(widget);
          return;
        }
        fallar((d && d.error) || 'envio');
      })
      .catch(function () { ocupado(false); fallar('red'); });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    elError.hidden = true;

    var datos = new FormData(form);
    var nombre = (datos.get('nombre') || '').trim();
    var correo = (datos.get('correo') || '').trim();
    var mensaje = (datos.get('mensaje') || '').trim();
    if (!nombre || !correo || mensaje.length < 10) { fallar('campos'); return; }

    if (token) { enviar(); return; }

    // Todavia no llego el token: se espera al callback en vez de fallar. El
    // boton queda en "Enviando…", que es lo que esta pasando de verdad.
    esperando = true;
    ocupado(true);
    clearTimeout(reloj);
    reloj = setTimeout(function () { soltarEspera('captcha'); }, 12000);
  });
})();
`;
