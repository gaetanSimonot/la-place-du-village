import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { stripe } from '@/lib/stripe'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * POST /api/admin/membres/change-email { user_id, email }
 *
 * Override admin : change l'email d'un membre SANS confirmation (utile quand
 * l'ancienne adresse est inaccessible, ex. faute de frappe à l'inscription).
 * Met à jour les 3 endroits : auth.users (email_confirm), profiles.email, et
 * l'email du client Stripe (sinon le portail « Gérer mon abonnement » — qui
 * retrouve le client par email — ne le retrouverait plus).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const userId = String(body?.user_id ?? '')
  const newEmail = String(body?.email ?? '').trim().toLowerCase()
  if (!userId) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })
  if (!EMAIL_RE.test(newEmail)) return NextResponse.json({ error: 'Email invalide' }, { status: 400 })

  // Ancien email (pour retrouver le client Stripe correspondant)
  const { data: existing } = await supabaseAdmin.auth.admin.getUserById(userId)
  const oldEmail = existing?.user?.email ?? null

  // 1. Auth : change l'email et le marque confirmé (pas de mail de confirmation)
  const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email: newEmail,
    email_confirm: true,
  })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

  // 2. Profil (pas synchronisé automatiquement après création)
  await supabaseAdmin.from('profiles').update({ email: newEmail }).eq('user_id', userId)

  // 3. Stripe : met à jour l'email du client (best-effort — l'user peut ne pas
  //    avoir de client Stripe s'il n'a jamais payé).
  let stripeUpdated = false
  try {
    if (oldEmail) {
      const customers = await stripe.customers.list({ email: oldEmail, limit: 1 })
      const customer = customers.data[0]
      if (customer) {
        await stripe.customers.update(customer.id, { email: newEmail })
        stripeUpdated = true
      }
    }
  } catch { /* best-effort, on ne bloque pas le changement d'email */ }

  return NextResponse.json({ success: true, stripeUpdated })
}
