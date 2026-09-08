import type { Negocio, Servicio } from './tipos';

/**
 * La pagina de turnos. Plantilla fija, siete secciones, siempre en
 * el mismo orden. Lo unico que cambia entre un cliente y otro:
 * logo, dos colores, fotos, servicios con precios, horarios,
 * direccion y el link de WhatsApp. Nada mas, nunca.
 *
 * Su unico trabajo es mostrar precios y abrir WhatsApp. No reemplaza
 * la web que el negocio ya tenga.
 *
 * Rapida por no cargar nada: HTML y CSS en linea, sin frameworks,
 * sin fuentes de terceros, y el mapa con loading="lazy" para que no
 * pese en la primera pintura ni le pase la IP del visitante a nadie
 * antes de que llegue a esa parte de la pagina.
 */

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m] as string));
}

/** '+598 99 000 000' -> '59899000000' */
function numeroWa(n: Negocio): string {
  return (n.cliente.telefono_display ?? '').replace(/[^0-9]/g, '');
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

export function paginaTurnos(n: Negocio): string {
  const c = n.cliente;
  const fotos = Array.isArray(c.fotos) ? c.fotos : [];
  const horarios = horariosLegibles(n);
  const servicios = n.servicios; // ya vienen filtrados por activo y ordenados

  const waGeneral = linkWa(n, `Hola! Quiero consultar por un turno en ${c.nombre}.`);
  const iniciales = c.nombre.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.nombre)}${c.direccion ? ' · Turnos' : ''}</title>
