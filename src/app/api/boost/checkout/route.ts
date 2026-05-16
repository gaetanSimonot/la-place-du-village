import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { findOffer } from '@/lib/boost'
import { SLOT_ALLOWED_TYPES, type FeaturedContentType } from '@/lib/featured'

/**
 * POST — démarre un Stripe Checkout en mode 'payment' (one-shot) pour booster un contenu.
 *
 * Body : { offer_key, content_type, content_id, success_url?, cancel_url? }
 * Renvoie : { url } (URL Stripe à ouvrir)
 *
 * Le webhook /api/stripe/webhook gère le retour (création du featured_slot).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const offerKey     = body?.offer_key as string
  const content_type = body?.content_type as FeaturedContentType
  const content_id   = body?.content_id as string

  if (!offerKey || !content_type || !content_id) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
  }

  const offer = findOffer(offerKey)
  if (!offer) return NextResponse.json({ error: 'Offre inconnue' }, { status: 400 })
  if (!SLOT_ALLOWED_TYPES[offer.slot].includes(content_type)) {
    return NextResponse.json({ error: 'Type de contenu non autorisé pour ce slot' }, { status: 400 })
  }

  // Crée la row boost_purchases en pending (pour audit même si le user abandonne le checkout)
  const { data: purchase, error: prErr } = await supabaseAdmin
    .from('boost_purchases')
    .insert({
      user_id:        ctx.userId,
      status:         'pending',
      slot:           offer.slot,
      duration_hours: offer.duration_hours,
      content_type,
      content_id,
      offer_key:      offer.key,
      amount_cents:   offer.price_cents,
    })
    .select()
    .single()

  if (prErr || !purchase) {
    return NextResponse.json({ error: prErr?.message ?? 'Erreur création purchase' }, { status: 500 })
  }

  const origin = req.headers.get('origin') ?? 'https://laplaceduvillage.app'
  const successUrl = body?.success_url ?? `${origin}/?boost=success`
  const cancelUrl  = body?.cancel_url  ?? `${origin}/?boost=cancel`

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: `🚀 ${offer.label}`,
          description: offer.description,
        },
        unit_amount: offer.price_cents,
      },
      quantity: 1,
    }],
    customer_email: ctx.email ?? undefined,
    metadata: {
      kind:         'boost',
      purchase_id:  purchase.id,
      user_id:      ctx.userId,
      offer_key:    offer.key,
      content_type,
      content_id,
    },
    success_url: successUrl,
    cancel_url:  cancelUrl,
    allow_promotion_codes: true,
  })

  // Sauve le session_id pour pouvoir matcher le webhook
  await supabaseAdmin
    .from('boost_purchases')
    .update({ stripe_session_id: session.id })
    .eq('id', purchase.id)

  return NextResponse.json({ url: session.url, purchase_id: purchase.id })
}
