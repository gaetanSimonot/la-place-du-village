'use client'
import { useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Shell pour les modales d'intercepting routes (fiche producteur / établissement
 * ouverte par-dessus la home en soft-nav).
 *
 * - Rendu en position absolute par-dessus children du layout (la home + carte
 *   restent montées dessous → la carte ne recharge pas).
 * - router.back() au close → ferme la modale via la nav Next (l'historique
 *   reflète déjà /producteur/abc grâce au soft-nav initial).
 * - Escape key → close.
 * - Click sur le shell (pas le contenu) → close.
 *
 * NB : ce composant n'est utilisé QUE par les intercepting routes du slot
 * @modal. La vraie route /producteur/[id] (refresh / lien direct) reste
 * plein écran via son layout normal.
 */
export default function InterceptModalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  const close = useCallback(() => {
    router.back()
  }, [router])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        // z-index 400 = au-dessus de tous les overlays carte de page.tsx :
        //   1 carte · 19 ProBandeau · 25 vues plein écran · 200 boutons map
        //   (search/filtres/+) · 300/301 backdrop+menu publish · 50 nav bar
        // → 400 nous met devant tout, fiche complètement isolée.
        zIndex: 400,
        background: 'var(--creme, #FDFAF5)',
        overflowY: 'auto',
        // overscroll-behavior contain → swipe-back navigateur n'agit pas
        // sur la fiche elle-même, seulement sur l'historique
        overscrollBehavior: 'contain',
      }}
    >
      {children}
    </div>
  )
}
