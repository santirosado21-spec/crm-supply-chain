import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { UserRole } from '../types'

export interface LocalUser {
  email: string
  name:  string
  role:  UserRole
}

const NOT_AUTHORIZED = 'NOT_AUTHORIZED'

function normalizeRole(role: unknown): UserRole {
  if (role === 'transportes') return 'transporte'
  if (role === 'sac') return 'servicio_cliente'
  if (
    role === 'admin' ||
    role === 'almacen' ||
    role === 'servicio_cliente' ||
    role === 'cobranza' ||
    role === 'transporte'
  ) return role
  return 'almacen'
}

/**
 * Hook de autenticación.
 *   - Backend: Supabase Auth (email + password).
 *   - Identidad: el email de la sesión.
 *   - Autorización: la fila correspondiente en `team_members` (role + name).
 *     Si el email autenticado NO está en team_members o `active = false`
 *     → cerramos sesión y devolvemos error.
 */
export function useAuth() {
  const [user, setUser]       = useState<LocalUser | null>(null)
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  /** Convierte una sesión de Supabase en LocalUser usando team_members. */
  const hydrate = async (email: string | null | undefined): Promise<LocalUser | null> => {
    if (!email) return null
    const normalized = email.trim().toLowerCase()
    const { data, error } = await supabase
      .from('team_members')
      .select('user_email, user_name, role, active')
      .eq('user_email', normalized)
      .maybeSingle()
    if (error || !data || !data.active) return null
    return {
      email: data.user_email,
      name:  (data.user_name ?? data.user_email.split('@')[0]) as string,
      role:  normalizeRole(data.role),
    }
  }

  // ── Carga inicial + listener de cambios de sesión ────────────────────────
  useEffect(() => {
    mountedRef.current = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const sessionEmail = data.session?.user?.email
      const u = await hydrate(sessionEmail)
      if (!mountedRef.current) return
      setUser(u)
      setLoading(false)

      // Si hay sesión pero no hay perfil, cerramos sesión silenciosamente.
      if (sessionEmail && !u) await supabase.auth.signOut()
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        if (!mountedRef.current) return
        setUser(null)
        return
      }

      // Supabase recomienda no encadenar llamadas async al cliente dentro de
      // onAuthStateChange. Las diferimos para evitar que el login quede colgado.
      setTimeout(async () => {
        try {
          const u = await hydrate(session?.user?.email)
          if (!mountedRef.current) return
          setUser(u)
          if (event === 'SIGNED_IN' && session?.user?.email && !u) {
            await supabase.auth.signOut()
          }
        } catch (e) {
          // Sin este catch, un fallo de red en hydrate quedaba como un
          // unhandled rejection y el estado de usuario se quedaba colgado.
          console.error('[auth] hidratación de usuario falló:', e)
        }
      }, 0)
    })
    const unsub = () => sub.subscription.unsubscribe()

    return () => {
      mountedRef.current = false
      if (unsub) unsub()
    }
  }, [])

  // ── Acciones públicas ────────────────────────────────────────────────────
  const signIn = async (email: string, password: string): Promise<LocalUser | null> => {
    const normalized = email.trim().toLowerCase()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalized,
      password,
    })
    if (error) throw new Error(error.message)
    const u = await hydrate(data.user?.email)
    if (!u) {
      await supabase.auth.signOut()
      throw new Error('Tu cuenta no está autorizada. Contacta al administrador.')
    }
    setUser(u)
    return u
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  /** Recuperación: envía link de reset al email. */
  const sendPasswordReset = async (email: string): Promise<void> => {
    const normalized = email.trim().toLowerCase()
    const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
      redirectTo: window.location.origin + '/login',
    })
    if (error) throw new Error(error.message)
  }

  return { user, loading, signIn, signOut, sendPasswordReset }
}

export { NOT_AUTHORIZED }
