'use client'
import { useEffect, useState } from 'react'

type Props = { onClose: () => void }

const T = {
  primary: '#2D5A3D',
  primaryLight: '#E8F2EB',
  accent: '#C84B2F',
  texte: '#1A1209',
  texteDoux: '#7A6A5A',
  creme: '#FDFAF5',
  bordSoft: '#F0EAE0',
  white: '#FFFFFF',
}

function Slide1() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        background: 'linear-gradient(135deg, #FBF3E6 0%, #F8EDD8 100%)',
        padding: '24px 22px 18px', borderRadius: '22px 22px 0 0',
        position: 'relative', overflow: 'hidden',
      }}>
        <img
          src="/village-illustration.png" alt=""
          style={{ display: 'block', width: '85%', height: 'auto', margin: '0 auto', mixBlendMode: 'multiply', userSelect: 'none' }}
        />
        <h1 style={{
          margin: '14px 0 0', textAlign: 'center',
          fontFamily: 'var(--font-display), Georgia, serif',
          fontSize: 26, color: T.texte, letterSpacing: '-0.02em', lineHeight: 1.05,
        }}>
          Le bouche-à-oreille<br />
          <span style={{ color: T.accent, fontStyle: 'italic' }}>enfin</span> organisé.
        </h1>
        <div style={{ width: 42, height: 3, borderRadius: 999, backgroundColor: T.accent, margin: '12px auto 6px' }} />
        <p style={{
          margin: 0, textAlign: 'center',
          fontFamily: 'var(--font-hand), Caveat, cursive', fontWeight: 500,
          fontSize: 18, color: T.primary, lineHeight: 1.1,
        }}>
          Bienvenue chez vous.
        </p>
      </div>
      <div style={{ padding: '22px 22px 0' }}>
        <p style={{ margin: 0, fontSize: 14, color: T.texte, lineHeight: 1.6, textAlign: 'center' }}>
          Tout ce qui se passe autour de toi —{' '}
          <strong style={{ fontWeight: 800 }}>concerts, marchés, brocantes, bons plans, annonces, producteurs locaux</strong>
          {' '}— réuni au même endroit, sur une carte vivante.
        </p>
      </div>
    </div>
  )
}

