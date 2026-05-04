'use client'
import { useState, useEffect, useRef } from 'react'
import { EvenementCard } from '@/lib/types'
import { formatDate } from '@/lib/filters'
import { CATEGORIES } from '@/lib/categories'

const SEEN_KEY = 'pdv-max-seen'
const AUTO_ADVANCE_MS = 6000

type Phase = 'logo' | 'event' | 'dismissed'

interface Props {
  events: EvenementCard[]
  loading?: boolean
}

const STYLES = `
  @keyframes logoIn { from { opacity:0; transform:scale(0.6) } to { opacity:1; transform:scale(1) } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:none } }
  @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
`

function sorted(events: EvenementCard[]): EvenementCard[] {
  return [...events].sort((a, b) => {
    const ao = a.promo_ordre != null ? Number(a.promo_ordre) : 999
    const bo = b.promo_ordre != null ? Number(b.promo_ordre) : 999
    return (isNaN(ao) ? 999 : ao) - (isNaN(bo) ? 999 : bo)
  })
}

function wrap(i: number, n: number) {
  return ((i % n) + n) % n
}

function Slide({ evt }: { evt: EvenementCard }) {
  const cat = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  return (
    <>
      {evt.image_url
        ? <img src={evt.image_url} alt="" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%',
          }} />
        : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color }} />
      }
    </>
  )
}

