import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * GET /api/covoiturages/[id] — détail d'un trajet (public).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { data: covoit, error } = await supabaseAdmin
    .from('covoiturages')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!covoit) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  const { data: prof } = await supabaseAdmin
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('user_id', covoit.user_id)
    .maybeSingle()

  return NextResponse.json({ covoiturage: { ...covoit, conducteur: prof ?? null } })
}

/**
 * PATCH /api/covoiturages/[id] — modifie statut ou champs.
 * Conducteur uniquement (ou admin).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: existing } = await supabaseAdmin
    .from('covoiturages')
    .select('user_id')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  if (existing.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  // Whitelist des champs éditables
  const allowed = ['depart', 'destination', 'date_trajet', 'heure_depart',
                   'prix', 'places', 'point_recup', 'fumeur', 'animaux',
                   'bagages', 'description', 'statut'] as const
  const update: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) update[k] = body[k]
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('covoiturages')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ covoiturage: data })
}

/**
 * DELETE /api/covoiturages/[id] — supprime (conducteur ou admin).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: existing } = await supabaseAdmin
    .from('covoiturages')
    .select('user_id')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  if (existing.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('covoiturages').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
