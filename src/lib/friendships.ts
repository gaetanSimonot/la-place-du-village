/**
 * FRIENDSHIPS — types + helpers
 */

export type FriendshipStatusDb = 'pending' | 'accepted' | 'blocked'

export interface Friendship {
  id: string
  user1_id: string
  user2_id: string
  status: FriendshipStatusDb
  requested_by: string
  created_at: string
  updated_at: string
}

/** Statut d'une relation vue depuis un user donné. */
export type FriendshipStateForMe =
  | { kind: 'none' }
  | { kind: 'sent';     friendshipId: string }   // J'ai envoyé une demande, elle est pending
  | { kind: 'received'; friendshipId: string }   // J'ai reçu une demande, elle est pending
  | { kind: 'friends';  friendshipId: string }   // Status accepted
  | { kind: 'blocked';  friendshipId: string }   // L'un des 2 a bloqué

/** Normalise une paire (user1_id < user2_id). */
export function normalizePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

/** Calcule l'état de la relation vue depuis `me`. */
export function statusFromFriendship(f: Friendship, me: string): FriendshipStateForMe {
  if (f.status === 'blocked') return { kind: 'blocked', friendshipId: f.id }
  if (f.status === 'accepted') return { kind: 'friends', friendshipId: f.id }
  // pending
  if (f.requested_by === me) return { kind: 'sent', friendshipId: f.id }
  return { kind: 'received', friendshipId: f.id }
}

/** Retourne l'autre user d'une friendship. */
export function otherUserId(f: Friendship, me: string): string {
  return f.user1_id === me ? f.user2_id : f.user1_id
}
