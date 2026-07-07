// Pizarrón de Operaciones — types

import type { Task } from './tasks'

export type WarehouseArea =
  | 'recepcion'
  | 'picking'
  | 'montacargas'
  | 'pre_stage'
  | 'consolidacion'
  | 'embarque'
  | 'devoluciones'
  | 'otro'

export interface WarehouseTask {
  id:                       string
  task_id:                  string | null
  area:                     WarehouseArea
  priority:                 number
  taken_by_name:            string | null
  taken_by_email:           string | null
  taken_at:                 string | null
  completed_at:             string | null
  notes:                    string | null
  created_at:               string
  // Campos del flujo Blue Yonder WLM (migración 20260525144000):
  assigned_to_name:         string | null   // designación pre-take para persona sin cuenta
  estimated_duration_min:   number | null   // duración aproximada del estándar / manual
  actual_duration_min:      number | null   // SUM(duration_min) de todos los takers — horas-hombre
  designation_notes:        string | null   // instrucciones que Guillermo dicta
  // Planificación operativa CEDIS (migración 20260528000001):
  scheduled_start:          string | null   // ISO timestamp — cuándo el director planeó ejecutarla
  scheduled_end:            string | null
  // Evidencia de cierre (migración 20260707100002): link de Google Drive obligatorio al completar.
  completion_evidence_url:  string | null
  // joins opcionales
  task?:                    Task | null
  takers?:                  WarehouseTaskTaker[]   // multi-taker (mig 20260528000001)
}

// Multi-taker: cada persona que trabaja una warehouse_task es una fila en
// warehouse_task_takers (migración 20260528000001).
export interface WarehouseTaskTaker {
  id:                string
  warehouse_task_id: string
  taker_name:        string
  taker_email:       string | null
  started_at:        string   // ISO
  ended_at:          string | null
  duration_min:      number | null   // generated: NULL hasta que ended_at exista
  device_id:         string | null
  notes:             string | null
  created_at:        string
}

export const WAREHOUSE_AREAS: WarehouseArea[] = [
  'recepcion', 'picking', 'montacargas', 'pre_stage',
  'consolidacion', 'embarque', 'devoluciones', 'otro',
]

export const AREA_LABEL: Record<WarehouseArea, string> = {
  recepcion:     'Recepción',
  picking:       'Picking',
  montacargas:   'Montacargas',
  pre_stage:     'Pre-stage',
  consolidacion: 'Consolidación',
  embarque:      'Embarque',
  devoluciones:  'Devoluciones',
  otro:          'Otro',
}

export const AREA_COLOR: Record<WarehouseArea, string> = {
  recepcion:     '#28a745',
  picking:       '#1e3a5f',
  montacargas:   '#ffc107',
  pre_stage:     '#6366f1',
  consolidacion: '#c8373c',
  embarque:      '#0ea5e9',
  devoluciones:  '#94a3b8',
  otro:          '#71717a',
}
