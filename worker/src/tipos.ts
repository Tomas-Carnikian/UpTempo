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
  telefono_display: string | null;
  calendar_id: string | null;
  color_primario: string;
  color_secundario: string;
  logo_url: string | null;
  fotos: string[];
  direccion: string | null;
  maps_url: string | null;
  google_place_id: string | null;
  formas_pago: string | null;
  descripcion_corta: string | null;
  modelo: string;
  derivacion_telefono: string | null;
  derivacion_email: string | null;
  silencio_derivacion_h: number;
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
