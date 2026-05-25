import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Upload, FileSpreadsheet, Download, Trash2, XCircle, AlertTriangle,
  Loader2, FileInput, Plus, CheckCircle2, Database,
} from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { extractReceiptItemsFromPT } from '../../lib/ptParser'
import { generateReceiptExcel } from './receiptExport'
import {
  isExtensivConfigured,
  getExtensivCustomers,
  getExtensivInventoryByCustomer,
  type ExtensivCustomer,
  type ExtensivStockItem,
} from '../../lib/extensiv'

/* ─── SKU matching (espejo del Validador SKU) ──────────────────────── */
const MAX_PARTIAL_CANDIDATES = 75

type MatchType = 'exact' | 'partial' | 'none' | 'pending'

interface ReceiptItem {
  sku: string
  qty: number
  serialNumber: string | null
  matchType: MatchType
  matchedSKUs: string[]
  confirmed: boolean
}

interface InventoryMatch {
  matchedSKUs: string[]
  matchType: Exclude<MatchType, 'pending'>
}

function sharedPrefixSegments(a: string, b: string): number {
  const pa = a.split('-')
  const pb = b.split('-')
  let count = 0
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] === pb[i]) count++
    else break
  }
  return count
}

function findInventoryMatch(sku: string, inventory: Record<string, number>, invKeys: string[]): InventoryMatch {
  if (inventory[sku] !== undefined) {
    return { matchedSKUs: [sku], matchType: 'exact' }
  }
  const startsWithMatches = invKeys.filter(k => k.startsWith(sku))
  if (startsWithMatches.length > 0) {
    const candidates = startsWithMatches
      .sort((a, b) => a.length - b.length || a.localeCompare(b))
      .slice(0, MAX_PARTIAL_CANDIDATES)
    return { matchedSKUs: candidates, matchType: 'partial' }
  }
  const ptSegments = sku.split('-')
  const minShared = Math.min(2, ptSegments.length)
  let bestShared = 0
  let bestMatches: string[] = []
  for (const k of invKeys) {
    const shared = sharedPrefixSegments(sku, k)
    if (shared >= minShared) {
      if (shared > bestShared) { bestShared = shared; bestMatches = [k] }
      else if (shared === bestShared) bestMatches.push(k)
    }
  }
  if (bestMatches.length > 0) {
    const candidates = bestMatches
      .sort((a, b) => a.length - b.length || a.localeCompare(b))
      .slice(0, MAX_PARTIAL_CANDIDATES)
    return { matchedSKUs: candidates, matchType: 'partial' }
  }
  return { matchedSKUs: [], matchType: 'none' }
}

/* Valida un SKU contra el inventario cargado. Sin inventario => 'pending'. */
function classifySku(
  sku: string,
  inventory: Record<string, number> | null,
  invKeys: string[],
): { matchedSKUs: string[]; matchType: MatchType } {
  const clean = sku.trim().toUpperCase()
  if (!inventory) return { matchedSKUs: [], matchType: 'pending' }
  if (!clean) return { matchedSKUs: [], matchType: 'none' }
  return findInventoryMatch(clean, inventory, invKeys)
}

