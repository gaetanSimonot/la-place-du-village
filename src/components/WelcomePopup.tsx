'use client'
import { useEffect, useState } from 'react'
import { useAuthModal } from '@/contexts/AuthModalContext'

export default function WelcomePopup({ onClose }: { onClose: () => void }) {
  const [visible, setVisible] = useState(false)
  const { openAuthModal } = useAuthModal()

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100)
    return () => clearTimeout(t)
  }, [])

  const dismiss = (cb?: () => void) => {
    setVisible(false)
    setTimeout(() => { onClose(); cb?.() }, 300)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1500,
        backgroundColor: visible ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0)',
        backdropFilter: visible ? 'blur(3px)' : 'none',
        transition: 'background-color 0.3s, backdrop-filter 0.3s',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 480,
          backgroundColor: '#FAF7F2',
          borderRadius: '24px 24px 0 0',
          padding: '32px 24px',
          paddingBottom: 'max(36px, env(safe-area-inset-bottom, 36px))',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Icon */}
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          backgroundColor: '#E8622A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20,
        }}>
          <svg width="30" height="30" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(256,256)">
              <polygon points="0,-110 90,-30 -90,-30" fill="#fff" opacity="0.95"/>
              <rect x="-60" y="-30" width="120" height="90" rx="6" fill="#fff" opacity="0.95"/>
              <rect x="-20" y="18" width="40" height="42" rx="4" fill="#E8622A"/>
              <rect x="-50" y="-10" width="24" height="22" rx="3" fill="#E8622A" opacity="0.7"/>
              <rect x="26" y="-10" width="24" height="22" rx="3" fill="#E8622A" opacity="0.7"/>
              <polygon points="-100,-50 -68,-50 -84,-70" fill="#fff" opacity="0.6"/>
              <rect x="-100" y="-50" width="32" height="30" rx="4" fill="#fff" opacity="0.6"/>
              <polygon points="68,-50 100,-50 84,-70" fill="#fff" opacity="0.6"/>
              <rect x="68" y="-50" width="32" height="30" rx="4" fill="#fff" opacity="0.6"/>
            </g>
          </svg>
        </div>

        <h2 style={{
          fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 24,
          color: '#1A1209', margin: '0 0 12px', letterSpacing: '-0.02em', lineHeight: 1.2,
        }}>
          Bienvenue sur la Place.
        </h2>

        <p style={{
          fontFamily: 'Inter, sans-serif', fontSize: 15, color: '#4A3728',
          lineHeight: 1.6, margin: '0 0 6px',
        }}>
          Découvrez et nourrissez l&apos;agenda de votre territoire.
        </p>

        <p style={{
          fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#7A6A5A',
          lineHeight: 1.6, margin: '0 0 32px', fontWeight: 500,
        }}>
          Gratuit. Local. Par et pour les gens d&apos;ici.
        </p>

        <button
          onClick={() => dismiss(openAuthModal)}
          style={{
            width: '100%', padding: '15px',
            backgroundColor: '#2D5A3D', color: '#fff',
            border: 'none', borderRadius: 14,
            fontSize: 15, fontWeight: 700,
            fontFamily: 'Inter, sans-serif',
            cursor: 'pointer', letterSpacing: '-0.01em',
            marginBottom: 14,
          }}
        >
          Se connecter
        </button>

        <button
          onClick={() => dismiss()}
          style={{
            display: 'block', width: '100%',
            background: 'none', border: 'none',
            fontSize: 13, color: '#9A8A7A',
            fontFamily: 'Inter, sans-serif',
            cursor: 'pointer', textAlign: 'center',
            padding: '4px 0',
          }}
        >
          Continuer sans se connecter →
        </button>
      </div>
    </div>
  )
}
