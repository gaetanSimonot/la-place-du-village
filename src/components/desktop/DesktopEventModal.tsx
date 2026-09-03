'use client'

import { useEffect } from 'react'
import EvenementPageClient from '@/app/evenement/[id]/client'

/**
 * FICHE ÉVÉNEMENT EN FENÊTRE — version ordinateur.
 *
 * Sur mobile, ouvrir un événement change de page : c'est le bon geste, on
 * revient d'un balayage. Sur bureau, quitter la carte pour revenir ensuite
 * fait perdre le cadrage, les filtres et la position dans la liste — l'app
 * les sauve en session pour les restaurer, ce qui est un contournement de ce
 * problème plutôt qu'une réponse.
 *
 * La fiche s'ouvre donc PAR-DESSUS, sans navigation : on ferme, et l'écran
 * est exactement dans l'état où on l'a laissé, sans rien à restaurer.
 *
 * C'est la MÊME fiche que la page complète — le composant est réutilisé tel
 * quel, rien n'est réécrit. Le bouton « nouvel onglet » mène à la vraie page,
 * pour garder un lien partageable et le référencement.
 */

export default function DesktopEventModal({ id, onClose }: {
  id: string
  onClose: () => void
}) {
  // Échap ferme, et le fond de page ne défile pas derrière la fenêtre.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const avant = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = avant
    }
  }, [onClose])

  return (
    <div className="pcv-evModalFond" onClick={onClose} role="presentation">
      <div
        className="pcv-evModal"
        role="dialog"
        aria-modal="true"
        aria-label="Fiche de l’événement"
        onClick={e => e.stopPropagation()}
      >
        <div className="pcv-evModalBarre">
          <a
            href={`/evenement/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="pcv-evModalLien"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Ouvrir dans un nouvel onglet
          </a>
          <button type="button" onClick={onClose} aria-label="Fermer" className="pcv-evModalX">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        <div className="pcv-evModalCorps pcv-scroll">
          <EvenementPageClient id={id} />
        </div>
      </div>
    </div>
  )
}
