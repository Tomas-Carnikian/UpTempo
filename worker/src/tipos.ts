export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ANTHROPIC_API_KEY: string;
  PEPPER_TELEFONO: string;
  ENTORNO: string;
  // Publishable key de Supabase. Es PUBLICA por diseño: va escrita en
  // el HTML del panel. Solo sirve con el JWT del usuario y RLS.
  SUPABASE_PUBLISHABLE_KEY?: string;
  // Cuenta de servicio de Google. Opcionales: sin ellas el asistente
  // funciona igual, pero no consulta ni escribe en ningun calendario.
  GOOGLE_SA_EMAIL?: string;
  GOOGLE_SA_PRIVATE_KEY?: string;
  // WhatsApp Cloud API. Un solo token para todos los clientes.
  WA_TOKEN?: string;         // System User token de la app
  WA_VERIFY_TOKEN?: string;  // lo inventamos nosotros y se pega en Meta
  WA_APP_SECRET?: string;    // para validar la firma de cada webhook
  WA_API_VERSION?: string;   // opcional, ej "v21.0"
  /** Modelo del generador de demos (paso 9). Por defecto, Haiku. */
  MODELO_EXTRACCION?: string;
  /** Google Places API (New). Solo la usa el generador de demos. */
  GOOGLE_PLACES_KEY?: string;
  /**
   * Formulario de contacto de la web (contacto.ts). Las dos hacen
   * falta: si falta cualquiera, /api/contacto contesta 500 y no manda
   * nada. Es a proposito — un formulario publico sin captcha es correo
   * basura garantizado a los pocos dias.
   *
   * RESEND_API_KEY es una clave PROPIA, distinta de la de Gmail
   * ("gmail-send-as"): una clave por uso, para poder rotar una sin
   * voltear la otra.
   */
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}

export type Canal = 'web' | 'whatsapp';
export type TipoMensaje = 'texto' | 'audio' | 'imagen' | 'documento' | 'otro';

export interface Cliente {
  id: string;
  slug: string;
  nombre: string;
  rubro: string | null;
  estado: 'demo' | 'activo' | 'suspendido' | 'baja';
  timezone: string;
  wa_phone_number_id: string | null;
  /** ID de la cuenta de WhatsApp Business. Es DONDE viven las plantillas. */
  wa_business_account_id: string | null;
  telefono_display: string | null;
  calendar_id: string | null;
  color_primario: string;
  color_secundario: string;
  logo_url: string | null;
  fotos: string[];
  direccion: string | null;
  maps_url: string | null;
  google_place_id: string | null;
  lat: number | null;
  lon: number | null;
  formas_pago: string | null;
  descripcion_corta: string | null;
  modelo: string;
  derivacion_telefono: string | null;
  derivacion_email: string | null;
  silencio_derivacion_h: number;
}

/**
 * Un puesto de trabajo con cantidad: "Camillas: 2", "Puesto de uñas: 1".
 *
 * Es ANONIMO a proposito: nadie reserva la camilla 2, reserva "una
 * camilla". Un recurso CON identidad —elegir profesional, "quiero con
 * Ana"— es otro producto y el doble de alta.
 */
export interface Recurso {
  id: string;
  nombre: string;
  /** Cuantos turnos simultaneos admite. 1 = como se comportaba todo antes. */
  cantidad: number;
}

export interface Servicio {
  id: string;
  nombre: string;
  precio: number | null;
  precio_nota: string | null;
  duracion_min: number;
  buffer_min: number;
  descripcion: string | null;
  orden: number;
  agendable: boolean;
  /**
   * Que recurso ocupa este servicio.
   *
   * NULL = ocupa el NEGOCIO ENTERO. De ahi salen dos cosas:
   *   - un cliente sin ningun recurso definido se comporta exacto como
   *     antes de la migracion 009: todo en null, todo se bloquea entre
   *     si, capacidad 1;
   *   - en un cliente CON recursos, un servicio al que se olvidaron de
   *     asignarle recurso sobre-bloquea en vez de sobre-vender. Es el
   *     lado correcto del error: se ve enseguida y no termina en dos
   *     clientas en la misma camilla.
   */
  recurso_id: string | null;
}

export interface Horario {
  dia_semana: number; // ISO: 1 = lunes ... 7 = domingo
  desde: string;      // 'HH:MM:SS'
  hasta: string;
}

/** Todo lo que hace falta saber de un negocio para contestar un mensaje. */
export interface Negocio {
  cliente: Cliente;
  servicios: Servicio[];
  horarios: Horario[];
  baseConocimiento: string;
  /** Vacio = negocio de un solo puesto. Es el caso por defecto. */
  recursos: Recurso[];
}

export interface Conversacion {
  id: string;
  cliente_id: string;
  canal: Canal;
  estado: 'activa' | 'derivada' | 'cerrada';
  silenciado_hasta: string | null;
  telefono: string | null;
  telefono_hash: string | null;
  nombre_contacto: string | null;
}

export interface MensajeEntrante {
  canal: Canal;
  texto: string;
  tipo: TipoMensaje;
  /** Web: id de sesión del navegador. WhatsApp: teléfono del consumidor. */
  identificador: string;
  nombreContacto?: string;
  /** Solo WhatsApp. Es la llave de idempotencia. */
  waMessageId?: string;
  /**
   * Solo WhatsApp: cuando lo mando la persona, segun Meta — que no es
   * cuando nos llego. Meta reintenta durante horas lo que no pudo
   * entregar, asi que un mensaje puede aparecer viejisimo.
   */
  enviadoEn?: Date;
  /**
   * Solo WhatsApp. Si la persona toco un boton de una plantilla, esto
   * trae el payload que le pusimos al mandarla (CONFIRMO, CAMBIO).
   * Es lo unico que se puede leer sin ambiguedad: el texto visible del
   * boton depende del idioma y de como Meta lo aprobo.
   */
  payloadBoton?: string;
}

export interface Respuesta {
  /** null = el bot no contesta (conversación derivada y en silencio). */
  texto: string | null;
  conversacionId: string;
  derivada: boolean;
  latenciaMs: number;
}

// --- Formato de la API de Anthropic (solo lo que usamos) ---

export interface BloqueTexto { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
export interface BloqueToolUse { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
export interface BloqueToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}
export type Bloque = BloqueTexto | BloqueToolUse | BloqueToolResult;

export interface MensajeApi {
  role: 'user' | 'assistant';
  content: string | Bloque[];
}

export interface RespuestaApi {
  id: string;
  content: Array<BloqueTexto | BloqueToolUse>;
  stop_reason: string;
  usage?: { input_tokens: number; output_tokens: number;
            cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
}
