'use client'
import { useState, useEffect } from 'react'

type DeferredPrompt = { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const INSTALL_DISMISSED_KEY = 'pdv-install-dismissed'

export default function InstallBanner() {
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredPrompt | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (sessionStorage.getItem(INSTALL_DISMISSED_KEY)) return

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window.navigator as { standalone?: boolean }).standalone
    setIsIOS(ios)

    const early = (window as unknown as { __pwaPrompt?: DeferredPrompt }).__pwaPrompt
    if (early) setDeferredPrompt(early)

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as unknown as DeferredPrompt)
    }
    window.addEventListener('beforeinstallprompt', handler)

    const t = ios ? setTimeout(() => setShow(true), 3000) : null

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      if (t) clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    if (!deferredPrompt) return
    if (sessionStorage.getItem(INSTALL_DISMISSED_KEY)) return
    if (window.matchMedia('(display-mode: standalone)').matches) return
    const t = setTimeout(() => setShow(true), 3000)
    return () => clearTimeout(t)
  }, [deferredPrompt])

  const dismiss = () => {
    sessionStorage.setItem(INSTALL_DISMISSED_KEY, '1')
    setShow(false)
  }

  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    dismiss()
  }

  if (!show || installed) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: 16, right: 16, zIndex: 1000,
      backgroundColor: '#fff', borderRadius: 20,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      padding: '16px 18px',
      fontFamily: 'Inter, sans-serif',
      animation: 'slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
    }}>
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:none } }`}</style>

      <button onClick={dismiss} style={{
        position: 'absolute', top: 12, right: 14,
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#B0A898', fontSize: 16, lineHeight: 1, padding: 4,
      }}>✕</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <img src="/logo.png" alt="" width={44} height={44} style={{ borderRadius: 10, flexShrink: 0 }} />
        <div>
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15, color: '#2C1810', margin: '0 0 2px' }}>
            La Place du Village
          </p>
          <p style={{ fontSize: 12, color: '#8A8A8A', margin: 0 }}>
            Installe l&apos;app pour retrouver tous les événements
          </p>
        </div>
      </div>

      {isIOS ? (
        <p style={{ fontSize: 12, color: '#5A5A5A', margin: 0, lineHeight: 1.5, backgroundColor: '#FAF7F2', borderRadius: 10, padding: '10px 12px' }}>
          Appuie sur <strong>↑ Partager</strong> en bas de Safari, puis <strong>&ldquo;Sur l&apos;écran d&apos;accueil&rdquo;</strong>
        </p>
      ) : (
        <button onClick={install} style={{
          width: '100%', padding: '12px',
          backgroundColor: '#C4622D', color: '#fff',
          border: 'none', borderRadius: 12, cursor: 'pointer',
          fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14,
        }}>
          Installer l&apos;app
        </button>
      )}
    </div>
  )
}
