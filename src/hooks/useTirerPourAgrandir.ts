'use client'
import { useEffect, useRef } from 'react'

/**
 * « Tirer pour agrandir » sur l'image du haut d'une fiche (événement, pro,
 * annonce). Quand la fiche est déjà tout en haut et qu'on tire encore vers le
 * bas, l'image s'étire et pousse le contenu ; relâchée au-delà du seuil, elle
 * s'ouvre en grand (même visionneuse qu'au toucher).
 *
 * On change la HAUTEUR du bandeau image, pas un transform : un transform sur
 * un ancêtre ferait de lui le repère des position:fixed (la visionneuse).
 * Hauteur écrite directement dans le style, sans état React, pour suivre le
 * doigt à chaque image.
 */
const SEUIL = 90          // px de tirage (après résistance) pour ouvrir
const TIRAGE_MAX = 260    // l'image ne s'étire pas au-delà
const RESISTANCE = 0.55   // le bandeau suit le doigt un peu moins vite

function conteneurDeDefilement(el: HTMLElement): HTMLElement {
  let p = el.parentElement
  while (p) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p
    p = p.parentElement
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement
}

export function useTirerPourAgrandir(
  heroRef: React.RefObject<HTMLElement | null>,
  onOuvrir: () => void,
  actif: boolean,
) {
  const onOuvrirRef = useRef(onOuvrir)
  onOuvrirRef.current = onOuvrir

  useEffect(() => {
    const hero = heroRef.current
    if (!hero || !actif) return

    let depart: { x: number; y: number; hauteur: number; defile: HTMLElement } | null = null
    let decide = false     // le premier mouvement a tranché : tirage ou non
    let tirage = 0
    // Hauteur posée par la fiche elle-même (style en ligne, ou '' si elle vient
    // d'une classe) : c'est elle qu'on remet au relâché.
    let hauteurOrigine: string | null = null

    const relacher = () => {
      if (hauteurOrigine === null) return
      hero.style.transition = 'height 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)'
      hero.style.height = hauteurOrigine
      hauteurOrigine = null
    }

    const onStart = (e: TouchEvent) => {
      relacher()   // un 2e doigt pendant un tirage : on rend la main
      depart = null; decide = false; tirage = 0
      if (e.touches.length !== 1) return
      // Toucher dans une fenêtre ouverte par-dessus la fiche (édition,
      // partage…) : pas notre affaire. La fiche peut elle-même vivre dans une
      // modale (fiche pro ouverte depuis la carte) : celle-là contient le bandeau.
      const cible = e.target instanceof Element ? e.target : null
      const fenetre = cible?.closest('[role="dialog"]')
      if (fenetre && !fenetre.contains(hero)) return
      if (cible && !(hero.parentElement?.contains(cible))) return
      const defile = conteneurDeDefilement(hero)
      if (defile.scrollTop > 0) return
      const t = e.touches[0]
      depart = { x: t.clientX, y: t.clientY, hauteur: hero.getBoundingClientRect().height, defile }
    }

    const onMove = (e: TouchEvent) => {
      if (!depart) return
      if (e.touches.length !== 1) { depart = null; relacher(); return }
      const t = e.touches[0]
      const dx = t.clientX - depart.x
      const dy = t.clientY - depart.y
      if (!decide) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
        decide = true
        // Vers le haut = défilement normal ; à l'horizontale = carrousel.
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || depart.defile.scrollTop > 0) { depart = null; return }
        hauteurOrigine = hero.style.height
        hero.style.transition = 'none'
      }
      if (e.cancelable) e.preventDefault()
      tirage = Math.min(TIRAGE_MAX, Math.max(0, dy * RESISTANCE))
      hero.style.height = `${depart.hauteur + tirage}px`
    }

    const onEnd = () => {
      if (!depart) return
      const ouvrir = decide && tirage >= SEUIL
      depart = null
      if (!decide) return
      relacher()
      if (ouvrir) onOuvrirRef.current()
    }

    // Sur la fenêtre : les gestes y remontent, que la fiche défile avec la
    // page ou dans sa modale. passive:false pour bloquer le défilement natif.
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
      if (hauteurOrigine !== null) hero.style.height = hauteurOrigine
      hero.style.transition = ''
    }
  }, [heroRef, actif])
}
