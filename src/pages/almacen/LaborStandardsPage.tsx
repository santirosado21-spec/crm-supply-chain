import { useState } from 'react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { useLaborStandards, type LaborStandard, type LaborStandardInput } from '../../hooks/useLaborStandards'
import { useToast } from '../../hooks/useToast'
import { Plus, Pencil, Trash2, X, Clock } from 'lucide-react'

/*
  Engineered Labor Standards CRUD — el "framework mental" de Blue Yonder WLM:
  define cuánto debería tomar cada tipo de tarea. Después se usa como
  sugerencia al asignar en el Pizarrón (Commit 7) y como baseline para
  comparar contra actual_duration_min (Commit 8).
*/
export function LaborStandardsPage() {
  const { standards, loading, upsert, remove } = useLaborStandards()
  const [editing, setEditing] = useState<Partial<LaborStandard> | null>(null)
  const toast = useToast()

  const handleSave = async (input: LaborStandardInput) => {
    try {
      await upsert(input)
      toast.success(editing?.id ? 'Estándar actualizado' : 'Estándar creado')
      setEditing(null)
    } catch (e) {
      toast.error('Error', e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  const handleDelete = async (s: LaborStandard) => {
    if (!confirm(`¿Eliminar el estándar "${s.task_type}"?`)) return
    try {
      await remove(s.id)
      toast.success('Estándar eliminado')
    } catch (e) {
      toast.error('Error', e instanceof Error ? e.message : 'No se pudo eliminar')
    }
  }

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-6">
          <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-[#1e3a5f]">Estándares de tiempo</h1>
              <p className="text-sm text-gray-500 mt-1">
                Define cuánto debería tomar cada tipo de tarea — se usa como sugerencia al asignar
              </p>
            </div>
            <button
              onClick={() => setEditing({ task_type: '', base_duration_min: 30 })}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white shadow-sm hover:opacity-90"
              style={{ background: 'var(--brand-navy)' }}
            >
              <Plus size={16} /> Nuevo estándar
            </button>
          </div>

          {loading && <p className="text-sm text-gray-500">Cargando...</p>}

          {!loading && standards.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
              <Clock size={40} className="mx-auto text-gray-400 mb-3" />
              <p className="text-base font-semibold text-gray-800">Aún no hay estándares</p>
              <p className="text-sm text-gray-500 mt-1">
                Crea uno para cada tipo de tarea común (picking, packing, recepción, etc.)
              </p>
            </div>
          )}

          {!loading && standards.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/60 border-b border-gray-100">
                    <th className="text-left px-4 py-2 text-[10px] font-bold uppercase text-gray-500">Tipo de tarea</th>
                    <th className="text-right px-4 py-2 text-[10px] font-bold uppercase text-gray-500">Duración (min)</th>
                    <th className="text-left px-4 py-2 text-[10px] font-bold uppercase text-gray-500">Unidad</th>
                    <th className="text-left px-4 py-2 text-[10px] font-bold uppercase text-gray-500">Notas</th>
                    <th className="px-4 py-2 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {standards.map(s => (
                    <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2 text-sm font-semibold text-gray-800">{s.task_type}</td>
                      <td className="px-4 py-2 text-sm text-right tabular-nums text-[#1e3a5f] font-bold">{s.base_duration_min}</td>
                      <td className="px-4 py-2 text-xs text-gray-600">{s.unit_label ?? '—'}</td>
                      <td className="px-4 py-2 text-xs text-gray-500 max-w-md truncate">{s.notes ?? '—'}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditing(s)}
                            className="p-1.5 rounded text-gray-500 hover:bg-gray-100 hover:text-[#1e3a5f]"
                            aria-label="Editar"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(s)}
                            className="p-1.5 rounded text-gray-500 hover:bg-red-50 hover:text-red-600"
                            aria-label="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
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

      {editing && (
        <StandardModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

function StandardModal({
  initial, onClose, onSave,
}: {
  initial: Partial<LaborStandard>
  onClose: () => void
  onSave: (input: LaborStandardInput) => void | Promise<void>
}) {
  const [taskType, setTaskType]   = useState(initial.task_type ?? '')
  const [duration, setDuration]   = useState<number>(initial.base_duration_min ?? 30)
  const [unitLabel, setUnitLabel] = useState(initial.unit_label ?? '')
  const [notes, setNotes]         = useState(initial.notes ?? '')
  const [saving, setSaving]       = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskType.trim() || duration <= 0) return
    setSaving(true)
    try {
      await onSave({
        task_type: taskType.trim(),
        base_duration_min: duration,
        unit_label: unitLabel.trim() || null,
        notes: notes.trim() || null,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-scale-in">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#1e3a5f]">
              {initial.id ? 'Editar estándar' : 'Nuevo estándar de tiempo'}
            </h2>
            <p className="text-xs text-gray-500 mt-1">Tiempo base para un tipo de tarea</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Tipo de tarea *</label>
            <input
              type="text"
              value={taskType}
              onChange={e => setTaskType(e.target.value)}
              placeholder="picking, packing, recepcion, ..."
              required
              disabled={!!initial.id}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-500"
            />
            {initial.id && (
              <p className="text-[10px] text-gray-400 mt-1">El tipo no se puede cambiar (es clave única).</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Duración base (minutos) *</label>
            <input
              type="number"
              min={1}
              value={duration}
              onChange={e => setDuration(Number(e.target.value) || 0)}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Unidad (opcional)</label>
            <input
              type="text"
              value={unitLabel}
              onChange={e => setUnitLabel(e.target.value)}
              placeholder="por orden, por pallet, por SKU..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !taskType.trim() || duration <= 0}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--brand-navy)' }}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
