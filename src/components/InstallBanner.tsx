'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

type DeferredPrompt = { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
type RelatedApp = { platform?: string; id?: string; url?: string }

const INSTALL_DISMISSED_KEY = 'pdv-install-dismissed'
const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.laplaceduvillage'

/** ios = instructions Safari · android = fiche Play Store · chrome = prompt PWA natif (desktop) */
type Mode = 'ios' | 'android' | 'chrome' | null

export default function InstallBanner() {
  const pathname = usePathname()
  const [show, setShow] = useState(false)
  const [mode, setMode] = useState<Mode>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredPrompt | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return   // déjà dans l'app (PWA/TWA)
    if (sessionStorage.getItem(INSTALL_DISMISSED_KEY)) return

    const ua = navigator.userAgent
    const ios = /iphone|ipad|ipod/i.test(ua) && !(window.navigator as { standalone?: boolean }).standalone
    const android = /android/i.test(ua)

    // iOS : pas de prompt natif possible → instructions « Sur l'écran d'accueil » (seul chemin d'install Apple).
    if (ios) {
      setMode('ios')
      const t = setTimeout(() => setShow(true), 3000)
      return () => clearTimeout(t)
    }

    // Android : on oriente vers le Play Store (la TWA). Chrome n'émet plus
    // beforeinstallprompt (prefer_related_applications), donc on gère le CTA nous-mêmes.
    if (android) {
      let cancelled = false
      let timer: ReturnType<typeof setTimeout> | null = null
      const arm = () => { if (!cancelled) { setMode('android'); timer = setTimeout(() => setShow(true), 3000) } }
      const getRel = (navigator as unknown as { getInstalledRelatedApps?: () => Promise<RelatedApp[]> }).getInstalledRelatedApps
      if (getRel) {
        getRel.call(navigator)
          .then(apps => { if (!cancelled && !(Array.isArray(apps) && apps.length > 0)) arm() })   // déjà installée → on ne re-propose pas
          .catch(() => arm())
      } else {
        arm()
      }
      return () => { cancelled = true; if (timer) clearTimeout(timer) }
    }

    // Desktop / autres : install PWA classique via beforeinstallprompt.
    const early = (window as unknown as { __pwaPrompt?: DeferredPrompt }).__pwaPrompt
    if (early) setDeferredPrompt(early)
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as unknown as DeferredPrompt)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if (!deferredPrompt) return
    if (sessionStorage.getItem(INSTALL_DISMISSED_KEY)) return
    if (window.matchMedia('(display-mode: standalone)').matches) return
    setMode('chrome')
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

  // La page d'aiguillage /app gère déjà l'install (QR de com) → pas de doublon.
  if (pathname === '/app' || !show || installed || !mode) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: 16, right: 16, zIndex: 1000,
      backgroundColor: '#fff', borderRadius: 20,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      padding: '16px 18px',
      fontFamily: 'var(--font-body), sans-serif',
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
          <p style={{ fontFamily: 'var(--font-body), sans-serif', fontWeight: 800, fontSize: 15, color: '#1A1209', letterSpacing: '-0.01em', margin: '0 0 2px' }}>
            La Place du Village
          </p>
          <p style={{ fontSize: 12, color: '#8A8A8A', margin: 0 }}>
            Installe l&apos;app pour retrouver tous les événements
          </p>
        </div>
      </div>

      {mode === 'ios' && (
        <p style={{ fontSize: 12, color: '#5A5A5A', margin: 0, lineHeight: 1.5, backgroundColor: '#FAF7F2', borderRadius: 10, padding: '10px 12px' }}>
          Appuie sur <strong>↑ Partager</strong> en bas de Safari, puis <strong>&ldquo;Sur l&apos;écran d&apos;accueil&rdquo;</strong>
        </p>
      )}

      {mode === 'android' && (
        <a href={PLAY_URL} target="_blank" rel="noopener noreferrer" onClick={dismiss} style={{
          width: '100%', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '12px',
          backgroundColor: '#C4622D', color: '#fff',
          border: 'none', borderRadius: 12, cursor: 'pointer',
          textDecoration: 'none',
          fontFamily: 'var(--font-body), sans-serif', fontWeight: 700, fontSize: 14,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.6 2.3 13 11.7l-2.7 2.7L3.1 3.4a1 1 0 0 1 .5-1.1Zm10.8 10.8 2.6 2.6-9.8 5.6a1 1 0 0 1-1.1-.1l8.3-8.1Zm3.9-2.2 2.6 1.5c.7.4.7 1.4 0 1.8l-2.6 1.5-2.9-2.4 2.9-2.4ZM4.5 1.9l9.9 5.7-2.6 2.6-7.8-7.8a1 1 0 0 1 .5-.5Z"/></svg>
          Télécharger sur Google Play
        </a>
      )}

      {mode === 'chrome' && (
        <button onClick={install} style={{
          width: '100%', padding: '12px',
          backgroundColor: '#C4622D', color: '#fff',
          border: 'none', borderRadius: 12, cursor: 'pointer',
          fontFamily: 'var(--font-body), sans-serif', fontWeight: 700, fontSize: 14,
        }}>
          Installer l&apos;app
        </button>
      )}
    </div>
  )
}
