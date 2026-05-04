'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { EvenementCard } from '@/lib/types'
import { formatDate } from '@/lib/filters'
import { CATEGORIES } from '@/lib/categories'

const INTERVAL_MS = 5000
const FADE_MS = 300

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
}

export default function ProBandeau({ events, onDiscover }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [queue, setQueue]         = useState<EvenementCard[]>([])
  const [idx, setIdx]             = useState(0)
  const [fading, setFading]       = useState(false)
  const timerRef     = useRef<ReturnType<typeof setTimeout>>()
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (events.length === 0) return
    setQueue(shuffle(events))
    setIdx(0)
  }, [events])

  const advance = useCallback(() => {
    clearTimeout(fadeTimerRef.current)
    setFading(true)
    fadeTimerRef.current = setTimeout(() => {
      setIdx(prev => {
        const next = prev + 1
        if (next >= queue.length) { setQueue(shuffle(events)); return 0 }
        return next
      })
      setFading(false)
    }, FADE_MS)
  }, [queue.length, events])

  useEffect(() => {
    if (dismissed || queue.length === 0) return
    timerRef.current = setTimeout(advance, INTERVAL_MS)
    return () => clearTimeout(timerRef.current)
  }, [idx, dismissed, queue.length, advance])

  useEffect(() => () => {
    clearTimeout(timerRef.current)
    clearTimeout(fadeTimerRef.current)
  }, [])

  if (dismissed || queue.length === 0) return null

  const evt = queue[idx]
  if (!evt) return null
  const cat = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  const fade: React.CSSProperties = { opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease` }

  return (
    <div
      onClick={() => { clearTimeout(timerRef.current); onDiscover(evt.id) }}
      style={{
        margin: '0 12px 10px',
        borderRadius: 16,
        backgroundColor: 'var(--primary)',
        overflow: 'hidden',
        display: 'flex',
        height: 112,
        cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Texte — gauche */}
      <div style={{
        flex: 1, padding: '12px 8px 10px 14px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        minWidth: 0, ...fade,
      }}>
        {/* Badge */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3, alignSelf: 'flex-start',
          fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--primary)', backgroundColor: '#F5D067',
          borderRadius: 999, padding: '3px 8px',
          fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
        }}>✦ À la une</span>

        {/* Titre */}
        <p style={{
          fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.3, margin: '0',
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          fontFamily: '"Playfair Display", serif',
        }}>{evt.titre}</p>

        {/* Date + lieu */}
        <p style={{
          fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0,
          fontFamily: 'Inter, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {evt.date_debut ? formatDate(evt.date_debut) : ''}
          {evt.lieux?.commune ? ` · ${evt.lieux.commune}` : ''}
        </p>
      </div>

      {/* Image — droite avec fondu vers le vert */}
      <div style={{ width: 100, flexShrink: 0, position: 'relative', ...fade }}>
        {evt.image_url
          ? <img key={`img-${idx}`} src={evt.image_url} alt="" loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%' }} />
          : <div style={{ width: '100%', height: '100%', backgroundColor: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>
              {cat.emoji}
            </div>
        }
        {/* Fondu lateral */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, var(--primary) 0%, transparent 45%)' }} />
      </div>

      {/* Dots */}
      {queue.length > 1 && (
        <div style={{
          position: 'absolute', bottom: 8, left: 14,
          display: 'flex', gap: 4,
        }}>
          {queue.map((_, i) => (
            <div key={i} onClick={e => { e.stopPropagation(); setIdx(i) }} style={{
              width: i === idx ? 14 : 4, height: 4, borderRadius: 2,
              backgroundColor: i === idx ? '#F5D067' : 'rgba(255,255,255,0.3)',
              transition: 'width 0.3s',
              cursor: 'pointer',
            }} />
          ))}
        </div>
      )}

      {/* Fermer */}
      <button
        onClick={e => { e.stopPropagation(); setDismissed(true) }}
        style={{
          position: 'absolute', top: 8, right: 8,
          width: 20, height: 20, borderRadius: '50%',
          backgroundColor: 'rgba(0,0,0,0.2)', border: 'none',
          color: 'rgba(255,255,255,0.7)', fontSize: 9,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700,
        }}>✕</button>
    </div>
  )
}
