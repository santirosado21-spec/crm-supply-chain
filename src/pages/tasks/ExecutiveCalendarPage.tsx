import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarRange, Loader2, AlertTriangle, CheckCircle2, Clock, User,
  ExternalLink, Inbox,
} from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { supabase } from '../../lib/supabase'
import { useAuthContext } from '../../context/AuthContext'
import {
  AREA_COLOR, AREA_LABEL,
  type WarehouseTask, type WarehouseTaskTaker,
} from '../../types/pizarron'

/*
  Calendario Ejecutivo (SAC).
  Vista de progreso de las actividades que el usuario actual mandó al almacén:
  pendientes / en curso / completadas. Read-only. Para crear/cancelar tareas
  usa /calendario/nueva o /calendario/:id.
*/

type ExecutiveTaskRow = {
  id:               string
  ref:              string | null
  title:            string
  status:           string
  assignee_email:   string
  scheduled_start:  string
  scheduled_end:    string
  warehouse_task:   (Pick<WarehouseTask,
    'id' | 'area' | 'priority' | 'taken_by_name' | 'taken_at' |
    'completed_at' | 'actual_duration_min' | 'estimated_duration_min'
  > & { takers?: WarehouseTaskTaker[] }) | null
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

type Bucket = 'pendientes' | 'en_curso' | 'completadas'

function classify(row: ExecutiveTaskRow): Bucket {
  const wt = row.warehouse_task
  if (wt?.completed_at) return 'completadas'
  const activeTakers = (wt?.takers ?? []).filter(t => t.ended_at === null)
  if (activeTakers.length > 0) return 'en_curso'
  return 'pendientes'
}

export function ExecutiveCalendarPage() {
  const { user } = useAuthContext()
  const [rows, setRows] = useState<ExecutiveTaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rangeFilter, setRangeFilter] = useState<'hoy' | 'semana' | '30d'>('hoy')

  const range = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 1)
    if (rangeFilter === 'semana') {
      start.setDate(start.getDate() - 6)
    } else if (rangeFilter === '30d') {
      start.setDate(start.getDate() - 29)
    }
    return { start: start.toISOString(), end: end.toISOString() }
  }, [rangeFilter])

  const fetchData = useCallback(async () => {
    if (!user?.email) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('tasks')
        .select(`
          id, ref, title, status, assignee_email, scheduled_start, scheduled_end,
          warehouse_task:warehouse_tasks(
            id, area, priority, taken_by_name, taken_at, completed_at,
            actual_duration_min, estimated_duration_min,
            takers:warehouse_task_takers(*)
          )
        `)
        .eq('assigner_email', user.email.toLowerCase())
        .gte('scheduled_start', range.start)
        .lt('scheduled_start', range.end)
        .order('scheduled_start', { ascending: true })
      if (err) throw err
      // Postgrest devuelve warehouse_task como array (1:N en realidad N:1), tomar [0]
      const normalized = (data ?? []).map(r => {
        const wtArr = r.warehouse_task as unknown as ExecutiveTaskRow['warehouse_task'][] | null
        return {
          ...r,
          warehouse_task: Array.isArray(wtArr) ? (wtArr[0] ?? null) : (wtArr ?? null),
        }
      }) as unknown as ExecutiveTaskRow[]
      setRows(normalized)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el calendario')
    } finally {
      setLoading(false)
    }
  }, [user?.email, range.start, range.end])

  useEffect(() => { fetchData() }, [fetchData])

  // Realtime: tasks + warehouse_tasks + takers — cualquier cambio refresca.
  useEffect(() => {
    if (!user?.email) return
    const channel = supabase
      .channel(`exec-calendar-${user.email}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_tasks' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_task_takers' }, () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.email, fetchData])

  const buckets = useMemo(() => {
    const out: Record<Bucket, ExecutiveTaskRow[]> = { pendientes: [], en_curso: [], completadas: [] }
    for (const r of rows) out[classify(r)].push(r)
    return out
  }, [rows])

  const renderCard = (row: ExecutiveTaskRow) => {
    const wt = row.warehouse_task
    const color = wt ? AREA_COLOR[wt.area] : '#94a3b8'
    const allTakers = wt?.takers ?? []
    const activeTakers = allTakers.filter(t => t.ended_at === null)
    const completedTakers = allTakers.filter(t => t.ended_at !== null)
    return (
      <div
        key={row.id}
        className="bg-white rounded-lg border border-gray-100 shadow-sm p-3 space-y-2"
        style={{ borderLeft: `4px solid ${color}` }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-800 truncate">{row.title}</p>
            {row.ref && <p className="text-[10px] font-mono text-gray-400">{row.ref}</p>}
          </div>
          <Link
            to={`/calendario/${row.id}`}
            className="text-gray-300 hover:text-[#1e3a5f] shrink-0"
            title="Ver detalle"
          >
            <ExternalLink size={13} />
          </Link>
        </div>

        <div className="flex flex-wrap gap-1.5 text-[10px]">
          {wt && (
            <span
              className="inline-block rounded-full px-2 py-0.5 font-bold uppercase text-white"
              style={{ background: color }}
            >
              {AREA_LABEL[wt.area]}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-gray-500">
            <Clock size={10} /> {formatTime(row.scheduled_start)}
          </span>
          {wt?.estimated_duration_min && (
            <span className="text-gray-400">est. {wt.estimated_duration_min}m</span>
          )}
        </div>

        {/* Takers activos */}
        {activeTakers.length > 0 && (
          <div className="space-y-0.5">
            {activeTakers.map(t => (
              <p key={t.id} className="text-[11px] flex items-center gap-1" style={{ color }}>
                <User size={10} />
                <span className="font-semibold">{t.taker_name}</span>
                <span className="text-gray-400 font-normal">· desde {formatTime(t.started_at)}</span>
              </p>
            ))}
          </div>
        )}

        {/* Takers completados (en columna Completadas) */}
        {completedTakers.length > 0 && (
          <div className="space-y-0.5 pt-1 border-t border-gray-50">
            {completedTakers.map(t => (
              <p key={t.id} className="text-[11px] flex items-center gap-1 text-gray-600">
                <CheckCircle2 size={10} className="text-green-500" />
                <span className="font-semibold">{t.taker_name}</span>
                {typeof t.duration_min === 'number' && (
                  <span className="text-gray-400 font-normal">· {t.duration_min} min</span>
                )}
              </p>
            ))}
          </div>
        )}

        {wt?.completed_at && (
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-gray-50">
            <span className="text-gray-500">Total horas-hombre:</span>
            <span className="font-bold text-[#1e3a5f]">
              {wt.actual_duration_min ?? 0} min
            </span>
          </div>
        )}

        {/* Designación sin cuenta (Guillermo asignó pero nadie ha tomado) */}
        {!wt && row.assignee_email && (
          <p className="text-[11px] text-gray-400">
            → {row.assignee_email.split('@')[0]}
          </p>
        )}
      </div>
    )
  }

  const renderBucket = (title: string, items: ExecutiveTaskRow[], accent: string) => (
    <div className="bg-gray-50/40 rounded-xl border border-gray-100 p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>
          {title}
        </h3>
        <span className="text-[11px] font-mono text-gray-400">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-gray-300 text-center py-4">— sin actividades —</p>
      ) : (
        <div className="space-y-2">{items.map(renderCard)}</div>
      )}
    </div>
  )

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-[#1e3a5f] flex items-center gap-2">
                <CalendarRange size={20} /> Calendario SAC
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Tus actividades enviadas al almacén y su progreso.
              </p>
            </div>
            <div className="inline-flex bg-white rounded-lg border border-gray-200 p-0.5 text-xs">
              {(['hoy', 'semana', '30d'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRangeFilter(r)}
                  className={`px-3 py-1.5 rounded-md font-medium ${
                    rangeFilter === r
                      ? 'bg-[#1e3a5f] text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {r === 'hoy' ? 'Hoy' : r === 'semana' ? '7 días' : '30 días'}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" /> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-blue-600">
              <Loader2 size={20} className="animate-spin" /> Cargando…
            </div>
          ) : rows.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
              <Inbox size={36} className="text-gray-300 mx-auto mb-3" />
              <p className="font-semibold text-gray-700 text-sm">Sin actividades enviadas</p>
              <p className="text-xs text-gray-400 mt-1">
                Crea una nueva en <Link to="/calendario/nueva" className="text-[#1e3a5f] underline">/calendario/nueva</Link>.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {renderBucket('Pendientes',  buckets.pendientes,  '#94a3b8')}
              {renderBucket('En curso',    buckets.en_curso,    '#1e3a5f')}
              {renderBucket('Completadas', buckets.completadas, '#28a745')}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
