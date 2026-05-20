'use client'
import { useEffect, useState } from 'react'

/**
 * AppSplash — affiché à chaque ouverture/montage de l'app (plus de cache
 * module-level). Durée totale courte (~1200ms) : 900ms d'affichage +
 * 300ms de fade-out.
 *
 * Logo : /logo.png (le nouveau village-pin) avec une petite anim CSS
 * scale + fade-in. Pas de wordmark trop chargé.
 */
export default function AppSplash({ onDone }: { onDone: () => void }) {
  const [fading, setFading] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const fade = setTimeout(() => setFading(true), 900)
    const done = setTimeout(() => { setHidden(true); onDone() }, 1200)
    return () => { clearTimeout(fade); clearTimeout(done) }
  }, [onDone])

  if (hidden) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        backgroundColor: '#FAF7F2',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        opacity: fading ? 0 : 1,
        transition: 'opacity 300ms ease-out',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <img
        src="/logo.png"
        width={148}
        height={148}
        alt="La Place du Village"
        className="pdv-splash-logo"
        style={{ display: 'block' }}
      />
      <p
        style={{
          fontFamily: 'var(--font-dm-serif), Georgia, serif',
          fontSize: 22,
          color: '#2D5A3D',
          margin: '18px 0 0',
          letterSpacing: '-0.01em',
          opacity: fading ? 0 : 1,
          transform: fading ? 'translateY(4px)' : 'translateY(0)',
          transition: 'opacity 300ms ease-out, transform 300ms ease-out',
        }}
      >
        La Place du Village
      </p>

      <style jsx>{`
        @keyframes pdvSplashIn {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
        .pdv-splash-logo {
          animation: pdvSplashIn 480ms cubic-bezier(0.2, 0.9, 0.3, 1.05) both;
        }
      `}</style>
    </div>
  )
}
