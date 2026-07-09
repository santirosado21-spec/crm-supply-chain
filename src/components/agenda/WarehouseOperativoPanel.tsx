import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, CheckCircle2, CalendarDays, ListChecks } from 'lucide-react'
import { Spinner } from '../ui/Spinner'
import { QuickEventModal } from './QuickEventModal'
import { TaskTraceabilityPanel } from '../tasks/TaskTraceabilityPanel'
import { TaskRouteLabel } from '../tasks/TaskRouteLabel'
import { useTasks } from '../../hooks/useTasks'
import { useTeamMembers } from '../../hooks/useTeamMembers'
import { useToast } from '../../hooks/useToast'
import { useAuthContext } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { TASK_STATUS_COLOR, DAY_OF_WEEK_LABEL, type Task } from '../../types/tasks'
import { ALMACEN_RECEPTOR_EMAIL } from '../../config/almacen'

// ─── helpers ─────────────────────────────────────────────────────────────────

function startOfWeek(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0)
  r.setDate(r.getDate() - r.getDay()); return r
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function sameDate(a: Date, b: Date): boolean { return a.toDateString() === b.toDateString() }
function toYMD(d: Date): string { return d.toISOString().slice(0, 10) }

// ─── componente ──────────────────────────────────────────────────────────────

/**
 * Calendario operativo de almacén — es el Calendario General acotado a lo que
 * le compete a almacén (`assignee = ALMACEN_RECEPTOR_EMAIL`). Sin chrome de
 * página: se renderiza como la vista "Operativo" dentro de AgendaPage
 * (visible solo a almacén + admin).
 */
