'use client'
import { useEffect, useState } from 'react'

// ── URLs & assets (faciles à modifier) ───────────────────────────────────
const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.laplaceduvillage'
const SITE_URL = '/'                          // site normal (même origine)
const IOS_TUTO_IMG = '/app-ios-tutorial.webp'  // image tuto 3 étapes (public/), WebP optimisé

// ── Couleurs marque ───────────────────────────────────────────────────────
const CREAM = '#FBF1DD'
const TERRA = '#C14A2B'
const GREEN = '#3E7A52'
const INK = '#2E211A'

type Phase = 'detecting' | 'ios' | 'ios-inapp' | 'redirect'

// Les 3 étapes en texte (fallback si l'image ne charge pas + accessibilité)
const STEPS: { title: React.ReactNode; text: React.ReactNode }[] = [
  { title: <>Ouvrez <strong style={{ color: GREEN }}>Safari</strong></>, text: <>puis rendez-vous sur <strong style={{ color: TERRA }}>laplaceduvillage.app</strong></> },
  { title: <>Appuyez sur <strong style={{ color: TERRA }}>Partager</strong></>, text: <>le bouton de partage en bas de Safari</> },
  { title: <>« <strong>Sur l&apos;écran d&apos;accueil</strong> »</>, text: <>faites défiler puis touchez cette option</> },
]

