import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

type Params = { params: Promise<{ id: string }> }

/** POST — toggle "J'aime" sur un sujet (1 like / personne / sujet). */
export async function POST(req: NextRequest, { params }: Params) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const { data: topic } = await supabaseAdmin
    .from('forum_topics').select('id').eq('id', id).maybeSingle()
  if (!topic) return NextResponse.json({ error: 'Sujet introuvable' }, { status: 404 })

  const { data: existing } = await supabaseAdmin
    .from('forum_topic_likes')
    .select('topic_id')
    .eq('topic_id', id).eq('user_id', ctx.userId).maybeSingle()

  let liked: boolean
  if (existing) {
    const { error } = await supabaseAdmin
      .from('forum_topic_likes').delete()
      .eq('topic_id', id).eq('user_id', ctx.userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    liked = false
  } else {
    const { error } = await supabaseAdmin
      .from('forum_topic_likes')
      .insert({ topic_id: id, user_id: ctx.userId })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    liked = true
  }
  return NextResponse.json({ liked })
}
