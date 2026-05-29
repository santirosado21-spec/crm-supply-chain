import { useEffect, useMemo, useState } from 'react'
import {
  Loader2, AlertTriangle, Hand, CheckCircle2, Clock, User, UserPlus,
  PackageCheck, X,
} from 'lucide-react'
import { useWarehouseTasks } from '../../hooks/useWarehouseTasks'
import { useAuthContext } from '../../context/AuthContext'
import { useToast } from '../../hooks/useToast'
import {
  AREA_COLOR, AREA_LABEL,
  type WarehouseTask, type WarehouseTaskTaker,
} from '../../types/pizarron'

const KIOSK_DEVICE_ID_KEY = 'kiosk-device-id'

function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KIOSK_DEVICE_ID_KEY)
    if (!id) {
      id = `kiosk-${crypto.randomUUID()}`
      localStorage.setItem(KIOSK_DEVICE_ID_KEY, id)
    }
    return id
  } catch {
    return 'kiosk-unknown'
  }
}

function formatHHMM(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

interface Props {
  /** Modo kiosk: tipografía más grande, sin info de auth, multi-usuario. */
  kiosk?: boolean
}

export function PizarronBoard({ kiosk = false }: Props) {
  const { tasks, loading, error, refetch, completeTask, addTaker, endTaker } = useWarehouseTasks()
  const { user } = useAuthContext()
  const toast = useToast()

  useEffect(() => {
    if (!kiosk) return
    const id = window.setInterval(() => { refetch() }, 30_000)
    return () => window.clearInterval(id)
  }, [kiosk, refetch])

  const [claiming, setClaiming] = useState<WarehouseTask | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [busy, setBusy] = useState(false)

  // En multi-taker, "en proceso" = tiene al menos 1 taker activo.
  const activeTakersOf = (t: WarehouseTask): WarehouseTaskTaker[] =>
    (t.takers ?? []).filter(x => x.ended_at === null)

  const pending = useMemo(
    () => tasks.filter(t => activeTakersOf(t).length === 0),
    [tasks],
  )
  const inProgress = useMemo(
    () => tasks.filter(t => activeTakersOf(t).length > 0),
    [tasks],
  )

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', day: '2-digit', month: 'long',
  })

  const openClaim = (t: WarehouseTask) => {
    setClaiming(t)
    // Kiosk: NO recordar nombre — multi-usuario simultáneo.
    // No-kiosk: pre-rellenar con el usuario logueado.
    setNameInput(kiosk ? '' : (user?.name ?? ''))
  }

  const confirmClaim = async () => {
    if (!claiming) return
    const name = nameInput.trim()
    if (!name) {
      toast.error('Falta tu nombre', 'Escribe tu nombre para tomar la tarea.')
      return
    }
    setBusy(true)
    try {
      const deviceId = kiosk ? getDeviceId() : null
      await addTaker(claiming.id, name, kiosk ? null : (user?.email ?? null), deviceId)
      toast.success('Turno iniciado', `${name} en "${claiming.task?.title ?? 'la tarea'}".`)
      setClaiming(null)
      setNameInput('')
    } catch (e) {
      toast.error('No se pudo iniciar', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleEndTaker = async (taker: WarehouseTaskTaker) => {
    setBusy(true)
    try {
      await endTaker(taker.id)
      toast.success('Turno cerrado', `${taker.taker_name} terminó su parte.`)
    } catch (e) {
      toast.error('No se pudo cerrar', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleComplete = async (t: WarehouseTask) => {
    setBusy(true)
    try {
      await completeTask(t.id)
      toast.success('Tarea completada', 'Se quitó del pizarrón.')
    } catch (e) {
      toast.error('No se pudo completar', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const titleSize = kiosk ? 'text-2xl' : 'text-base'
  const metaSize  = kiosk ? 'text-base' : 'text-xs'

  const renderTakerChip = (taker: WarehouseTaskTaker, color: string) => (
    <div
      key={taker.id}
      className={`inline-flex items-center gap-1.5 rounded-full bg-white border px-2 py-1 ${kiosk ? 'text-sm' : 'text-[11px]'}`}
      style={{ borderColor: color }}
    >
      <User size={kiosk ? 14 : 11} style={{ color }} />
      <span className="font-semibold text-gray-800">{taker.taker_name}</span>
      <span className="text-gray-400">· {formatHHMM(taker.started_at)}</span>
      <button
        onClick={() => handleEndTaker(taker)}
        disabled={busy}
        title="Cerrar turno"
        className="ml-1 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 p-0.5 disabled:opacity-50"
      >
        <X size={kiosk ? 14 : 11} />
      </button>
    </div>
  )

  const renderCard = (t: WarehouseTask) => {
    const color = AREA_COLOR[t.area]
    const active = activeTakersOf(t)
    const taken = active.length > 0
    return (
      <div
        key={t.id}
        className="rounded-xl border shadow-sm overflow-hidden flex flex-col"
        style={{
          borderColor: color,
          borderLeftWidth: 6,
          background: taken ? `${color}1a` : '#ffffff',
        }}
      >
        <div className="p-4 flex-1">
          <div className="flex items-center justify-between mb-2">
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 font-bold uppercase tracking-wide text-white ${kiosk ? 'text-sm' : 'text-[10px]'}`}
              style={{ background: color }}
            >
              {AREA_LABEL[t.area]}
            </span>
            <span className={`font-bold text-gray-400 ${kiosk ? 'text-base' : 'text-[11px]'}`}>
              #{Math.round(t.priority)}
            </span>
          </div>
          <p className={`font-bold text-gray-800 leading-snug ${titleSize}`}>
            {t.task?.title ?? 'Tarea de almacén'}
          </p>
          {t.task?.ref && (
            <p className={`font-mono text-gray-400 mt-0.5 ${metaSize}`}>{t.task.ref}</p>
          )}
          <div className={`mt-2 space-y-1 text-gray-600 ${metaSize}`}>
            {t.task?.scheduled_start && (
              <p className="flex items-center gap-1.5">
                <Clock size={kiosk ? 16 : 12} className="text-gray-400" />
                {new Date(t.task.scheduled_start).toLocaleString('es-MX', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
            {!taken && t.assigned_to_name && (
              <p className="flex items-center gap-1.5 font-semibold" style={{ color }}>
                <User size={kiosk ? 16 : 12} />
                Designado: {t.assigned_to_name}
              </p>
            )}
            {t.estimated_duration_min && (
              <p className="flex items-center gap-1.5 text-gray-500">
                <Clock size={kiosk ? 16 : 12} className="text-gray-400" />
                Estimado: ~{t.estimated_duration_min} min
              </p>
            )}
            {t.designation_notes && (
              <p className={`text-gray-500 italic ${kiosk ? 'text-base' : 'text-[11px]'}`}>
                "{t.designation_notes}"
              </p>
            )}
            {taken && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {active.map(taker => renderTakerChip(taker, color))}
              </div>
            )}
          </div>
        </div>
        <div className="p-3 pt-0 space-y-2">
          {taken ? (
            <>
              <button
                onClick={() => openClaim(t)}
                disabled={busy}
                className={`w-full rounded-lg border-2 border-dashed font-bold flex items-center justify-center gap-2 transition-opacity disabled:opacity-50 ${kiosk ? 'h-12 text-base' : 'h-9 text-xs'}`}
                style={{ borderColor: color, color }}
              >
                <UserPlus size={kiosk ? 18 : 14} /> Agregar persona
              </button>
              <button
                onClick={() => handleComplete(t)}
                disabled={busy}
                className={`w-full rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50 ${kiosk ? 'h-14 text-lg' : 'h-10 text-sm'}`}
                style={{ background: '#28a745' }}
              >
                <CheckCircle2 size={kiosk ? 22 : 16} /> COMPLETAR
              </button>
            </>
          ) : (
            <button
              onClick={() => openClaim(t)}
              className={`w-full rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 ${kiosk ? 'h-14 text-lg' : 'h-10 text-sm'}`}
              style={{ background: color }}
            >
              <Hand size={kiosk ? 22 : 16} /> TOMAR
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={kiosk ? 'p-6' : ''}>
      <div className="mb-5">
        <h1 className={`font-bold text-[#1e3a5f] ${kiosk ? 'text-4xl' : 'text-xl'}`}>
          Pizarrón de Operaciones
        </h1>
        <p className={`text-gray-500 mt-1 capitalize ${kiosk ? 'text-xl' : 'text-xs'}`}>
          {today} · {pending.length} pendiente{pending.length === 1 ? '' : 's'} · {inProgress.length} en proceso
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={16} className="shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-blue-600">
          <Loader2 size={20} className="animate-spin" /> Cargando pizarrón…
        </div>
      ) : tasks.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <PackageCheck size={kiosk ? 56 : 36} className="text-gray-300 mx-auto mb-3" />
          <p className={`font-semibold text-gray-700 ${kiosk ? 'text-2xl' : 'text-sm'}`}>
            Sin tareas en el pizarrón
          </p>
          <p className={`text-gray-400 mt-1 ${kiosk ? 'text-lg' : 'text-xs'}`}>
            Las tareas nuevas aparecerán aquí automáticamente.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...pending, ...inProgress].map(renderCard)}
        </div>
      )}

      {claiming && (
        <div
          className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => !busy && setClaiming(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-1">
              {activeTakersOf(claiming).length > 0 ? 'Agregar persona' : 'Tomar tarea'}
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              {claiming.task?.title ?? 'Tarea de almacén'} · {AREA_LABEL[claiming.area]}
            </p>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tu nombre</label>
            <input
              type="text"
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmClaim() }}
              placeholder="Escribe tu nombre"
              className="w-full h-11 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
            />
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setClaiming(null)}
                disabled={busy}
                className="flex-1 h-10 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmClaim}
                disabled={busy}
                className="flex-1 h-10 rounded-lg bg-[#1e3a5f] text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#16304d] disabled:opacity-50"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Hand size={15} />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
