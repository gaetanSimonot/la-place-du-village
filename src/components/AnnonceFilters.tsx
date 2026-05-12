'use client'
import {
  ANNONCE_TYPES,
  CATEGORIES_ANNONCES,
  CATEGORIES_LABELS,
  CATEGORIES_ICONS,
  type AnnonceType,
  type AnnonceCategorie,
} from '@/lib/annonces'

export type TriOption = 'date_desc' | 'prix_asc' | 'prix_desc'

const TYPE_LABELS: Record<AnnonceType, string> = {
  vente: 'Vente',
  troc: 'Troc',
  don: 'Don',
  enchere_inversee: 'Enchère',
}

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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 16px' }}>
      {/* Ligne types */}
      <Scroller>
        <Pill active={type === null} onClick={() => onTypeChange(null)}>Tous</Pill>
        {ANNONCE_TYPES.map(t => (
          <Pill key={t} active={type === t} onClick={() => onTypeChange(type === t ? null : t)}>
            {TYPE_LABELS[t]}
          </Pill>
        ))}
      </Scroller>

      {/* Ligne catégories */}
      <Scroller>
        <Pill active={categorie === null} onClick={() => onCategorieChange(null)}>Toutes</Pill>
        {CATEGORIES_ANNONCES.map(c => (
          <Pill key={c} active={categorie === c} onClick={() => onCategorieChange(categorie === c ? null : c)}>
            <span style={{ marginRight: 4 }}>{CATEGORIES_ICONS[c]}</span>{CATEGORIES_LABELS[c]}
          </Pill>
        ))}
      </Scroller>

      {/* Tri */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#8A7A6A' }}>
        <span style={{ fontWeight: 600 }}>Trier :</span>
        {(Object.keys(TRI_LABELS) as TriOption[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => onTriChange(t)}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 12,
              fontWeight: tri === t ? 800 : 600,
              color: tri === t ? '#2D5A3D' : '#8A7A6A',
              textDecoration: tri === t ? 'underline' : 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {TRI_LABELS[t]}
          </button>
        ))}
      </div>
    </div>
  )
}

function Scroller({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      gap: 8,
      overflowX: 'auto',
      scrollbarWidth: 'none',
      paddingBottom: 4,
      margin: '0 -16px',
      padding: '0 16px 4px',
    }}>
      {children}
    </div>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0,
        border: 'none',
        padding: '8px 14px',
        borderRadius: 999,
        fontSize: 12,
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
