import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  isExtensivConfigured, getExtensivCustomers, type ExtensivCustomer,
} from '../../../../lib/extensiv'

interface Props {
  value:      number | null
  onChange:   (id: number, name: string) => void
  disabled?:  boolean
  /** Slot bajo el selector para mostrar estado (cargando catálogo, conteo…). */
  statusSlot?: ReactNode
}

/** Selector de cliente de Extensiv reutilizable (Paso 1 y Paso 3). */
export function ClienteExtensivSelector({ value, onChange, disabled, statusSlot }: Props) {
  const apiConfigured = isExtensivConfigured()
  const [customers, setCustomers] = useState<ExtensivCustomer[]>([])

  useEffect(() => {
    if (!apiConfigured) return
    getExtensivCustomers()
      .then(setCustomers)
      .catch(e => console.warn('Could not load Extensiv customers:', e))
  }, [apiConfigured])

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
      <label className="text-xs font-semibold text-gray-600 block">Cliente en Extensiv</label>
      {apiConfigured ? (
        <>
          <select
            value={value ?? ''}
            disabled={disabled}
            onChange={e => {
              const id = e.target.value ? Number(e.target.value) : 0
              if (!id) return
              const name = customers.find(c => c.id === id)?.name ?? ''
              onChange(id, name)
            }}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="">Seleccionar cliente...</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {statusSlot}
        </>
      ) : (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
          <AlertTriangle size={14} />
          <span>API de Extensiv no configurada.</span>
        </div>
      )}
    </div>
  )
}
