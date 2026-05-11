import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { requireUser } from '@/lib/server-auth'

/**
 * Crée une session du Stripe Billing Portal pour que le user gère
 * son abonnement (changer plan, résilier, mettre à jour CB, etc.).
 *
 * Body : { etabId?: string }  — détermine juste le return_url
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { etabId } = await req.json().catch(() => ({}))
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (!ctx.email) {
    return NextResponse.json({ error: 'Email manquant sur le compte' }, { status: 400 })
  }

  const customers = await stripe.customers.list({ email: ctx.email, limit: 1 })
  const customer = customers.data[0]

  if (!customer) {
    return NextResponse.json({ error: 'Aucun abonnement Stripe trouvé pour ce compte.' }, { status: 404 })
  }

  const returnUrl = etabId
    ? `${appUrl}/etablissement/${etabId}`
    : `${appUrl}/profil`

  const session = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: returnUrl,
  })

  return NextResponse.json({ url: session.url })
}
