import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * POST /api/moments/[id]/like — bascule le like de l'utilisateur courant.
 * Retourne { liked, likes } (état + nouveau compteur).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: existing } = await supabaseAdmin
    .from('moment_likes')
    .select('moment_id')
    .eq('moment_id', params.id)
    .eq('user_id', ctx.userId)
    .maybeSingle()

  let liked: boolean
  if (existing) {
    await supabaseAdmin.from('moment_likes').delete().eq('moment_id', params.id).eq('user_id', ctx.userId)
    liked = false
  } else {
    const { error } = await supabaseAdmin.from('moment_likes').insert({ moment_id: params.id, user_id: ctx.userId })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    liked = true
  }

  const { count } = await supabaseAdmin
    .from('moment_likes')
    .select('moment_id', { count: 'exact', head: true })
    .eq('moment_id', params.id)

  return NextResponse.json({ liked, likes: count ?? 0 })
}
