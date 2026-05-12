import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * POST — marque l'annonce comme vendue (owner uniquement).
 * Pas de body. Idempotent : si déjà vendue, renvoie OK.
 */
export async function POST(
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

  if (existing.statut === 'vendu') {
    return NextResponse.json({ success: true })
  }
  if (existing.statut !== 'active') {
    return NextResponse.json({ error: 'Annonce non active' }, { status: 409 })
  }

  const { error } = await supabaseAdmin
    .from('annonces')
    .update({ statut: 'vendu', vendu_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
