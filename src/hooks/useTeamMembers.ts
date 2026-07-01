import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { UserRole } from '../types'

export interface SimpleTeamMember {
  email: string
  name:  string | null
  role:  UserRole
}

/** Directorio email→{nombre, rol} (clave en minúsculas) para resolver cuentas. */
export type EmailDirectory = Record<string, { name: string | null; role: UserRole }>

/**
 * Miembros activos del equipo (team_members.active = true), ordenados por nombre.
 * Para selectores de destinatario y para resolver cuenta→rol en las tarjetas.
 */
export function useTeamMembers() {
  const [members, setMembers] = useState<SimpleTeamMember[]>([])
  const [byEmail, setByEmail] = useState<EmailDirectory>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    supabase
      .from('team_members')
      .select('user_email, user_name, role')
      .eq('active', true)
      .then(({ data }) => {
        if (!alive) return
        const arr = (data ?? []).map(r => ({
          email: r.user_email as string,
          name:  (r.user_name as string | null) ?? null,
          role:  r.role as UserRole,
        }))
        arr.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email))
        const dir: EmailDirectory = {}
        for (const m of arr) dir[m.email.toLowerCase()] = { name: m.name, role: m.role }
        setMembers(arr)
        setByEmail(dir)
        setLoading(false)
      })
    return () => { alive = false }
  }, [])

  return { members, byEmail, loading }
}
