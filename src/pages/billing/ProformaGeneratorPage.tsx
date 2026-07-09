// Módulo de Proforma consolidada: WMS (CSV Extensiv Billing Manager) + Flete
// propio (viajes) + Paquetería (guias_paqueteria) para un cliente + periodo.
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Sparkles, Download, Save, History } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../hooks/useToast'
import { useAuthContext } from '../../context/AuthContext'
import { useClients } from '../../hooks/useClients'
import { useProformasPeriodo } from '../../hooks/useProformasPeriodo'
import { NotaDropzone } from '../almacen/entradas/components/NotaDropzone'
import { readExtensivBillingWorkbook, parseExtensivBillingCSV, type ExtensivBillingRow } from '../../lib/extensivBillingParser'
import {
  assembleProformaData, computeProformaTotals,
  type ProformaPreview, type ProformaLineaPreview, type Moneda,
} from '../../lib/proformaBuilder'
import { generarProformaPDF } from '../../lib/proformaPdf'
import { ProformaLineasTable } from './components/ProformaLineasTable'

function defaultMonthRange() {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { desde: iso(first), hasta: iso(now) }
}

const inputCls = 'w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 bg-white'
const labelCls = 'text-xs font-semibold text-gray-500 mb-1 block'

export function ProformaGeneratorPage() {
  const toast = useToast()
  const { user } = useAuthContext()
  const { clients, getClients } = useClients()
  useEffect(() => { getClients() }, [getClients])
  const { save } = useProformasPeriodo()

  const [clienteId, setClienteId] = useState('')
  const [periodo, setPeriodo] = useState(defaultMonthRange)
  const [csvFileName, setCsvFileName] = useState('')
  const [csvRows, setCsvRows] = useState<ExtensivBillingRow[]>([])
  const [moneda, setMoneda] = useState<Moneda>('MXN')
  const [ivaPct, setIvaPct] = useState('16')
  const [tipoCambio, setTipoCambio] = useState('')
  const [notas, setNotas] = useState('')
  const [preview, setPreview] = useState<ProformaPreview | null>(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedReferencia, setSavedReferencia] = useState<string | null>(null)

  const cliente = clients.find(c => c.id === clienteId)

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer()
      const wb = readExtensivBillingWorkbook(buf)
      const rows = parseExtensivBillingCSV(wb)
      setCsvRows(rows)
      setCsvFileName(file.name)
      toast.success('CSV leído', `${rows.length} filas encontradas en el export`)
    } catch (e) {
      toast.error('No se pudo leer el CSV', e instanceof Error ? e.message : 'Error')
    }
  }

  const handleClearFile = () => {
    setCsvFileName('')
    setCsvRows([])
  }

  const handleGenerate = async () => {
    if (!cliente) { toast.error('Selecciona un cliente primero'); return }
    setGenerating(true)
    setSavedReferencia(null)
    try {
      const result = await assembleProformaData({
        clienteId:     cliente.id,
        clienteNombre: cliente.name,
        periodoDesde:  periodo.desde,
        periodoHasta:  periodo.hasta,
        csvRows,
        moneda,
        ivaPct: Number(ivaPct) || 0,
      })
      setPreview(result)
      if (result.lineas.length === 0) {
        toast.info('Sin movimientos', 'No hay cargos WMS, viajes ni guías para este cliente en el periodo elegido.')
      }
    } catch (e) {
      toast.error('No se pudo armar la proforma', e instanceof Error ? e.message : 'Error')
    } finally {
      setGenerating(false)
    }
  }

  const handleToggleLinea = (linea: ProformaLineaPreview) => {
    if (!preview) return
    const nuevas = preview.lineas.map(l => (l === linea ? { ...l, incluida: !l.incluida } : l))
    setPreview(computeProformaTotals(nuevas, preview.ivaPct, preview.moneda))
  }

  const handleSave = async () => {
    if (!preview || !cliente) return
    setSaving(true)
    try {
      const referencia = await save({
        clienteId:      cliente.id,
        clienteCodigo:  cliente.codigo,
        clienteNombre:  cliente.name,
        periodoDesde:   periodo.desde,
        periodoHasta:   periodo.hasta,
        tipoCambio:     moneda === 'USD' && tipoCambio ? Number(tipoCambio) : null,
        csvFilename:    csvFileName || null,
        notas,
        creadoPor:      user?.name ?? user?.email ?? null,
        preview,
      })
      setSavedReferencia(referencia)
      toast.success('Proforma guardada', referencia)
    } catch (e) {
      toast.error('No se pudo guardar', e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const handleExportPDF = async () => {
    if (!preview || !cliente) return
    const blob = await generarProformaPDF({
      referencia:    savedReferencia ?? 'BORRADOR',
      clienteNombre: cliente.name,
      periodoDesde:  periodo.desde,
      periodoHasta:  periodo.hasta,
      creadoPor:     user?.name ?? user?.email ?? null,
    }, preview)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `proforma_${savedReferencia ?? 'borrador'}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportExcel = () => {
    if (!preview) return
    const header = ['Sección', 'Fuente', 'Concepto', 'Referencia', 'Cantidad', 'Precio unitario', 'Monto', 'Moneda', 'Incluida']
    const rows = preview.lineas.map(l => [
      l.seccion, l.fuente, l.concepto, l.referencia ?? '', l.cantidad, l.precioUnitario ?? '', l.monto, l.moneda, l.incluida ? 'Sí' : 'No',
    ])
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 32 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Proforma')
    XLSX.writeFile(wb, `proforma_${savedReferencia ?? 'borrador'}.xlsx`)
  }

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 sm:p-6 sm:pb-10 touch-pan-y">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
            <div>
              <h1 className="text-xl font-bold text-[#1e3a5f] inline-flex items-center gap-2">
                <FileText size={20} /> Generar Proforma
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Consolida cargos de almacén (CSV Extensiv), flete propio y paquetería por cliente y periodo.
              </p>
            </div>
            <Link
              to="/proforma/historial"
              className="h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 inline-flex items-center gap-1.5 hover:bg-gray-50"
            >
              <History size={14} /> Historial
            </Link>
          </div>

          {/* Paso 1: Cliente + periodo + moneda/IVA */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className={labelCls}>Cliente *</label>
              <select value={clienteId} onChange={e => { setClienteId(e.target.value); setPreview(null) }} className={inputCls}>
                <option value="">— Selecciona cliente —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} · ` : ''}{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Periodo desde</label>
              <input type="date" value={periodo.desde} onChange={e => setPeriodo(p => ({ ...p, desde: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Periodo hasta</label>
              <input type="date" value={periodo.hasta} onChange={e => setPeriodo(p => ({ ...p, hasta: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Moneda</label>
              <select value={moneda} onChange={e => setMoneda(e.target.value as Moneda)} className={inputCls}>
                <option value="MXN">MXN</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>IVA %</label>
              <input type="number" min={0} max={100} step="0.01" value={ivaPct} onChange={e => setIvaPct(e.target.value)} className={inputCls} />
            </div>
            {moneda === 'USD' && (
              <div>
                <label className={labelCls}>Tipo de cambio (MXN/USD)</label>
                <input type="number" min={0} step="0.01" value={tipoCambio} onChange={e => setTipoCambio(e.target.value)} placeholder="17.50" className={inputCls} />
              </div>
            )}
          </div>

          {/* Paso 2: CSV de Extensiv */}
          <div className="mb-4">
            <NotaDropzone
              fileName={csvFileName}
              onFile={handleFile}
              onClear={handleClearFile}
              label="CSV del Billing Manager de Extensiv (opcional si solo facturas flete/paquetería)"
              hint="Arrastra o haz clic para subir el export CSV — trae todos los clientes, se filtra automáticamente al elegido arriba"
            />
          </div>

          {/* Paso 3: Generar preview */}
          <div className="mb-4">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!clienteId || generating}
              className="h-10 px-4 rounded-xl text-sm font-bold text-white inline-flex items-center gap-2 shadow-sm disabled:opacity-40"
              style={{ background: 'var(--brand-navy)' }}
            >
              {generating ? <Spinner size={14} /> : <Sparkles size={16} />} Generar preview
            </button>
          </div>

          {/* Preview */}
          {preview && (
            <>
              <ProformaLineasTable
                lineas={preview.lineas}
                moneda={preview.moneda}
                editable
                onToggleLinea={handleToggleLinea}
              />

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="grid grid-cols-2 sm:flex sm:items-center gap-x-6 gap-y-1 text-sm">
                  <div><span className="text-gray-400">Subtotal:</span> <span className="font-semibold">{`$${preview.subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${preview.moneda}`}</span></div>
                  <div><span className="text-gray-400">IVA ({preview.ivaPct}%):</span> <span className="font-semibold">{`$${preview.ivaMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${preview.moneda}`}</span></div>
                  <div><span className="text-gray-400">Total:</span> <span className="font-bold text-[#c8373c]">{`$${preview.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${preview.moneda}`}</span></div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    value={notas}
                    onChange={e => setNotas(e.target.value)}
                    placeholder="Notas (opcional)"
                    className="h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e3a5f]"
                  />
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !!savedReferencia}
                    className="h-9 px-4 rounded-xl text-sm font-bold text-white inline-flex items-center gap-1.5 shadow-sm disabled:opacity-40"
                    style={{ background: 'var(--brand-navy)' }}
                  >
                    {saving ? <Spinner size={14} /> : <Save size={14} />} {savedReferencia ? `Guardada (${savedReferencia})` : 'Guardar proforma'}
                  </button>
                  {savedReferencia && (
                    <>
                      <button type="button" onClick={handleExportPDF}
                        className="h-9 px-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 inline-flex items-center gap-1.5 hover:bg-gray-50">
                        <Download size={14} /> PDF
                      </button>
                      <button type="button" onClick={handleExportExcel}
                        className="h-9 px-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 inline-flex items-center gap-1.5 hover:bg-gray-50">
                        <Download size={14} /> Excel
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
