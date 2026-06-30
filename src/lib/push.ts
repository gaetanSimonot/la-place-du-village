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
 *  - Routage du deep-link basé sur `type` (le champ `target_type` a une
 *    contrainte CHECK et n'est pas fiable comme clé de routage).
 */

import webpush from 'web-push'
import { supabaseAdmin } from '@/lib/supabase-admin'

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

/** URL de deep-link : on s'appuie sur target_type+target_id quand ils sont
 *  exploitables, sinon fallback raisonnable. */
function deepLink(p: NotifPayload, fallback: string): string {
  const id = p.target_id
  switch (p.target_type) {
    case 'etablissement': return id ? `/etablissement/${id}` : fallback
    case 'producer':      return id ? `/producteur/${id}` : fallback
    case 'event':         return id ? `/evenement/${id}` : fallback
    default:              return fallback
  }
}

/** Construit le contenu de la notif push à partir du `type` (sans CHECK, fiable). */
function pushContentFor(p: NotifPayload): PushContent {
  const name = p.actor_name || 'La Place du Village'
  const t = p.type || ''

  // Messages (amis / annonces / covoit / support) → boîte de réception unifiée.
  if (/message/i.test(t)) {
    return { title: name, body: 'vous a envoyé un message', url: '/messages', tag: `msg-${p.target_id ?? ''}` }
  }

  // Dictionnaire des phrases par type connu (fallback générique sinon).
  const map: Record<string, string> = {
    suivi_producteur: 'suit votre page',
    commentaire:      'a commenté votre page',
    nouveau_produit:  'propose un nouveau produit',
    disponibilite:    'a mis à jour ses disponibilités',
    friend_request:   "vous a envoyé une demande d'ami",
    friend_accept:    "a accepté votre demande d'ami",
    forum_comment:    'a répondu à votre sujet',
    like:             'a aimé votre publication',
  }
  const phrase = map[t]
  return {
    title: 'La Place du Village',
    body: phrase ? `${name} ${phrase}` : name,
    url: deepLink(p, t === 'friend_request' || t === 'friend_accept' ? '/people' : '/'),
    tag: p.target_id ? `${t}-${p.target_id}` : undefined,
  }
}

interface SubRow { id: string; endpoint: string; p256dh: string; auth: string }

/** Envoie un push à tous les appareils abonnés d'un user. Fail-safe. */
export async function sendPushToUser(userId: string, payload: NotifPayload): Promise<void> {
  try {
    if (!ensureConfigured()) return
    const { data: subs } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId)
    if (!subs?.length) return

    const content = pushContentFor(payload)
    const body = JSON.stringify(content)

    await Promise.all((subs as SubRow[]).map(async (s) => {
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
    }))
  } catch (e) {
    console.error('[push] sendPushToUser failed', e)
  }
}

/** Variante liste (ex. notifyUsers). Fail-safe, séquentiel léger par user. */
export async function sendPushToUsers(userIds: string[], payload: NotifPayload): Promise<void> {
  const ids = Array.from(new Set(userIds)).filter(Boolean)
  await Promise.all(ids.map(id => sendPushToUser(id, payload)))
}
