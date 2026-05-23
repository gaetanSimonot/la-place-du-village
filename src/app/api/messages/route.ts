import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/server-auth'

/**
 * GET /api/messages — boîte de réception unifiée (annonces + covoit +
 * support + ami) en 1 round-trip HTTP côté client.
 *
 * Avant : MessagesClient lançait Promise.allSettled(ADAPTERS.map(fetch))
 * = 4 requêtes parallèles depuis le client. Maintenant : 1 fetch
 * /api/messages, le serveur fait les 4 fetch internes Vercel→Vercel
 * (overhead ~10-20ms) et merge.
 *
 * PERSO → Cache-Control: private, no-store. Pas de CDN.
 */

interface RawConv {
  id: string
  updated_at: string
  last_message: { content: string; created_at: string } | null
  unread_count: number
}
interface AnnonceConv extends RawConv {
  annonce: { id: string; titre: string | null } | null
  other:   { display_name: string | null; avatar_url: string | null } | null
}
interface CovoitConv extends RawConv {
  covoit: { id: string; depart: string; destination: string; date_trajet: string } | null
  other:  { display_name: string | null; avatar_url: string | null } | null
}
interface SupportConv extends RawConv {
  subject: string | null
}
interface FriendConv extends RawConv {
  kind: 'friend'
  other_member: { user_id: string; display_name: string | null; avatar_url: string | null; ville: string | null } | null
}

type Source = 'annonce' | 'covoit' | 'support' | 'friend'
const SOURCE_LABEL: Record<Source, string> = {
  annonce: 'Annonce', covoit: 'Covoit', support: 'Support', friend: 'Ami',
}

interface UnifiedConversation {
  id: string; source: Source
  title: string; subtitle: string | null
  otherName: string | null; otherAvatar: string | null
  lastMessage: { content: string; createdAt: string } | null
  unreadCount: number
  updatedAt: string
  href: string
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  // On forward le header Authorization aux routes internes — sinon elles
  // rejettent avec 401 (chacune fait son propre requireUser).
  const auth = req.headers.get('Authorization')
  if (!auth) return NextResponse.json({ error: 'Authorization manquant' }, { status: 401 })
  const origin = new URL(req.url).origin
  const fwd = { headers: { Authorization: auth } }

  const [annoncesRes, covoitsRes, supportRes, friendsRes] = await Promise.allSettled([
    fetch(`${origin}/api/annonces/mes-conversations`, fwd),
    fetch(`${origin}/api/covoiturages/conversations`, fwd),
    fetch(`${origin}/api/support/conversations`, fwd),
    fetch(`${origin}/api/conversations?kind=friend`, fwd),
  ])

  const conversations: UnifiedConversation[] = []
  const errors: string[] = []

  async function readOK(r: PromiseSettledResult<Response>, src: Source): Promise<unknown | null> {
    if (r.status !== 'fulfilled') {
      errors.push(`${SOURCE_LABEL[src]} : ${r.reason instanceof Error ? r.reason.message : 'Erreur'}`)
      return null
    }
    if (!r.value.ok) {
      errors.push(`${SOURCE_LABEL[src]} : HTTP ${r.value.status}`)
      return null
    }
    return r.value.json().catch(() => null)
  }

  const annoncesData = await readOK(annoncesRes, 'annonce')
  const covoitsData  = await readOK(covoitsRes,  'covoit')
  const supportData  = await readOK(supportRes,  'support')
  const friendsData  = await readOK(friendsRes,  'friend')

  for (const c of (annoncesData as { conversations?: AnnonceConv[] } | null)?.conversations ?? []) {
    conversations.push({
      id: c.id, source: 'annonce',
      title: c.annonce?.titre ?? 'Annonce supprimée',
      subtitle: null,
      otherName: c.other?.display_name ?? null,
      otherAvatar: c.other?.avatar_url ?? null,
      lastMessage: c.last_message ? { content: c.last_message.content, createdAt: c.last_message.created_at } : null,
      unreadCount: c.unread_count ?? 0,
      updatedAt: c.updated_at,
      href: `/annonces/conversations/${c.id}`,
    })
  }
  for (const c of (covoitsData as { conversations?: CovoitConv[] } | null)?.conversations ?? []) {
    conversations.push({
      id: c.id, source: 'covoit',
      title: c.covoit ? `${c.covoit.depart} → ${c.covoit.destination}` : 'Trajet supprimé',
      subtitle: c.covoit?.date_trajet ?? null,
      otherName: c.other?.display_name ?? null,
      otherAvatar: c.other?.avatar_url ?? null,
      lastMessage: c.last_message ? { content: c.last_message.content, createdAt: c.last_message.created_at } : null,
      unreadCount: c.unread_count ?? 0,
      updatedAt: c.updated_at,
      href: `/covoiturage/conversations/${c.id}`,
    })
  }
  for (const c of (supportData as { conversations?: SupportConv[] } | null)?.conversations ?? []) {
    conversations.push({
      id: c.id, source: 'support',
      title: c.subject ?? 'Ticket support',
      subtitle: null,
      otherName: 'Équipe La Place du Village',
      otherAvatar: null,
      lastMessage: c.last_message ? { content: c.last_message.content, createdAt: c.last_message.created_at } : null,
      unreadCount: c.unread_count ?? 0,
      updatedAt: c.updated_at,
      href: `/support/${c.id}`,
    })
  }
  for (const c of (friendsData as { conversations?: FriendConv[] } | null)?.conversations ?? []) {
    conversations.push({
      id: c.id, source: 'friend',
      title: c.other_member?.display_name ?? 'Ami',
      subtitle: c.other_member?.ville ?? null,
      otherName: c.other_member?.display_name ?? null,
      otherAvatar: c.other_member?.avatar_url ?? null,
      lastMessage: c.last_message ? { content: c.last_message.content, createdAt: c.last_message.created_at } : null,
      unreadCount: c.unread_count ?? 0,
      updatedAt: c.updated_at,
      href: `/conversations/${c.id}`,
    })
  }

  conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return NextResponse.json({ conversations, errors }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
