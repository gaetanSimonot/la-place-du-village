'use client'
import { useEffect, useRef } from 'react'
import type { MotionValue } from 'framer-motion'

/**
 * La carte suit la feuille : son centre reste au milieu de ce qu'on voit.
 *
 * Sur mobile, la carte occupe tout l'écran et la feuille lui en mange le bas.
 * La fenêtre réellement visible va donc de 0 à la position de la feuille, et
 * son milieu est à la moitié de ça. Quand la feuille monte de 200 px, ce
 * milieu monte de 100 px : sans rien faire, le lieu qu'on regardait glisse
 * vers le bas et finit sous la liste.
 *
 * La règle tient en une ligne : **le fond se déplace de la moitié du
 * déplacement de la feuille, dans le même sens**. Le point géographique au
 * centre ne change alors jamais — c'est la fenêtre qui change de taille
 * autour de lui.
 *
 * Le décalage du haut (barre de l'application) ne compte pas : il est le même
 * avant et après, il disparaît de la différence.
 *
 * ── LE VOYAGE D'INSTALLATION NE SE COMPENSE PAS ────────────────────────────
 *
 * À l'ouverture, la feuille part de sa valeur d'attente — 9999, « pas encore
 * placée » — et rejoint son palier par un ressort qui dépasse largement avant
 * d'y revenir. Mesuré sur un téléphone : 9999 → −6076 → 388, plus de seize
 * mille pixels parcourus en 700 ms.
 *
 * Ce voyage n'est pas un mouvement de feuille, c'est sa mise en place. Le
 * compenser envoyait la carte à 66° de latitude, au nord de la Norvège — et
 * comme la vue est ensuite sauvegardée puis rejouée, chaque ouverture repartait
 * plus haut que la précédente.
 *
 * Écarter les valeurs aberrantes ne suffit PAS : le ressort ne fait que des
 * petits pas, tous plausibles un par un, dont la somme est absurde. On n'arme
 * donc le suivi qu'une fois la feuille arrivée à son palier. Après quoi il ne
 * compense plus que des mouvements voulus.
 *
 * ── UNE EXCEPTION, DISSYMÉTRIQUE ───────────────────────────────────────────
 *
 * Rien pendant qu'un doigt déplace la carte. Déplacer la carte fait tomber la
 * feuille, et compenser cette chute ne fait pas que glisser le fond : ça dévore
 * le geste, la compensation partant dans le sens inverse du doigt. Sur Google,
 * écrire le centre à chaque image pendant un glissement actif entre en plus en
 * conflit avec le glissement lui-même.
 *
 * La remontée, elle, est suivie : là plus personne ne touche à rien, et ce
 * qu'on venait d'amener au milieu doit y rester quand la fenêtre rétrécit.
 * Rien à répliquer pour ça — suivre le ressort image par image EST l'animer
 * sur la même durée et la même courbe, puisque c'est le même ressort.
 */
export interface SuiviFeuille {
  /** Position vivante du haut de la feuille. */
  position?: MotionValue<number>
  /** Palier visé — sert à savoir quand la feuille est arrivée. */
  palier?: MotionValue<number>
  /** Hauteur de la carte, lue au moment où on en a besoin. */
  hauteurCarte: () => number
  /** Vrai tant qu'un doigt déplace la carte. */
  suspendu?: React.MutableRefObject<boolean>
  /** Faux = on ne touche à rien (carte fixe, carte pas prête). */
  actif: boolean
}

/** À quelle distance de son palier on considère la feuille arrivée. */
const ARRIVEE_PX = 2

export function useSuiviFeuille(
  { position, palier, hauteurCarte, suspendu, actif }: SuiviFeuille,
  deplacer: (dyFond: number) => void,
) {
  // La fonction change à chaque rendu du parent : on la garde dans une boîte
  // plutôt que de rebrancher l'abonnement (et de perdre la position précédente)
  // à chaque fois.
  const deplacerRef = useRef(deplacer)
  deplacerRef.current = deplacer
  const precedent = useRef<number | null>(null)
  /** La feuille est-elle arrivée à son palier au moins une fois ? */
  const arme = useRef(false)

  useEffect(() => {
    if (!position || !actif) return
    // Sur ordinateur la feuille est une colonne fixe : sa valeur continue de
    // bouger dans le vide (le CSS la neutralise), et la suivre ferait dériver
    // la carte sans que rien n'ait bougé à l'écran.
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) return

    const off = position.on('change', v => {
      const p = precedent.current
      // Le repère se met à jour MÊME quand on ne compense pas — c'est ce qui
      // évite le saut à la reprise : sans ça, tout ce qu'on a laissé passer
      // serait rattrapé d'un coup à la première image compensée.
      precedent.current = v
      if (p === null) return          // première lecture : on prend le repère

      const h = hauteurCarte()
      const cible = palier?.get()
      const cibleSure = cible != null && Number.isFinite(cible) && h > 0 && cible >= 0 && cible <= h

      // Tant que la feuille n'est pas arrivée à son palier, on ne compense
      // rien : c'est sa mise en place, pas un mouvement.
      if (!arme.current) {
        if (cibleSure && Math.abs(v - cible) <= ARRIVEE_PX) arme.current = true
        return
      }

      // Une position de feuille ne s'éloigne pas de son palier de plus d'une
      // hauteur de carte. Au-delà, ce n'est pas une position : c'est une
      // valeur d'attente, ou un dépassement qui n'a rien de visible.
      if (cibleSure && Math.abs(v - cible) > h) return

      const d = v - p
      if (!Number.isFinite(d) || d === 0) return
      if (suspendu?.current) return
      deplacerRef.current(d / 2)
    })
    return () => { off(); precedent.current = null; arme.current = false }
  }, [position, palier, hauteurCarte, suspendu, actif])
}
