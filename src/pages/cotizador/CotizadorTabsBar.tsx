import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { Plus, X, Check, Copy } from 'lucide-react'
import { useCotizadorTabs } from './CotizadorTabsContext'

/*
  Barra de pestañas estilo Chrome — arriba del formulario del Cotizador.
  - Click corto: cambia de tab.
  - Doble-click: renombrar inline.
  - × : cerrar tab (siempre queda al menos 1).
  - +: nueva tab vacía.
  - Badge verde "✓" si la tab ya fue guardada (savedViajeId != null).
*/
export function CotizadorTabsBar() {
  const {
    tabs, activeTabId, addTab, closeTab, renameTab, selectTab, duplicateActive,
  } = useCotizadorTabs()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  const startEdit = (id: string, label: string) => {
    setEditingId(id)
    setDraft(label)
  }
  const commitEdit = () => {
    if (editingId) renameTab(editingId, draft)
    setEditingId(null)
  }
  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') setEditingId(null)
  }

  return (
    <div className="flex items-center gap-1 px-3 pt-2 bg-gray-100 border-b border-gray-200 overflow-x-auto">
      {tabs.map(tab => {
        const active = tab.id === activeTabId
        const saved = tab.savedViajeId !== null
        return (
          <div
            key={tab.id}
            onClick={() => !editingId && selectTab(tab.id)}
            onDoubleClick={() => startEdit(tab.id, tab.label)}
            className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs font-medium border-t border-l border-r cursor-pointer transition-colors shrink-0 ${
              active
                ? 'bg-white border-gray-200 text-[#1e3a5f] font-bold -mb-px'
                : 'bg-gray-50 border-transparent text-gray-500 hover:bg-white/60'
            }`}
            title={saved ? `Guardada · viaje #${tab.savedViajeId?.slice(0, 8)}` : tab.label}
          >
            {saved && <Check size={11} className="text-green-600 shrink-0" />}
            {editingId === tab.id ? (
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleKey}
                onClick={e => e.stopPropagation()}
                className="bg-transparent outline-none border-b border-[#1e3a5f] text-xs font-bold w-32 px-0.5"
              />
            ) : (
              <span className="truncate max-w-[160px]">{tab.label}</span>
            )}
            {tabs.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
                className={`shrink-0 rounded p-0.5 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} text-gray-400 hover:text-red-600 hover:bg-red-50 transition-opacity`}
                title="Cerrar pestaña"
              >
                <X size={11} />
              </button>
            )}
          </div>
        )
      })}
      <button
        onClick={() => addTab()}
        className="shrink-0 px-2 py-1.5 text-gray-500 hover:text-[#1e3a5f] hover:bg-white rounded-t-lg transition-colors"
        title="Nueva cotización"
      >
        <Plus size={14} />
      </button>
      <div className="flex-1" />
      <button
        onClick={duplicateActive}
        className="shrink-0 mb-0.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-[#1e3a5f] hover:bg-white rounded-lg transition-colors flex items-center gap-1"
        title="Duplicar la pestaña activa"
      >
        <Copy size={11} /> Duplicar
      </button>
    </div>
  )
}
