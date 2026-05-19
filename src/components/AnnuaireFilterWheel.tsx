'use client'
import { useEffect, useMemo, useRef } from 'react'

const TOUT_ID = '__tout' as const

export interface WheelItem {
  id: string
  label: string
  /** Couleur d'accent optionnelle (pour matcher la palette d'un type) */
  color?: string
  /** Emoji ou symbole leading dans la pill */
  emoji?: string
}

interface Props {
  items: WheelItem[]
  /** ID actif. Si null/undefined ou égal à TOUT → '__tout' centré. */
  activeId: string | null | undefined
  /** Callback : id reçu = vrai id de la liste OU null pour reset (Tout) */
  onChange: (id: string | null) => void
  sheetBg?: string
  accent?: string
  accentSoft?: string
  ariaLabel: string
}

const PILL_W = 116
const GAP = 6
const STEP = PILL_W + GAP

export default function AnnuaireFilterWheel({
  items, activeId, onChange,
  sheetBg = '#FDFAF5',
  accent = '#2D5A3D',
  accentSoft = '#E8F2EB',
  ariaLabel,
}: Props) {
  const all: WheelItem[] = useMemo(
    () => [{ id: TOUT_ID, label: 'Tout' }, ...items],
    [items],
  )
  const N = all.length

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastReportedId = useRef<string>(activeId ?? TOUT_ID)
  const userInteracting = useRef<boolean>(false)

  const indexOf = (id: string | null | undefined) => {
    if (!id) return 0
    const i = all.findIndex(x => x.id === id)
    return i < 0 ? 0 : i
  }
  const currentIdx = indexOf(activeId)

  // Triple-clone pour loop infini
  const tripled = useMemo(() => [...all, ...all, ...all], [all])

  // Init scrollLeft sur le bloc central + index actif
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollLeft = (N + currentIdx) * STEP
    })
  }, [N]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync externe : parent reset → recentrer sans onChange
  useEffect(() => {
    if (userInteracting.current) return
    const wantedId = activeId ?? TOUT_ID
    if (wantedId === lastReportedId.current) return
    const targetIdx = indexOf(wantedId)
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: (N + targetIdx) * STEP, behavior: 'smooth' })
    lastReportedId.current = wantedId
  }, [activeId, N]) // eslint-disable-line react-hooks/exhaustive-deps

  // handleScroll : pas de setState. Juste loop wrap + settle 150ms.
  // La pill devient active SEULEMENT quand le scroll s'arrête sur elle.
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const centerIdx = Math.round(el.scrollLeft / STEP)

    // Loop invisible
    if (centerIdx < Math.floor(N / 2)) {
      el.scrollLeft = el.scrollLeft + N * STEP
    } else if (centerIdx >= 2 * N + Math.floor(N / 2)) {
      el.scrollLeft = el.scrollLeft - N * STEP
    }

    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      userInteracting.current = false
      const el2 = scrollRef.current
      if (!el2) return
      const finalCenter = Math.round(el2.scrollLeft / STEP)
      const realIdx = ((finalCenter % N) + N) % N
      const item = all[realIdx]
      const newId = item?.id ?? TOUT_ID
      if (newId !== lastReportedId.current) {
        lastReportedId.current = newId
        onChange(newId === TOUT_ID ? null : newId)
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
    el.scrollTo({ left: (N + realIdx) * STEP, behavior: 'smooth' })
  }

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const delta = e.key === 'ArrowRight' ? 1 : -1
    const next = ((currentIdx + delta) % N + N) % N
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
      {/* Slot indicator central (puits horizontal) */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: '50%', left: '50%',
          width: PILL_W, height: 36, borderRadius: 18,
          transform: 'translate(-50%, -50%)',
          background: accentSoft,
          boxShadow: 'inset 0 1px 2px rgba(45,90,61,0.10)',
          pointerEvents: 'none', zIndex: 1,
        }}
      />

      {/* Fades gauche/droite */}
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
        className="pdv-hwheel-scroll"
        style={{
          height: '100%', overflowX: 'auto', overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          display: 'flex', alignItems: 'center', gap: GAP,
          padding: `0 calc(50% - ${PILL_W / 2}px)`,
          position: 'relative', zIndex: 2,
          WebkitOverflowScrolling: 'touch',
          // touchAction pan-x autorise le scroll horizontal natif du wheel,
          // mais laisse au parent (sheet drag) intercepter le pan-y vertical.
          touchAction: 'pan-x',
        }}
      >
        {tripled.map((item, i) => {
          const realIdx = ((i % N) + N) % N
          const isActive = realIdx === currentIdx
          const color = item.color ?? accent
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
                width: PILL_W, height: 34, borderRadius: 17,
                border: 'none',
                background: isActive ? color : 'transparent',
                color: isActive ? '#fff' : color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 4,
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
              {item.emoji && <span style={{ fontSize: 13 }}>{item.emoji}</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
            </button>
          )
        })}
      </div>

      <style jsx>{`
        .pdv-hwheel-scroll { scrollbar-width: none; }
        .pdv-hwheel-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
