import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { can } from '@/lib/capabilities'

/**
 * GET — liste les promos actives (publique).
 *   ?etab=<id> : filtre par établissement
 *   ?mine=1    : promos créées par le user connecté (commerçant)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const etabId = searchParams.get('etab')
  const mine = searchParams.get('mine') === '1'

  let query = supabaseAdmin
    .from('promotions')
    .select('*')
    .order('created_at', { ascending: false })

  if (mine) {
    const ctx = await requireUser(req)
    if (ctx instanceof Response) return ctx
    query = query.eq('user_id', ctx.userId)
  } else {
    query = query.eq('active', true)
    // exclut les promos expirées
    query = query.or('valid_until.is.null,valid_until.gte.' + new Date().toISOString())
  }

  if (etabId) query = query.eq('etablissement_id', etabId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrichit avec etab + count uses si demandé
  if (!data?.length) return NextResponse.json({ promotions: [] })

  const etabIds = Array.from(new Set(data.map(p => p.etablissement_id)))
  const { data: etabs } = await supabaseAdmin
    .from('etablissements')
    .select('id, nom, commune, photos, type, plan')
    .in('id', etabIds)

  const etabsById = Object.fromEntries((etabs ?? []).map(e => [e.id, e]))

  const enriched = data.map(p => {
    const etab = etabsById[p.etablissement_id] ?? null
    // Fallback image : si pas d'image_url custom, on prend la 1re photo de la fiche
    const display_image_url = p.image_url || (etab?.photos?.[0] ?? null)
    return {
      ...p,
      etablissement: etab,
      display_image_url,
    }
  })

  return NextResponse.json({ promotions: enriched })
}

/**
 * POST — crée une promo (commerçant Pro/Max seulement, et propriétaire de l'étab).
 *
 * Body : { etablissement_id, title, description?, image_url?, conditions?,
 *          frequency: 'always'|'weekly'|'monthly', valid_from?, valid_until? }
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  if (!can(ctx, 'promo_pro')) {
    return NextResponse.json({ error: 'Plan Pro ou Max requis pour créer une promotion' }, { status: 403 })
  }

  const body = await req.json()
  const { etablissement_id, title, description, image_url, conditions, frequency, valid_from, valid_until } = body

  if (!etablissement_id || !title?.trim()) {
    return NextResponse.json({ error: 'etablissement_id et titre requis' }, { status: 400 })
  }

  // Vérifie que l'user est propriétaire de la fiche
  const { data: etab } = await supabaseAdmin
    .from('etablissements')
    .select('user_id')
    .eq('id', etablissement_id)
    .maybeSingle()

  if (!etab) return NextResponse.json({ error: 'Établissement introuvable' }, { status: 404 })
  if (etab.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Vous ne gérez pas cet établissement' }, { status: 403 })
  }

  const cleanFreq = ['always', 'weekly', 'monthly'].includes(frequency) ? frequency : 'monthly'

  const { data, error } = await supabaseAdmin
    .from('promotions')
    .insert({
      etablissement_id,
      user_id: ctx.userId,
      title: title.trim(),
      description: description?.trim() || null,
      image_url: image_url || null,
      conditions: conditions?.trim() || null,
      frequency: cleanFreq,
      valid_from: valid_from || null,
      valid_until: valid_until || null,
      active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ promotion: data })
}
