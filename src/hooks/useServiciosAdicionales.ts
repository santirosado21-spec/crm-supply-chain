import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Tipos
export interface ServicioAdicional {
  id: string
  operacion_id: string | null
  referencia: string
  cliente_codigo: string
  cliente_nombre: string
  categoria: string
  concepto: string
  descripcion: string
  cantidad: number
  unidad: string
  precio_unitario: number
  subtotal: number
  moneda: string
  tarifa_id: string | null
  registrado_por: string
  fecha_servicio: string
  notas: string
  created_at: string
}

export type CreateServicioData = Omit<ServicioAdicional, 'id' | 'created_at'>

export interface ServicioFilters {
  clienteCodigo?: string
  fechaDesde?: string
  fechaHasta?: string
  categoria?: string
  operacionId?: string
}

export function useServiciosAdicionales(filters?: ServicioFilters) {
  const [servicios, setServicios] = useState<ServicioAdicional[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch con filtros
  const fetchServicios = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('servicios_adicionales')
        .select('*')
        .order('fecha_servicio', { ascending: false })
        .order('created_at', { ascending: false })

      if (filters?.clienteCodigo) query = query.eq('cliente_codigo', filters.clienteCodigo)
      if (filters?.fechaDesde) query = query.gte('fecha_servicio', filters.fechaDesde)
      if (filters?.fechaHasta) query = query.lte('fecha_servicio', filters.fechaHasta)
      if (filters?.categoria) query = query.eq('categoria', filters.categoria)
      if (filters?.operacionId) query = query.eq('operacion_id', filters.operacionId)

      const { data, error: err } = await query
      if (err) throw err
      setServicios((data ?? []) as ServicioAdicional[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar servicios')
    } finally {
      setLoading(false)
    }
  }, [filters?.clienteCodigo, filters?.fechaDesde, filters?.fechaHasta, filters?.categoria, filters?.operacionId])

  // Servicios por operación
  const getByOperacion = useCallback(async (operacionId: string): Promise<ServicioAdicional[]> => {
    const { data, error: err } = await supabase
      .from('servicios_adicionales')
      .select('*')
      .eq('operacion_id', operacionId)
      .order('created_at')

    if (err) return []
    return (data ?? []) as ServicioAdicional[]
  }, [])

  // Servicios por cliente en un periodo (para RC)
  const getByClientePeriodo = useCallback(async (
    clienteCodigo: string,
    fechaDesde: string,
    fechaHasta: string
  ): Promise<ServicioAdicional[]> => {
    const { data, error: err } = await supabase
      .from('servicios_adicionales')
      .select('*')
      .eq('cliente_codigo', clienteCodigo)
      .gte('fecha_servicio', fechaDesde)
      .lte('fecha_servicio', fechaHasta)
      .order('fecha_servicio')

    if (err) return []
    return (data ?? []) as ServicioAdicional[]
  }, [])

  // Crear servicio
  const createServicio = useCallback(async (input: CreateServicioData): Promise<ServicioAdicional> => {
    const row = { ...input, subtotal: input.cantidad * input.precio_unitario }

    const { data, error: err } = await supabase
      .from('servicios_adicionales')
      .insert(row)
      .select()
      .single()

    if (err) throw new Error(err.message)
    const svc = data as ServicioAdicional
    setServicios(prev => [svc, ...prev])
    return svc
  }, [])

  // Actualizar
  const updateServicio = useCallback(async (
    id: string,
    input: Partial<CreateServicioData>
  ): Promise<ServicioAdicional> => {
    const updates: Record<string, unknown> = { ...input }
    // Recalcula subtotal si cambió cantidad O precio_unitario (antes solo lo
    // hacía cuando venían AMBOS, dejando el subtotal viejo si se editaba uno
    // solo). El valor que no venga en el patch se lee del registro actual.
    if (input.cantidad !== undefined || input.precio_unitario !== undefined) {
      const { data: current } = await supabase
        .from('servicios_adicionales')
        .select('cantidad, precio_unitario')
        .eq('id', id)
        .single()
      const cantidad = input.cantidad ?? current?.cantidad ?? 0
      const precio   = input.precio_unitario ?? current?.precio_unitario ?? 0
      updates.subtotal = cantidad * precio
    }

    const { data, error: err } = await supabase
      .from('servicios_adicionales')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (err) throw new Error(err.message)
    const svc = data as ServicioAdicional
    setServicios(prev => prev.map(s => s.id === id ? svc : s))
    return svc
  }, [])

  // Eliminar
  const deleteServicio = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase
      .from('servicios_adicionales')
      .delete()
      .eq('id', id)

    if (err) throw new Error(err.message)
    setServicios(prev => prev.filter(s => s.id !== id))
  }, [])

  // Stats rápidos
  const stats = {
    total: servicios.length,
    totalMXN: servicios.reduce((s, svc) => s + svc.subtotal, 0),
    porCategoria: servicios.reduce((acc, svc) => {
      acc[svc.categoria] = (acc[svc.categoria] || 0) + svc.subtotal
      return acc
    }, {} as Record<string, number>),
  }

  return {
    servicios,
    loading,
    error,
    stats,
    fetchServicios,
    getByOperacion,
    getByClientePeriodo,
    createServicio,
    updateServicio,
    deleteServicio,
  }
}
