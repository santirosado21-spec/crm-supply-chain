import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Loader2, PackageOpen, ArrowRight, AlertTriangle,
} from 'lucide-react'
import { Header } from '../../../components/layout/Header'
import { Sidebar } from '../../../components/layout/Sidebar'
import { useWarehouseEntries } from '../../../hooks/useWarehouseEntries'
import type { EntryFlowStatus } from '../../../types/warehouseEntry'

const STATUS_META: Record<EntryFlowStatus, { label: string; cls: string }> = {
  paso1:      { label: 'Paso 1 — Validar alta',   cls: 'bg-amber-50 text-amber-700' },
  paso2:      { label: 'Paso 2 — Receipt',        cls: 'bg-amber-50 text-amber-700' },
  paso3:      { label: 'Paso 3 — Verificar',      cls: 'bg-blue-50 text-blue-700' },
  completada: { label: 'Completada',              cls: 'bg-green-50 text-green-700' },
  cancelada:  { label: 'Cancelada',               cls: 'bg-gray-100 text-gray-500' },
}

export function EntradasHistorialPage() {
  const navigate = useNavigate()
  const { entries, loading, error } = useWarehouseEntries()

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 sm:p-6 sm:pb-10 touch-pan-y">
          <button
            onClick={() => navigate('/almacen/entradas')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#1e3a5f] mb-4 transition-colors"
          >
            <ArrowLeft size={16} /> Volver al wizard
          </button>

          <div className="mb-6">
            <h1 className="text-xl font-bold text-[#1e3a5f]">Historial de entradas</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Entradas procesadas por el wizard. Reanuda cualquiera en el paso donde quedó.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" /> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin" /> Cargando entradas…
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <PackageOpen size={40} className="text-gray-300" />
              <p className="text-sm text-gray-500">Aún no hay entradas registradas.</p>
              <button
                onClick={() => navigate('/almacen/entradas')}
                className="h-10 px-5 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium hover:bg-[#16304d] transition-colors"
              >
                Crear primera entrada
              </button>
            </div>
          ) : (
            <div className="max-w-full overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
              <table className="min-w-[820px] w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Fecha</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Cliente</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Ref #</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Nota</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Estado</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Anomalías</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => {
                    const meta = STATUS_META[e.flow_status] ?? STATUS_META.paso1
                    const anomalyCount = Object.values(e.anomalies ?? {}).filter(v => (v ?? '').trim()).length
                    return (
                      <tr
                        key={e.id}
                        onClick={() => navigate(`/almacen/entradas/${e.id}`)}
                        className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 text-gray-600">{e.fecha}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{e.customer_name || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{e.ref || '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">{e.nota_file_name || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${meta.cls}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {anomalyCount > 0 ? (
                            <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-semibold">
                              <AlertTriangle size={12} /> {anomalyCount}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center gap-1 text-[#1e3a5f] text-xs font-semibold">
                            Reanudar <ArrowRight size={13} />
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
