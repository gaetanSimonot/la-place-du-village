'use client'
import { useState, useEffect } from 'react'
import { EvenementCard } from '@/lib/types'
import { formatDate } from '@/lib/filters'
import { CATEGORIES } from '@/lib/categories'

const SESSION_KEY = 'pdv-max-seen'

type Phase = 'loading' | 'event' | 'dismissed'

interface Props {
  events: EvenementCard[]
  onDiscover: (id: string) => void
  loading?: boolean
}

export default function MaxSplash({ events, onDiscover, loading = false }: Props) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [idx, setIdx]     = useState(0)

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) setPhase('dismissed')
  }, [])

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return
    if (loading) return
    setPhase(events.length === 0 ? 'dismissed' : 'event')
  }, [loading, events.length])

  const dismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1')
    setPhase('dismissed')
  }

  const discover = () => {
    sessionStorage.setItem(SESSION_KEY, '1')
    setPhase('dismissed')
    onDiscover(events[idx].id)
  }

  const next = () => {
    if (idx + 1 >= events.length) { dismiss(); return }
    setIdx(i => i + 1)
  }

  if (phase === 'dismissed') return null

  /* ── Loading phase ── */
  if (phase === 'loading') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 500,
        backgroundColor: '#1a0a06',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Syne, sans-serif',
      }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', marginBottom: 6 }}>
          La Place du Village
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 52, fontFamily: 'Inter, sans-serif' }}>
          Agenda local · Ganges
        </div>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          border: '2.5px solid rgba(255,255,255,0.12)',
          borderTopColor: '#EC407A',
          animation: 'spin 0.7s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  /* ── Event phase ── */
  const evt = events[idx]
  const cat = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  const hasNext = idx + 1 < events.length

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      fontFamily: 'Inter, sans-serif',
      animation: 'fadeIn 0.35s ease',
    }}>
      <style>{`@keyframes fadeIn { from { opacity:0 } to { opacity:1 } } @keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Image plein écran */}
      {evt.image_url
        ? <img src={evt.image_url} alt={evt.titre} style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%',
          }} />
        : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color }} />
      }

      {/* Dégradé sombre bas → haut */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.75) 38%, rgba(0,0,0,0.2) 62%, transparent 100%)',
      }} />

      {/* Fermer */}
      <button onClick={dismiss} style={{
        position: 'absolute', top: 18, right: 18,
        width: 32, height: 32, borderRadius: '50%',
        backgroundColor: 'rgba(255,255,255,0.18)', border: 'none',
        color: '#fff', fontSize: 15, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>✕</button>

      {/* Badge "ÉVÉNEMENT À LA UNE" */}
      <div style={{ position: 'absolute', top: 22, left: 18 }}>
        <span style={{
          fontSize: 10, fontWeight: 800, color: '#fff',
          backgroundColor: '#EC407A',
          padding: '4px 11px', borderRadius: 999,
          letterSpacing: '0.07em', textTransform: 'uppercase',
          fontFamily: 'Inter, sans-serif',
        }}>ÉVÉNEMENT À LA UNE</span>
      </div>

      {/* Dots navigation (plusieurs max events) */}
      {events.length > 1 && (
        <div style={{
          position: 'absolute', bottom: 176, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 6,
        }}>
          {events.map((_, i) => (
            <div key={i} onClick={() => setIdx(i)} style={{
              width: i === idx ? 20 : 6, height: 6, borderRadius: 3,
              backgroundColor: i === idx ? '#fff' : 'rgba(255,255,255,0.35)',
              transition: 'width 0.3s', cursor: 'pointer',
            }} />
          ))}
        </div>
      )}

      {/* Contenu en bas */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '0 22px 44px',
      }}>
        <h2 style={{
          fontSize: 30, fontWeight: 800, color: '#fff',
          lineHeight: 1.18, margin: '0 0 8px',
          fontFamily: 'Syne, sans-serif',
        }}>
          {evt.titre}
        </h2>

        {(evt.date_debut || evt.lieux) && (
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', margin: '0 0 4px', lineHeight: 1.4 }}>
            {evt.date_debut ? formatDate(evt.date_debut) : ''}
            {evt.heure ? ` · ${evt.heure.slice(0,5)}` : ''}
            {evt.lieux?.commune ? ` • ${evt.lieux.commune}` : ''}
          </p>
        )}

        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 26px' }}>
          {cat.emoji} {cat.label}
        </p>

        {/* CTA principal */}
        <button onClick={discover} style={{
          width: '100%', padding: '18px', borderRadius: 999,
          backgroundColor: '#EC407A', color: '#fff',
          fontSize: 16, fontWeight: 700, border: 'none',
          cursor: 'pointer', marginBottom: 14,
          fontFamily: 'Syne, sans-serif', letterSpacing: '0.01em',
        }}>
          Découvrir l&apos;événement
        </button>

        {/* Lien secondaire */}
        <button onClick={hasNext ? next : dismiss} style={{
          width: '100%', padding: '8px',
          backgroundColor: 'transparent', border: 'none',
          color: 'rgba(255,255,255,0.6)', fontSize: 14,
          cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        }}>
          {hasNext ? 'Voir le suivant' : 'Voir la carte'}
        </button>
      </div>
    </div>
  )
}
