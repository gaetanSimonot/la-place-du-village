'use client'
import { useState, useEffect } from 'react'
import { useTerritoire } from '@/components/TerritoireProvider'

/**
 * LA ZONE PERSONNELLE, ET LE TERRITOIRE AUQUEL ELLE APPARTIENT.
 *
 * Une zone réglée à Ganges ne veut rien dire à Pau. La règle est simple —
 * elle n'a cours QUE dans le territoire où elle a été posée — mais elle était
 * recopiée dans quatre composants, et deux l'avaient oubliée. Les deux qui
 * l'oubliaient étaient justement ceux qui envoient la zone au hub :
 *
 *   une zone ancrée sur Pau, appliquée en vue Cévennes, ne trouve aucun
 *   événement du jour — et la section « Aujourd'hui » disparaît entièrement,
 *   sans message, parce qu'elle se masque quand elle est vide.
 *
 * D'où ce hook : un seul endroit où la règle vit, pour qu'elle ne puisse plus
 * diverger. Constaté le 20/09/2026.
 *
 * `pret` distingue « pas encore lu » de « aucune zone ». Sans ce drapeau la
 * première requête partirait sans zone, et les tuiles changeraient sous les
 * yeux au second appel. Il attend aussi de savoir QUEL territoire on regarde :
 * décider avant, c'est décider à pile ou face.
 *
 * Lecture en effet et non pendant le rendu — `localStorage` n'existe pas au
 * rendu serveur, et un écart entre les deux fait repartir React de zéro.
 */

export interface ZonePerso {
  lat: number
  lng: number
  rayon: number
  /** Le nom de ville affiché dans l'en-tête. Peut être vide. */
  nom: string
}

const CLE = 'pdv-zone-user'

export function useZonePerso(): { pret: boolean; zone: ZonePerso | null } {
  const { territoire, pret: territoirePret } = useTerritoire()
  const slug = territoire?.slug ?? null
  const parDefaut = !!territoire?.par_defaut

  const [etat, setEtat] = useState<{ pret: boolean; zone: ZonePerso | null }>({ pret: false, zone: null })

  useEffect(() => {
    if (!territoirePret) return
    try {
      const brut = localStorage.getItem(CLE)
      const z = brut ? (JSON.parse(brut) as Record<string, unknown>) : null

      // Une zone d'avant les territoires n'en porte aucun : elle appartient
      // au territoire par défaut, là où elle a forcément été réglée.
      const sienne = z ? (z.territoire ? z.territoire === slug : parDefaut) : false
      const valide =
        typeof z?.lat === 'number' && typeof z?.lng === 'number' && typeof z?.rayon === 'number'

      setEtat({
        pret: true,
        zone: z && sienne && valide
          ? {
              lat: z.lat as number,
              lng: z.lng as number,
              rayon: z.rayon as number,
              nom: typeof z.nom === 'string' ? z.nom.trim() : '',
            }
          : null,
      })
    } catch {
      setEtat({ pret: true, zone: null })
    }
    // Changer de territoire rejoue la lecture : la zone de l'un n'a pas cours
    // chez l'autre, et l'écran doit le refléter tout de suite.
  }, [territoirePret, slug, parDefaut])

  return etat
}
