import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Viaje, ViajeEstado } from '../types/tms'

export type CreateViajeData = Omit<Viaje, 'id' | 'created_at' | 'updated_at' | 'vehiculo_placa' | 'vehiculo_modelo' | 'operador_nombre' | 'operacion_referencia'>
export type UpdateViajeData = Partial<CreateViajeData>

export interface ViajeFilters {
  estado?: ViajeEstado | ''
  vehiculoId?: string
  operadorId?: string
  fechaDesde?: string
  fechaHasta?: string
  operacionId?: string
}

export function useViajes(filters?: ViajeFilters) {
  const [viajes, setViajes] = useState<Viaje[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchViajes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('viajes')
        .select('*')
        .order('created_at', { ascending: false })

      if (filters?.estado) query = query.eq('estado', filters.estado)
      if (filters?.vehiculoId) query = query.eq('vehiculo_id', filters.vehiculoId)
      if (filters?.operadorId) query = query.eq('operador_id', filters.operadorId)
      if (filters?.fechaDesde) query = query.gte('fecha_programada', filters.fechaDesde)
      if (filters?.fechaHasta) query = query.lte('fecha_programada', filters.fechaHasta)
      if (filters?.operacionId) query = query.eq('operacion_id', filters.operacionId)

      const { data, error: err } = await query
      if (err) throw err
      setViajes((data ?? []) as Viaje[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar viajes')
    } finally {
      setLoading(false)
    }
  }, [filters?.estado, filters?.vehiculoId, filters?.operadorId, filters?.fechaDesde, filters?.fechaHasta, filters?.operacionId])

  useEffect(() => { fetchViajes() }, [fetchViajes])

  const getByOperacion = useCallback(async (operacionId: string): Promise<Viaje[]> => {
    const { data, error: err } = await supabase
      .from('viajes')
      .select('*')
      .eq('operacion_id', operacionId)
      .order('created_at', { ascending: false })
    if (err) throw new Error(err.message)
    return (data ?? []) as Viaje[]
  }, [])

  const createViaje = useCallback(async (data: CreateViajeData) => {
    const costoTotal = (data.costo_combustible || 0) + (data.costo_casetas || 0) + (data.costo_viaticos || 0) + (data.costo_proveedor || 0)
    const margen = (data.ingreso_cliente || 0) - costoTotal
    const payload = { ...data, costo_total: costoTotal, margen }

    const { data: created, error: err } = await supabase
      .from('viajes')
      .insert(payload)
      .select()
      .single()
    if (err) throw new Error(err.message)
    const v = created as Viaje
    setViajes(prev => [v, ...prev])
    return v
  }, [])

  const updateViaje = useCallback(async (id: string, data: UpdateViajeData) => {
    // Recalcula costo_total/margen leyendo los costos ACTUALES del registro en
    // la BD, no del estado local — que puede estar desactualizado si otro
    // usuario o pestaña editó el viaje (useViajes no tiene canal realtime).
    const { data: existing } = await supabase
      .from('viajes')
      .select('costo_combustible, costo_casetas, costo_viaticos, costo_proveedor, ingreso_cliente')
      .eq('id', id)
      .single()
    const combustible = data.costo_combustible ?? existing?.costo_combustible ?? 0
    const casetas = data.costo_casetas ?? existing?.costo_casetas ?? 0
    const viaticos = data.costo_viaticos ?? existing?.costo_viaticos ?? 0
    const proveedor = data.costo_proveedor ?? existing?.costo_proveedor ?? 0
    const ingreso = data.ingreso_cliente ?? existing?.ingreso_cliente ?? 0
    const costoTotal = combustible + casetas + viaticos + proveedor
    const margen = ingreso - costoTotal

    const { data: updated, error: err } = await supabase
      .from('viajes')
      .update({ ...data, costo_total: costoTotal, margen, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (err) throw new Error(err.message)
    const v = updated as Viaje
    setViajes(prev => prev.map(x => x.id === id ? v : x))
    return v
  }, [])

  const deleteViaje = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('viajes').delete().eq('id', id)
    if (err) throw new Error(err.message)
    setViajes(prev => prev.filter(x => x.id !== id))
  }, [])

  // Workflow transitions
  const assignTrip = useCallback(async (id: string, vehiculoId: string, operadorId: string) => {
    return updateViaje(id, { vehiculo_id: vehiculoId, operador_id: operadorId, estado: 'asignado' })
  }, [updateViaje])

  const startTrip = useCallback(async (id: string) => {
    return updateViaje(id, { estado: 'en_transito', fecha_salida: new Date().toISOString() })
  }, [updateViaje])

  const completeTrip = useCallback(async (id: string, kmReales: number, costos?: { combustible?: number; casetas?: number; viaticos?: number; proveedor?: number }) => {
    return updateViaje(id, {
      estado: 'completado',
      km_reales: kmReales,
      fecha_completado: new Date().toISOString(),
      ...(costos?.combustible !== undefined && { costo_combustible: costos.combustible }),
      ...(costos?.casetas !== undefined && { costo_casetas: costos.casetas }),
      ...(costos?.viaticos !== undefined && { costo_viaticos: costos.viaticos }),
      ...(costos?.proveedor !== undefined && { costo_proveedor: costos.proveedor }),
    })
  }, [updateViaje])

  const stats = {
    total: viajes.length,
    enTransito: viajes.filter(v => v.estado === 'en_transito').length,
    completados: viajes.filter(v => v.estado === 'completado').length,
    costoTotal: viajes.reduce((s, v) => s + (v.costo_total || 0), 0),
    ingresoTotal: viajes.reduce((s, v) => s + (v.ingreso_cliente || 0), 0),
    margenTotal: viajes.reduce((s, v) => s + (v.margen || 0), 0),
  }

  return {
    viajes, loading, error, stats,
    fetchViajes, getByOperacion,
    createViaje, updateViaje, deleteViaje,
    assignTrip, startTrip, completeTrip,
  }
}
