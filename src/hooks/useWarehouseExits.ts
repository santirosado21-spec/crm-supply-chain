import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { WarehouseExit, ExitItem } from '../types/warehouseExit'

/**
 * Hook CRUD + realtime sobre `warehouse_exits`. Patrón copiado de
 * useWarehouseEntries.ts, simplificado (una sola pantalla: crear + cerrar).
 */
export function useWarehouseExits() {
  const [exits, setExits] = useState<WarehouseExit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchExits = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('warehouse_exits')
        .select('*')
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
      if (err) throw err
      setExits((data ?? []) as WarehouseExit[])
    } catch (e) {
      setExits([])
      setError(e instanceof Error ? e.message : 'Error al cargar salidas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchExits() }, [fetchExits])

  const fetchRef = useRef(fetchExits)
  useEffect(() => { fetchRef.current = fetchExits }, [fetchExits])

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null
    const channel = supabase
      .channel('warehouse-exits-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'warehouse_exits' },
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

  const createExit = useCallback(async (data: {
    ref: string
    customer_name: string
    items: ExitItem[]
    notas?: string
    created_by?: string | null
  }): Promise<WarehouseExit> => {
    const { data: created, error: err } = await supabase
      .from('warehouse_exits')
      .insert({
        ref: data.ref || null,
        customer_name: data.customer_name,
        items: data.items,
        notas: data.notas ?? '',
        created_by: data.created_by ?? null,
      })
      .select()
      .single()
    if (err) throw new Error(err.message)
    return created as WarehouseExit
  }, [])

  const closeExit = useCallback(async (id: string, evidenceUrl: string): Promise<void> => {
    const { error: err } = await supabase.rpc('warehouse_exit_close', {
      p_id: id,
      p_evidence_url: evidenceUrl,
    })
    if (err) throw new Error(err.message)
  }, [])

  const cancelExit = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase
      .from('warehouse_exits')
      .update({ status: 'cancelada' })
      .eq('id', id)
    if (err) throw new Error(err.message)
  }, [])

  return { exits, loading, error, refetch: fetchExits, createExit, closeExit, cancelExit }
}
