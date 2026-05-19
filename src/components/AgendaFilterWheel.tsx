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
    <div style={{ display: 'flex', gap: 8 }}>
      <VerticalFilterWheel
        items={quoiItems}
        activeIdx={quoiIdx}
        onChange={handleQuoiChange}
        sheetBg={sheetBg}
        accent={accent}
        accentSoft={accentSoft}
        ariaLabel="Filtre catégorie"
      />
      <VerticalFilterWheel
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
   VerticalFilterWheel — rail vertical swipeable infini avec snap centre.
   ────────────────────────────────────────────────────────────────────── */

const PILL_H = 32
const GAP = 4
const STEP = PILL_H + GAP
const CONTAINER_H = 108  // 3 pills visibles (centre + 1 haut + 1 bas)

function VerticalFilterWheel({
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

  // Init scrollTop sur le bloc central + activeIdx
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = (N + activeIdx) * STEP
      lastReportedIdx.current = activeIdx
    })
  }, [N]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync externe (parent reset filtres → recentrer sans déclencher onChange)
  useEffect(() => {
    if (userInteracting.current) return
    if (activeIdx === lastReportedIdx.current) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: (N + activeIdx) * STEP, behavior: 'smooth' })
    lastReportedIdx.current = activeIdx
  }, [activeIdx, N])

  // handleScroll : aucun setState pendant le scroll. Juste loop wrap
  // (pour l'infini) + settle timer qui notifie le parent UNE SEULE FOIS
  // quand le user s'arrête. Pas de re-render = pas de vibration.
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const centerIdx = Math.round(el.scrollTop / STEP)

    // Loop invisible — saute au bloc du milieu si on dépasse les bornes
    if (centerIdx < Math.floor(N / 2)) {
      el.scrollTop = el.scrollTop + N * STEP
    } else if (centerIdx >= 2 * N + Math.floor(N / 2)) {
      el.scrollTop = el.scrollTop - N * STEP
    }

    // Settle 150ms après le dernier scroll : notify parent
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      userInteracting.current = false
      const el2 = scrollRef.current
      if (!el2) return
      const finalCenter = Math.round(el2.scrollTop / STEP)
      const realIdx = ((finalCenter % N) + N) % N
      if (realIdx !== lastReportedIdx.current) {
        lastReportedIdx.current = realIdx
        onChange(realIdx)
      }
    }, 150)
  }

  const handleInteract = () => {
    userInteracting.current = true
    if (settleTimer.current) clearTimeout(settleTimer.current)
  }

  const handleClickPill = (realIdx: number) => {
    const el = scrollRef.current
    if (!el) return
    userInteracting.current = true
    el.scrollTo({ top: (N + realIdx) * STEP, behavior: 'smooth' })
  }

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const delta = e.key === 'ArrowDown' ? 1 : -1
    const next = ((activeIdx + delta) % N + N) % N
    handleClickPill(next)
  }


  return (
    <div
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKey}
      style={{ position: 'relative', flex: 1, height: CONTAINER_H, outline: 'none' }}
    >
      {/* Slot indicator central (puits horizontal pill-shape) */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: '50%', left: 0, right: 0,
          height: PILL_H + 4, borderRadius: 16,
          transform: 'translateY(-50%)',
          background: accentSoft,
          boxShadow: 'inset 0 1px 2px rgba(45,90,61,0.10)',
          pointerEvents: 'none', zIndex: 1,
        }}
      />

      {/* Fades haut / bas */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 28,
          background: `linear-gradient(180deg, ${sheetBg} 0%, ${withAlpha(sheetBg, 0.92)} 40%, ${withAlpha(sheetBg, 0)} 100%)`,
          pointerEvents: 'none', zIndex: 3,
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 28,
          background: `linear-gradient(0deg, ${sheetBg} 0%, ${withAlpha(sheetBg, 0.92)} 40%, ${withAlpha(sheetBg, 0)} 100%)`,
          pointerEvents: 'none', zIndex: 3,
        }}
      />

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchStart={handleInteract}
        onMouseDown={handleInteract}
        onWheel={handleInteract}
        className="pdv-vwheel-scroll"
        style={{
          height: '100%', overflowY: 'auto', overflowX: 'hidden',
          scrollSnapType: 'y mandatory',
          display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: GAP,
          padding: `calc(50% - ${PILL_H / 2}px) 0`,
          paddingTop: (CONTAINER_H - PILL_H) / 2,
          paddingBottom: (CONTAINER_H - PILL_H) / 2,
          position: 'relative', zIndex: 2,
          WebkitOverflowScrolling: 'touch',
          // touchAction pan-y autorise le scroll vertical natif du wheel,
          // mais laisse au parent (sheet drag) les autres gestes.
          touchAction: 'pan-y',
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
              onPointerDown={e => e.stopPropagation()}
              style={{
                flexShrink: 0,
                width: '100%', height: PILL_H, borderRadius: 16,
                border: 'none',
                background: isActive ? accent : 'transparent',
                color: isActive ? '#fff' : accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Inter, sans-serif',
                fontSize: 12.5,
                fontWeight: isActive ? 700 : 600,
                letterSpacing: '-0.005em',
                scrollSnapAlign: 'center',
                scrollSnapStop: 'normal',
                transition: 'background 150ms ease-out, color 150ms ease-out, font-weight 150ms ease-out',
                cursor: 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                padding: '0 10px',
              }}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <style jsx>{`
        .pdv-vwheel-scroll { scrollbar-width: none; }
        .pdv-vwheel-scroll::-webkit-scrollbar { display: none; }
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
