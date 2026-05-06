import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { etabId } = await req.json()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const customers = await stripe.customers.list({ email: user.email, limit: 1 })
  const customer = customers.data[0]

  if (!customer) {
    return NextResponse.json({ error: 'Aucun abonnement Stripe trouvé pour ce compte.' }, { status: 404 })
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: `${appUrl}/etablissement/${etabId}`,
  })

  return NextResponse.json({ url: session.url })
}
