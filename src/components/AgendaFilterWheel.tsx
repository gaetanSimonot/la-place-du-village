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
  accent?: string
  onChange?: () => void
}

export default function AgendaFilterWheel({
  filtres, onFiltresChange,
  accent = '#2D5A3D',
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
      <LoopWheel
        items={quoiItems}
        activeIdx={quoiIdx}
        onChange={handleQuoiChange}
        accent={accent}
        ariaLabel="Filtre catégorie"
      />
      <LoopWheel
        items={quandItems}
        activeIdx={quandIdx}
        onChange={handleQuandChange}
        accent={accent}
        ariaLabel="Filtre date"
      />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────
   LoopWheel — carrousel vertical infini avec snap natif.
   Wrap invisible au settle uniquement (pas pendant le scroll).
   ────────────────────────────────────────────────────────────────────── */

const PILL_H = 32
const GAP = 6
const STEP = PILL_H + GAP
const CONTAINER_H = 108

function LoopWheel({
  items, activeIdx, onChange, accent, ariaLabel,
}: {
  items: WheelItem[]
  activeIdx: number
  onChange: (idx: number) => void
  accent: string
  ariaLabel: string
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastReportedIdx = useRef<number>(activeIdx)
  const userInteracting = useRef<boolean>(false)
  const N = items.length

  // Triple-clone : [items, items, items]. On scrolle dans le bloc central
  // (indices N..2N-1). Au settle, si on a glissé hors du bloc central, on
  // téléporte scrollTop instantanément à la position équivalente du milieu.
  // Comme les 3 blocs sont identiques visuellement, ce wrap est invisible.
  const tripled = useMemo(() => [...items, ...items, ...items], [items])

  // Init au mount : position = bloc central + activeIdx
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = (N + activeIdx) * STEP
      lastReportedIdx.current = activeIdx
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N])

  // Sync externe : parent change activeIdx (reset, click externe)
  useEffect(() => {
    if (userInteracting.current) return
    if (activeIdx === lastReportedIdx.current) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: (N + activeIdx) * STEP, behavior: 'smooth' })
    lastReportedIdx.current = activeIdx
  }, [activeIdx, N])

  // handleScroll : aucun setState, aucun wrap pendant le scroll.
  // Tout se fait au settle (130ms après dernier scroll event).
  const handleScroll = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      userInteracting.current = false
      const el = scrollRef.current
      if (!el) return

      const centerIdx = Math.round(el.scrollTop / STEP)
      const realIdx = ((centerIdx % N) + N) % N

      // Wrap invisible : ramène le scroll dans le bloc central
      // Position équivalente visuellement → l'œil ne voit rien
      const wrappedCenterIdx = N + realIdx
      if (wrappedCenterIdx !== centerIdx) {
        el.scrollTop = wrappedCenterIdx * STEP
      }

      if (realIdx !== lastReportedIdx.current) {
        lastReportedIdx.current = realIdx
        onChange(realIdx)
      }
    }, 130)
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
      style={{ flex: 1, height: CONTAINER_H, outline: 'none' }}
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchStart={handleInteract}
        onMouseDown={handleInteract}
        onWheel={handleInteract}
        className="pdv-loopwheel-v"
        style={{
          height: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollSnapType: 'y mandatory',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: GAP,
          paddingTop: (CONTAINER_H - PILL_H) / 2,
          paddingBottom: (CONTAINER_H - PILL_H) / 2,
          WebkitOverflowScrolling: 'touch',
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
                width: '100%',
                height: PILL_H,
                borderRadius: 16,
                border: 'none',
                background: isActive ? accent : 'transparent',
                color: isActive ? '#fff' : accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Inter, sans-serif',
                fontSize: 12.5,
                fontWeight: isActive ? 700 : 600,
                scrollSnapAlign: 'center',
                cursor: 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                padding: '0 10px',
              }}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <style jsx>{`
        .pdv-loopwheel-v { scrollbar-width: none; }
        .pdv-loopwheel-v::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
