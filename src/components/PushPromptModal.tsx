'use client'
import { useEffect, useState } from 'react'
import ClientPortal from '@/components/ClientPortal'
import { usePushNotifications } from '@/hooks/usePushNotifications'

/**
 * Pop-up d'incitation à activer les notifications push.
 * Monté sur /profil (ProfilHybridView) ET à l'ouverture des notifs
 * (NotificationsView). S'auto-affiche si éligible :
 *   - push supporté mais pas activé ('off'), ou iOS à installer ('ios-needs-install')
 *   - jamais activé auparavant + pas en période de snooze
 * « Plus tard » (ou ✕) ré-arme pour ~2 semaines ; l'activation le clôt pour de bon.
 */
const DONE_KEY = 'pdv-push-prompt-done'
const SNOOZE_KEY = 'pdv-push-prompt-snooze'
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000

export default function PushPromptModal() {
  const { state, busy, enable } = usePushNotifications()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (state === 'loading') return
    if (state !== 'off' && state !== 'ios-needs-install') return   // déjà activé / refusé / non supporté
    try {
      if (localStorage.getItem(DONE_KEY)) return
      const snooze = Number(localStorage.getItem(SNOOZE_KEY) || 0)
      if (Date.now() < snooze) return
    } catch { /* localStorage indispo → on n'insiste pas */ return }
    setOpen(true)
  }, [state])

  if (!open) return null

  const iosInstall = state === 'ios-needs-install'

  const later = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)) } catch { /* noop */ }
    setOpen(false)
  }

  const act = async () => {
    if (iosInstall) { window.location.href = '/app'; return }
    const ok = await enable()
    if (ok) { try { localStorage.setItem(DONE_KEY, '1') } catch { /* noop */ } }
    setOpen(false)
  }

  return (
    <ClientPortal>
      <div
        onClick={later}
        style={{ position: 'fixed', inset: 0, zIndex: 3500, background: 'rgba(26,18,9,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, fontFamily: 'var(--font-jakarta), sans-serif' }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{ width: '100%', maxWidth: 360, background: '#FBF1DD', borderRadius: 22, padding: '22px 20px 18px', boxShadow: '0 18px 50px rgba(26,18,9,0.35)', textAlign: 'center', position: 'relative' }}
        >
          <button
            onClick={later}
            aria-label="Fermer"
            style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: '#A2937F', fontSize: 18, lineHeight: 1, padding: 4 }}
          >✕</button>

          <div style={{ width: 60, height: 60, margin: '4px auto 14px', borderRadius: 18, background: '#3E7A52', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>
            {iosInstall ? '📲' : '🔔'}
          </div>

          <h2 style={{ margin: '0 0 8px', fontFamily: 'var(--font-dm-serif), Georgia, serif', fontSize: 21, color: '#2E211A', lineHeight: 1.2 }}>
            {iosInstall ? "Installez l'app" : 'Activez les notifications'}
          </h2>
          <p style={{ margin: '0 0 18px', fontSize: 13.5, lineHeight: 1.5, color: '#6E6256' }}>
            {iosInstall
              ? "La Place du Village est sur le store ! Ajoutez l'app à votre écran d'accueil pour recevoir vos messages et notifications."
              : "L'app est maintenant sur le store ! Activez les notifications pour profiter pleinement des messages et discussions — votre téléphone vous prévient en direct."}
          </p>

          <button
            onClick={act}
            disabled={busy}
            style={{ width: '100%', boxSizing: 'border-box', padding: '13px 18px', background: '#C14A2B', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? '…' : iosInstall ? "Installer l'app" : 'Activer les notifications'}
          </button>
          <button
            onClick={later}
            style={{ width: '100%', marginTop: 8, padding: '11px 18px', background: 'transparent', color: '#8A7D70', border: 'none', borderRadius: 14, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
          >
            Plus tard
          </button>
        </div>
      </div>
    </ClientPortal>
  )
}
