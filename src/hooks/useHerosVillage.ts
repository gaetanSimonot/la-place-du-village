'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { HerosVillage } from '@/lib/villageHero'

/**
 * Le héros du Village, tel que le serveur veut bien le donner à cette personne.
 *
 * Un seul endroit qui interroge la route : l'encart du Village et le bandeau
 * « à la une » de la carte lisent la même chose et ne peuvent pas diverger.
 *
 * `eteint` ne concerne qu'un admin : le serveur lui rend le héros éteint pour
 * qu'il sache qu'il existe, alors qu'il ne l'envoie pas du tout aux autres.
 */
export function useHerosVillage() {
  const [heros, setHeros]   = useState<HerosVillage | null>(null)
  const [eteint, setEteint] = useState(false)
  const [pret, setPret]     = useState(false)

  const charger = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/village-hero', {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        cache: 'no-store',
      })
      const j = await r.json().catch(() => null)
      setHeros(j?.heros ?? null)
      setEteint(!!j?.eteint)
    } catch { /* pas de héros, pas de bruit */ } finally { setPret(true) }
  }, [])

  useEffect(() => { charger() }, [charger])

  return { heros, eteint, pret, recharger: charger }
}
