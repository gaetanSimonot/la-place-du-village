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

  return (
    <div
      onClick={() => { clearTimeout(timerRef.current); onDiscover(evt.id) }}
      style={{
        margin: '0 12px 8px',
        borderRadius: 12,
        backgroundColor: '#FAFAF8',
        border: '1px solid #E8E2D8',
        boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'stretch',
        height: 72,
        position: 'relative',
        flexShrink: 0,
        cursor: 'pointer',
      }}
    >
      {/* Barre latérale colorée catégorie */}
      <div style={{ width: 3, backgroundColor: cat.color, flexShrink: 0 }} />

      {/* Image ou emoji */}
      <div style={{
        width: 64, height: 72, flexShrink: 0, overflow: 'hidden', position: 'relative',
        opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease`,
      }}>
        {evt.image_url
          ? <img key={`img-${idx}`} src={evt.image_url} alt="" loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%' }} />
          : <div style={{ width: '100%', height: '100%', backgroundColor: cat.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
              {cat.emoji}
            </div>
        }
      </div>

      {/* Texte */}
      <div style={{
        flex: 1, padding: '10px 8px 10px 10px', minWidth: 0,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease`,
      }}>
        <p style={{
          fontSize: 9, fontWeight: 700, color: '#A09488',
          letterSpacing: '0.08em', textTransform: 'uppercase',
          margin: '0 0 3px', fontFamily: 'Inter, sans-serif',
        }}>
          À la une · {cat.emoji} {cat.label}
        </p>
        <p style={{
          fontSize: 13, fontWeight: 700, color: '#2C1810', lineHeight: 1.25, margin: '0 0 2px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'Syne, sans-serif',
        }}>{evt.titre}</p>
        {evt.date_debut && (
          <p style={{
            fontSize: 10, color: '#8A8A8A', margin: 0,
            fontFamily: 'Inter, sans-serif',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {formatDate(evt.date_debut)}{evt.lieux?.commune ? ` · ${evt.lieux.commune}` : ''}
          </p>
        )}
      </div>

      {/* Flèche */}
      <div style={{
        display: 'flex', alignItems: 'center', paddingRight: 12, flexShrink: 0,
        opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease`,
        color: '#C0B8B0', fontSize: 14,
      }}>→</div>

      {/* Dots */}
      {queue.length > 1 && (
        <div style={{
          position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 3,
        }}>
          {queue.map((_, i) => (
            <div key={i} onClick={e => { e.stopPropagation(); setIdx(i) }} style={{
              width: i === idx ? 10 : 4, height: 4, borderRadius: 2,
              backgroundColor: i === idx ? '#8A8A8A' : '#D0C8C0',
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
          width: 16, height: 16, borderRadius: '50%',
          backgroundColor: 'rgba(0,0,0,0.08)', border: 'none',
          color: '#8A8A8A', fontSize: 8,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700,
        }}>✕</button>
    </div>
  )
}
