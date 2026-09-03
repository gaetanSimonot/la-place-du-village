import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin, notifyUser } from '@/lib/server-auth'

interface CommerceRequest {
  id: string
  nom: string
  type_commerce: string | null
  commune: string | null
  contact: string | null
  message: string | null
  traite: boolean
  created_at: string
  etablissement_id: string | null
  user_id: string | null
}

interface EtabSummary {
  id: string
  nom: string
  commune: string | null
  type: string | null
  photos: string[] | null
  user_id: string | null
}

interface ProfileSummary {
  user_id: string
  display_name: string | null
  email: string | null
  avatar_url: string | null
  plan: string | null
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { data: requests, error } = await supabaseAdmin
    .from('commerce_requests')
    .select('*')
    .eq('traite', false)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list = (requests ?? []) as CommerceRequest[]
  if (!list.length) return NextResponse.json({ demandes: [] })

  // Jointures séparées (cf. consigne projet : pas de jointures implicites PostgREST)
  const etabIds = Array.from(new Set(list.map(r => r.etablissement_id).filter(Boolean) as string[]))
  const userIds = Array.from(new Set(list.map(r => r.user_id).filter(Boolean) as string[]))

  const [etabsRes, profilesRes] = await Promise.all([
    etabIds.length
      ? supabaseAdmin.from('etablissements').select('id, nom, commune, type, photos, user_id').in('id', etabIds)
      : Promise.resolve({ data: [] as EtabSummary[] }),
    userIds.length
      ? supabaseAdmin.from('profiles').select('user_id, display_name, email, avatar_url, plan').in('user_id', userIds)
      : Promise.resolve({ data: [] as ProfileSummary[] }),
  ])

  const etabsById   = Object.fromEntries(((etabsRes.data ?? []) as EtabSummary[]).map(e => [e.id, e]))
  const profilesById = Object.fromEntries(((profilesRes.data ?? []) as ProfileSummary[]).map(p => [p.user_id, p]))

  const demandes = list.map(r => ({
    ...r,
    etablissement: r.etablissement_id ? etabsById[r.etablissement_id] ?? null : null,
    requester: r.user_id ? profilesById[r.user_id] ?? null : null,
  }))

  return NextResponse.json({ demandes })
}

/**
 * PATCH body : { id, action: 'approve' | 'reject' }
 *
 * approve + claim (etablissement_id != null) :
 *   - vérifie que l'établissement n'est pas déjà revendiqué
 *   - assigne etablissements.user_id = requester.user_id
 *   - marque la demande traite=true
 *   - notifie le requester (claim_approved)
 *
 * approve sans claim (commerce_request anonyme "mon commerce n'est pas listé") :
 *   - marque traite=true (l'admin créera la fiche manuellement)
 *
 * reject :
 *   - marque traite=true
 *   - notifie le requester (claim_rejected) si on a son user_id
 */