/* ─── Component ─────────────────────────────────────────────────────── */
export function ReceiptGeneratorPage() {
  const apiConfigured = isExtensivConfigured()

  const [ptFile, setPtFile] = useState<File | null>(null)
  const [ref, setRef] = useState('')
  const [items, setItems] = useState<ReceiptItem[]>([])
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  const [customers, setCustomers] = useState<ExtensivCustomer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<number | ''>('')
  const [inventory, setInventory] = useState<Record<string, number> | null>(null)
  const [invKeys, setInvKeys] = useState<string[]>([])
  const [fetchingInv, setFetchingInv] = useState(false)

  const ptRef = useRef<HTMLInputElement>(null)

  // Cargar clientes Extensiv al montar
  useEffect(() => {
    if (!apiConfigured) return
    getExtensivCustomers()
      .then(setCustomers)
      .catch(e => console.warn('No se pudieron cargar clientes Extensiv:', e))
  }, [apiConfigured])

  // Re-validar todos los items contra un inventario dado
  const revalidateAll = useCallback((inv: Record<string, number> | null, keys: string[]) => {
    setItems(prev => prev.map(it => {
      const m = classifySku(it.sku, inv, keys)
      return { ...it, matchType: m.matchType, matchedSKUs: m.matchedSKUs, confirmed: false }
    }))
  }, [])

  const fetchInventory = useCallback(async (customerId: number) => {
    setFetchingInv(true)
    setInventory(null)
    setInvKeys([])
    setError('')
    try {
      const stock: ExtensivStockItem[] = await getExtensivInventoryByCustomer(customerId)
      const inv: Record<string, number> = {}
      for (const s of stock) {
        if (s.sku) inv[s.sku] = s.available
      }
      const keys = Object.keys(inv)
      setInventory(inv)
      setInvKeys(keys)
      revalidateAll(inv, keys)
    } catch (e) {
      setError(`Error al obtener inventario de Extensiv: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setFetchingInv(false)
    }
  }, [revalidateAll])

  const handleCustomerChange = (id: number | '') => {
    setSelectedCustomer(id)
    if (id) {
      fetchInventory(id)
    } else {
      setInventory(null)
      setInvKeys([])
      revalidateAll(null, [])
    }
  }

  const handleExtract = useCallback(async (file: File, inv: Record<string, number> | null, keys: string[]) => {
    setProcessing(true)
    setError('')
    setItems([])
    setRef('')
    try {
      const { ref: detectedRef, items: extracted } = await extractReceiptItemsFromPT(file)
      setRef(detectedRef ?? '')
      const validated: ReceiptItem[] = extracted.map(it => {
        const m = classifySku(it.sku, inv, keys)
        return {
          sku: it.sku,
          qty: it.qty,
          serialNumber: it.serialNumber,
          matchType: m.matchType,
          matchedSKUs: m.matchedSKUs,
          confirmed: false,
        }
      })
      setItems(validated)
      if (validated.length === 0) {
        setError('No se encontraron items en el PT. Verifica que tenga columnas SKU y Cantidad identificables.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al procesar PT')
    } finally {
      setProcessing(false)
    }
  }, [])

  const handleFileChange = (file: File) => {
    setPtFile(file)
    handleExtract(file, inventory, invKeys)
  }

  const handleReset = () => {
    setPtFile(null)
    setRef('')
    setItems([])
    setError('')
    if (ptRef.current) ptRef.current.value = ''
  }

  const updateSku = (idx: number, value: string) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const m = classifySku(value, inventory, invKeys)
      return { ...it, sku: value, matchType: m.matchType, matchedSKUs: m.matchedSKUs, confirmed: false }
    }))
  }

  const updateField = (idx: number, field: 'qty' | 'serialNumber', value: string | number | null) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  const toggleConfirm = (idx: number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, confirmed: !it.confirmed } : it))
  }

  const deleteItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const addEmptyItem = () => {
    const m = classifySku('', inventory, invKeys)
    setItems(prev => [...prev, { sku: '', qty: 1, serialNumber: null, matchType: m.matchType, matchedSKUs: m.matchedSKUs, confirmed: false }])
  }

  const handleDownload = () => {
    const cleaned = items
      .map(i => ({ sku: i.sku.trim().toUpperCase(), qty: Number(i.qty) || 0, serialNumber: i.serialNumber }))
      .filter(i => i.sku && i.qty > 0)
    if (cleaned.length === 0) {
      setError('No hay items válidos para exportar')
      return
    }
    generateReceiptExcel(ref.trim() || 'PT', cleaned)
  }

  /* ─── Gating de validación ──────────────────────────────────────── */
  const stats = {
    total: items.length,
    exact: items.filter(i => i.matchType === 'exact').length,
    partial: items.filter(i => i.matchType === 'partial').length,
    partialConfirmed: items.filter(i => i.matchType === 'partial' && i.confirmed).length,
    none: items.filter(i => i.matchType === 'none').length,
    pending: items.filter(i => i.matchType === 'pending').length,
  }
  const allValidated = items.length > 0 && items.every(i =>
    i.matchType === 'exact' || (i.matchType === 'partial' && i.confirmed),
  )
  const canExport = !!ref.trim() && allValidated

  let blockReason = ''
  if (!ref.trim()) blockReason = 'Falta el Ref#.'
  else if (items.length === 0) blockReason = 'No hay items.'
  else if (stats.none > 0) blockReason = `${stats.none} SKU(s) no existen en el inventario Extensiv — corrígelos.`
  else if (stats.pending > 0) blockReason = 'Selecciona un cliente para validar los SKUs contra Extensiv.'
  else if (stats.partial > stats.partialConfirmed) blockReason = `${stats.partial - stats.partialConfirmed} coincidencia(s) parcial(es) sin confirmar.`

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-6">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-[#1e3a5f]">Generador Receipt Import</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Sube un PT, valida cada SKU contra el inventario de Extensiv y genera el archivo Receipt_Import.xlsx.
            </p>
          </div>

          {/* Cliente Extensiv */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
            <label className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
              <Database size={13} className="text-[#1e3a5f]" /> Cliente Extensiv (fuente de validación)
            </label>
            {apiConfigured ? (
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={selectedCustomer}
                  onChange={e => handleCustomerChange(e.target.value ? Number(e.target.value) : '')}
                  className="h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 min-w-[16rem]"
                >
                  <option value="">— Selecciona un cliente —</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {fetchingInv && (
                  <span className="text-xs text-blue-600 flex items-center gap-1.5">
                    <Loader2 size={14} className="animate-spin" /> Cargando inventario…
                  </span>
                )}
                {inventory && !fetchingInv && (
                  <span className="text-xs text-green-700 flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> {invKeys.length} SKUs en inventario
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs text-amber-700 flex items-center gap-1.5">
                <AlertTriangle size={13} /> Extensiv no está configurado — la validación de SKUs no está disponible.
              </p>
            )}
          </div>

          {/* Upload */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
            <label className="text-xs font-semibold text-gray-600 mb-3 block">Pick Ticket (PDF o Excel)</label>
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                ptFile ? 'border-green-300 bg-green-50/50' : 'border-gray-200 hover:border-[#1e3a5f]/30 hover:bg-gray-50'
              }`}
              onClick={() => ptRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                if (e.dataTransfer.files[0]) handleFileChange(e.dataTransfer.files[0])
              }}
            >
              <input
                ref={ptRef}
                type="file"
                accept=".pdf,.xlsx,.xls,.csv"
                className="hidden"
                onChange={e => { if (e.target.files?.[0]) handleFileChange(e.target.files[0]) }}
              />
              {ptFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileSpreadsheet size={18} className="text-green-600" />
                  <span className="text-sm font-medium text-green-700">{ptFile.name}</span>
                  <button
                    onClick={e => { e.stopPropagation(); handleReset() }}
                    className="ml-2 text-gray-400 hover:text-red-500"
                  >
                    <XCircle size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <Upload size={28} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">Arrastra o haz clic para subir el Pick Ticket</p>
                  <p className="text-[10px] text-gray-300 mt-1">PDF, XLS, XLSX, CSV</p>
                </>
              )}
            </div>
          </div>

          {/* Loading */}
          {processing && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-blue-600">
              <Loader2 size={16} className="animate-spin" /> Procesando PT...
            </div>
          )}

          {/* Error */}
          {error && !processing && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" /> {error}
            </div>
          )}

          {/* Datos extraídos */}
          {!processing && ptFile && items.length > 0 && (
            <>
              {/* Banner de validación */}
              <div className={`mb-4 p-3 rounded-lg border text-sm flex items-center gap-3 flex-wrap ${
                allValidated
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : stats.none > 0
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                {allValidated
                  ? <CheckCircle2 size={16} className="shrink-0" />
                  : <AlertTriangle size={16} className="shrink-0" />}
                <span className="font-medium">
                  {stats.exact + stats.partialConfirmed} de {stats.total} SKUs validados
                </span>
                {stats.partial - stats.partialConfirmed > 0 && (
                  <span>· {stats.partial - stats.partialConfirmed} requieren confirmación</span>
                )}
                {stats.none > 0 && <span>· {stats.none} sin encontrar</span>}
                {stats.pending > 0 && <span>· {stats.pending} sin validar (selecciona cliente)</span>}
              </div>

              {/* Ref input */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
                <label className="text-xs font-semibold text-gray-600 mb-2 block">
                  Ref # <span className="text-red-500">*</span>
                  <span className="text-[10px] font-normal text-gray-400 ml-2">
                    (detectado automáticamente — puedes corregirlo si es necesario)
                  </span>
                </label>
                <input
                  type="text"
                  value={ref}
                  onChange={e => setRef(e.target.value)}
                  placeholder="Ej: SO2554"
                  className={`w-full max-w-xs h-10 px-3 rounded-lg border text-sm font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 ${
                    ref.trim() ? 'border-green-300 bg-green-50/30' : 'border-amber-300 bg-amber-50/30'
                  }`}
                />
                {!ref.trim() && (
                  <p className="text-[10px] text-amber-700 mt-1.5 flex items-center gap-1">
                    <AlertTriangle size={10} /> No se pudo detectar el Ref# automáticamente. Escríbelo manualmente.
                  </p>
                )}
              </div>

              {/* Datalist con catálogo Extensiv para autocomplete */}
              <datalist id="extensiv-sku-catalog">
                {invKeys.map(k => <option key={k} value={k} />)}
              </datalist>

              {/* Items table */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-4">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                  <p className="text-xs font-semibold text-gray-600">
                    Items extraídos ({items.length})
                  </p>
                  <button
                    onClick={addEmptyItem}
                    className="flex items-center gap-1 text-[11px] font-medium text-[#1e3a5f] hover:underline"
                  >
                    <Plus size={12} /> Agregar línea
                  </button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider w-28">Estado</th>
                      <th className="text-left px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">SKU</th>
                      <th className="text-right px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider w-24">Cantidad</th>
                      <th className="text-left px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Serial #</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const rowBg = item.matchType === 'exact'
                        ? 'bg-green-50/40'
                        : item.matchType === 'partial'
                          ? (item.confirmed ? 'bg-green-50/40' : 'bg-amber-50/50')
                          : item.matchType === 'none'
                            ? 'bg-red-50/50'
                            : ''
                      return (
                        <tr key={idx} className={`border-b border-gray-50 hover:bg-gray-50/40 ${rowBg}`}>
                          {/* Estado */}
                          <td className="px-4 py-2">
                            {item.matchType === 'exact' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700">
                                <CheckCircle2 size={13} /> Validado
                              </span>
                            )}
                            {item.matchType === 'partial' && (
                              <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.confirmed}
                                  onChange={() => toggleConfirm(idx)}
                                  className="accent-amber-500"
                                />
                                {item.confirmed ? 'Confirmado' : 'Parcial'}
                              </label>
                            )}
                            {item.matchType === 'none' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">
                                <XCircle size={13} /> No existe
                              </span>
                            )}
                            {item.matchType === 'pending' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400">
                                Sin validar
                              </span>
                            )}
                          </td>
                          {/* SKU */}
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={item.sku}
                              list="extensiv-sku-catalog"
                              onChange={e => updateSku(idx, e.target.value)}
                              className={`w-full h-8 px-2 rounded border focus:outline-none font-mono text-xs font-semibold text-gray-800 ${
                                item.matchType === 'none'
                                  ? 'border-red-300 focus:border-red-500'
                                  : item.matchType === 'partial' && !item.confirmed
                                    ? 'border-amber-300 focus:border-amber-500'
                                    : 'border-transparent hover:border-gray-200 focus:border-[#1e3a5f]'
                              }`}
                            />
                            {item.matchType === 'partial' && item.matchedSKUs.length > 0 && (
                              <p className="text-[10px] text-amber-600 mt-1 truncate" title={item.matchedSKUs.join(', ')}>
                                Coincide con: {item.matchedSKUs.slice(0, 3).join(', ')}
                                {item.matchedSKUs.length > 3 ? ` +${item.matchedSKUs.length - 3}` : ''}
                              </p>
                            )}
                          </td>
                          {/* Cantidad */}
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              value={item.qty}
                              onChange={e => updateField(idx, 'qty', Number(e.target.value))}
                              className="w-full h-8 px-2 rounded border border-transparent hover:border-gray-200 focus:border-[#1e3a5f] focus:outline-none text-right text-sm"
                            />
                          </td>
                          {/* Serial */}
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={item.serialNumber ?? ''}
                              onChange={e => updateField(idx, 'serialNumber', e.target.value || null)}
                              placeholder="(opcional)"
                              className="w-full h-8 px-2 rounded border border-transparent hover:border-gray-200 focus:border-[#1e3a5f] focus:outline-none font-mono text-xs text-gray-700"
                            />
                          </td>
                          {/* Eliminar */}
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => deleteItem(idx)}
                              className="text-gray-300 hover:text-red-500 p-1"
                              title="Eliminar línea"
                            >
                              <XCircle size={14} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Actions */}
              <div className="flex gap-3 items-center flex-wrap">
                <button
                  onClick={handleDownload}
                  disabled={!canExport}
                  title={canExport ? '' : `Bloqueado: ${blockReason}`}
                  className="h-10 px-6 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#16304d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download size={16} />
                  Generar Receipt_Import.xlsx
                </button>
                <button
                  onClick={handleReset}
                  className="h-10 px-4 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 flex items-center gap-2 hover:bg-gray-50 transition-colors"
                >
                  <Trash2 size={16} /> Limpiar
                </button>
                {!canExport && blockReason && (
                  <span className="text-xs text-amber-700 flex items-center gap-1.5">
                    <AlertTriangle size={13} /> {blockReason}
                  </span>
                )}
              </div>

              <p className="text-[10px] text-gray-400 mt-3 flex items-center gap-1">
                <FileInput size={10} />
                El archivo se exporta sin colores, listo para importar a Extensiv. Cada SKU se valida contra el inventario del cliente.
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
