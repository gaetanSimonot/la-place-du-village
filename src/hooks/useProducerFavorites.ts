import { useState } from 'react'

const KEY = 'pdv-producer-favoris'

export function useProducerFavorites() {
  const [favIds, setFavIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
  })

  const toggle = (id: string) => {
    setFavIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  return { favIds, toggle, isFav: (id: string) => favIds.includes(id) }
}
