import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/server-auth'
import { safeDeleteUser } from '@/lib/server-user-delete'

/**
 * Auto-suppression du compte de l'utilisateur authentifié.
 *
 * Scope auth.uid() : impossible de supprimer un autre compte via cette
 * route (jamais de body user_id).
 *
 * Utilise safeDeleteUser : cleanup profile + etablissements déclaim +
 * auth.admin.deleteUser. Robuste, ne dépend pas du comportement FK DB.
 */
export async function DELETE(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const result = await safeDeleteUser(ctx.userId)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'Erreur de suppression', step: result.step },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true })
}
