'use client'
import { useState, useEffect } from 'react'
import { EvenementCard } from '@/lib/types'
import { formatDate } from '@/lib/filters'
import { CATEGORIES } from '@/lib/categories'

const SESSION_KEY = 'pdv-max-seen'

interface Props {
  events: EvenementCard[]
  onDiscover: (id: string) => void
}

export default function MaxSplash({ events, onDiscover }: Props) {
  const [visible, setVisible] = useState(false)
  const [idx, setIdx]         = useState(0)

  useEffect(() => {
    if (events.length === 0) return
    if (sessionStorage.getItem(SESSION_KEY)) return
    setVisible(true)
  }, [events.length])

  const dismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1')
    setVisible(false)
  }

  const discover = () => {
    onDiscover(events[idx].id)
    dismiss()
  }

  const next = () => {
    if (idx + 1 >= events.length) { dismiss(); return }
    setIdx(i => i + 1)
  }

  if (!visible || events.length === 0) return null

  const evt = events[idx]
  const cat = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  const hasNext = idx + 1 < events.length

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      backgroundColor: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* Image hero */}
      <div style={{ position: 'relative', flex: '0 0 55%', overflow: 'hidden' }}>
        {evt.image_url
          ? <img src={evt.image_url} alt={evt.titre} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%' }} />
          : <div style={{ width: '100%', height: '100%', backgroundColor: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80 }}>{cat.emoji}</div>
        }
        {/* Gradient bottom */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.8))' }} />
        {/* Close */}
        <button onClick={dismiss} style={{
          position: 'absolute', top: 16, right: 16,
          width: 36, height: 36, borderRadius: '50%',
          backgroundColor: 'rgba(0,0,0,0.4)', border: 'none',
          color: '#fff', fontSize: 18, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>
        {/* Label */}
        <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', backgroundColor: '#7C3AED', padding: '3px 10px', borderRadius: 999, letterSpacing: '0.05em' }}>
            ⚡ À NE PAS MANQUER
          </span>
        </div>
        {/* Dots */}
        {events.length > 1 && (
          <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
            {events.map((_, i) => (
              <div key={i} style={{ width: i === idx ? 18 : 7, height: 7, borderRadius: 4, backgroundColor: i === idx ? '#fff' : 'rgba(255,255,255,0.4)', transition: 'width 0.3s' }} />
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, padding: '20px 20px 0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, fontWeight: 700, color: '#fff',
          backgroundColor: cat.color, padding: '3px 10px', borderRadius: 999,
          marginBottom: 10, alignSelf: 'flex-start',
        }}>
          {cat.emoji} {cat.label}
        </span>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '0 0 8px', fontFamily: 'Syne, sans-serif' }}>
          {evt.titre}
        </h2>
        {evt.date_debut && (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: '0 0 4px' }}>
            📅 {formatDate(evt.date_debut)}{evt.heure ? ` · ${evt.heure.slice(0,5)}` : ''}
          </p>
        )}
        {evt.lieux && (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: 0 }}>
            📍 {evt.lieux.nom}{evt.lieux.commune ? `, ${evt.lieux.commune}` : ''}
          </p>
        )}
      </div>

      {/* Buttons */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={discover} style={{
          width: '100%', padding: '16px', borderRadius: 16, border: 'none',
          backgroundColor: '#C4622D', color: '#fff',
          fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'Syne, sans-serif',
        }}>
          Découvrir →
        </button>
        <button onClick={hasNext ? next : dismiss} style={{
          width: '100%', padding: '12px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.25)',
          backgroundColor: 'transparent', color: 'rgba(255,255,255,0.7)',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          {hasNext ? 'Voir le suivant →' : 'Ignorer'}
        </button>
      </div>
    </div>
  )
}
