import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Notification } from '../types/tasks'

export function useNotifications(userEmail: string | undefined) {
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  // Solo notificaciones que llegaron por realtime DESPUÉS de montar (no el
  // fetch inicial) — alimenta el popup bloqueante, sin re-mostrar las
  // últimas 30 ya existentes al cargar la página.
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
      if (!error && data) setItems(data as Notification[])
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
