'use client'
import { useEffect, useMemo, useRef } from 'react'

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

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastReportedId = useRef<string>(activeId ?? TOUT_ID)
  const userInteracting = useRef<boolean>(false)

  // Init scroll au mount sur l'item actif
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollLeft = currentIdx * STEP
      lastReportedId.current = activeId ?? TOUT_ID
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync externe : parent reset → recentrer
  useEffect(() => {
    if (userInteracting.current) return
    const wantedId = activeId ?? TOUT_ID
    if (wantedId === lastReportedId.current) return
    const targetIdx = indexOf(wantedId)
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: targetIdx * STEP, behavior: 'smooth' })
    lastReportedId.current = wantedId
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  const handleScroll = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      userInteracting.current = false
      const el = scrollRef.current
      if (!el) return
      const idx = Math.max(0, Math.min(N - 1, Math.round(el.scrollLeft / STEP)))
      const item = all[idx]
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

  const handleClickPill = (idx: number) => {
    const el = scrollRef.current
    if (!el) return
    userInteracting.current = true
    el.scrollTo({ left: idx * STEP, behavior: 'smooth' })
  }

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const delta = e.key === 'ArrowRight' ? 1 : -1
    const next = Math.max(0, Math.min(N - 1, currentIdx + delta))
    handleClickPill(next)
  }

  return (
    <div
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKey}
      style={{ height: 42, outline: 'none' }}
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchStart={handleInteract}
        onMouseDown={handleInteract}
        onWheel={handleInteract}
        className="pdv-wheel-h"
        style={{
          height: '100%',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          display: 'flex',
          alignItems: 'center',
          gap: GAP,
          // padding pour que les items aux bords puissent atteindre le centre
          paddingLeft: `calc(50% - ${PILL_W / 2}px)`,
          paddingRight: `calc(50% - ${PILL_W / 2}px)`,
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x',
        }}
      >
        {all.map((item, idx) => {
          const isActive = idx === currentIdx
          const color = item.color ?? accent
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={isActive}
              onClick={() => handleClickPill(idx)}
              onPointerDown={e => e.stopPropagation()}
              style={{
                flexShrink: 0,
                width: PILL_W,
                height: 34,
                borderRadius: 17,
                border: 'none',
                background: isActive ? color : 'transparent',
                color: isActive ? '#fff' : color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
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
              {item.emoji && <span style={{ fontSize: 13 }}>{item.emoji}</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
            </button>
          )
        })}
      </div>

      <style jsx>{`
        .pdv-wheel-h { scrollbar-width: none; }
        .pdv-wheel-h::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
