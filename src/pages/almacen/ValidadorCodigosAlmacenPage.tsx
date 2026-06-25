import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Upload, FileSpreadsheet, XCircle, AlertTriangle, Loader2,
  CheckCircle2, Download, Trash2, Search, Database, Sparkles,
} from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { useToast } from '../../hooks/useToast'
import { extractReceiptItemsFromPT, normalizeSKU, type PTLineItem } from '../../lib/ptParser'
import { extractReceiptItemsWithVision } from '../../lib/visionExtract'
import {
  isExtensivConfigured,
  getExtensivCustomers,
  getExtensivInventoryByCustomer,
  type ExtensivCustomer,
  type ExtensivStockItem,
} from '../../lib/extensiv'
import { downloadUnregistered } from '../../lib/entradaExports'

interface CodigoResult {
  sku: string
  qty: number
  registered: boolean
}

export function ValidadorCodigosAlmacenPage() {
  const apiConfigured = isExtensivConfigured()
  const toast = useToast()

  const [docFile, setDocFile] = useState<File | null>(null)
  const [results, setResults] = useState<CodigoResult[]>([])
  const [processing, setProcessing] = useState(false)
  const [visionLoading, setVisionLoading] = useState(false)
  const [fetchingInv, setFetchingInv] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<ExtensivCustomer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<number | ''>('')
  const [catalogCache, setCatalogCache] = useState<Set<string> | null>(null)
  const [catalogCount, setCatalogCount] = useState(0)
  const [extractedVia, setExtractedVia] = useState<'vision' | 'text' | null>(null)
  const docRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!apiConfigured) return
    getExtensivCustomers()
      .then(setCustomers)
      .catch(e => console.warn('Could not load Extensiv customers:', e))
  }, [apiConfigured])

  const fetchCatalog = useCallback(async (customerId: number) => {
    setFetchingInv(true)
    setCatalogCache(null)
    setCatalogCount(0)
    setError('')
    try {
      const items: ExtensivStockItem[] = await getExtensivInventoryByCustomer(customerId)
      const skuSet = new Set<string>()
      for (const item of items) {
        const n = normalizeSKU(item.sku)
        if (n) skuSet.add(n)
      }
      setCatalogCache(skuSet)
      setCatalogCount(skuSet.size)
    } catch (e) {
      setError(`Error al obtener catálogo de Extensiv: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setFetchingInv(false)
    }
  }, [])

  const handleCustomerChange = (id: number | '') => {
    setSelectedCustomer(id)
    setResults([])
    if (id) fetchCatalog(id)
    else { setCatalogCache(null); setCatalogCount(0) }
  }

  const handleValidate = useCallback(async () => {
    if (!docFile || !catalogCache) return
    setProcessing(true)
    setError('')
    setResults([])
    setExtractedVia(null)

    try {
      let items: PTLineItem[] = []
      const isPDF = docFile.name.toLowerCase().endsWith('.pdf')

      if (isPDF) {
        setVisionLoading(true)
        try {
          const ext = await extractReceiptItemsWithVision(docFile)
          if (ext.items.length > 0) {
            items = ext.items
            setExtractedVia('vision')
          }
        } catch {
          // fallthrough to text parser
        } finally {
          setVisionLoading(false)
        }
      }

      if (items.length === 0) {
        const ext = await extractReceiptItemsFromPT(docFile)
        items = ext.items
        if (items.length > 0) setExtractedVia('text')
      }

      if (items.length === 0) {
        setError('No se encontraron SKUs en el documento. Verifica que tenga columnas de SKU y Cantidad.')
        return
      }

      const res: CodigoResult[] = items
        .flatMap(item => {
          const sku = normalizeSKU(item.sku)
          if (!sku) return []
          return [{ sku, qty: item.qty, registered: catalogCache.has(sku) }]
        })

      res.sort((a, b) => Number(a.registered) - Number(b.registered))
      setResults(res)

      const missing = res.filter(r => !r.registered).length
      if (missing === 0) {
        toast.success(
          'Todos los códigos están registrados',
          `${res.length} SKU${res.length === 1 ? '' : 's'} verificados — listo para el Facilitador de Entradas.`,
        )
      } else {
        toast.error(
          `${missing} código${missing === 1 ? '' : 's'} sin registrar`,
          'Estos SKUs deben darse de alta en Extensiv antes de procesar la entrada.',
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al procesar')
    } finally {
      setProcessing(false)
      setVisionLoading(false)
    }
  }, [docFile, catalogCache, toast])

  const handleReset = () => {
    setDocFile(null)
    setResults([])
    setError('')
    setSearch('')
    setExtractedVia(null)
    if (docRef.current) docRef.current.value = ''
  }

  const stats = {
    total: results.length,
    registered: results.filter(r => r.registered).length,
    unregistered: results.filter(r => !r.registered).length,
  }

  const filtered = search
    ? results.filter(r => r.sku.toLowerCase().includes(search.toLowerCase()))
    : results

  const canValidate = !!docFile && catalogCache !== null && !processing && !fetchingInv && !!selectedCustomer

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 sm:p-6 sm:pb-10 touch-pan-y">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-[#1e3a5f]">Validador de Códigos</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Paso 1 — Verifica que todos los SKUs de la nota de entrada ya estén dados de alta en Extensiv.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Cliente */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
              <label className="text-xs font-semibold text-gray-600 block">Cliente en Extensiv</label>
              {apiConfigured ? (
                <>
                  <select
                    value={selectedCustomer}
                    onChange={e => handleCustomerChange(e.target.value ? Number(e.target.value) : '')}
                    className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                  >
                    <option value="">Seleccionar cliente...</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {fetchingInv && (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <Loader2 size={14} className="animate-spin" />
                      Obteniendo catálogo de Extensiv...
                    </div>
                  )}
                  {catalogCache && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <Database size={14} />
                      {catalogCount.toLocaleString()} SKUs en el catálogo de Extensiv
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                  <AlertTriangle size={14} />
                  <span>API de Extensiv no configurada.</span>
                </div>
              )}
            </div>

            {/* Documento */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <label className="text-xs font-semibold text-gray-600 mb-3 block">Nota de entrada (PDF o Excel)</label>
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  docFile
                    ? 'border-green-300 bg-green-50/50'
                    : 'border-gray-200 hover:border-[#1e3a5f]/30 hover:bg-gray-50'
                }`}
                onClick={() => docRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  if (e.dataTransfer.files[0]) { setDocFile(e.dataTransfer.files[0]); setResults([]) }
                }}
              >
                <input
                  ref={docRef}
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files?.[0]) { setDocFile(e.target.files[0]); setResults([]) }
                  }}
                />
                {docFile ? (
                  <div className="flex min-w-0 items-center justify-center gap-2">
                    <FileSpreadsheet size={18} className="text-green-600" />
                    <span className="min-w-0 truncate text-sm font-medium text-green-700">{docFile.name}</span>
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
                    <p className="text-xs text-gray-400">Arrastra o haz clic para subir el documento</p>
                    <p className="text-[10px] text-gray-300 mt-1">PDF, XLS, XLSX, CSV</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap gap-3 mb-6">
            <button
              onClick={handleValidate}
              disabled={!canValidate}
              className="h-10 px-6 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#16304d] transition-colors disabled:opacity-40"
            >
              {processing || visionLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {visionLoading ? 'Analizando con IA...' : 'Procesando...'}
                </>
              ) : (
                <><Search size={16} /> Validar códigos</>
              )}
            </button>
            {results.length > 0 && (
              <>
                {stats.unregistered > 0 && (
                  <button
                    onClick={() => downloadUnregistered(results, docFile?.name ?? 'nota_entrada')}
                    className="h-10 px-4 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 flex items-center gap-2 hover:bg-gray-50 transition-colors"
                  >
                    <Download size={16} /> Exportar SKUs faltantes
                  </button>
                )}
                <button
                  onClick={handleReset}
                  className="h-10 px-4 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 flex items-center gap-2 hover:bg-gray-50 transition-colors"
                >
                  <Trash2 size={16} /> Limpiar
                </button>
              </>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" /> {error}
            </div>
          )}

          {results.length > 0 && (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-3 gap-3 mb-4 sm:gap-4">
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                  <p className="text-2xl font-bold text-[#1e3a5f]" style={{ fontFamily: 'Nunito, sans-serif' }}>
                    {stats.total}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">SKUs totales</p>
                </div>
                <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4 text-center">
                  <p className="text-2xl font-bold text-green-600" style={{ fontFamily: 'Nunito, sans-serif' }}>
                    {stats.registered}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Registrados</p>
                </div>
                <div className="bg-white rounded-xl border border-red-100 shadow-sm p-4 text-center">
                  <p className="text-2xl font-bold text-red-600" style={{ fontFamily: 'Nunito, sans-serif' }}>
                    {stats.unregistered}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Por dar de alta</p>
                </div>
              </div>

              {stats.unregistered === 0 && (
                <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 flex items-center gap-2">
                  <CheckCircle2 size={16} className="shrink-0" />
                  Todos los códigos están registrados en Extensiv. Puedes proceder con el Facilitador de Entradas.
                </div>
              )}

              {/* Búsqueda */}
              <div className="mb-3">
                <div className="relative w-56">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar SKU..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="h-9 pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 w-full"
                  />
                </div>
              </div>

              {/* Tabla */}
              <div className="max-w-full overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
                <table className="min-w-[560px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">SKU (Documento)</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Cantidad</th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-600">Estado en Extensiv</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => (
                      <tr
                        key={r.sku}
                        className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800">{r.sku}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{r.qty.toLocaleString()}</td>
                        <td className="px-4 py-3 text-center">
                          {r.registered ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-50 text-green-700 text-[11px] font-semibold">
                              <CheckCircle2 size={12} /> Registrado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-600 text-[11px] font-semibold">
                              <XCircle size={12} /> Necesita darse de alta
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {extractedVia && (
                <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                  {extractedVia === 'vision'
                    ? <><Sparkles size={10} /> Extraído con IA (visión)</>
                    : 'Extraído con lector local'}
                </p>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
