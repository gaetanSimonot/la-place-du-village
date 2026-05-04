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
        margin: '0 12px 8px',
        borderRadius: 14,
        backgroundColor: '#fff',
        boxShadow: '0 2px 10px rgba(0,0,0,0.09)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'stretch',
        height: 80,
        position: 'relative',
        flexShrink: 0,
        cursor: 'pointer',
      }}
    >
      {/* Image pleine hauteur */}
      <div style={{ width: 88, height: 80, flexShrink: 0, position: 'relative', overflow: 'hidden', ...fade }}>
        {evt.image_url
          ? <img key={`img-${idx}`} src={evt.image_url} alt="" loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%' }} />
          : <div style={{ width: '100%', height: '100%', backgroundColor: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
              {cat.emoji}
            </div>
        }
        {/* Badge À LA UNE sur l'image */}
        <div style={{
          position: 'absolute', top: 6, left: 6,
          backgroundColor: '#EC407A', color: '#fff',
          fontSize: 8, fontWeight: 800, letterSpacing: '0.07em',
          textTransform: 'uppercase', padding: '3px 7px', borderRadius: 999,
          fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        }}>
          À la une
        </div>
      </div>

      {/* Texte */}
      <div style={{
        flex: 1, padding: '12px 6px 12px 12px', minWidth: 0,
        display: 'flex', flexDirection: 'column', justifyContent: 'center', ...fade,
      }}>
        <p style={{
          fontSize: 9, fontWeight: 600, color: cat.color,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          margin: '0 0 3px', fontFamily: 'Inter, sans-serif',
        }}>
          {cat.emoji} {cat.label}
        </p>
        <p style={{
          fontSize: 13, fontWeight: 700, color: '#1A1209', lineHeight: 1.25, margin: '0 0 3px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'Syne, sans-serif',
        }}>{evt.titre}</p>
        {evt.date_debut && (
          <p style={{
            fontSize: 10, color: '#9A9080', margin: 0,
            fontFamily: 'Inter, sans-serif',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {formatDate(evt.date_debut)}{evt.lieux?.commune ? ` · ${evt.lieux.commune}` : ''}
          </p>
        )}
      </div>

      {/* Chevron */}
      <div style={{
        display: 'flex', alignItems: 'center', paddingRight: 14, flexShrink: 0,
        color: '#C8C0B8', ...fade,
      }}>
        <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
          <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Dots */}
      {queue.length > 1 && (
        <div style={{
          position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 3,
        }}>
          {queue.map((_, i) => (
            <div key={i} onClick={e => { e.stopPropagation(); setIdx(i) }} style={{
              width: i === idx ? 10 : 4, height: 4, borderRadius: 2,
              backgroundColor: i === idx ? '#EC407A' : '#DDD5CC',
              transition: 'width 0.3s',
              cursor: 'pointer',
            }} />
          ))}
        </div>
      )}

      {/* X discret */}
      <button
        onClick={e => { e.stopPropagation(); setDismissed(true) }}
        style={{
          position: 'absolute', top: 6, right: 6,
          width: 18, height: 18, borderRadius: '50%',
          backgroundColor: 'rgba(0,0,0,0.07)', border: 'none',
          color: '#AAA', fontSize: 8,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700,
        }}>✕</button>
    </div>
  )
}
