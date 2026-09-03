'use client'
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { escapeLikePattern } from '@/lib/escape-like'

export interface DisplaySettings {
  banner: boolean
  bio: boolean
  fiche_pro: boolean
  module_utile: boolean
  pages_suivies: boolean
  publications: boolean
}

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  banner_url?: string | null
  bio?: string | null
  ville?: string | null
  link_url?: string | null
  // Optionnel : renseigné depuis la session pour le profil du user connecté.
  // Sur le profil d'un AUTRE membre, l'e-mail n'est plus lisible côté client.
  email?: string | null
  username: string | null
  banned: boolean
  plan: string | null
  genre?: 'homme' | 'femme' | 'autre' | null
  is_verified?: boolean
  is_public?: boolean
  searchable?: boolean
  display_settings?: DisplaySettings | null
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  signOut: () => Promise<void>
  updateDisplayName: (name: string) => Promise<void>
  updateProfile: (patch: {
    display_name?: string
    genre?: 'homme' | 'femme' | 'autre' | null
    banner_url?: string | null
    avatar_url?: string | null
    bio?: string | null
    ville?: string | null
    link_url?: string | null
    is_public?: boolean
    searchable?: boolean
  }) => Promise<void>
  /** Met à jour le profile local sans round-trip API.
   *  À utiliser après les endpoints qui patchent un seul champ
   *  (display-settings, privacy, etc.) pour garder le context synchro. */
  patchProfileLocal: (patch: Partial<Profile>) => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  signOut: async () => {},
  updateDisplayName: async () => {},
  updateProfile: async () => {},
  patchProfileLocal: () => {},
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
          // Colonnes ÉNUMÉRÉES, pas `*` : depuis le verrouillage par colonne
          // (scripts/2026-09-03_profiles_lecture_par_colonne.sql), `email` et
          // les champs newsletter ne sont plus lisibles avec la clé publique.
          // Un `select('*')` demanderait ces colonnes et Postgres refuserait
          // la requête entière.
          .select('user_id, display_name, avatar_url, banner_url, bio, ville, link_url, username, banned, plan, pro_type, genre, is_verified, is_public, searchable, display_settings')
          .eq('user_id', userId)
          .single(),
        email
          // Case-insensitive aligned avec is_admin() SQL (lower=lower), ET
          // wildcards LIKE échappés pour bloquer l'injection : un user qui
          // se crée avec `admin_a@x.com` ne doit PAS matcher `adminxa@x.com`.
          ? supabase.from('admin_emails').select('email').ilike('email', escapeLikePattern(email.toLowerCase())).maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      if (!mounted) return

      if (profileRes.status === 'fulfilled' && profileRes.value.data)
        // `email` vient de la session auth, plus de la table : c'est de toute
        // façon la source de vérité (profiles.email n'en est qu'une copie, et
        // c'est bien auth.users.email qui décide du statut admin).
        setProfile({ ...profileRes.value.data, id: userId, email } as Profile)
      if (adminRes.status === 'fulfilled')   setIsAdmin(!!(adminRes.value as { data: unknown }).data)
    }

    fetchUserData().finally(() => { if (mounted) setLoading(false) })

    return () => { mounted = false }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    try { localStorage.removeItem('pdv-admin-ok') } catch {}
    await supabase.auth.signOut()
    // Retour à l'accueil (qui porte la bottom bar) plutôt que de rester bloqué
    // sur une page sans nav (ex. /reglages) transformée en écran de connexion.
    if (typeof window !== 'undefined') window.location.href = '/'
  }

  const updateDisplayName = async (name: string) => {
    await updateProfile({ display_name: name })
  }

  const updateProfile = async (patch: {
    display_name?: string
    genre?: 'homme' | 'femme' | 'autre' | null
    banner_url?: string | null
    avatar_url?: string | null
    bio?: string | null
    ville?: string | null
    link_url?: string | null
    is_public?: boolean
    searchable?: boolean
  }) => {
    if (!user) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const d = await res.json()
      setProfile({ ...d.profile, id: user.id } as Profile)
    }
  }

  const patchProfileLocal = (patch: Partial<Profile>) => {
    setProfile(prev => prev ? { ...prev, ...patch } : prev)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, signOut, updateDisplayName, updateProfile, patchProfileLocal }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
