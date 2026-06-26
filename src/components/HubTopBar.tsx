'use client'
import type { ReactNode } from 'react'

interface Props {
  /** Ouvre la recherche globale (la loupe remplace l'ancienne barre de recherche). */
  onOpenSearch?: () => void
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
export default function HubTopBar({ onOpenSearch, rightSlot }: Props) {
  return (
    <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
      {/* Logo (gauche) — identique au splash */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/splash-logo-v4.png"
        alt="La Place du Village"
        style={{ height: 52, width: 'auto', maxWidth: '58%', objectFit: 'contain', display: 'block' }}
      />
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
