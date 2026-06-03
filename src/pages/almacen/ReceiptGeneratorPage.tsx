import { useCallback, useRef, useState } from 'react'
import {
  Upload, FileSpreadsheet, Download, Trash2, XCircle, AlertTriangle,
  Loader2, FileInput, Plus, Sparkles,
} from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { extractReceiptItemsFromPT } from '../../lib/ptParser'
import { extractReceiptItemsWithVision } from '../../lib/visionExtract'
import { generateReceiptExcel } from './receiptExport'

interface ReceiptItem {
  sku: string
  qty: number
  serialNumber: string | null
}

export function ReceiptGeneratorPage() {
  const [ptFile, setPtFile] = useState<File | null>(null)
  const [ref, setRef] = useState('')
  const [items, setItems] = useState<ReceiptItem[]>([])
  const [processing, setProcessing] = useState(false)
  const [visionLoading, setVisionLoading] = useState(false)
  const [extractedVia, setExtractedVia] = useState<'vision' | 'text' | null>(null)
  const [error, setError] = useState('')

  const ptRef = useRef<HTMLInputElement>(null)

  const handleExtract = useCallback(async (file: File) => {
    setError('')
    setItems([])
    setRef('')
    setExtractedVia(null)
    const isPDF = file.name.toLowerCase().endsWith('.pdf')

    try {
      // PDFs → visión primero (también para escaneados / imagen).
      if (isPDF) {
        setVisionLoading(true)
        try {
          const ext = await extractReceiptItemsWithVision(file)
          if (ext.items.length > 0) {
            setRef(ext.ref ?? '')
            setItems(ext.items.map(it => ({
              sku: it.sku,
              qty: it.qty,
              serialNumber: it.serialNumber,
            })))
            setExtractedVia('vision')
            return
          }
        } catch (visionErr) {
          console.warn('Extracción con IA falló, usando lector local:', visionErr)
        } finally {
          setVisionLoading(false)
        }
      }

      // Excel/CSV, o fallback si la visión falló / no encontró nada.
      setProcessing(true)
      const { ref: detectedRef, items: extracted } = await extractReceiptItemsFromPT(file)
      setRef(detectedRef ?? '')
      setItems(extracted.map(it => ({
        sku: it.sku,
        qty: it.qty,
        serialNumber: it.serialNumber,
      })))
      setExtractedVia(extracted.length > 0 ? 'text' : null)
      if (extracted.length === 0) {
        setError(isPDF
          ? 'No se encontraron items en el PT, ni con IA ni con el lector local. Verifica el archivo.'
          : 'No se encontraron items en el PT. Verifica que tenga columnas SKU y Cantidad identificables.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al procesar PT')
    } finally {
      setProcessing(false)
      setVisionLoading(false)
    }
  }, [])

  const handleVisionReextract = useCallback(async () => {
    if (!ptFile) return
    setVisionLoading(true)
    setError('')
    try {
      const ext = await extractReceiptItemsWithVision(ptFile)
      setRef(ext.ref ?? '')
      setItems(ext.items.map(it => ({
        sku: it.sku,
        qty: it.qty,
        serialNumber: it.serialNumber,
      })))
      setExtractedVia('vision')
      if (ext.items.length === 0) setError('La IA no encontró items en el PT.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error en la extracción con IA')
    } finally {
      setVisionLoading(false)
    }
  }, [ptFile])

  const handleFileChange = (file: File) => {
    setPtFile(file)
    handleExtract(file)
  }

  const handleReset = () => {
    setPtFile(null)
    setRef('')
    setItems([])
    setError('')
    setExtractedVia(null)
    if (ptRef.current) ptRef.current.value = ''
  }

  const isPdfFile = !!ptFile && ptFile.name.toLowerCase().endsWith('.pdf')

  const updateField = (idx: number, field: keyof ReceiptItem, value: string | number | null) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  const deleteItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const addEmptyItem = () => {
    setItems(prev => [...prev, { sku: '', qty: 1, serialNumber: null }])
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

  const canExport = !!ref.trim() && items.length > 0
  const blockReason =
    items.length === 0 ? 'Sube un PT primero.' :
    !ref.trim()        ? 'Falta el Ref#.' :
    null

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-6">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-[#1e3a5f]">Facilitador de entradas</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Sube un PT o factura, extrae los SKUs con IA y genera el archivo Receipt_Import.xlsx.
            </p>
          </div>

          {/* Upload */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
            <label className="text-xs font-semibold text-gray-600 mb-3 block">Pick Ticket o factura (PDF o Excel)</label>
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
                  <p className="text-xs text-gray-400">Arrastra o haz clic para subir el documento</p>
                  <p className="text-[10px] text-gray-300 mt-1">PDF, XLS, XLSX, CSV</p>
                </>
              )}
            </div>
          </div>

          {/* Loading — visión IA */}
          {visionLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-[#1e3a5f]">
              <Sparkles size={16} className="animate-pulse" />
              Analizando con IA (visión)… esto puede tardar unos segundos.
            </div>
          )}

          {/* Loading — lector local */}
          {processing && !visionLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-blue-600">
              <Loader2 size={16} className="animate-spin" /> Procesando documento...
            </div>
          )}

          {/* Error */}
          {error && !processing && !visionLoading && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" /> {error}
            </div>
          )}

          {/* Datos extraídos */}
          {!processing && !visionLoading && ptFile && items.length > 0 && (
            <>
              {/* Ref input */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
                <label className="text-xs font-semibold text-gray-600 mb-2 block">
                  Ref # <span className="text-red-500">*</span>
                  <span className="text-[10px] font-normal text-gray-400 ml-2">
                    (detectado automáticamente — puedes corregirlo o escribirlo manualmente)
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
                    <AlertTriangle size={10} /> Escribe el Ref# para poder exportar.
                  </p>
                )}
              </div>

              {/* Items table */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-4">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-gray-600">
                      Items extraídos ({items.length})
                    </p>
                    {extractedVia === 'vision' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#1e3a5f] bg-[#1e3a5f]/10 rounded-full px-2 py-0.5">
                        <Sparkles size={10} /> IA (visión)
                      </span>
                    )}
                    {extractedVia === 'text' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                        Lector local
                      </span>
                    )}
                  </div>
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
                      <th className="text-left px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">SKU</th>
                      <th className="text-right px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider w-24">Cantidad</th>
                      <th className="text-left px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Serial #</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/40">
                        {/* SKU */}
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={item.sku}
                            onChange={e => updateField(idx, 'sku', e.target.value)}
                            className="w-full h-8 px-2 rounded border border-transparent hover:border-gray-200 focus:border-[#1e3a5f] focus:outline-none font-mono text-xs font-semibold text-gray-800"
                          />
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
                    ))}
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
                {isPdfFile && (
                  <button
                    onClick={handleVisionReextract}
                    disabled={visionLoading}
                    className="h-10 px-4 rounded-lg border border-[#1e3a5f]/30 bg-white text-sm font-medium text-[#1e3a5f] flex items-center gap-2 hover:bg-[#1e3a5f]/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Sparkles size={16} /> Reintentar con IA
                  </button>
                )}
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
                El archivo se exporta listo para importar a Extensiv. Los SKUs se respetan tal cual se extrajeron — puedes corregir manualmente cualquier línea antes de exportar.
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
