import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'

/**
 * Suppression admin d'un membre.
 *
 * Sécurité :
 * - requireAdmin (table admin_emails)
 * - Refuse l'auto-suppression (utiliser /api/profile/delete pour ça —
 *   évite qu'un admin se retire les droits par accident depuis ce flow)
 * - Aucune restriction sur la cible : un admin peut supprimer n'importe
 *   quel membre, y compris un autre admin. L'admin principal du projet
 *   doit pouvoir tout faire.
 *
 * Action : auth.admin.deleteUser → FK behavior par table :
 * - CASCADE : profiles (le profil part avec le user)
 * - SET NULL (après migration 2026-05-22_user_delete_set_null_global.sql) :
 *   annonces, posts, post_comments, producers, friendships, covoit, etc.
 *   → contenu anonymisé "Utilisateur supprimé" côté UI.
 * - SET NULL pour etablissements (infrastructure village, à revendiquer).
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const targetId = params.id

  if (targetId === ctx.userId) {
    return NextResponse.json(
      { error: 'Utilise /api/profile/delete pour supprimer ton propre compte' },
      { status: 400 },
    )
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(targetId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
