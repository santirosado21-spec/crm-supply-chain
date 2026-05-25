import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Task, TaskStatus, TaskCategory } from '../types/tasks'

const TASK_SELECT = `
  id, ref, title, description, category_id, client_id, operation_id,
  assigner_email, assignee_email, scheduled_start, scheduled_end,
  status, rejection_reason, template_id, created_at,
  category:task_categories ( id, code, name, color, is_billable ),
  client:clients ( id, name, codigo )
`

export interface TaskFilter {
  forEmail?:  string                  // tareas que me involucran (asignadas o creadas por mí)
  assignee?:  string
  assigner?:  string
  statuses?:  TaskStatus[]
  fromDate?:  string                  // ISO yyyy-mm-dd
  toDate?:    string
  clientId?:  string
}

export interface CreateTaskInput {
  title:           string
  description?:    string
  category_id:     string | null
  client_id:       string | null
  operation_id:    string | null
  assigner_email:  string
  assignee_email:  string
  scheduled_start: string
  scheduled_end:   string
  // Sprint B · Vínculo a Extensiv (todos opcionales — se llena por el picker)
  extensiv_transaction_type?: 'order' | 'receipt' | 'adjustment' | 'manual' | null
  extensiv_transaction_id?:   string | null
  extensiv_customer_id?:      number | null
  extensiv_reference?:        string | null
  extensiv_raw?:              unknown
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const list = useCallback(async (f: TaskFilter = {}): Promise<Task[]> => {
    setLoading(true)
    setError(null)
    try {
      let q = supabase.from('tasks').select(TASK_SELECT).order('scheduled_start', { ascending: true })

      if (f.forEmail) q = q.or(`assignee_email.eq.${f.forEmail},assigner_email.eq.${f.forEmail}`)
      if (f.assignee) q = q.eq('assignee_email', f.assignee)
      if (f.assigner) q = q.eq('assigner_email', f.assigner)
      if (f.statuses && f.statuses.length) q = q.in('status', f.statuses)
      if (f.clientId) q = q.eq('client_id', f.clientId)
      if (f.fromDate) q = q.gte('scheduled_start', f.fromDate)
      if (f.toDate)   q = q.lte('scheduled_start', f.toDate)

      const { data, error } = await q
      if (error) throw error
      const result = (data ?? []) as unknown as Task[]
      setTasks(result)
      return result
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const get = useCallback(async (id: string): Promise<Task | null> => {
    const { data, error } = await supabase
      .from('tasks')
      .select(TASK_SELECT)
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as unknown as Task | null)
  }, [])

  const create = useCallback(async (input: CreateTaskInput): Promise<Task> => {
    // Usa el RPC task_create_safe con guards de negocio (no pasado, no auto, exclude overlap)
    const { data, error } = await supabase.rpc('task_create_safe', {
      p_title:           input.title,
      p_description:     input.description ?? '',
      p_category_id:     input.category_id,
      p_client_id:       input.client_id,
      p_operation_id:    input.operation_id,
      p_assignee_email:  input.assignee_email,
      p_scheduled_start: input.scheduled_start,
      p_scheduled_end:   input.scheduled_end,
      // Sprint B · campos Extensiv opcionales
      p_extensiv_transaction_type: input.extensiv_transaction_type ?? null,
      p_extensiv_transaction_id:   input.extensiv_transaction_id   ?? null,
      p_extensiv_customer_id:      input.extensiv_customer_id      ?? null,
      p_extensiv_reference:        input.extensiv_reference        ?? null,
      p_extensiv_raw:              input.extensiv_raw              ?? null,
    })
    if (error) throw new Error(error.message)
    return data as Task
  }, [])

  const updateStatus = useCallback(async (
    id: string,
    status: TaskStatus,
    rejection_reason?: string,
  ): Promise<void> => {
    const { error } = await supabase.rpc('task_change_status', {
      p_task_id:          id,
      p_new_status:       status,
      p_rejection_reason: rejection_reason ?? null,
    })
    if (error) throw new Error(error.message)
  }, [])

  return { tasks, loading, error, list, get, create, updateStatus }
}

// ── Categorías (cache con TTL) ───────────────────────────────────────────────
// TTL para que una categoría creada/editada en TeamSettings aparezca sin
// necesidad de recargar la página (antes el cache vivía para siempre).
let _categoryCache: { data: TaskCategory[]; at: number } | null = null
const CATEGORY_TTL_MS = 5 * 60 * 1000

export async function getTaskCategories(): Promise<TaskCategory[]> {
  if (_categoryCache && Date.now() - _categoryCache.at < CATEGORY_TTL_MS) {
    return _categoryCache.data
  }
  const { data, error } = await supabase.from('task_categories').select('*').order('name')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as TaskCategory[]
  _categoryCache = { data: rows, at: Date.now() }
  return rows
}
