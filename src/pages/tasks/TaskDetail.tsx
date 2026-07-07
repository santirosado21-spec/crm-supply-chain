import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Check, X, Send, MessageSquare, Loader2, Pencil } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { Spinner } from '../../components/ui/Spinner'
import { TaskTimerWidget } from '../../components/tasks/TaskTimerWidget'
import { TaskStatusBadge } from '../../components/tasks/TaskStatusBadge'
import { useTasks } from '../../hooks/useTasks'
import { useAuthContext } from '../../context/AuthContext'
import { useToast } from '../../hooks/useToast'
import { supabase } from '../../lib/supabase'
import type { Task, TaskNote } from '../../types/tasks'

export function TaskDetail() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthContext()
  const myEmail = user?.email ?? ''
  const toast = useToast()
  const { get, updateStatus } = useTasks()

  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<TaskNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [acceptingDuration, setAcceptingDuration] = useState(false)
  const [durationInput, setDurationInput] = useState('')
  const [editingSchedule, setEditingSchedule] = useState(false)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [savingSchedule, setSavingSchedule] = useState(false)

  const reloadTask = async () => {
    try {
      const t = await get(id)
      setTask(t)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    }
  }

  const reloadNotes = async () => {
    const { data } = await supabase
      .from('task_notes')
      .select('*')
      .eq('task_id', id)
      .order('created_at', { ascending: false })
    setNotes((data ?? []) as TaskNote[])
  }

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([reloadTask(), reloadNotes()]).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const isAssignee = task?.assignee_email === myEmail
  const isAssigner = task?.assigner_email === myEmail
  const canControl = isAssignee && task && ['aceptada', 'en_curso', 'pausada'].includes(task.status)

  const confirmAccept = async () => {
    const duration = Number(durationInput)
    if (!durationInput.trim() || !Number.isFinite(duration) || duration <= 0) {
      toast.error('Falta la duración', '¿Cuánto vas a tardar en esta tarea? (minutos)')
      return
    }
    setActionLoading(true)
    try {
      await updateStatus(id, 'aceptada', undefined, duration)
      toast.success('Tarea aceptada')
      setAcceptingDuration(false)
      setDurationInput('')
      await reloadTask()
    } catch (e: unknown) {
      toast.error('No se pudo aceptar', e instanceof Error ? e.message : 'Error')
    } finally { setActionLoading(false) }
  }

  // yyyy-MM-ddTHH:mm en hora local, para precargar <input type="datetime-local">
  const toLocalInputValue = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const openEditSchedule = () => {
    if (!task) return
    setEditStart(toLocalInputValue(new Date(task.scheduled_start)))
    setEditEnd(toLocalInputValue(new Date(task.scheduled_end)))
    setEditingSchedule(true)
  }

  const saveSchedule = async () => {
    if (!editStart || !editEnd) return
    const newStart = new Date(editStart)
    const newEnd = new Date(editEnd)
    if (newEnd <= newStart) {
      toast.error('Horario inválido', 'La hora de fin debe ser posterior al inicio.')
      return
    }
    setSavingSchedule(true)
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ scheduled_start: newStart.toISOString(), scheduled_end: newEnd.toISOString() })
        .eq('id', id)
      if (error) throw error
      toast.success('Horario actualizado')
      setEditingSchedule(false)
      await reloadTask()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      toast.error('No se pudo guardar', msg.includes('tasks_no_overlap')
        ? 'Ese horario traslapa con otra tarea activa de esta persona.'
        : msg)
    } finally {
      setSavingSchedule(false)
    }
  }
  const reject = async () => {
    const reason = window.prompt('Motivo del rechazo (opcional)') ?? ''
    setActionLoading(true)
    try {
      await updateStatus(id, 'rechazada', reason)
      toast.success('Tarea rechazada')
      await reloadTask()
    } catch (e: unknown) {
      toast.error('No se pudo rechazar', e instanceof Error ? e.message : 'Error')
    } finally { setActionLoading(false) }
  }
  const cancel = async () => {
    if (!window.confirm('¿Cancelar esta tarea? Si hay un timer corriendo se detendrá.')) return
    setActionLoading(true)
    try {
      await updateStatus(id, 'cancelada')
      toast.info('Tarea cancelada')
      await reloadTask()
    } catch (e: unknown) {
      toast.error('No se pudo cancelar', e instanceof Error ? e.message : 'Error')
    } finally { setActionLoading(false) }
  }

  const submitNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNote.trim()) return
    setSavingNote(true)
    try {
      await supabase.from('task_notes').insert({
        task_id: id, user_email: myEmail, content: newNote.trim(),
      })
      setNewNote('')
      await reloadNotes()
    } finally {
      setSavingNote(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
        <Header />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center text-gray-400 gap-2">
            <Spinner size={20} /> Cargando tarea...
          </main>
        </div>
      </div>
    )
  }

  if (error || !task) {
    return (
      <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
        <Header />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-500">
            <p>{error ?? 'Tarea no encontrada'}</p>
            <Link to="/tasks" className="text-xs text-[#1e3a5f] underline">Volver a la bandeja</Link>
          </main>
        </div>
      </div>
    )
  }

  const start = new Date(task.scheduled_start)
  const end = new Date(task.scheduled_end)

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-4 sm:p-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#1e3a5f] mb-3"
          >
            <ArrowLeft size={14} /> Volver
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Cabecera + datos */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="h-1 w-full" style={{ background: task.category?.color ?? '#1e3a5f' }} />
                <div className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      {task.ref ?? '—'}
                    </span>
                    <TaskStatusBadge status={task.status} size="md" />
                  </div>

                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">{task.title}</h1>
                  {task.description && (
                    <p className="text-sm text-gray-600 whitespace-pre-line">{task.description}</p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100 text-xs">
                    <div>
                      <p className="font-bold uppercase tracking-wider text-gray-400 mb-0.5">Asignador</p>
                      <p className="text-gray-700">{task.assigner_email}</p>
                    </div>
                    <div>
                      <p className="font-bold uppercase tracking-wider text-gray-400 mb-0.5">Asignada a</p>
                      <p className="text-gray-700">{task.assignee_email}</p>
                    </div>
                    <div>
                      <p className="font-bold uppercase tracking-wider text-gray-400 mb-0.5">Programada</p>
                      {editingSchedule ? (
                        <div className="flex flex-col gap-1.5 mt-1">
                          <input
                            type="datetime-local"
                            value={editStart}
                            onChange={e => setEditStart(e.target.value)}
                            className="h-8 px-2 rounded border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                          />
                          <input
                            type="datetime-local"
                            value={editEnd}
                            onChange={e => setEditEnd(e.target.value)}
                            className="h-8 px-2 rounded border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                          />
                          <div className="flex gap-2 mt-0.5">
                            <button
                              type="button"
                              onClick={() => setEditingSchedule(false)}
                              disabled={savingSchedule}
                              className="text-[11px] font-semibold text-gray-500 hover:text-gray-700"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={saveSchedule}
                              disabled={savingSchedule}
                              className="text-[11px] font-semibold text-[#1e3a5f] hover:underline inline-flex items-center gap-1"
                            >
                              {savingSchedule ? <Loader2 size={11} className="animate-spin" /> : null} Guardar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-700 inline-flex items-center gap-1.5">
                          {start.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                          {' → '}
                          {end.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          {(isAssigner || isAssignee) && (
                            <button
                              type="button"
                              onClick={openEditSchedule}
                              title="Editar horario"
                              className="text-gray-300 hover:text-[#1e3a5f]"
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                        </p>
                      )}
                    </div>
                    {task.client?.name && (
                      <div>
                        <p className="font-bold uppercase tracking-wider text-gray-400 mb-0.5">Cliente</p>
                        <p className="text-gray-700">{task.client.codigo ? `${task.client.codigo} · ` : ''}{task.client.name}</p>
                      </div>
                    )}
                    {task.category?.name && (
                      <div>
                        <p className="font-bold uppercase tracking-wider text-gray-400 mb-0.5">Categoría</p>
                        <p className="text-gray-700">{task.category.name}</p>
                      </div>
                    )}
                    {task.rejection_reason && (
                      <div className="sm:col-span-2">
                        <p className="font-bold uppercase tracking-wider text-rose-500 mb-0.5">Motivo de rechazo</p>
                        <p className="text-rose-700">{task.rejection_reason}</p>
                      </div>
                    )}
                  </div>

                  {/* Acciones por estado */}
                  {isAssignee && task.status === 'propuesta' && (
                    <div className="flex flex-col sm:flex-row gap-2 mt-5 pt-4 border-t border-gray-100">
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => setAcceptingDuration(true)}
                        className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl text-sm font-semibold text-white"
                        style={{ background: 'var(--brand-green, #28a745)' }}
                      >
                        <Check size={16} /> Aceptar tarea
                      </button>
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={reject}
                        className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl text-sm font-semibold border-2 border-rose-300 text-rose-600 bg-rose-50 hover:bg-rose-100"
                      >
                        <X size={16} /> Rechazar
                      </button>
                    </div>
                  )}

                  {(isAssigner || isAssignee) && ['aceptada','propuesta'].includes(task.status) && (
                    <button
                      type="button"
                      onClick={cancel}
                      className="mt-3 text-xs text-gray-500 hover:text-rose-600 underline"
                    >
                      Cancelar tarea
                    </button>
                  )}
                </div>
              </div>

              {/* Cronómetro (asignado): iniciar el timestamp cuando realmente empiece.
                  Aceptar e iniciar son momentos distintos — por eso vive aquí, visible
                  justo debajo de la tarjeta apenas se acepta (desktop y móvil). */}
              {canControl && (
                <div className="space-y-2">
                  {task.status === 'aceptada' && (
                    <p className="text-xs text-gray-600 bg-blue-50/60 border border-blue-100 rounded-lg px-3 py-2">
                      Ya aceptaste esta tarea. Inicia el cronómetro cuando realmente empieces — se registra la hora en ese momento.
                    </p>
                  )}
                  <TaskTimerWidget taskId={task.id} userEmail={myEmail} />
                </div>
              )}

              {/* Notas */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="px-5 sm:px-6 py-4 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700 inline-flex items-center gap-2">
                    <MessageSquare size={14} /> Notas y avances ({notes.length})
                  </p>
                </div>
                <div className="p-5 sm:p-6">
                  <form onSubmit={submitNote} className="flex flex-col sm:flex-row gap-2 mb-4">
                    <textarea
                      value={newNote}
                      onChange={e => setNewNote(e.target.value)}
                      rows={2}
                      placeholder="Añadir avance, observación o incidencia..."
                      className="flex-1 px-3 py-2.5 text-base border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none resize-y"
                    />
                    <button
                      type="submit"
                      disabled={savingNote || !newNote.trim()}
                      className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: 'var(--brand-navy)' }}
                    >
                      <Send size={14} /> Enviar
                    </button>
                  </form>

                  {notes.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-3">Sin notas todavía</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {notes.map(n => (
                        <li key={n.id} className="border-l-2 border-gray-200 pl-3 py-1">
                          <p className="text-sm text-gray-800 whitespace-pre-line">{n.content}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {n.user_email} · {new Date(n.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Panel lateral: vista del asignador (lectura) o ayuda */}
            <aside className="space-y-4">
              {isAssigner && !isAssignee && ['en_curso','pausada','finalizada'].includes(task.status) ? (
                <TaskTimerWidget taskId={task.id} userEmail={task.assignee_email} readOnly />
              ) : !canControl ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-xs text-gray-400 text-center">
                  El timer estará disponible cuando la tarea esté aceptada o en curso.
                </div>
              ) : null}
            </aside>
          </div>
        </main>
      </div>

      {acceptingDuration && (
        <div
          className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => !actionLoading && setAcceptingDuration(false)}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-1">Aceptar tarea</h2>
            <p className="text-xs text-gray-500 mb-4">{task.title}</p>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
              ¿Cuánto vas a tardar? (minutos)
            </label>
            <input
              type="number"
              min={1}
              autoFocus
              value={durationInput}
              onChange={e => setDurationInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmAccept() }}
              placeholder="Ej: 45"
              className="w-full h-11 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
            />
            <p className="text-[10px] text-gray-400 mt-1.5">
              Esto ajusta la hora de fin en tu agenda.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setAcceptingDuration(false)}
                disabled={actionLoading}
                className="flex-1 h-10 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmAccept}
                disabled={actionLoading}
                className="flex-1 h-10 rounded-lg bg-[#28a745] text-white text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
