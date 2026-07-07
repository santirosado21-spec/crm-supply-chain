import { useEffect, useState } from 'react'
import { X, CalendarPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthContext } from '../../context/AuthContext'
import { getTaskCategories, getCategoryIdForRole } from '../../hooks/useTasks'
import type { TaskCategory } from '../../types/tasks'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
  defaultDate?: string      // YYYY-MM-DD
  defaultAssignee?: string  // preset assignee_email
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function QuickEventModal({ open, onClose, onCreated, defaultDate, defaultAssignee }: Props) {
  const { user } = useAuthContext()
  const [categories, setCategories] = useState<TaskCategory[]>([])
  useEffect(() => { getTaskCategories().then(setCategories) }, [])

  const [title, setTitle]       = useState('')
  const [desc, setDesc]         = useState('')
  const [date, setDate]         = useState(defaultDate ?? todayStr())
  const [startT, setStartT]     = useState('09:00')
  const [endT, setEndT]         = useState('10:00')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    if (endT <= startT) { setError('La hora de fin debe ser posterior al inicio.'); return }
    setSaving(true)
    setError(null)
    try {
      const { error: err } = await supabase.from('tasks').insert({
        title: title.trim(),
        description: desc.trim() || '',
        assigner_email: user?.email ?? '',
        assignee_email: defaultAssignee || user?.email || '',
        scheduled_start: `${date}T${startT}:00`,
        scheduled_end:   `${date}T${endT}:00`,
        status: 'aceptada',
        category_id: getCategoryIdForRole(categories, user?.role),
        client_id: null,
        operation_id: null,
      })
      if (err) throw err
      setTitle(''); setDesc(''); setDate(defaultDate ?? todayStr())
      setStartT('09:00'); setEndT('10:00')
      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear la entrada')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <CalendarPlus size={18} className="text-[#1e3a5f]" />
            <h2 className="text-base font-bold text-[#1e3a5f]">Nueva entrada</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Título */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Título *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="¿Qué hay que hacer?"
              required
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]/50"
            />
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Fecha *</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]/50"
            />
          </div>

          {/* Hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Hora inicio *</label>
              <input
                type="time"
                value={startT}
                onChange={e => setStartT(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Hora fin *</label>
              <input
                type="time"
                value={endT}
                onChange={e => setEndT(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]/50"
              />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Descripción</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={2}
              placeholder="Detalles adicionales (opcional)"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]/50"
            />
          </div>

          {error && (
            <p className="text-xs text-[#c8373c] bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#1e3a5f] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando…' : 'Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
