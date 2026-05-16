import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin, notifyUser } from '@/lib/server-auth'

interface ProducerRequest {
  id: string
  user_id: string | null
  nom: string
  description: string | null
  contact: string | null
  site_web: string | null
  horaires: string | null
  adresse: string | null
  commune: string | null
  lat: number | null
  lng: number | null
  place_id_google: string | null
  produit_categories: string[] | null
  photos: string[] | null
  message: string | null
  traite: boolean
  producer_id: string | null
  created_at: string
}

interface ProfileSummary {
  user_id: string
  display_name: string | null
  email: string | null
  avatar_url: string | null
  plan: string | null
}

/**
 * GET — liste des demandes producteur non traitées.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { data: requests, error } = await supabaseAdmin
    .from('producer_requests')
    .select('*')
    .eq('traite', false)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list = (requests ?? []) as ProducerRequest[]
  if (!list.length) return NextResponse.json({ demandes: [] })

  const userIds = Array.from(new Set(list.map(r => r.user_id).filter(Boolean) as string[]))
  const { data: profiles } = userIds.length
    ? await supabaseAdmin.from('profiles').select('user_id, display_name, email, avatar_url, plan').in('user_id', userIds)
    : { data: [] as ProfileSummary[] }

  const profilesById = Object.fromEntries(((profiles ?? []) as ProfileSummary[]).map(p => [p.user_id, p]))

  const demandes = list.map(r => ({
    ...r,
    requester: r.user_id ? profilesById[r.user_id] ?? null : null,
  }))

  return NextResponse.json({ demandes })
}

/**
 * PATCH body : { id, action: 'approve_create' | 'reject' }
 *
 * approve_create : crée la fiche `producers` depuis les infos de la demande,
 *                  marque traite=true, notif user.
 * reject : marque traite=true + notif rejet.
 */
export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { id, action } = await req.json().catch(() => ({}))
  if (!id || !['approve_create', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
  }

  const { data: demande } = await supabaseAdmin
    .from('producer_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!demande) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })
  const r = demande as ProducerRequest

  if (action === 'approve_create') {
    if (!r.adresse || r.lat == null || r.lng == null) {
      return NextResponse.json({ error: 'Demande incomplète (adresse/coordonnées manquants)' }, { status: 400 })
    }

    const { data: newProd, error: createErr } = await supabaseAdmin
      .from('producers')
      .insert({
        nom:                 r.nom,
        description_courte:  r.description?.slice(0, 200) ?? null,
        description_longue:  r.description ?? null,
        commune:             r.commune,
        adresse:             r.adresse,
        lat:                 r.lat,
        lng:                 r.lng,
        place_id_google:     r.place_id_google,
        contact_tel:         r.contact,
        site_web:            r.site_web,
        horaires:            r.horaires,
        produit_categories:  r.produit_categories ?? [],
        photos:              r.photos ?? [],
        user_id:             null,
      })
      .select('id, nom')
      .single()

    if (createErr || !newProd) {
      return NextResponse.json({ error: createErr?.message ?? 'Erreur création fiche' }, { status: 500 })
    }

    await supabaseAdmin
      .from('producer_requests')
      .update({ traite: true, producer_id: newProd.id })
      .eq('id', id)

    if (r.user_id) {
      await notifyUser(r.user_id, {
        type:        'claim_approved',
        actor_name:  `🌱 ${newProd.nom}`,
        target_type: 'producer',
        target_id:   newProd.id,
      })
    }

    return NextResponse.json({ success: true, action, producer_id: newProd.id })
  }

  // reject
  if (r.user_id) {
    await notifyUser(r.user_id, {
      type:        'claim_rejected',
      actor_name:  r.nom,
      target_type: 'producer',
    })
  }

  await supabaseAdmin.from('producer_requests').update({ traite: true }).eq('id', id)
  return NextResponse.json({ success: true, action })
}
