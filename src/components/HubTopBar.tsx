'use client'
import type { ReactNode } from 'react'
import InstallOrShareButton from '@/components/InstallOrShareButton'

interface Props {
  /** Ouvre la recherche globale (la loupe remplace l'ancienne barre de recherche). */
  onOpenSearch?: () => void
  /** Le logo cliquable rouvre le splash éditorial (il reste à sa place). */
  onOpenSplash?: () => void
  /** Bouton « Partager » affiché à droite du logo. */
  onShareApp?: () => void
  /** Pastille « En ce moment » (photos), affichée à droite de la loupe. */
  rightSlot?: ReactNode
  // — props historiques conservées pour compat appelants, non utilisées —
  onOpenMenu?:   () => void
  onOpenNotifs?: () => void
  onOpenZone?:   () => void
  zoneLabel?:    string
  unreadCount?:  number
}

/**
 * Header du hub : logo (cliquable → splash) + partager | loupe + photos.
 */
export default function HubTopBar({ onOpenSearch, onOpenSplash, onShareApp, onOpenMenu, rightSlot }: Props) {
  return (
    <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
      {/* Gauche : logo cliquable (→ splash) + partager */}
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenSplash}
          aria-label="Ouvrir l'accueil éditorial"
          className="shrink-0 border-none bg-transparent p-0"
          style={{ lineHeight: 0, cursor: 'pointer' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/splash-logo-v4.png"
            alt="La Place du Village"
            style={{ height: 50, width: 'auto', objectFit: 'contain', display: 'block' }}
          />
        </button>
        {onShareApp && <InstallOrShareButton onShare={onShareApp} />}
        {onOpenMenu && (
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="À propos de La Place du Village"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-texte"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" />
            </svg>
          </button>
        )}
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
