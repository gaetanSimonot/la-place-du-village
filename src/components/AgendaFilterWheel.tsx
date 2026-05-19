'use client'
import { useEffect, useMemo, useRef } from 'react'
import { CATEGORIES } from '@/lib/categories'
import type { Categorie, FiltreQuand, Filtres } from '@/lib/types'

const CATS = Object.keys(CATEGORIES) as Categorie[]

const QUAND_OPTIONS: { value: FiltreQuand; label: string }[] = [
  { value: 'aujourd_hui',   label: "Aujourd'hui" },
  { value: 'cette_semaine', label: 'Cette semaine' },
  { value: 'ce_week_end',   label: 'Ce week-end' },
  { value: 'ce_mois',       label: 'Ce mois' },
]

const TOUT_ID = '__tout' as const
type WheelId = typeof TOUT_ID | Categorie | FiltreQuand

interface WheelItem {
  id: WheelId
  label: string
}

interface Props {
  filtres: Filtres
  onFiltresChange: (f: Filtres) => void
  /** Crème = couleur du sheet derrière les fades. Override si le sheet est sombre. */
  sheetBg?: string
  /** Couleur primary (vert Cévennes par défaut) */
  accent?: string
  /** Couleur slot indicator central */
  accentSoft?: string
  /** Callback optionnel à chaque changement (ex : snap sheet à half) */
  onChange?: () => void
}

