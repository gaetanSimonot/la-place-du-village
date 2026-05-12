import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyAdmins, notifyUser } from '@/lib/server-auth'
import { can } from '@/lib/capabilities'

/**
 * Revendique une fiche établissement.
 *
 * Auto-validation : si l'user a déjà `can('claim_etablissement')` (Pro/Max
 * ou admin), la fiche est immédiatement assignée + prend son plan.
 * L'admin reçoit une notif informative et la trace est gardée dans
 * commerce_requests (traite=true).
 *
 * Si l'user est basic, ce endpoint ne devrait pas être appelé (le
 * frontend ouvre la modale Stripe à la place). Si appelé quand même,
 * on retourne 403.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  if (!can(ctx, 'claim_etablissement')) {
    return NextResponse.json(
      { error: 'Revendiquer une fiche nécessite un abonnement Pro ou Max' },
      { status: 403 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const { contact, message } = body

  const { data: etab } = await supabaseAdmin
    .from('etablissements')
    .select('nom, user_id')
    .eq('id', id)
    .maybeSingle()

  if (!etab) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })
  if (etab.user_id) return NextResponse.json({ error: 'Déjà revendiqué' }, { status: 409 })

  // Auto-validation : assigne directement la fiche + applique le plan du user
  const { error: upErr } = await supabaseAdmin
    .from('etablissements')
    .update({
      user_id: ctx.userId,
      plan: ctx.plan,
      is_featured: ctx.plan === 'pro' || ctx.plan === 'max',
    })
    .eq('id', id)

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // Trace dans commerce_requests pour l'historique (auto-validée)
  await supabaseAdmin.from('commerce_requests').insert({
    nom: etab.nom,
    type_commerce: 'claim',
    contact: contact ?? null,
    message: message ?? null,
    etablissement_id: id,
    user_id: ctx.userId,
    traite: true,
  })

  // Notif admins : pure info, pas d'action requise
  await notifyAdmins({
    type: 'claim_pending',
    actor_name: etab.nom,
    target_type: 'claim',
  })

  // Notif user : confirmation immédiate
  await notifyUser(ctx.userId, {
    type: 'claim_approved',
    actor_name: etab.nom,
    target_type: 'etablissement',
    target_id: id,
  })

  return NextResponse.json({ success: true, autoApproved: true })
}
