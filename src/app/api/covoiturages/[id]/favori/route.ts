import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * GET — état du favori pour le user courant.
 * Renvoie : { favori: boolean }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const { data } = await supabaseAdmin
    .from('covoit_favoris')
    .select('user_id')
    .eq('user_id', ctx.userId)
    .eq('covoit_id', id)
    .maybeSingle()
  return NextResponse.json({ favori: !!data })
}

/**
 * POST — toggle (ajoute si pas présent, sinon retire). Idempotent.
 * Renvoie : { favori: boolean } — nouvel état.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: existing } = await supabaseAdmin
    .from('covoit_favoris')
    .select('user_id')
    .eq('user_id', ctx.userId)
    .eq('covoit_id', id)
    .maybeSingle()

  if (existing) {
    await supabaseAdmin
      .from('covoit_favoris')
      .delete()
      .eq('user_id', ctx.userId)
      .eq('covoit_id', id)
    return NextResponse.json({ favori: false })
  }

  // Vérifie que le trajet existe avant insert (FK fera de toute façon le travail)
  const { data: covoit } = await supabaseAdmin
    .from('covoiturages')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (!covoit) return NextResponse.json({ error: 'Trajet introuvable' }, { status: 404 })

  const { error } = await supabaseAdmin
    .from('covoit_favoris')
    .insert({ user_id: ctx.userId, covoit_id: id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ favori: true })
}
