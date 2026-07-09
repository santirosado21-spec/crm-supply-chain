import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { TaskTimeEntry } from '../types/tasks'

export type TimerState = 'idle' | 'running' | 'paused' | 'finished'

interface UseTaskTimerResult {
  state:           TimerState
  elapsedSeconds:  number      // suma de segmentos work cerrados + segmento abierto si está corriendo
  serverNowOffset: number      // ms entre server y cliente (server - client)
  entries:         TaskTimeEntry[]
  loading:         boolean
  error:           string | null
  start:           (startedAt?: string) => Promise<void>
  pause:           () => Promise<void>
  resume:          () => Promise<void>
  finalize:        (evidenceUrl?: string) => Promise<void>
  reload:          () => Promise<void>
}

/**
 * Timer cuya fuente de verdad es el server.
 * El cliente solo dispara RPC; el tiempo se reconstruye sumando segmentos work.
 */
export function useTaskTimer(taskId: string, userEmail: string): UseTaskTimerResult {
  const [entries, setEntries] = useState<TaskTimeEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const offsetRef = useRef<number>(0)

  const reload = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('task_time_entries')
        .select('*')
        .eq('task_id', taskId)
        .order('started_at', { ascending: true })
      if (error) throw error
      setEntries((data ?? []) as TaskTimeEntry[])

      // Calibrar offset usando un segmento abierto (started_at en server)
      const open = (data ?? []).find(e => !e.ended_at)
      if (open) {
        const serverStart = new Date(open.started_at).getTime()
        if (Number.isFinite(serverStart)) {
          // Para evitar drifts, asumimos que tasks recién abiertas están "ahora"; se afinará al hacer start.
          offsetRef.current = 0
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => { reload() }, [reload])

  // Tick para refrescar elapsed cada 1s mientras hay segmento abierto
  useEffect(() => {
    const open = entries.find(e => !e.ended_at)
    if (!open) return
    const i = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(i)
  }, [entries])

  const open = entries.find(e => !e.ended_at)
  const state: TimerState = open
    ? (open.segment_type === 'work' ? 'running' : 'paused')
    : (entries.length === 0 ? 'idle' : 'finished')

  // tick fuerza re-render cada segundo cuando hay segmento abierto
  const _ = tick
  void _
  let elapsedSeconds = 0
  {
    const now = Date.now() + offsetRef.current
    for (const e of entries) {
      if (e.segment_type !== 'work') continue
      const s = new Date(e.started_at).getTime()
      const eEnd = e.ended_at ? new Date(e.ended_at).getTime() : now
      elapsedSeconds += Math.max(0, (eEnd - s) / 1000)
    }
    elapsedSeconds = Math.floor(elapsedSeconds)
  }

  const callRpc = useCallback(async (fn: string, extraParams?: Record<string, unknown>) => {
    setLoading(true); setError(null)
    try {
      const { error } = await supabase.rpc(fn, { p_task_id: taskId, p_user_email: userEmail, ...extraParams })
      if (error) throw error
      await reload()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [taskId, userEmail, reload])

  return {
    state,
    elapsedSeconds,
    serverNowOffset: offsetRef.current,
    entries,
    loading,
    error,
    start:    (startedAt?: string) => callRpc('task_start_timer', startedAt ? { p_started_at: startedAt } : undefined),
    pause:    () => callRpc('task_pause_timer'),
    resume:   () => callRpc('task_resume_timer'),
    finalize: (evidenceUrl?: string) => callRpc('task_finalize_timer', { p_evidence_url: evidenceUrl ?? null }),
    reload,
  }
}

export function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':')
}
