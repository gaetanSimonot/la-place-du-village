'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const FAV_KEY = 'pdv-annonces-favoris'

/**
 * Favoris ANNONCES avec stockage hybride :
 *  - User connecté : DB (`annonce_favorites` via /api/profile/annonce-favorites
 *    + /api/annonces/[id]/favorite)
 *  - Anonyme       : localStorage `pdv-annonces-favoris`
 *  - Au login      : import auto des favoris locaux puis clear localStorage
 *
 * API du hook : `{ favIds, toggle, isFav }`.
 *
 * Pattern identique à useFavorites (events) — duplication volontaire pour
 * isoler les deux domaines (clé localStorage différente, routes API
 * différentes, table DB différente).
 */
export function useAnnonceFavorites() {
  const { user } = useAuth()
  const [favIds, setFavIds] = useState<string[]>(() => readLocal())
  const importedRef = useRef(false)

  // Au login, importe le localStorage → DB une seule fois, puis charge depuis DB
  useEffect(() => {
    if (!user) {
      // Logout / anonyme : recharge le localStorage (déjà fait à l'init, mais
      // au cas où le user change de compte dans la même session)
      setFavIds(readLocal())
      importedRef.current = false
      return
    }

    let cancelled = false

    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      // 1. Import du localStorage si on ne l'a pas encore fait pour cette session
      if (!importedRef.current) {
        const localIds = readLocal()
        if (localIds.length > 0) {
          await fetch('/api/profile/annonce-favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ annonceIds: localIds }),
          }).catch(() => {})
          // Clear localStorage uniquement après import réussi
          try { localStorage.removeItem(FAV_KEY) } catch {}
        }
        importedRef.current = true
      }

      // 2. Charge la liste depuis DB
      const res = await fetch('/api/profile/annonce-favorites', {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null)
      if (!res || cancelled) return
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data?.annonceIds)) {
        setFavIds(data.annonceIds)
      }
    })()

    return () => { cancelled = true }
  }, [user])

  const toggle = useCallback((id: string) => {
    // Optimistic update
    setFavIds(prev => {
      const isCurrentlyFav = prev.includes(id)
      const next = isCurrentlyFav ? prev.filter(x => x !== id) : [...prev, id]

      if (!user) {
        // Mode anonyme : on persiste en localStorage
        try { localStorage.setItem(FAV_KEY, JSON.stringify(next)) } catch {}
      } else {
        // Mode connecté : POST côté API. En cas d'erreur on rollback.
        ;(async () => {
          const { data: { session } } = await supabase.auth.getSession()
          const token = session?.access_token
          if (!token) return
          const res = await fetch(`/api/annonces/${id}/favorite`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null)
          if (!res || !res.ok) {
            // Rollback
            setFavIds(curr => isCurrentlyFav ? [...curr, id] : curr.filter(x => x !== id))
          }
        })()
      }

      return next
    })
  }, [user])

  const isFav = useCallback((id: string) => favIds.includes(id), [favIds])

  return { favIds, toggle, isFav }
}

function readLocal(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') } catch { return [] }
}
