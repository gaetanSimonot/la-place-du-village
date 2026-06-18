import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notifyAdmins, requireUser } from '@/lib/server-auth'
import { mergeCategories } from '@/lib/categories'
import type { CorrectionField } from '@/lib/types'

/**
 * POST /api/evenements/[id]/corrections
 *
 * Un utilisateur authentifié propose une correction sur un événement : il a
 * édité la fiche dans le modal d'édition, on stocke ici le draft complet +
 * la liste des champs réellement modifiés (pour le surlignage côté admin),
 * et on notifie les admins ("Correction proposée par <user>").
 *
 * Aucune écriture sur l'événement : la fiche n'est mise à jour QU'À la
 * validation admin (POST /api/admin/corrections/[id]/resolve).
 */

// Normalise une valeur scalaire pour comparaison ('' / null / undefined → '')
const norm = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim())

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  try {
    const body = await req.json()

    // ── Draft proposé (mêmes clés que le PATCH event) ──────────────────────
    const titre = String(body.titre ?? '').trim().slice(0, 300)
    if (!titre) {
      return NextResponse.json({ error: 'Le titre est requis' }, { status: 400 })
    }
    const cats = mergeCategories(Array.isArray(body.categories) ? body.categories : null)
    const changes = {
      titre,
      description:      body.description == null ? null : String(body.description).slice(0, 5000),
      date_debut:      body.date_debut || null,
      date_fin:        body.date_fin || null,
      heure:           body.heure || null,
      categorie:       cats[0],
      categories:      cats,
      lieu_nom:        body.lieu_nom == null ? null : String(body.lieu_nom).slice(0, 300),
      commune:         body.commune == null ? null : String(body.commune).slice(0, 200),
      adresse:         body.adresse == null ? null : String(body.adresse).slice(0, 400),
      lat:             body.lat == null || body.lat === '' ? null : Number(body.lat),
      lng:             body.lng == null || body.lng === '' ? null : Number(body.lng),
      place_id_google: body.place_id_google || null,
      prix:            body.prix == null ? null : String(body.prix).slice(0, 200),
      contact:         body.contact == null ? null : String(body.contact).slice(0, 300),
      organisateurs:   body.organisateurs == null ? null : String(body.organisateurs).slice(0, 300),
      image_url:       body.image_url || null,
      image_position:  body.image_position || '50% 50%',
    }

    // ── Event actuel (pour le diff) ────────────────────────────────────────
    const { data: current, error: curErr } = await supabaseAdmin
      .from('evenements')
      .select('*, lieux(*)')
      .eq('id', params.id)
      .single()
    if (curErr || !current) {
      return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 })
    }
    const lieu = current.lieux ?? {}

    // ── Calcul des champs réellement modifiés ──────────────────────────────
    const changed: CorrectionField[] = []
    if (norm(changes.titre)       !== norm(current.titre))       changed.push('titre')
    if (norm(changes.description) !== norm(current.description)) changed.push('description')
    if (norm(changes.date_debut)  !== norm(current.date_debut))  changed.push('date_debut')
    if (norm(changes.date_fin)    !== norm(current.date_fin))    changed.push('date_fin')
    if (norm(changes.heure).slice(0, 5) !== norm(current.heure).slice(0, 5)) changed.push('heure')
    if (norm(changes.prix)          !== norm(current.prix))          changed.push('prix')
    if (norm(changes.contact)       !== norm(current.contact))       changed.push('contact')
    if (norm(changes.organisateurs) !== norm(current.organisateurs)) changed.push('organisateurs')
    if (norm(changes.image_url)     !== norm(current.image_url))     changed.push('image')

    // Catégories : comparaison ensembliste (ordre ignoré)
    const curCats = mergeCategories(Array.isArray(current.categories) ? current.categories : [current.categorie])
    if ([...changes.categories].sort().join(',') !== [...curCats].sort().join(',')) changed.push('categories')

    // Lieu : un seul flag si l'un des sous-champs change
    const lieuChanged =
      norm(changes.lieu_nom) !== norm(lieu.nom) ||
      norm(changes.commune)  !== norm(lieu.commune) ||
      norm(changes.adresse)  !== norm(lieu.adresse) ||
      norm(changes.lat)      !== norm(lieu.lat) ||
      norm(changes.lng)      !== norm(lieu.lng)
    if (lieuChanged) changed.push('lieu')

    if (changed.length === 0) {
      return NextResponse.json({ error: 'Aucune modification détectée' }, { status: 400 })
    }

    // ── Nom du proposeur (pour la notif) ───────────────────────────────────
    const { data: prof } = await supabaseAdmin
      .from('profiles')
      .select('display_name, username')
      .eq('user_id', ctx.userId)
      .maybeSingle()
    const proposeurNom = prof?.display_name?.trim() || prof?.username?.trim() || 'Un utilisateur'

    // ── Insert correction ──────────────────────────────────────────────────
    const { data: correction, error: insErr } = await supabaseAdmin
      .from('event_corrections')
      .insert({
        evenement_id:   params.id,
        proposeur_id:   ctx.userId,
        proposeur_nom:  proposeurNom,
        changes,
        changed_fields: changed,
        statut:         'en_attente',
      })
      .select('id')
      .single()
    if (insErr) throw new Error(insErr.message)

    // ── Notif admin (best-effort) ──────────────────────────────────────────
    await notifyAdmins({
      type:        'correction_proposee',
      actor_name:  proposeurNom,
      target_type: 'event',
      target_id:   params.id,
    }).catch(() => {})

    return NextResponse.json({ success: true, id: correction.id })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 })
  }
}
