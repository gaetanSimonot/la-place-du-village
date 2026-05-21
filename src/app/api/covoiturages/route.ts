import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { validateCovoitInput, type CovoitFormInput } from '@/lib/covoiturage'

/**
 * GET /api/covoiturages
 *
 * Liste publique des trajets actifs ou complets, à partir d'aujourd'hui,
 * non-terminés (is_completed = false).
 * Query params (tous optionnels) :
 *   - depart, destination (filtre LIKE partiel)
 *   - date (YYYY-MM-DD : trajets >= cette date)
 *   - sens (aller | retour | aller_retour)
 *   - regulier (true | false)
 *   - prix_max (number)
 *   - detour_max (number, minutes)
 *   - limit (default 50)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const depart      = searchParams.get('depart')?.trim()
  const destination = searchParams.get('destination')?.trim()
  const dateMin     = searchParams.get('date')?.trim()
  const sens        = searchParams.get('sens')?.trim()
  const regulier    = searchParams.get('regulier')?.trim()
  const prixMaxRaw  = searchParams.get('prix_max')?.trim()
  const detourMaxRaw= searchParams.get('detour_max')?.trim()
  const limit       = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200)

  const today = new Date().toISOString().slice(0, 10)
  let q = supabaseAdmin
    .from('covoiturages')
    .select('*')
    .neq('statut', 'annule')
    .eq('is_completed', false)
    .gte('date_trajet', dateMin && dateMin >= today ? dateMin : today)
    .order('date_trajet', { ascending: true })
    .order('heure_depart', { ascending: true })
    .limit(limit)

  if (depart)      q = q.ilike('depart', `%${depart}%`)
  if (destination) q = q.ilike('destination', `%${destination}%`)
  if (sens === 'aller' || sens === 'retour' || sens === 'aller_retour') {
    q = q.eq('sens', sens)
  }
  if (regulier === 'true')  q = q.eq('regulier', true)
  if (regulier === 'false') q = q.eq('regulier', false)
  if (prixMaxRaw) {
    const n = Number(prixMaxRaw)
    if (Number.isFinite(n) && n >= 0) q = q.lte('prix', n)
  }
  if (detourMaxRaw) {
    const n = Number(detourMaxRaw)
    if (Number.isFinite(n) && n >= 0) q = q.lte('detour_minutes', n)
  }

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

  const allowedJours = ['lu', 'ma', 'me', 'je', 've', 'sa', 'di'] as const
  const allowedSens  = ['aller', 'retour', 'aller_retour'] as const
  type JourSemaineLocal = typeof allowedJours[number]
  type SensLocal        = typeof allowedSens[number]
  const rawJours: unknown[] = Array.isArray(body.jours_semaine) ? body.jours_semaine : []
  const jours_semaine = rawJours
    .filter((j): j is JourSemaineLocal => typeof j === 'string' && (allowedJours as ReadonlyArray<string>).includes(j))
  const sensVal: SensLocal = typeof body.sens === 'string' && (allowedSens as ReadonlyArray<string>).includes(body.sens)
    ? (body.sens as SensLocal)
    : 'aller'
  const detour = Number(body.detour_minutes ?? 0)

  const input: CovoitFormInput = {
    depart:         (body.depart ?? '').trim(),
    destination:    (body.destination ?? '').trim(),
    date_trajet:    (body.date_trajet ?? '').trim(),
    heure_depart:   body.heure_depart?.trim() || null,
    heure_arrivee:  body.heure_arrivee?.trim() || null,
    prix:           Number(body.prix ?? 0),
    places:         Number(body.places ?? 1),
    point_recup:    body.point_recup?.trim() || null,
    vehicule:       body.vehicule?.trim() || null,
    fumeur:         !!body.fumeur,
    animaux:        !!body.animaux,
    bagages:        body.bagages !== false,
    description:    body.description?.trim() || null,
    regulier:       !!body.regulier,
    jours_semaine:  jours_semaine,
    sens:           sensVal,
    detour_minutes: Number.isFinite(detour) && detour >= 0 && detour <= 60 ? detour : 0,
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
