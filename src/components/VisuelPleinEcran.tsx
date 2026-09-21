'use client'
import { useEffect } from 'react'
import ClientPortal from '@/components/ClientPortal'

/**
 * Une image montrée EN GRAND, par-dessus tout le reste.
 *
 * Une affiche de spectacle est un objet graphique : à 122 px de large, on
 * devine le titre et rien d'autre. Un appui dessus doit la donner entière.
 *
 * Trois choses qui ont chacune une raison :
 *
 * — `ClientPortal`. La visionneuse sort vers `document.body`, sinon elle
 *   resterait enfermée dans le contexte d'empilement de la fiche et passerait
 *   SOUS la barre de navigation du bas (piège documenté sur ce projet).
 * — Le défilement de la page est gelé pendant l'affichage, sinon le fond
 *   glisse sous les doigts quand on essaie de déplacer l'image.
 * — Échap ferme, et le bouton retour du téléphone aussi : on pose une entrée
 *   d'historique à l'ouverture et on la retire à la fermeture. Sans ça, le
 *   geste naturel pour fermer fait sortir de la fiche.
 */
export default function VisuelPleinEcran({ url, titre, onClose }: {
  url: string
  titre: string
  onClose: () => void
}) {
  useEffect(() => {
    const avant = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const parEchap = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    // `history.back()` déclenche popstate : c'est le bouton retour du système
    // qui ferme l'image au lieu de quitter la page.
    const parRetour = () => onClose()
    window.addEventListener('keydown', parEchap)
    window.history.pushState({ visuel: true }, '')
    window.addEventListener('popstate', parRetour)

    return () => {
      document.body.style.overflow = avant
      window.removeEventListener('keydown', parEchap)
      window.removeEventListener('popstate', parRetour)
      // Si on ferme autrement que par le bouton retour, l'entrée posée à
      // l'ouverture est encore là : on la retire, sans quoi il faudrait
      // appuyer deux fois sur Retour pour quitter la fiche.
      if (window.history.state?.visuel) window.history.back()
    }
  }, [onClose])

  return (
    <ClientPortal>
      <div
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        style={{
          position: 'fixed', inset: 0, zIndex: 3000,
          background: 'rgba(8,4,4,.94)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px',
          paddingTop: 'max(16px, env(safe-area-inset-top, 16px))',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
        }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={titre}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 }} />

        <button onClick={onClose} aria-label="Fermer"
          style={{
            position: 'fixed', right: 14,
            top: 'max(14px, env(safe-area-inset-top, 14px))',
            width: 38, height: 38, borderRadius: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(255,255,255,.22)', background: 'rgba(0,0,0,.45)',
            color: '#fff', backdropFilter: 'blur(4px)',
          }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </ClientPortal>
  )
}
