// Módulo Comercial — Seguimiento de Leads — types

export type LeadChannel = 'landing_page' | 'instagram' | 'linkedin' | 'cold_email' | 'organico'

export type LeadStage =
  | 'lead_entrante'
  | 'lead_junta_pendiente'
  | 'lead_post_junta'
  | 'lead_proceso_cliente'

export type LeadInterestLevel = 'frio' | 'tibio' | 'caliente' | 'oportunidad' | 'cliente_perdido'

export type LeadPriority = 'baja' | 'media' | 'alta'

export type NextActionType = 'llamada' | 'correo' | 'whatsapp' | 'reunion'

// Catálogo real y vigente, tomado del <select id="servicio"> de la landing
// (supply-chain-mexico-web, index.html líneas 796-809).
export type ServiceInterest =
  | 'Almacenaje de Mercancías'
  | 'Gestión de Activos (Asset Management)'
  | 'Transporte con Flota Propia'
  | 'Flete Externo / Carriers'
  | 'Paquetería y Última Milla'
  | 'Comercio Electrónico (Fulfillment)'
  | 'Previo en Origen'
  | 'Logística Global'
  | 'Aduanas'
  | 'Seguros de Carga'
  | 'Otro'

export interface Lead {
  id:                     string
  ref:                    string | null
  nombre:                 string
  empresa:                string | null
  cargo:                  string | null
  correo:                 string | null
  telefono:               string | null
  canal:                  LeadChannel
  fecha_entrada:          string
  servicio_interes:       ServiceInterest
  notas_comerciales:      string | null
  responsable_comercial:  string | null
  estatus:                LeadStage
  nivel_interes:          LeadInterestLevel
  prioridad:              LeadPriority
  proxima_accion_tipo:    NextActionType | null
  proxima_accion_fecha:   string | null
  client_id:              string | null
  motivo_perdido:         string | null
  recordatorio_dias:      number | null
  recordatorio_fecha:     string | null
  recordatorio_enviado:   boolean
  created_by:             string
  created_at:             string
  updated_at:             string
}

export interface LeadNote {
  id:          string
  lead_id:     string
  user_email:  string
  content:     string
  created_at:  string
}

export const LEAD_CHANNELS: LeadChannel[] = ['landing_page', 'instagram', 'linkedin', 'cold_email', 'organico']

// landing_page queda fuera de las opciones manuales — solo lo fija el webhook.
export const MANUAL_LEAD_CHANNELS: LeadChannel[] = ['instagram', 'linkedin', 'cold_email', 'organico']

export const CHANNEL_LABEL: Record<LeadChannel, string> = {
  landing_page: 'Landing page',
  instagram:    'Instagram',
  linkedin:     'LinkedIn',
  cold_email:   'Cold email',
  organico:     'Orgánico',
}

export const LEAD_STAGES: LeadStage[] = [
  'lead_entrante', 'lead_junta_pendiente', 'lead_post_junta', 'lead_proceso_cliente',
]

export const STAGE_LABEL: Record<LeadStage, string> = {
  lead_entrante:         'Lead entrante',
  lead_junta_pendiente:  'Lead con junta pendiente',
  lead_post_junta:       'Lead post junta',
  lead_proceso_cliente:  'Lead en proceso de ser cliente',
}

export const INTEREST_LEVELS: LeadInterestLevel[] = ['frio', 'tibio', 'caliente', 'oportunidad', 'cliente_perdido']

export const INTEREST_LABEL: Record<LeadInterestLevel, string> = {
  frio:            'Frío',
  tibio:           'Tibio',
  caliente:        'Caliente',
  oportunidad:     'Oportunidad',
  cliente_perdido: 'Cliente perdido',
}

export const PRIORITIES: LeadPriority[] = ['baja', 'media', 'alta']

export const PRIORITY_LABEL: Record<LeadPriority, string> = {
  baja:  'Baja',
  media: 'Media',
  alta:  'Alta',
}

export const NEXT_ACTION_LABEL: Record<NextActionType, string> = {
  llamada: 'Llamada',
  correo:  'Correo',
  whatsapp:'WhatsApp',
  reunion: 'Reunión',
}

// Presets de recordatorio (días desde la creación/edición). null = sin recordatorio.
export const REMINDER_DAY_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Sin recordatorio' },
  { value: 1,    label: 'En 1 día' },
  { value: 3,    label: 'En 3 días' },
  { value: 7,    label: 'En 1 semana' },
  { value: 15,   label: 'En 15 días' },
  { value: 30,   label: 'En 1 mes' },
]

export const SERVICE_INTERESTS: ServiceInterest[] = [
  'Almacenaje de Mercancías',
  'Gestión de Activos (Asset Management)',
  'Transporte con Flota Propia',
  'Flete Externo / Carriers',
  'Paquetería y Última Milla',
  'Comercio Electrónico (Fulfillment)',
  'Previo en Origen',
  'Logística Global',
  'Aduanas',
  'Seguros de Carga',
  'Otro',
]