export function WarehouseOperativoPanel() {
  const navigate = useNavigate()
  const { tasks, loading, list } = useTasks()
  const { byEmail } = useTeamMembers()
  const toast = useToast()
  const { user } = useAuthContext()
  const email = user?.email ?? ''

  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  const [activeDay, setActiveDay] = useState<Date>(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0); return t
  })
  const [modalOpen, setModalOpen]   = useState(false)
  const [refetchKey, setRefetchKey] = useState(0)
  const [closingId, setClosingId]   = useState<string | null>(null)

  const refresh = useCallback(() => setRefetchKey(k => k + 1), [])

  useEffect(() => {
    if (viewMode === 'list') return // el panel de tareas carga sus propios datos
    // Carga tareas asignadas al almacén para el rango de la semana.
    // Excluye rechazadas y canceladas — solo lo operativo relevante.
    list({
      assignee: ALMACEN_RECEPTOR_EMAIL,
      fromDate: weekStart.toISOString(),
      toDate: addDays(weekStart, 7).toISOString(),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, refetchKey, viewMode])

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )

  // Filtra rechazadas y canceladas del display
  const visibleTasks = useMemo(
    () => tasks.filter(t => t.status !== 'cancelada' && t.status !== 'rechazada'),
    [tasks],
  )

  const tasksByDay = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of visibleTasks) {
      const k = new Date(t.scheduled_start).toDateString()
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(t)
    }
    return m
  }, [visibleTasks])

  const dayTasks = useMemo(
    () =>
      (tasksByDay.get(activeDay.toDateString()) ?? []).sort(
        (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime(),
      ),
    [tasksByDay, activeDay],
  )

  async function closeTask(t: Task) {
    if (!window.confirm('¿Cerrar esta actividad?')) return
    setClosingId(t.id)
    try {
      const { error } = await supabase.rpc('task_close_with_evidence', {
        p_task_id: t.id,
      })
      if (error) throw error
      refresh()
    } catch (e: unknown) {
      toast.error('No se pudo cerrar', e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setClosingId(null)
    }
  }

  const fmt = (d: Date) => d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

  // Contadores del día activo
  const activeCounts = {
    pending:    dayTasks.filter(t => t.status === 'propuesta' || t.status === 'aceptada').length,
    inProgress: dayTasks.filter(t => t.status === 'en_curso' || t.status === 'pausada').length,
    done:       dayTasks.filter(t => t.status === 'finalizada').length,
  }

  return (
    <div>
      {/* ── Barra del operativo ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <p className="text-xs font-semibold text-[#1e3a5f]">
          Operativo · solo actividades asignadas al almacén
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {/* Toggle vista calendario / tareas */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-xl p-1">
            <button
              type="button"
              title="Vista calendario"
              onClick={() => setViewMode('calendar')}
              className={`p-2 rounded-lg transition-all ${
                viewMode === 'calendar'
                  ? 'bg-white shadow-sm text-[#1e3a5f]'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <CalendarDays size={15} />
            </button>
            <button
              type="button"
              title="Tareas — pendientes y cerradas"
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all ${
                viewMode === 'list'
                  ? 'bg-white shadow-sm text-[#1e3a5f]'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <ListChecks size={15} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 bg-[#1e3a5f] hover:opacity-90 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-opacity"
          >
            <Plus size={16} /> Nueva actividad
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          VISTA TAREAS (trazabilidad — solo almacén)
      ════════════════════════════════════════════════════════════ */}
      {viewMode === 'list' && (
        <TaskTraceabilityPanel assignee={ALMACEN_RECEPTOR_EMAIL} onChanged={refresh} />
      )}

      {/* ════════════════════════════════════════════════════════════
          VISTA CALENDARIO
      ════════════════════════════════════════════════════════════ */}
      {viewMode === 'calendar' && (
        <>
          {/* ── Navegador de semana ── */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <button
                type="button"
                onClick={() => setWeekStart(addDays(weekStart, -7))}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                aria-label="Semana anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <p className="text-xs font-semibold text-gray-700">
                {weekStart.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                {' – '}
                {addDays(weekStart, 6).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
              <button
                type="button"
                onClick={() => setWeekStart(addDays(weekStart, 7))}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                aria-label="Semana siguiente"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Grid 7 días */}
            <div className="grid grid-cols-7 gap-1 p-2 sm:p-3">
              {days.map(d => {
                const isActive = sameDate(d, activeDay)
                const isToday  = sameDate(d, new Date())
                const count    = (tasksByDay.get(d.toDateString()) ?? []).length
                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    onClick={() => setActiveDay(d)}
                    className={`flex flex-col items-center py-2 sm:py-3 rounded-lg text-[11px] font-medium transition-colors ${
                      isActive ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                    style={isActive ? { background: 'var(--brand-navy)' } : undefined}
                  >
                    <span className="opacity-80">{DAY_OF_WEEK_LABEL[d.getDay()]}</span>
                    <span className={`text-base font-bold mt-0.5 ${!isActive && isToday ? 'text-[#1e3a5f]' : ''}`}>
                      {d.getDate()}
                    </span>
                    {count > 0 && (
                      <span className={`mt-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                        isActive ? 'bg-white/20 text-white' : 'bg-blue-50 text-[#1e3a5f]'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Contadores del día ── */}
          {dayTasks.length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {activeCounts.pending > 0 && (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700">
                  {activeCounts.pending} pendiente{activeCounts.pending > 1 ? 's' : ''}
                </span>
              )}
              {activeCounts.inProgress > 0 && (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700">
                  {activeCounts.inProgress} en progreso
                </span>
              )}
              {activeCounts.done > 0 && (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-green-50 text-green-700">
                  {activeCounts.done} completada{activeCounts.done > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}

          {/* ── Lista del día ── */}
          {loading && (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
              <Spinner size={20} /> Cargando...
            </div>
          )}

          {!loading && dayTasks.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-12 text-center">
              <p className="text-sm text-gray-400">Sin actividades programadas para este día</p>
            </div>
          )}

          <div className="space-y-2">
            {dayTasks.map(t => {
              const start    = new Date(t.scheduled_start)
              const end      = new Date(t.scheduled_end)
              const done     = t.status === 'finalizada'
              const canClose = !done && t.status !== 'cancelada' && t.status !== 'rechazada' && t.assignee_email === email
              return (
                <div
                  key={t.id}
                  onClick={() => navigate(`/calendario/${t.id}`)}
                  className={`bg-white rounded-xl shadow-sm p-3 sm:p-4 border border-gray-100 transition-opacity cursor-pointer hover:border-gray-200 ${
                    done ? 'opacity-60' : ''
                  }`}
                  style={{ borderLeft: `5px solid ${done ? '#28a745' : TASK_STATUS_COLOR[t.status] ?? '#cbd5e1'}` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        {fmt(start)} – {fmt(end)}{t.ref ? ` · ${t.ref}` : ''}
                      </p>
                      <h3 className={`text-sm font-semibold mt-0.5 truncate ${done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {t.title}
                      </h3>
                      {t.description && (
                        <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{t.description}</p>
                      )}
                      <div className="mt-1">
                        <TaskRouteLabel assigner={t.assigner_email} assignee={t.assignee_email} dir={byEmail} />
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
                          {t.status}
                        </span>
                      )}
                      {canClose && (
                        <button
                          type="button"
                          disabled={closingId === t.id}
                          onClick={e => { e.stopPropagation(); closeTask(t) }}
                          className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
                        >
                          {closingId === t.id ? '…' : 'Cerrar ✓'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <QuickEventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={refresh}
        defaultDate={toYMD(activeDay)}
        defaultAssignee={ALMACEN_RECEPTOR_EMAIL}
      />
    </div>
  )
}
