import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * GET /api/profile/mes-promotions — stats des promotions DU pro connecté.
 * Pour chaque promo (active ou passée) : qui en a profité (nom + avatar +
 * date), et le total. Source : promotions (user_id = moi) ⨝ promotion_uses ⨝
 * profiles. Lecture seule — n'altère ni les notifs ni les compteurs.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: promos } = await supabaseAdmin
    .from('promotions')
    .select('id, title, image_url, active, valid_until, created_at')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })

  if (!promos?.length) return NextResponse.json({ promotions: [], totalUses: 0 })

  const promoIds = promos.map(p => p.id)
  const { data: uses } = await supabaseAdmin
    .from('promotion_uses')
    .select('promotion_id, user_id, used_at')
    .in('promotion_id', promoIds)
    .order('used_at', { ascending: false })

  const userIds = Array.from(new Set((uses ?? []).map(u => u.user_id).filter(Boolean) as string[]))
  const { data: profs } = userIds.length
    ? await supabaseAdmin.from('profiles').select('user_id, display_name, avatar_url').in('user_id', userIds)
    : { data: [] }
  const profById = Object.fromEntries((profs ?? []).map(p => [p.user_id, p]))

  const byPromo: Record<string, { user_id: string; name: string; avatar: string | null; used_at: string }[]> = {}
  for (const u of uses ?? []) {
    if (!byPromo[u.promotion_id]) byPromo[u.promotion_id] = []
    const p = profById[u.user_id]
    byPromo[u.promotion_id].push({
      user_id: u.user_id as string,
      name: (p?.display_name as string) ?? 'Utilisateur',
      avatar: (p?.avatar_url as string | null) ?? null,
      used_at: u.used_at as string,
    })
  }

  const promotions = promos.map(p => ({
    id: p.id,
    title: (p.title as string) ?? 'Promotion',
    image_url: (p.image_url as string | null) ?? null,
    active: !!p.active,
    valid_until: (p.valid_until as string | null) ?? null,
    created_at: p.created_at,
    count: (byPromo[p.id] ?? []).length,
    redeemers: byPromo[p.id] ?? [],
  }))

  return NextResponse.json({ promotions, totalUses: (uses ?? []).length })
}
