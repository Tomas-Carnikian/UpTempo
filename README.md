# Uptempo

Turnos 24/7 para negocios de turnos en Montevideo. Un asistente que atiende el WhatsApp
del negocio las 24 horas, agenda en Google Calendar y avisa cuándo hay que pasarle la
conversación a una persona.

**Un solo sistema para todos los clientes.** La configuración de cada negocio vive en la
base de datos; agregar un cliente es insertar filas. Nunca se clona el código.

## Carpetas

| | |
|---|---|
| `db/` | esquema de Postgres, seed del negocio de prueba y test de aislamiento |
| `worker/` | el Worker: asistente web + WhatsApp, página de turnos y panel |

Cada carpeta tiene su propio README con el detalle.

## Stack

Cloudflare Workers (TypeScript + Hono) · Supabase (Postgres + Auth) · Cloud API de Meta ·
Google Calendar por cuenta de servicio · Claude para el asistente.

Las decisiones y sus porqués están en el proyecto de Claude, en
`claude/uptempo-paso-0-stack.md`.

## Reglas que no se rompen

1. Un solo flujo multi-cliente. La config va en la base, no en el código.
2. API oficial de WhatsApp siempre. Nunca una librería no oficial.
3. El asistente no interpreta fotos, no da consejo clínico y no inventa un precio.
   Estas tres son **código**, no instrucciones al modelo.
4. Datos de salud bajo la ley 18.331: cuerpo de mensajes 90 días como máximo, teléfono
   hasheado con pepper, cada cliente ve solo lo suyo.

## Poner a andar

```bash
# 1. Base de datos: correr db/001_schema.sql y db/002_seed_clinica_sole.sql en Supabase
# 2. Worker
cd worker
npm install
cp .dev.vars.example .dev.vars   # completar las cuatro claves
npm run test
npm run dev                      # http://localhost:8787/c/clinicasole
```

## Los secretos no van acá

`.dev.vars` está en `.gitignore` y nunca se sube. En producción van con
`npx wrangler secret put NOMBRE`.

Si alguna vez se sube un secreto por error, **no alcanza con borrarlo en el commit
siguiente**: queda en la historia del repo. Hay que rotar la clave en Supabase o en
Anthropic, no solo borrar el archivo.
