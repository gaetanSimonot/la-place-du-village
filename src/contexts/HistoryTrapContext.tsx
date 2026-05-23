'use client'
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'

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

    // ── État local "appuie encore pour quitter" ──────────────────────────
    // exitArmedAt : timestamp du dernier back qui a armé l'exit. Si un autre
    // back arrive dans EXIT_WINDOW_MS, on laisse passer (pas de repush) →
    // l'app peut quitter. Sinon : toast + repush sentinelle.
    let exitArmedAt = 0
    let exitTimer: ReturnType<typeof setTimeout> | null = null
    const EXIT_WINDOW_MS = 2000

    let handling = false
    const handler = async (e: PopStateEvent) => {
      if (handling) return

      // ── Cas 1 : on est retombé SUR une sentinelle (donc une entrée non-
      // sentinelle au-dessus vient d'être pop, ex: fermeture d'une modale
      // intercept /producteur/[id]). La modale ferme via Next ; on laisse
      // la sentinelle restante en place pour buffer le prochain back. Pas
      // de toast ici car ce back a un effet visible (fermeture modale).
      // ──────────────────────────────────────────────────────────────────
      if (e.state && typeof e.state === 'object' && (e.state as { _pwa_trap?: boolean })._pwa_trap) {
        return
      }

      // ── Cas 2 : on est retombé À CÔTÉ d'une sentinelle (la sentinelle
      // elle-même vient d'être pop, on est revenu à l'état d'avant — home
      // racine en pratique). C'est ici qu'on arme l'exit.
      // ──────────────────────────────────────────────────────────────────
      handling = true
      try {
        // Demande aux guards (forms "dirty") leur avis. Si un refuse → repush
        // sans armer l'exit, l'user reste sur la page courante.
        const list = Array.from(guards.current)
        for (const g of list) {
          let allow = true
          try { allow = await g() } catch { allow = true }
          if (!allow) {
            pushSentinel()
            return
          }
        }

        const now = Date.now()

        // 2e back dans la fenêtre EXIT_WINDOW_MS → on laisse quitter.
        // Le pop a déjà eu lieu, on ne repush PAS la sentinelle → l'entrée
        // racine sera dépilée par le prochain back natif (ou l'app quitte
        // immédiatement si la stack est déjà au minimum).
        if (now - exitArmedAt < EXIT_WINDOW_MS) {
          if (exitTimer) { clearTimeout(exitTimer); exitTimer = null }
          exitArmedAt = 0
          // Pas de repush → exit possible. Si on n'est pas sur la home,
          // on tombe sur l'historique d'avant (qui peut être l'app ou hors-app).
          return
        }

        // 1er back : arme l'exit + toast + repush sentinelle (buffer pour
        // permettre la séquence "2e back rapide → quitte").
        exitArmedAt = now
        if (exitTimer) clearTimeout(exitTimer)
        exitTimer = setTimeout(() => { exitArmedAt = 0; exitTimer = null }, EXIT_WINDOW_MS)

        // Toast non bloquant — informe l'user du double-tap pour quitter.
        // Style aligné sur le reste de l'app (sonner Toaster racine layout).
        toast('Appuie encore pour quitter', { duration: EXIT_WINDOW_MS })

        pushSentinel()

        // Safety net : si pour une raison X l'user est sur une autre route
        // que '/' au moment où la sentinelle home est pop (rare car la
        // sentinelle est poussée au mount sur la page courante), on ramène
        // proprement à l'accueil.
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
      if (exitTimer) clearTimeout(exitTimer)
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
