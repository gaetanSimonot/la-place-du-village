import { useState } from 'react'

const FAV_KEY = 'pdv-favoris'

export function useFavorites() {
  const [favIds, setFavIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') } catch { return [] }
  })

  const toggle = (id: string) => {
    setFavIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  return { favIds, toggle, isFav: (id: string) => favIds.includes(id) }
}
