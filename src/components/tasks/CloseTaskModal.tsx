import { useState } from 'react'
import { Loader2, Link2 } from 'lucide-react'

const DRIVE_URL_RE = /(drive|docs)\.google\.com/i

interface Props {
  title?:      string
  taskTitle?:  string | null
  busy?:       boolean
  onCancel:    () => void
  onConfirm:   (evidenceUrl: string) => void | Promise<void>
}

/** Modal compartido: pide el link de Google Drive obligatorio para cerrar una tarea, entrada o salida. */
export function CloseTaskModal({ title = 'Cerrar tarea', taskTitle, busy = false, onCancel, onConfirm }: Props) {
  const [url, setUrl] = useState('')
  const [touched, setTouched] = useState(false)

  const valid = DRIVE_URL_RE.test(url.trim())

  const handleConfirm = () => {
    setTouched(true)
    if (!valid) return
    void onConfirm(url.trim())
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 animate-fade-in"
      onClick={() => !busy && onCancel()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[#1e3a5f] mb-1">{title}</h2>
        {taskTitle && <p className="text-xs text-gray-500 mb-4">{taskTitle}</p>}
        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
          Link de Google Drive con la evidencia <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="url"
            autoFocus
            value={url}
            onChange={e => setUrl(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
            placeholder="https://drive.google.com/..."
            className={`w-full h-11 pl-9 pr-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 ${
              touched && !valid ? 'border-red-300 bg-red-50/30' : 'border-gray-200'
            }`}
          />
        </div>
        {touched && !valid && (
          <p className="text-[10px] text-red-600 mt-1.5">
            Pega un link válido de Google Drive o Docs.
          </p>
        )}
        <div className="flex gap-2 mt-5">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 h-10 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="flex-1 h-10 rounded-lg bg-[#1e3a5f] text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#16304d] disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : title}
          </button>
        </div>
      </div>
    </div>
  )
}
