'use client'
import { createContext, useContext, type ReactNode } from 'react'

/**
 * InterceptModalContext — signale aux composants enfants qu'ils sont rendus
 * À L'INTÉRIEUR d'une intercepting modal (slot @modal de Next.js).
 *
 * Pourquoi : un parallel slot ne se ferme PAS avec router.push(). Seul
 * router.back() le démonte proprement. Tout composant qui veut naviguer
 * depuis l'intérieur du shell doit donc d'abord fermer la modale, puis
 * pousser la destination. Ce contexte expose `close` pour ça.
 *
 * - Provider posé par InterceptModalShell uniquement (le wrapper du slot).
 * - La vraie route plein écran /producteur/[id] (refresh / lien direct)
 *   ne reçoit PAS ce contexte → `useInterceptModal()` y retourne `null` →
 *   les callers gardent leur comportement de nav classique.
 */
const InterceptModalCtx = createContext<{ close: () => void } | null>(null)

export function InterceptModalProvider({
  close,
  children,
}: {
  close: () => void
  children: ReactNode
}) {
  return (
    <InterceptModalCtx.Provider value={{ close }}>
      {children}
    </InterceptModalCtx.Provider>
  )
}

export function useInterceptModal() {
  return useContext(InterceptModalCtx)
}
