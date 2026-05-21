/**
 * INBOX ADAPTERS — boîte de réception unifiée (Soft).
 *
 * Chaque adapter fetch une source de conversations (annonces, covoit, support…)
 * et la convertit dans le format `UnifiedConversation`.
 *
 * Pour ajouter une nouvelle source (amis, tombola, rencontre…) :
 *   1. Crée un nouvel adapter dans ce fichier
 *   2. Ajoute-le dans `ADAPTERS`
 *   3. (optionnel) déclare son label + couleur dans SOURCE_META
 *
 * Le composant /messages/client.tsx itère sur ADAPTERS en parallèle et merge
 * les résultats. Pas de silo à ajouter ailleurs.
 */

export type Source = 'annonce' | 'covoit' | 'support' | 'friend'
// Quand on ajoutera : 'tombola' | 'rencontre' etc.

export interface UnifiedConversation {
  id:           string
  source:       Source
  title:        string                  // titre annonce / trajet / subject support
  subtitle:     string | null           // détail contextuel (commune, date, etc.)
  otherName:    string | null           // nom de l'autre membre (ou "Support" pour support)
  otherAvatar:  string | null
  lastMessage:  { content: string; createdAt: string } | null
  unreadCount:  number
  updatedAt:    string                  // pour le tri DESC
  href:         string                  // URL de la conv dans son contexte d'origine
}

export interface InboxAdapter {
  source: Source
  fetch:  (token: string) => Promise<UnifiedConversation[]>
}

// ─────────────────────────────────────────────────────────
// Métadonnées d'affichage par source (label + couleurs badge)
// ─────────────────────────────────────────────────────────

export const SOURCE_META: Record<Source, { label: string; badgeBg: string; badgeFg: string }> = {
  annonce: { label: 'Annonce', badgeBg: '#E8F2EB', badgeFg: '#2D5A3D' },
  covoit:  { label: 'Covoit',  badgeBg: '#EAF1F8', badgeFg: '#1E4D7E' },
  support: { label: 'Support', badgeBg: '#FFF1E5', badgeFg: '#C84B2F' },
  friend:  { label: 'Ami',     badgeBg: '#F0EBE3', badgeFg: '#7A6A5A' },
}

// ─────────────────────────────────────────────────────────
// Helpers communs
// ─────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`)
  return res.json()
}

// Types minimum requis sur chaque conversation pour le mapping
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
  kind:         'friend'
  other_member: { user_id: string; display_name: string | null; avatar_url: string | null; ville: string | null } | null
}

// ─────────────────────────────────────────────────────────
// Adapters
// ─────────────────────────────────────────────────────────

const annonceAdapter: InboxAdapter = {
  source: 'annonce',
  async fetch(token) {
    const data = await fetchJson<{ conversations: AnnonceConv[] }>('/api/annonces/mes-conversations', token)
    return (data.conversations ?? []).map(c => ({
      id:          c.id,
      source:      'annonce' as const,
      title:       c.annonce?.titre ?? 'Annonce supprimée',
      subtitle:    null,
      otherName:   c.other?.display_name ?? null,
      otherAvatar: c.other?.avatar_url ?? null,
      lastMessage: c.last_message ? { content: c.last_message.content, createdAt: c.last_message.created_at } : null,
      unreadCount: c.unread_count ?? 0,
      updatedAt:   c.updated_at,
      href:        `/annonces/conversations/${c.id}`,
    }))
  },
}

const covoitAdapter: InboxAdapter = {
  source: 'covoit',
  async fetch(token) {
    const data = await fetchJson<{ conversations: CovoitConv[] }>('/api/covoiturages/conversations', token)
    return (data.conversations ?? []).map(c => ({
      id:          c.id,
      source:      'covoit' as const,
      title:       c.covoit ? `${c.covoit.depart} → ${c.covoit.destination}` : 'Trajet supprimé',
      subtitle:    c.covoit?.date_trajet ?? null,
      otherName:   c.other?.display_name ?? null,
      otherAvatar: c.other?.avatar_url ?? null,
      lastMessage: c.last_message ? { content: c.last_message.content, createdAt: c.last_message.created_at } : null,
      unreadCount: c.unread_count ?? 0,
      updatedAt:   c.updated_at,
      href:        `/covoiturage/conversations/${c.id}`,
    }))
  },
}

const supportAdapter: InboxAdapter = {
  source: 'support',
  async fetch(token) {
    const data = await fetchJson<{ conversations: SupportConv[] }>('/api/support/conversations', token)
    return (data.conversations ?? []).map(c => ({
      id:          c.id,
      source:      'support' as const,
      title:       c.subject ?? 'Ticket support',
      subtitle:    null,
      otherName:   'Équipe La Place du Village',
      otherAvatar: null,
      lastMessage: c.last_message ? { content: c.last_message.content, createdAt: c.last_message.created_at } : null,
      unreadCount: c.unread_count ?? 0,
      updatedAt:   c.updated_at,
      href:        `/support/${c.id}`,
    }))
  },
}

const friendAdapter: InboxAdapter = {
  source: 'friend',
  async fetch(token) {
    const data = await fetchJson<{ conversations: FriendConv[] }>('/api/conversations?kind=friend', token)
    return (data.conversations ?? []).map(c => ({
      id:          c.id,
      source:      'friend' as const,
      title:       c.other_member?.display_name ?? 'Ami',
      subtitle:    c.other_member?.ville ?? null,
      otherName:   c.other_member?.display_name ?? null,
      otherAvatar: c.other_member?.avatar_url ?? null,
      lastMessage: c.last_message ? { content: c.last_message.content, createdAt: c.last_message.created_at } : null,
      unreadCount: c.unread_count ?? 0,
      updatedAt:   c.updated_at,
      href:        `/conversations/${c.id}`,
    }))
  },
}

// ─────────────────────────────────────────────────────────
// Liste des adapters actifs — étendre ici pour de nouvelles sources
// ─────────────────────────────────────────────────────────

export const ADAPTERS: InboxAdapter[] = [
  annonceAdapter,
  covoitAdapter,
  supportAdapter,
  friendAdapter,
]
