import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CartaPorte } from '../types/cartaPorte'

export type CreateCartaPorteData = Omit<CartaPorte, 'id' | 'folio' | 'created_at' | 'updated_at'> & {
  folio?: string
}
export type UpdateCartaPorteData = Partial<Omit<CartaPorte, 'id' | 'created_at'>>

const FOLIO_PREFIX = 'CP'

function nextFolio(existing: string[]): string {
  const year = new Date().getFullYear()
  const re = new RegExp(`^${FOLIO_PREFIX}-${year}-(\\d+)$`)
  const max = existing.reduce((acc, f) => {
    const m = f.match(re)
    if (!m) return acc
    const n = Number(m[1])
    return n > acc ? n : acc
  }, 0)
  return `${FOLIO_PREFIX}-${year}-${String(max + 1).padStart(4, '0')}`
}

export function useCartasPorte() {
  const [cartas, setCartas] = useState<CartaPorte[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setError(null)
    try {
      // Últimos 90 días para historial.
      const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
      const { data, error: err } = await supabase
        .from('cartas_porte')
        .select('*')
        .gte('fecha', since)
        .order('fecha', { ascending: false })
      if (err) throw err
      setCartas((data ?? []) as CartaPorte[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar cartas porte')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refetch() }, [refetch])

  useEffect(() => {
    const channel = supabase
      .channel('cartas-porte-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartas_porte' }, () => {
        refetch()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [refetch])

  const createCartaPorte = useCallback(async (data: CreateCartaPorteData) => {
    // Folio: si no viene, calcular CP-YYYY-NNNN leyendo MAX actual.
    let folio = data.folio
    if (!folio) {
      const year = new Date().getFullYear()
      const { data: existing } = await supabase
        .from('cartas_porte')
        .select('folio')
        .ilike('folio', `${FOLIO_PREFIX}-${year}-%`)
      folio = nextFolio((existing ?? []).map(r => (r as { folio: string }).folio))
    }

    const payload = { ...data, folio }
    const { data: created, error: err } = await supabase
      .from('cartas_porte')
      .insert(payload)
      .select()
      .single()
    if (err) throw new Error(err.message)
    const cp = created as CartaPorte
    setCartas(prev => [cp, ...prev])
    return cp
  }, [])

  const updateCartaPorte = useCallback(async (id: string, patch: UpdateCartaPorteData) => {
    const { data: updated, error: err } = await supabase
      .from('cartas_porte')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (err) throw new Error(err.message)
    const cp = updated as CartaPorte
    setCartas(prev => prev.map(x => x.id === id ? cp : x))
    return cp
  }, [])

  return { cartas, loading, error, refetch, createCartaPorte, updateCartaPorte }
}
