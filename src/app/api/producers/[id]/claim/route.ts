import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyAdmins, notifyUser } from '@/lib/server-auth'
import { can } from '@/lib/capabilities'

/** Quota max de claims producteur par user par mois (admin override illimité) */
const MAX_CLAIMS_PER_MONTH = 3

/**
 * Revendique une fiche producteur.
 *
 * Auto-validation : si l'user a déjà `can('open_shop')` (plan Pro
 * ou admin), la fiche est immédiatement assignée.
 *
 * Quota anti-vandalisme : max 3 claims par mois par user (admin illimité).
 *
 * Note : la table `producers` n'a pas de colonne `plan` (contrairement
 * à `etablissements`), donc on update juste user_id. is_featured passe
 * à true si l'user est pro pour le mettre en avant.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  if (!can(ctx, 'open_shop')) {
    return NextResponse.json(
      { error: 'Revendiquer une fiche producteur nécessite un abonnement Partenaire Local' },
      { status: 403 },
    )
  }

  // Quota check (sauf admin)
  if (!ctx.isAdmin) {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const { count } = await supabaseAdmin
      .from('producer_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .eq('traite', true)
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

  const { data: prod, error: lookupErr } = await supabaseAdmin
    .from('producers')
    .select('nom, user_id')
    .eq('id', id)
    .maybeSingle()

  if (lookupErr) {
    return NextResponse.json({ error: `DB lookup error: ${lookupErr.message}`, id }, { status: 500 })
  }
  if (!prod) {
    return NextResponse.json({ error: `Producteur introuvable (id: ${id})` }, { status: 404 })
  }
  if (prod.user_id) return NextResponse.json({ error: 'Déjà revendiqué' }, { status: 409 })

  // Auto-validation : assigne la fiche
  // (la table producers n'a pas de colonne plan ni is_featured — on ne touche
  // qu'à user_id ; le statut 'à la une' est géré ailleurs via featured_slots)
  const { error: upErr } = await supabaseAdmin
    .from('producers')
    .update({ user_id: ctx.userId })
    .eq('id', id)

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // Trace dans producer_requests pour l'historique (auto-validée)
  await supabaseAdmin.from('producer_requests').insert({
    nom: prod.nom,
    contact: contact ?? null,
    message: message ?? null,
    producer_id: id,
    user_id: ctx.userId,
    traite: true,
  })

  // Notif admins : pure info, pas d'action requise
  await notifyAdmins({
    type: 'claim_pending',
    actor_name: `🌱 ${prod.nom}`,
    target_type: 'producer',
    target_id: id,
  })

  // Notif user : confirmation immédiate
  await notifyUser(ctx.userId, {
    type: 'claim_approved',
    actor_name: prod.nom,
    target_type: 'producer',
    target_id: id,
  })

  return NextResponse.json({ success: true, autoApproved: true })
}
