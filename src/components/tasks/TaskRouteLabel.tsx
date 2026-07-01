import { ArrowRight } from 'lucide-react'
import { ROLE_LABEL } from '../../config/permissions'
import { ALMACEN_RECEPTOR_EMAIL } from '../../config/almacen'
import type { EmailDirectory } from '../../hooks/useTeamMembers'

interface Props {
  assigner: string
  assignee: string
  dir: EmailDirectory
  /** Oculta la línea de nombres de cuenta (solo el pill de roles). */
  rolesOnly?: boolean
  className?: string
}

// Resuelve una cuenta (email) a su nombre y rol legible. La cuenta de almacén
// es de ruteo (puede no estar en team_members), por eso se detecta aparte.
function resolveAccount(email: string, dir: EmailDirectory): { name: string; role: string } {
  const low = (email ?? '').toLowerCase()
  if (low === ALMACEN_RECEPTOR_EMAIL.toLowerCase()) return { name: 'Almacén', role: 'Almacén' }
  const entry = dir[low]
  if (entry) return { name: entry.name ?? email, role: ROLE_LABEL[entry.role] }
  return { name: email || '—', role: email || '—' }
}

/** Muestra de qué cuenta a qué cuenta se mandó la tarea (ej. "SAC → Almacén"). */
export function TaskRouteLabel({ assigner, assignee, dir, rolesOnly, className }: Props) {
  const from = resolveAccount(assigner, dir)
  const to   = resolveAccount(assignee, dir)
  return (
    <span className={`inline-flex flex-col gap-0.5 min-w-0 ${className ?? ''}`}>
      <span className="inline-flex items-center gap-1 self-start text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#1e3a5f]/10 text-[#1e3a5f]">
        {from.role} <ArrowRight size={10} /> {to.role}
      </span>
      {!rolesOnly && (
        <span className="text-[11px] text-gray-500 truncate">
          {from.name} → {to.name}
        </span>
      )}
    </span>
  )
}
