import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { validateCovoitInput, type CovoitFormInput } from '@/lib/covoiturage'

/**
 * GET /api/covoiturages
 *
 * Liste publique des trajets actifs ou complets, à partir d'aujourd'hui.
 * Query params (tous optionnels) :
 *   - depart, destination (filtre LIKE partiel)
 *   - date (YYYY-MM-DD : trajets >= cette date)
 *   - limit (default 50)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const depart      = searchParams.get('depart')?.trim()
  const destination = searchParams.get('destination')?.trim()
  const dateMin     = searchParams.get('date')?.trim()
  const limit       = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200)

  const today = new Date().toISOString().slice(0, 10)
  let q = supabaseAdmin
    .from('covoiturages')
    .select('*')
    .neq('statut', 'annule')
    .gte('date_trajet', dateMin && dateMin >= today ? dateMin : today)
    .order('date_trajet', { ascending: true })
    .order('heure_depart', { ascending: true })
    .limit(limit)

  if (depart)      q = q.ilike('depart', `%${depart}%`)
  if (destination) q = q.ilike('destination', `%${destination}%`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrichit avec le profil conducteur (display_name + avatar)
  const userIds = Array.from(new Set((data ?? []).map(c => c.user_id)))
  let profiles: Record<string, { display_name: string | null; avatar_url: string | null }> = {}
  if (userIds.length > 0) {
    const { data: profs } = await supabaseAdmin
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', userIds)
    profiles = Object.fromEntries(
      ((profs ?? []) as { user_id: string; display_name: string | null; avatar_url: string | null }[])
        .map(p => [p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url }]),
    )
  }

  const enriched = (data ?? []).map(c => ({
    ...c,
    conducteur: profiles[c.user_id] ?? null,
  }))

  return NextResponse.json({ covoiturages: enriched })
}

/**
 * POST /api/covoiturages
 *
 * Crée un nouveau trajet. Le conducteur = user authentifié.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = (await req.json().catch(() => ({}))) as Partial<CovoitFormInput>

  const input: CovoitFormInput = {
    depart:        (body.depart ?? '').trim(),
    destination:   (body.destination ?? '').trim(),
    date_trajet:   (body.date_trajet ?? '').trim(),
    heure_depart:  body.heure_depart?.trim() || null,
    prix:          Number(body.prix ?? 0),
    places:        Number(body.places ?? 1),
    point_recup:   body.point_recup?.trim() || null,
    fumeur:        !!body.fumeur,
    animaux:       !!body.animaux,
    bagages:       body.bagages !== false,
    description:   body.description?.trim() || null,
  }

  const err = validateCovoitInput(input)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('covoiturages')
    .insert({
      user_id: ctx.userId,
      ...input,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ covoiturage: data })
}
