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
  plan: string | null
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

  // Effect 1 — résolution de session : synchrone, pas d'async dans le callback.
  // onAuthStateChange est mis en place AVANT getSession pour ne rater aucun event.
  // TOKEN_REFRESHED garde le même user.id → Effect 2 ne se re-déclenche pas.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Effect 2 — fetch profil et admin, déclenché uniquement quand l'identité change.
  // user?.id : TOKEN_REFRESHED ne change pas l'id → aucun refetch inutile au resume.
  // finally garantit que loading passe à false même en cas d'erreur réseau.
  useEffect(() => {
    let mounted = true

    if (user === null) {
      setProfile(null)
      setIsAdmin(false)
      setLoading(false)
      return
    }

    setLoading(true)

    async function fetchUserData() {
      const userId = user!.id
      const email  = user!.email ?? null

      const [profileRes, adminRes] = await Promise.allSettled([
        supabase
          .from('profiles')
          .select('*')
          .eq('user_id', userId)
          .single(),
        email
          ? supabase.from('admin_emails').select('email').eq('email', email).maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      if (!mounted) return

      if (profileRes.status === 'fulfilled' && profileRes.value.data)
        setProfile({ ...profileRes.value.data, id: userId } as Profile)
      if (adminRes.status === 'fulfilled')   setIsAdmin(!!(adminRes.value as { data: unknown }).data)
    }

    fetchUserData().finally(() => { if (mounted) setLoading(false) })

    return () => { mounted = false }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    try { localStorage.removeItem('pdv-admin-ok') } catch {}
    await supabase.auth.signOut()
  }

  const updateDisplayName = async (name: string) => {
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .update({ display_name: name })
      .eq('user_id', user.id)
      .select('*')
      .single()
    if (data) setProfile({ ...data, id: user.id } as Profile)
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
