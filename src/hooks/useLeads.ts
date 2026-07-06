import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Lead, LeadChannel, LeadStage, LeadPriority } from '../types/leads'

export type CreateLeadData = Omit<Lead, 'id' | 'ref' | 'created_at' | 'updated_at'>
export type UpdateLeadData = Partial<Omit<CreateLeadData, 'created_by'>>

export interface LeadFilters {
  canal?:       LeadChannel | ''
  estatus?:     LeadStage | ''
  responsable?: string
  prioridad?:   LeadPriority | ''
  fechaDesde?:  string
  fechaHasta?:  string
}

export function useLeads(filters?: LeadFilters) {
  const [leads, setLeads]     = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('leads')
        .select('*')
        .order('fecha_entrada', { ascending: false })

      if (filters?.canal)       query = query.eq('canal', filters.canal)
      if (filters?.estatus)     query = query.eq('estatus', filters.estatus)
      if (filters?.responsable) query = query.eq('responsable_comercial', filters.responsable)
      if (filters?.prioridad)   query = query.eq('prioridad', filters.prioridad)
      if (filters?.fechaDesde)  query = query.gte('fecha_entrada', filters.fechaDesde)
      if (filters?.fechaHasta)  query = query.lte('fecha_entrada', filters.fechaHasta)

      const { data, error: err } = await query
      if (err) throw err
      setLeads((data ?? []) as Lead[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar leads')
    } finally {
      setLoading(false)
    }
  }, [filters?.canal, filters?.estatus, filters?.responsable, filters?.prioridad, filters?.fechaDesde, filters?.fechaHasta])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  // Mantiene la última fetchLeads (cambia con los filtros) sin re-suscribir
  // el canal realtime en cada cambio de filtro — mismo patrón que useOperations.
  const fetchRef = useRef(fetchLeads)
  useEffect(() => { fetchRef.current = fetchLeads }, [fetchLeads])

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null
    const channel = supabase
      .channel('leads-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        () => {
          if (debounce) clearTimeout(debounce)
          debounce = setTimeout(() => { fetchRef.current() }, 300)
        },
      )
      .subscribe()
    return () => {
      if (debounce) clearTimeout(debounce)
      supabase.removeChannel(channel)
    }
  }, [])

  const getLead = useCallback(async (id: string): Promise<Lead> => {
    const { data, error: err } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single()
    if (err) throw new Error(err.message)
    return data as Lead
  }, [])

  const createLead = useCallback(async (data: CreateLeadData): Promise<Lead> => {
    const { data: created, error: err } = await supabase
      .from('leads')
      .insert(data)
      .select()
      .single()
    if (err) throw new Error(err.message)
    const lead = created as Lead
    setLeads(prev => [lead, ...prev])
    return lead
  }, [])

  const updateLead = useCallback(async (id: string, patch: UpdateLeadData): Promise<Lead> => {
    const { data: updated, error: err } = await supabase
      .from('leads')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (err) throw new Error(err.message)
    const lead = updated as Lead
    setLeads(prev => prev.map(l => (l.id === id ? lead : l)))
    return lead
  }, [])

  const deleteLead = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase.from('leads').delete().eq('id', id)
    if (err) throw new Error(err.message)
    setLeads(prev => prev.filter(l => l.id !== id))
  }, [])

  return { leads, loading, error, fetchLeads, getLead, createLead, updateLead, deleteLead }
}