export default function AgendaFilterWheel({
  filtres, onFiltresChange,
  sheetBg = '#FDFAF5',
  accent = '#2D5A3D',
  accentSoft = '#E8F2EB',
  onChange,
}: Props) {
  const quoiItems: WheelItem[] = useMemo(() => ([
    { id: TOUT_ID, label: 'Tout' },
    ...CATS.map(id => ({ id, label: CATEGORIES[id].label })),
  ]), [])

  const quandItems: WheelItem[] = useMemo(() => ([
    { id: TOUT_ID, label: 'Tout' },
    ...QUAND_OPTIONS.map(o => ({ id: o.value, label: o.label })),
  ]), [])

  // Index actif déduit des filtres existants (source de vérité = parent)
  const quoiIdx = useMemo(() => {
    const cat = filtres.categories[0]
    if (!cat) return 0
    const i = CATS.indexOf(cat)
    return i < 0 ? 0 : i + 1
  }, [filtres.categories])

  const quandIdx = useMemo(() => {
    if (filtres.quand === 'toujours') return 0
    const i = QUAND_OPTIONS.findIndex(o => o.value === filtres.quand)
    return i < 0 ? 0 : i + 1
  }, [filtres.quand])

  const handleQuoiChange = (idx: number) => {
    const item = quoiItems[idx]
    if (item.id === TOUT_ID) onFiltresChange({ ...filtres, categories: [] })
    else onFiltresChange({ ...filtres, categories: [item.id as Categorie] })
    onChange?.()
  }

  const handleQuandChange = (idx: number) => {
    const item = quandItems[idx]
    if (item.id === TOUT_ID) onFiltresChange({ ...filtres, quand: 'toujours' })
    else onFiltresChange({ ...filtres, quand: item.id as FiltreQuand })
    onChange?.()
  }

  return (
    <div style={{ padding: '4px 0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <FilterWheel
        items={quoiItems}
        activeIdx={quoiIdx}
        onChange={handleQuoiChange}
        sheetBg={sheetBg}
        accent={accent}
        accentSoft={accentSoft}
        ariaLabel="Filtre catégorie"
      />
      <FilterWheel
        items={quandItems}
        activeIdx={quandIdx}
        onChange={handleQuandChange}
        sheetBg={sheetBg}
        accent={accent}
        accentSoft={accentSoft}
        ariaLabel="Filtre date"
      />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────
   FilterWheel — rail horizontal swipeable infini avec snap au centre.
   ────────────────────────────────────────────────────────────────────── */

const PILL_W = 108
const GAP = 4
const STEP = PILL_W + GAP

function FilterWheel({
  items, activeIdx, onChange,
  sheetBg, accent, accentSoft, ariaLabel,
}: {
  items: WheelItem[]
  activeIdx: number
  onChange: (idx: number) => void
  sheetBg: string
  accent: string
  accentSoft: string
  ariaLabel: string
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastReportedIdx = useRef<number>(activeIdx)
  const userInteracting = useRef<boolean>(false)
  const N = items.length

  // Triple-clone pour l'illusion d'infini
  const tripled = useMemo(() => [...items, ...items, ...items], [items])

  // Init scrollLeft sur le bloc central + activeIdx
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollLeft = (N + activeIdx) * STEP
      lastReportedIdx.current = activeIdx
    })
  }, [N]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync externe : si le parent change activeIdx (ex : reset filtres),
  // on recentre le wheel sans déclencher onChange.
  useEffect(() => {
    if (userInteracting.current) return
    if (activeIdx === lastReportedIdx.current) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: (N + activeIdx) * STEP, behavior: 'smooth' })
    lastReportedIdx.current = activeIdx
  }, [activeIdx, N])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const centerIdx = Math.round(el.scrollLeft / STEP)
    const realIdx = ((centerIdx % N) + N) % N

    // Loop invisible — saute au bloc du milieu si on dépasse
    if (centerIdx < Math.floor(N / 2)) {
      el.scrollLeft = el.scrollLeft + N * STEP
    } else if (centerIdx >= 2 * N + Math.floor(N / 2)) {
      el.scrollLeft = el.scrollLeft - N * STEP
    }

    // On attend que le snap se stabilise avant de notifier le parent
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      userInteracting.current = false
      if (realIdx !== lastReportedIdx.current) {
        lastReportedIdx.current = realIdx
        onChange(realIdx)
      }
    }, 120)
  }

  const handleInteract = () => {
    userInteracting.current = true
    if (settleTimer.current) clearTimeout(settleTimer.current)
  }

  const handleClickPill = (realIdx: number) => {
    const el = scrollRef.current
    if (!el) return
    userInteracting.current = true
    el.scrollTo({ left: (N + realIdx) * STEP, behavior: 'smooth' })
  }

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const delta = e.key === 'ArrowRight' ? 1 : -1
    const next = ((activeIdx + delta) % N + N) % N
    handleClickPill(next)
  }

  return (
    <div
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKey}
      style={{ position: 'relative', height: 42, outline: 'none' }}
    >
      {/* Slot indicator central */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: '50%', left: '50%',
          width: PILL_W, height: 36, borderRadius: 18,
          transform: 'translate(-50%, -50%)',
          background: accentSoft,
          boxShadow: 'inset 0 1px 2px rgba(45,90,61,0.08)',
          pointerEvents: 'none', zIndex: 1,
        }}
      />

      {/* Fades latéraux — couleur sheet */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, width: 48,
          background: `linear-gradient(90deg, ${sheetBg} 0%, ${withAlpha(sheetBg, 0.92)} 40%, ${withAlpha(sheetBg, 0)} 100%)`,
          pointerEvents: 'none', zIndex: 3,
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 0, bottom: 0, right: 0, width: 48,
          background: `linear-gradient(-90deg, ${sheetBg} 0%, ${withAlpha(sheetBg, 0.92)} 40%, ${withAlpha(sheetBg, 0)} 100%)`,
          pointerEvents: 'none', zIndex: 3,
        }}
      />

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchStart={handleInteract}
        onMouseDown={handleInteract}
        onWheel={handleInteract}
        onPointerDown={e => e.stopPropagation()}
        className="pdv-wheel-scroll"
        style={{
          height: '100%', overflowX: 'auto', overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          display: 'flex', alignItems: 'center', gap: GAP,
          padding: `0 calc(50% - ${PILL_W / 2}px)`,
          position: 'relative', zIndex: 2,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {tripled.map((item, i) => {
          const realIdx = ((i % N) + N) % N
          const isActive = realIdx === activeIdx
          return (
            <button
              key={`${item.id}-${i}`}
              type="button"
              role="option"
              aria-selected={isActive}
              onClick={() => handleClickPill(realIdx)}
              style={{
                flexShrink: 0,
                width: PILL_W, height: 34, borderRadius: 17,
                border: 'none',
                background: isActive ? accent : 'transparent',
                color: isActive ? '#fff' : accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Inter, sans-serif',
                fontSize: isActive ? 12.5 : 12,
                fontWeight: isActive ? 700 : 600,
                letterSpacing: '-0.005em',
                scrollSnapAlign: 'center',
                scrollSnapStop: 'always',
                transition: 'background 0.18s, color 0.18s, font-size 0.18s, font-weight 0.18s, box-shadow 0.18s',
                cursor: 'pointer',
                userSelect: 'none',
                boxShadow: isActive ? '0 2px 6px rgba(45,90,61,0.25)' : 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <style jsx>{`
        .pdv-wheel-scroll { scrollbar-width: none; }
        .pdv-wheel-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}

/* Convertit un hex (#RRGGBB) en rgba(r,g,b,a) — utilisé pour les fades. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
