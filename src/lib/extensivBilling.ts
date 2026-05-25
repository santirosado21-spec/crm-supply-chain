/**
 * Extensiv 3PL Billing Wizard — push de charges desde el CRM.
 *
 * Flujo:
 *   1. Cobranza/admin aprieta botón "Enviar a Extensiv" en un viaje completado.
 *   2. Llamamos `extensiv_log_attempt` (RPC) que crea/resetea fila en
 *      extensiv_billing_log con status='pending' (y rechaza si ya está 'sent').
 *   3. Llamamos extensiv-proxy con POST /billingcharges.
 *   4. Llamamos `extensiv_log_finalize` con el chargeId de Extensiv o el
 *      error si falló. La fila queda en 'sent' o 'failed'.
 *
 * Idempotencia: el UNIQUE (source_table, source_id, charge_type) garantiza
 * que no se duplique. Si el usuario aprieta dos veces antes de que vuelva la
 * respuesta, el segundo POST igual sale, pero al guardar el log Extensiv da
 * error de duplicado. Recomendado: deshabilitar el botón mientras hay un
 * pending en cola para esa source.
 */

import { supabase } from './supabase'

export type ChargeType =
  | 'FLETE_INTERNO'
  | 'FLETE_EXTERNO'
  | 'MANIOBRA_CARGA'
  | 'MANIOBRA_DESCARGA'
  | 'SERVICIO_VALOR_AGREGADO'
  | 'ALMACENAJE_DIA'
  | 'MOVIMIENTO_SEKO_ENTRADA'
  | 'MOVIMIENTO_SEKO_SALIDA'

export type SourceTable =
  | 'viajes'
  | 'operations'
  | 'servicios_adicionales'
  | 'seko_movements'

export interface PushChargeInput {
  sourceTable:     SourceTable
  sourceId:        string
  customerId:      number
  chargeType:      ChargeType
  amount:          number
  description:     string
  referenceNumber: string
  shipmentId?:     string                 // extensiv_transaction_id (order)
  chargeDate?:     string                 // ISO yyyy-mm-dd. Default: today
}

export interface PushChargeResult {
  ok:               boolean
  logId:            string
  extensivChargeId: string | null
  httpStatus:       number
  error?:           string
}

/* ─── Tipos del payload Extensiv (basados en investigación) ─────────────── */
interface ExtensivBillingChargesResponse {
  // El payload exacto puede variar; capturamos lo que viene.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any
}

// Lock de envíos en vuelo — evita que un doble-click dispare dos POST a
// Extensiv antes de que el primero termine (el log es idempotente, el POST no).
const _inFlightCharges = new Set<string>()

/**
 * Empuja un charge a Extensiv Billing Wizard. Maneja todo el ciclo de vida
 * en `extensiv_billing_log` con idempotencia. Serializa por (source, charge):
 * un segundo intento mientras el primero está en vuelo se rechaza.
 */
export async function pushChargeToExtensiv(input: PushChargeInput): Promise<PushChargeResult> {
  const lockKey = `${input.sourceTable}:${input.sourceId}:${input.chargeType}`
  if (_inFlightCharges.has(lockKey)) {
    return {
      ok: false, logId: '', extensivChargeId: null, httpStatus: 0,
      error: 'Ya hay un envío en curso para este cargo',
    }
  }
  _inFlightCharges.add(lockKey)
  try {
    return await pushChargeInner(input)
  } finally {
    _inFlightCharges.delete(lockKey)
  }
}

async function pushChargeInner(input: PushChargeInput): Promise<PushChargeResult> {
  const chargeDate = input.chargeDate ?? new Date().toISOString().slice(0, 10)

  // 1. Reservar fila en log (status='pending')
  const { data: logId, error: logErr } = await supabase.rpc('extensiv_log_attempt', {
    p_source_table:     input.sourceTable,
    p_source_id:        input.sourceId,
    p_customer_id:      input.customerId,
    p_charge_type:      input.chargeType,
    p_amount:           input.amount,
    p_description:      input.description,
    p_reference_number: input.referenceNumber,
    p_shipment_id:      input.shipmentId ?? null,
    p_charge_date:      chargeDate,
  })

  if (logErr) {
    return {
      ok: false,
      logId: '',
      extensivChargeId: null,
      httpStatus: 0,
      error: logErr.message,
    }
  }

  const logIdStr = logId as string

  // 2. Llamar a Extensiv vía proxy
  let extensivChargeId: string | null = null
  let httpStatus = 0
  let errorMessage: string | undefined

  try {
    const { data: response, error: proxyErr } = await supabase.functions.invoke<ExtensivBillingChargesResponse>(
      'extensiv-proxy',
      {
        body: {
          method: 'POST',
          path:   '/billingcharges',
          body: {
            customerId:      input.customerId,
            chargeType:      input.chargeType,
            amount:          input.amount,
            description:     input.description,
            referenceNumber: input.referenceNumber,
            shipmentId:      input.shipmentId,
            date:            chargeDate,
          },
        },
      },
    )

    if (proxyErr) throw new Error(proxyErr.message)

    // Extensiv suele devolver { id, ... } o { chargeId, ... }. Probamos ambos.
    extensivChargeId = String(
      response?.chargeId
      ?? response?.id
      ?? response?.billingChargeId
      ?? '',
    ) || null

    httpStatus = extensivChargeId ? 200 : 502

    if (!extensivChargeId) {
      errorMessage = 'Extensiv respondió OK pero sin chargeId en el payload'
    }
  } catch (e) {
    httpStatus   = 502
    errorMessage = e instanceof Error ? e.message : String(e)
  }

  // 3. Finalizar el log
  await supabase.rpc('extensiv_log_finalize', {
    p_log_id:             logIdStr,
    p_extensiv_charge_id: extensivChargeId,
    p_http_status:        httpStatus,
    p_error_message:      errorMessage ?? null,
  })

  return {
    ok:               !errorMessage && httpStatus >= 200 && httpStatus < 300,
    logId:            logIdStr,
    extensivChargeId,
    httpStatus,
    error:            errorMessage,
  }
}

