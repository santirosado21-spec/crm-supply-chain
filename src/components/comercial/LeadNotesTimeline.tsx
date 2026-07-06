import { useState } from 'react'
import { Send } from 'lucide-react'
import { Spinner } from '../ui/Spinner'
import { useLeadNotes } from '../../hooks/useLeadNotes'
import { useAuthContext } from '../../context/AuthContext'
import { useToast } from '../../hooks/useToast'

interface Props {
  leadId: string
}

export function LeadNotesTimeline({ leadId }: Props) {
  const { notes, loading, addNote } = useLeadNotes(leadId)
  const { user } = useAuthContext()
  const toast = useToast()
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)

  const handleAdd = async () => {
    const text = content.trim()
    if (!text || !user?.email) return
    setSending(true)
    try {
      await addNote(text, user.email)
      setContent('')
    } catch (e) {
      toast.error('No se pudo agregar la nota', e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd() }
          }}
          rows={2}
          placeholder="Agregar nota de seguimiento..."
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
        />
        <button
          onClick={handleAdd}
          disabled={sending || !content.trim()}
          className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#1e3a5f] text-white hover:opacity-90 disabled:opacity-50 shrink-0"
        >
          {sending ? <Spinner size={14} /> : <Send size={15} />}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-gray-400 gap-2 text-sm">
          <Spinner size={16} /> Cargando notas...
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Sin notas de seguimiento todavía</p>
      ) : (
        <div className="space-y-3">
          {notes.map(n => (
            <div key={n.id} className="border-l-2 border-gray-100 pl-3">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{n.content}</p>
              <p className="text-[11px] text-gray-400 mt-1">
                {n.user_email} · {new Date(n.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
