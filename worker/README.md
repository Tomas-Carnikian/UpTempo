# Uptempo — el Worker

Un solo Worker para los 30 clientes. Agregar un cliente es insertar filas en la base;
no se despliega nada, no se copia nada.

## Arrancar

```bash
npm install
cp .dev.vars.example .dev.vars     # y completar los cuatro valores
npm run test                       # 27 pruebas, sin red ni base
npm run dev                        # http://localhost:8787/c/clinicasole
```

Para ver qué pasa en producción: `npm run tail`.

## Las cuatro claves de `.dev.vars`

| Clave | De dónde sale |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | ahí mismo, `service_role`. Bypassa RLS: no va nunca en el navegador |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `PEPPER_TELEFONO` | lo inventás una vez: `openssl rand -hex 32` |

En producción las mismas cuatro van con `npx wrangler secret put NOMBRE`.

El pepper **no se cambia nunca** una vez que hay datos: los hashes viejos dejan de coincidir
y las métricas de visitantes repetidos se parten al medio.

## Cómo se decide de qué negocio es un mensaje

Siempre por **cómo entró**, nunca por algo que mande el usuario:

- Web: por el subdominio (`clinicasole.uptempo.uy`) o por `/c/<slug>` en local.
- WhatsApp: por el `phone_number_id` que recibió el mensaje (paso 7).

Después es el mismo código. Un solo `responder()` para los dos canales.

## Los archivos

| Archivo | Qué hace |
|---|---|
| `index.ts` | rutas y de qué negocio es cada request |
| `db.ts` | Supabase, carga del negocio con caché de 45 s, hash del teléfono |
| `prompt.ts` | arma el prompt en dos bloques (ver abajo) |
| `agenda.ts` | huecos reales: horarios, feriados, excepciones y turnos tomados |
| `herramientas.ts` | las cinco herramientas y su ejecución |
| `cerebro.ts` | conversación, reglas duras, loop del modelo, eventos |
| `chat-web.ts` | la página de chat, que además es el demo de ventas |

## Tres cosas que conviene no tocar sin pensarlo

**El prompt va en dos bloques.** El primero —reglas, base de conocimiento y servicios— lleva
`cache_control` y es el 70-80 % de los tokens de entrada; se cobra a un décimo cuando pega la
caché. El segundo es la fecha y hora de ahora, que cambia siempre y por eso va afuera. Si se
mezclan, la caché no pega nunca y el costo por cliente salta de USD 2,80 a más de 6.

**La regla de la foto es código, no prompt.** Cuando entra una imagen, el mensaje ni siquiera
llega al modelo: se deriva y listo. Que el modelo "sepa" que no debe opinar sobre la foto de
una lesión no alcanza, porque una instrucción se puede esquivar con la frase correcta. Lo
mismo vale para el silencio de 24 h después de derivar: lo decide una fecha en la base, no
el modelo.

**Se vuelve a chequear el horario al agendar.** Entre que el asistente ofrece un hueco y la
persona lo confirma pueden pasar minutos, y en ese rato otra clienta pudo tomarlo. Por eso
`agendar_turno` llama a `estaLibre` otra vez antes de escribir.

## Lo que todavía no está

- **Google Calendar** (paso 3). La agenda ya calcula huecos reales contra la base; falta sumar
  los eventos del calendario como una fuente más de ocupación, dentro de `ocupados()` en
  `agenda.ts`, y crear el evento en `agendar_turno`. El resto no cambia.
- **WhatsApp** (paso 7). El webhook entra en `index.ts`, saca el `phone_number_id`, llama a
  `negocioPorNumero()` y usa el mismo `responder()`.
- **El aviso al dueño** cuando se deriva (paso 7): hoy la conversación se marca y se silencia,
  pero nadie le avisa todavía.
