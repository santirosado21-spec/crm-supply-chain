import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { useWarehouseTasks } from '../../hooks/useWarehouseTasks'
import { AREA_LABEL, AREA_COLOR } from '../../types/pizarron'
import { Clock, CheckCircle2, User } from 'lucide-react'

/*
  Vista "Hoy" — lista de prioridades del día para almacén.
  Inspirado en Real-Time Status Dashboards de Blue Yonder WLM: una vista
  prioritizada (no kanban) sobre las warehouse_tasks activas, pensada para
  que Guillermo y el equipo arranquen el turno revisando "qué sigue".
*/
export function HoyPage() {
  const { tasks, loading } = useWarehouseTasks()

  // Orden: en progreso primero, luego por prioridad asc (1 = más alta),
  // luego por antigüedad.
  const sorted = [...tasks].sort((a, b) => {
    const aActive = a.taken_by_email || a.taken_by_name ? 0 : 1
    const bActive = b.taken_by_email || b.taken_by_name ? 0 : 1
    if (aActive !== bActive) return aActive - bActive
    if (a.priority !== b.priority) return (a.priority ?? 99) - (b.priority ?? 99)
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  const counts = {
    pending:    tasks.filter(t => !t.taken_by_email && !t.taken_by_name).length,
    inProgress: tasks.filter(t => (t.taken_by_email || t.taken_by_name) && !t.completed_at).length,
  }

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-6">
          <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-[#1e3a5f]">Hoy</h1>
              <p className="text-sm text-gray-500 mt-1">
                Lista de prioridades del día — tareas activas del CEDIS ordenadas por urgencia
              </p>
            </div>
            <div className="flex items-center gap-2">
              <CountPill label="Pendientes" value={counts.pending}   color="#d97706" icon={Clock} />
              <CountPill label="En progreso" value={counts.inProgress} color="#1d4ed8" icon={User} />
            </div>
          </div>

          {loading && <p className="text-sm text-gray-500">Cargando...</p>}

          {!loading && sorted.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
              <CheckCircle2 size={40} className="mx-auto text-green-500 mb-3" />
              <p className="text-base font-semibold text-gray-800">No hay tareas activas</p>
              <p className="text-sm text-gray-500 mt-1">
                Cuando entren solicitudes nuevas o se asignen, aparecerán aquí ordenadas por prioridad.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {sorted.map(t => {
              const inProgress = !!(t.taken_by_email || t.taken_by_name)
              const areaColor = AREA_COLOR[t.area] ?? '#94a3b8'
              return (
                <div
                  key={t.id}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-start gap-3"
                >
                  <div
                    className="w-1 self-stretch min-h-[3rem] rounded-full shrink-0"
                    style={{ background: areaColor }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                        style={{ background: areaColor + '15', color: areaColor }}
                      >
                        {AREA_LABEL[t.area] ?? t.area}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">
                        Prioridad {t.priority ?? '—'}
                      </span>
                      {inProgress && (
                        <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                          En progreso
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {t.task?.title ?? 'Tarea de almacén'}
                    </p>
                    {t.notes && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{t.notes}</p>
                    )}
                    {inProgress && (t.taken_by_name || t.taken_by_email) && (
                      <p className="text-[11px] text-gray-500 mt-1 inline-flex items-center gap-1">
                        <User size={11} />
                        {t.taken_by_name ?? t.taken_by_email}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </main>
      </div>
    </div>
  )
}

function CountPill({
  label, value, color, icon: Icon,
}: {
  label: string
  value: number
  color: string
  icon: typeof Clock
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-gray-100">
      <Icon size={14} style={{ color }} />
      <span className="text-xs text-gray-500">{label}:</span>
      <span className="text-sm font-bold" style={{ color }}>{value}</span>
    </div>
  )
}
