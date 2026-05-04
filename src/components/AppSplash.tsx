'use client'
import { useEffect, useState } from 'react'

let splashShown = false

export default function AppSplash({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(!splashShown)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (splashShown) { onDone(); return }
    const fade = setTimeout(() => setFading(true), 1650)
    const done = setTimeout(() => { splashShown = true; setVisible(false); onDone() }, 2000)
    return () => { clearTimeout(fade); clearTimeout(done) }
  }, [onDone])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      backgroundColor: '#F4F0E7',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 24,
      opacity: fading ? 0 : 1,
      transition: 'opacity 0.35s ease',
      pointerEvents: fading ? 'none' : 'auto',
    }}>
      <img
        src="/logo-animated.svg"
        width={220}
        height={220}
        alt="La Place du Village"
        style={{ display: 'block' }}
      />
      <div style={{ textAlign: 'center' }}>
        <p style={{
          fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22,
          color: '#2C1810', margin: 0, letterSpacing: '-0.01em',
        }}>
          La Place du Village
        </p>
        <p style={{
          fontFamily: 'Inter, sans-serif', fontSize: 13,
          color: '#A09080', margin: '5px 0 0', letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          Ganges &amp; alentours
        </p>
      </div>
    </div>
  )
}