function Slide2() {
  const items = [
    {
      tint: T.primaryLight, color: T.primary,
      title: 'Publier un événement',
      body: "Photo d'affiche, dictée vocale ou texte — on remplit pour toi.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      tint: '#FFF0E5', color: T.accent,
      title: 'Vendre, donner, échanger',
      body: 'Petites annonces locales — ventes, dons, trocs et enchères inversées.',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      ),
    },
    {
      tint: '#FEF3E2', color: '#D88534',
      title: 'Profiter des bons plans',
      body: 'Promos exclusives chez les commerçants partenaires — café offert, -10% pain…',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" />
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
        </svg>
      ),
    },
    {
      tint: '#EAF3E6', color: '#5B8A4A',
      title: 'Soutenir le local',
      body: "Producteurs, commerces, artisans — la carte de proximité que tu n'avais pas.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 9.3-3.6 15.8-8.2 17.04z" />
          <path d="M2 21c0-3 1.85-5.36 5.08-6" />
        </svg>
      ),
    },
  ]
  return (
    <div style={{ padding: '30px 22px 24px', display: 'flex', flexDirection: 'column' }}>
      <h2 style={{
        margin: '0 0 8px', textAlign: 'center',
        fontFamily: 'var(--font-display), Georgia, serif',
        fontSize: 26, color: T.texte, letterSpacing: '-0.01em', lineHeight: 1.05,
      }}>Ce que tu peux faire</h2>
      <div style={{ width: 42, height: 3, borderRadius: 999, backgroundColor: T.accent, margin: '4px auto 22px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 13,
              background: it.tint, color: it.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>{it.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.texte, lineHeight: 1.2 }}>{it.title}</div>
              <div style={{ fontSize: 12, color: T.texteDoux, marginTop: 3, lineHeight: 1.5 }}>{it.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Slide3() {
  return (
    <div style={{
      padding: '40px 22px 30px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 22 }}>
        <span style={{ padding: '6px 12px', borderRadius: 999, background: T.primaryLight, color: T.primary, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          ✓ Accessible à tous, gratuitement
        </span>
        <span style={{ padding: '6px 12px', borderRadius: 999, background: '#EAF3E6', color: '#5B8A4A', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          ✓ Local &amp; indépendant
        </span>
        <span style={{ padding: '6px 12px', borderRadius: 999, background: '#FFF0E5', color: T.accent, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          ✓ Construit avec vous
        </span>
      </div>
      <h2 style={{
        margin: '0 0 14px',
        fontFamily: 'var(--font-display), Georgia, serif',
        fontSize: 30, color: T.texte, letterSpacing: '-0.02em', lineHeight: 1.05,
      }}>Tout le monde<br />peut participer.</h2>
      <p style={{ margin: '0 0 14px', fontSize: 14, color: T.texteDoux, lineHeight: 1.6, maxWidth: 320 }}>
        L&apos;application est{' '}
        <strong style={{ color: T.texte, fontWeight: 800 }}>entièrement accessible gratuitement</strong>.
        Et quelques options premium en bonus, pour qui souhaite aller plus loin.
      </p>
      <p style={{
        margin: 0,
        fontFamily: 'var(--font-hand), Caveat, cursive', fontWeight: 500,
        fontSize: 20, color: T.primary, lineHeight: 1.1,
      }}>
        L&apos;application dont vous êtes<br />le hérault.
      </p>
    </div>
  )
}

export default function WelcomeModal({ onClose }: Props) {
  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(false)
  const slides = [Slide1, Slide2, Slide3]
  const Slide = slides[idx]
  const isLast = idx === slides.length - 1

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [])

  const dismiss = () => {
    setVisible(false)
    setTimeout(onClose, 250)
  }

  // Swipe gestures
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const onTouchStart = (e: React.TouchEvent) => setTouchStartX(e.touches[0].clientX)
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX == null) return
    const dx = e.changedTouches[0].clientX - touchStartX
    if (Math.abs(dx) > 50) {
      if (dx < 0 && idx < slides.length - 1) setIdx(idx + 1)
      else if (dx > 0 && idx > 0) setIdx(idx - 1)
    }
    setTouchStartX(null)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1500,
        background: visible ? 'rgba(26,18,9,0.55)' : 'rgba(26,18,9,0)',
        backdropFilter: visible ? 'blur(4px)' : 'none',
        transition: 'background-color 0.25s, backdrop-filter 0.25s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, fontFamily: 'var(--font-body), sans-serif',
      }}
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 420, maxHeight: '88%',
          background: T.white, borderRadius: 22,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.96)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s',
        }}
      >
        {/* Skip top-right */}
        <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 10 }}>
          <button
            onClick={dismiss}
            style={{
              background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(6px)',
              border: `1px solid ${T.bordSoft}`,
              padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: T.texteDoux,
            }}
          >
            Passer
          </button>
        </div>

        {/* Slide content (scrollable) */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <Slide />
        </div>

        {/* Dots + CTA */}
        <div style={{ padding: '14px 22px 22px', borderTop: `1px solid ${T.bordSoft}`, background: T.white }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 14 }}>
            {slides.map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === idx ? 22 : 6, height: 6, borderRadius: 999,
                  background: i === idx ? T.primary : '#D8D0C8',
                  transition: 'all 0.18s',
                }}
              />
            ))}
          </div>

          <button
            onClick={() => (isLast ? dismiss() : setIdx(i => Math.min(i + 1, slides.length - 1)))}
            style={{
              width: '100%', padding: '14px', borderRadius: 14,
              background: T.primary, color: '#fff', border: 'none',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 3px 12px rgba(45,90,61,0.25)',
              fontFamily: 'var(--font-body), sans-serif',
            }}
          >
            {isLast ? "C'est parti !" : 'Suivant'}
            {!isLast && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="13 6 19 12 13 18" />
              </svg>
            )}
          </button>
          {idx > 0 && !isLast && (
            <button
              onClick={() => setIdx(i => Math.max(i - 1, 0))}
              style={{
                width: '100%', marginTop: 6, padding: '10px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, color: T.texteDoux,
                fontFamily: 'var(--font-body), sans-serif',
              }}
            >
              ← Retour
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
