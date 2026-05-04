'use client'
import { useEffect, useState } from 'react'

let splashShown = false

export default function AppSplash({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(!splashShown)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (splashShown) { onDone(); return }
    const fade = setTimeout(() => setFading(true), 1800)
    const done = setTimeout(() => { splashShown = true; setVisible(false); onDone() }, 2150)
    return () => { clearTimeout(fade); clearTimeout(done) }
  }, [onDone])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      backgroundColor: '#FAF7F2',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: fading ? 0 : 1,
      transition: 'opacity 0.35s ease',
      pointerEvents: fading ? 'none' : 'auto',
    }}>
      <img
        src="/logo-animated.svg"
        width={156}
        height={156}
        alt="La Place du Village"
        style={{ display: 'block' }}
      />
      <div style={{ textAlign: 'center', marginTop: 26 }}>
        <p style={{
          fontFamily: '"Playfair Display", serif',
          fontWeight: 700,
          fontSize: 26,
          lineHeight: 1.25,
          color: '#1C1917',
          margin: 0,
          letterSpacing: '0.02em',
        }}>
          La Place du Village
        </p>
        <p style={{
          fontFamily: 'Lora, serif',
          fontWeight: 400,
          fontSize: 12,
          color: '#A09080',
          margin: '8px 0 0',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}>
          Ganges · Hérault
        </p>
      </div>
    </div>
  )
}
