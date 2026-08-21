import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * Favori sur un événement.
 *  - GET    : { favorited: boolean, rappelJours: number }
 *  - POST   : toggle (insert si pas là, delete sinon) → { favorited: boolean }
 *  - PATCH  : { rappelJours } → combien de jours avant l'événement prévenir
 *             (0 = le jour même, 1 = la veille, jusqu'à 7)
 *
 * Pattern identique à /api/producers/[id]/favorite et /api/etablissements/[id]/favorite.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return NextResponse.json({ favorited: false })

  // select('*') plutôt que de nommer rappel_jours : la colonne peut ne pas
  // encore exister si la migration n'a pas été jouée, et nommer une colonne
  // absente fait échouer toute la requête — le cœur s'afficherait vide.
  const { data } = await supabaseAdmin
    .from('event_favorites')
    .select('*')
    .eq('user_id', ctx.userId)
    .eq('event_id', id)
    .maybeSingle()

  return NextResponse.json({ favorited: !!data, rappelJours: data?.rappel_jours ?? 1 })
}

/** Change le délai de rappel d'un favori existant. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const n = Number(body?.rappelJours)
  // Borné côté serveur, comme la contrainte CHECK en base : le client peut
  // envoyer n'importe quoi.
  if (!Number.isFinite(n)) return NextResponse.json({ error: 'rappelJours invalide' }, { status: 400 })
  const rappel = Math.min(7, Math.max(0, Math.round(n)))

  const { error } = await supabaseAdmin
    .from('event_favorites')
    .update({ rappel_jours: rappel })
    .eq('user_id', ctx.userId)
    .eq('event_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rappelJours: rappel })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: existing } = await supabaseAdmin
    .from('event_favorites')
    .select('id')
    .eq('user_id', ctx.userId)
    .eq('event_id', id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabaseAdmin
      .from('event_favorites')
      .delete()
      .eq('user_id', ctx.userId)
      .eq('event_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ favorited: false })
  }

  const { error } = await supabaseAdmin
    .from('event_favorites')
    .insert({ user_id: ctx.userId, event_id: id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ favorited: true })
}
