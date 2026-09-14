// worker/src/fondo.ts
//
// Fondo animado de uptempo.uy — port vanilla de <MoltenMetal /> de React Bits.
//
// ESTA VERSIÓN ES FIEL AL EJEMPLO. Los parámetros de abajo son exactamente los
// que vinieron en la configuración de React Bits, incluidos los colores azules
// y la opacidad 1.0. Lo único que cambia respecto del componente original es
// cómo se monta (sin React, sin ogl) y las tres cosas de la lista de abajo.
// La versión anterior traducía todo a la paleta de la marca y bajaba la
// opacidad; eso se sacó.
//
// QUÉ SE CAMBIÓ RESPECTO DEL COMPONENTE ORIGINAL
// ----------------------------------------------
// 1. Sin ogl. Son ~50 líneas de WebGL2 crudo: un triángulo a pantalla completa
//    y un programa. La librería pesa ~50 KB y no agrega nada acá.
// 2. Sin React.
// 3. Se borró el camino `lightMode` (y con él uBackgroundColor y uLightMode):
//    es para fondos claros y uptempo es tinta. El GLSL que queda es idéntico
//    al original línea por línea.
// El resto —el shader, la curva de color, el bucle de dominio— no se tocó.
//
// POR QUÉ ESTE ARCHIVO EXISTE Y NO ESTÁ ADENTRO DE web.ts
// ------------------------------------------------------
// web.ts es un template literal gigante. El GLSL y el cargador tienen que
// vivir afuera de él: un backtick perdido adentro de ese literal corta el
// archivo entero y el error apunta a otro lado (ya pasó con panel.ts y con
// web.ts). Acá cada pieza es su propio literal y en web.ts entran por
// interpolación normal.

type Rgb = [number, number, number];

function hexARgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbAHex([r, g, b]: Rgb): string {
  const dos = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return '#' + dos(r) + dos(g) + dos(b);
}

/** `frente` compuesto sobre `fondo` con opacidad `alfa`. */
export function componer(frente: string, fondo: string, alfa: number): string {
  const f = hexARgb(frente);
  const d = hexARgb(fondo);
  return rgbAHex([
    f[0] * alfa + d[0] * (1 - alfa),
    f[1] * alfa + d[1] * (1 - alfa),
    f[2] * alfa + d[2] * (1 - alfa),
  ]);
}

// ---------------------------------------------------------------------------
// LOS PARÁMETROS — copiados del ejemplo de React Bits, uno a uno.
//
//   color1="#274eff"  color2="#9fbdff"  color3="#5a6cff"
//   speed={0.35}      scale={4}         detail={3}
//   glow={1.6}        coreSize={0.1}    swirl={1}
//   fold={-0.2}       blackPoint={0.05} brightness={1.3}
//   colorMode="molten"  grain={false}   grainIntensity={0.05}
//   mouseInteraction={false}  mouseStrength={0.3}  opacity={1.0}
//
// Todo llega al navegador por data-atributos del <div id="fondo">, así que
// este archivo es la única fuente de verdad y no hay números repetidos adentro
// del script.
// ---------------------------------------------------------------------------

export const FONDO_COLOR_1 = '#274eff'; // sombra — el brillo tenue
export const FONDO_COLOR_2 = '#9fbdff'; // medios — los filamentos
export const FONDO_COLOR_3 = '#5a6cff'; // núcleos calientes

export const FONDO_OPACIDAD = 1.0;

const P = {
  velocidad: 0.35,
  escala: 4,
  detalle: 3,
  glow: 1.6,
  nucleo: 0.1,
  swirl: 1,
  fold: -0.2,
  negro: 0.05,
  brillo: 1.3,
  modoColor: 0,          // molten. (1 = ember, 2 = frost)
  grano: 0,              // grain={false}
  granoIntensidad: 0.05,
  mouseFuerza: 0,        // mouseInteraction={false}

  // Resolución del buffer de dibujo, en múltiplos del viewport en píxeles CSS.
  //   1   = un píxel de shader por píxel CSS. Es el default acá.
  //   2   = lo que usa el demo de React Bits en una pantalla retina. Se ve
  //         idéntico en un campo suave como este y cuesta 4 veces más.
  //   0.6 = más barato y apenas más blando. Si en un notebook viejo se nota
  //         que el ventilador arranca, esta es la perilla.
  resolucion: 1,
};

