// Resucitado desde el commit 534a31f (módulo SAC · Guías de paquetería,
// eliminado de main el 2026-05-22 junto con Proformas/Seko Billing). Ahora
// vuelve porque el módulo de Proforma consolidada necesita estas guías para
// armar la sección "Paquetería" — ver src/lib/proformaBuilder.ts.
//
// Cambios vs. el original:
// - Paqueteria ahora incluye fedex/dhl/castores (el schema ya lo soportaba).
// - Usa useClients (no useClientCatalog) porque ExtensivOperationPicker
//   cambió de firma: ya no acepta `defaultCustomer`, ahora posee su propio
//   selector de cliente (`clients`/`clientId`/`onClientChange`) — así que el
//   <select> de cliente separado que tenía el form original se elimina.
// - Badge "Facturada" + bloqueo de borrado cuando facturado_en_proforma_id
//   ya está seteado (la guía quedó incluida en una proforma guardada).
import { useEffect, useMemo, useState } from 'react'
import {
  Package, Plus, Search, X, Download, Trash2, AlertCircle, DollarSign, TrendingUp, Lock, FileText,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../hooks/useToast'
import { useAuthContext } from '../../context/AuthContext'
import { useClients } from '../../hooks/useClients'
import { useGuiasPaqueteria } from '../../hooks/useGuiasPaqueteria'
import { ExtensivOperationPicker } from '../../components/features/ExtensivOperationPicker'
import type { ExtensivPickResult } from '../../lib/extensiv'
import type { Client } from '../../types'
import { NotaDropzone } from '../almacen/entradas/components/NotaDropzone'
import { extractGuiaDataFromPDF, type GuiaPdfExtraction } from '../../lib/guiaPdfParser'
import {
  PAQUETERIA_LABEL, PAQUETERIA_COLOR,
  type Paqueteria, type GuiaOrigen, type GuiaFilters, type GuiaPaqueteria, type CreateGuiaData,
} from '../../types/guias'

const PAQUETERIAS: Paqueteria[] = ['estafeta', 'ups', 'fedex', 'dhl', 'castores']

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })

function defaultMonthRange() {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { fechaDesde: iso(first), fechaHasta: iso(now) }
}

