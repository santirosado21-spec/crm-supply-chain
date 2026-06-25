import { useRef } from 'react'
import { Upload, FileSpreadsheet, XCircle } from 'lucide-react'

interface Props {
  fileName:  string
  onFile:    (file: File) => void
  onClear:   () => void
  label?:    string
  hint?:     string
  disabled?: boolean
}

/** Dropzone drag&drop para la nota de entrada (PDF / Excel / CSV). */
export function NotaDropzone({ fileName, onFile, onClear, label, hint, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <label className="text-xs font-semibold text-gray-600 mb-3 block">
        {label ?? 'Nota de entrada (PDF o Excel)'}
      </label>
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          disabled ? 'border-gray-100 bg-gray-50/60 cursor-not-allowed opacity-60' :
          fileName
            ? 'border-green-300 bg-green-50/50 cursor-pointer'
            : 'border-gray-200 hover:border-[#1e3a5f]/30 hover:bg-gray-50 cursor-pointer'
        }`}
        onClick={() => { if (!disabled) inputRef.current?.click() }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          if (disabled) return
          if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0])
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.csv"
          className="hidden"
          disabled={disabled}
          onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]) }}
        />
        {fileName ? (
          <div className="flex min-w-0 items-center justify-center gap-2">
            <FileSpreadsheet size={18} className="text-green-600" />
            <span className="min-w-0 truncate text-sm font-medium text-green-700">{fileName}</span>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onClear() }}
              className="ml-2 text-gray-400 hover:text-red-500"
            >
              <XCircle size={14} />
            </button>
          </div>
        ) : (
          <>
            <Upload size={28} className="text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-400">{hint ?? 'Arrastra o haz clic para subir el documento'}</p>
            <p className="text-[10px] text-gray-300 mt-1">PDF, XLS, XLSX, CSV</p>
          </>
        )}
      </div>
    </div>
  )
}
