import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/*
  Engineered Labor Standards — tiempo base por tipo de tarea para almacén.
  CRUD + realtime sobre la tabla labor_standards (migración
  20260525143000_labor_standards.sql).
*/
export interface LaborStandard {
  id:                number
  task_type:         string
  base_duration_min: number
  unit_label:        string | null
  notes:             string | null
  created_at:        string
  updated_at:        string
}

export interface LaborStandardInput {
  task_type:         string
  base_duration_min: number
  unit_label?:       string | null
  notes?:            string | null
}

export function useLaborStandards() {
  const [standards, setStandards] = useState<LaborStandard[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('labor_standards')
        .select('*')
        .order('task_type', { ascending: true })
      if (err) throw err
      setStandards((data ?? []) as LaborStandard[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar estándares')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refetch() }, [refetch])

  // Realtime — cualquier cambio refresca la lista (vista única, equipo chico).
  useEffect(() => {
    const channel = supabase
      .channel('labor-standards')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'labor_standards' }, () => {
        refetch()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [refetch])

  const upsert = useCallback(async (input: LaborStandardInput) => {
    const { error: err } = await supabase
      .from('labor_standards')
      .upsert(input, { onConflict: 'task_type' })
    if (err) throw err
  }, [])

  const remove = useCallback(async (id: number) => {
    const { error: err } = await supabase
      .from('labor_standards')
      .delete()
      .eq('id', id)
    if (err) throw err
  }, [])

  // Helper para buscar el estándar de un tipo (úsalo en el form de asignación
  // del pizarrón para sugerir duración estimada).
  const getStandard = useCallback((task_type: string) => {
    return standards.find(s => s.task_type === task_type) ?? null
  }, [standards])

  return { standards, loading, error, refetch, upsert, remove, getStandard }
}
