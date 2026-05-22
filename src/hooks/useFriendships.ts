'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { otherUserId, statusFromFriendship, type Friendship, type FriendshipStateForMe } from '@/lib/friendships'

interface Profile {
  user_id:      string
  display_name: string | null
  avatar_url:   string | null
  ville:        string | null
}

interface FriendshipsState {
  loading:     boolean
  friendships: Friendship[]                       // toutes (pending + accepted)
  profilesByUserId: Record<string, Profile>       // joint pour affichage
}

/**
 * Hook centralisé pour gérer les relations d'amis du user authentifié.
 *
 * Charge TOUTES ses friendships (pending + accepted) au mount, et expose :
 *   - statusWith(userId)  → état vis-à-vis d'un user donné
 *   - sendRequest         → POST /api/friends/request
 *   - accept              → POST /api/friends/[id]/accept
 *   - cancel              → DELETE /api/friends/[id] (annule/refuse/désamic)
 *   - friendIds           → Set des user_id qui sont amis (status='accepted')
 *   - friendProfiles      → liste des amis avec leur profil (pour la page Les gens)
 *   - pendingReceived     → demandes pending reçues (non envoyées par moi)
 *   - refresh             → re-fetch
 */
export function useFriendships() {
  const { user } = useAuth()
  const [state, setState] = useState<FriendshipsState>({ loading: true, friendships: [], profilesByUserId: {} })

  const refresh = useCallback(async () => {
    if (!user) {
      setState({ loading: false, friendships: [], profilesByUserId: {} })
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setState({ loading: false, friendships: [], profilesByUserId: {} })
      return
    }

    // On fetch tout (pending + accepted) en une fois
    const res = await fetch('/api/friends?status=all', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      setState({ loading: false, friendships: [], profilesByUserId: {} })
      return
    }
    const data = await res.json()
    setState({
      loading: false,
      friendships: (data.friendships ?? []) as Friendship[],
      profilesByUserId: (data.profiles ?? {}) as Record<string, Profile>,
    })
  }, [user])

  useEffect(() => { refresh() }, [refresh])

  // Realtime : invalidation sur tout changement de friendships où je suis impliqué.
  // (RLS filtre côté serveur → on reçoit uniquement les events qui me concernent)
  useEffect(() => {
    if (!user) return
    const ch = supabase
      .channel(`friendships-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => refresh())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user, refresh])

  // ── Sélecteurs ────────────────────────────────────────────────
  const byOtherUserId = useMemo(() => {
    if (!user) return new Map<string, Friendship>()
    const m = new Map<string, Friendship>()
    for (const f of state.friendships) m.set(otherUserId(f, user.id), f)
    return m
  }, [state.friendships, user])

  const statusWith = useCallback(
    (userId: string): FriendshipStateForMe => {
      if (!user) return { kind: 'none' }
      if (userId === user.id) return { kind: 'none' }
      const f = byOtherUserId.get(userId)
      if (!f) return { kind: 'none' }
      return statusFromFriendship(f, user.id)
    },
    [user, byOtherUserId],
  )

  const friendIds = useMemo(() => {
    if (!user) return new Set<string>()
    const s = new Set<string>()
    for (const f of state.friendships) {
      if (f.status === 'accepted') s.add(otherUserId(f, user.id))
    }
    return s
  }, [state.friendships, user])

  const friendProfiles = useMemo(() => {
    if (!user) return []
    const arr: Profile[] = []
    for (const f of state.friendships) {
      if (f.status !== 'accepted') continue
      const otherId = otherUserId(f, user.id)
      const p = state.profilesByUserId[otherId]
      if (p) arr.push(p)
    }
    return arr.sort((a, b) => (a.display_name ?? '').localeCompare(b.display_name ?? '', 'fr'))
  }, [state.friendships, state.profilesByUserId, user])

  const pendingReceived = useMemo(() => {
    if (!user) return []
    return state.friendships
      .filter(f => f.status === 'pending' && f.requested_by !== user.id)
      .map(f => ({ friendship: f, profile: state.profilesByUserId[otherUserId(f, user.id)] }))
  }, [state.friendships, state.profilesByUserId, user])

  // ── Actions ────────────────────────────────────────────────────
  const post = useCallback(async (path: string, body?: object) => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) throw new Error('Non connecté')
    const res = await fetch(path, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Erreur')
    return data
  }, [])

  const sendRequest = useCallback(async (userId: string) => {
    await post('/api/friends/request', { user_id: userId })
    await refresh()
  }, [post, refresh])

  const accept = useCallback(async (friendshipId: string) => {
    await post(`/api/friends/${friendshipId}/accept`)
    await refresh()
  }, [post, refresh])

  const cancel = useCallback(async (friendshipId: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) throw new Error('Non connecté')
    const res = await fetch(`/api/friends/${friendshipId}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error || 'Erreur')
    }
    await refresh()
  }, [refresh])

  return {
    loading:         state.loading,
    friendships:     state.friendships,
    profilesByUserId: state.profilesByUserId,
    statusWith,
    friendIds,
    friendProfiles,
    pendingReceived,
    sendRequest,
    accept,
    cancel,
    refresh,
  }
}
