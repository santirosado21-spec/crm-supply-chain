import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, CheckCircle2, LayoutGrid, AlignJustify, ListChecks, Filter, X, Inbox, Warehouse } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Spinner } from '../../components/ui/Spinner'
import { MonthGrid } from '../../components/agenda/MonthGrid'
import { TaskTraceabilityPanel } from '../../components/tasks/TaskTraceabilityPanel'
import { TaskInboxPanel } from '../../components/tasks/TaskInboxPanel'
import { WarehouseOperativoPanel } from '../../components/agenda/WarehouseOperativoPanel'
import { TaskRouteLabel } from '../../components/tasks/TaskRouteLabel'
import { useTasks } from '../../hooks/useTasks'
import { useTaskTags } from '../../hooks/useTaskTags'
import { useClients } from '../../hooks/useClients'
import { useTeamMembers } from '../../hooks/useTeamMembers'
import { useToast } from '../../hooks/useToast'
import { useAuthContext } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { TASK_STATUS_COLOR, DAY_OF_WEEK_LABEL, TAG_DIMENSIONS, type TagDimension, type Task } from '../../types/tasks'

const EMPTY_FILTERS: Record<TagDimension, string> = {
  movimiento: '', area: '', actividad: '', prioridad: '', proveedor: '',
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function startOfWeek(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0)
  r.setDate(r.getDate() - r.getDay()); return r
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function sameDate(a: Date, b: Date): boolean { return a.toDateString() === b.toDateString() }
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
}

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

// ─── componente ──────────────────────────────────────────────────────────────

