'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { EtablissementCard } from '@/lib/types'
import { ETAB_TYPES } from '@/lib/etablissement-types'

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
  etablissements: EtablissementCard[]
  onDiscover: (id: string) => void
}

export default function EtabBandeau({ etablissements, onDiscover }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [queue, setQueue]         = useState<EtablissementCard[]>([])
  const [idx, setIdx]             = useState(0)
  const [fading, setFading]       = useState(false)
  const timerRef     = useRef<ReturnType<typeof setTimeout>>()
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (etablissements.length === 0) return
    setQueue(shuffle(etablissements))
    setIdx(0)
  }, [etablissements])

  const advance = useCallback(() => {
    clearTimeout(fadeTimerRef.current)
    setFading(true)
    fadeTimerRef.current = setTimeout(() => {
      setIdx(prev => {
        const next = prev + 1
        if (next >= queue.length) { setQueue(shuffle(etablissements)); return 0 }
        return next
      })
      setFading(false)
    }, FADE_MS)
  }, [queue.length, etablissements])

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

  const e = queue[idx]
  if (!e) return null
  const typeInfo = ETAB_TYPES[e.type]
  const photo = e.photos?.[0]

  return (
    <div
      onClick={() => { clearTimeout(timerRef.current); onDiscover(e.id) }}
      style={{
        margin: '0 0 2px', borderRadius: 16, overflow: 'hidden', height: 116,
        position: 'relative', cursor: 'pointer', flexShrink: 0,
        backgroundColor: '#111', boxShadow: '0 6px 24px rgba(0,0,0,0.16)',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease` }}>
        {photo
          ? <img src={photo} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ position: 'absolute', inset: 0, backgroundColor: typeInfo?.bg ?? '#2D5A3D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>{typeInfo?.emoji ?? '🏪'}</div>
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
            color: '#fff', backgroundColor: typeInfo?.color ?? '#555', borderRadius: 999, padding: '3px 9px',
            fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>{typeInfo?.emoji} À la une</span>
          <button onClick={ev => { ev.stopPropagation(); setDismissed(true) }}
            style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>✕</button>
        </div>

        <div>
          <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 16, lineHeight: 1.3, letterSpacing: '-0.01em', color: '#fff', margin: '0 0 4px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}>{e.nom}</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', margin: 0, fontFamily: 'Lora, serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {typeInfo?.label ?? ''}
              {e.commune ? ` · ${e.commune}` : ''}
              {e.note_google ? ` · ⭐ ${e.note_google.toFixed(1)}` : ''}
            </p>
            {queue.length > 1 && (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                {queue.map((_, i) => (
                  <div key={i} onClick={ev => { ev.stopPropagation(); setIdx(i) }}
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
