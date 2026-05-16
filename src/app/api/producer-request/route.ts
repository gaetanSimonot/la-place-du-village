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
 *
 * AUTO-VALIDATION : si place_id_google + lat + lng + ≥1 produit_categorie,
 * c'est validé par Google → on crée directement la fiche producers.
 * Sinon, pending (l'admin valide).
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

  const placeId = typeof body?.place_id_google === 'string' ? body.place_id_google : null
  const lat = typeof body?.lat === 'number' ? body.lat : null
  const lng = typeof body?.lng === 'number' ? body.lng : null
  const adresse = typeof body?.adresse === 'string' ? body.adresse.trim() || null : null
  const commune = typeof body?.commune === 'string' ? body.commune.trim() || null : null
  const description = typeof body?.description === 'string' ? body.description.trim() || null : null
  const contact = typeof body?.contact === 'string' ? body.contact.trim() || null : null
  const siteWeb = typeof body?.site_web === 'string' ? body.site_web.trim() || null : null
  const horaires = typeof body?.horaires === 'string' ? body.horaires.trim() || null : null
  const photos = Array.isArray(body?.photos) ? body.photos.filter((p: unknown) => typeof p === 'string') : []
  const message = typeof body?.message === 'string' ? body.message.trim() || null : null

  // ─── Chemin AUTO-VALIDATION (Google + catégories OK) ────────────────────
  if (placeId && lat != null && lng != null && cats.length > 0) {
    // Évite les doublons
    const { data: existing } = await supabaseAdmin
      .from('producers')
      .select('id, nom')
      .eq('place_id_google', placeId)
      .maybeSingle()

    if (existing) {
      await supabaseAdmin.from('producer_requests').insert({
        nom, produit_categories: cats, adresse, lat, lng,
        place_id_google: placeId, commune, description, contact,
        site_web: siteWeb, horaires, photos, message,
        user_id: ctx.userId, traite: true,
        producer_id: existing.id,
      })
      return NextResponse.json({
        success: true,
        already_exists: true,
        producer_id: existing.id,
      })
    }

    const descCourte = description && description.length > 180 ? description.slice(0, 177) + '…' : description

    const { data: newProd, error: createErr } = await supabaseAdmin
      .from('producers')
      .insert({
        nom,
        description_courte: descCourte,
        description_longue: description,
        commune, adresse, lat, lng,
        place_id_google: placeId,
        contact_tel: contact,
        site_web: siteWeb,
        produit_categories: cats,
        photos,
        user_id: null,
      })
      .select('id, nom')
      .single()

    if (createErr || !newProd) {
      return NextResponse.json({ error: createErr?.message ?? 'Erreur création fiche' }, { status: 500 })
    }

    await supabaseAdmin.from('producer_requests').insert({
      nom, produit_categories: cats, adresse, lat, lng,
      place_id_google: placeId, commune, description, contact,
      site_web: siteWeb, horaires, photos, message,
      user_id: ctx.userId, traite: true,
      producer_id: newProd.id,
    })

    await notifyAdmins({
      type:        'claim_pending',
      actor_name:  `🌱 ${nom} · auto-publié`,
      target_type: 'producer',
      target_id:   newProd.id,
    })

    return NextResponse.json({
      success: true,
      auto_published: true,
      producer_id: newProd.id,
    })
  }

  // ─── Chemin CLASSIQUE (pending) ─────────────────────────────────────────
  const { data, error } = await supabaseAdmin
    .from('producer_requests')
    .insert({
      nom, produit_categories: cats, adresse, lat, lng,
      place_id_google: placeId, commune, description, contact,
      site_web: siteWeb, horaires, photos, message,
      user_id: ctx.userId,
    })
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
