'use client'
import { useState, useEffect, useRef } from 'react'
import { EvenementCard } from '@/lib/types'
import { formatDate } from '@/lib/filters'
import { CATEGORIES } from '@/lib/categories'

const SESSION_KEY = 'pdv-max-seen'
const AUTO_ADVANCE_MS = 5000

type Phase = 'logo' | 'event' | 'dismissed'

interface Props {
  events: EvenementCard[]
  onDiscover: (id: string) => void
  loading?: boolean
}

const STYLES = `
  @keyframes logoIn  { from { opacity:0; transform:scale(0.6) } to { opacity:1; transform:scale(1) } }
  @keyframes fadeUp  { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:none } }
  @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
`

function sortedEvents(events: EvenementCard[]): EvenementCard[] {
  return [...events].sort((a, b) => (a.promo_ordre ?? 999) - (b.promo_ordre ?? 999))
}

export default function MaxSplash({ events, onDiscover, loading = false }: Props) {
  const [phase, setPhase]         = useState<Phase>('logo')
  const [fadingOut, setFadingOut] = useState(false)
  const [idx, setIdx]             = useState(0)
  const [logoReady, setLogoReady] = useState(false)
  const [dragX, setDragX]         = useState(0)
  const [snapping, setSnapping]   = useState(false)
  const transitioning             = useRef(false)
  const touchStartX               = useRef<number | null>(null)
  const liveDragX                 = useRef(0)
  const autoTimer                 = useRef<ReturnType<typeof setTimeout>>()

  const sorted = sortedEvents(events)

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) setPhase('dismissed')
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setLogoReady(true), 1800)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (phase !== 'logo') return
    if (sessionStorage.getItem(SESSION_KEY)) return
    if (!logoReady || loading) return
    if (transitioning.current) return
    transitioning.current = true

    setFadingOut(true)
    const t = setTimeout(() => {
      setFadingOut(false)
      setPhase(sorted.length === 0 ? 'dismissed' : 'event')
    }, 380)
    return () => clearTimeout(t)
  }, [phase, logoReady, loading, sorted.length])

  // Auto-advance every 5s
  useEffect(() => {
    if (phase !== 'event' || sorted.length <= 1) return
    autoTimer.current = setTimeout(() => {
      setIdx(i => (i + 1) % sorted.length)
    }, AUTO_ADVANCE_MS)
    return () => clearTimeout(autoTimer.current)
  }, [phase, idx, sorted.length])

  const dismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1')
    setPhase('dismissed')
  }

  const discover = () => {
    sessionStorage.setItem(SESSION_KEY, '1')
    setPhase('dismissed')
    onDiscover(sorted[idx].id)
  }

  const goTo = (i: number) => {
    clearTimeout(autoTimer.current)
    setIdx(i)
  }

  const next = () => {
    if (idx + 1 >= sorted.length) { dismiss(); return }
    goTo(idx + 1)
  }

  // Swipe organique : suit le doigt en temps réel
  const onTouchStart = (e: React.TouchEvent) => {
    if (snapping) return
    touchStartX.current = e.touches[0].clientX
    liveDragX.current = 0
    setSnapping(false)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = e.touches[0].clientX - touchStartX.current
    // Résistance aux bords : réduit le drag si on ne peut pas aller dans ce sens
    const canLeft  = idx + 1 < sorted.length
    const canRight = idx > 0
    const resistant = dx < 0 ? (canLeft ? dx : dx * 0.2) : (canRight ? dx : dx * 0.2)
    liveDragX.current = resistant
    setDragX(resistant)
  }

  const onTouchEnd = () => {
    if (touchStartX.current === null) return
    const dx = liveDragX.current
    touchStartX.current = null

    const threshold = window.innerWidth * 0.28

    if (Math.abs(dx) > threshold) {
      // Snap vers la destination
      const targetX = dx < 0 ? -window.innerWidth : window.innerWidth
      setSnapping(true)
      setDragX(targetX)
      setTimeout(() => {
        if (dx < 0) {
          if (idx + 1 < sorted.length) goTo(idx + 1)
          else dismiss()
        } else {
          if (idx > 0) goTo(idx - 1)
        }
        setDragX(0)
        setSnapping(false)
      }, 280)
    } else {
      // Revenir en place
      setSnapping(true)
      setDragX(0)
      setTimeout(() => setSnapping(false), 300)
    }
  }

  if (phase === 'dismissed') return null

  /* ── Phase logo ── */
  if (phase === 'logo') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 500,
        backgroundColor: '#FAF7F2',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        opacity: fadingOut ? 0 : 1,
        transition: 'opacity 0.38s ease',
      }}>
        <style>{STYLES}</style>

        <img
          src="/logo.png"
          alt="La Place du Village"
          width={120}
          height={120}
          style={{ objectFit: 'contain', animation: 'logoIn 0.65s cubic-bezier(0.34,1.56,0.64,1) both' }}
        />

        <h1 style={{
          fontSize: 26, fontWeight: 800, color: '#2C1810',
          letterSpacing: '-0.02em', margin: '22px 0 5px',
          fontFamily: 'Syne, sans-serif', textAlign: 'center',
          animation: 'fadeUp 0.5s 0.38s ease both',
        }}>
          La Place du Village
        </h1>

        <p style={{
          fontSize: 13, color: '#A09488', margin: 0,
          fontFamily: 'Inter, sans-serif',
          animation: 'fadeIn 0.5s 0.6s ease both',
        }}>
          c&apos;est arrivé près de chez vous
        </p>

        <button onClick={dismiss} style={{
          position: 'absolute', bottom: 52,
          background: 'none', border: 'none',
          color: '#B0A898', fontSize: 13,
          cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          animation: 'fadeIn 0.4s 1.1s ease both',
          opacity: 0,
        }}>
          Passer
        </button>
      </div>
    )
  }

  /* ── Phase event ── */
  const evt = sorted[idx]
  const cat = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  const hasNext = idx + 1 < sorted.length

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        fontFamily: 'Inter, sans-serif',
        animation: 'fadeIn 0.35s ease both',
        transform: `translateX(${dragX}px)`,
        transition: snapping ? 'transform 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
        willChange: 'transform',
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <style>{STYLES}</style>

      {evt.image_url
        ? <img src={evt.image_url} alt={evt.titre} style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%',
          }} />
        : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color }} />
      }

      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.75) 38%, rgba(0,0,0,0.18) 62%, transparent 100%)',
      }} />

      <button onClick={dismiss} style={{
        position: 'absolute', top: 18, right: 18,
        width: 30, height: 30, borderRadius: '50%',
        backgroundColor: 'rgba(0,0,0,0.52)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        border: 'none', color: '#fff', fontSize: 12,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 1px 8px rgba(0,0,0,0.35)',
      }}>✕</button>

      <div style={{ position: 'absolute', top: 22, left: 18 }}>
        <span style={{
          fontSize: 10, fontWeight: 800, color: '#fff',
          backgroundColor: '#EC407A',
          padding: '4px 11px', borderRadius: 999,
          letterSpacing: '0.07em', textTransform: 'uppercase',
          fontFamily: 'Inter, sans-serif',
        }}>ÉVÉNEMENT À LA UNE</span>
      </div>

      {sorted.length > 1 && (
        <div style={{
          position: 'absolute', bottom: 176, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 6,
        }}>
          {sorted.map((_, i) => (
            <div key={i} onClick={() => goTo(i)} style={{
              width: i === idx ? 20 : 6, height: 6, borderRadius: 3,
              backgroundColor: i === idx ? '#fff' : 'rgba(255,255,255,0.35)',
              transition: 'width 0.3s', cursor: 'pointer',
            }} />
          ))}
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 22px 44px' }}>
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

        <button onClick={discover} style={{
          width: '100%', padding: '18px', borderRadius: 999,
          backgroundColor: '#EC407A', color: '#fff',
          fontSize: 16, fontWeight: 700, border: 'none',
          cursor: 'pointer', marginBottom: 14,
          fontFamily: 'Syne, sans-serif', letterSpacing: '0.01em',
        }}>
          Découvrir l&apos;événement
        </button>

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
