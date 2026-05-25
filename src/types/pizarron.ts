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
  id:             string
  task_id:        string | null
  area:           WarehouseArea
  priority:       number
  taken_by_name:  string | null
  taken_by_email: string | null
  taken_at:       string | null
  completed_at:   string | null
  notes:          string | null
  created_at:     string
  // join opcional
  task?:          Task | null
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