export default function MaxSplash({ events, loading = false }: Props) {
  const [phase, setPhase]           = useState<Phase>('logo')
  const [logoReady, setLogoReady]   = useState(false)
  const [idx, setIdx]               = useState(0)
  const [dragX, setDragX]           = useState(0)
  const [animating, setAnimating]   = useState(false)
  const transitioning               = useRef(false)
  const touchStartX                 = useRef<number | null>(null)
  const liveDragX                   = useRef(0)
  const autoTimer                   = useRef<ReturnType<typeof setTimeout>>()

  const evts = sorted(events)
  const n    = evts.length

  useEffect(() => {
    if (localStorage.getItem(SEEN_KEY)) setPhase('dismissed')
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setLogoReady(true), 1800)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (phase !== 'logo') return
    if (localStorage.getItem(SEEN_KEY)) return
    if (!logoReady || loading) return
    if (transitioning.current) return
    transitioning.current = true
    const t = setTimeout(() => {
      setPhase(n === 0 ? 'dismissed' : 'event')
    }, 380)
    return () => clearTimeout(t)
  }, [phase, logoReady, loading, n])

  useEffect(() => {
    if (phase !== 'event' || n <= 1 || animating) return
    autoTimer.current = setTimeout(() => slide('left'), AUTO_ADVANCE_MS)
    return () => clearTimeout(autoTimer.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx, n, animating])

  const dismiss = () => {
    clearTimeout(autoTimer.current)
    localStorage.setItem(SEEN_KEY, '1')
    setPhase('dismissed')
  }

  const slide = (dir: 'left' | 'right') => {
    if (animating) return
    clearTimeout(autoTimer.current)
    setAnimating(true)
    setDragX(dir === 'left' ? -window.innerWidth * 1.3 : window.innerWidth * 1.3)
    setTimeout(() => {
      setIdx(prev => wrap(prev + (dir === 'left' ? 1 : -1), n))
      setDragX(0)
      setAnimating(false)
    }, 150)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (animating) return
    clearTimeout(autoTimer.current)
    touchStartX.current = e.touches[0].clientX
    liveDragX.current   = 0
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || animating) return
    const dx = e.touches[0].clientX - touchStartX.current
    liveDragX.current = dx
    setDragX(dx)
  }

  const onTouchEnd = () => {
    if (touchStartX.current === null) return
    const dx  = liveDragX.current
    touchStartX.current = null
    const thr = window.innerWidth * 0.22
    if      (dx < -thr) slide('left')
    else if (dx >  thr) slide('right')
    else { setAnimating(true); setDragX(0); setTimeout(() => setAnimating(false), 150) }
  }

  if (phase === 'dismissed') return null

  /* ── Logo phase : AppSplash gère le splash, on attend silencieusement ── */
  if (phase === 'logo') return null

  /* ── Événement ── */
  const evt = evts[idx]
  const cat = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  const underIdx = n > 1 ? (dragX > 20 ? wrap(idx - 1, n) : wrap(idx + 1, n)) : null

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ position: 'fixed', inset: 0, zIndex: 500, overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}
    >
      <style>{STYLES}</style>

      {/* Carte du dessous */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {underIdx !== null
          ? <Slide evt={evts[underIdx]} />
          : <div style={{ position: 'absolute', inset: 0, backgroundColor: '#111' }} />
        }
      </div>

      {/* Carte du dessus */}
      <div style={{
        position: 'absolute', inset: 0,
        transform: `translateX(${dragX}px)`,
        transition: animating ? 'transform 0.15s ease-out' : 'none',
        willChange: 'transform',
      }}>
        <Slide evt={evt} />
      </div>

      {/* Dégradé fixe — plus dense en bas pour lisibilité du texte */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(to top, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.65) 28%, rgba(0,0,0,0.1) 55%, transparent 100%)',
      }} />

      {/* UI fixe */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>

        {/* Bouton fermer */}
        <button onClick={dismiss} onTouchStart={e => e.stopPropagation()} style={{
          pointerEvents: 'auto',
          position: 'absolute', top: 18, right: 18,
          width: 32, height: 32, borderRadius: '50%',
          backgroundColor: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#fff', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>

        {/* Badge */}
        <div style={{ position: 'absolute', top: 22, left: 18 }}>
          <span style={{
            fontSize: 10, fontWeight: 800, color: '#fff', backgroundColor: '#C84B2F',
            padding: '4px 11px', borderRadius: 999, letterSpacing: '0.07em',
            textTransform: 'uppercase', fontFamily: 'Syne, sans-serif',
          }}>✦ Événement à la une</span>
        </div>

        {/* Bloc infos — dots au-dessus du titre, tout en flux naturel */}
        <div style={{
          position: 'absolute', bottom: 108, left: 22, right: 22,
        }}>
          {/* Dots de pagination */}
          {n > 1 && (
            <div style={{ display: 'flex', gap: 5, marginBottom: 18 }}>
              {evts.map((_, i) => (
                <div key={i} style={{
                  width: i === idx ? 22 : 6, height: 5, borderRadius: 3,
                  backgroundColor: i === idx ? '#fff' : 'rgba(255,255,255,0.3)',
                  transition: 'width 0.3s ease',
                }} />
              ))}
            </div>
          )}

          {/* Catégorie */}
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: '0 0 6px', fontFamily: 'Lora, serif', fontWeight: 600 }}>
            {cat.emoji} {cat.label}
          </p>

          {/* Titre */}
          <h2 style={{
            fontSize: 30, fontWeight: 700, color: '#fff',
            lineHeight: 1.15, margin: '0 0 10px',
            fontFamily: '"Playfair Display", serif',
            textShadow: '0 2px 16px rgba(0,0,0,0.5)',
          }}>{evt.titre}</h2>

          {/* Date + lieu */}
          {(evt.date_debut || evt.lieux?.commune) && (
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.4, fontFamily: 'Lora, serif' }}>
              {evt.date_debut ? formatDate(evt.date_debut) : ''}
              {evt.heure ? ` · ${evt.heure.slice(0, 5)}` : ''}
              {evt.lieux?.commune ? ` • ${evt.lieux.commune}` : ''}
            </p>
          )}
        </div>

        {/* Bouton CTA */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '0 22px 44px',
          pointerEvents: 'auto',
        }}>
          <button onClick={dismiss} onTouchStart={e => e.stopPropagation()} style={{
            width: '100%', padding: '17px', borderRadius: 999,
            backgroundColor: 'var(--primary)', color: '#fff',
            fontSize: 16, fontWeight: 700, border: 'none', cursor: 'pointer',
            fontFamily: 'Syne, sans-serif', letterSpacing: '0.02em',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>Aller sur la carte</button>
        </div>

      </div>
    </div>
  )
}
