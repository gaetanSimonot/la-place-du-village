'use client'
import { useEffect } from 'react'

/**
 * PAS DE MENU DU NAVIGATEUR À L'APPUI LONG — sauf sur le contenu.
 *
 * Sur Android, un appui long sur une image ou un lien ouvre « Télécharger
 * l'image / Ouvrir dans un nouvel onglet / Copier l'adresse ». Sur iPhone,
 * c'est `-webkit-touch-callout: none` (globals.css) qui le coupe ; sur
 * Android, seul l'événement `contextmenu` le déclenche : on l'annule.
 *
 * On le laisse là où il sert : les champs de saisie, le contenu marqué
 * `.lpv-selectionnable` (publications, commentaires, descriptions — où un
 * appui long sélectionne le texte), et ce qui porte `data-menu-natif`
 * (la visionneuse photo : enregistrer une photo y a du sens).
 *
 * Écrans tactiles seulement : sur ordinateur, le clic droit reste normal.
 */
export default function MenuAppuiLong() {
  useEffect(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) return
    const surMenu = (e: MouseEvent) => {
      const cible = e.target as Element | null
      if (cible?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .lpv-selectionnable, [data-menu-natif]')) return
      e.preventDefault()
    }
    document.addEventListener('contextmenu', surMenu)
    return () => document.removeEventListener('contextmenu', surMenu)
  }, [])
  return null
}
