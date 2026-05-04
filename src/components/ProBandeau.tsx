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
      style={{
        margin: '0 12px 10px',
        borderRadius: 16,
        overflow: 'hidden',
        height: 116,
        position: 'relative',
        cursor: 'pointer',
        flexShrink: 0,
        backgroundColor: '#111',
        boxShadow: '0 6px 24px rgba(0,0,0,0.16)',
      }}
    >
      {/* Image de fond */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
      }}>
        {evt.image_url
          ? <img src={evt.image_url} alt="" loading="lazy" style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%',
            }} />
          : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>
              {cat.emoji}
            </div>
        }
      </div>

      {/* Gradient overlay — dense en bas pour lisibilité */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.38) 55%, rgba(0,0,0,0.08) 100%)',
      }} />

      {/* Contenu */}
      <div style={{
        position: 'absolute', inset: 0,
        padding: '9px 12px 10px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
      }}>
        {/* Haut : badge + fermer */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: '#fff', backgroundColor: '#EC407A',
            borderRadius: 999, padding: '3px 9px',
            fontFamily: 'Syne, sans-serif', whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>✦ À la une</span>

          <button
            onClick={e => { e.stopPropagation(); setDismissed(true) }}
            style={{
              width: 22, height: 22, borderRadius: '50%',
              backgroundColor: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.8)', fontSize: 9,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, flexShrink: 0,
            }}>✕</button>
        </div>

        {/* Bas : titre + meta */}
        <div>
          <p style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 800,
            fontSize: 16, lineHeight: 1.3, letterSpacing: '0.01em', color: '#fff',
            margin: '0 0 4px',
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            textShadow: '0 1px 8px rgba(0,0,0,0.5)',
          }}>{evt.titre}</p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{
              fontSize: 11, color: 'rgba(255,255,255,0.72)', margin: 0,
              fontFamily: 'Lora, serif',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {evt.date_debut ? formatDate(evt.date_debut) : ''}
              {evt.lieux?.commune ? ` · ${evt.lieux.commune}` : ''}
            </p>

            {/* Dots */}
            {queue.length > 1 && (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                {queue.map((_, i) => (
                  <div key={i} onClick={e => { e.stopPropagation(); setIdx(i) }} style={{
                    width: i === idx ? 14 : 4, height: 4, borderRadius: 2,
                    backgroundColor: i === idx ? '#fff' : 'rgba(255,255,255,0.35)',
                    transition: 'width 0.3s',
                    cursor: 'pointer',
                  }} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
