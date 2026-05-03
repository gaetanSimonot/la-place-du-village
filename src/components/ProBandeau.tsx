'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { EvenementCard } from '@/lib/types'
import { formatDate } from '@/lib/filters'
import { CATEGORIES } from '@/lib/categories'

const PROMO_PINK = '#EC407A'
const INTERVAL_MS = 5000
const FADE_MS = 180

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
  }, [events])

  const advance = useCallback(() => {
    clearTimeout(fadeTimerRef.current)
    setFading(true)
    fadeTimerRef.current = setTimeout(() => {
      setIdx(prev => {
        const next = prev + 1
        if (next >= queue.length) {
          setQueue(shuffle(events))
          return 0
        }
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
    <div style={{
      margin: '4px 12px 8px',
      borderRadius: 14,
      backgroundColor: '#fff',
      boxShadow: '0 2px 12px rgba(236,64,122,0.18), 0 1px 4px rgba(0,0,0,0.08)',
      border: `1.5px solid ${PROMO_PINK}33`,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'stretch',
      height: 84,
      position: 'relative',
      flexShrink: 0,
    }}>
      {/* Image */}
      {evt.image_url
        ? <img key={`img-${idx}`} src={evt.image_url} alt="" loading="lazy"
            style={{ width: 84, height: 84, objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%', flexShrink: 0, ...fade }} />
        : <div style={{ width: 84, height: 84, backgroundColor: cat.color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, ...fade }}>
            {cat.emoji}
          </div>
      }

      {/* Content */}
      <div style={{ flex: 1, padding: '8px 6px 8px 10px', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', ...fade }}>
        <div style={{ marginBottom: 2 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: PROMO_PINK, letterSpacing: '0.04em', textTransform: 'uppercase' }}>★ En vedette</span>
        </div>
        <p style={{
          fontSize: 12, fontWeight: 700, color: '#2C1810', lineHeight: 1.25, margin: 0,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{evt.titre}</p>
        {evt.date_debut && (
          <p style={{ fontSize: 10, color: '#8A8A8A', margin: '3px 0 0', fontFamily: 'Inter, sans-serif' }}>
            {formatDate(evt.date_debut)}{evt.lieux?.commune ? ` · ${evt.lieux.commune}` : ''}
          </p>
        )}
      </div>

      {/* Découvrir */}
      <button onClick={() => { clearTimeout(timerRef.current); onDiscover(evt.id) }}
        style={{
          alignSelf: 'center', margin: '0 10px 0 4px', flexShrink: 0,
          padding: '8px 10px', borderRadius: 10,
          backgroundColor: PROMO_PINK, color: '#fff',
          fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', lineHeight: 1.3,
          whiteSpace: 'nowrap',
        }}>
        Découvrir
      </button>

      {/* Dots */}
      {queue.length > 1 && (
        <div style={{ position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4 }}>
          {queue.map((_, i) => (
            <div key={i} style={{
              width: i === idx ? 12 : 5, height: 5, borderRadius: 3,
              backgroundColor: i === idx ? PROMO_PINK : '#D0C8C0',
              transition: 'width 0.3s, background-color 0.3s',
            }} />
          ))}
        </div>
      )}

      {/* X dismiss */}
      <button onClick={() => setDismissed(true)}
        style={{
          position: 'absolute', top: 5, right: 5,
          width: 18, height: 18, borderRadius: '50%',
          backgroundColor: 'rgba(0,0,0,0.2)', border: 'none', color: '#fff',
          fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700,
        }}>✕</button>
    </div>
  )
}
