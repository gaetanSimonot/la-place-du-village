import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser } from '@/lib/server-auth'
import { can } from '@/lib/capabilities'

/**
 * POST — l'user clique "J'en profite" sur une promo.
 *
 * Vérifications :
 *  - User a un plan Pro ou Max (can('promo_pro'))
 *  - Promo existe et est active
 *  - Promo pas expirée
 *  - Selon frequency : pas déjà utilisée trop récemment
 *
 * Effets :
 *  - Insert dans promotion_uses
 *  - Increment use_count sur promotions
 *  - Notif au créateur de la promo "[User] a utilisé votre promo [title]"
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  if (!can(ctx, 'promo_pro')) {
    return NextResponse.json({
      error: 'Cette feature nécessite un abonnement Pro ou Max',
      upgradeRequired: true,
    }, { status: 403 })
  }

  // Charge la promo
  const { data: promo } = await supabaseAdmin
    .from('promotions')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!promo) return NextResponse.json({ error: 'Promotion introuvable' }, { status: 404 })
  if (!promo.active) return NextResponse.json({ error: 'Promotion inactive' }, { status: 410 })

  const now = new Date()
  if (promo.valid_from && new Date(promo.valid_from) > now) {
    return NextResponse.json({ error: 'Promotion pas encore active' }, { status: 410 })
  }
  if (promo.valid_until && new Date(promo.valid_until) < now) {
    return NextResponse.json({ error: 'Promotion expirée' }, { status: 410 })
  }

  // Check fréquence : récupère la dernière utilisation du user pour cette promo
  const { data: lastUse } = await supabaseAdmin
    .from('promotion_uses')
    .select('used_at')
    .eq('promotion_id', id)
    .eq('user_id', ctx.userId)
    .order('used_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastUse) {
    const lastTime = new Date(lastUse.used_at).getTime()
    const elapsedDays = (now.getTime() - lastTime) / 86_400_000

    if (promo.frequency === 'always' && elapsedDays >= 0) {
      return NextResponse.json({
        error: 'Vous avez déjà utilisé cette promotion. Elle est utilisable une seule fois.',
        alreadyUsed: true,
      }, { status: 409 })
    }
    if (promo.frequency === 'weekly' && elapsedDays < 7) {
      const remaining = Math.ceil(7 - elapsedDays)
      return NextResponse.json({
        error: `Vous avez déjà utilisé cette promotion. Réutilisable dans ${remaining} jour(s).`,
        alreadyUsed: true,
      }, { status: 409 })
    }
    if (promo.frequency === 'monthly' && elapsedDays < 30) {
      const remaining = Math.ceil(30 - elapsedDays)
      return NextResponse.json({
        error: `Vous avez déjà utilisé cette promotion. Réutilisable dans ${remaining} jour(s).`,
        alreadyUsed: true,
      }, { status: 409 })
    }
  }

  // Enregistre l'utilisation
  const { error: useErr } = await supabaseAdmin
    .from('promotion_uses')
    .insert({ promotion_id: id, user_id: ctx.userId })

  if (useErr) return NextResponse.json({ error: useErr.message }, { status: 500 })

  // Incrémente le compteur (fire & forget)
  await supabaseAdmin
    .from('promotions')
    .update({ use_count: (promo.use_count ?? 0) + 1, updated_at: now.toISOString() })
    .eq('id', id)

  // Notif au créateur de la promo (commerçant)
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('user_id', ctx.userId)
    .maybeSingle()

  const userName = profile?.display_name ?? ctx.email?.split('@')[0] ?? 'Un client'

  await notifyUser(promo.user_id, {
    type: 'promo_used',
    actor_name: `${userName} · ${promo.title}`,
    target_type: 'promotion',
    target_id: id,
  })

  return NextResponse.json({ success: true, useCount: (promo.use_count ?? 0) + 1 })
}
