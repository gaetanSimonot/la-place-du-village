'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { EvenementCard } from '@/lib/types'
import { formatDate } from '@/lib/filters'
import { CATEGORIES } from '@/lib/categories'

const INTERVAL_MS = 5500
const CROSS_S     = 0.38   // durée du cross-fade en secondes

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface Props {
  events: EvenementCard[]
  onDiscover: (id: string) => void
  compact?: boolean
}

export default function ProBandeau({ events, onDiscover, compact = false }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [queue, setQueue]         = useState<EvenementCard[]>([])
  const [idx, setIdx]             = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (events.length === 0) return
    setQueue(shuffle(events))
    setIdx(0)
  }, [events])

  const advance = useCallback(() => {
    setIdx(prev => {
      const next = prev + 1
      if (next >= queue.length) {
        setQueue(shuffle(events))
        return 0
      }
      return next
    })
  }, [queue.length, events])

  useEffect(() => {
    if (dismissed || queue.length === 0) return
    timerRef.current = setTimeout(advance, INTERVAL_MS)
    return () => clearTimeout(timerRef.current)
  }, [idx, dismissed, queue.length, advance])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  if (dismissed || queue.length === 0) return null

  const evt = queue[idx]
  if (!evt) return null
  const cat = CATEGORIES[evt.categorie] ?? CATEGORIES.autre

  const imgSize = compact ? 54 : 92
  const cardH   = compact ? 58 : 92

  return (
    <div
      onClick={() => { clearTimeout(timerRef.current); onDiscover(evt.id) }}
      onPointerDown={e => e.stopPropagation()}
      style={{ margin: compact ? '0 12px 8px' : '4px 12px 8px', cursor: 'pointer', flexShrink: 0 }}
    >
      {/* Conteneur à hauteur fixe — les cards se superposent en cross-fade */}
      <div style={{
        position: 'relative', height: cardH,
        borderRadius: compact ? 12 : 14, overflow: 'hidden',
        boxShadow: '0 2px 10px rgba(44,44,44,0.10)',
      }}>
        <AnimatePresence>
          <motion.div
            key={evt.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: CROSS_S, ease: 'easeInOut' }}
            style={{ position: 'absolute', inset: 0, display: 'flex', backgroundColor: '#fff' }}
          >
            {/* Image gauche */}
            <div style={{ width: imgSize, flexShrink: 0, position: 'relative', overflow: 'hidden', backgroundColor: cat.color + '22' }}>
              {evt.image_url
                ? <img src={evt.image_url} alt="" loading="lazy"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%' }} />
                : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: compact ? 20 : 28 }}>
                    {cat.emoji}
                  </div>
              }
              <div style={{ position: 'absolute', bottom: 4, left: 4, backgroundColor: '#EC407A', borderRadius: 999, padding: '1px 5px' }}>
                <span style={{ fontSize: 7, fontWeight: 800, color: '#fff', fontFamily: 'Inter, sans-serif', letterSpacing: '0.04em' }}>✦ À la une</span>
              </div>
            </div>

            {/* Contenu droite */}
            <div style={{ flex: 1, padding: compact ? '6px 10px' : '8px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0, position: 'relative' }}>
              <button
                onClick={e => { e.stopPropagation(); setDismissed(true) }}
                style={{
                  position: 'absolute', top: 5, right: 5,
                  width: 16, height: 16, borderRadius: '50%',
                  backgroundColor: '#F0EBE4', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 7, color: '#8A8A8A', padding: 0, lineHeight: 1,
                }}>✕</button>

              <p style={{
                fontFamily: 'Inter, sans-serif', fontWeight: 700,
                fontSize: compact ? 12 : 13,
                color: '#1C1917', margin: '0 18px 0 0', lineHeight: 1.3,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: compact ? 1 : 2, WebkitBoxOrient: 'vertical',
              }}>{evt.titre}</p>

              <div>
                {!compact && evt.date_debut && (
                  <p style={{ fontSize: 10, color: '#6B5E4E', margin: '0 0 1px', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    🗓 {formatDate(evt.date_debut)}{evt.heure ? ` · ${evt.heure.slice(0,5)}` : ''}
                  </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: 10, color: '#6B5E4E', margin: 0, fontFamily: compact ? 'Inter, sans-serif' : 'Lora, serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {evt.lieux?.commune
                      ? (compact ? evt.lieux.commune : `📍 ${evt.lieux.commune}`)
                      : cat.label}
                  </p>
                  {!compact && queue.length > 1 && (
                    <div style={{ display: 'flex', gap: 3, flexShrink: 0, marginLeft: 6 }}>
                      {queue.slice(0, 5).map((_, i) => (
                        <div key={i} onClick={e => { e.stopPropagation(); setIdx(i) }} style={{
                          width: i === idx ? 10 : 4, height: 4, borderRadius: 2,
                          backgroundColor: i === idx ? '#2D5A3D' : '#C8BDB0',
                          transition: 'width 0.3s', cursor: 'pointer',
                        }} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
