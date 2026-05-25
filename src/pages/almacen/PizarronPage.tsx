import { useEffect, useState } from 'react'
import { Clock, Loader2, CheckCircle2 } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { PizarronBoard } from '../../components/almacen/PizarronBoard'
import { useWarehouseTasks } from '../../hooks/useWarehouseTasks'
import { supabase } from '../../lib/supabase'

/*
  Pizarrón de Operaciones — vista del board con contadores en vivo
  (Real-Time Status de Blue Yonder WLM).
*/
export function PizarronPage() {
  const { tasks } = useWarehouseTasks()
  const [completedToday, setCompletedToday] = useState(0)

  // Contador "completadas hoy" — query separada (useWarehouseTasks solo trae
  // las no-completadas). Subscripción a warehouse_tasks para refrescar live.
  useEffect(() => {
    const refresh = async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const { count } = await supabase
        .from('warehouse_tasks')
        .select('id', { count: 'exact', head: true })
        .gte('completed_at', start.toISOString())
      setCompletedToday(count ?? 0)
    }
    refresh()
    const channel = supabase
      .channel('warehouse-tasks-completed-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_tasks' }, () => {
        refresh()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const pending    = tasks.filter(t => !t.taken_at).length
  const inProgress = tasks.filter(t => t.taken_at && !t.completed_at).length

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-6">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <CountPill label="Pendientes"      value={pending}        color="#d97706" icon={Clock} />
            <CountPill label="En progreso"     value={inProgress}     color="#1d4ed8" icon={Loader2} />
            <CountPill label="Completadas hoy" value={completedToday} color="#16a34a" icon={CheckCircle2} />
          </div>
          <PizarronBoard />
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
      <span className="text-sm font-bold tabular-nums" style={{ color }}>{value}</span>
    </div>
  )
}
