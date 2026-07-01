import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { TagDimension, TaskTag } from '../types/tasks'

// ── Catálogo de etiquetas (cache con TTL, igual que getTaskCategories) ────────
// Para que una etiqueta creada/editada en TagsAdmin aparezca sin recargar.
let _tagCache: { data: TaskTag[]; at: number } | null = null
const TAG_TTL_MS = 5 * 60 * 1000

const TAG_SELECT = 'id, dimension, label, color, sort_order, active'

/** Devuelve TODAS las etiquetas activas (cacheadas). Útil en formularios/filtros. */
export async function getTaskTags(force = false): Promise<TaskTag[]> {
  if (!force && _tagCache && Date.now() - _tagCache.at < TAG_TTL_MS) {
    return _tagCache.data
  }
  const { data, error } = await supabase
    .from('task_tags')
    .select(TAG_SELECT)
    .eq('active', true)
    .order('dimension')
    .order('sort_order')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as TaskTag[]
  _tagCache = { data: rows, at: Date.now() }
  return rows
}

/** Agrupa una lista plana de etiquetas por dimensión. */
export function groupTagsByDimension(tags: TaskTag[]): Record<TagDimension, TaskTag[]> {
  const out = { movimiento: [], area: [], actividad: [], prioridad: [], proveedor: [] } as Record<TagDimension, TaskTag[]>
  for (const t of tags) (out[t.dimension] ??= []).push(t)
  return out
}

// ── Hook para formularios/filtros: etiquetas activas agrupadas ────────────────
export function useTaskTags() {
  const [tags, setTags] = useState<TaskTag[]>([])
  const [byDimension, setByDimension] = useState<Record<TagDimension, TaskTag[]>>(
    () => groupTagsByDimension([]),
  )
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getTaskTags(true)
      setTags(rows)
      setByDimension(groupTagsByDimension(rows))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    getTaskTags()
      .then(rows => { setTags(rows); setByDimension(groupTagsByDimension(rows)) })
      .finally(() => setLoading(false))
  }, [])

  return { tags, byDimension, loading, refresh }
}

// ── Helpers admin (CRUD del catálogo — RLS exige admin) ───────────────────────
export interface TagInput {
  dimension:   TagDimension
  label:       string
  color:       string
  sort_order?: number
}

export async function createTag(input: TagInput): Promise<TaskTag> {
  const { data, error } = await supabase
    .from('task_tags')
    .insert({
      dimension:  input.dimension,
      label:      input.label.trim(),
      color:      input.color,
      sort_order: input.sort_order ?? 100,
    })
    .select(TAG_SELECT)
    .single()
  if (error) throw new Error(error.message)
  _tagCache = null
  return data as TaskTag
}

export async function updateTag(id: string, patch: Partial<TagInput> & { active?: boolean }): Promise<TaskTag> {
  const { data, error } = await supabase
    .from('task_tags')
    .update(patch)
    .eq('id', id)
    .select(TAG_SELECT)
    .single()
  if (error) throw new Error(error.message)
  _tagCache = null
  return data as TaskTag
}

/** Listado completo para admin (incluye inactivas). */
export async function listAllTags(): Promise<TaskTag[]> {
  const { data, error } = await supabase
    .from('task_tags')
    .select(TAG_SELECT)
    .order('dimension')
    .order('sort_order')
  if (error) throw new Error(error.message)
  return (data ?? []) as TaskTag[]
}
