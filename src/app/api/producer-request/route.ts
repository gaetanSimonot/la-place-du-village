import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyAdmins } from '@/lib/server-auth'

const VALID_CATS = [
  'fruits_legumes', 'viandes', 'fromages_laitages', 'oeufs',
  'pain', 'miel', 'panier', 'plantes', 'huiles', 'boissons',
  'artisanat', 'autre',
]

/**
 * POST — Demande de référencement producteur (user authentifié).
 * Body : {
 *   nom, produit_categories[], adresse?, lat?, lng?, place_id_google?, commune?,
 *   description?, contact?, site_web?, horaires?, photos?, message?
 * }
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const nom = String(body?.nom ?? '').trim()
  if (!nom) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })

  const cats = Array.isArray(body?.produit_categories)
    ? body.produit_categories.filter((c: unknown) => typeof c === 'string' && VALID_CATS.includes(c))
    : []

  const insert = {
    nom,
    produit_categories: cats,
    adresse:         typeof body?.adresse === 'string' ? body.adresse.trim() || null : null,
    lat:             typeof body?.lat === 'number' ? body.lat : null,
    lng:             typeof body?.lng === 'number' ? body.lng : null,
    place_id_google: typeof body?.place_id_google === 'string' ? body.place_id_google : null,
    commune:         typeof body?.commune === 'string' ? body.commune.trim() || null : null,
    description:     typeof body?.description === 'string' ? body.description.trim() || null : null,
    contact:         typeof body?.contact === 'string' ? body.contact.trim() || null : null,
    site_web:        typeof body?.site_web === 'string' ? body.site_web.trim() || null : null,
    horaires:        typeof body?.horaires === 'string' ? body.horaires.trim() || null : null,
    photos:          Array.isArray(body?.photos) ? body.photos.filter((p: unknown) => typeof p === 'string') : [],
    message:         typeof body?.message === 'string' ? body.message.trim() || null : null,
    user_id:         ctx.userId,
  }

  const { data, error } = await supabaseAdmin
    .from('producer_requests')
    .insert(insert)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await notifyAdmins({
    type:        'claim_pending',
    actor_name:  `🌱 ${nom}`,
    target_type: 'claim',
    target_id:   data?.id,
  })

  return NextResponse.json({ success: true, id: data?.id })
}