<meta name="description" content="${esc(c.descripcion_corta ?? c.nombre)}">
${c.estado === 'demo' ? '<meta name="robots" content="noindex, nofollow">' : ''}
<style>
  :root {
    --primario: ${esc(c.color_primario || '#2f4858')};
    --secundario: ${esc(c.color_secundario || '#d98ca5')};
    --wa: #25d366;
    --tinta: #14181c;
    --tinta-2: #59636e;
    --tinta-3: #8b949e;
    --plano: #ffffff;
    --piso: #f6f5f3;
    --linea: #e6e3de;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; color: var(--tinta); background: var(--plano);
         font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .caja { max-width: 720px; margin: 0 auto; padding: 0 18px; }
  a { color: inherit; }

  /* 1. barra */
  .barra { position: sticky; top: 0; z-index: 10; background: var(--plano);
           border-bottom: 1px solid var(--linea); }
  .barra .caja { display: flex; align-items: center; gap: 10px; height: 60px; }
  .logo { width: 36px; height: 36px; border-radius: 9px; background: var(--primario);
          color: #fff; display: grid; place-items: center; font-weight: 650; font-size: 14px;
          flex: none; overflow: hidden; }
  .logo img { width: 100%; height: 100%; object-fit: cover; }
  .marca { font-weight: 620; font-size: 17px; letter-spacing: -.01em; }
  .wa { margin-left: auto; background: var(--wa); color: #fff; text-decoration: none;
        padding: 9px 14px; border-radius: 999px; font-size: 14px; font-weight: 600;
        white-space: nowrap; }

  /* 2. encabezado */
  .cabecera { padding: 40px 0 28px; }
  .cabecera h1 { font-size: 30px; line-height: 1.2; margin: 0 0 10px; letter-spacing: -.02em; }
  .cabecera p { color: var(--tinta-2); margin: 0 0 22px; font-size: 17px; }
  .boton-grande { display: inline-block; background: var(--wa); color: #fff;
                  text-decoration: none; padding: 15px 26px; border-radius: 999px;
                  font-size: 17px; font-weight: 620; }

  /* 3. fotos */
  .fotos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0 4px; }
  @media (max-width: 560px) { .fotos { grid-template-columns: repeat(2, 1fr); } }
  .foto { aspect-ratio: 4/3; border-radius: 10px; overflow: hidden; background: var(--piso); }
  .foto img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .hueco { border: 1px dashed var(--linea); display: grid; place-items: center;
           color: var(--tinta-3); font-size: 12px; text-align: center; gap: 4px; }
  .hueco span { display: block; font-size: 20px; opacity: .5; }
  .pie-fotos { color: var(--tinta-3); font-size: 12.5px; margin: 6px 0 0; }

  /* 4. servicios — la sección que importa */
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .07em;
       color: var(--tinta-3); font-weight: 620; margin: 40px 0 14px; }
  .servicio { display: flex; align-items: center; gap: 14px; padding: 15px 0;
              border-top: 1px solid var(--linea); }
  .servicio:last-child { border-bottom: 1px solid var(--linea); }
  .servicio .datos { flex: 1; min-width: 0; }
  .servicio .nombre { font-weight: 580; }
  .servicio .detalle { color: var(--tinta-3); font-size: 13.5px; margin-top: 2px; }
  .servicio .precio { font-weight: 650; font-size: 17px; white-space: nowrap;
                      font-variant-numeric: tabular-nums; }
  .servicio .pedir { background: var(--primario); color: #fff; text-decoration: none;
                     padding: 8px 14px; border-radius: 999px; font-size: 13.5px;
                     font-weight: 600; white-space: nowrap; flex: none; }
  @media (max-width: 520px) {
    .servicio { flex-wrap: wrap; gap: 8px 14px; }
    .servicio .datos { flex-basis: 100%; }
  }

  /* 5. horarios, dirección, mapa */
  .info { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
  @media (max-width: 560px) { .info { grid-template-columns: 1fr; gap: 18px; } }
  .info h3 { font-size: 15px; margin: 0 0 8px; font-weight: 620; }
  .info ul { list-style: none; margin: 0; padding: 0; color: var(--tinta-2); font-size: 15px; }
  .info li { padding: 3px 0; }
  .mapa { margin-top: 16px; border-radius: 12px; overflow: hidden;
          border: 1px solid var(--linea); background: var(--piso); }
  .mapa iframe { display: block; width: 100%; height: 240px; border: 0; }
  .comollegar { display: inline-block; margin-top: 10px; font-size: 14.5px;
                color: var(--primario); font-weight: 580; }

  /* 6-7. reseñas y pie */
  .resenas a { display: inline-block; border: 1px solid var(--linea); border-radius: 10px;
               padding: 12px 16px; text-decoration: none; font-size: 15px; }
  .cierre { margin: 46px 0 0; padding: 34px 0 40px; border-top: 1px solid var(--linea);
            text-align: center; }
  .cierre p { color: var(--tinta-2); margin: 0 0 16px; }
  .creditos { color: var(--tinta-3); font-size: 12.5px; margin-top: 26px; }

  .demo { background: #fef3c7; color: #78350f; font-size: 13px; text-align: center;
          padding: 8px 14px; }
</style>
</head>
<body>

${c.estado === 'demo'
  ? '<div class="demo">Página de demostración. Este negocio y sus datos son de ejemplo.</div>'
  : ''}

<!-- 1. barra -->
<div class="barra"><div class="caja">
  <div class="logo">${c.logo_url ? `<img src="${esc(c.logo_url)}" alt="">` : esc(iniciales)}</div>
  <div class="marca">${esc(c.nombre)}</div>
  <a class="wa" href="${esc(waGeneral)}" rel="noopener">WhatsApp</a>
</div></div>

<!-- 2. encabezado -->
<header class="caja cabecera">
  <h1>${esc(c.descripcion_corta ?? c.nombre)}</h1>
  <p>${esc(c.direccion ?? '')}</p>
  <a class="boton-grande" href="${esc(waGeneral)}" rel="noopener">Pedir turno por WhatsApp</a>
</header>

<!-- 3. fotos -->
<section class="caja">
  <div class="fotos">
    ${(fotos.length ? fotos.slice(0, 4).map((f: string) =>
        `<div class="foto"><img src="${esc(f)}" alt="" loading="lazy"></div>`)
      : [1, 2, 3, 4].map(i =>
        `<div class="foto hueco"><div><span>▨</span>Foto ${i}</div></div>`)
    ).join('\n    ')}
  </div>
  ${fotos.length ? '' :
    '<p class="pie-fotos">Acá van 3 o 4 fotos del local o de los tratamientos, recortadas a 4:3.</p>'}
</section>

<!-- 4. servicios -->
<section class="caja">
  <h2>Servicios y precios</h2>
  ${servicios.map(s => `<div class="servicio">
    <div class="datos">
      <div class="nombre">${esc(s.nombre)}</div>
      <div class="detalle">${esc(s.duracion_min)} min${s.precio_nota ? ' · ' + esc(s.precio_nota) : ''}</div>
    </div>
    <div class="precio">${esc(precioDe(s))}</div>
    <a class="pedir" rel="noopener"
       href="${esc(linkWa(n, `Hola! Quiero consultar por ${s.nombre}.`))}">Consultar</a>
  </div>`).join('\n  ')}
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
      ${c.formas_pago ? `<h3 style="margin-top:14px">Formas de pago</h3>
      <ul><li>${esc(c.formas_pago)}</li></ul>` : ''}
    </div>
  </div>
  ${c.lat !== null && c.lon !== null ? `
  <div class="mapa">
    <iframe loading="lazy" referrerpolicy="no-referrer"
      title="Mapa de ${esc(c.nombre)}"
      src="https://www.openstreetmap.org/export/embed.html?bbox=${Number(c.lon) - 0.004}%2C${Number(c.lat) - 0.002}%2C${Number(c.lon) + 0.004}%2C${Number(c.lat) + 0.002}&amp;layer=mapnik&amp;marker=${c.lat}%2C${c.lon}"></iframe>
  </div>
  <a class="comollegar" rel="noopener"
     href="${esc(c.maps_url ?? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lon}`)}">Cómo llegar →</a>
  ` : (c.maps_url ? `<a class="comollegar" rel="noopener" href="${esc(c.maps_url)}">Cómo llegar →</a>` : '')}
</section>

<!-- 6. reseñas -->
${c.google_place_id ? `<section class="caja resenas">
  <h2>Reseñas</h2>
  <a rel="noopener" href="https://search.google.com/local/reviews?placeid=${esc(c.google_place_id)}">
    Ver las reseñas en Google →</a>
</section>` : ''}

<!-- 7. cierre -->
<footer class="caja cierre">
  <p>Escribinos y te damos hora.</p>
  <a class="boton-grande" href="${esc(waGeneral)}" rel="noopener">Pedir turno por WhatsApp</a>
  <div class="creditos">${esc(c.nombre)}${c.direccion ? ' · ' + esc(c.direccion) : ''}</div>
</footer>

</body>
</html>`;
}
