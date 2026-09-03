import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notifyUser } from '@/lib/server-auth'
import { envoyerBienvenuePartenaire } from '@/lib/bienvenuePartenaire'
import Stripe from 'stripe'

/**
 * Stripe webhook — source de vérité du plan USER (profiles.plan).
 *
 * Flux :
 *  - checkout.session.completed :
 *      1. profiles.plan = ('habitants' | 'pro')
 *      2. si etab_id fourni en metadata → auto-claim de la fiche (update etab.user_id)
 *         + reset commerce_request.traite=true si pending
 *      3. update etablissements.plan pour la fiche concernée
 *
 *  - customer.subscription.deleted :
 *      1. profiles.plan = 'basic'
 *      2. reset etablissements.plan='basic' pour la fiche concernée
 *      3. Le user garde ses fiches (user_id non touché), juste sans bénéfices Partenaire
 */
export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    // — Boost one-shot (payment mode) —
    if (session.metadata?.kind === 'boost') {
      await handleBoostCompleted(session)
      return NextResponse.json({ received: true })
    }

    // — Abonnement (subscription mode) —
    const { etab_id, user_id, plan } = session.metadata ?? {}

    if (!user_id || !plan) return NextResponse.json({ received: true })

    // 1. Source de vérité : profiles.plan
    // Plan lu AVANT l'écriture : le message de bienvenue ne part qu'au
    // basculement vers Partenaire Local, pas sur un changement de moyen de
    // paiement ou une reprise d'un abonnement déjà actif.
    const { data: avant } = await supabaseAdmin
      .from('profiles').select('plan').eq('user_id', user_id).maybeSingle()
    const ancienPlan = (avant?.plan as string | null) ?? null

    await supabaseAdmin
      .from('profiles')
      .update({ plan })
      .eq('user_id', user_id)

    // Bienvenue Partenaire Local — au basculement, quel que soit le chemin
    // (paiement ici, attribution manuelle dans /api/admin/membres).
    // Fail-soft : n'interrompt jamais le traitement du paiement.
    if (plan === 'pro' && ancienPlan !== 'pro') await envoyerBienvenuePartenaire(user_id)

    // 2. Auto-claim de la fiche payée si etab_id fourni
    if (etab_id) {
      const { data: etab } = await supabaseAdmin
        .from('etablissements')
        .select('user_id')
        .eq('id', etab_id)
        .maybeSingle()

      // Auto-claim seulement si la fiche est libre ou déjà à ce user
      if (etab && (!etab.user_id || etab.user_id === user_id)) {
        await supabaseAdmin
          .from('etablissements')
          .update({ user_id, plan, is_featured: plan === 'pro' })
          .eq('id', etab_id)

        // Marque comme traitées toutes les commerce_requests pending de ce user
        // sur cette fiche (au cas où il avait déjà cliqué "Revendiquer" avant)
        await supabaseAdmin
          .from('commerce_requests')
          .update({ traite: true })
          .eq('etablissement_id', etab_id)
          .eq('user_id', user_id)
          .eq('traite', false)

        await notifyUser(user_id, {
          type: 'claim_approved',
          actor_name: 'Abonnement activé',
          target_type: 'etablissement',
          target_id: etab_id,
        })
      }
    }

    // 3. Copy metadata vers la subscription pour pouvoir gérer la cancellation
    if (session.subscription) {
      await stripe.subscriptions.update(session.subscription as string, {
        metadata: { user_id, plan, etab_id: etab_id ?? '' },
      })
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    const userId = sub.metadata?.user_id
    const etabId = sub.metadata?.etab_id

    if (userId) {
      // Source de vérité : profile passe à basic
      await supabaseAdmin
        .from('profiles')
        .update({ plan: 'basic' })
        .eq('user_id', userId)
    }

    // (legacy) reset le plan de l'établissement spécifique (back-compat)
    if (etabId) {
      await supabaseAdmin
        .from('etablissements')
        .update({ plan: 'basic', is_featured: false })
        .eq('id', etabId)
    }
  }

  return NextResponse.json({ received: true })
}

/**
 * Boost one-shot : on retrouve le boost_purchases pending, on le marque payé,
 * et on crée le featured_slot avec la durée prévue.
 */
async function handleBoostCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const purchaseId = session.metadata?.purchase_id
  if (!purchaseId) return

  const { data: purchase } = await supabaseAdmin
    .from('boost_purchases')
    .select('*')
    .eq('id', purchaseId)
    .maybeSingle()

  if (!purchase || purchase.status === 'paid') return  // idempotence

  const startsAt = new Date()
  const endsAt   = new Date(startsAt.getTime() + purchase.duration_hours * 3600 * 1000)

  const { data: slotRow } = await supabaseAdmin
    .from('featured_slots')
    .insert({
      slot:             purchase.slot,
      content_type:     purchase.content_type,
      content_id:       purchase.content_id,
      starts_at:        startsAt.toISOString(),
      ends_at:          endsAt.toISOString(),
      priority:         5,                    // un peu prioritaire sur l'éditorial gratuit
      sponsored:        true,
      source:           'boost_purchase',
      created_by:        purchase.user_id,
      created_by_admin:  false,
    })
    .select()
    .single()

  await supabaseAdmin
    .from('boost_purchases')
    .update({
      status:           'paid',
      paid_at:          new Date().toISOString(),
      featured_slot_id: slotRow?.id ?? null,
    })
    .eq('id', purchaseId)

  // Notif au user
  if (purchase.user_id) {
    await notifyUser(purchase.user_id, {
      type:        'promo_used',   // type générique le plus proche — à scinder plus tard si besoin
      actor_name:  '🚀 Boost activé',
      target_type: purchase.content_type === 'annonce' ? 'annonce' : 'event',
      target_id:   purchase.content_id,
    })
  }
}
