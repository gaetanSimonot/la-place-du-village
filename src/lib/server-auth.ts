/**
 * SERVER AUTH HELPERS — La Place du Village
 *
 * À utiliser UNIQUEMENT dans les API routes (côté serveur).
 * Côté client, utilise useAuth() + toUserContext() depuis capabilities.ts.
 *
 * Pourquoi ce fichier ?
 * Avant, chaque route API refaisait :
 *   - extraction token
 *   - supabaseAdmin.auth.getUser(token)
 *   - select profile.plan
 *   - select admin_emails.email
 * Maintenant : un seul appel `getUserContextFromRequest(req)` qui retourne tout.
 */

import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { Plan, UserContext } from '@/lib/capabilities'

export interface ServerUserContext extends UserContext {
  userId: string
  email: string | null
}

/**
 * Extrait le user du header Authorization Bearer et charge son contexte complet
 * (plan, isAdmin, banned). Retourne null si le token est invalide ou absent.
 */
export async function getUserContextFromRequest(
  req: NextRequest,
): Promise<ServerUserContext | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null

  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return null

  const [profileRes, adminRes] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('plan, banned')
      .eq('user_id', user.id)
      .maybeSingle(),
    user.email
      ? supabaseAdmin.from('admin_emails').select('email').eq('email', user.email).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    userId:  user.id,
    email:   user.email ?? null,
    plan:    (profileRes.data?.plan as Plan) ?? 'basic',
    isAdmin: !!adminRes.data,
    banned:  !!profileRes.data?.banned,
  }
}

/**
 * Variante stricte : retourne le contexte OU lève une erreur explicite.
 * Pratique pour les routes qui exigent un user authentifié.
 *
 * Usage :
 *   const ctx = await requireUser(req)
 *   if (ctx instanceof Response) return ctx   // 401 déjà formatée
 *   // sinon ctx est typé ServerUserContext
 */
export async function requireUser(
  req: NextRequest,
): Promise<ServerUserContext | Response> {
  const ctx = await getUserContextFromRequest(req)
  if (!ctx) {
    return new Response(
      JSON.stringify({ error: 'Non authentifié' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )
  }
  if (ctx.banned) {
    return new Response(
      JSON.stringify({ error: 'Compte suspendu' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
  }
  return ctx
}

/**
 * Variante stricte qui exige aussi un rôle admin.
 * Remplace les `verifyAdmin()` éparpillés dans les routes admin.
 */
export async function requireAdmin(
  req: NextRequest,
): Promise<ServerUserContext | Response> {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  if (!ctx.isAdmin) {
    return new Response(
      JSON.stringify({ error: 'Accès réservé aux admins' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
  }
  return ctx
}

/**
 * Envoie une notification in-app à TOUS les admins (table admin_emails).
 * Source de vérité = table admin_emails (peuplée côté Dashboard Supabase).
 *
 * Fail-silent : si aucun admin n'est trouvé ou si l'insert plante, on log et on continue.
 */
/**
 * Insère une notification pour TOUS les users de l'app (broadcast).
 * Utilisé pour les events globaux comme la publication d'un journal hebdo.
 * Fail-silent. Limite hard à 1000 users (listUsers pagination).
 */
export async function notifyAllUsers(payload: {
  type: string
  actor_name: string
  target_type?: string
  target_id?: string
}): Promise<void> {
  try {
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
    if (!users?.length) return
    const rows = users.map(u => ({
      user_id:     u.id,
      type:        payload.type,
      actor_name:  payload.actor_name,
      target_type: payload.target_type ?? null,
      target_id:   payload.target_id ?? null,
      lu:          false,
    }))
    await supabaseAdmin.from('notifications').insert(rows)
  } catch (e) {
    console.error('[notifyAllUsers] failed', e)
  }
}

/**
 * Insère une notification pour un user spécifique.
 * Fail-silent.
 */
export async function notifyUser(
  userId: string,
  payload: {
    type: string
    actor_name: string
    target_type?: string
    target_id?: string
    /** Si true, supprime les notifs unread du même (user, type, target_id) avant
     *  d'insérer → une seule notif par cible (utile pour les messages de chat :
     *  3 messages d'affilée = 1 notif au lieu de 3). */
    coalesce?: boolean
  },
): Promise<void> {
  if (payload.coalesce && payload.target_id) {
    await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('user_id', userId)
      .eq('type', payload.type)
      .eq('target_id', payload.target_id)
      .eq('lu', false)
  }
  await supabaseAdmin.from('notifications').insert({
    user_id:     userId,
    type:        payload.type,
    actor_name:  payload.actor_name,
    target_type: payload.target_type ?? null,
    target_id:   payload.target_id ?? null,
    lu:          false,
  })
}

export async function notifyAdmins(payload: {
  type: string
  actor_name: string
  target_type?: string
  target_id?: string
}): Promise<void> {
  const { data: admins } = await supabaseAdmin
    .from('admin_emails')
    .select('email')

  if (!admins?.length) return

  const adminEmailsSet = new Set(admins.map(a => a.email.toLowerCase()))

  // On passe par auth.users plutôt que profiles : auth.users.email est garanti
  // d'être rempli, alors que profiles.email peut être NULL pour les users
  // créés avant le fix du trigger handle_new_user (ou par d'autres flux).
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  const adminUserIds = (users ?? [])
    .filter(u => u.email && adminEmailsSet.has(u.email.toLowerCase()))
    .map(u => u.id)

  if (!adminUserIds.length) return

  const rows = adminUserIds.map(uid => ({
    user_id:     uid,
    type:        payload.type,
    actor_name:  payload.actor_name,
    target_type: payload.target_type ?? null,
    target_id:   payload.target_id ?? null,
    lu:          false,
  }))

  await supabaseAdmin.from('notifications').insert(rows)
}
