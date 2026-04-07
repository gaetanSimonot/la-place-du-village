'use client'
import { Filtres, Categorie, FiltreQuand } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'

const QUAND_OPTIONS: { value: FiltreQuand; label: string; emoji: string }[] = [
  { value: 'toujours',      label: 'Toujours',      emoji: '✨' },
  { value: 'aujourd_hui',   label: "Aujourd'hui",   emoji: '☀️' },
  { value: 'ce_week_end',   label: 'Ce week-end',   emoji: '🎉' },
  { value: 'cette_semaine', label: 'Cette semaine', emoji: '📅' },
  { value: 'ce_mois',       label: 'Ce mois',       emoji: '🗓️' },
]

interface Props {
  filtres: Filtres
  onChange: (f: Filtres) => void
}

function Pill({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean
  color?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition-all active:scale-95"
      style={
        active
          ? {
              backgroundColor: color ?? 'var(--orange)',
              color: '#fff',
              border: `2px solid ${color ?? 'var(--orange)'}`,
            }
          : {
              backgroundColor: 'var(--blanc)',
              color: 'var(--texte)',
              border: '2px solid var(--bord)',
            }
      }
    >
      {children}
    </button>
  )
}

export default function FilterBar({ filtres, onChange }: Props) {
  const toggleCategorie = (cat: Categorie) => {
    const cats = filtres.categories.includes(cat)
      ? filtres.categories.filter(c => c !== cat)
      : [...filtres.categories, cat]
    onChange({ ...filtres, categories: cats })
  }

  return (
    <header className="bg-white border-b border-[#EDE8E0] z-20 relative select-none">
      {/* Row 1 — Quand */}
      <div className="flex gap-2 px-3 pt-3 pb-1.5 overflow-x-auto pills-scroll">
        {QUAND_OPTIONS.map(opt => (
          <Pill
            key={opt.value}
            active={filtres.quand === opt.value}
            onClick={() => onChange({ ...filtres, quand: opt.value })}
          >
            <span>{opt.emoji}</span>
            <span>{opt.label}</span>
          </Pill>
        ))}
      </div>

      {/* Row 2 — Que faire */}
      <div className="flex gap-2 px-3 pb-3 pt-1 overflow-x-auto pills-scroll">
        {/* Pill "Tout" */}
        <Pill
          active={filtres.categories.length === 0}
          onClick={() => onChange({ ...filtres, categories: [] })}
        >
          <span>🏡</span>
          <span>Tout</span>
        </Pill>

        {(Object.entries(CATEGORIES) as [Categorie, { label: string; emoji: string; color: string }][]).map(
          ([key, cat]) => (
            <Pill
              key={key}
              active={filtres.categories.includes(key)}
              color={cat.color}
              onClick={() => toggleCategorie(key)}
            >
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
            </Pill>
          )
        )}
      </div>
    </header>
  )
}
