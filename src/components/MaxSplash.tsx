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
  const [flying, setFlying]       = useState(false)
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
    if (phase !== 'event' || sorted.length <= 1 || flying) return
    autoTimer.current = setTimeout(() => flyOff(1), AUTO_ADVANCE_MS)
    return () => clearTimeout(autoTimer.current)
  }, [phase, idx, sorted.length, flying])

  const dismiss = () => {
    clearTimeout(autoTimer.current)
    sessionStorage.setItem(SESSION_KEY, '1')
    setPhase('dismissed')
  }

  const discover = () => {
    clearTimeout(autoTimer.current)
    sessionStorage.setItem(SESSION_KEY, '1')
    setPhase('dismissed')
    onDiscover(sorted[idx].id)
  }

  // direction: -1 = fly left, 1 = fly right
  const flyOff = (direction: -1 | 1) => {
    if (flying) return
    clearTimeout(autoTimer.current)
    setFlying(true)
    setDragX(direction * -window.innerWidth * 1.2)
    setTimeout(() => {
      const next = idx + 1
      if (next >= sorted.length) {
        dismiss()
      } else {
        setIdx(next)
        setDragX(0)
        setFlying(false)
      }
    }, 320)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (flying) return
    clearTimeout(autoTimer.current)
    touchStartX.current = e.touches[0].clientX
    liveDragX.current = 0
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || flying) return
    const dx = e.touches[0].clientX - touchStartX.current
    // Résistance si on swipe vers la droite (on ne peut pas revenir en arrière)
    const clamped = dx < 0 ? dx : dx * 0.15
    liveDragX.current = clamped
    setDragX(clamped)
  }

  const onTouchEnd = () => {
    if (touchStartX.current === null) return
    const dx = liveDragX.current
    touchStartX.current = null
    if (dx < -(window.innerWidth * 0.25)) {
      flyOff(-1)
    } else {
      // Snap back
      setFlying(true)
      setDragX(0)
      setTimeout(() => setFlying(false), 280)
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
        <img src="/logo.png" alt="La Place du Village" width={120} height={120}
          style={{ objectFit: 'contain', animation: 'logoIn 0.65s cubic-bezier(0.34,1.56,0.64,1) both' }} />
        <h1 style={{
          fontSize: 26, fontWeight: 800, color: '#2C1810',
          letterSpacing: '-0.02em', margin: '22px 0 5px',
          fontFamily: 'Syne, sans-serif', textAlign: 'center',
          animation: 'fadeUp 0.5s 0.38s ease both',
        }}>La Place du Village</h1>
        <p style={{
          fontSize: 13, color: '#A09488', margin: 0,
          fontFamily: 'Inter, sans-serif',
          animation: 'fadeIn 0.5s 0.6s ease both',
        }}>c&apos;est arrivé près de chez vous</p>
        <button onClick={dismiss} style={{
          position: 'absolute', bottom: 52,
          background: 'none', border: 'none', color: '#B0A898', fontSize: 13,
          cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          animation: 'fadeIn 0.4s 1.1s ease both', opacity: 0,
        }}>Passer</button>
      </div>
    )
  }

  /* ── Phase event — stack de cartes ── */
  // On rend les 2 prochaines cartes (dessous) + la carte courante (dessus)
  const visibleCards = sorted.slice(idx, idx + 3)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, fontFamily: 'Inter, sans-serif' }}>
      <style>{STYLES}</style>

      {/* Cartes empilées — la dernière dans le DOM est au dessus */}
      {visibleCards.map((evt, stackPos) => {
        const isTop    = stackPos === 0
        const cat      = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
        const hasNext  = idx + 1 < sorted.length

        // Carte du dessous : légèrement réduite et assombrie
        const scaleBase   = 1 - (stackPos * 0.04)
        // Quand on drag la carte du dessus, les cartes dessous progressent vers leur taille finale
        const dragRatio   = Math.min(Math.abs(dragX) / (window?.innerWidth * 0.25 || 100), 1)
        const scale       = isTop ? 1 : scaleBase + (stackPos * 0.04 * dragRatio)
        const brightness  = isTop ? 1 : 0.75 + (0.25 * dragRatio / stackPos)

        const transform = isTop
          ? `translateX(${dragX}px) rotate(${dragX * 0.015}deg)`
          : `scale(${scale})`

        const transition = isTop
          ? (flying ? 'transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94)' : 'none')
          : 'transform 0.18s ease'

        return (
          <div
            key={evt.id}
            onTouchStart={isTop ? onTouchStart : undefined}
            onTouchMove={isTop ? onTouchMove : undefined}
            onTouchEnd={isTop ? onTouchEnd : undefined}
            style={{
              position: 'absolute', inset: 0,
              borderRadius: stackPos > 0 ? 20 : 0,
              overflow: 'hidden',
              transform,
              transition,
              transformOrigin: 'bottom center',
              willChange: 'transform',
              zIndex: 10 - stackPos,
              filter: `brightness(${brightness})`,
            }}
          >
            {/* Image */}
            {evt.image_url
              ? <img src={evt.image_url} alt={evt.titre} style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                  objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%',
                }} />
              : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color }} />
            }

            {/* Dégradé */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 35%, rgba(0,0,0,0.1) 60%, transparent 100%)',
            }} />

            {/* UI visible uniquement sur la carte du dessus */}
            {isTop && <>
              {/* Fermer */}
              <button onClick={dismiss} style={{
                position: 'absolute', top: 18, right: 18,
                width: 30, height: 30, borderRadius: '50%',
                backgroundColor: 'rgba(0,0,0,0.52)',
                backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                border: 'none', color: '#fff', fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 1px 8px rgba(0,0,0,0.35)',
              }}>✕</button>

              {/* Badge */}
              <div style={{ position: 'absolute', top: 22, left: 18 }}>
                <span style={{
                  fontSize: 10, fontWeight: 800, color: '#fff',
                  backgroundColor: '#EC407A',
                  padding: '4px 11px', borderRadius: 999,
                  letterSpacing: '0.07em', textTransform: 'uppercase',
                  fontFamily: 'Inter, sans-serif',
                }}>ÉVÉNEMENT À LA UNE</span>
              </div>

              {/* Dots */}
              {sorted.length > 1 && (
                <div style={{
                  position: 'absolute', bottom: 176, left: '50%', transform: 'translateX(-50%)',
                  display: 'flex', gap: 6,
                }}>
                  {sorted.map((_, i) => (
                    <div key={i} style={{
                      width: i === idx ? 20 : 6, height: 6, borderRadius: 3,
                      backgroundColor: i === idx ? '#fff' : 'rgba(255,255,255,0.35)',
                      transition: 'width 0.3s',
                    }} />
                  ))}
                </div>
              )}

              {/* Contenu bas */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 22px 44px' }}>
                <h2 style={{
                  fontSize: 30, fontWeight: 800, color: '#fff',
                  lineHeight: 1.18, margin: '0 0 8px', fontFamily: 'Syne, sans-serif',
                }}>{evt.titre}</h2>
                {(evt.date_debut || evt.lieux) && (
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', margin: '0 0 4px', lineHeight: 1.4 }}>
                    {evt.date_debut ? formatDate(evt.date_debut) : ''}
                    {evt.heure ? ` · ${evt.heure.slice(0, 5)}` : ''}
                    {evt.lieux?.commune ? ` • ${evt.lieux.commune}` : ''}
                  </p>
                )}
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 26px' }}>
                  {cat.emoji} {cat.label}
                </p>
                <button onClick={discover} style={{
                  width: '100%', padding: '18px', borderRadius: 999,
                  backgroundColor: '#EC407A', color: '#fff',
                  fontSize: 16, fontWeight: 700, border: 'none', cursor: 'pointer', marginBottom: 14,
                  fontFamily: 'Syne, sans-serif', letterSpacing: '0.01em',
                }}>Découvrir l&apos;événement</button>
                <button onClick={hasNext ? () => flyOff(-1) : dismiss} style={{
                  width: '100%', padding: '8px',
                  backgroundColor: 'transparent', border: 'none',
                  color: 'rgba(255,255,255,0.6)', fontSize: 14,
                  cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}>{hasNext ? 'Voir le suivant' : 'Voir la carte'}</button>
              </div>
            </>}
          </div>
        )
      }).reverse()}
    </div>
  )
}
