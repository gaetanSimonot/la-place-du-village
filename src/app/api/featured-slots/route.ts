import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { endOfTodayParisISO, type FeaturedSlot, type FeaturedContentType } from '@/lib/featured'

const VALID_SLOTS: FeaturedSlot[] = ['splash', 'hub_hero', 'a_la_une', 'homepage']
const VALID_TYPES: FeaturedContentType[] = ['evenement', 'etablissement', 'producteur', 'annonce', 'promotion', 'forum_topic']

/**
 * GET — liste les slots actifs.
 * Query params : ?slot=hub_hero (optionnel), ?all=1 (admin uniquement, voir les expirés)
 *
 * Public (RLS SELECT ouverte).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const slot = searchParams.get('slot') as FeaturedSlot | null
  const all  = searchParams.get('all') === '1'

  let q = supabaseAdmin
    .from('featured_slots')
    .select('*')

  if (slot) q = q.eq('slot', slot)
  if (!all) q = q.gt('ends_at', new Date().toISOString()).lte('starts_at', new Date().toISOString())

  q = q.order('priority', { ascending: false }).order('created_at', { ascending: false })

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ slots: data ?? [] })
}

/**
 * POST — crée un slot featured. ADMIN ONLY (mise en avant éditoriale gratuite).
 * Pour les pros : passer par /api/feature/redeem (consomme un crédit).
 * Pour les users : passer par /api/boost/checkout (Stripe).
 *
 * Body : {
 *   slot, content_type, content_id,
 *   starts_at?, ends_at,
 *   priority?, sponsored?
 * }
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const slot         = body?.slot as FeaturedSlot
  const content_type = body?.content_type as FeaturedContentType
  const content_id   = body?.content_id as string
  let   ends_at      = body?.ends_at as string | undefined
  const starts_at    = (body?.starts_at as string) ?? new Date().toISOString()
  let   priority     = typeof body?.priority === 'number' ? body.priority : 0
  const sponsored    = !!body?.sponsored
  const rawPosition  = body?.position
  const position     = typeof rawPosition === 'number' && [1, 2, 3].includes(rawPosition)
    ? rawPosition : null

  if (!VALID_SLOTS.includes(slot))        return NextResponse.json({ error: 'slot invalide' }, { status: 400 })
  if (!VALID_TYPES.includes(content_type)) return NextResponse.json({ error: 'content_type invalide' }, { status: 400 })
  if (!content_id)                        return NextResponse.json({ error: 'content_id requis' }, { status: 400 })

  // Cas spécial homepage+evenement : positionnement explicite 1/2/3, durée
  // fixe = jusqu'à minuit Paris. Si une position est déjà prise aujourd'hui,
  // on la remplace (l'admin "écrase" son ancien choix). Pas de priority libre.
  const isHomepageEvent = slot === 'homepage' && content_type === 'evenement'
  if (isHomepageEvent) {
    if (position == null) {
      return NextResponse.json({ error: 'position (1, 2 ou 3) requise pour homepage+evenement' }, { status: 400 })
    }
    ends_at = endOfTodayParisISO()
    priority = 100 - position  // garde un ordre cohérent dans les listes admin (position 1 = priority 99)

    // Remplace tout slot existant à cette position aujourd'hui
    await supabaseAdmin
      .from('featured_slots')
      .delete()
      .eq('slot', 'homepage')
      .eq('content_type', 'evenement')
      .eq('position', position)
      .gt('ends_at', new Date().toISOString())
  }

  if (!ends_at)                           return NextResponse.json({ error: 'ends_at requis' }, { status: 400 })
  if (new Date(ends_at) <= new Date(starts_at)) {
    return NextResponse.json({ error: 'ends_at doit être après starts_at' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('featured_slots')
    .insert({
      slot,
      content_type,
      content_id,
      starts_at,
      ends_at,
      priority,
      sponsored,
      position,
      source:           'admin',
      created_by:        ctx.userId,
      created_by_admin:  true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ slot: data })
}

/**
 * PATCH — édition admin (durée / priority / sponsored).
 * Body : { id, ends_at?, priority?, sponsored? }
 */
export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const id = body?.id as string
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (body.ends_at)  patch.ends_at  = body.ends_at
  if (typeof body.priority === 'number') patch.priority = body.priority
  if (typeof body.sponsored === 'boolean') patch.sponsored = body.sponsored
  if (typeof body.starts_at === 'string') patch.starts_at = body.starts_at
  if (body.image_position === null || typeof body.image_position === 'string') {
    patch.image_position = body.image_position
  }

  const { data, error } = await supabaseAdmin
    .from('featured_slots')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ slot: data })
}

/**
 * DELETE — suppression admin.
 * Query param : ?id=...
 */
export async function DELETE(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const { error } = await supabaseAdmin.from('featured_slots').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
