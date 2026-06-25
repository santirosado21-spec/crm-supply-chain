import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { WarehouseEntry } from '../types/warehouseEntry'

export type CreateWarehouseEntryData = Partial<Omit<WarehouseEntry, 'id' | 'created_at' | 'updated_at'>>
export type UpdateWarehouseEntryData = Partial<Omit<WarehouseEntry, 'id' | 'created_at' | 'updated_at'>>

/**
 * Hook CRUD + realtime sobre `warehouse_entries` — respalda el wizard de
 * entradas y la página de historial. Patrón copiado de useOperations.ts.
 */
export function useWarehouseEntries() {
  const [entries, setEntries] = useState<WarehouseEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('warehouse_entries')
        .select('*')
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
      if (err) throw err
      setEntries((data ?? []) as WarehouseEntry[])
    } catch (e) {
      setEntries([])
      setError(e instanceof Error ? e.message : 'Error al cargar entradas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const fetchRef = useRef(fetchEntries)
  useEffect(() => { fetchRef.current = fetchEntries }, [fetchEntries])

  // Realtime: re-consulta ante cualquier cambio (debounce colapsa ráfagas).
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null
    const channel = supabase
      .channel('warehouse-entries-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'warehouse_entries' },
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

  return { entries, loading, error, refetch: fetchEntries }
}

// ── Acciones standalone (usables fuera de un componente con el hook) ──────────

export async function createWarehouseEntry(
  data: CreateWarehouseEntryData,
): Promise<WarehouseEntry> {
  const { data: created, error } = await supabase
    .from('warehouse_entries')
    .insert(data)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return created as WarehouseEntry
}

export async function updateWarehouseEntry(
  id: string,
  data: UpdateWarehouseEntryData,
): Promise<WarehouseEntry> {
  const { data: updated, error } = await supabase
    .from('warehouse_entries')
    .update(data)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return updated as WarehouseEntry
}

export async function getWarehouseEntry(id: string): Promise<WarehouseEntry | undefined> {
  const { data, error } = await supabase
    .from('warehouse_entries')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return undefined
  return data as WarehouseEntry
}

export async function deleteWarehouseEntry(id: string): Promise<void> {
  const { error } = await supabase
    .from('warehouse_entries')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}
