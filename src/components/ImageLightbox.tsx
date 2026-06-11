'use client'
import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  src: string
  alt: string
  objectPosition?: string
  /**
   * Mode controlled : si fourni, le composant ne rend PAS son wrapper <img>
   * trigger, juste la modale lightbox pilotée de l'extérieur.
   * Permet de réutiliser la même mécanique (pinch/zoom/close) sur des
   * carrousels custom (ex : fiche annonce avec navigation multi-photos).
   */
  controlled?: { open: boolean; onClose: () => void }
}

export default function ImageLightbox({ src, alt, objectPosition = '50% 50%', controlled }: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlled ? controlled.open : internalOpen
  const setOpen = (v: boolean) => {
    if (controlled) { if (!v) controlled.onClose() }
    else setInternalOpen(v)
  }
  const [scale, setScale]   = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const scaleRef  = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })

  // Pointeurs actifs pour le pinch
  const ptrs = useRef<Map<number, { x: number; y: number }>>(new Map())
  const initDist   = useRef<number | null>(null)
  const initScale  = useRef(1)
  const dragStart  = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const lastTap    = useRef({ t: 0, x: 0, y: 0 })

  // Zoom centré sur un point écran (double-tap) ou reset si déjà zoomé.
  const toggleZoomAt = useCallback((cx: number, cy: number) => {
    if (scaleRef.current > 1) {
      scaleRef.current = 1; setScale(1)
      offsetRef.current = { x: 0, y: 0 }; setOffset({ x: 0, y: 0 })
    } else {
      const s = 2.5
      const off = { x: -s * (cx - window.innerWidth / 2), y: -s * (cy - window.innerHeight / 2) }
      scaleRef.current = s; setScale(s)
      offsetRef.current = off; setOffset(off)
    }
  }, [])

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(b.x - a.x, b.y - a.y)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (ptrs.current.size === 2) {
      const [a, b] = Array.from(ptrs.current.values())
      initDist.current  = dist(a, b)
      initScale.current = scaleRef.current
      dragStart.current = null
    } else if (ptrs.current.size === 1) {
      // Double-tap / double-clic → zoom (couvre tactile ET souris).
      const now = Date.now()
      const lt = lastTap.current
      if (now - lt.t < 300 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30) {
        lastTap.current = { t: 0, x: 0, y: 0 }
        dragStart.current = null
        toggleZoomAt(e.clientX, e.clientY)
        return
      }
      lastTap.current = { t: now, x: e.clientX, y: e.clientY }
      dragStart.current = { x: e.clientX, y: e.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y }
    }
  }, [toggleZoomAt])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (ptrs.current.size === 2 && initDist.current != null) {
      const [a, b] = Array.from(ptrs.current.values())
      const newScale = Math.min(6, Math.max(1, initScale.current * (dist(a, b) / initDist.current)))
      scaleRef.current = newScale
      setScale(newScale)
    } else if (ptrs.current.size === 1 && dragStart.current && scaleRef.current > 1) {
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      const newOffset = { x: dragStart.current.ox + dx, y: dragStart.current.oy + dy }
      offsetRef.current = newOffset
      setOffset(newOffset)
    }
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId)
    if (ptrs.current.size < 2) {
      initDist.current = null
      if (ptrs.current.size === 1) {
        const [ptr] = Array.from(ptrs.current.values())
        dragStart.current = { x: ptr.x, y: ptr.y, ox: offsetRef.current.x, oy: offsetRef.current.y }
      }
    }
    if (ptrs.current.size === 0) dragStart.current = null
  }, [])

  // Molette souris → zoom (desktop).
  const onWheel = useCallback((e: React.WheelEvent) => {
    const next = Math.min(6, Math.max(1, scaleRef.current - e.deltaY * 0.0025))
    scaleRef.current = next
    setScale(next)
    if (next <= 1) { offsetRef.current = { x: 0, y: 0 }; setOffset({ x: 0, y: 0 }) }
  }, [])

  const closeAndReset = () => {
    setOpen(false)
    setScale(1)
    setOffset({ x: 0, y: 0 })
    scaleRef.current  = 1
    offsetRef.current = { x: 0, y: 0 }
    ptrs.current.clear()
  }

  return (
    <>
      {!controlled && (
        <img
          src={src}
          alt={alt}
          onClick={() => setOpen(true)}
          style={{ width: '100%', height: 220, objectFit: 'cover', objectPosition, display: 'block', cursor: 'zoom-in' }}
        />
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (scale <= 1) closeAndReset() }}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              backgroundColor: 'rgba(0,0,0,0.92)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16,
              touchAction: 'none',
            }}
          >
            <img
              src={src} alt={alt}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
              style={{
                maxWidth: '100%', maxHeight: '90dvh',
                borderRadius: 12, objectFit: 'contain',
                boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
                transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
                transformOrigin: 'center center',
                touchAction: 'none',
                userSelect: 'none',
                cursor: scale > 1 ? 'grab' : 'zoom-in',
                transition: ptrs.current.size === 0 ? 'transform 0.1s ease' : 'none',
              }}
              onClick={e => e.stopPropagation()}
            />
            <button
              onClick={closeAndReset}
              style={{
                position: 'absolute', top: 20, right: 20,
                width: 40, height: 40, borderRadius: '50%',
                backgroundColor: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff', fontSize: 20, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ×
            </button>
            {scale > 1 && (
              <button
                onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); scaleRef.current = 1; offsetRef.current = { x: 0, y: 0 } }}
                style={{
                  position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                  backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
                  color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 999, cursor: 'pointer',
                }}
              >
                Réinitialiser zoom
              </button>
            )}
            {scale <= 1 && (
              <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 600, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                Double-tape ou pince pour zoomer
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
