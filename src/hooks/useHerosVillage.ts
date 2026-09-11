'use client'
import { useCallback } from 'react'
import useSWR from 'swr'
import { supabase } from '@/lib/supabase'
import type { HerosVillage } from '@/lib/villageHero'

/**
 * Le héros du Village, tel que le serveur veut bien le donner à cette personne.
 *
 * Un seul endroit qui interroge la route : l'encart du Village et le bandeau
 * « à la une » de la carte lisent la même chose et ne peuvent pas diverger.
 *
 * Et une seule REQUÊTE, désormais : le hook passe par SWR, qui met les
 * demandeurs d'une même clé en commun (dédoublonnage à 5 s, réglé dans
 * SWRProvider). En useState/useEffect, chaque montage repartait au réseau —
 * l'accueil en comptait déjà deux, et poser le héros dans la colonne de
 * droite en aurait ajouté un troisième pour rien.
 *
 * `eteint` ne concerne qu'un admin : le serveur lui rend le héros éteint pour
 * qu'il sache qu'il existe, alors qu'il ne l'envoie pas du tout aux autres.
 */

interface Reponse { heros?: HerosVillage[] | HerosVillage | null; eteint?: boolean }

/**
 * Le jeton de session voyage dans l'en-tête, pas dans la clé : c'est le
 * serveur qui décide ce qu'il montre à qui, et une clé qui changerait à
 * chaque rafraîchissement de jeton relancerait la requête sans raison.
 */
async function chargerHeros(url: string): Promise<Reponse> {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch(url, {
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export function useHerosVillage() {
  const { data, isLoading, mutate } = useSWR<Reponse>('/api/village-hero', chargerHeros, {
    revalidateOnFocus: false,
  })

  // Même signature qu'avant : pas de héros et pas de bruit en cas d'échec.
  const recharger = useCallback(() => { void mutate() }, [mutate])

  // La route renvoie une LISTE ; on tolère l'ancienne réponse à une fiche au
  // cas où une version antérieure traînerait dans un cache de navigateur.
  const brut = data?.heros
  const heros = Array.isArray(brut) ? brut : brut ? [brut] : []

  return {
    heros,
    /** La première fiche visible — ce que montrent les appelants à un seul emplacement. */
    premier: heros[0] ?? null,
    eteint: !!data?.eteint,
    pret:   !isLoading,
    recharger,
  }
}
