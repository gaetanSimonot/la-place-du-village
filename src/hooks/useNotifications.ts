'use client'
import { useState, useEffect, useCallback } from 'react'
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

  // Live unread count via Supabase direct (not fetch() — PWA SW may intercept)
  useEffect(() => {
    if (!user) { setUnreadCount(0); return }

    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('lu', false)
      .then(({ count }) => setUnreadCount(count ?? 0))

    const channel = supabase
      .channel(`notifs-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('lu', false)
          .then(({ count }) => setUnreadCount(count ?? 0))
      })
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