/* ─── Helpers de consulta ───────────────────────────────────────────────── */
export interface ChargeStatus {
  source_table:        string
  source_id:           string
  charge_type:         string
  status:              'pending' | 'sent' | 'failed' | 'voided'
  extensiv_charge_id:  string | null
  sent_at:             string | null
  error_message:       string | null
  attempted_at:        string
}

/** Trae el status de los charges de un set de viajes/operations/seko. */
export async function getChargeStatusForSources(
  sourceTable: SourceTable,
  sourceIds:   string[],
): Promise<Map<string, ChargeStatus[]>> {
  if (sourceIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('v_extensiv_charge_status')
    .select('*')
    .eq('source_table', sourceTable)
    .in('source_id', sourceIds)
  if (error) throw new Error(error.message)
  const map = new Map<string, ChargeStatus[]>()
  for (const row of (data ?? []) as ChargeStatus[]) {
    if (!map.has(row.source_id)) map.set(row.source_id, [])
    map.get(row.source_id)!.push(row)
  }
  return map
}

/** Lista de charges pendientes y enviados para un cliente en un período. */
export interface BillingChargeRow {
  id:                 string
  source_table:       string
  source_id:          string
  customer_id:        number
  charge_type:        string
  amount:             number
  description:        string
  reference_number:   string
  shipment_id:        string | null
  charge_date:        string
  extensiv_charge_id: string | null
  status:             'pending' | 'sent' | 'failed' | 'voided'
  http_status:        number | null
  error_message:      string | null
  attempted_by:       string
  attempted_at:       string
  sent_at:            string | null
}

export async function listChargesForCustomer(
  customerId: number,
  fromDate:   string,
  toDate:     string,
): Promise<BillingChargeRow[]> {
  const { data, error } = await supabase
    .from('extensiv_billing_log')
    .select('*')
    .eq('customer_id', customerId)
    .gte('charge_date', fromDate)
    .lte('charge_date', toDate)
    .order('charge_date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as BillingChargeRow[]
}

/** Anula un charge (solo admin). NO toca Extensiv UI. */
export async function voidCharge(logId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('extensiv_log_void', {
    p_log_id: logId,
    p_reason: reason,
  })
  if (error) throw new Error(error.message)
}

/* ─── Seko movements → Extensiv ─────────────────────────────────────────── */

export interface SekoMovementChargeInput {
  movementId:      string
  movementTipo:    'entrada' | 'salida'
  customerId:      number                  // extensiv_customer_id del cliente
  cantidad:        number
  unitPrice:       number                  // tarifario.precio (MXN)
  fecha:           string                  // YYYY-MM-DD
  referencia:      string | null           // PO/SO/folio del cliente
  sku:             string | null
  clienteCodigo:   string                  // BSF | KST | BB | LUL
}

/**
 * Empuja un movimiento de Seko 365 a Extensiv como charge. Idempotente vía el
 * UNIQUE (source_table, source_id, charge_type) del log: reintenta sin duplicar
 * si el primer push falló.
 */
export async function pushSekoMovementToExtensiv(
  input: SekoMovementChargeInput,
): Promise<PushChargeResult> {
  const amount = Number((input.cantidad * input.unitPrice).toFixed(2))
  const chargeType: ChargeType = input.movementTipo === 'entrada'
    ? 'MOVIMIENTO_SEKO_ENTRADA'
    : 'MOVIMIENTO_SEKO_SALIDA'

  const refParts = [input.referencia, input.sku].filter(Boolean) as string[]
  const description =
    `Seko 365 ${input.movementTipo} · ${input.clienteCodigo}` +
    (input.sku ? ` · SKU ${input.sku}` : '') +
    ` · ${input.cantidad} u`
  const referenceNumber = refParts.length > 0
    ? refParts.join(' / ')
    : `SEKO-${input.movementId.slice(0, 8)}`

  return pushChargeToExtensiv({
    sourceTable:     'seko_movements',
    sourceId:        input.movementId,
    customerId:      input.customerId,
    chargeType,
    amount,
    description,
    referenceNumber,
    chargeDate:      input.fecha,
  })
}

/**
 * Resuelve la tarifa unitaria (MXN) de entrada/salida para un cliente Seko a
 * partir de la tabla `tarifarios`. Busca el primer concepto activo cuyo texto
 * contenga "entrada" o "salida" (case-insensitive). Devuelve 0 si no hay match.
 */
export async function getSekoUnitTariffs(clienteCodigo: string): Promise<{
  entrada: number
  salida:  number
}> {
  const { data, error } = await supabase
    .from('tarifarios')
    .select('concepto, precio, activo')
    .eq('cliente_codigo', clienteCodigo)
    .eq('activo', true)

  if (error) throw new Error(error.message)

  let entrada = 0, salida = 0
  for (const row of (data ?? []) as { concepto: string; precio: number }[]) {
    const c = row.concepto.toLowerCase()
    if (entrada === 0 && c.includes('entrada') && !c.includes('salida')) entrada = Number(row.precio || 0)
    if (salida  === 0 && c.includes('salida')  && !c.includes('entrada')) salida  = Number(row.precio || 0)
  }
  return { entrada, salida }
}

/** Marca un set de seko_movements como facturados (billed=true). */
export async function markSekoMovementsBilled(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase
    .from('seko_movements')
    .update({ billed: true, billed_at: new Date().toISOString() })
    .in('id', ids)
  if (error) throw new Error(error.message)
}
