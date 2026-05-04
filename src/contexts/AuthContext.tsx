'use client'
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
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

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  signOut: () => Promise<void>
  updateDisplayName: (name: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  signOut: async () => {},
  updateDisplayName: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

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

    async function checkAdmin(email: string) {
      const { data } = await supabase
        .from('admin_emails')
        .select('email')
        .eq('email', email)
        .maybeSingle()
      if (mounted) setIsAdmin(!!data)
    }

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!mounted) return
        setUser(session?.user ?? null)
        if (session?.user) {
          await Promise.all([
            fetchProfile(session.user.id),
            session.user.email ? checkAdmin(session.user.email) : Promise.resolve(),
          ])
        }
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
        await Promise.all([
          fetchProfile(session.user.id),
          session.user.email ? checkAdmin(session.user.email) : Promise.resolve(),
        ])
      } else {
        setProfile(null)
        setIsAdmin(false)
      }
      if (mounted) setLoading(false)
    })

    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  const signOut = async () => {
    try { localStorage.removeItem('pdv-admin-ok') } catch {}
    await supabase.auth.signOut()
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

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, signOut, updateDisplayName }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
