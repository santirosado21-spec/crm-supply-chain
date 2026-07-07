// Task Tracker — types

export type TaskStatus =
  | 'propuesta'
  | 'aceptada'
  | 'rechazada'
  | 'en_curso'
  | 'pausada'
  | 'finalizada'
  | 'cancelada'

export type TaskCategoryCode = 'almacen' | 'sac' | 'transporte' | 'admin' | 'interno'

export interface TaskCategory {
  id:           string
  code:         TaskCategoryCode | string
  name:         string
  color:        string
  is_billable:  boolean
  created_at?:  string
}

// ── Etiquetas de clasificación (Calendario General) ──────────────────────────
export type TagDimension = 'movimiento' | 'area' | 'actividad' | 'prioridad' | 'proveedor'

export interface TaskTag {
  id:         string
  dimension:  TagDimension
  label:      string
  color:      string
  sort_order?: number
  active?:    boolean
}

// Dimensiones en orden de captura. `required` = obligatoria al crear una tarea
// del Calendario General (cliente se maneja aparte vía la tabla `clients`).
export const TAG_DIMENSIONS: { code: TagDimension; label: string; required: boolean }[] = [
  { code: 'movimiento', label: 'Movimiento',       required: true  },
  { code: 'area',       label: 'Departamento',       required: true  },
  { code: 'actividad',  label: 'Tipo de actividad',  required: true  },
  { code: 'prioridad',  label: 'Prioridad',          required: true  },
]

export const TAG_DIMENSION_LABEL: Record<TagDimension, string> = {
  movimiento: 'Movimiento',
  area:       'Departamento',
  actividad:  'Tipo de actividad',
  prioridad:  'Prioridad',
  proveedor:  'Proveedor',
}

export interface Task {
  id:               string
  ref:              string | null
  title:            string
  description:      string
  category_id:      string | null
  client_id:        string | null
  operation_id:     string | null
  assigner_email:   string
  assignee_email:   string
  scheduled_start:  string
  scheduled_end:    string
  status:           TaskStatus
  rejection_reason: string | null
  template_id:      string | null
  created_at:       string
  completion_evidence_url: string | null
  // joins (opcionales según query)
  category?:        TaskCategory | null
  client?:          { id: string; name: string; codigo: string | null } | null
  tags?:            TaskTag[]
}

export interface TaskTimeEntry {
  id:            string
  task_id:       string
  user_email:    string
  segment_type:  'work' | 'pause'
  started_at:    string
  ended_at:      string | null
}

export interface TaskNote {
  id:          string
  task_id:     string
  user_email:  string
  content:     string
  created_at:  string
}

export interface TaskTemplate {
  id:                       string
  title:                    string
  description:              string
  category_id:              string | null
  client_id:                string | null
  default_assignee_email:   string
  duration_minutes:         number
  recurrence_rule:          string
  start_time:               string  // 'HH:MM:SS'
  active:                   boolean
  created_by:               string
  last_materialized_until:  string | null
  created_at:               string
}

export interface UserWorkSchedule {
  user_email:   string
  day_of_week:  number  // 0 = Domingo … 6 = Sábado
  start_time:   string
  end_time:     string
}

export interface TeamMember {
  user_email:  string
  user_name:   string | null
  role:        'admin' | 'almacen' | 'servicio_cliente' | 'cobranza' | 'transporte' | 'comercial'
  active:      boolean
  created_at:  string
}

export interface Notification {
  id:          string
  user_email:  string
  type:        string
  title:       string
  body:        string | null
  link:        string | null
  payload:     Record<string, unknown> | null
  read_at:     string | null
  created_at:  string
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  propuesta:   'Propuesta',
  aceptada:    'Aceptada',
  rechazada:   'Rechazada',
  en_curso:    'En curso',
  pausada:     'Pausada',
  finalizada:  'Finalizada',
  cancelada:   'Cancelada',
}

export const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  propuesta:   '#ffc107',
  aceptada:    '#1e3a5f',
  rechazada:   '#dc3545',
  en_curso:    '#28a745',
  pausada:     '#f59e0b',
  finalizada:  '#64748b',
  cancelada:   '#94a3b8',
}

export const DAY_OF_WEEK_LABEL = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const
export const DAY_OF_WEEK_FULL  = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const

// ── Sprint H · Audit log ─────────────────────────────────────────────────────
export type TaskAuditAction =
  | 'created' | 'edited' | 'accepted' | 'rejected'
  | 'cancelled' | 'finalized' | 'started' | 'paused' | 'other'

export interface TaskAuditEntry {
  audit_id:            string
  audit_at:            string
  action:              string                                  // raw "status:propuesta→aceptada"
  action_category:     TaskAuditAction
  before:              Record<string, unknown> | null
  after:               Record<string, unknown> | null
  actor_email:         string
  actor_name:          string
  actor_role:          string | null
  task_id:             string | null
  task_ref:            string | null
  task_title:          string | null
  task_current_status: string | null
  assigner_email:      string | null
  assignee_email:      string | null
}

export const AUDIT_ACTION_LABEL: Record<TaskAuditAction, string> = {
  created:    'creó',
  edited:     'editó',
  accepted:   'aceptó',
  rejected:   'rechazó',
  cancelled:  'canceló',
  finalized:  'finalizó',
  started:    'inició',
  paused:     'pausó',
  other:      'modificó',
}

export const AUDIT_ACTION_COLOR: Record<TaskAuditAction, string> = {
  created:    '#64748b',                                       // gris
  edited:     '#1e3a5f',                                       // azul
  accepted:   '#28a745',                                       // verde
  rejected:   '#dc3545',                                       // rojo
  cancelled:  '#f59e0b',                                       // ámbar
  finalized:  '#7c3aed',                                       // púrpura
  started:    '#22c55e',                                       // verde claro
  paused:     '#f59e0b',
  other:      '#94a3b8',
}
