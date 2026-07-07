import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Notification } from '../types/tasks'

export function useNotifications(userEmail: string | undefined) {
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  // Cola del popup bloqueante: se alimenta tanto de lo que llega por realtime
  // como de lo que ya estaba sin leer al cargar la página (ver reload) — así
  // una notificación que llegó mientras el usuario no tenía la pestaña
  // abierta también se muestra como popup al volver a entrar.
  const [incoming, setIncoming] = useState<Notification[]>([])
  // Sufijo único por instancia del hook — permite que NotificationBell y
  // NotificationPopup usen el hook simultáneamente sin colisionar canales.
  const channelSuffix = useRef(Math.random().toString(36).slice(2))

  const reload = useCallback(async () => {
    if (!userEmail) { setItems([]); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_email', userEmail)
        .order('created_at', { ascending: false })
        .limit(30)
      if (!error && data) {
        setItems(data as Notification[])
        // Notificaciones sin leer de antes de esta sesión también entran a la
        // cola del popup, evitando duplicar lo que ya esté encolado.
        const unread = (data as Notification[]).filter(n => !n.read_at)
        setIncoming(prev => {
          const existing = new Set(prev.map(p => p.id))
          const toAdd = unread.filter(n => !existing.has(n.id))
          return toAdd.length ? [...prev, ...toAdd] : prev
        })
      }
    } finally {
      setLoading(false)
    }
  }, [userEmail])

  useEffect(() => { reload() }, [reload])

  // Realtime subscription
  useEffect(() => {
    if (!userEmail) return
    const channel = supabase
      .channel(`notif:${userEmail}:${channelSuffix.current}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_email=eq.${userEmail}` },
        payload => {
          const n = payload.new as Notification
          setItems(prev => [n, ...prev].slice(0, 30))
          setIncoming(prev => [...prev, n])
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userEmail])

  const markRead = useCallback(async (id: string) => {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
  }, [])

  const markAllRead = useCallback(async () => {
    if (!userEmail) return
    const stamp = new Date().toISOString()
    setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: stamp }))
    // Si ya se marcaron todas como leídas desde la campanita, no debería
    // seguir apareciendo un popup para esas mismas notificaciones.
    setIncoming([])
    await supabase
      .from('notifications')
      .update({ read_at: stamp })
      .eq('user_email', userEmail)
      .is('read_at', null)
  }, [userEmail])

  const dismissIncoming = useCallback((id: string) => {
    setIncoming(prev => prev.filter(n => n.id !== id))
    void markRead(id)
  }, [markRead])

  const unreadCount = items.filter(n => !n.read_at).length

  return { items, unreadCount, loading, reload, markRead, markAllRead, incoming, dismissIncoming }
}
