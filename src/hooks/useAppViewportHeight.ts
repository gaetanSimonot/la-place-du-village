'use client'
import { useEffect, useState } from 'react'

interface ViewportInfo {
  /** Hauteur réelle de la zone visible (= visualViewport.height) en px.
   *  Sur iOS, c'est ce qui shrink quand le keyboard monte (interactive-widget
   *  pas encore supporté côté Safari donc visualViewport est notre source). */
  height: number
  /** Hauteur du clavier détectée (= window.innerHeight - visualViewport.height
   *  quand keyboard ouvert, 0 sinon). Utilisée pour donner exactement la même
   *  hauteur au panneau "+" et éviter le saut clavier ⇄ panneau. */
  keyboardHeight: number
}

/**
 * Hook source de vérité pour la hauteur du viewport visible.
 *
 * - Écoute window.visualViewport (resize + scroll) et la fenêtre (resize)
 *   en fallback.
 * - Set la CSS variable `--app-vh` sur document.documentElement à chaque
 *   changement → utilisable dans n'importe quel composant avec
 *   `height: var(--app-vh, 100dvh)`.
 * - Retourne aussi { height, keyboardHeight } pour usage React direct.
 *
 * Pourquoi cumuler visualViewport ET un layout segment avec
 * interactiveWidget='resizes-content' ?
 * → 'resizes-content' marche bien sur Chrome Android mais PAS encore sur
 *   iOS Safari. Le hook visualViewport est notre filet pour iOS.
 */
export function useAppViewportHeight(): ViewportInfo {
  const [info, setInfo] = useState<ViewportInfo>({
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
    keyboardHeight: 0,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const update = () => {
      const vv = window.visualViewport
      const vh = vv ? vv.height : window.innerHeight
      // Le keyboard est ouvert quand la différence est > 100px (au-delà des
      // éventuelles barres URL iOS Safari qui font ~40-80px).
      const kb = vv ? Math.max(0, window.innerHeight - vv.height) : 0
      const keyboardHeight = kb > 100 ? kb : 0

      setInfo({ height: vh, keyboardHeight })
      document.documentElement.style.setProperty('--app-vh', `${vh}px`)
    }

    update()
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', update)
      window.visualViewport.addEventListener('scroll', update)
    }
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', update)
        window.visualViewport.removeEventListener('scroll', update)
      }
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return info
}
