'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

/** Convertit la clé VAPID base64url en Uint8Array (format attendu par subscribe). */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

async function authToken(): Promise<string | undefined> {
  await supabase.auth.refreshSession().catch(() => {})
  return (await supabase.auth.getSession()).data.session?.access_token
}

type State = 'loading' | 'unsupported' | 'ios-needs-install' | 'denied' | 'off' | 'on'

export default function PushToggle() {
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return
    const ua = navigator.userAgent
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as { standalone?: boolean }).standalone === true

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      // iOS < 16.4 ou Safari onglet : le push web n'existe pas hors PWA installée.
      setState(isIOS && !standalone ? 'ios-needs-install' : 'unsupported')
      return
    }
    if (isIOS && !standalone) { setState('ios-needs-install'); return }
    if (Notification.permission === 'denied') { setState('denied'); return }

    const reg = await navigator.serviceWorker.ready.catch(() => null)
    const sub = reg ? await reg.pushManager.getSubscription() : null
    setState(sub ? 'on' : 'off')
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const enable = async () => {
    if (busy) return
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
      })
      const tk = await authToken()
      const r = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      setState('on')
      toast.success('Notifications activées 🔔')
    } catch (e) {
      console.error('[push] enable failed', e)
      toast.error("Impossible d'activer les notifications")
      void refresh()
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    if (busy) return
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const tk = await authToken()
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {})
        await sub.unsubscribe().catch(() => {})
      }
      setState('off')
      toast.success('Notifications désactivées')
    } catch {
      void refresh()
    } finally {
      setBusy(false)
    }
  }

  // ── Rendu ──
  const card: React.CSSProperties = {
    background: '#fff', borderRadius: 16, padding: '14px 16px',
    border: '1px solid #EFE7D6', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', gap: 12,
  }
  const title = <span style={{ fontWeight: 700, fontSize: 14.5, color: '#2E211A' }}>🔔 Notifications push</span>
  const sub = (txt: string) => <span style={{ display: 'block', fontSize: 12.5, color: '#8A7D70', marginTop: 2 }}>{txt}</span>

  if (state === 'loading') return null

  if (state === 'unsupported') {
    return <div style={card}><span>{title}{sub('Non supporté par ce navigateur.')}</span></div>
  }
  if (state === 'ios-needs-install') {
    return (
      <div style={card}>
        <span>{title}{sub("Sur iPhone : ajoute d'abord l'app à l'écran d'accueil, puis reviens ici.")}</span>
        <a href="/app" style={{ flexShrink: 0, textDecoration: 'none', background: '#3E7A52', color: '#fff', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, fontWeight: 700 }}>Installer</a>
      </div>
    )
  }
  if (state === 'denied') {
    return <div style={card}><span>{title}{sub('Bloquées. Réautorise-les dans les réglages du navigateur pour ce site.')}</span></div>
  }

  const on = state === 'on'
  return (
    <div style={card}>
      <span>{title}{sub(on ? 'Activées sur cet appareil.' : 'Fais sonner ton téléphone pour les messages et notifs.')}</span>
      <button
        onClick={on ? disable : enable}
        disabled={busy}
        style={{
          flexShrink: 0, border: 'none', cursor: busy ? 'default' : 'pointer',
          borderRadius: 999, padding: '9px 16px', fontSize: 13, fontWeight: 700,
          background: on ? '#F2EAD9' : '#C14A2B', color: on ? '#6E6256' : '#fff',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? '…' : on ? 'Désactiver' : 'Activer'}
      </button>
    </div>
  )
}
