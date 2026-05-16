import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, getUserContextFromRequest } from '@/lib/server-auth'
import { can } from '@/lib/capabilities'
import { EARLY_BID_DELAY_HOURS } from '@/lib/annonces'

const EDITABLE_FIELDS = [
  'titre',
  'description',
  'categorie',
  'photos',
  'prix_initial',
  'prix_seuil',
  'taux_baisse_pct',
  'contact_tel',
  'contact_email',
  'ville',
  'lat',
  'lng',
  'remise_main_propre',
] as const

/**
 * GET — détail public d'une annonce (visible si active ou don_final).
 * Le posteur voit aussi ses annonces vendues/expirées.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('annonces')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })

  // Si annonce non visible publiquement, vérifie que c'est le posteur
  if (data.statut !== 'active' && data.statut !== 'don_final') {
    const ctx = await requireUser(req)
    if (ctx instanceof Response) return ctx
    if (ctx.userId !== data.user_id && !ctx.isAdmin) {
      return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
    }
  }

  // Délai 12h sur les enchères inversées pour les users sans early_bid_access.
  // Le posteur lui-même voit toujours son annonce.
  if (data.type === 'enchere_inversee' && data.statut === 'active') {
    const ctx = await getUserContextFromRequest(req)
    const isOwner = ctx?.userId === data.user_id
    const hasEarlyAccess = ctx ? can(ctx, 'early_bid_access') : false

    if (!isOwner && !hasEarlyAccess) {
      const ageMs = Date.now() - new Date(data.created_at).getTime()
      if (ageMs < EARLY_BID_DELAY_HOURS * 60 * 60 * 1000) {
        return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
      }
    }
  }

  return NextResponse.json({ annonce: data })
}

/**
 * PATCH — édition d'une annonce (owner ou admin).
 * Le type ne peut pas être modifié après création.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: existing } = await supabaseAdmin
    .from('annonces')
    .select('user_id, statut')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
  if (existing.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }
  if (existing.statut !== 'active' && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Annonce non modifiable' }, { status: 409 })
  }

  const body = await req.json()
  const patch: Record<string, unknown> = {}
  for (const k of EDITABLE_FIELDS) {
    if (k in body) patch[k] = body[k] === '' ? null : body[k]
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à modifier' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('annonces')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ annonce: data })
}

/**
 * DELETE — suppression définitive (owner ou admin).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: existing } = await supabaseAdmin
    .from('annonces')
    .select('user_id')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
  if (existing.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('annonces').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
