'use client'
import { useState } from 'react'
import {
  CATEGORIES_ANNONCES,
  CATEGORIES_LABELS,
  type AnnonceType,
  type AnnonceCategorie,
} from '@/lib/annonces'

export type TriOption = 'date_desc' | 'prix_asc' | 'prix_desc'

const TYPE_PALETTE: Record<AnnonceType, { bg: string; border: string; text: string }> = {
  vente:            { bg: '#1A1209', border: '#1A1209', text: '#FFFFFF' },
  don:              { bg: '#E8F2EB', border: '#C5DCC9', text: '#2D5A3D' },
  troc:             { bg: '#E8EEF7', border: '#C8D5E8', text: '#3A5D8C' },
  enchere_inversee: { bg: '#FFF0E5', border: '#F5C8A8', text: '#C84B2F' },
}

const TYPES: { id: AnnonceType | null; label: string }[] = [
  { id: null,                label: 'Tout'    },
  { id: 'vente',             label: 'Vente'   },
  { id: 'don',               label: 'Don'     },
  { id: 'troc',              label: 'Troc'    },
  { id: 'enchere_inversee',  label: 'Enchère ↘' },
]

const TRI_LABELS: Record<TriOption, string> = {
  date_desc: 'Plus récents',
  prix_asc:  'Prix ↑',
  prix_desc: 'Prix ↓',
}

interface Props {
  type:      AnnonceType | null
  categorie: AnnonceCategorie | null
  tri:       TriOption
  onTypeChange:      (v: AnnonceType | null) => void
  onCategorieChange: (v: AnnonceCategorie | null) => void
  onTriChange:       (v: TriOption) => void
}

export default function AnnonceFilters({
  type, categorie, tri,
  onTypeChange, onCategorieChange, onTriChange,
}: Props) {
  const [catsOpen, setCatsOpen] = useState(false)
  const catsCount = categorie ? 1 : 0

  return (
    <div className="flex flex-col">
      {/* Type pills V3 — centrés, scrollable horizontalement si débordement */}
      <div
        className="pdv-hscroll flex justify-center gap-1.5 overflow-x-auto px-4 pt-[18px]"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {TYPES.map(t => {
          const active = type === t.id
          const palette = t.id ? TYPE_PALETTE[t.id] : null
          const style = active
            ? palette
              ? { backgroundColor: palette.bg, borderColor: palette.border, color: palette.text }
              : { backgroundColor: '#1A1209', borderColor: '#1A1209', color: '#FFFFFF' }
            : { backgroundColor: '#FFFFFF', borderColor: '#E8E0D4', color: '#7A6A5A' }
          return (
            <button
              key={t.id ?? 'all'}
              type="button"
              onClick={() => onTypeChange(t.id)}
              className="shrink-0 whitespace-nowrap rounded-full border-[1.5px] px-3.5 py-2 text-[12px] font-bold transition-colors"
              style={{ ...style, scrollSnapAlign: 'center' }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Filter + sort row */}
      <div className="flex items-center justify-between gap-2.5 px-4 pb-1 pt-3">
        <button
          type="button"
          onClick={() => setCatsOpen(o => !o)}
          className="inline-flex items-center gap-1.5 rounded-full border border-bord bg-white px-3 py-1.5 text-[12px] font-bold text-texte"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="11" y2="6"/>
            <line x1="14" y1="6" x2="20" y2="6"/>
            <line x1="4" y1="12" x2="7" y2="12"/>
            <line x1="10" y1="12" x2="20" y2="12"/>
            <line x1="4" y1="18" x2="14" y2="18"/>
            <line x1="17" y1="18" x2="20" y2="18"/>
            <circle cx="12.5" cy="6" r="2"/>
            <circle cx="8.5" cy="12" r="2"/>
            <circle cx="15.5" cy="18" r="2"/>
          </svg>
          Filtres
          {catsCount > 0 && (
            <span className="ml-0.5 inline-flex h-[14px] min-w-[16px] items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-extrabold leading-none text-white">
              {catsCount}
            </span>
          )}
        </button>

        <SortDropdown current={tri} onChange={onTriChange} />
      </div>

      {/* Catégories — visible quand "Filtres" ouvert */}
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

function SortDropdown({ current, onChange }: { current: TriOption; onChange: (v: TriOption) => void }) {
  const [open, setOpen] = useState(false)
  const keys = Object.keys(TRI_LABELS) as TriOption[]

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 bg-transparent p-0 text-[12px] font-bold text-texte-doux"
      >
        {TRI_LABELS[current]}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
