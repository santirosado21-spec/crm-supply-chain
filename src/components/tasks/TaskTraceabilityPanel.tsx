import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardList } from 'lucide-react'
import { Spinner } from '../ui/Spinner'
import { EmptyState } from '../ui/EmptyState'
import { useTasks } from '../../hooks/useTasks'
import { useTeamMembers } from '../../hooks/useTeamMembers'
import { TaskRouteLabel } from './TaskRouteLabel'
import { useToast } from '../../hooks/useToast'
import { useAuthContext } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { TASK_STATUS_COLOR, TASK_STATUS_LABEL, type Task } from '../../types/tasks'

// ─── helpers ─────────────────────────────────────────────────────────────────

const RANGES = [
  { key: '7',   label: '7 días',  days: 7   },
  { key: '30',  label: '30 días', days: 30  },
  { key: '90',  label: '90 días', days: 90  },
  { key: 'all', label: 'Todo',    days: null as number | null },
] as const

type RangeKey = (typeof RANGES)[number]['key']

const PENDING_STATES: Task['status'][] = ['propuesta', 'aceptada', 'en_curso', 'pausada']

// ─── props ───────────────────────────────────────────────────────────────────

interface Props {
  /** Si se pasa, filtra a las tareas asignadas a ese receptor (operaciones). Si se omite, todas (general). */
  assignee?: string
  /** Notifica al padre tras cerrar una tarea, para refrescar su propia vista. */
  onChanged?: () => void
}

// ─── componente ──────────────────────────────────────────────────────────────

export function TaskTraceabilityPanel({ assignee, onChanged }: Props) {
  const { tasks, loading, list } = useTasks()
  const { byEmail } = useTeamMembers()
  const toast = useToast()
  const { user } = useAuthContext()
  const email = user?.email ?? ''
  const [range, setRange] = useState<RangeKey>('30')
  const [refetchKey, setRefetchKey] = useState(0)
  const [closingId, setClosingId] = useState<string | null>(null)

  const refetch = useCallback(() => setRefetchKey(k => k + 1), [])

  useEffect(() => {
    const cfg = RANGES.find(r => r.key === range)!
    const fromDate =
      cfg.days === null
        ? undefined
        : new Date(Date.now() - cfg.days * 24 * 60 * 60 * 1000).toISOString()
    list({ assignee, fromDate })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignee, range, refetchKey])

  // Excluye canceladas y rechazadas — solo lo operativo relevante.
  const visible = useMemo(
    () => tasks.filter(t => t.status !== 'cancelada' && t.status !== 'rechazada'),
    [tasks],
  )

  const pendientes = useMemo(
    () =>
      visible
        .filter(t => PENDING_STATES.includes(t.status))
        .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()),
    [visible],
  )

  const cerradas = useMemo(
    () =>
      visible
        .filter(t => t.status === 'finalizada')
        // Más reciente primero — histórico para trazabilidad.
        .sort((a, b) => new Date(b.scheduled_start).getTime() - new Date(a.scheduled_start).getTime()),
    [visible],
  )

  async function closeTask(t: Task) {
    if (!window.confirm('¿Cerrar esta tarea?')) return
    setClosingId(t.id)
    try {
      const { error } = await supabase.rpc('task_close_with_evidence', {
        p_task_id: t.id,
      })
      if (error) throw error
      refetch()
      onChanged?.()
    } catch (e: unknown) {
      toast.error('No se pudo cerrar', e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setClosingId(null)
    }
  }

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })
  const fmtTime = (d: string) =>
    new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

  // ─── tarjeta ───────────────────────────────────────────────────────────────

  function TaskRow({ t }: { t: Task }) {
    const done = t.status === 'finalizada'
    const canClose = !done && t.assignee_email === email
    return (
      <div
        className={`bg-white rounded-xl shadow-sm p-3 sm:p-4 border border-gray-100 transition-opacity ${
          done ? 'opacity-60' : ''
        }`}
        style={{ borderLeft: `5px solid ${done ? '#28a745' : TASK_STATUS_COLOR[t.status] ?? '#cbd5e1'}` }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {fmtDate(t.scheduled_start)} · {fmtTime(t.scheduled_start)} – {fmtTime(t.scheduled_end)}
              {t.ref ? ` · ${t.ref}` : ''}
            </p>
            <h3 className={`text-sm font-semibold mt-0.5 truncate ${done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
              {t.title}
            </h3>
            <div className="mt-1">
              <TaskRouteLabel assigner={t.assigner_email} assignee={t.assignee_email} dir={byEmail} />
              {t.client?.name && <span className="text-[11px] text-gray-400"> · {t.client.name}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {done ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                <CheckCircle2 size={10} /> Completado
              </span>
            ) : (
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{
                  background: `${TASK_STATUS_COLOR[t.status]}1a`,
                  color: TASK_STATUS_COLOR[t.status],
                }}
              >
                {TASK_STATUS_LABEL[t.status]}
              </span>
            )}
            {canClose && (
              <button
                type="button"
                disabled={closingId === t.id}
                onClick={() => closeTask(t)}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
              >
                {closingId === t.id ? '…' : 'Cerrar ✓'}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Selector de rango */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 mb-4 w-fit">
        {RANGES.map(r => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              range === r.key ? 'bg-white shadow-sm text-[#1e3a5f]' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
          <Spinner size={20} /> Cargando...
        </div>
      ) : pendientes.length === 0 && cerradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <EmptyState
            icon={ClipboardList}
            title="Sin tareas en este rango"
            description="Amplía el rango de fechas para ver más actividades."
          />
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Pendientes ── */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Pendientes</h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                {pendientes.length}
              </span>
            </div>
            {pendientes.length === 0 ? (
              <p className="text-sm text-gray-400 py-3">Nada pendiente. 🎉</p>
            ) : (
              <div className="space-y-2">
                {pendientes.map(t => <TaskRow key={t.id} t={t} />)}
              </div>
            )}
          </section>

          {/* ── Cerradas ── */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Cerradas</h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                {cerradas.length}
              </span>
            </div>
            {cerradas.length === 0 ? (
              <p className="text-sm text-gray-400 py-3">Aún no hay tareas cerradas en este rango.</p>
            ) : (
              <div className="space-y-2">
                {cerradas.map(t => <TaskRow key={t.id} t={t} />)}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
