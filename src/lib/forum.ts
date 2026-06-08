// La Place Publique (forum) — types partagés + helpers.
import type { MediaItem } from '@/lib/postMedia'

export interface ForumPoll {
  question: string
  options: string[]
}

export interface ForumTopic {
  id: string
  user_id: string
  titre: string
  corps: string | null
  media: MediaItem[] | null
  poll: ForumPoll | null
  pinned: boolean
  comment_count: number
  last_activity_at: string
  created_at: string
  /* enrichis côté client */
  author_name?: string | null
  author_avatar?: string | null
}

export interface ForumComment {
  id: string
  topic_id: string
  user_id: string
  texte: string
  reply_to_id: string | null
  edited_at: string | null
  created_at: string
  /* enrichis côté client */
  author_name?: string | null
  author_avatar?: string | null
  reply_to?: { author_name: string | null; texte: string } | null
  /* optimistic UI */
  status?: 'sending' | 'failed'
}

export const MAX_POLL_OPTIONS = 6

/** Valide/normalise un sondage reçu du client avant insertion. */
export function sanitizePoll(input: unknown): ForumPoll | null {
  if (!input || typeof input !== 'object') return null
  const p = input as Record<string, unknown>
  const question = typeof p.question === 'string' ? p.question.trim().slice(0, 200) : ''
  const opts = Array.isArray(p.options)
    ? p.options.filter(o => typeof o === 'string' && (o as string).trim()).map(o => (o as string).trim().slice(0, 100))
    : []
  if (!question || opts.length < 2) return null
  return { question, options: opts.slice(0, MAX_POLL_OPTIONS) }
}

/** Date relative courte (réutilisé liste + fil). */
export function forumRelativeDate(iso: string): string {
  try {
    const diffMin = (Date.now() - new Date(iso).getTime()) / 60000
    if (diffMin < 1) return 'à l\'instant'
    if (diffMin < 60) return `il y a ${Math.floor(diffMin)} min`
    if (diffMin < 60 * 24) return `il y a ${Math.floor(diffMin / 60)} h`
    const d = Math.floor(diffMin / (60 * 24))
    if (d < 7) return `il y a ${d} j`
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  } catch { return '' }
}
