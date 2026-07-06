import type { LeadStage } from '../../types/leads'
import { LEAD_STAGES, STAGE_LABEL } from '../../types/leads'

const STAGE_STYLE: Record<LeadStage, { bg: string; text: string }> = {
  lead_entrante:        { bg: 'bg-blue-50',   text: 'text-blue-700' },
  lead_junta_pendiente: { bg: 'bg-amber-50',  text: 'text-amber-700' },
  lead_post_junta:      { bg: 'bg-violet-50', text: 'text-violet-700' },
  lead_proceso_cliente: { bg: 'bg-green-50',  text: 'text-green-700' },
}

interface Props {
  estatus:  LeadStage
  onChange: (nuevoEstatus: LeadStage) => void
}

// Selección libre entre las 4 etapas (adelante o atrás) — ya no hay una
// rama de salida ("perdido") que sirva de válvula de escape, así que el
// pipeline no puede ser de "solo avanzar" o un lead quedaría atrapado
// (ej. una junta que se cancela y hay que regresarlo a "entrante").
export function LeadStatusSelect({ estatus, onChange }: Props) {
  const style = STAGE_STYLE[estatus]

  return (
    <select
      value={estatus}
      onChange={e => onChange(e.target.value as LeadStage)}
      className={`px-2 py-1 rounded text-[11px] font-semibold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 ${style.bg} ${style.text}`}
    >
      {LEAD_STAGES.map(s => (
        <option key={s} value={s}>{STAGE_LABEL[s]}</option>
      ))}
    </select>
  )
}
