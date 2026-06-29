/**
 * EntradaWizardContext — estado compartido + persistencia del wizard de
 * Entradas de Almacén (3 pasos).
 *
 * - El cliente y la nota se capturan UNA sola vez (Paso 1) y se arrastran por
 *   los 3 pasos.
 * - Cada transición/acción persiste en `warehouse_entries` (si la tabla existe);
 *   si la persistencia falla, el wizard sigue funcionando en memoria.
 * - `resumeFromEntry(id)` rehidrata el estado desde la BD. El binario del
 *   archivo NO se persiste: tras reanudar `notaFile` es null pero `originalItems`
 *   permite continuar Pasos 2 y 3.
 */
import {
  createContext, useCallback, useContext, useRef, useState, type ReactNode,
} from 'react'
import { useAuthContext } from './AuthContext'
import { getExtensivInventoryByCustomer, getExtensivRegisteredSkus } from '../lib/extensiv'
import { normalizeSKU, findPartialSkuCandidates, type PTLineItem } from '../lib/ptParser'
import { extractItemsFromFile } from '../lib/entradaExtract'
import { getClientImportHint } from '../lib/clientImportFormats'
import {
  createWarehouseEntry, updateWarehouseEntry, getWarehouseEntry,
  type UpdateWarehouseEntryData,
} from '../hooks/useWarehouseEntries'
import type {
  WizardState, WizardStep, ValidationRow, VerificationRow, VerificationStatus,
} from '../types/warehouseEntry'

const INITIAL_STATE: WizardState = {
  entryId:        null,
  currentStep:    1,
  flowStatus:     'paso1',
  customerId:     null,
  customerName:   '',
  notaFileName:   '',
  notaFile:       null,
  originalItems:  [],
  ref:            '',
  extractedVia:   null,
  documentTotalQty: null,
  step1Results:   [],
  step1Complete:  false,
  step2Items:     [],
  exportGenerated: false,
  exportFileName: null,
  step3Results:   [],
  anomalies:      {},
  extensivTransactionId: '',
}

interface EntradaWizardContextType {
  state: WizardState
  // runtime (no persistido)
  catalogCount:   number
  catalogLoading: boolean
  extracting:     boolean
  verifyLoading:  boolean
  error:          string
  saving:         boolean
  lastSavedAt:    Date | null
  // derivados
  unregisteredCount: number        // SKUs sin coincidencia (match='none')
  pendingConfirmCount: number      // SKUs con coincidencia parcial sin confirmar
  extractedTotalQty: number        // suma de cantidades extraídas
  totalMismatch:    boolean        // true si documentTotalQty != suma extraída
  // acciones
  setCustomer:        (id: number, name: string) => void
  setNotaFile:        (file: File) => Promise<void>
  clearNota:          () => void
  runStep1Validation: () => void
  confirmSkuMatch:    (docSku: string, registeredSku: string) => void
  goToStep:           (step: WizardStep) => void
  setRef:             (ref: string) => void
  updateStep2Item:    (idx: number, field: 'sku' | 'qty' | 'serialNumber', value: string | number | null) => void
  addStep2Item:       () => void
  deleteStep2Item:    (idx: number) => void
  markExportGenerated: (fileName: string) => void
  runStep3Verification: () => Promise<void>
  setAnomaly:         (sku: string, text: string) => void
  setTransactionId:   (id: string) => void
  finishWizard:       () => void
  resetWizard:        () => void
  resumeFromEntry:    (id: string) => Promise<void>
  clearError:         () => void
}

const Ctx = createContext<EntradaWizardContextType | null>(null)

