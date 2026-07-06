import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { LeadNote } from '../types/leads'

export function useLeadNotes(leadId: string | undefined) {
  const [notes, setNotes]     = useState<LeadNote[]>([])
  const [loading, setLoading] = useState(false)

  const getNotes = useCallback(async () => {
    if (!leadId) { setNotes([]); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
      if (!error) setNotes((data ?? []) as LeadNote[])
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => { getNotes() }, [getNotes])

  const addNote = useCallback(async (content: string, userEmail: string) => {
    if (!leadId) return
    const { data, error } = await supabase
      .from('lead_notes')
      .insert({ lead_id: leadId, user_email: userEmail, content })
      .select()
      .single()
    if (error) throw new Error(error.message)
    setNotes(prev => [data as LeadNote, ...prev])
  }, [leadId])

  return { notes, loading, getNotes, addNote }
}
