import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  email: string | null
  username: string | null
  banned: boolean
}

export function useAuth() {
  const [user, setUser]       = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function fetchProfile(userId: string) {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, email, username, banned')
        .eq('id', userId)
        .single()
      if (mounted) setProfile(data ?? null)
    }

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!mounted) return
        setUser(session?.user ?? null)
        if (session?.user) await fetchProfile(session.user.id)
      } catch {
        // network or auth error — stay logged out
      } finally {
        if (mounted) setLoading(false)
      }
    }
    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return
      setUser(session?.user ?? null)
      if (session?.user) {
        await fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }
      if (mounted) setLoading(false)
    })

    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  const signOut = () => {
    try { localStorage.removeItem('pdv-admin-ok') } catch {}
    return supabase.auth.signOut()
  }

  const updateDisplayName = async (name: string) => {
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .update({ display_name: name })
      .eq('id', user.id)
      .select('id, display_name, avatar_url, email, username, banned')
      .single()
    if (data) setProfile(data)
  }

  return { user, profile, loading, signOut, updateDisplayName }
}
