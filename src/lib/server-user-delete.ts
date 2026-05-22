/**
 * Suppression robuste d'un user — fait le cleanup côté code, ne dépend
 * pas du comportement FK des migrations DB.
 *
 * Ordre :
 * 1. Etablissements (infrastructure village) → user_id = NULL (déclaim)
 * 2. Profile (table profiles) → DELETE explicite
 *    → Si l'order auth-then-profile laisse des orphelins (FK SET NULL ou
 *      pas de FK), on garantit ici qu'il n'en restera pas.
 * 3. auth.admin.deleteUser → supprime auth.users + cascade restant
 *    (annonces, posts, etc. selon leurs FK respectives)
 *
 * Retourne { ok, error } avec détail si échec.
 */

import { supabaseAdmin } from '@/lib/supabase-admin'

export interface DeleteUserResult {
  ok:       boolean
  error?:   string
  step?:    'etablissements' | 'profile' | 'auth'
}

export async function safeDeleteUser(userId: string): Promise<DeleteUserResult> {
  // 1. Etablissements : déclaim (user_id = null), surtout pas supprimer
  const { error: etabErr } = await supabaseAdmin
    .from('etablissements')
    .update({ user_id: null })
    .eq('user_id', userId)
  if (etabErr) {
    return { ok: false, error: etabErr.message, step: 'etablissements' }
  }

  // 2. Profile : DELETE explicite avant auth pour garantir le cleanup
  //    (certaines FK peuvent être en SET NULL et laisser un orphelin sinon)
  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .delete()
    .eq('user_id', userId)
  if (profileErr) {
    return { ok: false, error: profileErr.message, step: 'profile' }
  }

  // 3. Auth — supprime auth.users.id + cascade FK déclaré sur ce user
  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (authErr) {
    return { ok: false, error: authErr.message, step: 'auth' }
  }

  return { ok: true }
}

/**
 * Nettoie les profils orphelins (user_id qui n'est plus dans auth.users).
 * Utile après une migration ou pour réparer des suppressions partielles passées.
 */
export async function cleanupOrphanProfiles(): Promise<{ deleted: number; error?: string }> {
  // Récupère tous les user_id valides (auth.users)
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 10000 })
  if (authErr) return { deleted: 0, error: authErr.message }
  const validIds = new Set((authData?.users ?? []).map(u => u.id))

  // Liste tous les profils
  const { data: profiles, error: profilesErr } = await supabaseAdmin
    .from('profiles')
    .select('user_id')
  if (profilesErr) return { deleted: 0, error: profilesErr.message }

  // Trouve les orphelins
  const orphans = (profiles ?? [])
    .map(p => p.user_id as string)
    .filter(id => !validIds.has(id))

  if (orphans.length === 0) return { deleted: 0 }

  const { error: delErr } = await supabaseAdmin
    .from('profiles')
    .delete()
    .in('user_id', orphans)
  if (delErr) return { deleted: 0, error: delErr.message }

  return { deleted: orphans.length }
}
