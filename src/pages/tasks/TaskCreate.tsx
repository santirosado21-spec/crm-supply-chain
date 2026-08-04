import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Send, Loader2 } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { AvailabilityPicker } from '../../components/tasks/AvailabilityPicker'
import { useTasks, getTaskCategories, getCategoryIdForRole, linkTaskTags } from '../../hooks/useTasks'
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

// Estándares de duración por tipo de movimiento. La duración ya no se captura a
// mano: se deriva del movimiento elegido y es lo que se aparta en el calendario.
const DURACION_ENTRADA = 90
const DURACION_SALIDA  = 60
const DURACION_DEFAULT = 60

function duracionPorMovimiento(tag?: TaskTag | null): number {
  if (!tag) return DURACION_DEFAULT
  const l = norm(tag.label)
  if (l === 'entrada') return DURACION_ENTRADA
  if (l === 'salida')  return DURACION_SALIDA
  return DURACION_DEFAULT
}

function formatDuracion(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return `${h} h ${m} min`
  if (h)      return h === 1 ? '1 hora' : `${h} horas`
  return `${m} min`
}

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

  // Duración estándar según el movimiento (Entrada 1h30, Salida 1h).
  const movimientoTag = useMemo(
    () => (byDimension.movimiento ?? []).find(t => t.id === selectedTags.movimiento) ?? null,
    [byDimension, selectedTags.movimiento],
  )
  const durationMinutes = duracionPorMovimiento(movimientoTag)

  // Si cambia la duración (o el calendario que se está mirando), la selección
  // previa deja de ser válida: un slot elegido con 60 min no puede quedarse con
  // un fin de 60 cuando ahora se necesitan 90. Se limpia para forzar reelegir.
  useEffect(() => {
    setScheduledStart(null)
    setScheduledEnd(null)
  }, [durationMinutes, availabilityEmail])

  useEffect(() => { getTaskCategories().then(setCategories) }, [])
  useEffect(() => { getClients() }, [getClients])

  // La categoría ya no se elige a mano: se asigna sola según el área/rol de
  // quien crea la tarea (ver ROLE_TO_CATEGORY_CODE en types/tasks.ts).
  const categoryId = getCategoryIdForRole(categories, user?.role)

  // Clasificación obligatoria: Destino (área) + cada dimensión required (movimiento/actividad/prioridad).
  const missingRequired =
    !areaId ||
    CLASS_DIMENSIONS.some(d => d.required && !selectedTags[d.code])

  const canSubmit = !!(
    title.trim()
    && scheduledStart && scheduledEnd
    && scheduledStart.getTime() >= minDate.getTime()
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

      // Vínculo opcional a una transacción de Extensiv — se persiste en cualquier
      // rama (almacén, persona o entrada propia) si el usuario lo eligió.
      const extensivFields = {
        extensiv_transaction_type: extensivPick?.type ?? null,
        extensiv_transaction_id:   extensivPick?.transactionId ?? null,
        extensiv_customer_id:      extensivPick?.customerId ?? null,
        extensiv_reference:        extensivPick?.reference ?? null,
        extensiv_raw:              extensivPick?.raw ?? null,
      }

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
          ...extensivFields,
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
          ...extensivFields,
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
            ...extensivFields,
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
              </div>

              {/* Cliente único + ligado opcional a transacción de Extensiv.
                  El dropdown de Cliente (clientes activos) vive dentro del picker;
                  eliges cliente y, si quieres, su transacción (jalada de la API). */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Cliente y operación
                  <span className="text-[10px] font-normal text-gray-400 ml-1">(transacción opcional)</span>
                </label>
                <ExtensivOperationPicker
                  value={extensivPick}
                  onChange={setExtensivPick}
                  clients={clients}
                  clientId={clientId}
                  onClientChange={setClientId}
                  fromDays={7}
                />
              </div>
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
              <p className="text-[11px] text-gray-500 mb-1.5">
                {movimientoTag
                  ? <><strong className="text-[#1e3a5f]">{movimientoTag.label}</strong> — se aparta {formatDuracion(durationMinutes)}</>
                  : <>Se aparta {formatDuracion(durationMinutes)}. Elige el movimiento para aplicar el estándar (Entrada 1 h 30 min · Salida 1 hora).</>}
              </p>
              {!areaId ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-white py-12 text-center text-xs text-gray-400">
                  Elige primero un destino.
                </div>
              ) : (
                <AvailabilityPicker
                  userEmail={availabilityEmail}
                  durationMinutes={durationMinutes}
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
