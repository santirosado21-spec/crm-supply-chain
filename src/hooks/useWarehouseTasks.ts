import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { WarehouseTask } from '../types/pizarron'

/*
  Hook del Pizarrón de Operaciones.
  - Trae las warehouse_tasks NO completadas (pendientes + en proceso).
  - Realtime: refleja claims/completes/inserts sin refresh.
  - Mutaciones: claimTask (legacy single-taker), completeTask, setSchedule,
    reorderPriority. Para multi-taker usar useWarehouseTaskTakers.
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
        .select('*, task:tasks(*), takers:warehouse_task_takers(*)')
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

  useEffect(() => {
    const channel = supabase
      .channel('warehouse-tasks-pizarron')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_tasks' }, () => {
        refetch()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_task_takers' }, () => {
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
    // El RPC ahora cierra todos los takers abiertos y calcula
    // actual_duration_min = SUM(duration_min) — horas-hombre acumuladas
    // (migración 20260528000001). El cálculo client-side anterior se eliminó.
    const { error: err } = await supabase.rpc('pizarron_complete_task', {
      p_warehouse_task_id: id,
      p_notes: notes ?? null,
    })
    if (err) throw err
    await refetch()
  }, [refetch])

  const setSchedule = useCallback(async (id: string, start: string | null, end: string | null) => {
    const { error: err } = await supabase
      .from('warehouse_tasks')
      .update({ scheduled_start: start, scheduled_end: end })
      .eq('id', id)
    if (err) throw err
    await refetch()
  }, [refetch])

  // Drag-and-drop: priority = (prev + next) / 2.0 — inserción lexicográfica.
  // Realtime reconcilia entre clientes; conflictos concurrentes son rarísimos
  // en un CEDIS (1-2 directores máximo).
  const reorderPriority = useCallback(async (id: string, newPriority: number) => {
    const { error: err } = await supabase
      .from('warehouse_tasks')
      .update({ priority: newPriority })
      .eq('id', id)
    if (err) throw err
    await refetch()
  }, [refetch])

  // Multi-taker: agrega una persona a la tarea (no exclusivo, puede haber varios).
  const addTaker = useCallback(async (
    taskId: string,
    name: string,
    email?: string | null,
    deviceId?: string | null,
  ) => {
    const { data, error: err } = await supabase.rpc('pizarron_start_taker', {
      p_warehouse_task_id: taskId,
      p_name: name,
      p_email: email ?? null,
      p_device_id: deviceId ?? null,
    })
    if (err) throw err
    await refetch()
    return data as string
  }, [refetch])

  const endTaker = useCallback(async (takerId: string, notes?: string | null) => {
    const { error: err } = await supabase.rpc('pizarron_end_taker', {
      p_taker_id: takerId,
      p_notes: notes ?? null,
    })
    if (err) throw err
    await refetch()
  }, [refetch])

  return {
    tasks, loading, error, refetch,
    claimTask, completeTask,
    setSchedule, reorderPriority,
    addTaker, endTaker,
  }
}
