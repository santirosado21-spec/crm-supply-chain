import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  History, Loader2, AlertTriangle, Link2, Truck, CheckCircle2,
} from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { CloseTaskModal } from '../../components/tasks/CloseTaskModal'
import { useToast } from '../../hooks/useToast'
import { useViajes } from '../../hooks/useViajes'
import { useClientCatalog } from '../../hooks/useClientCatalog'
import type { Viaje } from '../../types/tms'

export function EvidenciaFletePage() {
  const navigate = useNavigate()
  const toast = useToast()
  // Solo los viajes confirmados (creados desde el Cotizador) son elegibles.
  const { viajes, loading, error, attachEvidencia } = useViajes({ estado: 'confirmado' })
  const { findByCodigo } = useClientCatalog()

  const [attachTarget, setAttachTarget] = useState<Viaje | null>(null)
  const [attachBusy, setAttachBusy] = useState(false)

  const pendientes = viajes.filter(v => !v.evidencia_url)
  const conEvidencia = viajes.length - pendientes.length

  const clienteLabel = (v: Viaje) =>
    (v.cliente_codigo && findByCodigo(v.cliente_codigo)?.nombre) || v.cliente_codigo || v.referencia_manual || 'Cliente sin identificar'

  const confirmAttach = async (evidenceUrl: string) => {
    if (!attachTarget) return
    setAttachBusy(true)
    try {
      await attachEvidencia(attachTarget.id, evidenceUrl)
      toast.success('Evidencia adjuntada')
      setAttachTarget(null)
    } catch (e: unknown) {
      toast.error('No se pudo adjuntar', e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setAttachBusy(false)
    }
  }

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 sm:p-6 sm:pb-10 touch-pan-y">
          <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-[#1e3a5f]">Evidencia de flete propio</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Selecciona un viaje confirmado y adjúntale el link de Google Drive con la evidencia. No necesitas recapturar datos.
              </p>
            </div>
            <button
              onClick={() => navigate('/tms/evidencia-flete/historial')}
              className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 flex items-center gap-1.5 hover:bg-gray-50 transition-colors"
            >
              <History size={14} /> Historial {conEvidencia > 0 && <span className="text-gray-400">({conEvidencia})</span>}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" /> {error}
            </div>
          )}

          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
            Pendientes de evidencia ({pendientes.length})
          </h2>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin" /> Cargando viajes…
            </div>
          ) : pendientes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <CheckCircle2 size={40} className="text-gray-300" />
              <p className="text-sm text-gray-500">
                No hay viajes confirmados pendientes de evidencia.
              </p>
              <p className="text-xs text-gray-400 max-w-sm">
                Los viajes aparecen aquí cuando se confirma una cotización en el Cotizador.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendientes.map(v => (
                <div key={v.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {clienteLabel(v)}
                      {v.referencia_manual && (
                        <span className="font-mono text-xs text-gray-400 ml-1.5">· {v.referencia_manual}</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                      <Truck size={12} className="text-gray-400" />
                      {v.origen} → {v.destino}
                      {v.fecha_programada && <span className="text-gray-400">· {v.fecha_programada}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => setAttachTarget(v)}
                    className="h-9 px-4 rounded-lg bg-[#1e3a5f] text-white text-xs font-bold flex items-center gap-1.5 hover:bg-[#16304d] transition-colors"
                  >
                    <Link2 size={14} /> Adjuntar evidencia
                  </button>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {attachTarget && (
        <CloseTaskModal
          title="Adjuntar evidencia"
          taskTitle={`${clienteLabel(attachTarget)} · ${attachTarget.origen} → ${attachTarget.destino}`}
          busy={attachBusy}
          onCancel={() => setAttachTarget(null)}
          onConfirm={confirmAttach}
        />
      )}
    </div>
  )
}
