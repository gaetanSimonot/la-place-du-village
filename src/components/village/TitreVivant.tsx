'use client'
import { useEffect, type RefObject } from 'react'

/**
 * LES TITRES DE SECTION S'ALLUMENT QUAND LEUR SECTION PASSE AU MILIEU.
 *
 * Au repos, un titre de rubrique (« Au cinéma », « Nos rubriques »…) est en
 * serif noir. La section qui occupe le milieu de l'écran prend, elle, le style
 * du grand titre « Aujourd'hui / près de chez vous » : sans-serif très gras,
 * début en vert, dernier mot en orange. La page met ainsi l'accent sur ce
 * qu'on regarde.
 *
 * DEUX VERSIONS SUPERPOSÉES dans la même case de grille (globals.css,
 * `.lpv-titre`) : on ne change pas la police d'un texte sous les yeux — ça
 * sauterait —, on fond l'une dans l'autre. La case prend la taille de la plus
 * grande, fixe : rien ne bouge autour au changement.
 *
 * La version vive est `pcv-hide` : sur ordinateur, le titre reste tel quel.
 */
export default function TitreVivant({ texte }: { texte: string }) {
  const i = texte.lastIndexOf(' ')
  const debut = i > 0 ? texte.slice(0, i) : ''
  const fin = i > 0 ? texte.slice(i + 1) : texte
  return (
    <span data-titre-vivant className="lpv-titre">
      <span className="lpv-titre-calme">{texte}</span>
      <span className="lpv-titre-vif pcv-hide" aria-hidden>
        {debut && <span className="lpv-titre-v1">{debut} </span>}
        <span className="lpv-titre-v2">{fin}</span>
      </span>
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
