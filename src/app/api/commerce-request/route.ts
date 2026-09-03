import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyAdmins } from '@/lib/server-auth'

const VALID_TYPES = ['restaurant_bar', 'hebergement', 'artisan_service', 'sante_bien_etre', 'activite']

/**
 * Quota d'établissements soumis par personne (admin illimité).
 *
 * La soumission étant AUTO-PUBLIÉE sans relecture, c'est le seul frein au
 * remplissage en série. Dérogation individuelle possible via
 * profiles.etab_quota (cf. scripts/2026-08-29_quota_etablissements.sql).
 *
 * Même esprit que MAX_CLAIMS_PER_MONTH dans /api/etablissements/[id]/claim.
 */
const QUOTA_ETAB_DEFAUT = 3

/**
 * Renvoie une réponse 429 si la personne a atteint son quota d'établissements,
 * null sinon. Les admins ne sont jamais limités.
 *
 * Ce qui COMPTE : ses fiches déjà créées (etablissement_id renseigné) et ses
 * demandes encore en attente de validation (traite=false).
 *
 * Ce qui ne compte pas — tous repérés par `type_commerce`, la colonne qui sert
 * déjà de discriminant au quota des revendications :
 *   - 'claim'         revendication d'une fiche existante (quota séparé, 3/mois)
 *   - 'doublon'       le lieu Google était déjà référencé, rien n'a été ajouté
 *   - 'admin_contact' demande exceptionnelle adressée à l'équipe
 * Ni les demandes rejetées par l'admin (traitées sans fiche) : le quota se
 * libère, sinon un refus pénaliserait la personne à vie.
 *
 * Dérogation individuelle : profiles.etab_quota (NULL = QUOTA_ETAB_DEFAUT).
 * Cf. scripts/2026-08-29_quota_etablissements.sql pour l'accorder.
 */
async function refusSiQuotaAtteint(
  ctx: { userId: string; isAdmin: boolean },
): Promise<NextResponse | null> {
  if (ctx.isAdmin) return null

  const { data: profil } = await supabaseAdmin
    .from('profiles')
    .select('etab_quota')
    .eq('user_id', ctx.userId)
    .maybeSingle()

  const quota = typeof profil?.etab_quota === 'number' ? profil.etab_quota : QUOTA_ETAB_DEFAUT

  const { count } = await supabaseAdmin
    .from('commerce_requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .is('type_commerce', null)
    .or('etablissement_id.not.is.null,traite.eq.false')

  const dejaSoumis = count ?? 0
  if (dejaSoumis < quota) return null

  return NextResponse.json({
    error: `Vous avez déjà référencé ${dejaSoumis} établissement${dejaSoumis > 1 ? 's' : ''} (limite : ${quota}). Écrivez-nous pour en ajouter davantage.`,
    quotaReached: true,
    count: dejaSoumis,
    limit: quota,
  }, { status: 429 })
}

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
      // On enregistre quand même la "demande" en traite=true pour traçabilité.
      // type_commerce='doublon' : la fiche existait déjà, la personne n'a rien
      // ajouté → cette ligne ne doit pas consommer son quota (cf. plus haut).
      await supabaseAdmin.from('commerce_requests').insert({
        nom, type, type_commerce: 'doublon', adresse, lat, lng,
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

    // Quota — vérifié APRÈS le doublon : quelqu'un au plafond qui soumet un
    // lieu déjà référencé doit l'apprendre plutôt que se heurter à la limite,
    // il n'ajoute rien à la plateforme. Et AVANT toute écriture.
    const refusAuto = await refusSiQuotaAtteint(ctx)
    if (refusAuto) return refusAuto

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
        user_id: null,
        // statut EXPLICITE — ne PAS laisser le DEFAULT de la table.
        // Le DEFAULT vaut 'imported', or la lecture publique
        // (/api/etablissements) ne renvoie que 'publie' | 'actif' : une fiche
        // laissée au DEFAULT n'apparaît donc jamais sur la carte ni dans
        // l'annuaire, et aucun écran ne la repêche ensuite. Elle reste
        // pourtant trouvable via la recherche (requête directe sans filtre de
        // statut) → "elle est dans la liste mais pas sur la carte".
        // 'publie' est refusé par le CHECK : la valeur visible est 'actif'.
        statut: 'actif',
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
  // Le quota s'applique aussi ici : une demande en attente finira en fiche, et
  // sans ce garde-fou on pourrait noyer la file de modération.
  const refusPending = await refusSiQuotaAtteint(ctx)
  if (refusPending) return refusPending

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
