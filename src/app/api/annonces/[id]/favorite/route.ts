import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * Toggle favori sur une annonce.
 *  - GET    : { favorited: boolean }
 *  - POST   : toggle (insert si pas là, delete sinon) → { favorited: boolean }
 *
 * Pattern identique à /api/evenements/[id]/favorite.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return NextResponse.json({ favorited: false })

  const { data } = await supabaseAdmin
    .from('annonce_favorites')
    .select('id')
    .eq('user_id', ctx.userId)
    .eq('annonce_id', id)
    .maybeSingle()

  return NextResponse.json({ favorited: !!data })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: existing } = await supabaseAdmin
    .from('annonce_favorites')
    .select('id')
    .eq('user_id', ctx.userId)
    .eq('annonce_id', id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabaseAdmin
      .from('annonce_favorites')
      .delete()
      .eq('user_id', ctx.userId)
      .eq('annonce_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ favorited: false })
  }

  const { error } = await supabaseAdmin
    .from('annonce_favorites')
    .insert({ user_id: ctx.userId, annonce_id: id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ favorited: true })
}