export function GuiasPaqueteriaPage() {
  const toast = useToast()
  const { user } = useAuthContext()
  const { clients, getClients } = useClients()
  useEffect(() => { getClients() }, [getClients])

  const [filters, setFilters] = useState<GuiaFilters>(() => ({ ...defaultMonthRange() }))
  const { guias, loading, error, kpis, create, remove } = useGuiasPaqueteria(filters)

  const [showForm, setShowForm] = useState(false)

  const clienteById = useMemo(() => {
    const m = new Map<string, Client>()
    for (const c of clients) m.set(c.id, c)
    return m
  }, [clients])

  const handleDelete = async (g: GuiaPaqueteria) => {
    if (g.facturado_en_proforma_id) {
      toast.error('No se puede eliminar', 'Esta guía ya quedó incluida en una proforma guardada.')
      return
    }
    if (!confirm(`Eliminar guía ${g.tracking_number}?`)) return
    try {
      await remove(g.id)
      toast.success('Guía eliminada')
    } catch (e) {
      toast.error('No se pudo eliminar', e instanceof Error ? e.message : 'Error')
    }
  }

  const handleExportExcel = () => {
    if (guias.length === 0) {
      toast.error('No hay guías para exportar')
      return
    }
    const header = ['Fecha', 'Paquetería', 'Tracking', 'Cliente', 'Costo', 'Precio', 'Margen', 'Origen', 'Referencia', 'Facturada', 'Notas']
    const rows = guias.map(g => [
      g.fecha,
      PAQUETERIA_LABEL[g.paqueteria],
      g.tracking_number,
      clienteById.get(g.cliente_id)?.name ?? g.cliente_codigo ?? '',
      Number(g.costo),
      Number(g.precio),
      Number(g.margen),
      g.origen === 'extensiv' ? 'Extensiv' : 'Manual',
      g.origen === 'extensiv' ? `${g.extensiv_transaction_type}:${g.extensiv_transaction_id}` : (g.manual_reference ?? ''),
      g.facturado_en_proforma_id ? 'Sí' : 'No',
      g.notas ?? '',
    ])
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 28 }, { wch: 10 }, { wch: 28 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Guías paquetería')
    XLSX.writeFile(wb, `guias_paqueteria_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast.success('Excel descargado')
  }

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 sm:p-6 sm:pb-10 touch-pan-y">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
            <div>
              <h1 className="text-xl font-bold text-[#1e3a5f] inline-flex items-center gap-2">
                <Package size={20} /> Guías de paquetería
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                SAC · Captura de costo y precio por guía · Liga a Extensiv o referencia manual (Seko 365 / PT)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportExcel}
                className="h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 inline-flex items-center gap-1.5 hover:bg-gray-50"
              >
                <Download size={14} /> Excel
              </button>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="h-10 px-4 rounded-xl text-sm font-bold text-white inline-flex items-center gap-2 shadow-sm"
                style={{ background: 'var(--brand-navy)' }}
              >
                <Plus size={16} /> Nueva guía
              </button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <KPI title="Guías" value={String(kpis.numGuias)} color="#1e3a5f" icon={<Package size={14} />} />
            <KPI title="Costo total" value={fmtMXN(kpis.totalCosto)} color="#dc3545" icon={<DollarSign size={14} />} />
            <KPI title="Precio total" value={fmtMXN(kpis.totalPrecio)} color="#28a745" icon={<DollarSign size={14} />} />
            <KPI title="Margen" value={fmtMXN(kpis.totalMargen)} color="#7c3aed" icon={<TrendingUp size={14} />} />
          </div>

          {/* Filtros */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 mb-4 grid grid-cols-1 sm:grid-cols-5 gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Tracking, ref, código…"
                value={filters.search ?? ''}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:border-[#1e3a5f] outline-none"
              />
            </div>
            <select
              value={filters.clienteId ?? ''}
              onChange={e => setFilters(f => ({ ...f, clienteId: e.target.value || undefined }))}
              className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:border-[#1e3a5f] outline-none"
            >
              <option value="">Todos los clientes</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select
              value={filters.paqueteria ?? ''}
              onChange={e => setFilters(f => ({ ...f, paqueteria: (e.target.value || undefined) as Paqueteria | undefined }))}
              className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:border-[#1e3a5f] outline-none"
            >
              <option value="">Todas las paqueterías</option>
              {PAQUETERIAS.map(p => <option key={p} value={p}>{PAQUETERIA_LABEL[p]}</option>)}
            </select>
            <select
              value={filters.origen ?? ''}
              onChange={e => setFilters(f => ({ ...f, origen: (e.target.value || undefined) as GuiaOrigen | undefined }))}
              className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:border-[#1e3a5f] outline-none"
            >
              <option value="">Todos los orígenes</option>
              <option value="extensiv">Extensiv</option>
              <option value="manual">Manual (Seko / PT)</option>
            </select>
            <div className="flex gap-1.5 items-center">
              <input
                type="date"
                value={filters.fechaDesde ?? ''}
                onChange={e => setFilters(f => ({ ...f, fechaDesde: e.target.value || undefined }))}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none"
              />
              <span className="text-gray-400 text-xs">→</span>
              <input
                type="date"
                value={filters.fechaHasta ?? ''}
                onChange={e => setFilters(f => ({ ...f, fechaHasta: e.target.value || undefined }))}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4 inline-flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {/* Lista */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
              <Spinner size={20} /> Cargando guías…
            </div>
          ) : guias.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-12 text-center">
              <p className="text-sm text-gray-400">Sin guías en el período. Crea una con el botón "Nueva guía".</p>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-2 lg:hidden">
                {guias.map(g => (
                  <GuiaCard key={g.id} guia={g} clienteNombre={clienteById.get(g.cliente_id)?.name} onDelete={() => handleDelete(g)} />
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase">
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Paquetería</th>
                      <th className="px-4 py-3">Tracking</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3 text-right">Costo</th>
                      <th className="px-4 py-3 text-right">Precio</th>
                      <th className="px-4 py-3 text-right">Margen</th>
                      <th className="px-4 py-3">Vínculo</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {guias.map(g => (
                      <tr key={g.id} className="border-b border-gray-100 hover:bg-blue-50/30">
                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(g.fecha)}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold text-white"
                            style={{ background: PAQUETERIA_COLOR[g.paqueteria] }}
                          >
                            {PAQUETERIA_LABEL[g.paqueteria]}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[12px] text-gray-700">{g.tracking_number}</td>
                        <td className="px-4 py-2.5 text-gray-700">{clienteById.get(g.cliente_id)?.name ?? g.cliente_codigo ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-rose-600">{fmtMXN(Number(g.costo))}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 font-semibold">{fmtMXN(Number(g.precio))}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-bold" style={{ color: Number(g.margen) >= 0 ? '#7c3aed' : '#dc3545' }}>
                          {fmtMXN(Number(g.margen))}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {g.origen === 'extensiv' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-semibold">
                                Ext · {g.extensiv_transaction_type}#{(g.extensiv_transaction_id ?? '').slice(-6)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[11px] font-semibold">
                                Manual · {g.manual_reference}
                              </span>
                            )}
                            {g.facturado_en_proforma_id && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-500 text-[11px] font-semibold">
                                <Lock size={10} /> Facturada
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDelete(g)}
                            disabled={!!g.facturado_en_proforma_id}
                            className="text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-gray-400"
                            aria-label="Eliminar guía"
                            title={g.facturado_en_proforma_id ? 'Ya facturada — no se puede eliminar' : 'Eliminar guía'}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Modal form */}
      {showForm && (
        <GuiaForm
          onClose={() => setShowForm(false)}
          onSubmit={async (data) => {
            try {
              await create(data)
              toast.success('Guía registrada', `${data.tracking_number} · ${fmtMXN(data.precio - data.costo)} de margen`)
              setShowForm(false)
            } catch (e) {
              toast.error('No se pudo registrar', e instanceof Error ? e.message : 'Error')
            }
          }}
          clients={clients}
          creadoPor={user?.name ?? user?.email ?? null}
        />
      )}
    </div>
  )
}

function KPI({ title, value, color, icon }: { title: string; value: string; color: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 inline-flex items-center gap-1">
        {icon} {title}
      </p>
      <p className="kpi-number text-xl mt-1 truncate" style={{ color }}>{value}</p>
    </div>
  )
}

function GuiaCard({ guia, clienteNombre, onDelete }: { guia: GuiaPaqueteria; clienteNombre?: string; onDelete: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
              style={{ background: PAQUETERIA_COLOR[guia.paqueteria] }}
            >
              {PAQUETERIA_LABEL[guia.paqueteria]}
            </span>
            <span className="text-[10px] text-gray-400">{fmtDate(guia.fecha)}</span>
            {guia.facturado_en_proforma_id && (
              <span className="inline-flex items-center gap-1 text-[10px] text-gray-400"><Lock size={9} /> Facturada</span>
            )}
          </div>
          <p className="text-xs font-mono font-semibold text-gray-800 truncate">{guia.tracking_number}</p>
          <p className="text-[11px] text-gray-500 truncate">{clienteNombre ?? guia.cliente_codigo ?? '—'}</p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={!!guia.facturado_en_proforma_id}
          className="text-gray-300 hover:text-red-600 shrink-0 disabled:opacity-30"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
        <div><p className="text-gray-400">Costo</p><p className="font-bold text-rose-600 tabular-nums">{fmtMXN(Number(guia.costo))}</p></div>
        <div><p className="text-gray-400">Precio</p><p className="font-bold text-emerald-600 tabular-nums">{fmtMXN(Number(guia.precio))}</p></div>
        <div><p className="text-gray-400">Margen</p><p className="font-bold tabular-nums" style={{ color: Number(guia.margen) >= 0 ? '#7c3aed' : '#dc3545' }}>{fmtMXN(Number(guia.margen))}</p></div>
      </div>
      <p className="text-[10px] text-gray-400 mt-2 truncate">
        {guia.origen === 'extensiv'
          ? `Ext · ${guia.extensiv_transaction_type} #${guia.extensiv_transaction_id}`
          : `Manual · ${guia.manual_reference}`}
      </p>
    </div>
  )
}

