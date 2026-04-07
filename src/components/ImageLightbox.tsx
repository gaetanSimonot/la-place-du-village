'use client'
import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  src: string
  alt: string
}

export default function ImageLightbox({ src, alt }: Props) {
  const [open, setOpen] = useState(false)
  const [scale, setScale]   = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const scaleRef  = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })

  // Pointeurs actifs pour le pinch
  const ptrs = useRef<Map<number, { x: number; y: number }>>(new Map())
  const initDist   = useRef<number | null>(null)
  const initScale  = useRef(1)
  const dragStart  = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

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
      dragStart.current = { x: e.clientX, y: e.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y }
    }
  }, [])

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
      <img
        src={src}
        alt={alt}
        onClick={() => setOpen(true)}
        style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
      />

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
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
