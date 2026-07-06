import type { LeadStage, LeadInterestLevel, LeadPriority } from '../../types/leads'
import { STAGE_LABEL, INTEREST_LABEL, PRIORITY_LABEL } from '../../types/leads'

type BadgeConfig = { label: string; bg: string; fg: string; border: string; dot: string }

const STAGE_STYLES: Record<LeadStage, BadgeConfig> = {
  nuevo:              { label: STAGE_LABEL.nuevo,              bg: '#eff6ff', fg: '#1e40af', border: '#bfdbfe', dot: '#3b82f6' },
  contactado:         { label: STAGE_LABEL.contactado,         bg: '#ecfeff', fg: '#155e75', border: '#a5f3fc', dot: '#06b6d4' },
  en_seguimiento:     { label: STAGE_LABEL.en_seguimiento,     bg: '#f5f3ff', fg: '#5b21b6', border: '#ddd6fe', dot: '#8b5cf6' },
  reunion_agendada:   { label: STAGE_LABEL.reunion_agendada,   bg: '#fef3c7', fg: '#92400e', border: '#fde68a', dot: '#f59e0b' },
  cotizacion_enviada: { label: STAGE_LABEL.cotizacion_enviada, bg: '#fdf2f8', fg: '#9d174d', border: '#fbcfe8', dot: '#ec4899' },
  cerrado_ganado:     { label: STAGE_LABEL.cerrado_ganado,     bg: '#dcfce7', fg: '#14532d', border: '#86efac', dot: '#16a34a' },
  cerrado_perdido:    { label: STAGE_LABEL.cerrado_perdido,    bg: '#fef2f2', fg: '#991b1b', border: '#fecaca', dot: '#ef4444' },
}

const INTEREST_STYLES: Record<LeadInterestLevel, BadgeConfig> = {
  frio:            { label: INTEREST_LABEL.frio,            bg: '#eff6ff', fg: '#1e40af', border: '#bfdbfe', dot: '#3b82f6' },
  tibio:           { label: INTEREST_LABEL.tibio,           bg: '#fef3c7', fg: '#92400e', border: '#fde68a', dot: '#f59e0b' },
  caliente:        { label: INTEREST_LABEL.caliente,        bg: '#fef2f2', fg: '#991b1b', border: '#fecaca', dot: '#ef4444' },
  oportunidad:     { label: INTEREST_LABEL.oportunidad,     bg: '#dcfce7', fg: '#14532d', border: '#86efac', dot: '#16a34a' },
  cliente_perdido: { label: INTEREST_LABEL.cliente_perdido, bg: '#f4f4f5', fg: '#3f3f46', border: '#d4d4d8', dot: '#71717a' },
}

const PRIORITY_STYLES: Record<LeadPriority, BadgeConfig> = {
  baja:  { label: PRIORITY_LABEL.baja,  bg: '#f4f4f5', fg: '#3f3f46', border: '#d4d4d8', dot: '#71717a' },
  media: { label: PRIORITY_LABEL.media, bg: '#fef3c7', fg: '#92400e', border: '#fde68a', dot: '#f59e0b' },
  alta:  { label: PRIORITY_LABEL.alta,  bg: '#fef2f2', fg: '#991b1b', border: '#fecaca', dot: '#ef4444' },
}

function Badge({ cfg, size }: { cfg: BadgeConfig; size: 'sm' | 'md' }) {
  const padding = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold border ${padding}`}
      style={{ background: cfg.bg, color: cfg.fg, borderColor: cfg.border }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cfg.dot }} aria-hidden="true" />
      {cfg.label}
    </span>
  )
}

export function LeadStageBadge({ estatus, size = 'sm' }: { estatus: LeadStage; size?: 'sm' | 'md' }) {
  return <Badge cfg={STAGE_STYLES[estatus]} size={size} />
}

export function LeadInterestBadge({ nivel, size = 'sm' }: { nivel: LeadInterestLevel; size?: 'sm' | 'md' }) {
  return <Badge cfg={INTEREST_STYLES[nivel]} size={size} />
}

export function LeadPriorityBadge({ prioridad, size = 'sm' }: { prioridad: LeadPriority; size?: 'sm' | 'md' }) {
  return <Badge cfg={PRIORITY_STYLES[prioridad]} size={size} />
}
