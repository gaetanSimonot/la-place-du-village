import { supabase } from '@/lib/supabase'

/**
 * Ouvre (ou crée) la conversation amis avec `friendUserId` et redirige
 * vers /conversations/<id>. Requiert que les 2 users soient amis acceptés
 * (le serveur vérifie via /api/conversations/friend/open).
 *
 * Retourne `false` si l'opération a échoué (pas d'amitié, network, etc.)
 * → le caller peut afficher un toast d'erreur.
 */
export async function openFriendChat(friendUserId: string): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return false

    const res = await fetch('/api/conversations/friend/open', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ user_id: friendUserId }),
    })
    if (!res.ok) return false
    const data = await res.json().catch(() => ({}))
    if (!data.conversation_id) return false

    if (typeof window !== 'undefined') {
      window.location.href = `/conversations/${data.conversation_id}`
    }
    return true
  } catch {
    return false
  }
}
