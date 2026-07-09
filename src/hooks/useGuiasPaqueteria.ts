// Resucitado desde el commit 534a31f (módulo SAC · Guías de paquetería),
// sin cambios estructurales — solo el tipo GuiaPaqueteria ganó facturado_en_proforma_id.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { GuiaPaqueteria, CreateGuiaData, UpdateGuiaData, GuiaFilters } from '../types/guias'

export function useGuiasPaqueteria(filters?: GuiaFilters) {
  const [guias, setGuias]     = useState<GuiaPaqueteria[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetchGuias = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      let q = supabase
        .from('guias_paqueteria')
        .select('*')
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })

      if (filters?.clienteId)  q = q.eq('cliente_id', filters.clienteId)
      if (filters?.paqueteria) q = q.eq('paqueteria', filters.paqueteria)
      if (filters?.origen)     q = q.eq('origen',     filters.origen)
      if (filters?.fechaDesde) q = q.gte('fecha', filters.fechaDesde)
      if (filters?.fechaHasta) q = q.lte('fecha', filters.fechaHasta)
      if (filters?.search) {
        const s = filters.search.replace(/[%_]/g, '\\$&')
        q = q.or(`tracking_number.ilike.%${s}%,manual_reference.ilike.%${s}%,cliente_codigo.ilike.%${s}%`)
      }

      const { data, error: err } = await q
      if (err) throw err
      setGuias((data ?? []) as GuiaPaqueteria[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar guías')
    } finally {
      setLoading(false)
    }
  }, [filters?.clienteId, filters?.paqueteria, filters?.origen, filters?.fechaDesde, filters?.fechaHasta, filters?.search])

  useEffect(() => { fetchGuias() }, [fetchGuias])

  const create = useCallback(async (data: CreateGuiaData): Promise<GuiaPaqueteria> => {
    const { data: created, error: err } = await supabase
      .from('guias_paqueteria')
      .insert(data)
      .select()
      .single()
    if (err) throw new Error(err.message)
    const g = created as GuiaPaqueteria
    setGuias(prev => [g, ...prev])
    return g
  }, [])

  const update = useCallback(async (id: string, data: UpdateGuiaData): Promise<GuiaPaqueteria> => {
    const { data: updated, error: err } = await supabase
      .from('guias_paqueteria')
      .update(data)
      .eq('id', id)
      .select()
      .single()
    if (err) throw new Error(err.message)
    const g = updated as GuiaPaqueteria
    setGuias(prev => prev.map(x => x.id === id ? g : x))
    return g
  }, [])

  const remove = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase.from('guias_paqueteria').delete().eq('id', id)
    if (err) throw new Error(err.message)
    setGuias(prev => prev.filter(x => x.id !== id))
  }, [])

  const kpis = useMemo(() => ({
    numGuias:    guias.length,
    totalCosto:  guias.reduce((s, g) => s + Number(g.costo  || 0), 0),
    totalPrecio: guias.reduce((s, g) => s + Number(g.precio || 0), 0),
    totalMargen: guias.reduce((s, g) => s + Number(g.margen || 0), 0),
  }), [guias])

  return { guias, loading, error, kpis, refetch: fetchGuias, create, update, remove }
}
