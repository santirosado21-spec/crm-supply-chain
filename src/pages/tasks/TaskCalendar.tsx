import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { Spinner } from '../../components/ui/Spinner'
import { useTasks } from '../../hooks/useTasks'
import { useAuthContext } from '../../context/AuthContext'
import { TASK_STATUS_COLOR, DAY_OF_WEEK_LABEL, type Task } from '../../types/tasks'

function startOfWeek(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0)
  r.setDate(r.getDate() - r.getDay()); return r
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function sameDate(a: Date, b: Date): boolean { return a.toDateString() === b.toDateString() }

export function TaskCalendar() {
  const { user } = useAuthContext()
  const email = user?.email ?? ''
  const { tasks, loading, list } = useTasks()

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  const [activeDay, setActiveDay] = useState<Date>(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0); return t
  })
  // Calendario global: por default se ven TODAS las tareas del equipo.
  // El toggle "Mías" filtra (cliente-side) a las que me involucran.
  const [viewMode, setViewMode] = useState<'todas' | 'mias'>('todas')

  useEffect(() => {
    if (!email) return
    const from = weekStart.toISOString()
    const to = addDays(weekStart, 7).toISOString()
    // Sin forEmail → trae TODAS las tareas del rango. La RLS ya permite
    // SELECT global a cualquier miembro activo del equipo.
    list({ fromDate: from, toDate: to })
  }, [email, weekStart, list])

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )

  const isMine = (t: Task) => t.assignee_email === email || t.assigner_email === email

  const visibleTasks = useMemo(
    () => (viewMode === 'mias' ? tasks.filter(isMine) : tasks),
    [tasks, viewMode, email],
  )

  const dayTasks = useMemo(() => {
    return visibleTasks
      .filter(t => sameDate(new Date(t.scheduled_start), activeDay))
      .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime())
  }, [visibleTasks, activeDay])

  const tasksByDay = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of visibleTasks) {
      const k = new Date(t.scheduled_start).toDateString()
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(t)
    }
    return m
  }, [visibleTasks])

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h1 className="text-xl font-bold text-[#1e3a5f]">Calendario</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {viewMode === 'todas'
                  ? 'Calendario global — todas las tareas del equipo'
                  : 'Mis tareas (asignadas y enviadas)'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Toggle global / mías */}
              <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode('todas')}
                  className={`px-3 py-2.5 text-xs font-semibold transition-colors ${
                    viewMode === 'todas' ? 'bg-[#1e3a5f] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('mias')}
                  className={`px-3 py-2.5 text-xs font-semibold transition-colors ${
                    viewMode === 'mias' ? 'bg-[#1e3a5f] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Mías
                </button>
              </div>
              <Link
                to="/tasks/new"
                className="inline-flex items-center justify-center gap-2 bg-[#1e3a5f] hover:opacity-90 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-opacity"
              >
                <Plus size={16} /> Nueva tarea
              </Link>
            </div>
          </div>

          {/* Week navigator */}
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

            <div className="grid grid-cols-7 gap-1 p-2 sm:p-3">
              {days.map(d => {
                const isActive = sameDate(d, activeDay)
                const isToday = sameDate(d, new Date())
                const count = (tasksByDay.get(d.toDateString()) ?? []).length
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

          {/* Day view */}
          {loading && (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
              <Spinner size={20} /> Cargando...
            </div>
          )}

          {!loading && dayTasks.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-12 text-center">
              <p className="text-sm text-gray-400">Sin tareas para este día</p>
            </div>
          )}

          <div className="space-y-2">
            {dayTasks.map(t => {
              const start = new Date(t.scheduled_start)
              const end   = new Date(t.scheduled_end)
              const fmt = (d: Date) => d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
              const mine = isMine(t)
              // Mía: muestra contraparte (← quien me la mandó, → a quien se la mandé).
              // Ajena: muestra el par assigner → assignee completo.
              const relation = mine
                ? (t.assignee_email === email ? `← ${t.assigner_email}` : `→ ${t.assignee_email}`)
                : `${t.assigner_email} → ${t.assignee_email}`
              return (
                <Link
                  key={t.id}
                  to={`/tasks/${t.id}`}
                  className={`block bg-white rounded-xl shadow-sm hover:shadow-md transition-all p-3 sm:p-4 ${
                    mine ? 'border border-gray-100' : 'border border-gray-100 opacity-75'
                  }`}
                  style={{ borderLeft: `${mine ? 5 : 3}px solid ${mine ? TASK_STATUS_COLOR[t.status] : '#cbd5e1'}` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        {fmt(start)} – {fmt(end)} · {t.ref ?? ''}
                      </p>
                      <h3 className="text-sm font-semibold text-gray-900 mt-0.5 truncate">{t.title}</h3>
                      <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                        {relation}{t.client?.name ? ` · ${t.client.name}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{ background: `${TASK_STATUS_COLOR[t.status]}1a`, color: TASK_STATUS_COLOR[t.status] }}
                      >
                        {t.status}
                      </span>
                      {!mine && (
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                          solo lectura
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </main>
      </div>
    </div>
  )
}
