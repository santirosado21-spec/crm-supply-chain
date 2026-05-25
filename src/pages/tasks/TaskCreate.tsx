import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Loader2 } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { AvailabilityPicker } from '../../components/tasks/AvailabilityPicker'
import { useTasks, getTaskCategories } from '../../hooks/useTasks'
import { useAuthContext } from '../../context/AuthContext'
import { useToast } from '../../hooks/useToast'
import { supabase } from '../../lib/supabase'
import type { TaskCategory } from '../../types/tasks'
import { ExtensivOperationPicker } from '../../components/features/ExtensivOperationPicker'
import type { ExtensivPickResult } from '../../lib/extensiv'

interface TeamMember { email: string; name: string | null }

export function TaskCreate() {
  const navigate = useNavigate()
  const { user } = useAuthContext()
  const myEmail = user?.email ?? ''
  const toast = useToast()
  const { create } = useTasks()

  const [team, setTeam] = useState<TeamMember[]>([])
  const [categories, setCategories] = useState<TaskCategory[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle]                 = useState('')
  const [description, setDescription]     = useState('')
  const [categoryId, setCategoryId]       = useState<string>('')
  const [assigneeEmail, setAssigneeEmail] = useState<string>('')
  const [scheduledStart, setScheduledStart] = useState<Date | null>(null)
  const [scheduledEnd, setScheduledEnd]     = useState<Date | null>(null)
  const [extensivPick, setExtensivPick]     = useState<ExtensivPickResult | null>(null)

  useEffect(() => {
    getTaskCategories().then(setCategories)
    // Lista de empleados activos del equipo
    Promise.all([
      supabase.from('team_members').select('user_email, user_name').eq('active', true),
      supabase.from('user_work_schedule').select('user_email').limit(500),
    ]).then(([members, sched]) => {
      const set = new Map<string, string | null>()
      for (const r of members.data ?? []) set.set(r.user_email, r.user_name)
      for (const r of sched.data ?? [])   if (!set.has(r.user_email)) set.set(r.user_email, null)
      const arr = Array.from(set.entries()).map(([email, name]) => ({ email, name }))
      arr.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email))
      setTeam(arr)
    })
  }, [])

  // Sprint E · Roles operativos (SAC, almacén, transporte) deben ligar la
  // tarea a un Transaction Extensiv o explicitar modo manual. Admin y
  // cobranza pueden saltarlo.
  const requiresExtensivPick =
    user?.role === 'servicio_cliente' ||
    user?.role === 'almacen' ||
    user?.role === 'transporte'
  const extensivPickIsValid =
    !!extensivPick && (extensivPick.type === 'manual' || !!extensivPick.transactionId)
  const extensivOk = !requiresExtensivPick || extensivPickIsValid

  const canSubmit = title.trim() && assigneeEmail && scheduledStart && scheduledEnd && extensivOk && !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !scheduledStart || !scheduledEnd) return
    setSubmitting(true)
    setError(null)
    try {
      const t = await create({
        title:           title.trim(),
        description:     description.trim(),
        category_id:     categoryId || null,
        client_id:       null,
        operation_id:    null,
        assigner_email:  myEmail,
        assignee_email:  assigneeEmail,
        scheduled_start: scheduledStart.toISOString(),
        scheduled_end:   scheduledEnd.toISOString(),
        // Sprint B · Extensiv (opcional)
        extensiv_transaction_type: extensivPick?.type ?? null,
        extensiv_transaction_id:   extensivPick?.transactionId ?? null,
        extensiv_customer_id:      extensivPick?.customerId ?? null,
        extensiv_reference:        extensivPick?.reference ?? null,
        extensiv_raw:              extensivPick?.raw ?? null,
      })
      toast.success('Tarea propuesta', `Se le notificará a ${assigneeEmail}.`)
      navigate(`/tasks/${t.id}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear tarea'
      setError(msg)
      toast.error('No se pudo crear la tarea', msg)
    } finally {
      setSubmitting(false)
    }
  }

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

          <h1 className="text-xl font-bold text-[#1e3a5f] mb-1">Nueva tarea</h1>
          <p className="text-xs text-gray-400 mb-5">El destinatario verá la propuesta en su bandeja para aceptarla.</p>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* IZQUIERDA: detalles */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Título *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ej. Cargar camión SCAZ0042"
                  className="w-full px-3 py-2.5 text-base border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Descripción</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 text-base border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none resize-y"
                  placeholder="Detalles, requerimientos, ubicación..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Categoría</label>
                <select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2.5 text-base border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none bg-white"
                >
                  <option value="">— sin categoría —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Operación (Extensiv / PT / Manual) */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Operación
                  {requiresExtensivPick
                    ? <span className="text-rose-500 ml-1">*</span>
                    : <span className="text-[10px] font-normal text-gray-400 ml-1">(opcional)</span>
                  }
                </label>
                <ExtensivOperationPicker
                  value={extensivPick}
                  onChange={setExtensivPick}
                  fromDays={7}
                  className={requiresExtensivPick && !extensivPickIsValid ? 'ring-2 ring-rose-200' : ''}
                />
                {requiresExtensivPick && !extensivPickIsValid && (
                  <p className="mt-1.5 text-[11px] text-rose-600">
                    Tu rol requiere ligar la tarea a un Transaction de Extensiv (o marcar modo Manual si es operación interna).
                  </p>
                )}
                {/* Auto-llenar título cuando el picker selecciona algo */}
                {extensivPick?.reference && !title.trim() && (
                  <button
                    type="button"
                    onClick={() => setTitle(`${extensivPick.type === 'order' ? 'Procesar order' : extensivPick.type === 'receipt' ? 'Recibir' : 'Operación'} ${extensivPick.reference}`)}
                    className="mt-2 text-[11px] text-[#1e3a5f] font-semibold hover:underline"
                  >
                    Usar referencia como título de tarea
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Asignar a *</label>
                <select
                  required
                  value={assigneeEmail}
                  onChange={e => { setAssigneeEmail(e.target.value); setScheduledStart(null); setScheduledEnd(null) }}
                  className="w-full px-3 py-2.5 text-base border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none bg-white"
                >
                  <option value="">— elegir empleado —</option>
                  {team.filter(t => t.email !== myEmail).map(t => (
                    <option key={t.email} value={t.email}>
                      {t.name ? `${t.name} · ${t.email}` : t.email}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  Solo aparecen empleados configurados en Equipo y horarios.
                </p>
              </div>
            </div>

            {/* DERECHA: AvailabilityPicker */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">Horario disponible *</p>
              {assigneeEmail ? (
                <AvailabilityPicker
                  userEmail={assigneeEmail}
                  durationMinutes={60}
                  selectedStart={scheduledStart}
                  onSelect={(s, e) => { setScheduledStart(s); setScheduledEnd(e) }}
                />
              ) : (
                <div className="bg-white rounded-xl border border-dashed border-gray-200 py-12 text-center text-xs text-gray-400">
                  Selecciona un empleado para ver su disponibilidad
                </div>
              )}

              {scheduledStart && scheduledEnd && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-[#1e3a5f]">
                  <strong>Programada:</strong>{' '}
                  {scheduledStart.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                  {' → '}
                  {scheduledEnd.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="lg:col-span-2 flex flex-col sm:flex-row sm:justify-end gap-3 pt-2">
              {error && <p className="text-xs text-rose-600 self-center mr-auto">{error}</p>}
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-xl text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                style={{ background: 'var(--brand-navy)' }}
              >
                {submitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                Enviar propuesta
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  )
}
