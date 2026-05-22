import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { safeDeleteUser } from '@/lib/server-user-delete'

/**
 * Suppression admin d'un membre.
 *
 * - requireAdmin (table admin_emails)
 * - Refuse l'auto-suppression (utiliser /api/profile/delete pour soi)
 * - Aucune restriction sur la cible : peut supprimer n'importe quel membre
 *
 * Délègue à safeDeleteUser : cleanup profile + etablissements en SET NULL
 * + auth.admin.deleteUser. Robuste face aux différents comportements FK.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  if (params.id === ctx.userId) {
    return NextResponse.json(
      { error: 'Utilise /api/profile/delete pour supprimer ton propre compte' },
      { status: 400 },
    )
  }

  const result = await safeDeleteUser(params.id)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'Erreur de suppression', step: result.step },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true })
}
