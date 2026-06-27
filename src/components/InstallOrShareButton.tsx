'use client'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * Bouton dynamique haut-droite de la home : Partager OU Installer selon le
 * contexte. Isolé — ne dépend que d'un callback `onShare` (le partage existant).
 *
 *  - PWA installée (standalone) ............... bouton Partager
 *  - flag 'pwa_install_dismissed' posé ........ bouton Partager
 *  - Safari iOS (navigateur) .................. bouton Installer → modale instructions iOS
 *  - Chrome Android (beforeinstallprompt) ..... bouton Installer → prompt natif
 *  - Desktop / autres ......................... bouton Partager
 */

type DeferredPrompt = { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
type Mode = 'share' | 'install-ios' | 'install-android'

const DISMISS_KEY = 'pwa_install_dismissed'
// Partage = icône plate (comme loupe/menu) ; Installer = pastille encadrée verte qui ressort.
const BTN_PLAIN = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-texte'
const BTN_INSTALL = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#2D5A3D] bg-white text-[#2D5A3D] shadow-[0_1px_2px_rgba(44,28,16,0.04)]'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as { standalone?: boolean }).standalone === true
}

export default function InstallOrShareButton({ onShare }: { onShare: () => void }) {
  const [mode, setMode] = useState<Mode>('share')
  const [iosModal, setIosModal] = useState(false)
  const promptRef = useRef<DeferredPrompt | null>(null)

  useEffect(() => {
    // Déjà en PWA, ou l'user a déclaré l'avoir installée → simple partage.
    if (isStandalone()) return
    try { if (localStorage.getItem(DISMISS_KEY) === '1') return } catch { /* localStorage off */ }

    const ua = navigator.userAgent
    const isIOS = /iphone|ipad|ipod/i.test(ua)
      // iPadOS 13+ se présente comme un Mac : on le rattrape via le tactile.
      || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
    if (isIOS) { setMode('install-ios'); return }

    // Chrome Android & co : si le prompt natif est dispo, on propose Installer.
    const early = (window as unknown as { __pwaPrompt?: DeferredPrompt }).__pwaPrompt
    if (early) { promptRef.current = early; setMode('install-android') }

    const onBip = (e: Event) => {
      e.preventDefault()
      promptRef.current = e as unknown as DeferredPrompt
      setMode('install-android')
    }
    const onInstalled = () => { promptRef.current = null; setMode('share') }
    window.addEventListener('beforeinstallprompt', onBip)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const markInstalled = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    setIosModal(false)
    setMode('share')
  }

  const handleClick = async () => {
    if (mode === 'share') { onShare(); return }
    if (mode === 'install-ios') { setIosModal(true); return }
    // install-android : déclenche la mini-popup native
    const p = promptRef.current
    if (!p) { onShare(); return }
    try { await p.prompt(); await p.userChoice } catch { /* ignore */ }
    promptRef.current = null
    setMode('share')
  }

  const installing = mode !== 'share'

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={installing ? "Installer l'app" : "Partager l'app"}
        className={installing ? BTN_INSTALL : BTN_PLAIN}
      >
        {installing ? <IconInstall /> : <IconShare />}
      </button>
      {iosModal && <IosInstallModal onClose={() => setIosModal(false)} onAlreadyInstalled={markInstalled} />}
    </>
  )
}

function IconShare() {
  // Flèche « partager / transférer » orientée vers la droite (≠ télécharger).
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 17 20 12 15 7" />
      <path d="M4 18v-1a5 5 0 0 1 5-5h11" />
    </svg>
  )
}

function IconInstall() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <polyline points="8 11 12 15 16 11" />
      <path d="M5 21h14a2 2 0 0 0 2-2v-2M3 17v2a2 2 0 0 0 2 2" />
    </svg>
  )
}

/** Glyphe « Partager » iOS (carré + flèche montante) pour les instructions. */
function IconIosShare() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A84FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12" />
      <polyline points="8 8 12 4 16 8" />
      <path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
    </svg>
  )
}

function IosInstallModal({ onClose, onAlreadyInstalled }: { onClose: () => void; onAlreadyInstalled: () => void }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 3800, backgroundColor: 'rgba(15,10,5,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: 'var(--font-body), sans-serif' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, backgroundColor: '#fff', borderRadius: '24px 24px 0 0', padding: '8px 20px 24px', paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))' }}
      >
        <div style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '8px auto 16px' }} />

        <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, color: '#1A1209', textAlign: 'center' }}>
          Installer La Place du Village
        </h2>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: '#7A6A5A', textAlign: 'center', lineHeight: 1.5 }}>
          Ajoutez l&apos;app à votre écran d&apos;accueil pour un accès direct, en plein écran.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Step n={1} icon={<IconIosShare />}>
            Appuyez sur l&apos;icône <strong>Partager</strong> en bas de Safari.
          </Step>
          <Step n={2} icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A84FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="4" /><line x1="12" y1="9" x2="12" y2="15" /><line x1="9" y1="12" x2="15" y2="12" /></svg>
          }>
            Choisissez <strong>« Sur l&apos;écran d&apos;accueil »</strong>.
          </Step>
        </div>

        <button
          onClick={onClose}
          style={{ width: '100%', marginTop: 20, padding: '13px', borderRadius: 14, border: 'none', backgroundColor: '#2D5A3D', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Compris
        </button>

        <button
          onClick={onAlreadyInstalled}
          style={{ display: 'block', margin: '10px auto 0', padding: '6px 12px', background: 'none', border: 'none', fontSize: 12, color: '#9A8A7A', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}
        >
          Je l&apos;ai déjà installé
        </button>
      </div>
    </div>,
    document.body,
  )
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 14, backgroundColor: '#F7F4EE', border: '1px solid #F0EAE0' }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', backgroundColor: '#2D5A3D', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{n}</div>
      <p style={{ flex: 1, margin: 0, fontSize: 13, color: '#3C2C20', lineHeight: 1.45 }}>{children}</p>
      <span style={{ flexShrink: 0 }}>{icon}</span>
    </div>
  )
}
