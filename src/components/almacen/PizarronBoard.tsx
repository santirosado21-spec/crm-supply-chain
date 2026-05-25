import { useEffect, useMemo, useState } from 'react'
import { Loader2, AlertTriangle, Hand, CheckCircle2, Clock, User, PackageCheck } from 'lucide-react'
import { useWarehouseTasks } from '../../hooks/useWarehouseTasks'
import { useAuthContext } from '../../context/AuthContext'
import { useToast } from '../../hooks/useToast'
import { AREA_COLOR, AREA_LABEL, type WarehouseTask } from '../../types/pizarron'

interface Props {
  /** Modo kiosk: tipografía más grande, pensado para pantalla compartida. */
  kiosk?: boolean
}

export function PizarronBoard({ kiosk = false }: Props) {
  const { tasks, loading, error, refetch, claimTask, completeTask } = useWarehouseTasks()
  const { user } = useAuthContext()
  const toast = useToast()

  // Kiosk: refresco cada 30s como fallback si realtime falla.
  useEffect(() => {
    if (!kiosk) return
    const id = window.setInterval(() => { refetch() }, 30_000)
    return () => window.clearInterval(id)
  }, [kiosk, refetch])

  const [claiming, setClaiming] = useState<WarehouseTask | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [busy, setBusy] = useState(false)

  const pending = useMemo(() => tasks.filter(t => !t.taken_at), [tasks])
  const inProgress = useMemo(() => tasks.filter(t => t.taken_at), [tasks])

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', day: '2-digit', month: 'long',
  })

  const openClaim = (t: WarehouseTask) => {
    setClaiming(t)
    setNameInput(user?.name ?? '')
  }

  const confirmClaim = async () => {
    if (!claiming) return
    if (!nameInput.trim()) {
      toast.error('Falta tu nombre', 'Escribe tu nombre para tomar la tarea.')
      return
    }
    setBusy(true)
    try {
      await claimTask(claiming.id, nameInput.trim(), user?.email ?? null)
      toast.success('Tarea tomada', `${nameInput.trim()} tomó la tarea.`)
      setClaiming(null)
      setNameInput('')
    } catch (e) {
      toast.error('No se pudo tomar', e instanceof Error ? e.message : String(e))
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

  const renderCard = (t: WarehouseTask) => {
    const color = AREA_COLOR[t.area]
    const taken = !!t.taken_at
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
              #{t.priority}
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
            {taken && (
              <p className="flex items-center gap-1.5 font-semibold" style={{ color }}>
                <User size={kiosk ? 16 : 12} />
                {t.taken_by_name}
                {t.taken_at && (
                  <span className="font-normal text-gray-400">
                    · {new Date(t.taken_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="p-3 pt-0">
          {taken ? (
            <button
              onClick={() => handleComplete(t)}
              disabled={busy}
              className={`w-full rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50 ${kiosk ? 'h-14 text-lg' : 'h-10 text-sm'}`}
              style={{ background: '#28a745' }}
            >
              <CheckCircle2 size={kiosk ? 22 : 16} /> COMPLETAR
            </button>
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
      {/* Banner */}
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

      {/* Modal TOMAR */}
      {claiming && (
        <div
          className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => !busy && setClaiming(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-1">Tomar tarea</h2>
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
