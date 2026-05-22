import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'

/**
 * Suppression admin d'un membre.
 *
 * Sécurité :
 * - requireAdmin (table admin_emails)
 * - Refuse de supprimer un autre admin (protection : un admin ne peut pas
 *   être supprimé sans intervention manuelle Dashboard, évite les coups bas)
 * - Refuse de se supprimer soi-même (utiliser /api/profile/delete pour ça)
 *
 * Action : auth.admin.deleteUser → CASCADE FK sur public.* (annonces,
 * events, producer, etablissements, posts, friendships, etc.).
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

  // Vérifie si la cible est elle-même admin → refuse
  const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(targetId)
  const targetEmail = targetUser?.user?.email
  if (targetEmail) {
    const { data: adminRow } = await supabaseAdmin
      .from('admin_emails')
      .select('email')
      .eq('email', targetEmail)
      .maybeSingle()
    if (adminRow) {
      return NextResponse.json(
        { error: 'Impossible de supprimer un autre admin via l\'API. Passe par le Dashboard Supabase.' },
        { status: 403 },
      )
    }
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(targetId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
