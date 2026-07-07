/**
 * Alta de SKUs faltantes en Extensiv desde el Paso 1 del wizard de Entradas.
 *
 * Flujo (espejo de extensivBilling.pushChargeToExtensiv):
 *   1. El usuario da de alta un SKU "por dar de alta" desde el Paso 1.
 *   2. `extensiv_item_log_attempt` (RPC) reserva/reutiliza la fila del log con
 *      status='pending' (rechaza si el SKU ya está 'created').
 *   3. `createExtensivItem` hace POST /customers/{id}/items vía el proxy.
 *   4. `extensiv_item_log_finalize` deja la fila en 'created' (con
 *      extensiv_item_id) o 'failed' (con el error).
 *
 * Idempotencia: el UNIQUE (customer_id, sku) del log evita duplicar el alta.
 * El lock in-flight evita que un doble-click dispare dos POST simultáneos.
 */

import { supabase } from './supabase'
import { createExtensivItem, type CreateExtensivItemInput } from './extensiv'

export type CreateItemInput = CreateExtensivItemInput

export interface CreateItemResult {
  ok:             boolean
  logId:          string
  extensivItemId: string | null
  httpStatus:     number
  error?:         string
}

// Lock de altas en vuelo — evita doble POST antes de que el primero termine.
const _inFlightItems = new Set<string>()

export async function createItemInExtensiv(input: CreateItemInput): Promise<CreateItemResult> {
  const lockKey = `${input.customerId}:${input.sku}`
  if (_inFlightItems.has(lockKey)) {
    return {
      ok: false, logId: '', extensivItemId: null, httpStatus: 0,
      error: 'Ya hay un alta en curso para este SKU',
    }
  }
  _inFlightItems.add(lockKey)
  try {
    return await createItemInner(input)
  } finally {
    _inFlightItems.delete(lockKey)
  }
}

async function createItemInner(input: CreateItemInput): Promise<CreateItemResult> {
  // 1. Reservar fila en el log (status='pending')
  const { data: logId, error: logErr } = await supabase.rpc('extensiv_item_log_attempt', {
    p_customer_id: input.customerId,
    p_sku:         input.sku,
    p_description: input.description,
    p_payload:     input as unknown as Record<string, unknown>,
  })

  if (logErr) {
    return { ok: false, logId: '', extensivItemId: null, httpStatus: 0, error: logErr.message }
  }

  const logIdStr = logId as string

  // 2. POST a Extensiv vía proxy
  let extensivItemId: string | null = null
  let httpStatus = 0
  let errorMessage: string | undefined

  try {
    const { itemId } = await createExtensivItem(input)
    extensivItemId = itemId || null
    httpStatus = extensivItemId ? 200 : 502
    if (!extensivItemId) {
      errorMessage = 'Extensiv respondió OK pero sin itemId en el payload'
    }
  } catch (e) {
    httpStatus   = 502
    errorMessage = e instanceof Error ? e.message : String(e)
  }

  // 3. Finalizar el log
  await supabase.rpc('extensiv_item_log_finalize', {
    p_log_id:           logIdStr,
    p_extensiv_item_id: extensivItemId,
    p_http_status:      httpStatus,
    p_error_message:    errorMessage ?? null,
  })

  return {
    ok:             !errorMessage && httpStatus >= 200 && httpStatus < 300,
    logId:          logIdStr,
    extensivItemId,
    httpStatus,
    error:          errorMessage,
  }
}
