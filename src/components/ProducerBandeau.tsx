'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { ProducerCard } from '@/lib/types'
import { PRODUIT_CATS_MAP } from '@/lib/produit-cats'

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
  producers: ProducerCard[]
  onDiscover: (id: string) => void
}

export default function ProducerBandeau({ producers, onDiscover }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [queue, setQueue]         = useState<ProducerCard[]>([])
  const [idx, setIdx]             = useState(0)
  const [fading, setFading]       = useState(false)
  const timerRef     = useRef<ReturnType<typeof setTimeout>>()
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (producers.length === 0) return
    setQueue(shuffle(producers))
    setIdx(0)
  }, [producers])

  const advance = useCallback(() => {
    clearTimeout(fadeTimerRef.current)
    setFading(true)
    fadeTimerRef.current = setTimeout(() => {
      setIdx(prev => {
        const next = prev + 1
        if (next >= queue.length) { setQueue(shuffle(producers)); return 0 }
        return next
      })
      setFading(false)
    }, FADE_MS)
  }, [queue.length, producers])

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

  const p = queue[idx]
  if (!p) return null
  const firstCat = p.produit_categories[0] ? PRODUIT_CATS_MAP[p.produit_categories[0]] : null

  return (
    <div
      onClick={() => { clearTimeout(timerRef.current); onDiscover(p.id) }}
      style={{
        margin: '0 12px 10px', borderRadius: 16, overflow: 'hidden', height: 116,
        position: 'relative', cursor: 'pointer', flexShrink: 0,
        backgroundColor: '#111', boxShadow: '0 6px 24px rgba(0,0,0,0.16)',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease` }}>
        {p.photo_url
          ? <img src={p.photo_url} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ position: 'absolute', inset: 0, backgroundColor: '#2D5A3D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>🌿</div>
        }
      </div>

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.38) 55%, rgba(0,0,0,0.08) 100%)' }} />

      <div style={{
        position: 'absolute', inset: 0, padding: '9px 12px 10px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease`,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: '#fff', backgroundColor: '#2D5A3D', borderRadius: 999, padding: '3px 9px',
            fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>🌿 À la une</span>
          <button onClick={e => { e.stopPropagation(); setDismissed(true) }}
            style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>✕</button>
        </div>

        <div>
          <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 16, lineHeight: 1.3, letterSpacing: '-0.01em', color: '#fff', margin: '0 0 4px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}>{p.nom}</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', margin: 0, fontFamily: 'Lora, serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {firstCat ? `${firstCat.emoji} ${firstCat.label}` : ''}
              {p.commune ? ` · ${p.commune}` : ''}
            </p>
            {queue.length > 1 && (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                {queue.map((_, i) => (
                  <div key={i} onClick={e => { e.stopPropagation(); setIdx(i) }}
                    style={{ width: i === idx ? 14 : 4, height: 4, borderRadius: 2, backgroundColor: i === idx ? '#fff' : 'rgba(255,255,255,0.35)', transition: 'width 0.3s', cursor: 'pointer' }} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
