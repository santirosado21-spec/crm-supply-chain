import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { WarehouseTaskTaker } from '../types/pizarron'

/*
  Hook de takers (multi-persona por warehouse_task).
  - Trae los takers de UNA warehouse_task específica.
  - Realtime: refleja start/end vía postgres_changes (sin polling).
  - Mutaciones vía RPC: pizarron_start_taker / pizarron_end_taker.
*/
export function useWarehouseTaskTakers(warehouseTaskId: string | null | undefined) {
  const [takers, setTakers] = useState<WarehouseTaskTaker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!warehouseTaskId) { setTakers([]); setLoading(false); return }
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('warehouse_task_takers')
        .select('*')
        .eq('warehouse_task_id', warehouseTaskId)
        .order('started_at', { ascending: true })
      if (err) throw err
      setTakers((data ?? []) as WarehouseTaskTaker[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar los takers')
    } finally {
      setLoading(false)
    }
  }, [warehouseTaskId])

  useEffect(() => { refetch() }, [refetch])

  useEffect(() => {
    if (!warehouseTaskId) return
    const channel = supabase
      .channel(`warehouse-task-takers-${warehouseTaskId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'warehouse_task_takers',
        filter: `warehouse_task_id=eq.${warehouseTaskId}`,
      }, () => { refetch() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [warehouseTaskId, refetch])

  const startTaker = useCallback(async (name: string, email?: string | null, deviceId?: string | null) => {
    const { data, error: err } = await supabase.rpc('pizarron_start_taker', {
      p_warehouse_task_id: warehouseTaskId,
      p_name: name,
      p_email: email ?? null,
      p_device_id: deviceId ?? null,
    })
    if (err) throw err
    await refetch()
    return data as string  // taker_id UUID
  }, [warehouseTaskId, refetch])

  const endTaker = useCallback(async (takerId: string, notes?: string | null) => {
    const { error: err } = await supabase.rpc('pizarron_end_taker', {
      p_taker_id: takerId,
      p_notes: notes ?? null,
    })
    if (err) throw err
    await refetch()
  }, [refetch])

  const activeTakers = useMemo(() => takers.filter(t => t.ended_at === null), [takers])
  const completedTakers = useMemo(() => takers.filter(t => t.ended_at !== null), [takers])
  const totalManMinutes = useMemo(
    () => completedTakers.reduce((sum, t) => sum + (t.duration_min ?? 0), 0),
    [completedTakers],
  )

  return {
    takers,
    activeTakers,
    completedTakers,
    totalManMinutes,
    loading,
    error,
    refetch,
    startTaker,
    endTaker,
  }
}
