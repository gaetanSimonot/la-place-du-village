'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
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

  // Index visuel : la pill au centre du slot vert. Update en temps réel
  // pendant le scroll → la pill bascule en blanc instantanément quand elle
  // entre dans le slot. Pas de transition CSS = pas de layout shift = pas
  // de "vibration".
  const [centerIdx, setCenterIdx] = useState<number>(activeIdx)

  const tripled = useMemo(() => [...items, ...items, ...items], [items])

  // Init au mount : position = bloc central + activeIdx
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = (N + activeIdx) * STEP
      lastReportedIdx.current = activeIdx
      setCenterIdx(activeIdx)
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
    setCenterIdx(activeIdx)
  }, [activeIdx, N])

  // handleScroll : update centerIdx en temps réel (pour le visuel pill
  // qui entre dans le slot vert). Wrap invisible au settle uniquement.
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const c = Math.round(el.scrollTop / STEP)
    const realIdx = ((c % N) + N) % N
    if (realIdx !== centerIdx) setCenterIdx(realIdx)

    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      userInteracting.current = false
      const el2 = scrollRef.current
      if (!el2) return
      const finalC = Math.round(el2.scrollTop / STEP)
      const finalReal = ((finalC % N) + N) % N

      // Wrap invisible : téléporte au bloc central, position équivalente
      const wrappedCenter = N + finalReal
      if (wrappedCenter !== finalC) {
        el2.scrollTop = wrappedCenter * STEP
      }

      if (finalReal !== lastReportedIdx.current) {
        lastReportedIdx.current = finalReal
        onChange(finalReal)
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
      style={{ flex: 1, height: CONTAINER_H, outline: 'none', position: 'relative' }}
    >
      {/* Slot vert fixe au centre — la "sélection" qui ne bouge pas.
          Les pills défilent à travers ; celle qui se trouve dedans
          devient visuellement active (couleur texte blanche). */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          height: PILL_H,
          borderRadius: 16,
          transform: 'translateY(-50%)',
          background: accent,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchStart={handleInteract}
        onMouseDown={handleInteract}
        onWheel={handleInteract}
        className="pdv-loopwheel-v"
        style={{
          position: 'relative',
          zIndex: 1,
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
          const isInSlot = realIdx === centerIdx
          return (
            <button
              key={`${item.id}-${i}`}
              type="button"
              role="option"
              aria-selected={isInSlot}
              onClick={() => handleClickPill(realIdx)}
              onPointerDown={e => e.stopPropagation()}
              style={{
                flexShrink: 0,
                width: '100%',
                height: PILL_H,
                border: 'none',
                background: 'transparent',
                color: isInSlot ? '#fff' : accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Inter, sans-serif',
                fontSize: 12.5,
                fontWeight: isInSlot ? 700 : 600,
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
