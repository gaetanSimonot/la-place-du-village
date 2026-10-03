import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { envoyerBienvenueHabitant } from '@/lib/bienvenueHabitant'
import { envoyerBienvenuePartenaire } from '@/lib/bienvenuePartenaire'

/**
 * POST /api/admin/bienvenue — (r)envoyer un message de bienvenue, à la main.
 *
 * La clé d'envoi (Resend) est un secret Vercel : elle ne sort pas de la
 * production, donc un envoi manuel doit partir d'ici, pas d'un poste.
 *
 *   { user_id }  → le message qui correspond au plan ACTUEL du membre
 *                  (rattrapage : un Habitant passé avant que le message existe)
 *   { essai: true } → les deux mails (Habitant + Partenaire) à l'admin qui
 *                  appelle, à sa propre adresse, et la notification Habitant
 *                  sur son compte — pour voir le rendu réel.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const body = await req.json().catch(() => ({}))

  if (body?.essai === true) {
    const { data: moi } = await supabaseAdmin.from('profiles').select('email').eq('user_id', ctx.userId).maybeSingle()
    const email = (moi?.email as string | null) ?? null
    if (!email) return NextResponse.json({ error: 'Adresse de ton compte introuvable' }, { status: 400 })
    const h = await envoyerBienvenueHabitant(ctx.userId, { email })
    await envoyerBienvenuePartenaire(ctx.userId, { email })
    return NextResponse.json({ ok: h.mail, email })
  }

  const userId = typeof body?.user_id === 'string' ? body.user_id : null
  if (!userId) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })
  const { data: profil } = await supabaseAdmin.from('profiles').select('plan').eq('user_id', userId).maybeSingle()
  if (profil?.plan === 'habitants') {
    const r = await envoyerBienvenueHabitant(userId)
    return NextResponse.json({ ok: r.mail, type: 'habitant', notif: r.notif })
  }
  if (profil?.plan === 'pro') {
    await envoyerBienvenuePartenaire(userId)
    return NextResponse.json({ ok: true, type: 'partenaire' })
  }
  return NextResponse.json({ error: 'Ce membre n’est ni Habitant ni Partenaire' }, { status: 400 })
}
