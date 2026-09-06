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
 * UNE exception, et elle est dissymétrique : rien pendant qu'un doigt déplace
 * la carte.
 *
 * Déplacer la carte fait tomber la feuille, et compenser cette chute ne fait
 * pas que glisser le fond — ça DÉVORE le geste. La compensation part dans le
 * sens inverse du doigt et l'annule : la carte s'ébroue puis se bloque. Sur
 * Google, écrire le centre à chaque image pendant un glissement actif entre en
 * plus en conflit avec le glissement lui-même. Pendant que le doigt commande,
 * la carte ne bouge donc pas toute seule.
 *
 * La remontée, elle, est suivie : là plus personne ne touche à rien, et ce
 * qu'on venait d'amener au milieu doit y rester quand la fenêtre rétrécit.
 * Rien à répliquer pour ça — suivre le ressort image par image EST l'animer
 * sur la même durée et la même courbe, puisque c'est le même ressort.
 *
 * @param sheetY      position du haut de la feuille, partagée par la page
 * @param suspenduRef vrai tant qu'un doigt déplace la carte
 * @param actif       faux = on ne touche à rien (carte fixe, carte pas prête)
 * @param deplacer    reçoit le nombre de pixels dont le FOND doit descendre
 *                    (négatif : il monte). À charge de chaque carte de le
 *                    traduire dans son propre vocabulaire.
 */
export function useSuiviFeuille(
  sheetY: MotionValue<number> | undefined,
  suspenduRef: React.MutableRefObject<boolean> | undefined,
  actif: boolean,
  deplacer: (dyFond: number) => void,
) {
  // La fonction change à chaque rendu du parent : on la garde dans une boîte
  // plutôt que de rebrancher l'abonnement (et de perdre la position précédente)
  // à chaque fois.
  const deplacerRef = useRef(deplacer)
  deplacerRef.current = deplacer
  const precedent = useRef<number | null>(null)

  useEffect(() => {
    if (!sheetY || !actif) return
    // Sur ordinateur la feuille est une colonne fixe : sa valeur continue de
    // bouger dans le vide (le CSS la neutralise), et la suivre ferait dériver
    // la carte sans que rien n'ait bougé à l'écran.
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) return

    const off = sheetY.on('change', v => {
      const p = precedent.current
      // Le repère se met à jour MÊME quand on ne compense pas — c'est ce qui
      // évite le saut à la reprise : sans ça, la chute non compensée serait
      // rattrapée d'un coup à la première image de la remontée.
      precedent.current = v
      if (p === null) return          // première lecture : on prend le repère
      const d = v - p
      if (!Number.isFinite(d) || d === 0) return
      // La feuille démarre à 9999 avant d'être placée : ce n'est pas un geste,
      // et compenser un tel saut enverrait la carte à l'autre bout du monde.
      if (Math.abs(d) > 4000) return
      if (suspenduRef?.current) return
      deplacerRef.current(d / 2)
    })
    return () => { off(); precedent.current = null }
  }, [sheetY, suspenduRef, actif])
}
