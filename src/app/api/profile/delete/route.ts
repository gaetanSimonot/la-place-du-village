import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * Suppression du compte de l'utilisateur authentifié.
 *
 * Sécurité :
 * - requireUser : auth obligatoire, scope strict sur ctx.userId
 * - Aucun body user_id accepté — impossible de supprimer un autre compte
 * - L'opération est définitive
 *
 * Stratégie V1 : on s'appuie sur les CASCADE / SET NULL des foreign keys
 * Supabase pour le nettoyage des contenus liés (annonces, événements, etc.).
 * Si certaines tables ne sont pas en cascade, elles garderont user_id NULL
 * (anonymisation) ou un orphan qu'on traitera en cleanup admin si besoin.
 *
 * Étape finale : auth.admin.deleteUser supprime l'identité Supabase Auth,
 * ce qui invalide la session côté client (signOut() ensuite côté UI).
 */
export async function DELETE(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const userId = ctx.userId

  // Suppression auth Supabase — déclenche les cascade FK sur public.*.user_id
  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId)

  if (authErr) {
    return NextResponse.json(
      { error: authErr.message || 'Erreur lors de la suppression du compte' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
