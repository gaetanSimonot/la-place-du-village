'use client'
import type { ReactNode } from 'react'

interface Props {
  /** Ouvre la recherche globale (la loupe). */
  onOpenSearch?: () => void
  /** Le logo cliquable rouvre le splash éditorial. */
  onOpenSplash?: () => void
  /** Bouton « Partager ». */
  onShareApp?: () => void
  /** Menu infos (☰). */
  onOpenMenu?: () => void
  /** Bloc central : salutation + compteur + EN DIRECT. */
  greeting?: ReactNode
  /** Pastille « En ce moment » (photos), tout à droite. */
  rightSlot?: ReactNode
  // — props historiques conservées pour compat appelants, non utilisées —
  onOpenNotifs?: () => void
  onOpenZone?:   () => void
  zoneLabel?:    string
  unreadCount?:  number
}

/**
 * Header du hub (une seule barre) :
 * logo | salutation + compteur + EN DIRECT | partager · menu · loupe · photos.
 */
export default function HubTopBar({ onOpenSearch, onOpenSplash, onShareApp, onOpenMenu, greeting, rightSlot }: Props) {
  return (
    <div className="flex items-center gap-2.5 px-3.5 pt-3">
      {/* Logo (cliquable → splash) */}
      <button
        type="button"
        onClick={onOpenSplash}
        aria-label="Ouvrir l'accueil éditorial"
        className="shrink-0 border-none bg-transparent p-0"
        style={{ lineHeight: 0, cursor: 'pointer' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/splash-logo-v4.png" alt="La Place du Village" style={{ height: 42, width: 'auto', objectFit: 'contain', display: 'block' }} />
      </button>

      {/* Bloc central : salutation + compteur + EN DIRECT */}
      {greeting && <div className="min-w-0 flex-1">{greeting}</div>}

      {/* Icônes : partager · menu · loupe · photos */}
      <div className="flex shrink-0 items-center gap-0.5">
        {onShareApp && (
          <button
            type="button"
            onClick={onShareApp}
            aria-label="Partager l'app"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-texte"
          >
            {/* Flèche « partager / transférer » orientée vers la droite */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="13 6 19 12 13 18" />
              <path d="M19 12H8a4 4 0 0 0-4 4v2" />
            </svg>
          </button>
        )}
        {onOpenMenu && (
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="À propos de La Place du Village"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-texte"
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Rechercher"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-texte"
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
        </button>
        {rightSlot}
      </div>
    </div>
  )
}
