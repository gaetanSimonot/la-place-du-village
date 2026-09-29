'use client'
import { useEffect, type RefObject } from 'react'

/**
 * LES TITRES DE SECTION S'ALLUMENT QUAND LEUR SECTION PASSE AU MILIEU.
 *
 * Sur téléphone, un titre de rubrique (« Au cinéma », « Nos rubriques »…) est
 * dans la police du grand titre « Aujourd'hui / près de chez vous » —
 * sans-serif très gras —, en noir. La section qui occupe le milieu de
 * l'écran se colore comme lui (début vert, dernier mot orange) et grossit de
 * 15 %. La page met ainsi l'accent sur ce qu'on regarde.
 *
 * UNE SEULE POLICE, UN SEUL TEXTE : on n'anime que la couleur et un
 * `transform: scale`. Un premier essai fondait un serif noir dans une
 * version sans-serif colorée : deux polices ne se fondent jamais proprement,
 * ça faisait une saute. Le grossissement est un transform : il ne pousse rien
 * autour. Styles : globals.css, `.lpv-titre` (téléphone seulement — sur
 * ordinateur, le titre garde son style d'origine).
 */
export default function TitreVivant({ texte }: { texte: string }) {
  const i = texte.lastIndexOf(' ')
  const debut = i > 0 ? texte.slice(0, i) : ''
  const fin = i > 0 ? texte.slice(i + 1) : texte
  return (
    <span data-titre-vivant className="lpv-titre">
      {debut && <span className="lpv-titre-v1">{debut} </span>}
      <span className="lpv-titre-v2">{fin}</span>
    </span>
  )
}

/**
 * Désigne LE titre actif : celui de la section qui occupe le milieu de
 * l'écran — le dernier titre déjà passé au-dessus de la ligne des 50 %.
 * Tant qu'aucun ne l'a franchie (haut de page), aucun n'est actif : c'est le
 * grand titre du haut qui a l'accent.
 *
 * L'état s'écrit en attribut (`data-actif`) directement sur l'élément, au
 * défilement : aucun rendu React. Téléphone seulement.
 */
export function useTitresVivants(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const racine = ref.current
    if (!racine) return
    if (window.matchMedia('(min-width: 1024px)').matches) return
    const defileur = racine.closest('.pcv-panel') as HTMLElement | null
    const cible: HTMLElement | Window = defileur ?? window

    let raf = 0
    let actif: Element | null = null
    const maj = () => {
      raf = 0
      const cadre = defileur ? defileur.getBoundingClientRect() : { top: 0, height: window.innerHeight }
      const milieu = cadre.top + cadre.height / 2
      let choisi: Element | null = null
      for (const t of Array.from(racine.querySelectorAll('[data-titre-vivant]'))) {
        if (t.getBoundingClientRect().top < milieu) choisi = t
      }
      if (choisi !== actif) {
        actif?.removeAttribute('data-actif')
        choisi?.setAttribute('data-actif', '')
        actif = choisi
      }
    }
    const surDefile = () => { if (!raf) raf = requestAnimationFrame(maj) }

    cible.addEventListener('scroll', surDefile, { passive: true })
    window.addEventListener('resize', surDefile)
    // Le contenu arrive par morceaux (cinéma, théâtre, fil) et pousse les
    // titres vers le bas SANS défilement : sans cette écoute, un titre jugé
    // au-dessus du milieu au premier calcul restait allumé en haut de page.
    const ro = new ResizeObserver(surDefile)
    ro.observe(racine)
    maj()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      cible.removeEventListener('scroll', surDefile)
      window.removeEventListener('resize', surDefile)
      actif?.removeAttribute('data-actif')
    }
  }, [ref])
}
