import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Send, Loader2 } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { AvailabilityPicker } from '../../components/tasks/AvailabilityPicker'
import { useTasks, getTaskCategories, linkTaskTags } from '../../hooks/useTasks'
import { useTeamMembers } from '../../hooks/useTeamMembers'
import { useTaskTags } from '../../hooks/useTaskTags'
import { useClients } from '../../hooks/useClients'
import { useAuthContext } from '../../context/AuthContext'
import { useToast } from '../../hooks/useToast'
import { supabase } from '../../lib/supabase'
import { ALMACEN_RECEPTOR_EMAIL } from '../../config/almacen'
import { TAG_DIMENSIONS, type TagDimension, type TaskCategory, type TaskTag } from '../../types/tasks'
import { ExtensivOperationPicker } from '../../components/features/ExtensivOperationPicker'
import type { ExtensivPickResult } from '../../lib/extensiv'

// Normaliza un label de área para detectar "Almacén" sin depender de acentos.
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const isAlmacen = (t?: TaskTag | null) => !!t && norm(t.label) === 'almacen'

// Dimensiones de clasificación que se capturan aparte del Destino (= Área).
const CLASS_DIMENSIONS = TAG_DIMENSIONS.filter(d => d.code !== 'area')

export function TaskCreate() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const presetAlmacen = params.get('destino') === 'almacen'
  const { user } = useAuthContext()
  const myEmail = user?.email ?? ''
  const toast = useToast()
  const { create } = useTasks()
  const { members } = useTeamMembers()
  const { byDimension } = useTaskTags()
  const { clients, getClients } = useClients()

  const [categories, setCategories] = useState<TaskCategory[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle]                 = useState('')
  const [description, setDescription]     = useState('')
  const [categoryId, setCategoryId]       = useState<string>('')
  const [scheduledStart, setScheduledStart] = useState<Date | null>(null)
  const [scheduledEnd, setScheduledEnd]     = useState<Date | null>(null)
  const [extensivPick, setExtensivPick]     = useState<ExtensivPickResult | null>(null)

  // ── Destino (= Área) ─────────────────────────────────────────────────────────
  const areaTags = useMemo(() => byDimension.area ?? [], [byDimension])
  const [areaId, setAreaId] = useState<string>('')
  const areaTag = areaTags.find(t => t.id === areaId) ?? null
  const esAlmacen = isAlmacen(areaTag)

  // Preseleccionar Almacén si llega ?destino=almacen y ya cargaron las áreas.
  useEffect(() => {
    if (presetAlmacen && !areaId) {
      const alm = areaTags.find(isAlmacen)
      if (alm) setAreaId(alm.id)
    }
  }, [presetAlmacen, areaId, areaTags])

  // Para áreas que no son almacén: opcionalmente asignar a una persona del equipo.
  const [personEmail, setPersonEmail] = useState('')
  const recipients = useMemo(
    () => members.filter(m => m.email !== ALMACEN_RECEPTOR_EMAIL && m.email !== myEmail),
    [members, myEmail],
  )

  // ── Clasificación (movimiento, actividad, prioridad, proveedor) + cliente ────
  const [selectedTags, setSelectedTags] = useState<Record<TagDimension, string>>({
    movimiento: '', area: '', actividad: '', prioridad: '', proveedor: '',
  })
  const [clientId, setClientId] = useState<string>('')

  // Almacén agenda ≥1 día; las demás pueden ser hoy.
  const minDate = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    if (esAlmacen) d.setDate(d.getDate() + 1)
    return d
  }, [esAlmacen])

  // Disponibilidad: almacén = cuenta de almacén; persona = destinatario; si no, el creador.
  const availabilityEmail = esAlmacen ? ALMACEN_RECEPTOR_EMAIL : (personEmail || myEmail)

  useEffect(() => { getTaskCategories().then(setCategories) }, [])
  useEffect(() => { getClients() }, [getClients])

  // Extensiv solo se exige cuando la tarea va al almacén (roles operativos).
  const requiresExtensivPick =
    esAlmacen &&
    (user?.role === 'servicio_cliente' || user?.role === 'almacen' || user?.role === 'transporte')
  const extensivPickIsValid =
    !!extensivPick && (extensivPick.type === 'manual' || !!extensivPick.transactionId)
  const extensivOk = !requiresExtensivPick || extensivPickIsValid

  // Clasificación obligatoria: Destino (área) + cada dimensión required (movimiento/actividad/prioridad).
  const missingRequired =
    !areaId ||
    CLASS_DIMENSIONS.some(d => d.required && !selectedTags[d.code])

  const canSubmit = !!(
    title.trim()
    && scheduledStart && scheduledEnd
    && scheduledStart.getTime() >= minDate.getTime()
    && extensivOk
    && !missingRequired
    && !submitting
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !scheduledStart || !scheduledEnd) return
    setSubmitting(true)
    setError(null)
    try {
      // Etiquetas a vincular: el Área (destino) + clasificación elegida.
      const tagIds = [areaId, ...CLASS_DIMENSIONS.map(d => selectedTags[d.code])].filter(Boolean)

      let taskId: string
      let notifyTo: string
      if (esAlmacen) {
        // Flujo validado a la cuenta de almacén (propuesta + guards + Extensiv).
        const t = await create({
          title:           title.trim(),
          description:     description.trim(),
          category_id:     categoryId || null,
          client_id:       clientId || null,
          operation_id:    null,
          assigner_email:  myEmail,
          assignee_email:  ALMACEN_RECEPTOR_EMAIL,
          scheduled_start: scheduledStart.toISOString(),
          scheduled_end:   scheduledEnd.toISOString(),
          extensiv_transaction_type: extensivPick?.type ?? null,
          extensiv_transaction_id:   extensivPick?.transactionId ?? null,
          extensiv_customer_id:      extensivPick?.customerId ?? null,
          extensiv_reference:        extensivPick?.reference ?? null,
          extensiv_raw:              extensivPick?.raw ?? null,
        })
        taskId = t.id
        notifyTo = ALMACEN_RECEPTOR_EMAIL
      } else if (personEmail) {
        // Tarea del Calendario General a una persona: flujo de propuesta con
        // guards (task_create_safe) — el destinatario la acepta/rechaza y
        // recibe notificación. Mismo camino validado que usa almacén.
        const t = await create({
          title:           title.trim(),
          description:     description.trim(),
          category_id:     categoryId || null,
          client_id:       clientId || null,
          operation_id:    null,
          assigner_email:  myEmail,
          assignee_email:  personEmail,
          scheduled_start: scheduledStart.toISOString(),
          scheduled_end:   scheduledEnd.toISOString(),
        })
        taskId = t.id
        notifyTo = personEmail
      } else {
        // Solo al área (sin persona): entrada personal del creador (assignee =
        // creador), que task_create_safe rechazaría por auto-asignación. Insert
        // directo con status 'aceptada' — aparece en el General.
        const { data, error: insErr } = await supabase
          .from('tasks')
          .insert({
            title:           title.trim(),
            description:     description.trim() || '',
            category_id:     categoryId || null,
            client_id:       clientId || null,
            operation_id:    null,
            assigner_email:  myEmail,
            assignee_email:  myEmail,
            scheduled_start: scheduledStart.toISOString(),
            scheduled_end:   scheduledEnd.toISOString(),
            status:          'aceptada',
          })
          .select('id')
          .single()
        if (insErr) {
          // 23P01 = exclusion_violation (constraint tasks_no_overlap).
          const overlap = insErr.code === '23P01' || /exclusion|overlap|no_overlap/i.test(insErr.message)
          throw new Error(overlap ? 'Ese horario ya está ocupado en tu calendario.' : insErr.message)
        }
        taskId = (data as { id: string }).id
        notifyTo = areaTag?.label ?? 'el área'
      }

      // La tarea ya existe: un fallo al vincular etiquetas no debe reportarse
      // como "no se pudo crear". Se avisa aparte sin bloquear la navegación.
      try {
        await linkTaskTags(taskId, tagIds)
      } catch (tagErr: unknown) {
        toast.error('Tarea creada, pero fallaron las etiquetas',
          tagErr instanceof Error ? tagErr.message : 'Revisa la clasificación.')
      }
      toast.success('Tarea creada', `Destino: ${notifyTo}.`)
      navigate(`/tasks/${taskId}`)
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

          <h1 className="text-xl font-bold text-[#1e3a5f] mb-1">Crear tarea — Calendario General</h1>
          <p className="text-xs text-gray-400 mb-5">
            Elige el destino y completa la clasificación. Almacén aparece también en Operaciones.
          </p>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* IZQUIERDA: detalles + clasificación */}
            <div className="space-y-4">
              {/* ── Destino (Área) ── */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Destino <span className="text-rose-500">*</span>
                </label>
                <select
                  value={areaId}
                  onChange={e => setAreaId(e.target.value)}
                  className="w-full px-3 py-2.5 text-base border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none bg-white"
                >
                  <option value="">— elige destino —</option>
                  {areaTags.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  {esAlmacen
                    ? 'Se envía a la cuenta de almacén — aparece en Operaciones y en el General.'
                    : 'Aparece en el Calendario General.'}
                </p>
              </div>

              {/* ── Para: persona del equipo (mandar a quien sea) ── */}
              {areaId && !esAlmacen && (
                <div className="rounded-xl border border-[#1e3a5f]/20 bg-blue-50/40 p-3">
                  <label className="block text-xs font-bold text-[#1e3a5f] mb-1.5">
                    Para (persona del equipo)
                  </label>
                  <select
                    value={personEmail}
                    onChange={e => setPersonEmail(e.target.value)}
                    className="w-full px-3 py-2.5 text-base border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none bg-white"
                  >
                    <option value="">— solo al área (sin persona específica) —</option>
                    {recipients.map(m => <option key={m.email} value={m.email}>{m.name ?? m.email}</option>)}
                  </select>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Mándala a quien sea del equipo, o déjala "solo al área". Aparece en el Calendario General.
                  </p>
                </div>
              )}

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

              {/* ── Clasificación (los mismos campos que los filtros del General) ── */}
              <div className="rounded-xl border border-gray-100 bg-white p-3 space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Clasificación</p>
                {CLASS_DIMENSIONS.map(dim => (
                  <div key={dim.code}>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      {dim.label}{dim.required && <span className="text-rose-500 ml-1">*</span>}
                    </label>
                    <select
                      value={selectedTags[dim.code]}
                      onChange={e => setSelectedTags(s => ({ ...s, [dim.code]: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none bg-white"
                    >
                      <option value="">— selecciona —</option>
                      {(byDimension[dim.code] ?? []).map(tag => (
                        <option key={tag.id} value={tag.id}>{tag.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Cliente</label>
                  <select
                    value={clientId}
                    onChange={e => setClientId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none bg-white"
                  >
                    <option value="">— sin cliente —</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} · ` : ''}{c.name}</option>
                    ))}
                  </select>
                </div>
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

              {/* Operación (Extensiv) — solo cuando va a almacén */}
              {esAlmacen && (
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
                </div>
              )}
            </div>

            {/* DERECHA: AvailabilityPicker */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">
                Horario disponible *
                {esAlmacen && (
                  <span className="text-[10px] font-normal text-gray-400 ml-2">
                    (a partir de mañana — almacén necesita ≥1 día de anticipación)
                  </span>
                )}
              </p>
              {!areaId ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-white py-12 text-center text-xs text-gray-400">
                  Elige primero un destino.
                </div>
              ) : (
                <AvailabilityPicker
                  userEmail={availabilityEmail}
                  durationMinutes={60}
                  selectedStart={scheduledStart}
                  minDate={minDate}
                  onSelect={(s, e) => { setScheduledStart(s); setScheduledEnd(e) }}
                />
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
                Crear tarea
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  )
}
