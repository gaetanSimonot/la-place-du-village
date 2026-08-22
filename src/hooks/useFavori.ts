'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * LE FAVORI D'UNE FICHE — un seul état, partout.
 *
 * Le cœur apparaît à trois endroits pour la même fiche : sur la carte dans la
 * conversation, dans l'aperçu qu'elle ouvre, et demain ailleurs. Chacun
 * gardait son propre état, si bien qu'en garder une depuis un endroit laissait
 * les autres en arrière — et une conversation rouverte depuis l'appareil
 * affichait l'état figé au moment où on l'avait quittée.
 *
 * Deux règles suffisent à supprimer le problème :
 *
 *   1. La VÉRITÉ vient du serveur. L'état posé sur la carte au moment de la
 *      réponse sert de départ ; s'il manque, on le demande.
 *   2. Tout changement est ANNONCÉ à l'application entière. Chaque cœur de la
 *      même fiche s'aligne, et la barre du bas fait battre le sien.
 */

/** Où vit le favori de chaque famille. Un film ne se garde pas. */
export const API_FAVORI: Record<string, string | undefined> = {
  ev: 'evenements', etab: 'etablissements', prod: 'producers',
  annonce: 'annonces', promo: 'promotions', film: undefined,
}

/** L'annonce faite à toute l'application quand un favori change. */
export interface DetailFavori { type: string; id: string; favori: boolean }

export function useFavori(type: string, id: string, initial: unknown) {
  const api = API_FAVORI[type]
  const [garde, setGarde] = useState<boolean | null>(
    typeof initial === 'boolean' ? initial : null,
  )
  const [busy, setBusy] = useState(false)

  /**
   * L'état manquait : on le demande.
   *
   * Le cas se produit sur une conversation rouverte depuis l'appareil, où les
   * cartes ont été enregistrées avant. Sans compte, la réponse est « non » et
   * le cœur n'apparaît pas — un cœur qui échouerait au clic serait pire que
   * pas de cœur.
   */
  useEffect(() => {
    if (!api || garde !== null) return
    let annule = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const r = await fetch(`/api/${api}/${id}/favorite`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const j = await r.json().catch(() => null)
        if (!annule) setGarde(!!j?.favorited)
      } catch { /* le cœur reste absent */ }
    })()
    return () => { annule = true }
  }, [api, id, garde])

  // Un autre cœur de la même fiche a changé : on s'aligne sans rien demander.
  useEffect(() => {
    const onChange = (e: Event) => {
      const d = (e as CustomEvent<DetailFavori>).detail
      if (d && d.id === id && d.type === type) setGarde(d.favori)
    }
    window.addEventListener('lpv:favori', onChange)
    return () => window.removeEventListener('lpv:favori', onChange)
  }, [id, type])

  const basculer = useCallback(async () => {
    if (!api || busy) return
    setBusy(true)
    const avant = garde
    setGarde(!avant)          // on répond tout de suite, on corrige si besoin
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setGarde(avant); return }
      const r = await fetch(`/api/${api}/${id}/favorite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) { setGarde(avant); return }
      const etat = !!j?.favorited
      setGarde(etat)
      // Tout le monde s'aligne, et la barre du bas le signale à l'ajout.
      window.dispatchEvent(new CustomEvent<DetailFavori>('lpv:favori', {
        detail: { type, id, favori: etat },
      }))
    } catch { setGarde(avant) } finally { setBusy(false) }
  }, [api, busy, garde, id, type])

  return { possible: !!api, garde: garde === true, connu: garde !== null, busy, basculer }
}
