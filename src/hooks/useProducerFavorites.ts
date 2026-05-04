'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export function useProducerFavorites() {
  const { user } = useAuth()
  const [favIds, setFavIds] = useState<string[]>([])

  useEffect(() => {
    if (!user) { setFavIds([]); return }
    supabase.from('producer_favorites').select('producer_id').eq('user_id', user.id)
      .then(({ data }) => setFavIds((data ?? []).map((r: { producer_id: string }) => r.producer_id)))
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback(async (producerId: string) => {
    if (!user) return
    const already = favIds.includes(producerId)
    if (already) {
      await supabase.from('producer_favorites').delete().eq('producer_id', producerId).eq('user_id', user.id)
      setFavIds(prev => prev.filter(id => id !== producerId))
    } else {
      await supabase.from('producer_favorites').insert({ producer_id: producerId, user_id: user.id })
      setFavIds(prev => [...prev, producerId])
    }
  }, [user, favIds])

  return { favIds, toggle, isFav: (id: string) => favIds.includes(id) }
}
