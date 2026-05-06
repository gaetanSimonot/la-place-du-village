import { NextRequest, NextResponse } from 'next/server'
import { stripe, PLAN_PRICES } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { etabId, plan } = await req.json()
  if (!etabId || !plan || !['pro', 'max'].includes(plan)) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
  }

  const { data: etab } = await supabaseAdmin
    .from('etablissements')
    .select('id, nom, user_id')
    .eq('id', etabId)
    .maybeSingle()

  if (!etab) return NextResponse.json({ error: 'Établissement introuvable' }, { status: 404 })
  if (etab.user_id && etab.user_id !== user.id) {
    return NextResponse.json({ error: 'Déjà revendiqué par quelqu\'un d\'autre' }, { status: 409 })
  }

  const priceId = PLAN_PRICES[plan as 'pro' | 'max']
  if (!priceId || priceId.includes('REMPLACER')) {
    return NextResponse.json({ error: `STRIPE_PRICE_${plan.toUpperCase()} non configuré dans Vercel` }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { etab_id: etabId, user_id: user.id, plan },
    customer_email: user.email,
    success_url: `${appUrl}/etablissement/${etabId}?subscribed=1`,
    cancel_url:  `${appUrl}/etablissement/${etabId}`,
  })

  return NextResponse.json({ url: session.url })
}
