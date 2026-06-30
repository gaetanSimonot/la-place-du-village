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

/**
 * loading       → état pas encore déterminé
 * unsupported   → navigateur sans push (desktop ancien, etc.)
 * ios-needs-install → iOS Safari non installé en PWA (push impossible tant que pas ajouté à l'écran d'accueil)
 * denied        → permission refusée (à réautoriser dans le navigateur)
 * off           → supporté, pas encore abonné
 * on            → abonné sur cet appareil
 */
export type PushState = 'loading' | 'unsupported' | 'ios-needs-install' | 'denied' | 'off' | 'on'

export function usePushNotifications() {
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return
    const ua = navigator.userAgent
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as { standalone?: boolean }).standalone === true

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
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

  /** Active le push sur cet appareil. Retourne true si abonné avec succès. */
  const enable = useCallback(async (): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return false }
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
      return true
    } catch (e) {
      console.error('[push] enable failed', e)
      toast.error("Impossible d'activer les notifications")
      void refresh()
      return false
    } finally {
      setBusy(false)
    }
  }, [busy, refresh])

  const disable = useCallback(async () => {
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
  }, [busy, refresh])

  return { state, busy, enable, disable, refresh }
}
