import type { ViajeEstado } from '../../../types/tms'

const ESTADO_CONFIG: Record<ViajeEstado, { label: string; bg: string; text: string }> = {
  pendiente:   { label: 'Pendiente',   bg: 'bg-gray-100',   text: 'text-gray-600' },
  confirmado:  { label: 'Confirmado',  bg: 'bg-teal-50',    text: 'text-teal-700' },
  asignado:    { label: 'Asignado',    bg: 'bg-blue-50',    text: 'text-blue-700' },
  en_transito: { label: 'En Tránsito', bg: 'bg-amber-50',   text: 'text-amber-700' },
  entregado:   { label: 'Entregado',   bg: 'bg-purple-50',  text: 'text-purple-700' },
  completado:  { label: 'Completado',  bg: 'bg-green-50',   text: 'text-green-700' },
  cancelado:   { label: 'Cancelado',   bg: 'bg-red-50',     text: 'text-red-600' },
}

const TRANSITIONS: Record<ViajeEstado, ViajeEstado[]> = {
  pendiente:   ['confirmado', 'asignado', 'cancelado'],
  // Un viaje confirmado (del Cotizador) ya entra a la proforma; puede además
  // asignarse para el flujo completo o marcarse Completado cuando se realice.
  confirmado:  ['asignado', 'completado', 'cancelado'],
  asignado:    ['en_transito', 'cancelado'],
  en_transito: ['entregado', 'cancelado'],
  entregado:   ['completado'],
  completado:  [],
  cancelado:   [],
}

interface Props {
  estado: ViajeEstado
  onChange: (nuevoEstado: ViajeEstado) => void
}

export function ViajeStatusCell({ estado, onChange }: Props) {
  const config = ESTADO_CONFIG[estado]
  const nextStates = TRANSITIONS[estado]

  if (nextStates.length === 0) {
    return (
      <span className={`px-2 py-1 rounded text-[11px] font-semibold ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    )
  }

  return (
    <select
      value={estado}
      onChange={e => onChange(e.target.value as ViajeEstado)}
      className={`px-2 py-1 rounded text-[11px] font-semibold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 ${config.bg} ${config.text}`}
    >
      <option value={estado}>{config.label}</option>
      {nextStates.map(s => (
        <option key={s} value={s}>{ESTADO_CONFIG[s].label}</option>
      ))}
    </select>
  )
}

export { ESTADO_CONFIG }