export function EntradaWizardProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthContext()

  const [state, setState] = useState<WizardState>(INITIAL_STATE)
  const stateRef = useRef(state)
  stateRef.current = state

  const [catalogSet, setCatalogSet]       = useState<Set<string> | null>(null)
  const catalogSetRef = useRef<Set<string> | null>(null)
  catalogSetRef.current = catalogSet
  const [catalogCount, setCatalogCount]   = useState(0)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [extracting, setExtracting]       = useState(false)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [error, setError]                 = useState('')
  const [saving, setSaving]               = useState(false)
  const [lastSavedAt, setLastSavedAt]     = useState<Date | null>(null)

  // ── Persistencia ────────────────────────────────────────────────────────
  const pendingPatch = useRef<UpdateWarehouseEntryData>({})
  const flushTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persistNow = useCallback(async (patch: UpdateWarehouseEntryData) => {
    const id = stateRef.current.entryId
    if (!id) return
    setSaving(true)
    try {
      await updateWarehouseEntry(id, patch)
      setLastSavedAt(new Date())
    } catch (e) {
      console.warn('No se pudo guardar la entrada:', e)
    } finally {
      setSaving(false)
    }
  }, [])

  const flushPending = useCallback(async () => {
    if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null }
    const patch = pendingPatch.current
    pendingPatch.current = {}
    if (Object.keys(patch).length > 0) await persistNow(patch)
  }, [persistNow])

  const schedulePersist = useCallback((patch: UpdateWarehouseEntryData) => {
    pendingPatch.current = { ...pendingPatch.current, ...patch }
    if (flushTimer.current) clearTimeout(flushTimer.current)
    flushTimer.current = setTimeout(() => { void flushPending() }, 300)
  }, [flushPending])

  // ── Catálogo Extensiv (Paso 1) ──────────────────────────────────────────
  // Valida contra el ITEM MASTER (SKUs dados de alta), NO contra el stock — un
  // SKU registrado con 0 existencias debe contar como "Registrado".
  const loadCatalog = useCallback(async (customerId: number) => {
    // Cliente de PRUEBA (id < 0): no existe en Extensiv → catálogo vacío, sin error.
    // Todos los SKUs saldrán "por dar de alta"; se avanza con el override de prueba.
    if (customerId < 0) {
      setCatalogSet(new Set())
      setCatalogCount(0)
      setCatalogLoading(false)
      return
    }
    setCatalogLoading(true)
    setCatalogSet(null)
    setCatalogCount(0)
    try {
      const skus = await getExtensivRegisteredSkus(customerId)
      const set = new Set<string>()
      for (const raw of skus) {
        const n = normalizeSKU(raw)
        if (n) set.add(n)
      }
      setCatalogSet(set)
      setCatalogCount(set.size)
    } catch (e) {
      setError(`Error al obtener catálogo de Extensiv: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  // ── Acciones ─────────────────────────────────────────────────────────────
  const setCustomer = useCallback((id: number, name: string) => {
    setState(prev => ({
      ...prev,
      customerId: id,
      customerName: name,
      // cambiar de cliente invalida la validación previa
      step1Results: [], step1Complete: false,
    }))
    void loadCatalog(id)
    if (stateRef.current.entryId) {
      schedulePersist({ customer_id: id, customer_name: name, step1_results: [], step1_complete: false })
    }
  }, [loadCatalog, schedulePersist])

  const setNotaFile = useCallback(async (file: File) => {
    setError('')
    setExtracting(true)
    try {
      const hint = getClientImportHint(stateRef.current.customerName)
      const { items, ref, via, documentTotalQty } = await extractItemsFromFile(file, hint)
      if (items.length === 0) {
        setError('No se encontraron SKUs en el documento. Verifica que tenga columnas de SKU y Cantidad.')
      }
      const step2Items = items.map(it => ({ sku: it.sku, qty: it.qty, serialNumber: it.serialNumber }))
      setState(prev => ({
        ...prev,
        notaFile: file,
        notaFileName: file.name,
        originalItems: items,
        ref: ref ?? '',
        extractedVia: via,
        documentTotalQty,
        step2Items,
        // re-subir invalida resultados previos
        step1Results: [], step1Complete: false,
        step3Results: [], anomalies: {},
        exportGenerated: false, exportFileName: null,
        extensivTransactionId: '',
      }))

      const cur = stateRef.current
      const dbFields = {
        customer_id: cur.customerId,
        customer_name: cur.customerName,
        nota_file_name: file.name,
        extracted_via: via,
        ref: ref ?? '',
        original_items: items,
        document_total_qty: documentTotalQty,
        step2_items: step2Items,
        step1_results: [], step1_complete: false,
        step3_results: [], anomalies: {},
        export_generated: false, export_file_name: null,
        extensiv_transaction_id: null,
      }
      try {
        if (cur.entryId) {
          await persistNow(dbFields)
        } else {
          const created = await createWarehouseEntry({
            flow_status: 'paso1', current_step: 1,
            created_by: user?.email ?? null,
            ...dbFields,
          })
          setState(prev => ({ ...prev, entryId: created.id }))
          setLastSavedAt(new Date())
        }
      } catch (e) {
        // Persistencia opcional: el wizard sigue en memoria aunque falle.
        console.warn('No se pudo crear/actualizar la entrada en BD:', e)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al procesar el documento')
    } finally {
      setExtracting(false)
    }
  }, [persistNow, user?.email])

  const clearNota = useCallback(() => {
    setState(prev => ({
      ...prev,
      notaFile: null, notaFileName: '', originalItems: [], ref: '', extractedVia: null,
      documentTotalQty: null,
      step1Results: [], step1Complete: false,
      step2Items: [], exportGenerated: false, exportFileName: null,
      step3Results: [], anomalies: {}, extensivTransactionId: '',
    }))
    setError('')
    schedulePersist({
      nota_file_name: null, extracted_via: null, ref: '', original_items: [],
      document_total_qty: null,
      step1_results: [], step1_complete: false,
      step2_items: [], export_generated: false, export_file_name: null,
      step3_results: [], anomalies: {}, extensiv_transaction_id: null,
    })
  }, [schedulePersist])

  const runStep1Validation = useCallback(() => {
    const cur = stateRef.current
    const set = catalogSetRef.current
    if (!set || cur.originalItems.length === 0) return
    const catalogArr = Array.from(set)
    const results: ValidationRow[] = cur.originalItems.flatMap((item): ValidationRow[] => {
      const sku = normalizeSKU(item.sku)
      if (!sku) return []
      if (set.has(sku)) {
        return [{ sku, qty: item.qty, match: 'exact', candidates: [], confirmedSku: null, registered: true }]
      }
      // Sin match exacto → busca coincidencias parciales (NTL49926-1 ⊂ NTL49926-1000).
      const candidates = findPartialSkuCandidates(sku, catalogArr)
      const match = candidates.length > 0 ? 'partial' : 'none'
      // 'partial' NO cuenta como registrado hasta que el usuario confirme (decisión del usuario).
      return [{ sku, qty: item.qty, match, candidates, confirmedSku: null, registered: false }]
    })
    // Orden: pendientes primero (none, luego partial), registrados al final.
    const rank = (r: ValidationRow) => r.registered ? 2 : r.match === 'partial' ? 1 : 0
    results.sort((a, b) => rank(a) - rank(b))
    const complete = results.length > 0 && results.every(r => r.registered)
    setState(prev => ({ ...prev, step1Results: results, step1Complete: complete }))
    schedulePersist({ step1_results: results, step1_complete: complete })
  }, [schedulePersist])

  // Confirma que un SKU del documento equivale a uno registrado en Extensiv
  // (coincidencia parcial). Tras confirmar cuenta como "dado de alta".
  const confirmSkuMatch = useCallback((docSku: string, registeredSku: string) => {
    setState(prev => {
      const results = prev.step1Results.map(r =>
        r.sku === docSku ? { ...r, confirmedSku: registeredSku, registered: true } : r,
      )
      const complete = results.length > 0 && results.every(r => r.registered)
      schedulePersist({ step1_results: results, step1_complete: complete })
      return { ...prev, step1Results: results, step1Complete: complete }
    })
  }, [schedulePersist])

  const goToStep = useCallback((step: WizardStep) => {
    const flowStatus = step === 1 ? 'paso1' : step === 2 ? 'paso2' : 'paso3'
    setState(prev => ({ ...prev, currentStep: step, flowStatus }))
    schedulePersist({ current_step: step, flow_status: flowStatus })
  }, [schedulePersist])

  const setRef = useCallback((ref: string) => {
    setState(prev => ({ ...prev, ref }))
    schedulePersist({ ref })
  }, [schedulePersist])

  const updateStep2Item = useCallback((idx: number, field: 'sku' | 'qty' | 'serialNumber', value: string | number | null) => {
    setState(prev => {
      const step2Items = prev.step2Items.map((it, i) => i === idx ? { ...it, [field]: value } : it)
      schedulePersist({ step2_items: step2Items })
      return { ...prev, step2Items }
    })
  }, [schedulePersist])

  const addStep2Item = useCallback(() => {
    setState(prev => {
      const step2Items = [...prev.step2Items, { sku: '', qty: 1, serialNumber: null }]
      schedulePersist({ step2_items: step2Items })
      return { ...prev, step2Items }
    })
  }, [schedulePersist])

  const deleteStep2Item = useCallback((idx: number) => {
    setState(prev => {
      const step2Items = prev.step2Items.filter((_, i) => i !== idx)
      schedulePersist({ step2_items: step2Items })
      return { ...prev, step2Items }
    })
  }, [schedulePersist])

  const markExportGenerated = useCallback((fileName: string) => {
    setState(prev => ({ ...prev, exportGenerated: true, exportFileName: fileName }))
    schedulePersist({ export_generated: true, export_file_name: fileName })
  }, [schedulePersist])

  const runStep3Verification = useCallback(async () => {
    const cur = stateRef.current
    if (!cur.customerId || cur.originalItems.length === 0) return
    setVerifyLoading(true)
    setError('')
    try {
      // Inventario FRESCO (el usuario ya subió el receipt a Extensiv).
      // Cliente de prueba (id < 0): sin inventario en Extensiv → todo "no encontrado".
      const items = cur.customerId < 0 ? [] : await getExtensivInventoryByCustomer(cur.customerId)
      const map = new Map<string, number>()
      for (const it of items) {
        const n = normalizeSKU(it.sku)
        if (n) map.set(n, it.onHand)
      }
      const STATUS_ORDER: Record<VerificationStatus, number> = { not_found: 0, qty_diff: 1, confirmed: 2 }
      const prevAnomalies = cur.anomalies
      // Alias confirmados en el Paso 1 (doc SKU → SKU real de Extensiv) para que la
      // verificación busque el inventario por el SKU correcto.
      const aliasMap = new Map<string, string>()
      for (const r of cur.step1Results) {
        if (r.confirmedSku) aliasMap.set(r.sku, r.confirmedSku)
      }
      const results: VerificationRow[] = cur.originalItems.flatMap((item: PTLineItem) => {
        const sku = normalizeSKU(item.sku)
        if (!sku) return []
        const lookupSku = aliasMap.get(sku) ?? sku
        const qtyExt = map.has(lookupSku) ? (map.get(lookupSku) ?? null) : null
        const status: VerificationStatus =
          qtyExt === null ? 'not_found' : qtyExt >= item.qty ? 'confirmed' : 'qty_diff'
        return [{ sku, qtyDoc: item.qty, qtyExt, status, anomaly: prevAnomalies[sku] ?? '' }]
      })
      results.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
      setState(prev => ({ ...prev, step3Results: results }))
      schedulePersist({ step3_results: results })
    } catch (e) {
      setError(`Error al obtener inventario de Extensiv: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setVerifyLoading(false)
    }
  }, [schedulePersist])

  const setAnomaly = useCallback((sku: string, text: string) => {
    setState(prev => {
      const anomalies = { ...prev.anomalies, [sku]: text }
      const step3Results = prev.step3Results.map(r => r.sku === sku ? { ...r, anomaly: text } : r)
      schedulePersist({ anomalies, step3_results: step3Results })
      return { ...prev, anomalies, step3Results }
    })
  }, [schedulePersist])

  const setTransactionId = useCallback((id: string) => {
    setState(prev => ({ ...prev, extensivTransactionId: id }))
    schedulePersist({ extensiv_transaction_id: id.trim() || null })
  }, [schedulePersist])

  const finishWizard = useCallback(() => {
    // Requiere número de transacción de Extensiv para trazabilidad/log.
    if (!stateRef.current.extensivTransactionId.trim()) {
      setError('Captura el número de transacción de Extensiv para finalizar.')
      return
    }
    setState(prev => ({ ...prev, flowStatus: 'completada' }))
    // Persistir de inmediato (no en debounce): al finalizar se navega fuera y
    // un timer pendiente quedaría colgado.
    void (async () => {
      await flushPending()
      await persistNow({
        flow_status: 'completada',
        completed_at: new Date().toISOString(),
        extensiv_transaction_id: stateRef.current.extensivTransactionId.trim(),
      })
    })()
  }, [flushPending, persistNow])

  const resetWizard = useCallback(() => {
    if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null }
    pendingPatch.current = {}
    setState(INITIAL_STATE)
    setCatalogSet(null)
    setCatalogCount(0)
    setError('')
    setLastSavedAt(null)
  }, [])

  const resumeFromEntry = useCallback(async (id: string) => {
    setError('')
    try {
      const row = await getWarehouseEntry(id)
      if (!row) { setError('No se encontró la entrada solicitada.'); return }
      const step = (row.current_step >= 1 && row.current_step <= 3 ? row.current_step : 1) as WizardStep
      setState({
        entryId:        row.id,
        currentStep:    step,
        flowStatus:     row.flow_status,
        customerId:     row.customer_id,
        customerName:   row.customer_name ?? '',
        notaFileName:   row.nota_file_name ?? '',
        notaFile:       null,
        originalItems:  row.original_items ?? [],
        ref:            row.ref ?? '',
        extractedVia:   row.extracted_via,
        documentTotalQty: row.document_total_qty ?? null,
        step1Results:   row.step1_results ?? [],
        step1Complete:  row.step1_complete ?? false,
        step2Items:     row.step2_items ?? [],
        exportGenerated: row.export_generated ?? false,
        exportFileName: row.export_file_name,
        step3Results:   row.step3_results ?? [],
        anomalies:      row.anomalies ?? {},
        extensivTransactionId: row.extensiv_transaction_id ?? '',
      })
      // Re-cargar catálogo para que el Paso 1 muestre el contador / pueda re-validar.
      if (row.customer_id) void loadCatalog(row.customer_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al reanudar la entrada')
    }
  }, [loadCatalog])

  const clearError = useCallback(() => setError(''), [])

  const unregisteredCount = state.step1Results.filter(r => !r.registered && r.match !== 'partial').length
  const pendingConfirmCount = state.step1Results.filter(r => !r.registered && r.match === 'partial').length
  const extractedTotalQty = state.originalItems.reduce((s, it) => s + (Number(it.qty) || 0), 0)
  const totalMismatch =
    state.documentTotalQty != null &&
    state.originalItems.length > 0 &&
    state.documentTotalQty !== extractedTotalQty

  const value: EntradaWizardContextType = {
    state,
    catalogCount, catalogLoading, extracting, verifyLoading, error, saving, lastSavedAt,
    unregisteredCount, pendingConfirmCount, extractedTotalQty, totalMismatch,
    setCustomer, setNotaFile, clearNota, runStep1Validation, confirmSkuMatch, goToStep, setRef,
    updateStep2Item, addStep2Item, deleteStep2Item, markExportGenerated,
    runStep3Verification, setAnomaly, setTransactionId, finishWizard, resetWizard, resumeFromEntry,
    clearError,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useEntradaWizard() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useEntradaWizard must be used inside EntradaWizardProvider')
  return c
}