/* ─── Modal form ───────────────────────────────────────────────────────── */
interface GuiaFormProps {
  onClose:    () => void
  onSubmit:   (data: CreateGuiaData) => Promise<void>
  clients:    Client[]
  creadoPor:  string | null
}

function GuiaForm({ onClose, onSubmit, clients, creadoPor }: GuiaFormProps) {
  const toast = useToast()
  const [paqueteria, setPaqueteria] = useState<Paqueteria>('estafeta')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [costo, setCosto] = useState('')
  const [precio, setPrecio] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [pickResult, setPickResult] = useState<ExtensivPickResult | null>(null)
  const [notas, setNotas] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Autocompletado best-effort desde el PDF de la guía — ver src/lib/guiaPdfParser.ts.
  // Costo/precio/cliente NUNCA se autocompletan (no vienen impresos en la guía).
  const [pdfFileName, setPdfFileName] = useState('')
  const [pdfExtraction, setPdfExtraction] = useState<GuiaPdfExtraction | null>(null)
  const [pdfParsing, setPdfParsing] = useState(false)
  const [autoFilled, setAutoFilled] = useState<Set<'paqueteria' | 'trackingNumber' | 'fecha'>>(new Set())
  // "Tocado a mano" — paqueteria y fecha ya arrancan con un valor por default,
  // así que no basta con checar "vacío" para saber si el PDF puede autocompletarlos.
  const [paqueteriaTouched, setPaqueteriaTouched] = useState(false)
  const [fechaTouched, setFechaTouched] = useState(false)

  const cliente = clients.find(c => c.id === clienteId)

  async function handlePdfFile(file: File) {
    setPdfFileName(file.name)
    setPdfParsing(true)
    try {
      const extraction = await extractGuiaDataFromPDF(file)
      setPdfExtraction(extraction)
      const filled = new Set<'paqueteria' | 'trackingNumber' | 'fecha'>()
      if (extraction.paqueteria && !paqueteriaTouched) { setPaqueteria(extraction.paqueteria); filled.add('paqueteria') }
      if (extraction.trackingNumber && !trackingNumber.trim()) { setTrackingNumber(extraction.trackingNumber); filled.add('trackingNumber') }
      if (extraction.fecha && !fechaTouched) { setFecha(extraction.fecha); filled.add('fecha') }
      setAutoFilled(filled)
      if (filled.size === 0) {
        toast.error('No se detectaron datos en el PDF', 'Captura los campos manualmente — el lector es best-effort.')
      }
    } finally {
      setPdfParsing(false)
    }
  }

  function handlePdfClear() {
    setPdfFileName('')
    setPdfExtraction(null)
    setAutoFilled(new Set())
  }

  /** Si el usuario edita a mano un campo autocompletado por el PDF, deja de marcarse como "del PDF". */
  function clearAutoFilled(key: 'paqueteria' | 'trackingNumber' | 'fecha') {
    setAutoFilled(prev => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  const margen = (Number(precio) || 0) - (Number(costo) || 0)

  const canSubmit =
    !!clienteId
    && !!trackingNumber.trim()
    && Number(costo) >= 0
    && Number(precio) >= 0
    && pickResult !== null
    && (pickResult.type !== 'manual' || !!pickResult.reference?.trim())

  const handleSubmit = async () => {
    if (!canSubmit || !cliente || !pickResult) return
    setSubmitting(true)
    try {
      const isExt = pickResult.type === 'order' || pickResult.type === 'receipt'
      const data: CreateGuiaData = {
        paqueteria,
        tracking_number:           trackingNumber.trim(),
        cliente_id:                clienteId,
        cliente_codigo:            cliente.codigo,
        costo:                     Number(costo),
        precio:                    Number(precio),
        fecha,
        origen:                    isExt ? 'extensiv' : 'manual',
        extensiv_transaction_type: isExt ? (pickResult.type as 'order' | 'receipt') : null,
        extensiv_transaction_id:   isExt ? (pickResult.transactionId ?? null) : null,
        extensiv_customer_id:      isExt ? (pickResult.customerId ?? null) : null,
        manual_reference:          isExt ? null : (pickResult.reference ?? null),
        notas,
        creado_por:                creadoPor,
      }
      await onSubmit(data)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between z-10">
          <h2 className="text-base font-bold text-[#1e3a5f] inline-flex items-center gap-2">
            <Package size={18} /> Nueva guía
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Subir PDF de la guía (opcional) — autocompleta lo que se pueda leer del PDF */}
          <div>
            <NotaDropzone
              fileName={pdfFileName}
              onFile={handlePdfFile}
              onClear={handlePdfClear}
              accept=".pdf"
              acceptLabel="PDF"
              label="Guía en PDF (opcional) — Tecship o cualquier paquetería"
              hint="Arrastra o haz clic para subir el PDF de la guía"
              disabled={pdfParsing}
            />
            {pdfParsing && (
              <p className="text-xs text-gray-400 mt-1.5 inline-flex items-center gap-1.5"><Spinner size={12} /> Leyendo PDF…</p>
            )}
            {pdfExtraction && !pdfParsing && (
              <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50/60 p-2 text-[11px] text-gray-500">
                <p className="font-semibold text-gray-600 mb-1 inline-flex items-center gap-1"><FileText size={11} /> Extraído con lector local:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                  <span>Paquetería: <b>{pdfExtraction.paqueteria ? PAQUETERIA_LABEL[pdfExtraction.paqueteria] : '—'}</b></span>
                  <span>Tracking: <b>{pdfExtraction.trackingNumber ?? '—'}</b></span>
                  <span>Fecha: <b>{pdfExtraction.fechaRaw ?? '—'}</b></span>
                  <span>Peso: <b>{pdfExtraction.peso ?? '—'}</b></span>
                  <span>Destino: <b>{pdfExtraction.destino ?? '—'}</b></span>
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-gray-400">Ver texto crudo (debug)</summary>
                  <pre className="whitespace-pre-wrap text-[10px] text-gray-400 mt-1 max-h-32 overflow-y-auto">{pdfExtraction.rawText || '(sin texto)'}</pre>
                </details>
              </div>
            )}
          </div>

          {/* Paquetería */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 block">
              Paquetería
              {autoFilled.has('paqueteria') && <span className="text-[10px] text-blue-600 ml-1 normal-case font-normal">· del PDF, verifica</span>}
            </label>
            <div className="flex gap-2 flex-wrap">
              {PAQUETERIAS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setPaqueteria(p); setPaqueteriaTouched(true); clearAutoFilled('paqueteria') }}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    paqueteria === p
                      ? 'text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={paqueteria === p ? { background: PAQUETERIA_COLOR[p] } : undefined}
                >
                  {PAQUETERIA_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Tracking + Fecha */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 block">
                Tracking #
                {autoFilled.has('trackingNumber') && <span className="text-[10px] text-blue-600 ml-1 normal-case font-normal">· del PDF, verifica</span>}
              </label>
              <input
                type="text"
                value={trackingNumber}
                onChange={e => { setTrackingNumber(e.target.value); clearAutoFilled('trackingNumber') }}
                placeholder="Número de guía"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-[#1e3a5f] outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 block">
                Fecha
                {autoFilled.has('fecha') && <span className="text-[10px] text-blue-600 ml-1 normal-case font-normal">· del PDF, verifica</span>}
              </label>
              <input
                type="date"
                value={fecha}
                onChange={e => { setFecha(e.target.value); setFechaTouched(true); clearAutoFilled('fecha') }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
              />
            </div>
          </div>

          {/* Costo + Precio */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 block">Costo (lo que pagamos)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={costo}
                onChange={e => setCosto(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-[#1e3a5f] outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 block">Precio (al cliente)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={precio}
                onChange={e => setPrecio(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-[#1e3a5f] outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 block">Margen</label>
              <p className="px-3 py-2 text-sm font-bold rounded-lg border border-gray-200 bg-gray-50 tabular-nums" style={{ color: margen >= 0 ? '#7c3aed' : '#dc3545' }}>
                {fmtMXN(margen)}
              </p>
            </div>
          </div>

          {/* Cliente + Vínculo — un único selector de cliente, dentro del picker */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 block">
              Cliente y vínculo (transacción Extensiv o referencia manual)
            </label>
            <ExtensivOperationPicker
              value={pickResult}
              onChange={setPickResult}
              clients={clients}
              clientId={clienteId}
              onClientChange={id => { setClienteId(id); setPickResult(null) }}
              fromDays={7}
            />
          </div>

          {/* Notas */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 block">Notas</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={2}
              placeholder="Observaciones (opcional)"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-[#1e3a5f] outline-none"
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="px-5 py-2 rounded-xl text-sm font-bold text-white shadow-sm disabled:opacity-40"
            style={{ background: 'var(--brand-navy)' }}
          >
            {submitting ? <Spinner size={14} /> : null} Guardar guía
          </button>
        </div>
      </div>
    </div>
  )
}
