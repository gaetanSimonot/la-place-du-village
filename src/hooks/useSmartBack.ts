'use client'
import { useRouter } from 'next/navigation'
import { useNavigationHistory } from '@/contexts/NavigationHistoryContext'

/**
 * useSmartBack(parentPath) — retourne une fonction goBack à brancher sur
 * un bouton "retour" / flèche en-haut-à-gauche.
 *
 * Comportement :
 *  - Si l'user a navigué dans l'app avant d'arriver sur cette page
 *    (NavigationHistoryContext.hasInternalHistory() === true)
 *    → router.back() : ramène à la page précédente.
 *  - Sinon (arrivée directe : lien partagé, notif, 1ère page d'une session
 *    PWA, deep link Slack/WhatsApp, etc.)
 *    → router.push(parentPath) : ramène au parent logique au lieu de sortir
 *    de l'app (le router.back() pur sortirait, ce qu'on veut éviter).
 *
 * Usage :
 *   const goBack = useSmartBack('/people')
 *   <button onClick={goBack}>← Retour</button>
 */
export function useSmartBack(parentPath: string): () => void {
  const router = useRouter()
  const { hasInternalHistory } = useNavigationHistory()
  return () => {
    if (hasInternalHistory()) router.back()
    else router.push(parentPath)
  }
}
