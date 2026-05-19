'use client'
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'

/**
 * HISTORY TRAP PWA
 *
 * Empêche la fermeture involontaire de la PWA installée (Android back button /
 * iOS swipe-from-edge) en injectant une sentinelle dans `window.history`.
 *
 * Comportement :
 *  - Au montage (si standalone ET hors /admin/*) on push une sentinelle
 *    `{ _pwa_trap: true }` sur la pathname courante.
 *  - À chaque `popstate` :
 *      • si l'event est notre sentinelle (`e.state._pwa_trap`) → no-op
 *        (l'app a résorbé une nav au-dessus de la sentinelle)
 *      • sinon → la sentinelle a été pop : on vérifie les guards des forms
 *        dirty, et si tous OK on repush + router.push('/') (si pas déjà
 *        sur la home).
 *
 * COORDINATION avec page.tsx :
 *  Le listener popstate existant de page.tsx ferme les overlays
 *  producteur/établissement. Ses gardes (refs `openXxxIdRef`) le rendent
 *  idempotent et il s'exécute EN PARALLÈLE du trap : pas besoin de filtre
 *  global, juste de filtrer côté page.tsx quand aucun overlay n'est actif
 *  ET que l'event est marqué `_pwa_trap` (pour éviter une fermeture
 *  superflue).
 *
 * GUARDS :
 *  N'importe quel composant peut s'enregistrer via `useHistoryTrap()`
 *  et `registerGuard(async () => boolean)`. Si un guard retourne false
 *  (ex : user annule "Quitter le formulaire"), le trap repush la
 *  sentinelle et l'utilisateur reste sur la page courante.
 */

type GuardFn = () => boolean | Promise<boolean>

interface TrapCtx {
  registerGuard: (g: GuardFn) => () => void
}

const HistoryTrapContext = createContext<TrapCtx>({
  registerGuard: () => () => {},
})

export function useHistoryTrap() { return useContext(HistoryTrapContext) }

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS standalone via Add to Home Screen
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window.navigator as any).standalone === true) return true
  return false
}

export function HistoryTrapProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname() ?? '/'
  const guards = useRef<Set<GuardFn>>(new Set())

  const registerGuard = useCallback((g: GuardFn) => {
    guards.current.add(g)
    return () => { guards.current.delete(g) }
  }, [])

  const isAdminScope = pathname.startsWith('/admin')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!detectStandalone()) return
    if (isAdminScope) return

    const pushSentinel = () => {
      try {
        const url = window.location.pathname + window.location.search
        window.history.pushState({ _pwa_trap: true }, '', url)
      } catch {
        // pushState peut throw en cross-origin context, ignore silencieusement
      }
    }

    // Sentinelle initiale (au-dessus de l'entrée courante)
    pushSentinel()

    let handling = false
    const handler = async (e: PopStateEvent) => {
      if (handling) return
      // Si l'event est notre propre sentinelle, ne rien faire : ça veut
      // juste dire que l'app a pop une entrée ajoutée par dessus.
      if (e.state && typeof e.state === 'object' && e.state._pwa_trap) return

      handling = true
      try {
        // L'app a consumé la sentinelle → on doit la régénérer
        // mais d'abord on demande aux guards (forms dirty etc.) leur avis
        const list = Array.from(guards.current)
        for (const g of list) {
          let allow = true
          try { allow = await g() } catch { allow = true }
          if (!allow) {
            // user a annulé → repush sentinelle (pop suivant restera no-op)
            pushSentinel()
            return
          }
        }
        // Tous les guards OK : repush sentinelle pour la prochaine fois
        pushSentinel()
        // Si on n'est pas sur la home, router.push('/') pour ramener
        // l'utilisateur à l'accueil (comportement attendu PWA standalone)
        if (window.location.pathname !== '/') {
          router.push('/')
        }
      } finally {
        handling = false
      }
    }

    window.addEventListener('popstate', handler)
    return () => {
      window.removeEventListener('popstate', handler)
    }
  // On veut un effet stable sur la durée de vie du scope (pas re-mount
  // à chaque changement de pathname), donc on n'inclut PAS pathname dans
  // les deps — seul isAdminScope (boolean) suffit pour basculer entre
  // les périmètres public / admin.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminScope, router])

  const value = useMemo(() => ({ registerGuard }), [registerGuard])

  return (
    <HistoryTrapContext.Provider value={value}>
      {children}
    </HistoryTrapContext.Provider>
  )
}
