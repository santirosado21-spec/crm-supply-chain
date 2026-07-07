/**
 * Tipos de Salidas de almacén — contraparte simple de warehouseEntry.ts.
 *
 * Respaldados por la tabla `warehouse_exits` (ver
 * supabase/migrations/20260707200002_warehouse_exits.sql). Sin integración
 * con la API de Extensiv (ship-out bloqueado) — el cierre vive solo en el CRM.
 */

export type ExitStatus = 'abierta' | 'cerrada' | 'cancelada'

export interface ExitItem {
  sku:         string
  qty:         number
  description: string
}

export interface WarehouseExit {
  id:                       string
  fecha:                    string
  ref:                      string | null
  customer_id:              number | null
  customer_name:            string
  items:                    ExitItem[]
  notas:                    string
  status:                   ExitStatus
  completion_evidence_url:  string | null
  created_by:               string | null
  completed_at:             string | null
  created_at:               string
  updated_at:               string
}
