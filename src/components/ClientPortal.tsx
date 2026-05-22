'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Rend ses enfants dans document.body via createPortal.
 *
 * À utiliser pour les modales et drawers qui doivent s'afficher AU-DESSUS
 * de la BottomNavBar et de tout autre stacking context. Sans portal, un
 * modal `fixed inset-0 z-[3500]` rendu dans un parent avec son propre
 * z-index (ex. panel profil zIndex:25 sur la home) reste confiné dans
 * ce contexte → la BottomNavBar globale (zIndex:50 au root) le recouvre.
 */
export default function ClientPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  if (!mounted || typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
