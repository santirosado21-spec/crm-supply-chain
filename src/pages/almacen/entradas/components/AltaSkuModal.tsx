import { useState } from 'react'
import { Loader2, PackagePlus, X, AlertTriangle } from 'lucide-react'
import type { AltaSkuForm } from '../../../../types/warehouseEntry'

interface Props {
  initialSku: string
  busy:       boolean
  onClose:    () => void
  onSubmit:   (form: AltaSkuForm) => void
}

// Unidades de medida más comunes en Extensiv 3PL.
const UOM_OPTIONS = ['EA', 'BOX', 'CASE', 'PALLET', 'KG', 'LB']

/**
 * Modal de alta de un SKU nuevo en Extensiv. Formulario completo (SKU +
 * descripción + unidad de medida + dimensiones L/W/H + peso) — se monta solo
 * cuando hay una fila seleccionada, así el estado arranca limpio cada vez.
 */
export function AltaSkuModal({ initialSku, busy, onClose, onSubmit }: Props) {
  const [sku, setSku] = useState(initialSku)
  const [description, setDescription] = useState('')
  const [unitOfMeasure, setUnitOfMeasure] = useState('EA')
  const [length, setLength] = useState('')
  const [width, setWidth]   = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')

  const canSubmit = sku.trim().length >= 2 && description.trim().length > 0 && !busy

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      sku:           sku.trim().toUpperCase(),
      description:   description.trim(),
      unitOfMeasure,
      length: Number(length) || 0,
      width:  Number(width)  || 0,
      height: Number(height) || 0,
      weight: Number(weight) || 0,
    })
  }

  const numField = (
    label: string, value: string, set: (v: string) => void, unit: string,
  ) => (
    <div>
      <label className="text-[11px] font-semibold text-gray-600 mb-1 block">{label}</label>
      <div className="relative">
        <input
          type="number" min="0" step="0.01" value={value}
          onChange={e => set(e.target.value)}
          className="w-full h-9 px-2.5 pr-9 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">{unit}</span>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <PackagePlus size={18} className="text-[#1e3a5f]" />
            <h3 className="text-base font-bold text-[#1e3a5f]">Dar de alta SKU en Extensiv</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1" title="Cerrar">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
              SKU <span className="text-red-500">*</span>
            </label>
            <input
              type="text" value={sku}
              onChange={e => setSku(e.target.value)}
              className="w-full h-9 px-2.5 rounded-lg border border-gray-200 text-sm font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
              Descripción <span className="text-red-500">*</span>
            </label>
            <input
              type="text" value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ej: Caminadora NordicTrack T Series"
              className="w-full h-9 px-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-600 mb-1 block">Unidad de medida</label>
            <select
              value={unitOfMeasure}
              onChange={e => setUnitOfMeasure(e.target.value)}
              className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
            >
              {UOM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {numField('Largo', length, setLength, 'ft')}
            {numField('Ancho', width, setWidth, 'ft')}
            {numField('Alto', height, setHeight, 'ft')}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {numField('Peso', weight, setWeight, 'lb')}
          </div>

          <p className="text-[10px] text-gray-400 flex items-start gap-1 pt-1">
            <AlertTriangle size={11} className="shrink-0 mt-0.5" />
            Esto crea el item en el catálogo de Extensiv del cliente seleccionado. Verifica el SKU antes de continuar.
          </p>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#16304d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? <><Loader2 size={15} className="animate-spin" /> Dando de alta…</> : <><PackagePlus size={15} /> Dar de alta</>}
          </button>
        </div>
      </div>
    </div>
  )
}
