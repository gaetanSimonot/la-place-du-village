'use client'
import { useMemo, useState } from 'react'
import { CATEGORIES } from '@/lib/categories'
import type { Categorie, FiltreQuand, Filtres } from '@/lib/types'

const CATS = Object.keys(CATEGORIES) as Categorie[]

type CategorieOuTout = Categorie | '__tout'
type QuandOuTout    = FiltreQuand | 'toujours'

const QUAND_OPTIONS: { value: QuandOuTout; label: string }[] = [
  { value: 'toujours',      label: 'Tout' },
  { value: 'aujourd_hui',   label: "Aujourd'hui" },
  { value: 'cette_semaine', label: 'Cette semaine' },
  { value: 'ce_week_end',   label: 'Ce week-end' },
  { value: 'ce_mois',       label: 'Ce mois' },
]

interface Props {
  filtres: Filtres
  onFiltresChange: (f: Filtres) => void
  /** Callback optionnel à chaque changement (ex : snap sheet à half) */
  onChange?: () => void
}

/**
 * Remplace les anciens wheel-pickers par 2 boutons "cycle on tap" :
 * un tap → avance d'un cran dans la liste de filtres, en loop.
 * Chevrons haut/bas pour indiquer qu'on peut taper pour défiler.
 * Léger bounce au tap (scale 0.96 → 1) pour feedback haptique visuel.
 */
export default function AgendaFilterWheel({ filtres, onFiltresChange, onChange }: Props) {
  const quoiOptions = useMemo(() => [
    { value: '__tout' as CategorieOuTout, label: 'Tout' },
    ...CATS.map(id => ({ value: id as CategorieOuTout, label: CATEGORIES[id].label })),
  ], [])

  const quoiValue: CategorieOuTout = (filtres.categories[0] as Categorie | undefined) ?? '__tout'
  const quandValue: QuandOuTout    = filtres.quand

  function cycleQuoi() {
    const idx = quoiOptions.findIndex(o => o.value === quoiValue)
    const next = quoiOptions[(idx + 1) % quoiOptions.length].value
    if (next === '__tout') onFiltresChange({ ...filtres, categories: [] })
    else onFiltresChange({ ...filtres, categories: [next as Categorie] })
    onChange?.()
  }

  function cycleQuand() {
    const idx = QUAND_OPTIONS.findIndex(o => o.value === quandValue)
    const next = QUAND_OPTIONS[(idx + 1) % QUAND_OPTIONS.length].value
    onFiltresChange({ ...filtres, quand: next as FiltreQuand })
    onChange?.()
  }

  const quoiLabel  = quoiOptions.find(o => o.value === quoiValue)?.label ?? 'Tout'
  const quandLabel = QUAND_OPTIONS.find(o => o.value === quandValue)?.label ?? 'Tout'

  return (
    <div className="flex w-full gap-2">
      <CycleBtn kicker="Que faire" label={quoiLabel}  onClick={cycleQuoi} />
      <CycleBtn kicker="Quand"     label={quandLabel} onClick={cycleQuand} />
    </div>
  )
}

/* ── Bouton cycle on tap avec chevrons haut/bas + bounce ─────────────── */
function CycleBtn({
  kicker, label, onClick,
}: { kicker: string; label: string; onClick: () => void }) {
  const [pressed, setPressed] = useState(false)

  const handleClick = () => {
    setPressed(true)
    onClick()
    // Reset le bounce après l'animation
    window.setTimeout(() => setPressed(false), 180)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex flex-1 items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left"
      style={{
        background: '#E8F2EB',
        border: '1px solid #C8DEC0',
        boxShadow: pressed
          ? '0 1px 2px rgba(45,90,61,0.06)'
          : '0 2px 8px rgba(45,90,61,0.10)',
        transform: pressed ? 'scale(0.96)' : 'scale(1)',
        // Bounce élastique : overshoot léger au retour à 1 (cubic-bezier 0.34, 1.56, 0.64, 1)
        transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div className="min-w-0 flex-1">
        <div
          className="text-[10px] uppercase"
          style={{ letterSpacing: '0.1em', color: '#5B8A4A', fontWeight: 500 }}
        >
          {kicker}
        </div>
        <div
          className="mt-[2px] truncate font-serif text-[15px]"
          style={{ letterSpacing: '-0.005em', lineHeight: 1.15, color: '#1A1209' }}
        >
          {label}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1" style={{ color: '#5B8A4A' }}>
        {/* Chevron haut (circonflexe haut) */}
        <svg width={13} height={7} viewBox="0 0 24 14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="5 11 12 4 19 11" />
        </svg>
        {/* Chevron bas (circonflexe bas) */}
        <svg width={13} height={7} viewBox="0 0 24 14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="5 3 12 10 19 3" />
        </svg>
      </div>
    </button>
  )
}
