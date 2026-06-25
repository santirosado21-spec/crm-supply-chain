/**
 * Tipos del wizard unificado de Entradas de Almacén (3 pasos).
 *
 * Respaldados por la tabla `warehouse_entries` (ver
 * supabase/migrations/20260624000001_warehouse_entries.sql).
 */
import type { PTLineItem } from '../lib/ptParser'

export type WizardStep = 1 | 2 | 3

export type EntryFlowStatus = 'paso1' | 'paso2' | 'paso3' | 'completada' | 'cancelada'

export type ExtractedVia = 'vision' | 'text' | null

/** Paso 1 — validación de alta de SKUs contra el catálogo de Extensiv. */
export interface ValidationRow {
  sku:        string
  qty:        number
  registered: boolean
}

/** Paso 2 — items editables del facilitador (copia de la nota original). */
export interface ReceiptRow {
  sku:          string
  qty:          number
  serialNumber: string | null
}

export type VerificationStatus = 'confirmed' | 'qty_diff' | 'not_found'

/** Paso 3 — verificación de la nota original contra el inventario actual. */
export interface VerificationRow {
  sku:     string
  qtyDoc:  number
  qtyExt:  number | null
  status:  VerificationStatus
  anomaly: string
}

/**
 * Fila persistida en `warehouse_entries`. Los nombres en snake_case coinciden
 * con las columnas de la tabla (se castea con `as` igual que useOperations).
 */
export interface WarehouseEntry {
  id:               string
  fecha:            string
  flow_status:      EntryFlowStatus
  current_step:     number

  customer_id:      number | null
  customer_name:    string

  nota_file_name:   string | null
  extracted_via:    ExtractedVia
  ref:              string | null
  original_items:   PTLineItem[]
  document_total_qty: number | null

  step1_results:    ValidationRow[]
  step1_complete:   boolean

  step2_items:      ReceiptRow[]
  export_generated: boolean
  export_file_name: string | null

  step3_results:    VerificationRow[]
  anomalies:        Record<string, string>
  extensiv_transaction_id: string | null

  created_by:       string | null
  completed_at:     string | null
  notas:            string
  created_at:       string
  updated_at:       string
}

/**
 * Estado en memoria del wizard. Incluye el `File` (que NO se persiste) y los
 * resultados por paso. Se hidrata desde una `WarehouseEntry` al reanudar.
 */
export interface WizardState {
  entryId:       string | null
  currentStep:   WizardStep
  flowStatus:    EntryFlowStatus

  // Compartido — capturado una sola vez en Paso 1
  customerId:    number | null
  customerName:  string
  notaFileName:  string
  notaFile:      File | null
  originalItems: PTLineItem[]
  ref:           string
  extractedVia:  ExtractedVia
  documentTotalQty: number | null

  // Paso 1
  step1Results:  ValidationRow[]
  step1Complete: boolean

  // Paso 2
  step2Items:       ReceiptRow[]
  exportGenerated:  boolean
  exportFileName:   string | null

  // Paso 3
  step3Results:  VerificationRow[]
  anomalies:     Record<string, string>
  extensivTransactionId: string
}