export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { id, action } = await req.json()
  if (!id || !['approve', 'reject', 'approve_create'].includes(action)) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
  }

  const { data: demande } = await supabaseAdmin
    .from('commerce_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!demande) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })
  const req_row = demande as CommerceRequest & {
    type: string | null
    adresse: string | null
    lat: number | null
    lng: number | null
    place_id_google: string | null
    description: string | null
    site_web: string | null
    horaires: string | null
    photos: string[] | null
  }

  // approve_create : crée une nouvelle fiche etablissements depuis les infos de la demande
  if (action === 'approve_create') {
    if (!req_row.type || !req_row.adresse || req_row.lat == null || req_row.lng == null) {
      return NextResponse.json({ error: 'Demande incomplète (type/adresse/coordonnées manquants)' }, { status: 400 })
    }

    // Mapping demande → schéma etablissements :
    //  - description (demande) → description_longue + troncature pour description_courte
    //  - horaires (text libre) → jsonb { texte: ... } pour respecter le schéma jsonb
    //  - contact → contact_tel
    const description = req_row.description ?? null
    const descCourte  = description && description.length > 180 ? description.slice(0, 177) + '…' : description
    const horairesJson = req_row.horaires ? { texte: req_row.horaires } : null

    const { data: newEtab, error: createErr } = await supabaseAdmin
      .from('etablissements')
      .insert({
        nom:                 req_row.nom,
        type:                req_row.type,
        adresse:             req_row.adresse,
        commune:             req_row.commune ?? null,
        lat:                 req_row.lat,
        lng:                 req_row.lng,
        place_id_google:     req_row.place_id_google ?? null,
        description_courte:  descCourte,
        description_longue:  description,
        contact_tel:         req_row.contact ?? null,
        site_web:            req_row.site_web ?? null,
        horaires:            horairesJson,
        photos:              req_row.photos ?? [],
        plan:                'basic',
        is_featured:         false,
        user_id:             null, // fiche non revendiquée
        // statut EXPLICITE — le DEFAULT ('imported') est invisible côté
        // public : /api/etablissements ne renvoie que 'publie' | 'actif'.
        // L'admin vient de valider la demande, la fiche doit être visible.
        // 'publie' est refusé par le CHECK : la valeur visible est 'actif'.
        statut:              'actif',
      })
      .select('id, nom')
      .single()

    if (createErr || !newEtab) {
      return NextResponse.json({ error: createErr?.message ?? 'Erreur création fiche' }, { status: 500 })
    }

    await supabaseAdmin
      .from('commerce_requests')
      .update({ traite: true, etablissement_id: newEtab.id })
      .eq('id', id)

    if (req_row.user_id) {
      await notifyUser(req_row.user_id, {
        type:        'claim_approved',
        actor_name:  `🏪 ${newEtab.nom}`,
        target_type: 'etablissement',
        target_id:   newEtab.id,
      })
    }

    return NextResponse.json({ success: true, action, etablissement_id: newEtab.id })
  }

  if (action === 'approve' && req_row.etablissement_id && req_row.user_id) {
    // Vérifie que l'établissement n'a pas été revendiqué entretemps
    const { data: etab } = await supabaseAdmin
      .from('etablissements')
      .select('user_id, nom')
      .eq('id', req_row.etablissement_id)
      .maybeSingle()

    if (!etab) {
      return NextResponse.json({ error: 'Établissement introuvable' }, { status: 404 })
    }
    if (etab.user_id && etab.user_id !== req_row.user_id) {
      return NextResponse.json({ error: 'Établissement déjà revendiqué par un autre user' }, { status: 409 })
    }

    // Récupère le plan du user qui revendique : la fiche prend ce plan
    // (cohérent avec etablissements.plan = source de vérité par fiche pour
    // les features de visibilité — bandeau, splash, newsletter)
    const { data: reqProfile } = await supabaseAdmin
      .from('profiles')
      .select('plan')
      .eq('user_id', req_row.user_id)
      .maybeSingle()

    const userPlan = (reqProfile?.plan as 'basic'|'habitants'|'pro') ?? 'basic'

    const { error: upErr } = await supabaseAdmin
      .from('etablissements')
      .update({
        user_id: req_row.user_id,
        plan: userPlan,
        is_featured: userPlan === 'pro',
      })
      .eq('id', req_row.etablissement_id)

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    await notifyUser(req_row.user_id, {
      type: 'claim_approved',
      actor_name: etab.nom,
      target_type: 'etablissement',
      target_id: req_row.etablissement_id,
    })
  } else if (action === 'reject' && req_row.user_id) {
    await notifyUser(req_row.user_id, {
      type: 'claim_rejected',
      actor_name: req_row.nom,
      target_type: 'etablissement',
      target_id: req_row.etablissement_id ?? undefined,
    })
  }

  // Dans tous les cas : marque traite=true
  const { error: traiteErr } = await supabaseAdmin
    .from('commerce_requests')
    .update({ traite: true })
    .eq('id', id)

  if (traiteErr) return NextResponse.json({ error: traiteErr.message }, { status: 500 })

  return NextResponse.json({ success: true, action })
}
