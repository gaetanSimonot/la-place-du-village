import { NextRequest, NextResponse } from 'next/server'
import { territoireDeLaRequete } from '@/lib/territoires'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { mergeDraft, shouldApplyDraft } from '@/lib/etab-drafts'

interface EtabRow extends Record<string, unknown> {
  id: string
  type: string | null
  nom: string
  commune: string | null
  lat: number | null
  lng: number | null
  photos: string[] | null
  note_google: number | null
  is_featured: boolean | null
  statut: string | null
  description_courte: string | null
  plan: string | null
  user_id: string | null
}

interface DraftRow {
  etablissement_id: string
  user_id: string
  fields: Record<string, unknown>
}

interface ProfileRow {
  user_id: string
  plan: string | null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  /*
   * PostgREST plafonne une réponse à 1000 lignes, et l'annuaire en compte
   * davantage : la carte s'arrêtait donc à 1000 fiches, et le compteur de la
   * colonne de filtres annonçait « 1000 » comme s'il n'y avait rien au-delà.
   * On demande les lots les uns après les autres jusqu'à en recevoir un
   * incomplet — c'est le signe qu'on tient la fin.
   *
   * Une borne dure à 10 lots protège d'une boucle sans fin si la limite du
   * serveur changeait un jour : mieux vaut une liste tronquée qu'un onglet
   * qui tourne à vide.
   */
  const PAR_LOT = 1000
  const MAX_LOTS = 10
  const lignes: EtabRow[] = []

  // Le territoire regarde. Filtre pose UNIQUEMENT s'il est connu : sinon un
  // echec de lecture viderait l'annuaire pour tout le monde.
  const terr = await territoireDeLaRequete(req.url)

  for (let lot = 0; lot < MAX_LOTS; lot++) {
    let query = supabaseAdmin
      .from('etablissements')
      .select('id, type, nom, commune, lat, lng, photos, note_google, is_featured, statut, description_courte, plan, user_id')
      .in('statut', ['publie', 'actif'])
      .order('is_featured', { ascending: false })
      .order('nom')
      // `id` en dernier critère : sans un tri total, deux lignes de même nom
      // peuvent changer d'ordre entre deux lots et se retrouver en double ou
      // manquer à l'appel.
      .order('id')
      .range(lot * PAR_LOT, lot * PAR_LOT + PAR_LOT - 1)

    if (terr) query = query.eq('territoire_id', terr.id)
    if (type) query = query.eq('type', type)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const recues = (data ?? []) as EtabRow[]
    lignes.push(...recues)
    if (recues.length < PAR_LOT) break
  }

  const etabs = lignes
  if (!etabs.length) return NextResponse.json({ etablissements: [] })

  // Récupère les drafts et plans des proprios pour appliquer le merge
  const etabIds = etabs.map(e => e.id)
  const ownerIds = Array.from(new Set(etabs.map(e => e.user_id).filter(Boolean) as string[]))

  const [draftsRes, profilesRes] = await Promise.all([
    ownerIds.length
      ? supabaseAdmin
          .from('etablissement_drafts')
          .select('etablissement_id, user_id, fields')
          .in('etablissement_id', etabIds)
          .in('user_id', ownerIds)
      : Promise.resolve({ data: [] }),
    ownerIds.length
      ? supabaseAdmin
          .from('profiles')
          .select('user_id, plan')
          .in('user_id', ownerIds)
      : Promise.resolve({ data: [] }),
  ])

  const drafts = (draftsRes.data ?? []) as DraftRow[]
  const profiles = (profilesRes.data ?? []) as ProfileRow[]

  const draftByEtab: Record<string, DraftRow> = {}
  for (const d of drafts) draftByEtab[d.etablissement_id] = d

  const profileByUser: Record<string, ProfileRow> = {}
  for (const p of profiles) profileByUser[p.user_id] = p

  const merged = etabs.map(etab => {
    if (!etab.user_id) return etab
    const draft = draftByEtab[etab.id]
    if (!draft) return etab
    const ownerPlan = profileByUser[etab.user_id]?.plan
    if (!shouldApplyDraft({ etabUserId: etab.user_id, draftUserId: draft.user_id, ownerPlan })) return etab
    return mergeDraft(etab, draft.fields)
  })

  return NextResponse.json({ etablissements: merged })
}