export function AgendaPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuthContext()
  const email = user?.email ?? ''
  const { tasks, loading, list } = useTasks()
  const { byEmail } = useTeamMembers()
  const toast = useToast()

  // Solo almacén y admin ven el calendario "Operativo" (el General acotado a almacén).
  const canSeeOperativo = user?.role === 'almacen' || user?.role === 'admin'

  // ── Vista: semana (lista), mes (grid), tareas (trazabilidad), bandeja (inbox)
  // u operativo (solo almacén/admin). ?vista=bandeja|operativo abre directo.
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'list' | 'inbox' | 'operativo'>(
    () => {
      const v = searchParams.get('vista')
      if (v === 'bandeja') return 'inbox'
      if (v === 'operativo') return 'operativo'
      return 'week'
    },
  )

  // Guardarraíl: si cae en operativo sin permiso, regresa a semana.
  useEffect(() => {
    if (viewMode === 'operativo' && !canSeeOperativo) setViewMode('week')
  }, [viewMode, canSeeOperativo])

  // ── Estado vista semana
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))

  // ── Estado vista mes
  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(new Date()))

  // ── Día activo (compartido entre ambas vistas)
  const [activeDay, setActiveDay] = useState<Date>(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0); return t
  })

  const [refetchKey, setRefetchKey] = useState(0)
  const [closingId, setClosingId]   = useState<string | null>(null)

  // ── Filtros por etiqueta (Calendario General) ──
  const { byDimension } = useTaskTags()
  const { clients, getClients } = useClients()
  const [showFilters, setShowFilters] = useState(true)
  const [filters, setFilters] = useState<Record<TagDimension, string>>(EMPTY_FILTERS)
  const [clientFilter, setClientFilter] = useState('')

  useEffect(() => { getClients() }, [getClients])

  const activeFilterCount =
    TAG_DIMENSIONS.filter(d => filters[d.code]).length + (clientFilter ? 1 : 0)
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setClientFilter('') }

  const refresh = useCallback(() => setRefetchKey(k => k + 1), [])

  useEffect(() => {
    if (!email) return
    if (viewMode === 'list' || viewMode === 'inbox' || viewMode === 'operativo') return // estos paneles cargan sus propios datos
    if (viewMode === 'week') {
      list({
        fromDate: weekStart.toISOString(),
        toDate: addDays(weekStart, 7).toISOString(),
      })
    } else {
      // Mes completo — del día 1 al día 1 del mes siguiente
      const next = new Date(currentMonth)
      next.setMonth(next.getMonth() + 1)
      list({ fromDate: currentMonth.toISOString(), toDate: next.toISOString() })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, weekStart, currentMonth, viewMode, refetchKey])

  // Al cambiar a vista mes, sincronizar currentMonth con el mes de activeDay
  function switchToMonth() {
    setCurrentMonth(startOfMonth(activeDay))
    setViewMode('month')
  }

  function prevMonth() {
    setCurrentMonth(m => { const n = new Date(m); n.setMonth(n.getMonth() - 1); return n })
  }
  function nextMonth() {
    setCurrentMonth(m => { const n = new Date(m); n.setMonth(n.getMonth() + 1); return n })
  }

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )

  const visibleTasks = useMemo(
    () => tasks.filter(t => {
      if (t.status === 'cancelada') return false
      // Filtros por etiqueta: la tarea debe tener el tag elegido en cada dimensión activa.
      for (const dim of TAG_DIMENSIONS) {
        const wanted = filters[dim.code]
        if (wanted && !(t.tags ?? []).some(tag => tag.id === wanted)) return false
      }
      if (clientFilter && t.client_id !== clientFilter) return false
      return true
    }),
    [tasks, filters, clientFilter],
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
    if (!window.confirm('¿Cerrar esta tarea?')) return
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
  const isMine = (t: Task) => t.assignee_email === email || t.assigner_email === email

  // Panel de filtros por etiqueta (Departamento, Movimiento, etc.) — se muestra
  // como columna izquierda en las vistas de calendario (semana / mes).
  const filtersPanel = (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 inline-flex items-center gap-1.5">
          <Filter size={13} /> Filtros
        </p>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-[#c8373c]"
          >
            <X size={12} /> Limpiar
          </button>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {TAG_DIMENSIONS.map(dim => (
          <div key={dim.code}>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{dim.label}</label>
            <select
              value={filters[dim.code]}
              onChange={e => setFilters(f => ({ ...f, [dim.code]: e.target.value }))}
              className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none bg-white"
            >
              <option value="">Todas</option>
              {(byDimension[dim.code] ?? []).map(tag => (
                <option key={tag.id} value={tag.id}>{tag.label}</option>
              ))}
            </select>
          </div>
        ))}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Cliente</label>
          <select
            value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}
            className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none bg-white"
          >
            <option value="">Todos</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} · ` : ''}{c.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-4 sm:p-6">

          {/* ── Header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h1 className="text-xl font-bold text-[#1e3a5f]">Calendario General</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Calendario global — todas las actividades del equipo
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Toggle vista semana / mes */}
              <div className="flex items-center gap-0.5 bg-gray-100 rounded-xl p-1">
                <button
                  type="button"
                  title="Vista semana"
                  onClick={() => setViewMode('week')}
                  className={`p-2 rounded-lg transition-all ${
                    viewMode === 'week'
                      ? 'bg-white shadow-sm text-[#1e3a5f]'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <AlignJustify size={15} />
                </button>
                <button
                  type="button"
                  title="Vista mes"
                  onClick={switchToMonth}
                  className={`p-2 rounded-lg transition-all ${
                    viewMode === 'month'
                      ? 'bg-white shadow-sm text-[#1e3a5f]'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <LayoutGrid size={15} />
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
                <button
                  type="button"
                  title="Bandeja — mis tareas recibidas y enviadas"
                  onClick={() => setViewMode('inbox')}
                  className={`p-2 rounded-lg transition-all ${
                    viewMode === 'inbox'
                      ? 'bg-white shadow-sm text-[#1e3a5f]'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <Inbox size={15} />
                </button>
                {canSeeOperativo && (
                  <button
                    type="button"
                    title="Operativo — solo actividades de almacén"
                    onClick={() => setViewMode('operativo')}
                    className={`p-2 rounded-lg transition-all ${
                      viewMode === 'operativo'
                        ? 'bg-white shadow-sm text-[#1e3a5f]'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <Warehouse size={15} />
                  </button>
                )}
              </div>

              {(viewMode === 'week' || viewMode === 'month') && (
                <button
                  type="button"
                  onClick={() => setShowFilters(s => !s)}
                  className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2.5 rounded-xl border transition-colors ${
                    showFilters || activeFilterCount > 0
                      ? 'border-[#1e3a5f] text-[#1e3a5f] bg-blue-50'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Filter size={15} /> Filtros
                  {activeFilterCount > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#1e3a5f] text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => navigate('/calendario/nueva')}
                className="inline-flex items-center justify-center gap-2 bg-[#1e3a5f] hover:opacity-90 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-opacity"
              >
                <Plus size={16} /> Nueva tarea
              </button>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════
              VISTA TAREAS (trazabilidad — pendientes y cerradas)
          ════════════════════════════════════════════════════════════ */}
          {viewMode === 'list' && (
            <TaskTraceabilityPanel onChanged={refresh} />
          )}

          {/* ════════════════════════════════════════════════════════════
              VISTA BANDEJA (inbox personal — recibidas y enviadas)
          ════════════════════════════════════════════════════════════ */}
          {viewMode === 'inbox' && (
            <TaskInboxPanel />
          )}

          {/* ════════════════════════════════════════════════════════════
              VISTA OPERATIVO (Calendario General acotado a almacén)
          ════════════════════════════════════════════════════════════ */}
          {viewMode === 'operativo' && canSeeOperativo && (
            <WarehouseOperativoPanel />
          )}

          {/* ════════════════════════════════════════════════════════════
              VISTAS CALENDARIO (mes / semana) — filtros en columna izquierda
          ════════════════════════════════════════════════════════════ */}
          {(viewMode === 'week' || viewMode === 'month') && (
            <div className="flex flex-col lg:flex-row gap-4">
              {showFilters && (
                <aside className="lg:w-60 lg:shrink-0">
                  {filtersPanel}
                </aside>
              )}
              <div className="min-w-0 flex-1">

          {/* ── VISTA MES ── */}
          {viewMode === 'month' && (
            <>
              {/* Navegador de mes */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-3">
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    type="button"
                    onClick={prevMonth}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                    aria-label="Mes anterior"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <p className="text-sm font-bold text-gray-700">
                    {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                  </p>
                  <button
                    type="button"
                    onClick={nextMonth}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                    aria-label="Mes siguiente"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                  <Spinner size={20} /> Cargando...
                </div>
              ) : (
                <MonthGrid
                  tasks={visibleTasks}
                  month={currentMonth}
                  activeDay={activeDay}
                  onDayClick={setActiveDay}
                />
              )}

              {/* Lista del día seleccionado (debajo del grid) */}
              {dayTasks.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                    {activeDay.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  {dayTasks.map(t => {
                    const start    = new Date(t.scheduled_start)
                    const end      = new Date(t.scheduled_end)
                    const mine     = isMine(t)
                    const done     = t.status === 'finalizada'
                    const canClose = !done && t.status !== 'cancelada' && t.assignee_email === email
                    return (
                      <div
                        key={t.id}
                        onClick={() => navigate(`/calendario/${t.id}`)}
                        className={`bg-white rounded-xl shadow-sm p-3 sm:p-4 border border-gray-100 transition-opacity cursor-pointer hover:border-gray-200 ${done ? 'opacity-60' : ''}`}
                        style={{ borderLeft: `${mine ? 5 : 3}px solid ${done ? '#28a745' : TASK_STATUS_COLOR[t.status] ?? '#cbd5e1'}` }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                              {fmt(start)} – {fmt(end)}
                            </p>
                            <h3 className={`text-sm font-semibold mt-0.5 truncate ${done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                              {t.title}
                            </h3>
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
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════════════════
              VISTA SEMANA
          ════════════════════════════════════════════════════════════ */}
          {viewMode === 'week' && (
            <>
              {/* Navegador de semana */}
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

              {/* Lista del día */}
              {loading && (
                <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                  <Spinner size={20} /> Cargando...
                </div>
              )}

              {!loading && dayTasks.length === 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-12 text-center">
                  <p className="text-sm text-gray-400">Sin actividades para este día</p>
                </div>
              )}

              <div className="space-y-2">
                {dayTasks.map(t => {
                  const start    = new Date(t.scheduled_start)
                  const end      = new Date(t.scheduled_end)
                  const mine     = isMine(t)
                  const done     = t.status === 'finalizada'
                  const canClose = !done && t.status !== 'cancelada' && t.assignee_email === email
                  return (
                    <div
                      key={t.id}
                      onClick={() => navigate(`/calendario/${t.id}`)}
                      className={`bg-white rounded-xl shadow-sm p-3 sm:p-4 border border-gray-100 transition-opacity cursor-pointer hover:border-gray-200 ${
                        done ? 'opacity-60' : ''
                      }`}
                      style={{ borderLeft: `${mine ? 5 : 3}px solid ${done ? '#28a745' : TASK_STATUS_COLOR[t.status] ?? '#cbd5e1'}` }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                            {fmt(start)} – {fmt(end)}{t.ref ? ` · ${t.ref}` : ''}
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
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