/**
 * El color de fondo en el peor píxel posible: color3 compuesto sobre tinta al
 * FONDO_OPACIDAD. Con opacidad 1.0 da directamente `#5a6cff`.
 *
 * El shader escribe premultiplicado —`vec4(col * a, a)`— y `a` se clampea a
 * 1.0 antes de multiplicarse por `uOpacity`, así que el alfa máximo de
 * cualquier píxel es exactamente FONDO_OPACIDAD y el color más brillante
 * posible es color3. El peor caso es un número, no una estimación.
 *
 * ESTO ES LO QUE TIENE QUE COMER EL CHEQUEO DE CONTRASTE para el texto que va
 * directo sobre el fondo de la página. Adentro de una tarjeta (#1C222D) o de
 * cualquier superficie opaca no cambia nada.
 *
 * Con la configuración de React Bits tal cual, el texto niebla sobre el fondo
 * de la página NO llega a 4,5:1 en las zonas encendidas. Si el chequeo lo
 * marca, la perilla es FONDO_OPACIDAD — ver el bloque de arriba de fondoCss.
 */
export const FONDO_PEOR_CASO = componer(FONDO_COLOR_3, '#0B0E14', FONDO_OPACIDAD);

// ---------------------------------------------------------------------------
// El fragment shader. Idéntico al de React Bits salvo por el borrado de la
// rama `lightMode`.
//
// Va en un <script type="x-shader/x-fragment"> dentro del HTML y el cargador lo
// lee con textContent. POR QUÉ EN UN SCRIPT TAG Y NO EN UNA STRING DE JS: para
// meterlo en JS haría falta un template literal adentro del template literal de
// web.ts — o sea, un backtick escapado por cada uno. Exactamente el error que
// ya costó una tarde. Como script tag es texto plano y no se escapa nada.
//
// OJO: `#version 300 es` tiene que ser lo primero del shader. El textContent de
// un script tag arranca con el salto de línea que sigue a `<script>`, por eso el
// cargador hace replace(/^\s+/, '') antes de compilar. Sin eso, algunos drivers
// lo rechazan y el error no dice por qué.
// ---------------------------------------------------------------------------

export const fondoFragmentGlsl = `#version 300 es
precision highp float;

uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uScale;
uniform float uDetail;
uniform float uGlow;
uniform float uCoreSize;
uniform float uSwirl;
uniform float uFold;
uniform float uBlackPoint;
uniform float uBrightness;
uniform float uColorMode;
uniform float uGrain;
uniform float uGrainIntensity;
uniform float uOpacity;
uniform vec2 uMouse;
uniform float uMouseStrength;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;

out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float time = iTime * uSpeed;
  vec2 p = uScale * ((gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y) - 0.5;
  p += (uMouse - 0.5) * uMouseStrength * 2.0;

  vec2 i = p;
  float c = 0.0;
  float r = length(p + vec2(sin(time), sin(time * 0.3 + 5.0)) * 0.5);
  float d = length(p);
  float rot = d + time + p.x * uSwirl;

  float cosRot = cos(rot);
  mat2 warp = mat2(cos(rot - sin(time / 5.0)), sin(rot), -sin(cosRot - time), cosRot) * uFold;
  float glowCore = uGlow * uCoreSize;

  for (float n = 0.0; n < 8.0; n++) {
    if (n >= uDetail) break;
    p *= warp;
    float t = r - time / (n + 3.0);
    i -= p + vec2(cos(t - i.x - r) + sin(t + i.y), sin(t - i.y) + cos(t + i.x) + r);
    c += glowCore / length(vec2(sin(i.x + t), cos(i.y + t)));
  }

  c /= 6.0;

  float intensity = max(c - uBlackPoint, 0.0) * uBrightness;
  float g = clamp(intensity, 0.0, 1.0);

  float mid = 0.5;
  if (uColorMode > 1.5) {
    mid = 0.65;
  } else if (uColorMode > 0.5) {
    mid = 0.35;
  }

  vec3 col = mix(uColor1, uColor2, smoothstep(0.0, mid, g));
  col = mix(col, uColor3, smoothstep(mid, 1.0, g));

  float a = g;
  if (uGrain > 0.5) {
    a += (hash(gl_FragCoord.xy + iTime) - 0.5) * uGrainIntensity;
  }
  a = clamp(a, 0.0, 1.0) * uOpacity;

  fragColor = vec4(col * a, a);
}
`;

