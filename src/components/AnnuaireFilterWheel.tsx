'use client'
import { useEffect, useMemo, useRef, useState } from 'react'

const TOUT_ID = '__tout' as const

export interface WheelItem {
  id: string
  label: string
  color?: string
  emoji?: string
}

interface Props {
  items: WheelItem[]
  activeId: string | null | undefined
  onChange: (id: string | null) => void
  accent?: string
  ariaLabel: string
}

const PILL_W = 116
const GAP = 6
const STEP = PILL_W + GAP

export default function AnnuaireFilterWheel({
  items, activeId, onChange,
  accent = '#2D5A3D',
  ariaLabel,
}: Props) {
  const all: WheelItem[] = useMemo(
    () => [{ id: TOUT_ID, label: 'Tout' }, ...items],
    [items],
  )
  const N = all.length

  const indexOf = (id: string | null | undefined) => {
    if (!id) return 0
    const i = all.findIndex(x => x.id === id)
    return i < 0 ? 0 : i
  }
  const currentIdx = indexOf(activeId)

  // Triple-clone : on scrolle dans le bloc central. Au settle, on
  // téléporte instantanément à la position équivalente du milieu si
  // on a glissé hors. Le wrap est invisible (les 3 blocs sont identiques).
  const tripled = useMemo(() => [...all, ...all, ...all], [all])

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastReportedId = useRef<string>(activeId ?? TOUT_ID)
  const userInteracting = useRef<boolean>(false)

  // Index visuel temps réel : la pill au centre du slot vert
  const [centerVisualIdx, setCenterVisualIdx] = useState<number>(currentIdx)

  // Init scroll : bloc central + activeId
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollLeft = (N + currentIdx) * STEP
      lastReportedId.current = activeId ?? TOUT_ID
      setCenterVisualIdx(currentIdx)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N])

  // Sync externe
  useEffect(() => {
    if (userInteracting.current) return
    const wantedId = activeId ?? TOUT_ID
    if (wantedId === lastReportedId.current) return
    const targetIdx = indexOf(wantedId)
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: (N + targetIdx) * STEP, behavior: 'smooth' })
    lastReportedId.current = wantedId
    setCenterVisualIdx(targetIdx)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  // handleScroll : update visualIdx temps réel pour le visuel pill au centre,
  // wrap invisible + notify parent au settle.
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const c = Math.round(el.scrollLeft / STEP)
    const realIdx = ((c % N) + N) % N
    if (realIdx !== centerVisualIdx) setCenterVisualIdx(realIdx)

    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      userInteracting.current = false
      const el2 = scrollRef.current
      if (!el2) return
      const finalC = Math.round(el2.scrollLeft / STEP)
      const finalReal = ((finalC % N) + N) % N

      const wrappedCenter = N + finalReal
      if (wrappedCenter !== finalC) {
        el2.scrollLeft = wrappedCenter * STEP
      }

      const item = all[finalReal]
      const newId = item?.id ?? TOUT_ID
      if (newId !== lastReportedId.current) {
        lastReportedId.current = newId
        onChange(newId === TOUT_ID ? null : newId)
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
    el.scrollTo({ left: (N + realIdx) * STEP, behavior: 'smooth' })
  }

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const delta = e.key === 'ArrowRight' ? 1 : -1
    const next = ((currentIdx + delta) % N + N) % N
    handleClickPill(next)
  }

  // Couleur du slot fixe : celle de la pill au centre (utile pour
  // catégories etab qui ont chacune leur couleur)
  const slotColor = all[centerVisualIdx]?.color ?? accent

  return (
    <div
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKey}
      style={{ position: 'relative', height: 42, outline: 'none' }}
    >
      {/* Slot vert fixe au centre — sélection visuelle qui ne bouge pas */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: PILL_W,
          height: 34,
          borderRadius: 17,
          transform: 'translate(-50%, -50%)',
          background: slotColor,
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
        className="pdv-loopwheel-h"
        style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          display: 'flex',
          alignItems: 'center',
          gap: GAP,
          paddingLeft: `calc(50% - ${PILL_W / 2}px)`,
          paddingRight: `calc(50% - ${PILL_W / 2}px)`,
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x',
        }}
      >
        {tripled.map((item, i) => {
          const realIdx = ((i % N) + N) % N
          const isInSlot = realIdx === centerVisualIdx
          const color = item.color ?? accent
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
                width: PILL_W,
                height: 34,
                border: 'none',
                background: 'transparent',
                color: isInSlot ? '#fff' : color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
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
              {item.emoji && <span style={{ fontSize: 13 }}>{item.emoji}</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
            </button>
          )
        })}
      </div>

      <style jsx>{`
        .pdv-loopwheel-h { scrollbar-width: none; }
        .pdv-loopwheel-h::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
