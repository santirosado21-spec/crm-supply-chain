import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { WarehouseTask } from '../types/pizarron'

/*
  Hook del Pizarrón de Operaciones.
  - Trae las warehouse_tasks NO completadas (pendientes + en proceso).
  - Realtime: refleja claims/completes/inserts sin refresh.
  - Mutaciones: claimTask (tomar), completeTask (completar) vía RPC.
*/
export function useWarehouseTasks() {
  const [tasks, setTasks] = useState<WarehouseTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('warehouse_tasks')
        .select('*, task:tasks(*)')
        .is('completed_at', null)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
      if (err) throw err
      setTasks((data ?? []) as unknown as WarehouseTask[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el pizarrón')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refetch() }, [refetch])

  // Realtime — cualquier cambio en warehouse_tasks recarga el tablero.
  useEffect(() => {
    const channel = supabase
      .channel('warehouse-tasks-pizarron')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_tasks' }, () => {
        refetch()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [refetch])

  const claimTask = useCallback(async (id: string, pickerName: string, pickerEmail?: string | null) => {
    const { error: err } = await supabase.rpc('pizarron_claim_task', {
      p_warehouse_task_id: id,
      p_picker_name: pickerName,
      p_picker_email: pickerEmail ?? null,
    })
    if (err) throw err
    await refetch()
  }, [refetch])

  const completeTask = useCallback(async (id: string, notes?: string | null) => {
    const { error: err } = await supabase.rpc('pizarron_complete_task', {
      p_warehouse_task_id: id,
      p_notes: notes ?? null,
    })
    if (err) throw err
    await refetch()
  }, [refetch])

  return { tasks, loading, error, refetch, claimTask, completeTask }
}
