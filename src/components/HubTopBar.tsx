'use client'
import type { ReactNode } from 'react'

interface Props {
  /** Ouvre la recherche globale (la loupe remplace l'ancienne barre de recherche). */
  onOpenSearch?: () => void
  /** Rouvre le splash éditorial (petit bouton retour à gauche du logo). */
  onOpenSplash?: () => void
  /** Pastille « En ce moment » (photos), affichée à droite de la loupe. */
  rightSlot?: ReactNode
  // — props historiques conservées pour compat appelants, non utilisées —
  onOpenMenu?:   () => void
  onOpenNotifs?: () => void
  onOpenZone?:   () => void
  onShareApp?:   () => void
  zoneLabel?:    string
  unreadCount?:  number
}

/**
 * Header du hub — unifié avec le splash éditorial : logo (gauche) + loupe + photos.
 * Plus de wordmark texte ni de sélecteur de zone (la zone est dans le logo).
 */
export default function HubTopBar({ onOpenSearch, onOpenSplash, rightSlot }: Props) {
  return (
    <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
      {/* Gauche : bouton retour vers le splash + logo */}
      <div className="flex min-w-0 items-center gap-1.5">
        {onOpenSplash && (
          <button
            type="button"
            onClick={onOpenSplash}
            aria-label="Revenir à l'accueil éditorial"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-texte-doux"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/splash-logo-v4.png"
          alt="La Place du Village"
          style={{ height: 52, width: 'auto', maxWidth: '100%', objectFit: 'contain', display: 'block' }}
        />
      </div>
      {/* Droite : loupe + photos */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Rechercher"
          className="flex h-10 w-10 items-center justify-center rounded-full text-texte"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
        </button>
        {rightSlot}
      </div>
    </div>
  )
}
