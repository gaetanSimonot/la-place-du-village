'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { EvenementCard } from '@/lib/types'
import { formatDate } from '@/lib/filters'
import { CATEGORIES } from '@/lib/categories'

const INTERVAL_MS = 5500
const FADE_MS = 280

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
      onPointerDown={e => e.stopPropagation()}
      style={{ margin: '4px 12px 8px', cursor: 'pointer', flexShrink: 0 }}
    >
      <div style={{
        display: 'flex', height: 80, borderRadius: 14, overflow: 'hidden',
        backgroundColor: '#fff', boxShadow: '0 2px 10px rgba(44,44,44,0.10)',
        opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease`,
      }}>
        {/* Image left */}
        <div style={{ width: 80, flexShrink: 0, position: 'relative', overflow: 'hidden', backgroundColor: cat.color + '22' }}>
          {evt.image_url
            ? <img src={evt.image_url} alt="" loading="lazy"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%' }} />
            : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
                {cat.emoji}
              </div>
          }
          <div style={{ position: 'absolute', bottom: 4, left: 4, backgroundColor: '#EC407A', borderRadius: 999, padding: '1px 5px' }}>
            <span style={{ fontSize: 8, fontWeight: 800, color: '#fff', fontFamily: 'Inter, sans-serif', letterSpacing: '0.04em' }}>✦ À la une</span>
          </div>
        </div>

        {/* Content right */}
        <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0, position: 'relative' }}>
          <button
            onClick={e => { e.stopPropagation(); setDismissed(true) }}
            style={{
              position: 'absolute', top: 5, right: 5,
              width: 18, height: 18, borderRadius: '50%',
              backgroundColor: '#F0EBE4', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, color: '#8A8A8A', padding: 0, lineHeight: 1,
            }}>✕</button>

          <p style={{
            fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 13,
            color: '#1C1917', margin: '0 20px 0 0', lineHeight: 1.3,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>{evt.titre}</p>

          <div>
            {evt.date_debut && (
              <p style={{ fontSize: 10, color: '#6B5E4E', margin: '0 0 1px', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                🗓 {formatDate(evt.date_debut)}{evt.heure ? ` · ${evt.heure.slice(0,5)}` : ''}
              </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 10, color: '#6B5E4E', margin: 0, fontFamily: 'Lora, serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {evt.lieux?.commune ? `📍 ${evt.lieux.commune}` : `${cat.emoji} ${cat.label}`}
              </p>
              {queue.length > 1 && (
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
      </div>
    </div>
  )
}
