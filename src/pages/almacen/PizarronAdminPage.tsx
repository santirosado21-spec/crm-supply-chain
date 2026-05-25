import { useCallback, useEffect, useState } from 'react'
import {
  BarChart3, Loader2, AlertTriangle, Lock, Plus, Monitor, CheckCircle2,
} from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { supabase } from '../../lib/supabase'
import { useAuthContext } from '../../context/AuthContext'
import { useToast } from '../../hooks/useToast'
import {
  WAREHOUSE_AREAS, AREA_LABEL, AREA_COLOR, type WarehouseArea, type WarehouseTask,
} from '../../types/pizarron'

interface AcceptedTask {
  id: string
  ref: string | null
  title: string
}

function todayRange() {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export function PizarronAdminPage() {
  const { user } = useAuthContext()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'

  const [canDistribute, setCanDistribute] = useState<boolean | null>(null)
  const [acceptedTasks, setAcceptedTasks] = useState<AcceptedTask[]>([])
  const [completed, setCompleted] = useState<WarehouseTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Form
  const [taskId, setTaskId] = useState('')
  const [area, setArea] = useState<WarehouseArea>('picking')
  const [priority, setPriority] = useState(100)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!user?.email) return
    if (isAdmin) { setCanDistribute(true); return }
    supabase
      .from('team_members')
      .select('can_distribute_tasks')
      .eq('user_email', user.email.toLowerCase())
      .maybeSingle()
      .then(({ data }) => setCanDistribute(Boolean(data?.can_distribute_tasks)))
  }, [user?.email, isAdmin])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { start, end } = todayRange()
      const [taskRes, doneRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, ref, title')
          .eq('status', 'aceptada')
          .gte('scheduled_start', start)
          .lt('scheduled_start', end)
          .order('scheduled_start', { ascending: true }),
        supabase
          .from('warehouse_tasks')
          .select('*, task:tasks(title, ref)')
          .gte('completed_at', start)
          .order('completed_at', { ascending: false }),
      ])
      if (taskRes.error) throw taskRes.error
      if (doneRes.error) throw doneRes.error
      setAcceptedTasks((taskRes.data ?? []) as AcceptedTask[])
      setCompleted((doneRes.data ?? []) as unknown as WarehouseTask[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleCreate = async () => {
    if (!taskId) {
      toast.error('Selecciona una tarea', 'Elige la tarea aceptada que entra al pizarrón.')
      return
    }
    setCreating(true)
    try {
      const { error: err } = await supabase
        .from('warehouse_tasks')
        .insert({ task_id: taskId, area, priority })
      if (err) throw err
      toast.success('Tarea agregada al pizarrón', `${AREA_LABEL[area]} · prioridad ${priority}.`)
      setTaskId('')
      setPriority(100)
      fetchData()
    } catch (e) {
      toast.error('No se pudo crear', e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  // Stats
  const durations = completed
    .filter(t => t.taken_at && t.completed_at)
    .map(t => (new Date(t.completed_at!).getTime() - new Date(t.taken_at!).getTime()) / 60000)
  const avgMinutes = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0
  const byPicker = completed.reduce<Record<string, number>>((acc, t) => {
    const name = t.taken_by_name || '—'
    acc[name] = (acc[name] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-6">
          <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-[#1e3a5f] flex items-center gap-2">
                <BarChart3 size={20} /> Pizarrón · Administración
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Agrega tareas al pizarrón y revisa el desempeño del día.
              </p>
            </div>
            <a
              href="/almacen/pizarron-kiosk"
              target="_blank"
              rel="noreferrer"
              className="h-10 px-4 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 flex items-center gap-2 hover:bg-gray-50"
            >
              <Monitor size={16} /> Ver Kiosk
            </a>
          </div>

          {canDistribute === false && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
              <Lock size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-700">Acceso restringido</p>
              <p className="text-xs text-gray-400 mt-1">
                Solo distribuidores o administradores pueden administrar el pizarrón.
              </p>
            </div>
          )}

          {canDistribute && (
            <>
              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
                  <AlertTriangle size={16} className="shrink-0" /> {error}
                </div>
              )}

              {/* Crear warehouse_task */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">Agregar tarea al pizarrón</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                      Tarea aceptada (hoy)
                    </label>
                    <select
                      value={taskId}
                      onChange={e => setTaskId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                    >
                      <option value="">— Selecciona —</option>
                      {acceptedTasks.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.ref ? `${t.ref} · ` : ''}{t.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Área</label>
                    <select
                      value={area}
                      onChange={e => setArea(e.target.value as WarehouseArea)}
                      className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                    >
                      {WAREHOUSE_AREAS.map(a => (
                        <option key={a} value={a}>{AREA_LABEL[a]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                      Prioridad: <span className="font-mono">{priority}</span>
                      <span className="text-[10px] font-normal text-gray-400 ml-1">(menor = primero)</span>
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={200}
                      value={priority}
                      onChange={e => setPriority(Number(e.target.value))}
                      className="w-full accent-[#1e3a5f] mt-2"
                    />
                  </div>
                </div>
                <button
                  onClick={handleCreate}
                  disabled={creating || !taskId}
                  className="mt-4 h-10 px-5 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#16304d] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                  Agregar al pizarrón
                </button>
                {acceptedTasks.length === 0 && !loading && (
                  <p className="text-[11px] text-amber-600 mt-2 flex items-center gap-1">
                    <AlertTriangle size={11} /> No hay tareas aceptadas programadas para hoy.
                  </p>
                )}
              </div>

              {/* Stats del día */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Completadas hoy</p>
                  <p className="text-2xl font-bold text-[#1e3a5f] mt-1">{completed.length}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Tiempo promedio</p>
                  <p className="text-2xl font-bold text-[#1e3a5f] mt-1">{avgMinutes} min</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Pickers activos</p>
                  <p className="text-2xl font-bold text-[#1e3a5f] mt-1">{Object.keys(byPicker).length}</p>
                </div>
              </div>

              {/* Distribución por picker */}
              {Object.keys(byPicker).length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
                  <p className="text-sm font-bold text-gray-700 mb-2">Distribución por picker</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(byPicker)
                      .sort((a, b) => b[1] - a[1])
                      .map(([name, count]) => (
                        <span key={name} className="inline-flex items-center gap-1.5 text-xs bg-gray-50 border border-gray-100 rounded-full px-3 py-1">
                          <span className="font-semibold text-gray-700">{name}</span>
                          <span className="font-bold text-[#1e3a5f]">{count}</span>
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* Lista completadas */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                  <p className="text-xs font-semibold text-gray-600">Completadas hoy ({completed.length})</p>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-blue-600">
                    <Loader2 size={16} className="animate-spin" /> Cargando…
                  </div>
                ) : completed.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-10">Aún no hay tareas completadas hoy.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Tarea</th>
                        <th className="text-left px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider w-32">Área</th>
                        <th className="text-left px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider w-40">Picker</th>
                        <th className="text-right px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider w-24">Duración</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completed.map(t => {
                        const mins = t.taken_at && t.completed_at
                          ? Math.round((new Date(t.completed_at).getTime() - new Date(t.taken_at).getTime()) / 60000)
                          : null
                        return (
                          <tr key={t.id} className="border-b border-gray-50">
                            <td className="px-4 py-2.5 text-gray-700">{t.task?.title ?? '—'}</td>
                            <td className="px-4 py-2.5">
                              <span
                                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                                style={{ background: AREA_COLOR[t.area] }}
                              >
                                {AREA_LABEL[t.area]}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-gray-600">{t.taken_by_name ?? '—'}</td>
                            <td className="px-4 py-2.5 text-right text-gray-600">
                              {mins !== null ? (
                                <span className="inline-flex items-center gap-1">
                                  <CheckCircle2 size={12} className="text-green-500" /> {mins} min
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
