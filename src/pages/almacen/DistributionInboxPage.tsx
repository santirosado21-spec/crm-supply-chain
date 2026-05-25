import { useCallback, useEffect, useState } from 'react'
import { UserCheck, Loader2, AlertTriangle, Inbox, Lock, Calendar } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { supabase } from '../../lib/supabase'
import { useAuthContext } from '../../context/AuthContext'
import { useToast } from '../../hooks/useToast'
import { ALMACEN_RECEPTOR_EMAIL } from '../../config/almacen'

interface InboxTask {
  id: string
  ref: string | null
  title: string
  description: string | null
  scheduled_start: string
  client: { name: string } | null
}

interface AlmacenMember {
  user_email: string
  user_name: string | null
}

const TASK_SELECT = 'id, ref, title, description, scheduled_start, client:clients(name)'

export function DistributionInboxPage() {
  const { user } = useAuthContext()
  const toast = useToast()

  const [tasks, setTasks] = useState<InboxTask[]>([])
  const [members, setMembers] = useState<AlmacenMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [canDistribute, setCanDistribute] = useState<boolean | null>(null)
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const isAdmin = user?.role === 'admin'

  // ¿El usuario puede distribuir?
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
      const [taskRes, memberRes] = await Promise.all([
        supabase
          .from('tasks')
          .select(TASK_SELECT)
          .eq('assignee_email', ALMACEN_RECEPTOR_EMAIL)
          .eq('status', 'propuesta')
          .order('scheduled_start', { ascending: true }),
        supabase
          .from('team_members')
          .select('user_email, user_name')
          .eq('role', 'almacen')
          .eq('active', true)
          .neq('user_email', ALMACEN_RECEPTOR_EMAIL),
      ])
      if (taskRes.error) throw taskRes.error
      if (memberRes.error) throw memberRes.error
      setTasks((taskRes.data ?? []) as unknown as InboxTask[])
      setMembers((memberRes.data ?? []) as AlmacenMember[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar la bandeja de distribución')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Realtime: tareas que entran/salen de la bandeja del receptor.
  useEffect(() => {
    const channel = supabase
      .channel('distribution-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchData()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  const handleReassign = async (taskId: string) => {
    const newAssignee = picked[taskId]
    if (!newAssignee) {
      toast.error('Selecciona un responsable', 'Elige a quién asignar la tarea antes de continuar.')
      return
    }
    setBusy(taskId)
    try {
      const { error: rpcError } = await supabase.rpc('task_reassign', {
        p_task_id: taskId,
        p_new_assignee: newAssignee,
      })
      if (rpcError) throw rpcError
      setTasks(prev => prev.filter(t => t.id !== taskId))
      const member = members.find(m => m.user_email === newAssignee)
      toast.success('Tarea reasignada', `Asignada a ${member?.user_name || newAssignee}.`)
    } catch (e) {
      toast.error('No se pudo reasignar', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-6">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-[#1e3a5f] flex items-center gap-2">
              <UserCheck size={20} /> Distribución de tareas
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Tareas que SAC envió al área de almacén. Asígnalas al miembro del equipo correspondiente.
            </p>
          </div>

          {/* Gating: solo distribuidores / admin */}
          {canDistribute === false && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
              <Lock size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-700">Acceso restringido</p>
              <p className="text-xs text-gray-400 mt-1">
                Solo los distribuidores designados pueden repartir tareas. Pide a un administrador
                que active tu permiso <span className="font-mono">can_distribute_tasks</span>.
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

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-blue-600">
                  <Loader2 size={16} className="animate-spin" /> Cargando bandeja…
                </div>
              ) : tasks.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
                  <Inbox size={32} className="text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-gray-700">Bandeja vacía</p>
                  <p className="text-xs text-gray-400 mt-1">No hay tareas pendientes de distribuir.</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                    <p className="text-xs font-semibold text-gray-600">
                      {tasks.length} tarea{tasks.length === 1 ? '' : 's'} por distribuir
                    </p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Tarea</th>
                        <th className="text-left px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider w-40">Cliente</th>
                        <th className="text-left px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider w-44">Programada</th>
                        <th className="text-left px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider w-80">Asignar a</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map(task => (
                        <tr key={task.id} className="border-b border-gray-50 hover:bg-gray-50/40">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-800">{task.title}</p>
                            {task.ref && <p className="text-[10px] font-mono text-gray-400">{task.ref}</p>}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{task.client?.name ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600">
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              <Calendar size={12} className="text-gray-400" />
                              {new Date(task.scheduled_start).toLocaleString('es-MX', {
                                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <select
                                value={picked[task.id] ?? ''}
                                onChange={e => setPicked(p => ({ ...p, [task.id]: e.target.value }))}
                                className="h-9 px-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 flex-1 min-w-0"
                              >
                                <option value="">— Selecciona —</option>
                                {members.map(m => (
                                  <option key={m.user_email} value={m.user_email}>
                                    {m.user_name || m.user_email}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleReassign(task.id)}
                                disabled={busy === task.id || !picked[task.id]}
                                className="h-9 px-4 rounded-lg bg-[#1e3a5f] text-white text-xs font-medium flex items-center gap-1.5 hover:bg-[#16304d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                              >
                                {busy === task.id
                                  ? <Loader2 size={13} className="animate-spin" />
                                  : <UserCheck size={13} />}
                                Asignar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