// ---------------------------------------------------------------------------
// El CSS. Se concatena adentro del <style> que web.ts ya tiene.
// ---------------------------------------------------------------------------

export const fondoCss = `
/* El fondo animado. z-index:-1 lo deja debajo de todo el contenido del body
   sin tocar el orden de apilado de nada. Para que eso funcione, body no puede
   crear contexto de apilado propio: nada de isolation, transform ni opacity
   menor a 1 en body. (El isolation:isolate de los títulos de sección está en
   los h2, no en body, así que no molesta.)

   La tinta se movió a html. Si queda un background opaco en body, tapa el
   fondo y el síntoma es "no se ve nada" sin ningún error en consola. */
html { background: var(--tinta); }
body { background: transparent; }

#fondo {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;   /* sin esto el canvas se come todos los clicks */
  background-color: var(--tinta);
  /* Respaldo estático: es lo que se ve si no hay WebGL2, si el contexto se
     pierde, o durante el primer cuadro. La página nunca queda en negro plano
     por una falla de la GPU. */
  background-image:
    radial-gradient(70% 55% at 18% 12%, rgba(90, 108, 255, 0.28), transparent 70%),
    radial-gradient(60% 50% at 82% 68%, rgba(39, 78, 255, 0.24), transparent 72%);
}
#fondo.fondo-gl { background-image: none; }
#fondo canvas { display: block; width: 100%; height: 100%; }

/* LA PERILLA DE LEGIBILIDAD.

   Con la configuración de React Bits tal cual (opacidad 1.0, azules fuertes),
   el texto que va DIRECTO sobre el fondo de la página queda por debajo de
   4,5:1 en las zonas encendidas. El texto adentro de tarjetas no: esas
   superficies son opacas y tapan el fondo.

   Este velo es lo que lo arregla sin tocar el shader: oscurece el fondo y deja
   el efecto visible. Está en 0 —apagado, fiel al ejemplo—. Subilo hasta que el
   chequeo de contraste pase; entre 0.55 y 0.7 el efecto se sigue viendo bien.
   Es preferible a bajar la opacidad del shader, porque el velo no cambia el
   dibujo, solo lo apaga parejo. */
#fondo::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--tinta);
  opacity: 0;
}
`;

// ---------------------------------------------------------------------------
// El HTML. Va como primer hijo de <body>.
// ---------------------------------------------------------------------------

export function fondoHtml(): string {
  const d = [
    'data-op="' + FONDO_OPACIDAD + '"',
    'data-c1="' + FONDO_COLOR_1 + '"',
    'data-c2="' + FONDO_COLOR_2 + '"',
    'data-c3="' + FONDO_COLOR_3 + '"',
    'data-speed="' + P.velocidad + '"',
    'data-scale="' + P.escala + '"',
    'data-detail="' + P.detalle + '"',
    'data-glow="' + P.glow + '"',
    'data-core="' + P.nucleo + '"',
    'data-swirl="' + P.swirl + '"',
    'data-fold="' + P.fold + '"',
    'data-black="' + P.negro + '"',
    'data-bright="' + P.brillo + '"',
    'data-mode="' + P.modoColor + '"',
    'data-grain="' + P.grano + '"',
    'data-grainint="' + P.granoIntensidad + '"',
    'data-mouse="' + P.mouseFuerza + '"',
    'data-res="' + P.resolucion + '"',
  ].join(' ');

  return (
    '<div id="fondo" aria-hidden="true" ' + d + '></div>\n' +
    '<script type="x-shader/x-fragment" id="fondo-frag">' + fondoFragmentGlsl + '</script>'
  );
}

