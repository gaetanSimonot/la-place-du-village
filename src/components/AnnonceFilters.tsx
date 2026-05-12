'use client'
import { useState } from 'react'
import {
  CATEGORIES_ANNONCES,
  CATEGORIES_LABELS,
  CATEGORIES_ICONS,
  type AnnonceType,
  type AnnonceCategorie,
} from '@/lib/annonces'

export type TriOption = 'date_desc' | 'prix_asc' | 'prix_desc'

const TYPES: { id: AnnonceType | null; label: string; emoji: string; color: string; bg: string }[] = [
  { id: null,                label: 'Tous',     emoji: '🔎', color: '#2D5A3D', bg: '#E8F2EB' },
  { id: 'vente',             label: 'Vente',    emoji: '🏷️', color: '#3A5BC7', bg: '#EEF3FF' },
  { id: 'troc',              label: 'Troc',     emoji: '🔄', color: '#E8622A', bg: '#FFF0EB' },
  { id: 'don',               label: 'Don',      emoji: '🎁', color: '#2D5A3D', bg: '#E8F2EB' },
  { id: 'enchere_inversee',  label: 'Enchère',  emoji: '📉', color: '#C0392B', bg: '#FBE9E7' },
]

const TRI_LABELS: Record<TriOption, string> = {
  date_desc: 'Plus récent',
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
  const [showAllCats, setShowAllCats] = useState(false)
  const visibleCats = showAllCats ? CATEGORIES_ANNONCES : CATEGORIES_ANNONCES.slice(0, 3)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 16px 14px' }}>

      {/* Types avec icônes carrées colorées */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', margin: '0 -16px', padding: '4px 16px' }}>
        {TYPES.map(t => {
          const active = type === t.id
          return (
            <button
              key={t.id ?? 'all'}
              type="button"
              onClick={() => onTypeChange(t.id)}
              style={{
                flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 12px 6px 6px', borderRadius: 14,
                border: active ? `2px solid ${t.color}` : '1.5px solid #E5DDD2',
                backgroundColor: '#fff',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                color: active ? t.color : '#3C2C20',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{
                width: 26, height: 26, borderRadius: 8,
                backgroundColor: t.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, flexShrink: 0,
              }}>{t.emoji}</span>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Catégories : 3 d'abord + Plus, ou toutes */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', margin: '0 -16px', padding: '0 16px' }}>
        <CatPill active={categorie === null} onClick={() => onCategorieChange(null)}>Toutes</CatPill>
        {visibleCats.map(c => (
          <CatPill key={c} active={categorie === c} onClick={() => onCategorieChange(categorie === c ? null : c)}>
            {CATEGORIES_ICONS[c]} {CATEGORIES_LABELS[c]}
          </CatPill>
        ))}
        {!showAllCats && (
          <CatPill active={false} onClick={() => setShowAllCats(true)}>+ Plus</CatPill>
        )}
      </div>

      {/* Tri segmented */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#8A7A6A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Trier par</span>
        <div style={{
          display: 'flex', borderRadius: 10,
          backgroundColor: '#F5F1EB',
          padding: 3,
        }}>
          {(Object.keys(TRI_LABELS) as TriOption[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => onTriChange(t)}
              style={{
                padding: '5px 12px', borderRadius: 8,
                border: 'none',
                backgroundColor: tri === t ? '#fff' : 'transparent',
                color: tri === t ? '#2D5A3D' : '#8A7A6A',
                fontSize: 11, fontWeight: 700,
                cursor: 'pointer',
                boxShadow: tri === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {TRI_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function CatPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0,
        border: 'none',
        padding: '6px 12px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        cursor: 'pointer',
        backgroundColor: active ? '#2D5A3D' : '#fff',
        color: active ? '#fff' : '#3C2C20',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}
