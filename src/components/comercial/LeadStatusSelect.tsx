import type { LeadStage } from '../../types/leads'
import { STAGE_LABEL } from '../../types/leads'

const STAGE_STYLE: Record<LeadStage, { bg: string; text: string }> = {
  nuevo:              { bg: 'bg-blue-50',   text: 'text-blue-700' },
  contactado:         { bg: 'bg-cyan-50',   text: 'text-cyan-700' },
  en_seguimiento:     { bg: 'bg-violet-50', text: 'text-violet-700' },
  reunion_agendada:   { bg: 'bg-amber-50',  text: 'text-amber-700' },
  cotizacion_enviada: { bg: 'bg-pink-50',   text: 'text-pink-700' },
  cerrado_ganado:     { bg: 'bg-green-50',  text: 'text-green-700' },
  cerrado_perdido:    { bg: 'bg-red-50',    text: 'text-red-600' },
}

// Transiciones válidas de etapa — mismo patrón que ViajeStatusCell.tsx.
// cerrado_perdido es alcanzable desde cualquier etapa activa.
export const LEAD_STAGE_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  nuevo:              ['contactado', 'cerrado_perdido'],
  contactado:         ['en_seguimiento', 'cerrado_perdido'],
  en_seguimiento:     ['reunion_agendada', 'cerrado_perdido'],
  reunion_agendada:   ['cotizacion_enviada', 'cerrado_perdido'],
  cotizacion_enviada: ['cerrado_ganado', 'cerrado_perdido'],
  cerrado_ganado:     [],
  cerrado_perdido:    [],
}

interface Props {
  estatus:  LeadStage
  onChange: (nuevoEstatus: LeadStage) => void
}

export function LeadStatusSelect({ estatus, onChange }: Props) {
  const style = STAGE_STYLE[estatus]
  const nextStages = LEAD_STAGE_TRANSITIONS[estatus]

  if (nextStages.length === 0) {
    return (
      <span className={`px-2 py-1 rounded text-[11px] font-semibold ${style.bg} ${style.text}`}>
        {STAGE_LABEL[estatus]}
      </span>
    )
  }

  return (
    <select
      value={estatus}
      onChange={e => onChange(e.target.value as LeadStage)}
      className={`px-2 py-1 rounded text-[11px] font-semibold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 ${style.bg} ${style.text}`}
    >
      <option value={estatus}>{STAGE_LABEL[estatus]}</option>
      {nextStages.map(s => (
        <option key={s} value={s}>{STAGE_LABEL[s]}</option>
      ))}
    </select>
  )
}
