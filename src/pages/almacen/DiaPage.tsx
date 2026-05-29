import { useMemo, useState } from 'react'
import {
  Calendar, Clock, GripVertical, Loader2, AlertTriangle, PackageCheck, User,
} from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { useWarehouseTasks } from '../../hooks/useWarehouseTasks'
import { useToast } from '../../hooks/useToast'
import {
  AREA_COLOR, AREA_LABEL, type WarehouseTask,
} from '../../types/pizarron'

const DAY_START_HOUR = 6   // 06:00
const DAY_END_HOUR   = 18  // 18:00
const SLOT_MIN       = 30
const SLOT_PX        = 36  // altura visual de un slot de 30 min
const TOTAL_MIN      = (DAY_END_HOUR - DAY_START_HOUR) * 60
const TOTAL_SLOTS    = TOTAL_MIN / SLOT_MIN

function minutesFromDayStart(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes() - DAY_START_HOUR * 60
}

function formatHHMM(hour: number, min: number): string {
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function isToday(iso: string | null): boolean {
  if (!iso) return false
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() &&
         d.getMonth() === now.getMonth() &&
         d.getDate() === now.getDate()
}

export function DiaPage() {
  const { tasks, loading, error, reorderPriority } = useWarehouseTasks()
  const toast = useToast()
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // Solo tareas del día actual o sin fecha (backlog).
  const dayTasks = useMemo(
    () => tasks.filter(t => !t.scheduled_start || isToday(t.scheduled_start)),
    [tasks],
  )

  const scheduled = useMemo(
    () => dayTasks
      .filter(t => t.scheduled_start)
      .sort((a, b) => new Date(a.scheduled_start!).getTime() - new Date(b.scheduled_start!).getTime()),
    [dayTasks],
  )

  const prioritized = useMemo(
    () => [...dayTasks].sort((a, b) => a.priority - b.priority),
    [dayTasks],
  )

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', day: '2-digit', month: 'long',
  })

  const handleDragStart = (id: string) => setDragId(id)
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (dragId && id !== dragId) setDragOverId(id)
  }
  const handleDragLeave = () => setDragOverId(null)

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    const sourceId = dragId
    setDragId(null)
    setDragOverId(null)
    if (!sourceId || sourceId === targetId) return

    // Inserción lexicográfica: nueva priority = promedio entre vecinos del target.
    const ordered = prioritized.filter(t => t.id !== sourceId)
    const targetIdx = ordered.findIndex(t => t.id === targetId)
    if (targetIdx === -1) return

    const prev = ordered[targetIdx - 1]
    const target = ordered[targetIdx]
    // Soltar SOBRE el target = colocar justo antes (asume drop top-half UX).
    const newPriority = prev
      ? (prev.priority + target.priority) / 2.0
      : target.priority - 1.0

    try {
      await reorderPriority(sourceId, newPriority)
    } catch (err) {
      toast.error('No se pudo reordenar', err instanceof Error ? err.message : String(err))
    }
  }

  // ── Renderers ────────────────────────────────────────────────────────────
  const renderTimeline = () => {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
          <Clock size={14} className="text-gray-400" />
          <p className="text-xs font-semibold text-gray-600">
            Timeline · {DAY_START_HOUR}:00 → {DAY_END_HOUR}:00
          </p>
          <span className="text-[10px] text-gray-400 ml-auto">{scheduled.length} agendadas</span>
        </div>

        <div className="relative" style={{ height: TOTAL_SLOTS * SLOT_PX, minHeight: 400 }}>
          {/* Grid de fondo (filas de 30 min) */}
          {Array.from({ length: TOTAL_SLOTS + 1 }).map((_, i) => {
            const totalMin = i * SLOT_MIN
            const hour = DAY_START_HOUR + Math.floor(totalMin / 60)
            const min = totalMin % 60
            const isFullHour = min === 0
            return (
              <div
                key={i}
                className={`absolute left-0 right-0 border-t ${isFullHour ? 'border-gray-200' : 'border-gray-50'}`}
                style={{ top: i * SLOT_PX }}
              >
                {isFullHour && (
                  <span className="absolute -top-2.5 left-2 text-[10px] font-mono text-gray-400 bg-white px-1">
                    {formatHHMM(hour, min)}
                  </span>
                )}
              </div>
            )
          })}

          {/* Bloques de tareas agendadas */}
          {scheduled.map(t => {
            const startMin = minutesFromDayStart(t.scheduled_start!)
            // Duración: scheduled_end si existe, si no estimated_duration_min, fallback 30 min.
            let durationMin = 30
            if (t.scheduled_end) {
              durationMin = Math.max(15, (new Date(t.scheduled_end).getTime() - new Date(t.scheduled_start!).getTime()) / 60000)
            } else if (t.estimated_duration_min && t.estimated_duration_min > 0) {
              durationMin = t.estimated_duration_min
            }
            const topPx    = (startMin / SLOT_MIN) * SLOT_PX
            const heightPx = Math.max(20, (durationMin / SLOT_MIN) * SLOT_PX - 2)
            const color    = AREA_COLOR[t.area]
            const activeTakers = (t.takers ?? []).filter(x => x.ended_at === null)

            // Si el bloque está fuera del rango visible, skip
            if (topPx < 0 || topPx > TOTAL_SLOTS * SLOT_PX) return null

            return (
              <div
                key={t.id}
                className="absolute left-16 right-3 rounded-md border-l-4 shadow-sm px-2 py-1 overflow-hidden text-[11px]"
                style={{
                  top: topPx,
                  height: heightPx,
                  borderLeftColor: color,
                  background: `${color}1a`,
                }}
                title={t.task?.title ?? 'Tarea de almacén'}
              >
                <p className="font-bold text-gray-800 truncate">
                  {t.task?.title ?? 'Tarea'}
                </p>
                <p className="text-gray-500 truncate">
                  {AREA_LABEL[t.area]}
                  {activeTakers.length > 0 && (
                    <> · {activeTakers.map(x => x.taker_name).join(', ')}</>
                  )}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderListItem = (t: WarehouseTask) => {
    const color = AREA_COLOR[t.area]
    const activeTakers = (t.takers ?? []).filter(x => x.ended_at === null)
    const isOver = dragOverId === t.id
    return (
      <div
        key={t.id}
        draggable
        onDragStart={() => handleDragStart(t.id)}
        onDragOver={e => handleDragOver(e, t.id)}
        onDragLeave={handleDragLeave}
        onDrop={e => handleDrop(e, t.id)}
        onDragEnd={() => { setDragId(null); setDragOverId(null) }}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border bg-white cursor-grab active:cursor-grabbing ${isOver ? 'border-[#1e3a5f] shadow-md ring-2 ring-[#1e3a5f]/10' : 'border-gray-100'} ${dragId === t.id ? 'opacity-40' : ''}`}
      >
        <GripVertical size={14} className="text-gray-300 shrink-0" />
        <span
          className="inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase text-white shrink-0"
          style={{ background: color }}
        >
          {AREA_LABEL[t.area]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">
            {t.task?.title ?? 'Tarea de almacén'}
          </p>
          <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
            <Clock size={11} />
            {t.scheduled_start
              ? new Date(t.scheduled_start).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
              : 'Sin agendar'}
            {t.estimated_duration_min && <> · ~{t.estimated_duration_min} min</>}
            {activeTakers.length > 0 && (
              <span className="inline-flex items-center gap-0.5 ml-1 text-[#1e3a5f] font-semibold">
                <User size={10} /> {activeTakers.map(x => x.taker_name).join(', ')}
              </span>
            )}
          </p>
        </div>
        <span className="text-[10px] font-mono text-gray-400 shrink-0">#{Math.round(t.priority)}</span>
      </div>
    )
  }

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="mb-5">
            <h1 className="text-xl font-bold text-[#1e3a5f] flex items-center gap-2">
              <Calendar size={20} /> Día de almacén
            </h1>
            <p className="text-xs text-gray-400 mt-0.5 capitalize">
              {today} · {dayTasks.length} tarea{dayTasks.length === 1 ? '' : 's'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" /> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-blue-600">
              <Loader2 size={20} className="animate-spin" /> Cargando…
            </div>
          ) : dayTasks.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
              <PackageCheck size={36} className="text-gray-300 mx-auto mb-3" />
              <p className="font-semibold text-gray-700 text-sm">Sin tareas para hoy</p>
              <p className="text-xs text-gray-400 mt-1">
                Las tareas agendadas aparecerán acá automáticamente.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3">{renderTimeline()}</div>
              <div className="lg:col-span-2">
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                    <p className="text-xs font-semibold text-gray-600">
                      Prioridades · arrastra para reordenar
                    </p>
                  </div>
                  <div className="p-3 space-y-2 max-h-[70vh] overflow-y-auto">
                    {prioritized.map(renderListItem)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
