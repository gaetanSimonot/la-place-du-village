import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Stripe from 'stripe'

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
    const session  = event.data.object as Stripe.Checkout.Session
    const { etab_id, user_id, plan } = session.metadata ?? {}

    if (etab_id && user_id && plan) {
      await supabaseAdmin
        .from('etablissements')
        .update({ user_id, plan, is_featured: plan === 'pro' || plan === 'max' })
        .eq('id', etab_id)

      // Copy metadata to subscription so cancellation handler can find etab_id
      if (session.subscription) {
        await stripe.subscriptions.update(session.subscription as string, {
          metadata: { etab_id, user_id, plan },
        })
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    const etabId = sub.metadata?.etab_id
    if (etabId) {
      await supabaseAdmin
        .from('etablissements')
        .update({ plan: 'basic', is_featured: false })
        .eq('id', etabId)
    }
  }

  return NextResponse.json({ received: true })
}
