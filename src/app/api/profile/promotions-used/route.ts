import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * Liste les promotions utilisées par le user connecté (historique).
 * Limité aux 30 plus récentes.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: uses } = await supabaseAdmin
    .from('promotion_uses')
    .select('id, promotion_id, used_at')
    .eq('user_id', ctx.userId)
    .order('used_at', { ascending: false })
    .limit(30)

  if (!uses?.length) return NextResponse.json({ uses: [] })

  const promoIds = Array.from(new Set(uses.map(u => u.promotion_id)))
  const { data: promos } = await supabaseAdmin
    .from('promotions')
    .select('id, title, image_url, etablissement_id')
    .in('id', promoIds)

  const etabIds = Array.from(new Set((promos ?? []).map(p => p.etablissement_id).filter(Boolean) as string[]))
  const { data: etabs } = etabIds.length
    ? await supabaseAdmin.from('etablissements').select('id, nom, commune').in('id', etabIds)
    : { data: [] }

  const promosById = Object.fromEntries((promos ?? []).map(p => [p.id, p]))
  const etabsById = Object.fromEntries((etabs ?? []).map(e => [e.id, e]))

  const enriched = uses.map(u => {
    const promo = promosById[u.promotion_id]
    const etab = promo ? etabsById[promo.etablissement_id] : null
    return {
      id: u.id,
      used_at: u.used_at,
      promotion_id: u.promotion_id,
      title: promo?.title ?? '(promo supprimée)',
      image_url: promo?.image_url ?? null,
      etablissement: etab ?? null,
    }
  })

  return NextResponse.json({ uses: enriched })
}
