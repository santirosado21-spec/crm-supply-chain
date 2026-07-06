// Módulo Comercial — Seguimiento de Leads — types

export type LeadChannel = 'landing_page' | 'instagram' | 'linkedin' | 'cold_email' | 'organico'

export type LeadStage =
  | 'nuevo'
  | 'contactado'
  | 'en_seguimiento'
  | 'reunion_agendada'
  | 'cotizacion_enviada'
  | 'cerrado_ganado'
  | 'cerrado_perdido'

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
  'nuevo', 'contactado', 'en_seguimiento', 'reunion_agendada',
  'cotizacion_enviada', 'cerrado_ganado', 'cerrado_perdido',
]

export const STAGE_LABEL: Record<LeadStage, string> = {
  nuevo:               'Nuevo lead',
  contactado:          'Contactado',
  en_seguimiento:      'En seguimiento',
  reunion_agendada:    'Reunión agendada',
  cotizacion_enviada:  'Cotización enviada',
  cerrado_ganado:      'Cerrado ganado',
  cerrado_perdido:     'Cerrado perdido',
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
