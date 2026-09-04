-- ============================================================
--  UPTEMPO — 001_schema.sql
--  Postgres 15+ (Supabase). Re-ejecutable: se puede correr
--  varias veces seguidas sin romper nada.
--
--  Convenciones que no se rompen:
--   - Todo instante es timestamptz. Nunca timestamp a secas.
--   - dia_semana usa ISO: 1 = lunes ... 7 = domingo.
--   - El telefono del consumidor final vive en dos formas:
--       telefono      -> en claro, SOLO mientras hay obligacion
--                        operativa (conversacion viva o turno futuro).
--       telefono_hash -> siempre, para metricas.
--     El hash se calcula EN EL WORKER con un pepper secreto,
--     NUNCA en la base. Un celular uruguayo son ~10^7 combinaciones:
--     un sha256 sin pepper se revierte por fuerza bruta en segundos
--     y no protegeria nada.
--   - RLS activo en TODAS las tablas. El Worker usa service_role
--     (bypassa RLS); el panel usa anon key + JWT del usuario.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
--  1. CLIENTES (los negocios)
-- ============================================================
create table if not exists public.clientes (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique
                          check (slug ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$'),
  nombre                text not null,
  rubro                 text,
  estado                text not null default 'demo'
                          check (estado in ('demo','activo','suspendido','baja')),
  timezone              text not null default 'America/Montevideo',

  -- WhatsApp: lo que ENRUTA es el phone_number_id que manda Meta,
  -- no el numero. El numero es solo para mostrar.
  wa_phone_number_id    text unique,
  wa_business_account_id text,
  telefono_display      text,

  -- Google Calendar (cuenta de servicio + calendario compartido)
  calendar_id           text,

  -- Marca (las 5 variables de la pagina de turnos)
  color_primario        text not null default '#1f2937',
  color_secundario      text not null default '#10b981',
  logo_url              text,
  fotos                 jsonb not null default '[]'::jsonb,

  -- Ficha
  direccion             text,
  maps_url              text,
  google_place_id       text,
  formas_pago           text,
  descripcion_corta     text,

  -- Operacion
  modelo                text not null default 'claude-haiku-4-5-20251001',
  derivacion_telefono   text,
  derivacion_email      text,
  silencio_derivacion_h int  not null default 24,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on column public.clientes.slug is
  'Subdominio: <slug>.uptempo.uy. Un solo nivel — dos niveles rompen el certificado gratis.';
comment on column public.clientes.estado is
  'demo = generado por el generador de demos, sin WhatsApp, purgable.';

-- ============================================================
--  2. SERVICIOS
-- ============================================================
create table if not exists public.servicios (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  nombre         text not null,
  precio         numeric(10,2),
  precio_nota    text,
  moneda         text not null default 'UYU',
  duracion_min   int  not null check (duracion_min > 0),
  buffer_min     int  not null default 0 check (buffer_min >= 0),
  descripcion    text,
  orden          int  not null default 0,
  activo         boolean not null default true,
  agendable      boolean not null default true,
  creado_en      timestamptz not null default now(),
  unique (cliente_id, nombre)
);

comment on column public.servicios.precio_nota is
  'Texto libre para paquetes y casos raros: "paquete de 6: $U 14.500", "sin costo".';
comment on column public.servicios.buffer_min is
  'Minutos de respiro despues del turno. Se suman al buscar huecos.';
comment on column public.servicios.activo is
  'Nunca borrar un servicio: rompe el historico de turnos. Se baja con activo=false.';

create index if not exists servicios_cliente_idx
  on public.servicios (cliente_id, orden) where activo;

-- ============================================================
--  3. HORARIOS (semana base) + FERIADOS + EXCEPCIONES
-- ============================================================
create table if not exists public.horarios (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  dia_semana  int  not null check (dia_semana between 1 and 7),
  desde       time not null,
  hasta       time not null,
  check (desde < hasta),
  unique (cliente_id, dia_semana, desde)
);

comment on table public.horarios is
  'dia_semana ISO: 1=lunes ... 7=domingo. Varias filas por dia = corte de mediodia.';

-- Feriados: tabla GLOBAL, no por cliente. Los feriados uruguayos son
-- los mismos para todos: se cargan una vez y no suman ni un minuto
-- al tiempo de implementacion de un cliente nuevo.
create table if not exists public.feriados (
  fecha              date primary key,
  nombre             text not null,
  laborable          boolean not null default false,
  cierra_por_defecto boolean not null default true,
  pais               text not null default 'UY'
);

comment on column public.feriados.laborable is
  'Uruguay distingue feriados laborables (se trabaja, no se paga extra) de no laborables.';
comment on column public.feriados.cierra_por_defecto is
  'Si true, el asistente no agenda ese dia salvo que el cliente lo abra con una excepcion.';

-- Excepciones por cliente: vacaciones de enero, cierre puntual,
-- o abrir un feriado que por defecto cierra.
create table if not exists public.excepciones_horario (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  fecha       date not null,
  cerrado     boolean not null default true,
  desde       time,
  hasta       time,
  motivo      text,
  unique (cliente_id, fecha),
  check (cerrado or (desde is not null and hasta is not null and desde < hasta))
);

-- ============================================================
--  4. BASE DE CONOCIMIENTO (versionada)
-- ============================================================
create table if not exists public.base_conocimiento (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  contenido_md   text not null,
  version        int  not null default 1,
  activa         boolean not null default true,
  nota           text,
  actualizado_en timestamptz not null default now()
);

-- Una sola version activa por cliente. Si editas la base y el
-- asistente empieza a decir cosas raras, volves atras cambiando
-- que fila esta activa.
create unique index if not exists base_conocimiento_activa_idx
  on public.base_conocimiento (cliente_id) where activa;

-- ============================================================
--  5. CONVERSACIONES Y MENSAJES
-- ============================================================
create table if not exists public.conversaciones (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references public.clientes(id) on delete cascade,
  canal             text not null check (canal in ('web','whatsapp')),
  telefono_hash     text,
  telefono          text,
  nombre_contacto   text,
  estado            text not null default 'activa'
                      check (estado in ('activa','derivada','cerrada')),
  -- La regla es "silenciado 24 horas", que es un MOMENTO, no un si/no.
  -- Con un boolean habria que correr un proceso que lo apague;
  -- con la fecha el Worker solo pregunta silenciado_hasta < now().
  silenciado_hasta  timestamptz,
  motivo_derivacion text,
  iniciada_en       timestamptz not null default now(),
  ultimo_mensaje_en timestamptz not null default now(),
  purgada_en        timestamptz
);

create index if not exists conversaciones_ruteo_idx
  on public.conversaciones (cliente_id, telefono_hash, ultimo_mensaje_en desc);
create index if not exists conversaciones_panel_idx
  on public.conversaciones (cliente_id, ultimo_mensaje_en desc);

create table if not exists public.mensajes (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  rol             text not null check (rol in ('usuario','asistente','sistema','humano')),
  texto           text,
  tipo            text not null default 'texto'
                    check (tipo in ('texto','audio','imagen','documento','otro')),
  -- Idempotencia: Meta reintenta el webhook cuando no le respondes
  -- rapido. Sin esto el asistente contesta dos veces el mismo
  -- mensaje y te cobra dos llamadas al modelo.
  wa_message_id   text,
  creado_en       timestamptz not null default now()
);

create unique index if not exists mensajes_wa_id_idx
  on public.mensajes (wa_message_id) where wa_message_id is not null;
create index if not exists mensajes_conversacion_idx
  on public.mensajes (conversacion_id, creado_en);

-- ============================================================
--  6. EVENTOS (el corazon del panel)
-- ============================================================
create table if not exists public.eventos (
  id               bigint generated always as identity primary key,
  cliente_id       uuid not null references public.clientes(id) on delete cascade,
  conversacion_id  uuid references public.conversaciones(id) on delete set null,
  tipo             text not null
                     check (tipo in ('consulta','turno','derivacion','recordatorio',
                                     'cancelacion','reprogramacion','error')),
  ocurrido_en      timestamptz not null default now(),
  fuera_de_horario boolean not null default false,
  servicio         text,
  origen           text check (origen in ('whatsapp','web','pagina','cron')),
  -- Se escribe en el momento. Calcular el tiempo de respuesta
  -- despues cruzando mensajes es lento y da mal apenas hay derivaciones.
  latencia_ms      int,
  metadata         jsonb not null default '{}'::jsonb
);

create index if not exists eventos_panel_idx
  on public.eventos (cliente_id, ocurrido_en desc);
create index if not exists eventos_tipo_idx
  on public.eventos (cliente_id, tipo, ocurrido_en desc);

-- ============================================================
--  7. TURNOS
-- ============================================================
create table if not exists public.turnos (
  id                      uuid primary key default gen_random_uuid(),
  cliente_id              uuid not null references public.clientes(id) on delete cascade,
  conversacion_id         uuid references public.conversaciones(id) on delete set null,
  servicio_id             uuid references public.servicios(id) on delete set null,
  servicio_nombre         text not null,
  inicio                  timestamptz not null,
  fin                     timestamptz not null,
  nombre                  text not null,
  telefono                text,
  telefono_hash           text,
  estado                  text not null default 'agendado'
                            check (estado in ('agendado','confirmado','cancelado',
                                              'reprogramado','no_asistio','cumplido')),
  calendar_event_id       text,
  recordatorio_enviado_en timestamptz,
  origen                  text check (origen in ('whatsapp','web','pagina','manual')),
  notas                   text,
  creado_en               timestamptz not null default now(),
  check (fin > inicio)
);

comment on column public.turnos.servicio_nombre is
  'Congelado al agendar: si el cliente renombra o baja el servicio, el historico sigue leyendose.';

create index if not exists turnos_agenda_idx
  on public.turnos (cliente_id, inicio);
-- Indice del cron del recordatorio: solo mira lo que falta mandar.
create index if not exists turnos_recordatorio_idx
  on public.turnos (inicio)
  where estado in ('agendado','confirmado') and recordatorio_enviado_en is null;

-- ============================================================
--  8. USUARIOS DEL PANEL
-- ============================================================
create table if not exists public.usuarios_panel (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade,
  email         text not null,
  rol           text not null default 'dueno' check (rol in ('dueno','staff','uptempo')),
  ultimo_acceso timestamptz,
  creado_en     timestamptz not null default now(),
  unique (cliente_id, email)
);

create index if not exists usuarios_panel_user_idx
  on public.usuarios_panel (user_id);

-- ============================================================
--  9. FUNCIONES
-- ============================================================

-- ¿Este instante cae fuera del horario de atencion del cliente?
-- Sirve para marcar eventos (metrica principal del panel) y para
-- buscar huecos libres en el paso 3.
create or replace function public.es_fuera_de_horario(
  p_cliente uuid,
  p_momento timestamptz default now()
) returns boolean
language plpgsql stable
set search_path = public
as $$
declare
  v_tz     text;
  v_local  timestamp;
  v_fecha  date;
  v_hora   time;
  v_dow    int;
  v_exc    public.excepciones_horario%rowtype;
begin
  select timezone into v_tz from public.clientes where id = p_cliente;
  if v_tz is null then
    return true;
  end if;

  v_local := timezone(v_tz, p_momento);
  v_fecha := v_local::date;
  v_hora  := v_local::time;
  v_dow   := extract(isodow from v_local)::int;

  -- 1. La excepcion del cliente manda sobre todo lo demas.
  select * into v_exc
    from public.excepciones_horario
   where cliente_id = p_cliente and fecha = v_fecha;
  if found then
    if v_exc.cerrado then
      return true;
    end if;
    return not (v_hora >= v_exc.desde and v_hora < v_exc.hasta);
  end if;

  -- 2. Feriado que cierra por defecto.
  if exists (
    select 1 from public.feriados
     where fecha = v_fecha and cierra_por_defecto
  ) then
    return true;
  end if;

  -- 3. Horario semanal.
  return not exists (
    select 1 from public.horarios
     where cliente_id = p_cliente
       and dia_semana = v_dow
       and v_hora >= desde
       and v_hora <  hasta
  );
end;
$$;

-- Clientes a los que puede acceder el usuario logueado.
-- security definer para poder leer usuarios_panel sin recursion de RLS.
create or replace function public.mis_clientes()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select cliente_id from public.usuarios_panel where user_id = auth.uid();
$$;

-- Purga de la ley 18.331: a los 90 dias se va el cuerpo de los
-- mensajes y el telefono en claro. Los eventos agregados quedan.
create or replace function public.purgar_datos_viejos(p_dias int default 90)
returns table (mensajes_borrados bigint, conversaciones_anonimizadas bigint)
language plpgsql
set search_path = public
as $$
declare
  v_corte timestamptz := now() - make_interval(days => p_dias);
  v_msg   bigint;
  v_conv  bigint;
begin
  with borrados as (
    delete from public.mensajes m
     using public.conversaciones c
     where m.conversacion_id = c.id
       and c.ultimo_mensaje_en < v_corte
    returning m.id
  )
  select count(*) into v_msg from borrados;

  with anonimizadas as (
    update public.conversaciones
       set telefono = null,
           nombre_contacto = null,
           purgada_en = now()
     where ultimo_mensaje_en < v_corte
       and purgada_en is null
    returning id
  )
  select count(*) into v_conv from anonimizadas;

  -- El telefono en claro de un turno se va cuando el turno ya paso
  -- y no hay recordatorio pendiente.
  update public.turnos
     set telefono = null
   where fin < v_corte
     and telefono is not null;

  mensajes_borrados := v_msg;
  conversaciones_anonimizadas := v_conv;
  return next;
end;
$$;

-- actualizado_en automatico
create or replace function public.touch_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists clientes_touch on public.clientes;
create trigger clientes_touch before update on public.clientes
  for each row execute function public.touch_actualizado_en();

drop trigger if exists base_conocimiento_touch on public.base_conocimiento;
create trigger base_conocimiento_touch before update on public.base_conocimiento
  for each row execute function public.touch_actualizado_en();

-- Vinculacion automatica del magic link.
-- Das de alta el email en usuarios_panel; cuando el dueno pide su
-- enlace por primera vez, Supabase crea el auth.users y este trigger
-- lo engancha solo. Cero pasos manuales en la implementacion.
create or replace function public.vincular_usuario_panel()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  update public.usuarios_panel
     set user_id = new.id
   where lower(email) = lower(new.email)
     and user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.vincular_usuario_panel();

-- ============================================================
-- 10. VISTA DEL PANEL — los cinco numeros, y no un sexto
-- ============================================================
create or replace view public.panel_metricas_mes
with (security_invoker = true) as
select
  c.id  as cliente_id,
  m.desde_utc                                                       as mes_desde,
  count(*) filter (where e.tipo = 'turno')                          as turnos_agendados,
  count(*) filter (where e.tipo = 'consulta')                       as consultas_atendidas,
  count(*) filter (where e.tipo = 'consulta' and e.fuera_de_horario) as consultas_fuera_horario,
  coalesce(round(avg(e.latencia_ms)
    filter (where e.tipo = 'consulta' and e.latencia_ms is not null))::int, 0) as latencia_media_ms,
  count(*) filter (where e.tipo = 'derivacion')                     as derivaciones
from public.clientes c
cross join lateral (
  select timezone(c.timezone,
           date_trunc('month', timezone(c.timezone, now()))) as desde_utc,
         timezone(c.timezone,
           date_trunc('month', timezone(c.timezone, now())) + interval '1 month') as hasta_utc
) m
left join public.eventos e
  on  e.cliente_id  = c.id
  and e.ocurrido_en >= m.desde_utc
  and e.ocurrido_en <  m.hasta_utc
group by c.id, m.desde_utc;

-- ============================================================
-- 11. RLS — aislamiento entre clientes, hecho en la base
-- ============================================================
alter table public.clientes            enable row level security;
alter table public.servicios           enable row level security;
alter table public.horarios            enable row level security;
alter table public.excepciones_horario enable row level security;
alter table public.base_conocimiento   enable row level security;
alter table public.conversaciones      enable row level security;
alter table public.mensajes            enable row level security;
alter table public.eventos             enable row level security;
alter table public.turnos              enable row level security;
alter table public.usuarios_panel      enable row level security;
alter table public.feriados            enable row level security;

-- El panel solo LEE. Todo lo que escribe pasa por el Worker
-- (service_role, que bypassa RLS).
drop policy if exists clientes_sel on public.clientes;
create policy clientes_sel on public.clientes
  for select to authenticated
  using (id in (select public.mis_clientes()));

drop policy if exists servicios_sel on public.servicios;
create policy servicios_sel on public.servicios
  for select to authenticated
  using (cliente_id in (select public.mis_clientes()));

drop policy if exists horarios_sel on public.horarios;
create policy horarios_sel on public.horarios
  for select to authenticated
  using (cliente_id in (select public.mis_clientes()));

drop policy if exists excepciones_sel on public.excepciones_horario;
create policy excepciones_sel on public.excepciones_horario
  for select to authenticated
  using (cliente_id in (select public.mis_clientes()));

drop policy if exists base_conocimiento_sel on public.base_conocimiento;
create policy base_conocimiento_sel on public.base_conocimiento
  for select to authenticated
  using (cliente_id in (select public.mis_clientes()));

drop policy if exists conversaciones_sel on public.conversaciones;
create policy conversaciones_sel on public.conversaciones
  for select to authenticated
  using (cliente_id in (select public.mis_clientes()));

drop policy if exists mensajes_sel on public.mensajes;
create policy mensajes_sel on public.mensajes
  for select to authenticated
  using (conversacion_id in (
    select id from public.conversaciones
     where cliente_id in (select public.mis_clientes())
  ));

drop policy if exists eventos_sel on public.eventos;
create policy eventos_sel on public.eventos
  for select to authenticated
  using (cliente_id in (select public.mis_clientes()));

drop policy if exists turnos_sel on public.turnos;
create policy turnos_sel on public.turnos
  for select to authenticated
  using (cliente_id in (select public.mis_clientes()));

drop policy if exists usuarios_panel_sel on public.usuarios_panel;
create policy usuarios_panel_sel on public.usuarios_panel
  for select to authenticated
  using (user_id = auth.uid());

-- Feriados no tienen nada sensible: lectura libre.
drop policy if exists feriados_sel on public.feriados;
create policy feriados_sel on public.feriados
  for select to anon, authenticated
  using (true);

-- Permisos explicitos. Supabase los da por defecto en public, pero
-- si algun dia cambia ese default el panel se queda en blanco sin
-- ningun error visible. Mejor escritos.
grant usage on schema public to anon, authenticated;

grant select on
  public.clientes,
  public.servicios,
  public.horarios,
  public.excepciones_horario,
  public.base_conocimiento,
  public.conversaciones,
  public.mensajes,
  public.eventos,
  public.turnos,
  public.usuarios_panel,
  public.feriados,
  public.panel_metricas_mes
to authenticated;

-- anon queda CERRADO. Esto no es paranoia: la anon key es publica,
-- va escrita en el HTML del panel y de cualquier pagina. Supabase le
-- da select sobre todo el esquema public por defecto, y lo unico que
-- lo frena es RLS. Con esto son dos lineas de defensa en vez de una:
-- si manana una politica queda mal escrita o alguien desactiva RLS
-- en una tabla, anon sigue sin poder leer nada.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

grant usage  on schema public to anon;
grant select on public.feriados to anon;   -- lo unico sin nada sensible

-- Que las tablas que se creen despues nazcan igual de cerradas.
alter default privileges in schema public revoke all on tables from anon;

-- El panel NO escribe. Todo lo que escribe pasa por el Worker con
-- service_role. Por eso no hay grants de insert/update/delete.
revoke insert, update, delete on all tables in schema public from anon, authenticated;

-- ============================================================
-- FIN 001_schema.sql
-- ============================================================
