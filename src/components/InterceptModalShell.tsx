'use client'
import { useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useSmartBack } from '@/hooks/useSmartBack'
import { InterceptModalProvider } from '@/contexts/InterceptModalContext'

/**
 * Shell pour les modales d'intercepting routes (fiche producteur / établissement
 * ouverte par-dessus la home en soft-nav).
 *
 * - Rendu en position absolute par-dessus children du layout (la home + carte
 *   restent montées dessous → la carte ne recharge pas).
 * - close via useSmartBack('/') : back() si historique interne, push('/') sinon
 *   → la modale se ferme proprement et l'app ne peut JAMAIS sortir, même sur
 *   un cas d'historique tordu.
 * - Escape key → close.
 * - Click sur le shell (pas le contenu) → close.
 * - GARDE pathname : Next garde le slot @modal "sticky" après un router.push
 *   ou router.replace (le rendu intercepté n'est pas démonté). On masque
 *   nous-mêmes le shell dès que le pathname ne matche plus le préfixe
 *   d'origine de la fiche → render null = enfants démontés = fiche disparaît
 *   au 1er clic. La BottomNavBar interne utilise router.replace pour
 *   échanger l'entrée fiche contre la destination, sans pile [..., fiche,
 *   destination] parasite.
 *
 * NB : ce composant n'est utilisé QUE par les intercepting routes du slot
 * @modal. La vraie route /producteur/[id] (refresh / lien direct) reste
 * plein écran via son layout normal et ne reçoit PAS le contexte.
 */
export default function InterceptModalShell({
  match,
  children,
}: {
  /** Préfixe du pathname intercepté (ex: "/producteur/"). Tant qu'il matche,
   *  le shell s'affiche ; dès qu'il ne matche plus, on render null. */
  match: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const goBack = useSmartBack('/')

  const close = useCallback(() => {
    goBack()
  }, [goBack])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // Garde : si l'URL n'est plus la fiche interceptée, le slot @modal est
  // resté sticky côté Next — on masque tout. Plus besoin de router.back()
  // pour cacher la modale après une nav.
  if (!pathname || !pathname.startsWith(match)) return null

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
      <InterceptModalProvider close={close}>
        {children}
      </InterceptModalProvider>
    </div>
  )
}
