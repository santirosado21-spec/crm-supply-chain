import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { History, Eye, Download, Ban, X } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../hooks/useToast'
import { useAuthContext } from '../../context/AuthContext'
import { useClients } from '../../hooks/useClients'
import { useProformasPeriodo, type ProformaPeriodoHeader } from '../../hooks/useProformasPeriodo'
import type { ProformaLineaPreview, ProformaPreview } from '../../lib/proformaBuilder'
import { generarProformaPDF } from '../../lib/proformaPdf'
import { generarProformaExcel, proformaFileName, type ProformaDocHeader } from '../../lib/proformaExcel'
import { ProformaLineasTable } from './components/ProformaLineasTable'

const fmt = (n: number, moneda: string) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${moneda}`
const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })

export function ProformaHistorialPage() {
  const toast = useToast()
  const { user } = useAuthContext()
  const { clients, getClients } = useClients()
  useEffect(() => { getClients() }, [getClients])

  const [clienteId, setClienteId] = useState('')
  const [estado, setEstado] = useState<'generada' | 'cancelada' | ''>('')
  const { proformas, loading, getLineas, cancel } = useProformasPeriodo({
    clienteId: clienteId || undefined,
    estado: estado || undefined,
  })

  const [detalle, setDetalle] = useState<{ header: ProformaPeriodoHeader; lineas: ProformaLineaPreview[] } | null>(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)

  const openDetalle = async (p: ProformaPeriodoHeader) => {
    setLoadingDetalle(true)
    try {
      const rows = await getLineas(p.id)
      const lineas: ProformaLineaPreview[] = rows.map(r => ({
        seccion: r.seccion,
        fuente: r.fuente,
        fuenteId: r.fuente_id,
        referencia: r.referencia,
        concepto: r.concepto,
        cantidad: r.cantidad ?? 0,
        precioUnitario: r.precio_unitario,
        monto: r.monto,
        moneda: r.moneda,
        incluida: r.incluida,
        motivoExclusion: null,
        extensivTransactionId: r.extensiv_transaction_id,
        extensivChargeLabel: r.extensiv_charge_label,
        rawCsvRow: null,
      }))
      setDetalle({ header: p, lineas })
    } catch (e) {
      toast.error('No se pudo cargar el detalle', e instanceof Error ? e.message : 'Error')
    } finally {
      setLoadingDetalle(false)
    }
  }

  const handleCancel = async (p: ProformaPeriodoHeader) => {
    const motivo = prompt('Motivo de cancelación:')
    if (!motivo?.trim()) return
    try {
      await cancel(p.id, motivo.trim(), user?.name ?? user?.email ?? null)
      toast.success('Proforma cancelada', 'Los viajes/guías incluidos quedaron liberados para re-facturar.')
      setDetalle(null)
    } catch (e) {
      toast.error('No se pudo cancelar', e instanceof Error ? e.message : 'Error')
    }
  }

  /** Reconstruye header + preview del documento a partir de lo guardado en el historial. */
  const detalleParaDoc = (): { header: ProformaDocHeader; preview: ProformaPreview } | null => {
    if (!detalle) return null
    const clienteRow = clients.find(c => c.id === detalle.header.cliente_id)
    return {
      header: {
        referencia:         detalle.header.referencia,
        clienteNombre:      detalle.header.cliente_nombre,
        clienteRazonSocial: clienteRow?.razon_social ?? null,
        periodoDesde:       detalle.header.periodo_desde,
        periodoHasta:       detalle.header.periodo_hasta,
        creadoPor:          detalle.header.creado_por,
      },
      preview: {
        lineas:             detalle.lineas,
        subtotalWms:        detalle.header.subtotal_wms,
        subtotalFlete:      detalle.header.subtotal_flete,
        subtotalPaqueteria: detalle.header.subtotal_paqueteria,
        subtotal:           detalle.header.subtotal,
        ivaPct:             detalle.header.iva_pct,
        ivaMonto:           detalle.header.iva_monto,
        retencionPct:       detalle.header.retencion_pct ?? 0,
        retencionMonto:     detalle.header.retencion_monto ?? 0,
        total:              detalle.header.total,
        moneda:             detalle.header.moneda,
      },
    }
  }

  const descargarBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportPDF = async () => {
    const doc = detalleParaDoc()
    if (!doc) return
    const blob = await generarProformaPDF(doc.header, doc.preview)
    descargarBlob(blob, proformaFileName(doc.header, 'pdf'))
  }

  const handleExportExcel = async () => {
    const doc = detalleParaDoc()
    if (!doc) return
    const blob = await generarProformaExcel(doc.header, doc.preview)
    descargarBlob(blob, proformaFileName(doc.header, 'xlsx'))
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
                <History size={20} /> Historial de proformas
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">Proformas guardadas por cliente y periodo</p>
            </div>
            <Link
              to="/proforma"
              className="h-10 px-3 rounded-xl text-sm font-bold text-white inline-flex items-center gap-1.5 shadow-sm"
              style={{ background: 'var(--brand-navy)' }}
            >
              Generar nueva
            </Link>
          </div>

          {/* Filtros */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select value={clienteId} onChange={e => setClienteId(e.target.value)} className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:border-[#1e3a5f] outline-none">
              <option value="">Todos los clientes</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={estado} onChange={e => setEstado(e.target.value as 'generada' | 'cancelada' | '')} className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:border-[#1e3a5f] outline-none">
              <option value="">Todos los estados</option>
              <option value="generada">Generada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>

          {/* Lista */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><Spinner size={20} /> Cargando…</div>
          ) : proformas.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-12 text-center text-sm text-gray-400">
              Sin proformas generadas todavía.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase">
                    <th className="px-4 py-3">Folio</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Periodo</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {proformas.map(p => (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-blue-50/30">
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-[#1e3a5f]">{p.referencia}</td>
                      <td className="px-4 py-2.5 text-gray-700">{p.cliente_nombre}</td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(p.periodo_desde)} — {fmtDate(p.periodo_hasta)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmt(p.total, p.moneda)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${p.estado === 'cancelada' ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-700'}`}>
                          {p.estado === 'cancelada' ? 'Cancelada' : 'Generada'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openDetalle(p)} className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-[#1e3a5f]" title="Ver detalle">
                            <Eye size={14} />
                          </button>
                          {p.estado !== 'cancelada' && (
                            <button onClick={() => handleCancel(p)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Cancelar">
                              <Ban size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* Detalle */}
      {(detalle || loadingDetalle) && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={() => setDetalle(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between z-10">
              <h2 className="text-base font-bold text-[#1e3a5f]">{detalle?.header.referencia ?? 'Cargando…'}</h2>
              <button onClick={() => setDetalle(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {loadingDetalle || !detalle ? (
                <div className="flex items-center justify-center py-10 text-gray-400 gap-2"><Spinner size={18} /> Cargando líneas…</div>
              ) : (
                <>
                  <ProformaLineasTable lineas={detalle.lineas} moneda={detalle.header.moneda} />
                  <div className="flex items-center justify-between text-sm bg-gray-50 rounded-xl p-3">
                    <div className="space-x-4">
                      <span>Subtotal: <b>{fmt(detalle.header.subtotal, detalle.header.moneda)}</b></span>
                      <span>IVA ({detalle.header.iva_pct}%): <b>{fmt(detalle.header.iva_monto, detalle.header.moneda)}</b></span>
                      {(detalle.header.retencion_monto ?? 0) > 0 && (
                        <span title={`Retención de IVA del 4% por autotransporte de carga — sobre el subtotal de flete propio (${fmt(detalle.header.subtotal_flete, detalle.header.moneda)})`}>
                          Retención 4% flete: <b className="text-amber-700">−{fmt(detalle.header.retencion_monto, detalle.header.moneda)}</b>
                        </span>
                      )}
                      <span>Total: <b className="text-[#c8373c]">{fmt(detalle.header.total, detalle.header.moneda)}</b></span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleExportPDF} className="h-9 px-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 inline-flex items-center gap-1.5 hover:bg-gray-50">
                        <Download size={14} /> PDF
                      </button>
                      <button onClick={handleExportExcel} className="h-9 px-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 inline-flex items-center gap-1.5 hover:bg-gray-50">
                        <Download size={14} /> Excel
                      </button>
                    </div>
                  </div>
                  {detalle.header.estado === 'cancelada' && (
                    <p className="text-xs text-gray-400">
                      Cancelada {detalle.header.cancelada_at ? `el ${fmtDate(detalle.header.cancelada_at.slice(0, 10))}` : ''} por {detalle.header.cancelada_por ?? '—'}
                      {detalle.header.cancelada_motivo ? ` · ${detalle.header.cancelada_motivo}` : ''}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
