'use client'
import { useState, type ReactNode } from 'react'
import {
  CATEGORIES_ANNONCES,
  CATEGORIES_LABELS,
  type AnnonceType,
  type AnnonceCategorie,
} from '@/lib/annonces'

export type TriOption = 'date_desc' | 'prix_asc' | 'prix_desc'

/* Couleur de la pill active par type. La pill "Tout" et les pills inactives
   gardent le style blanc/bord. */
const TYPE_PALETTE: Record<AnnonceType, { bg: string; border: string; text: string }> = {
  vente:            { bg: '#1A1209', border: '#1A1209', text: '#FFFFFF' },
  don:              { bg: '#2D5A3D', border: '#2D5A3D', text: '#FFFFFF' },
  troc:             { bg: '#3A5D8C', border: '#3A5D8C', text: '#FFFFFF' },
  service:          { bg: '#2E7D74', border: '#2E7D74', text: '#FFFFFF' },
  enchere_inversee: { bg: '#C84B2F', border: '#C84B2F', text: '#FFFFFF' },
}

/* Icônes lineart cohérentes avec la bottom-nav (stroke 1.8). */
const ICON_ALL = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
  </svg>
)
const TYPE_ICONS: Record<AnnonceType, ReactNode> = {
  vente: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  ),
  don: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/>
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
    </svg>
  ),
  troc: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  ),
  service: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  enchere_inversee: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>
    </svg>
  ),
}

const TYPES: { id: AnnonceType | null; label: string; icon: ReactNode }[] = [
  { id: null,               label: 'Tout',    icon: ICON_ALL },
  { id: 'vente',            label: 'Vente',   icon: TYPE_ICONS.vente },
  { id: 'don',              label: 'Don',     icon: TYPE_ICONS.don },
  { id: 'troc',             label: 'Troc',    icon: TYPE_ICONS.troc },
  { id: 'service',          label: 'Service', icon: TYPE_ICONS.service },
  { id: 'enchere_inversee', label: 'Enchère ↘', icon: TYPE_ICONS.enchere_inversee },
]

const TRI_LABELS: Record<TriOption, string> = {
  date_desc: 'Plus récentes',
  prix_asc:  'Prix ↑',
  prix_desc: 'Prix ↓',
}

interface Props {
  type:      AnnonceType | null
  categorie: AnnonceCategorie | null
  catsOpen:  boolean
  onTypeChange:      (v: AnnonceType | null) => void
  onCategorieChange: (v: AnnonceCategorie | null) => void
}

/**
 * Pills de type (Tout / Vente / Don / Troc / Service / Enchère) avec icônes,
 * + panneau catégories déplié via `catsOpen` (piloté par le bouton « Filtres »
 * de la barre de recherche).
 */
export default function AnnonceFilters({
  type, categorie, catsOpen,
  onTypeChange, onCategorieChange,
}: Props) {
  return (
    <div className="flex flex-col">
      {/* Type pills — scrollable horizontalement, alignées à gauche */}
      <div
        className="pdv-hscroll flex gap-1.5 overflow-x-auto px-4 pt-3.5"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {TYPES.map(t => {
          const active = type === t.id
          const palette = t.id ? TYPE_PALETTE[t.id] : null
          const style = active
            ? palette
              ? { backgroundColor: palette.bg, borderColor: palette.border, color: palette.text }
              : { backgroundColor: '#2D5A3D', borderColor: '#2D5A3D', color: '#FFFFFF' }
            : { backgroundColor: '#FFFFFF', borderColor: '#E8E0D4', color: '#7A6A5A' }
          return (
            <button
              key={t.id ?? 'all'}
              type="button"
              onClick={() => onTypeChange(t.id)}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-3.5 py-2 text-[12px] font-bold transition-colors"
              style={{ ...style, scrollSnapAlign: 'start' }}
            >
              {t.icon}
              {t.label}
            </button>
          )
        })}
        <div className="w-1 shrink-0" aria-hidden />
      </div>

      {/* Catégories — visible quand « Filtres » est ouvert */}
      {catsOpen && (
        <div
          className="pdv-hscroll flex gap-1.5 overflow-x-auto px-4 pt-3"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          <button
            type="button"
            onClick={() => onCategorieChange(null)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-bold ${
              categorie === null ? 'border-primary bg-primary text-white' : 'border-bord bg-white text-texte-doux'
            }`}
          >
            Toutes
          </button>
          {CATEGORIES_ANNONCES.map(c => {
            const active = categorie === c
            return (
              <button
                key={c}
                type="button"
                onClick={() => onCategorieChange(active ? null : c)}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-bold ${
                  active ? 'border-primary bg-primary text-white' : 'border-bord bg-white text-texte-doux'
                }`}
              >
                {CATEGORIES_LABELS[c]}
              </button>
            )
          })}
          <div className="w-4 shrink-0" aria-hidden />
        </div>
      )}
    </div>
  )
}

/**
 * Tri compact « Plus récentes ⌄ » — placé à droite du titre « Dernières annonces ».
 */
export function SortDropdown({ current, onChange }: { current: TriOption; onChange: (v: TriOption) => void }) {
  const [open, setOpen] = useState(false)
  const keys = Object.keys(TRI_LABELS) as TriOption[]

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 bg-transparent p-0 text-[13px] font-bold text-texte-doux"
      >
        {TRI_LABELS[current]}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] overflow-hidden rounded-xl border border-bord bg-white shadow-[0_6px_24px_rgba(44,28,16,0.12)]">
            {keys.map(k => (
              <button
                key={k}
                type="button"
                onClick={() => { onChange(k); setOpen(false) }}
                className={`block w-full whitespace-nowrap px-4 py-2.5 text-left text-[12px] font-semibold ${
                  k === current ? 'bg-cremeDeep text-texte' : 'bg-white text-texte-doux'
                }`}
              >
                {TRI_LABELS[k]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
