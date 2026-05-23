'use client'
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

/**
 * NavigationHistoryContext — tracker fiable des navigations Next.js INTERNES
 * (App Router) pour distinguer "user arrivé directement sur cette URL" vs
 * "user a navigué dans l'app avant".
 *
 * Pourquoi pas window.history.length ?
 *  - history.length compte AUSSI les pages visitées hors de l'app avant
 *    d'arriver sur ce domaine, donc length > 1 ne garantit PAS une nav
 *    interne (l'user peut venir d'un onglet Google où il avait visité 50
 *    pages avant).
 *  - history.length ne descend pas à 1 quand on ouvre dans un nouvel onglet
 *    depuis un lien partagé (peut être 1 ou plus selon le browser).
 *
 * Stratégie : on incrémente un compteur à chaque changement de pathname
 * APRÈS le premier mount. count > 1 = vraie nav interne.
 *  - count === 1 : arrivée initiale (premier render, useEffect [pathname]
 *    a fired une fois car pathname est défini au mount)
 *  - count >= 2 : au moins une navigation interne a eu lieu
 *
 * Utilisé par useSmartBack(parentPath) : si nav interne → router.back(),
 * sinon → router.push(parentPath) (évite la sortie de l'app).
 */

const NavCtx = createContext<{ hasInternalHistory: () => boolean }>({
  hasInternalHistory: () => false,
})

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const countRef = useRef(0)

  useEffect(() => {
    countRef.current += 1
  }, [pathname])

  return (
    <NavCtx.Provider value={{ hasInternalHistory: () => countRef.current > 1 }}>
      {children}
    </NavCtx.Provider>
  )
}

export function useNavigationHistory() {
  return useContext(NavCtx)
}
