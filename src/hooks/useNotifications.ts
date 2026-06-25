'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { AppNotification } from '@/lib/types'

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

export function useNotifications() {
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // Identifiant unique par instance — évite les "cannot add postgres_changes
  // callbacks after subscribe()" si le hook est instancié plusieurs fois
  // simultanément (StrictMode dev ou navigation Next.js rapide).
  const instanceIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  )

  // Compteur unread : non-lus PARMI les 50 notifs les plus récentes (même
  // fenêtre que la liste affichée). Le badge correspond à ce que l'utilisateur
  // voit réellement, pas aux vieux non-lus hors fenêtre. (Supabase direct, pas
  // fetch() — le SW PWA pourrait l'intercepter.)
  useEffect(() => {
    if (!user) { setUnreadCount(0); return }
    const refresh = () => {
      supabase
        .from('notifications')
        .select('lu')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data }) => setUnreadCount((data ?? []).filter(r => !r.lu).length))
    }
    refresh()

    const channel = supabase
      .channel(`notifs-${user.id}-${instanceIdRef.current}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, refresh)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  const fetchAll = useCallback(async () => {
    const token = await getToken()
    if (!token) return
    setLoading(true)
    const res = await fetch('/api/notifications', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const d = await res.json()
      setNotifications(d.notifications ?? [])
      setLoaded(true)
    }
    setLoading(false)
  }, [])

  const markRead = useCallback(async (id: string) => {
    const token = await getToken()
    if (!token) return
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, lu: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
    await fetch(`/api/notifications/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    })
  }, [])

  const markAllRead = useCallback(async () => {
    const token = await getToken()
    if (!token) return
    setNotifications(prev => prev.map(n => ({ ...n, lu: true })))
    setUnreadCount(0)
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    })
  }, [])

  const removeNotif = useCallback(async (id: string) => {
    const token = await getToken()
    if (!token) return
    // Optimistic update
    setNotifications(prev => {
      const target = prev.find(n => n.id === id)
      if (target && !target.lu) setUnreadCount(c => Math.max(0, c - 1))
      return prev.filter(n => n.id !== id)
    })
    await fetch(`/api/notifications/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  }, [])

  return { unreadCount, notifications, loading, loaded, fetchAll, markRead, markAllRead, removeNotif }
}
