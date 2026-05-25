import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, AlertTriangle, Calendar } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../hooks/useToast'
import {
  fetchExecutiveData,
  computeKPIs,
  buildExecutiveWorkbook,
  rangeThisWeek,
  rangeThisMonth,
  rangePrevMonth,
  rangeCustom,
  type ExecutiveRange,
  type ExecutiveData,
  type ExecutiveKPIs,
} from '../../lib/executiveReportExporter'
import * as XLSX from 'xlsx'

type Preset = 'week' | 'month' | 'prev_month' | 'custom'

const mxn = (n: number) => `$${(n ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`

export function ExecutiveReportPage() {
  const toast = useToast()
  const [preset, setPreset] = useState<Preset>('week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [data, setData] = useState<ExecutiveData | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const range: ExecutiveRange | null = useMemo(() => {
    if (preset === 'week')        return rangeThisWeek()
    if (preset === 'month')       return rangeThisMonth()
    if (preset === 'prev_month')  return rangePrevMonth()
    if (preset === 'custom' && customFrom && customTo) return rangeCustom(customFrom, customTo)
    return null
  }, [preset, customFrom, customTo])

  // Auto-load preview cuando cambia el rango
  useEffect(() => {
    if (!range) { setData(null); return }
    let cancelled = false
    setLoading(true); setError(null)
    fetchExecutiveData(range)
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar datos') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [range])

  const kpis: ExecutiveKPIs | null = useMemo(() => data ? computeKPIs(data) : null, [data])

  const handleDownload = async () => {
    if (!data || !range) return
    setDownloading(true)
    try {
      const wb = buildExecutiveWorkbook(data)
      const safeLabel = range.label.replace(/[^\w-]+/g, '_')
      const fileName = `Reporte_Ejecutivo_${safeLabel}_${range.from}.xlsx`
      XLSX.writeFile(wb, fileName)
      toast.success('Descarga iniciada', fileName)
    } catch (e) {
      toast.error('Error al generar Excel', e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 sm:p-6 sm:pb-10 touch-pan-y">
          <div className="mb-4">
            <h1 className="text-xl font-bold text-[#1e3a5f] inline-flex items-center gap-2">
              <FileSpreadsheet size={20} /> Reporte ejecutivo
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Solo administradores · Excel multi-hoja con operaciones, viajes, ingresos, costos, márgenes y pendientes.
            </p>
          </div>

          {/* Selector de rango */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 inline-flex items-center gap-1 mb-2">
              <Calendar size={12} /> Rango del reporte
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {([
                { id: 'week',       label: 'Esta semana' },
                { id: 'month',      label: 'Este mes' },
                { id: 'prev_month', label: 'Mes anterior' },
                { id: 'custom',     label: 'Personalizado' },
              ] as { id: Preset; label: string }[]).map(p => {
                const active = preset === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPreset(p.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                      active
                        ? 'text-white border-transparent shadow-sm'
                        : 'text-gray-700 bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                    style={active ? { background: 'var(--brand-navy)' } : undefined}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
            {preset === 'custom' && (
              <div className="grid grid-cols-2 gap-2 max-w-md">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Desde</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Hasta</label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={e => setCustomTo(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
            )}
            {range && (
              <p className="text-xs text-gray-500 mt-2">
                <span className="font-semibold text-gray-700">{range.label}</span> · {range.from} → {range.to}
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4 inline-flex items-center gap-2">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          {/* Preview KPIs */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
              <Spinner size={20} /> Cargando datos del período…
            </div>
          ) : kpis && data ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <KPI title="Viajes"          value={String(kpis.numViajes)}        color="#1e3a5f" />
                <KPI title="Ingreso total"   value={mxn(kpis.ingresoTotal)}        color="#28a745" />
                <KPI title="Costo total"     value={mxn(kpis.costoTotal)}          color="#dc3545" />
                <KPI title="Margen"          value={`${mxn(kpis.margenTotal)} (${kpis.margenPct}%)`} color="#7c3aed" />
                <KPI title="Operaciones WMS" value={String(kpis.numOperaciones)}   color="#1e3a5f" />
                <KPI title="Tareas creadas"  value={String(kpis.numTareasCreadas)} color="#0ea5e9" />
                <KPI title="Aceptaciones"    value={String(kpis.numAceptaciones)}  color="#28a745" />
                <KPI title="Rechazos"        value={String(kpis.numRechazos)}      color="#dc3545" />
              </div>

              {/* Top clientes / proveedores */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                <RankCard
                  title="Top 3 clientes por ingreso"
                  rows={kpis.topClientes.map(c => ({ label: c.cliente, value: mxn(c.ingreso), sub: `${c.viajes} viajes` }))}
                />
                <RankCard
                  title="Top 3 proveedores por costo"
                  rows={kpis.topProveedores.map(p => ({ label: p.proveedor, value: mxn(p.costo), sub: `${p.viajes} viajes` }))}
                />
              </div>

              {/* CTA descargar */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Excel multi-hoja</p>
                  <p className="text-xs text-gray-500">
                    6 hojas: Resumen ejecutivo, Viajes, Costos &amp; márgenes, Tareas, Pendientes, Auditoría
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading || !data}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm disabled:opacity-50"
                  style={{ background: 'var(--brand-navy)' }}
                >
                  {downloading ? <Spinner size={16} /> : <Download size={16} />}
                  {downloading ? 'Generando…' : 'Descargar Excel'}
                </button>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-12 text-center">
              <p className="text-sm text-gray-400">
                {preset === 'custom' && (!customFrom || !customTo)
                  ? 'Selecciona las fechas desde / hasta para ver el preview.'
                  : 'Selecciona un rango para ver el preview.'}
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function KPI({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{title}</p>
      <p className="kpi-number text-xl mt-1 truncate" style={{ color }}>{value}</p>
    </div>
  )
}

function RankCard({ title, rows }: { title: string; rows: { label: string; value: string; sub: string }[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400">Sin datos en el período.</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-2 border-b border-gray-50 last:border-0 pb-1.5 last:pb-0">
              <div className="min-w-0 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold inline-flex items-center justify-center shrink-0">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{r.label}</p>
                  <p className="text-[10px] text-gray-400 truncate">{r.sub}</p>
                </div>
              </div>
              <p className="text-sm font-bold text-[#1e3a5f] tabular-nums shrink-0">{r.value}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
