import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Loader2, PackageOpen, AlertTriangle, Link2,
} from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { useViajes } from '../../hooks/useViajes'
import { useClientCatalog } from '../../hooks/useClientCatalog'
import type { Viaje } from '../../types/tms'

function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function HistorialEvidenciasPage() {
  const navigate = useNavigate()
  const { viajes, loading, error } = useViajes()
  const { findByCodigo } = useClientCatalog()

  const clienteLabel = (v: Viaje) =>
    (v.cliente_codigo && findByCodigo(v.cliente_codigo)?.nombre) || v.cliente_codigo || v.referencia_manual || '—'

  const conEvidencia = viajes
    .filter(v => v.evidencia_url)
    .sort((a, b) => (b.evidencia_fecha ?? '').localeCompare(a.evidencia_fecha ?? ''))

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 sm:p-6 sm:pb-10 touch-pan-y">
          <button
            onClick={() => navigate('/tms/evidencia-flete')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#1e3a5f] mb-4 transition-colors"
          >
            <ArrowLeft size={16} /> Volver a Evidencia de flete propio
          </button>

          <div className="mb-6">
            <h1 className="text-xl font-bold text-[#1e3a5f]">Historial de evidencias</h1>
            <p className="text-xs text-gray-400 mt-0.5">Viajes de flete propio con evidencia de Google Drive adjuntada.</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" /> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin" /> Cargando evidencias…
            </div>
          ) : conEvidencia.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <PackageOpen size={40} className="text-gray-300" />
              <p className="text-sm text-gray-500">Aún no hay viajes con evidencia adjuntada.</p>
              <button
                onClick={() => navigate('/tms/evidencia-flete')}
                className="h-10 px-5 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium hover:bg-[#16304d] transition-colors"
              >
                Adjuntar primera evidencia
              </button>
            </div>
          ) : (
            <div className="max-w-full overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
              <table className="min-w-[820px] w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Cliente</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Ref #</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Ruta</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Fecha evidencia</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Por</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Evidencia</th>
                  </tr>
                </thead>
                <tbody>
                  {conEvidencia.map(v => (
                    <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{clienteLabel(v)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{v.referencia_manual || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{v.origen} → {v.destino}</td>
                      <td className="px-4 py-3 text-gray-600">{fmtFecha(v.evidencia_fecha)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{v.evidencia_por || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {v.evidencia_url ? (
                          <a
                            href={v.evidencia_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[#1e3a5f] text-xs font-semibold hover:underline"
                          >
                            <Link2 size={12} /> Ver
                          </a>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