export default function AppRedirect() {
  const [phase, setPhase] = useState<Phase>('detecting')
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    const nav = navigator
    const ua = nav.userAgent || ''

    // 1. Déjà dans l'app (TWA / PWA installée) → contenu normal, jamais le Play Store.
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (nav as { standalone?: boolean }).standalone === true
    if (standalone) { window.location.replace(SITE_URL); return }

    // 2. iOS (iPhone/iPad, dont iPadOS 13+ qui se présente comme un Mac).
    const isIOS = /iphone|ipad|ipod/i.test(ua)
      || (/Macintosh/i.test(ua) && nav.maxTouchPoints > 1)
    const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|Twitter|TikTok|musical_ly|Pinterest|LinkedInApp|WhatsApp/i.test(ua)

    if (isIOS) {
      // PAS de redirection : on reste sur la page pour que l'utilisateur lise le tuto.
      setPhase(inApp ? 'ios-inapp' : 'ios')
      return
    }

    // 3. Android → Play Store (la TWA).
    if (/android/i.test(ua)) { setPhase('redirect'); window.location.href = PLAY_URL; return }

    // 4. Desktop / autre → site normal.
    setPhase('redirect')
    window.location.replace(SITE_URL)
  }, [])

  // ── styles partagés ──
  const btnPrimary: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    width: '100%', boxSizing: 'border-box', padding: '14px 18px',
    background: TERRA, color: '#fff', borderRadius: 14, border: 'none',
    fontSize: 15, fontWeight: 700, textDecoration: 'none', cursor: 'pointer',
  }
  const btnGhost: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', boxSizing: 'border-box', padding: '13px 18px',
    background: 'transparent', color: GREEN, borderRadius: 14,
    border: `1.5px solid ${GREEN}`,
    fontSize: 14.5, fontWeight: 700, textDecoration: 'none', cursor: 'pointer',
  }

  const playSvg = (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.6 2.3 13 11.7l-2.7 2.7L3.1 3.4a1 1 0 0 1 .5-1.1Zm10.8 10.8 2.6 2.6-9.8 5.6a1 1 0 0 1-1.1-.1l8.3-8.1Zm3.9-2.2 2.6 1.5c.7.4.7 1.4 0 1.8l-2.6 1.5-2.9-2.4 2.9-2.4ZM4.5 1.9l9.9 5.7-2.6 2.6-7.8-7.8a1 1 0 0 1 .5-.5Z" /></svg>
  )

  const fallbackButtons = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
      <a href={PLAY_URL} target="_blank" rel="noopener noreferrer" style={btnPrimary}>{playSvg} Voir sur Google Play</a>
      <a href={SITE_URL} style={btnGhost}>Ouvrir le site</a>
    </div>
  )

  return (
    <div style={{
      minHeight: '100dvh', background: CREAM, color: INK,
      fontFamily: 'var(--font-jakarta), sans-serif',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: 'max(22px, env(safe-area-inset-top, 22px)) 16px max(22px, env(safe-area-inset-bottom, 22px))',
    }}>
      <div style={{ width: '100%', maxWidth: 520, margin: 'auto 0' }}>
        {/* En-tête marque */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, justifyContent: 'center', marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={40} height={40} style={{ borderRadius: 10 }} />
          <span style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif', fontSize: 20, color: INK }}>La Place du Village</span>
        </div>

        <div style={{ background: '#fff', borderRadius: 22, boxShadow: '0 10px 36px rgba(46,33,26,0.10)', padding: '22px 20px' }}>

          {phase === 'detecting' && (
            <p style={{ textAlign: 'center', color: '#8A7D70', fontSize: 14, margin: '24px 0' }}>Un instant…</p>
          )}

          {phase === 'redirect' && (
            <>
              <p style={{ textAlign: 'center', color: '#8A7D70', fontSize: 14, margin: '8px 0 0' }}>Redirection en cours…</p>
              {fallbackButtons}
            </>
          )}

          {(phase === 'ios' || phase === 'ios-inapp') && (
            <>
              {phase === 'ios-inapp' && (
                <div style={{ background: '#FCE9E2', border: `1.5px solid ${TERRA}`, borderRadius: 14, padding: '13px 15px', marginBottom: 18 }}>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 14.5, color: TERRA }}>Ouvrez d&apos;abord cette page dans Safari</p>
                  <p style={{ margin: '5px 0 0', fontSize: 13, lineHeight: 1.5, color: INK }}>
                    L&apos;ajout à l&apos;écran d&apos;accueil ne fonctionne que dans Safari. Touchez le menu <strong>•••</strong> (ou <strong>Partager</strong>) puis <strong>« Ouvrir dans Safari »</strong>, et suivez les étapes ci-dessous.
                  </p>
                </div>
              )}

              <h1 style={{ margin: '0 0 4px', textAlign: 'center', fontFamily: 'var(--font-dm-serif), Georgia, serif', fontSize: 22, color: INK }}>
                Ajoutez l&apos;app sur votre iPhone
              </h1>
              <p style={{ margin: '0 0 16px', textAlign: 'center', fontSize: 13.5, color: '#8A7D70' }}>
                En 3 étapes, gratuit, depuis Safari.
              </p>

              {/* Image tuto 3 étapes — tap pour agrandir (lightbox) */}
              <button
                type="button"
                onClick={() => setZoomed(true)}
                aria-label="Agrandir le tutoriel en plein écran"
                style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={IOS_TUTO_IMG}
                  alt="Tutoriel : 1. Ouvrez Safari sur laplaceduvillage.app — 2. Appuyez sur le bouton Partager — 3. Faites défiler puis touchez « Sur l'écran d'accueil »"
                  style={{ width: '100%', height: 'auto', borderRadius: 14, display: 'block', border: '1px solid #F0E7D4' }}
                />
              </button>
              <p style={{ margin: '7px 0 0', textAlign: 'center', fontSize: 12, color: '#A2937F' }}>
                Touchez l&apos;image pour l&apos;agrandir
              </p>

              {/* Fallback texte des 3 étapes (si l'image ne charge pas + a11y) */}
              <ol style={{ listStyle: 'none', margin: '18px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {STEPS.map((s, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 13, background: GREEN, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>{i + 1}</span>
                    <span style={{ fontSize: 14.5, lineHeight: 1.4 }}>
                      <span style={{ display: 'block', fontWeight: 700 }}>{s.title}</span>
                      <span style={{ display: 'block', color: '#6E6256', fontSize: 13.5 }}>{s.text}</span>
                    </span>
                  </li>
                ))}
              </ol>

              {fallbackButtons}
            </>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#A2937F', margin: '16px 0 0' }}>
          Tout ce qui se passe près de chez vous.
        </p>
      </div>

      {/* Lightbox : image en plein écran, tap pour fermer + pinch-zoom natif */}
      {zoomed && (
        <div
          onClick={() => setZoomed(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Tutoriel agrandi"
          style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,0.92)', overflow: 'auto', WebkitOverflowScrolling: 'touch', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '14px' }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setZoomed(false) }}
            aria-label="Fermer"
            style={{ position: 'fixed', top: 'max(12px, env(safe-area-inset-top, 12px))', right: 14, width: 38, height: 38, borderRadius: 19, background: 'rgba(255,255,255,0.16)', color: '#fff', border: 'none', fontSize: 20, lineHeight: 1, cursor: 'pointer', backdropFilter: 'blur(4px)', zIndex: 1 }}
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={IOS_TUTO_IMG}
            alt="Tutoriel agrandi : ajouter La Place du Village à l'écran d'accueil iPhone"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 900, height: 'auto', borderRadius: 10, margin: 'auto 0' }}
          />
        </div>
      )}
    </div>
  )
}
