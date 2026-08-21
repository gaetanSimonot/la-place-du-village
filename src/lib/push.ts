/**
 * WEB PUSH — envoi serveur (VAPID + web-push).
 *
 * Appelé depuis les helpers de notification (server-auth.ts) : quand une notif
 * in-app est créée pour un user, on pousse aussi vers ses appareils abonnés.
 *
 * Principes :
 *  - FAIL-SAFE : ne jamais throw vers l'appelant (un push raté ne doit jamais
 *    casser l'action principale, ex. l'envoi d'un message).
 *  - HYGIÈNE : on supprime les abonnements morts (404/410 = désinstallé/expiré).
 *  - TEXTE ET DESTINATION : délégués à src/lib/notifRouting.ts, partagé avec
 *    l'écran in-app. Ce fichier avait autrefois son propre dictionnaire, resté
 *    en arrière : 33 types sur 40 arrivaient sans phrase et retombaient sur
 *    l'accueil. Ne jamais redéfinir un libellé ou une URL ici.
 */

import webpush from 'web-push'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notifPhrase, notifUrl } from '@/lib/notifRouting'

let configured = false
function ensureConfigured(): boolean {
  if (configured) return true
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:lettre@laplaceduvillage.app'
  if (!pub || !priv) {
    console.warn('[push] VAPID keys manquantes — push désactivé')
    return false
  }
  webpush.setVapidDetails(subject, pub, priv)
  configured = true
  return true
}

export interface NotifPayload {
  type: string
  actor_name: string
  target_type?: string
  target_id?: string
}

interface PushContent {
  title: string
  body: string
  url: string
  tag?: string
}

/**
 * Contenu de la notification affichée par le téléphone.
 *
 * Les messages privés mettent le nom de l'expéditeur en TITRE : c'est ce
 * qu'attend quelqu'un qui reçoit un message, et ça permet au tag de regrouper
 * une conversation. Tout le reste porte le nom de l'app en titre et la phrase
 * en corps, comme dans la liste in-app.
 */
function pushContentFor(p: NotifPayload): PushContent {
  const url = notifUrl(p)
  const tag = p.target_id ? `${p.type}-${p.target_id}` : undefined

  if (/message/i.test(p.type || '')) {
    return { title: p.actor_name || 'La Place du Village', body: notifPhrase(p), url, tag }
  }
  return { title: 'La Place du Village', body: notifPhrase(p), url, tag }
}

interface SubRow { id: string; endpoint: string; p256dh: string; auth: string }

/** Envoie un payload (déjà sérialisé) à un abonnement. Purge si mort (404/410). */
async function deliver(s: SubRow, body: string): Promise<void> {
  try {
    await webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      body,
    )
  } catch (err) {
    const code = (err as { statusCode?: number })?.statusCode
    // 404 / 410 = abonnement mort (app désinstallée, permission retirée) → purge.
    if (code === 404 || code === 410) {
      await supabaseAdmin.from('push_subscriptions').delete().eq('id', s.id)
    } else {
      console.error('[push] send failed', code, (err as Error)?.message)
    }
  }
}

/** Envoie un push à tous les appareils abonnés d'un user. Fail-safe. */
export async function sendPushToUser(userId: string, payload: NotifPayload): Promise<void> {
  try {
    if (!ensureConfigured()) return
    const { data: subs } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId)
    if (!subs?.length) return
    const body = JSON.stringify(pushContentFor(payload))
    await Promise.all((subs as SubRow[]).map(s => deliver(s, body)))
  } catch (e) {
    console.error('[push] sendPushToUser failed', e)
  }
}

/**
 * Variante liste / broadcast (notifyUsers, notifyByAudience, notifyAllUsers).
 * Récupère tous les abonnements en lots, puis envoie avec une concurrence
 * bornée (évite 1000 connexions simultanées sur un gros broadcast). Fail-safe.
 */
export async function sendPushToUsers(userIds: string[], payload: NotifPayload): Promise<void> {
  try {
    if (!ensureConfigured()) return
    const ids = Array.from(new Set(userIds)).filter(Boolean)
    if (!ids.length) return

    const subs: SubRow[] = []
    for (let i = 0; i < ids.length; i += 300) {   // chunk le IN(...) pour les grosses listes
      const { data } = await supabaseAdmin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .in('user_id', ids.slice(i, i + 300))
      if (data) subs.push(...(data as SubRow[]))
    }
    if (!subs.length) return

    const body = JSON.stringify(pushContentFor(payload))
    const CONCURRENCY = 20
    for (let i = 0; i < subs.length; i += CONCURRENCY) {
      await Promise.all(subs.slice(i, i + CONCURRENCY).map(s => deliver(s, body)))
    }
  } catch (e) {
    console.error('[push] sendPushToUsers failed', e)
  }
}