// ---------------------------------------------------------------------------
// El cargador. Va en un <script> antes de </body>.
//
// REGLA PARA EDITAR ESTA STRING: sin backticks y sin ${ adentro. Es un template
// literal y cualquiera de los dos lo rompe o interpola algo que no existe. Por
// eso todo va con comillas simples y concatenación.
// ---------------------------------------------------------------------------

export const fondoScript = `
(function () {
  var cont = document.getElementById('fondo');
  var src = document.getElementById('fondo-frag');
  if (!cont || !src) return;

  // DIAGNÓSTICO. Poner ?fondo=debug en la URL y mirar la consola: dice por qué
  // camino se fue el fondo. Es lo primero que hay que hacer si se ve estático
  // o no se ve. Sin el parámetro no imprime nada.
  var debug = location.search.indexOf('fondo=debug') !== -1;
  var log = function (m) { if (debug) console.log('[fondo] ' + m); };

  var n = function (k, def) {
    var v = parseFloat(cont.getAttribute('data-' + k));
    return isNaN(v) ? def : v;
  };
  var rgb = function (k) {
    var h = (cont.getAttribute('data-' + k) || '#000000').replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255
    ];
  };

  var cv = document.createElement('canvas');
  var gl = cv.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power'
  });
  if (!gl) {
    // Sin WebGL2 queda el degradado estático del CSS y no pasa nada más.
    log('SIN WEBGL2 -> se ve el degradado estatico del CSS. Esto explica un fondo sin movimiento.');
    return;
  }

  var compilar = function (tipo, codigo) {
    var s = gl.createShader(tipo);
    gl.shaderSource(s, codigo);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[fondo] shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };

  var vs = compilar(
    gl.VERTEX_SHADER,
    '#version 300 es\\nin vec2 position;\\nvoid main(){ gl_Position = vec4(position, 0.0, 1.0); }'
  );
  // El textContent del script tag arranca con el salto de línea que sigue a
  // <script>, y #version tiene que ser lo primero.
  var fs = compilar(gl.FRAGMENT_SHADER, src.textContent.replace(/^\\s+/, ''));
  if (!vs || !fs) return;

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('[fondo] link:', gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  // Un solo triángulo que tapa el viewport. Más barato que dos y sin costura en
  // la diagonal.
  var vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var aPos = gl.getAttribLocation(prog, 'position');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var u = function (nombre) { return gl.getUniformLocation(prog, nombre); };
  var uRes = u('iResolution');
  var uTime = u('iTime');
  var uMouse = u('uMouse');

  var c1 = rgb('c1'), c2 = rgb('c2'), c3 = rgb('c3');
  gl.uniform3f(u('uColor1'), c1[0], c1[1], c1[2]);
  gl.uniform3f(u('uColor2'), c2[0], c2[1], c2[2]);
  gl.uniform3f(u('uColor3'), c3[0], c3[1], c3[2]);
  gl.uniform1f(u('uSpeed'), n('speed', 0.35));
  gl.uniform1f(u('uScale'), n('scale', 4));
  gl.uniform1f(u('uDetail'), n('detail', 3));
  gl.uniform1f(u('uGlow'), n('glow', 1.6));
  gl.uniform1f(u('uCoreSize'), Math.max(n('core', 0.1), 0.001));
  gl.uniform1f(u('uSwirl'), n('swirl', 1));
  gl.uniform1f(u('uFold'), n('fold', -0.2));
  gl.uniform1f(u('uBlackPoint'), n('black', 0.05));
  gl.uniform1f(u('uBrightness'), n('bright', 1.3));
  gl.uniform1f(u('uColorMode'), n('mode', 0));
  gl.uniform1f(u('uGrain'), n('grain', 0));
  gl.uniform1f(u('uGrainIntensity'), n('grainint', 0.05));
  gl.uniform1f(u('uOpacity'), n('op', 1));

  gl.clearColor(0, 0, 0, 0);
  cont.appendChild(cv);
  cont.classList.add('fondo-gl');

  var RES = n('res', 1);

  // El buffer se redimensiona con umbral a propósito. En el celular, mostrar y
  // esconder la barra de URL dispara resize todo el tiempo, y reasignar el
  // buffer de dibujo en cada uno es caro. Como el canvas se estira por CSS al
  // 100%, un buffer levemente desajustado en un campo suave como este no se ve.
  var anchoBuf = 0, altoBuf = 0;
  var medir = function (forzar) {
    var w = Math.max(1, Math.round(cont.clientWidth * RES));
    var h = Math.max(1, Math.round(cont.clientHeight * RES));
    if (!forzar && w === anchoBuf && Math.abs(h - altoBuf) < 100 * RES) return;
    anchoBuf = w; altoBuf = h;
    cv.width = w; cv.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
  };
  medir(true);

  var destino = [0.5, 0.5], actual = [0.5, 0.5];
  var fuerzaMouse = n('mouse', 0);
  // El puntero va en window: el canvas es pointer-events:none y nunca recibe
  // eventos propios. (Con mouseInteraction={false} esto queda apagado.)
  if (fuerzaMouse > 0 && window.matchMedia('(pointer: fine)').matches) {
    gl.uniform1f(u('uMouseStrength'), fuerzaMouse);
    window.addEventListener('mousemove', function (e) {
      destino[0] = e.clientX / window.innerWidth;
      destino[1] = 1 - e.clientY / window.innerHeight;
    }, { passive: true });
  } else {
    gl.uniform1f(u('uMouseStrength'), 0);
  }

  var tActual = 0;
  var dibujar = function (t) {
    gl.uniform1f(uTime, t);
    gl.uniform2f(uMouse, actual[0], actual[1]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  var raf = 0, corriendo = false, t0 = performance.now(), cuadros = 0;
  var cuadro = function (ms) {
    raf = requestAnimationFrame(cuadro);
    tActual = (ms - t0) * 0.001;
    actual[0] += 0.05 * (destino[0] - actual[0]);
    actual[1] += 0.05 * (destino[1] - actual[1]);
    dibujar(tActual);
    cuadros++;
  };
  var arrancar = function () {
    if (corriendo) return;
    corriendo = true;
    t0 = performance.now() - tActual * 1000; // sin salto al volver a la pestaña
    raf = requestAnimationFrame(cuadro);
  };
  var parar = function () {
    if (!corriendo) return;
    corriendo = false;
    cancelAnimationFrame(raf);
    raf = 0;
  };

  var pendiente = 0;
  window.addEventListener('resize', function () {
    clearTimeout(pendiente);
    pendiente = setTimeout(function () {
      medir(false);
      if (!corriendo) dibujar(tActual);
    }, 150);
  });

  // ANIMA EN TODOS LADOS, CELULAR INCLUIDO. La única excepción es que el
  // sistema operativo pida menos movimiento: ahí se dibuja un cuadro y se
  // corta. Si el fondo se ve quieto en una máquina, esto es lo primero que hay
  // que descartar — en macOS es Accesibilidad > Pantalla > Reducir movimiento,
  // en Windows Configuración > Accesibilidad > Efectos visuales > Animación.
  var reducir = window.matchMedia('(prefers-reduced-motion: reduce)');

  var aplicarMovimiento = function () {
    if (reducir.matches) {
      parar();
      dibujar(tActual || 8.4);
      log('PREFERS-REDUCED-MOTION ACTIVO -> un solo cuadro, sin animacion. Es el sistema operativo, no el codigo.');
    } else {
      arrancar();
      log('animando · WebGL2 ok · buffer ' + cv.width + 'x' + cv.height + ' · res ' + RES);
    }
  };

  if (reducir.addEventListener) {
    reducir.addEventListener('change', aplicarMovimiento);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) parar();
    else if (!reducir.matches) arrancar();
  });

  // Si la GPU se lleva el contexto (suspensión, cambio de placa, otra pestaña
  // pesada), se vuelve al degradado estático en vez de dejar un rectángulo
  // negro.
  cv.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    parar();
    cont.classList.remove('fondo-gl');
    log('CONTEXTO WEBGL PERDIDO -> volvio el degradado estatico.');
  });

  if (debug) {
    setTimeout(function () {
      log(cuadros + ' cuadros en 2 s. Si dice 0 o 1, el fondo esta quieto.');
    }, 2000);
  }

  aplicarMovimiento();
})();
`;
