'use client'
import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'

const OPTIONS = [
  {
    id: 'photo',
    label: 'Photo / Affiche',
    icon: '📷',
    angle: -130, // haut-gauche
    path: '/capturer',
  },
  {
    id: 'texte',
    label: 'Décrire en texte',
    icon: '✍️',
    angle: -50,  // haut-droite
    path: '/ajouter',
  },
]

const DISTANCE = 96 // px centre → option

function angleToXY(deg: number, dist: number) {
  const rad = (deg * Math.PI) / 180
  return { x: Math.cos(rad) * dist, y: Math.sin(rad) * dist }
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
}

export default function RadialFab({ open, onOpenChange }: Props) {
  const [hoveredState, setHoveredState] = useState<string | null>(null)
  const hoveredRef = useRef<string | null>(null)
  const startRef   = useRef<{ x: number; y: number } | null>(null)
  const router     = useRouter()

  const setHovered = (v: string | null) => {
    hoveredRef.current = v
    setHoveredState(v)
  }

  const getClosest = useCallback((cx: number, cy: number, x: number, y: number) => {
    const dx = x - cx
    const dy = y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 24) return null

    let best: string | null = null
    let bestDot = -Infinity
    for (const opt of OPTIONS) {
      const { x: ox, y: oy } = angleToXY(opt.angle, 1)
      const dot = (dx / dist) * ox + (dy / dist) * oy
      if (dot > bestDot) { bestDot = dot; best = opt.id }
    }
    return best
  }, [])

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    startRef.current = { x: e.clientX, y: e.clientY }
    setHovered(null)
    onOpenChange(true)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!open || !startRef.current) return
    const closest = getClosest(
      startRef.current.x, startRef.current.y,
      e.clientX, e.clientY
    )
    if (closest !== hoveredRef.current) setHovered(closest)
  }

  const handlePointerUp = () => {
    const target  = hoveredRef.current
    const wasOpen = open

    onOpenChange(false)
    setHovered(null)
    startRef.current = null

    if (target) {
      const opt = OPTIONS.find(o => o.id === target)
      if (opt) router.push(opt.path)
    } else if (!wasOpen) {
      onOpenChange(true)
    }
  }

  return (
    <div style={{ position: 'relative', width: 56, height: 56 }}>
      {/* Options radiales */}
      <AnimatePresence>
        {open && OPTIONS.map(opt => {
          const { x, y } = angleToXY(opt.angle, DISTANCE)
          const isActive = hoveredState === opt.id
          return (
            <motion.div
              key={opt.id}
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
              animate={{ opacity: 1, x, y, scale: 1 }}
              exit={{ opacity: 0, x: x * 0.3, y: y * 0.3, scale: 0.4 }}
              transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              style={{
                position: 'absolute',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                zIndex: 2,
              }}
            >
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                backgroundColor: isActive ? '#E8622A' : '#fff',
                borderRadius: 18, padding: '12px 16px',
                boxShadow: isActive ? '0 4px 24px rgba(232,98,42,0.4)' : '0 4px 20px rgba(0,0,0,0.16)',
                border: `2px solid ${isActive ? '#E8622A' : '#EDE8E0'}`,
                whiteSpace: 'nowrap',
                minWidth: 90,
                transition: 'background-color 0.1s, border-color 0.1s',
              }}>
                <span style={{ fontSize: 26 }}>{opt.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? '#fff' : '#2C2C2C', fontFamily: 'Inter, sans-serif' }}>
                  {opt.label}
                </span>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>

      {/* Bouton FAB principal */}
      <motion.button
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { onOpenChange(false); hoveredRef.current = null; startRef.current = null }}
        animate={{ rotate: open ? 45 : 0, scale: open ? 1.1 : 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        aria-label="Ajouter un événement"
        style={{
          width: 56, height: 56, borderRadius: '50%',
          backgroundColor: '#E8622A',
          color: '#fff', fontSize: 30, fontWeight: 300, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: open
            ? '0 6px 28px rgba(232,98,42,0.55)'
            : '0 4px 20px rgba(232,98,42,0.45)',
          border: 'none', cursor: 'pointer',
          touchAction: 'none',
          WebkitUserSelect: 'none',
          position: 'relative', zIndex: 1,
        }}
      >
        +
      </motion.button>
    </div>
  )
}
