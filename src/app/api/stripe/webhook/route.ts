import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notifyUser } from '@/lib/server-auth'
import Stripe from 'stripe'

/**
 * Stripe webhook — source de vérité du plan USER (profiles.plan).
 *
 * Flux :
 *  - checkout.session.completed :
 *      1. profiles.plan = (pro|max)
 *      2. si etab_id fourni en metadata → auto-claim de la fiche (update etab.user_id)
 *         + reset commerce_request.traite=true si pending
 *      3. (legacy back-compat) update etablissements.plan tant que Phase E pas faite
 *
 *  - customer.subscription.deleted :
 *      1. profiles.plan = 'basic'
 *      2. (legacy) reset etablissements.plan='basic' pour les fiches du user
 *      3. Le user garde ses fiches (user_id non touché), juste sans bénéfices Pro/Max
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
    const { etab_id, user_id, plan } = session.metadata ?? {}

    if (!user_id || !plan) return NextResponse.json({ received: true })

    // 1. Source de vérité : profiles.plan
    await supabaseAdmin
      .from('profiles')
      .update({ plan })
      .eq('user_id', user_id)

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
          .update({ user_id, plan, is_featured: plan === 'pro' || plan === 'max' })
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
