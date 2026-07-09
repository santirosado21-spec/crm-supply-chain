import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, XCircle, History, PackageMinus, Loader2, AlertTriangle, CheckCircle2,
} from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { CloseTaskModal } from '../../components/tasks/CloseTaskModal'
import { useToast } from '../../hooks/useToast'
import { useAuthContext } from '../../context/AuthContext'
import { useWarehouseExits } from '../../hooks/useWarehouseExits'
import type { ExitItem, WarehouseExit } from '../../types/warehouseExit'

function emptyItem(): ExitItem {
  return { sku: '', qty: 1, description: '' }
}

export function EvidenciaFletePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuthContext()
  const { exits, loading, error, createExit, closeExit } = useWarehouseExits()

  const [ref, setRef] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [items, setItems] = useState<ExitItem[]>([emptyItem()])
  const [creating, setCreating] = useState(false)
  const [closingExit, setClosingExit] = useState<WarehouseExit | null>(null)
  const [closeBusy, setCloseBusy] = useState(false)

  const abiertas = exits.filter(e => e.status === 'abierta')

  const updateItem = (idx: number, field: keyof ExitItem, value: string | number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }
  const addItem = () => setItems(prev => [...prev, emptyItem()])
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const canRegister = customerName.trim() && items.some(i => i.sku.trim() && i.qty > 0)

  const handleRegister = async () => {
    if (!canRegister) return
    setCreating(true)
    try {
      const cleaned = items
        .map(i => ({ sku: i.sku.trim().toUpperCase(), qty: Number(i.qty) || 0, description: i.description.trim() }))
        .filter(i => i.sku && i.qty > 0)
      await createExit({
        ref: ref.trim(),
        customer_name: customerName.trim(),
        items: cleaned,
        created_by: user?.email ?? null,
      })
      toast.success('Evidencia registrada')
      setRef('')
      setCustomerName('')
      setItems([emptyItem()])
    } catch (e: unknown) {
      toast.error('No se pudo registrar', e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setCreating(false)
    }
  }

  const confirmClose = async (evidenceUrl: string) => {
    if (!closingExit) return
    setCloseBusy(true)
    try {
      await closeExit(closingExit.id, evidenceUrl)
      toast.success('Evidencia cerrada')
      setClosingExit(null)
    } catch (e: unknown) {
      toast.error('No se pudo cerrar', e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setCloseBusy(false)
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
                Registra un embarque de flete propio y ciérralo con el link de Google Drive de la evidencia.
              </p>
            </div>
            <button
              onClick={() => navigate('/tms/evidencia-flete/historial')}
              className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 flex items-center gap-1.5 hover:bg-gray-50 transition-colors"
            >
              <History size={14} /> Historial
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" /> {error}
            </div>
          )}

          {/* Registrar nueva evidencia */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
            <h2 className="text-sm font-bold text-[#1e3a5f] mb-3">Nueva evidencia</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Cliente</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Nombre del cliente"
                  className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Ref # (opcional)</label>
                <input
                  type="text"
                  value={ref}
                  onChange={e => setRef(e.target.value)}
                  placeholder="Ej: SO2554"
                  className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                />
              </div>
            </div>

            <div className="rounded-lg border border-gray-100 overflow-hidden mb-3">
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50/60 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-600">Items</p>
                <button onClick={addItem} className="flex items-center gap-1 text-[11px] font-medium text-[#1e3a5f] hover:underline">
                  <Plus size={12} /> Agregar línea
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-3 py-1.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">SKU</th>
                    <th className="text-right px-3 py-1.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wider w-20">Cantidad</th>
                    <th className="text-left px-3 py-1.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Descripción</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-50">
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={item.sku}
                          onChange={e => updateItem(idx, 'sku', e.target.value)}
                          className="w-full h-8 px-2 rounded border border-transparent hover:border-gray-200 focus:border-[#1e3a5f] focus:outline-none font-mono text-xs font-semibold text-gray-800"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          value={item.qty}
                          onChange={e => updateItem(idx, 'qty', Number(e.target.value))}
                          className="w-full h-8 px-2 rounded border border-transparent hover:border-gray-200 focus:border-[#1e3a5f] focus:outline-none text-right text-sm"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={item.description}
                          onChange={e => updateItem(idx, 'description', e.target.value)}
                          placeholder="(opcional)"
                          className="w-full h-8 px-2 rounded border border-transparent hover:border-gray-200 focus:border-[#1e3a5f] focus:outline-none text-xs text-gray-700"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 p-1" title="Eliminar línea">
                          <XCircle size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={handleRegister}
              disabled={!canRegister || creating}
              className="h-10 px-6 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#16304d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <PackageMinus size={16} />}
              Registrar evidencia
            </button>
          </div>

          {/* Evidencias abiertas */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              Abiertas ({abiertas.length})
            </h2>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
                <Loader2 size={16} className="animate-spin" /> Cargando…
              </div>
            ) : abiertas.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No hay evidencias abiertas.</p>
            ) : (
              <div className="space-y-2">
                {abiertas.map(ex => (
                  <div key={ex.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {ex.customer_name} {ex.ref && <span className="font-mono text-xs text-gray-400 ml-1">· {ex.ref}</span>}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {ex.items.length} item{ex.items.length === 1 ? '' : 's'} · {ex.fecha}
                      </p>
                    </div>
                    <button
                      onClick={() => setClosingExit(ex)}
                      className="h-9 px-4 rounded-lg bg-[#28a745] text-white text-xs font-bold flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                    >
                      <CheckCircle2 size={14} /> Cerrar evidencia
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {closingExit && (
        <CloseTaskModal
          title="Cerrar evidencia"
          taskTitle={closingExit.customer_name}
          busy={closeBusy}
          onCancel={() => setClosingExit(null)}
          onConfirm={confirmClose}
        />
      )}
    </div>
  )
}
