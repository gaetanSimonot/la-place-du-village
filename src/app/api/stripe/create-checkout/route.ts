import { NextRequest, NextResponse } from 'next/server'
import { stripe, PLAN_PRICES } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * Crée une session Stripe Checkout pour un upgrade de plan USER.
 *
 * Body : { plan: 'pro' | 'max', etabId?: string }
 *
 *  - Sans etabId : upgrade simple du compte. success_url → /profil
 *  - Avec etabId : upgrade + auto-claim de la fiche après paiement.
 *                  success_url → /etablissement/[id]?subscribed=1
 *
 * Le webhook (checkout.session.completed) update profiles.plan = plan.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { plan, etabId } = await req.json()
  if (!plan || !['habitants', 'pro'].includes(plan)) {
    return NextResponse.json({ error: 'Plan invalide' }, { status: 400 })
  }

  // Vérification etablissement si fourni
  if (etabId) {
    const { data: etab } = await supabaseAdmin
      .from('etablissements')
      .select('id, user_id')
      .eq('id', etabId)
      .maybeSingle()

    if (!etab) return NextResponse.json({ error: 'Établissement introuvable' }, { status: 404 })
    if (etab.user_id && etab.user_id !== ctx.userId) {
      return NextResponse.json({ error: 'Déjà revendiqué par quelqu\'un d\'autre' }, { status: 409 })
    }
  }

  const priceId = PLAN_PRICES[plan as 'habitants' | 'pro']
  if (!priceId || priceId.includes('REMPLACER')) {
    return NextResponse.json({ error: `STRIPE_PRICE_${plan.toUpperCase()} non configuré dans Vercel` }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const successUrl = etabId
    ? `${appUrl}/etablissement/${etabId}?subscribed=1`
    : `${appUrl}/profil?subscribed=1`
  const cancelUrl = etabId
    ? `${appUrl}/etablissement/${etabId}`
    : `${appUrl}/profil`

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { user_id: ctx.userId, plan, etab_id: etabId ?? '' },
    customer_email: ctx.email ?? undefined,
    success_url: successUrl,
    cancel_url:  cancelUrl,
  })

  return NextResponse.json({ url: session.url })
}
