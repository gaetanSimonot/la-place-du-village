import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyAdmins } from '@/lib/server-auth'

const VALID_TYPES = ['restaurant_bar', 'hebergement', 'artisan_service', 'sante_bien_etre', 'activite']

/**
 * POST — Demande de référencement commerce (user authentifié obligatoire).
 *
 * AUTO-VALIDATION : si la demande contient un place_id_google + type + lat + lng,
 * c'est qu'elle vient de Google Places → on crée directement la fiche en plan
 * basic non revendiquée (statut publie) au lieu de mettre en pending.
 *
 * Sinon, comportement classique : insertion en commerce_requests avec traite=false,
 * notif admin, l'admin valide manuellement.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const nom = String(body?.nom ?? '').trim()
  if (!nom) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })

  const type = body?.type && VALID_TYPES.includes(body.type) ? body.type : null
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

  // ─── Chemin AUTO-VALIDATION (Google a tout fourni) ──────────────────────
  if (placeId && type && lat != null && lng != null) {
    // Évite les doublons : si la fiche Google existe déjà, on la renvoie
    const { data: existing } = await supabaseAdmin
      .from('etablissements')
      .select('id, nom')
      .eq('place_id_google', placeId)
      .maybeSingle()

    if (existing) {
      // On enregistre quand même la "demande" en traite=true pour traçabilité
      await supabaseAdmin.from('commerce_requests').insert({
        nom, type, type_commerce: null, adresse, lat, lng,
        place_id_google: placeId, commune, description, contact,
        site_web: siteWeb, horaires, photos, message,
        user_id: ctx.userId, traite: true,
        etablissement_id: existing.id,
      })
      return NextResponse.json({
        success: true,
        already_exists: true,
        etablissement_id: existing.id,
        message: 'Cette fiche existe déjà sur la plateforme.',
      })
    }

    // Création directe de la fiche
    const descCourte = description && description.length > 180 ? description.slice(0, 177) + '…' : description
    const horairesJson = horaires ? { texte: horaires } : null

    const { data: newEtab, error: createErr } = await supabaseAdmin
      .from('etablissements')
      .insert({
        nom, type, adresse, commune, lat, lng,
        place_id_google: placeId,
        description_courte: descCourte,
        description_longue: description,
        contact_tel: contact,
        site_web: siteWeb,
        horaires: horairesJson,
        photos,
        plan: 'basic',
        is_featured: false,
        statut: 'publie',
        user_id: null,
      })
      .select('id, nom')
      .single()

    if (createErr || !newEtab) {
      return NextResponse.json({ error: createErr?.message ?? 'Erreur création fiche' }, { status: 500 })
    }

    // Trace en commerce_requests (traite=true, link vers la fiche)
    await supabaseAdmin.from('commerce_requests').insert({
      nom, type, type_commerce: null, adresse, lat, lng,
      place_id_google: placeId, commune, description, contact,
      site_web: siteWeb, horaires, photos, message,
      user_id: ctx.userId, traite: true,
      etablissement_id: newEtab.id,
    })

    // Notif info aux admins (pas d'action requise — déjà publié)
    await notifyAdmins({
      type:        'claim_pending',
      actor_name:  `🏪 ${nom} · auto-publié`,
      target_type: 'etablissement',
      target_id:   newEtab.id,
    })

    return NextResponse.json({
      success: true,
      auto_published: true,
      etablissement_id: newEtab.id,
    })
  }

  // ─── Chemin CLASSIQUE (pending — admin doit valider) ────────────────────
  const { data, error } = await supabaseAdmin
    .from('commerce_requests')
    .insert({
      nom, type, type_commerce: null, adresse, lat, lng,
      place_id_google: placeId, commune, description, contact,
      site_web: siteWeb, horaires, photos, message,
      user_id: ctx.userId,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await notifyAdmins({
    type:        'claim_pending',
    actor_name:  `🏪 ${nom}`,
    target_type: 'claim',
    target_id:   data?.id,
  })

  return NextResponse.json({ success: true, id: data?.id })
}
