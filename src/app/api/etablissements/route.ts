import { NextRequest, NextResponse } from 'next/server'
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

  let query = supabaseAdmin
    .from('etablissements')
    .select('id, type, nom, commune, lat, lng, photos, note_google, is_featured, statut, description_courte, plan, user_id')
    .in('statut', ['publie', 'actif'])
    .order('is_featured', { ascending: false })
    .order('nom')

  if (type) query = query.eq('type', type)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const etabs = (data ?? []) as EtabRow[]
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
