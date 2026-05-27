import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyAdmins, notifyUser } from '@/lib/server-auth'
import { can } from '@/lib/capabilities'

/** Quota max de claims par user par mois (admin override illimité) */
const MAX_CLAIMS_PER_MONTH = 3

/**
 * Revendique une fiche établissement.
 *
 * Auto-validation : si l'user a déjà `can('claim_etablissement')` (Pro/Max
 * ou admin), la fiche est immédiatement assignée + prend son plan.
 *
 * Quota anti-vandalisme : max 3 claims par mois par user (admin illimité).
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

  // Quota check (sauf admin)
  if (!ctx.isAdmin) {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const { count } = await supabaseAdmin
      .from('commerce_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .eq('type_commerce', 'claim')
      .gte('created_at', monthStart.toISOString())

    if ((count ?? 0) >= MAX_CLAIMS_PER_MONTH) {
      return NextResponse.json({
        error: `Vous avez atteint votre quota de revendications ce mois (${MAX_CLAIMS_PER_MONTH} max). Contactez l'admin pour en demander d'autres.`,
        quotaReached: true,
      }, { status: 429 })
    }
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
      is_featured: ctx.plan === 'pro',
    })
    .eq('id', id)

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // Auto-hériter des promos orphelines de cette fiche : si l'ancien
  // gestionnaire avait fait "Ne plus gérer", ses promotions sont restées en
  // DB avec leur ancien user_id. Sans transfert, elles seraient invisibles
  // publiquement à jamais (filtre p.user_id !== etab.user_id dans
  // /api/promotions et /api/hub). On les transfère au repreneur pour qu'elles
  // (ré)apparaissent dès qu'il est Pro/Partenaire Local.
  // Fail-silent : si l'update foire, le claim reste valide.
  await supabaseAdmin
    .from('promotions')
    .update({ user_id: ctx.userId })
    .eq('etablissement_id', id)
    .neq('user_id', ctx.userId)

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
