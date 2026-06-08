import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

type Params = { params: Promise<{ id: string }> }

/** POST — voter au sondage d'un sujet (1 vote/personne, modifiable). */
export async function POST(req: NextRequest, { params }: Params) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const { id: topicId } = await params

  const body = await req.json().catch(() => ({}))
  const optionIndex = Number(body?.option_index)

  const { data: topic } = await supabaseAdmin
    .from('forum_topics').select('poll').eq('id', topicId).maybeSingle()
  const poll = topic?.poll as { options?: unknown[] } | null
  if (!poll || !Array.isArray(poll.options)) {
    return NextResponse.json({ error: 'Pas de sondage sur ce sujet' }, { status: 400 })
  }
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) {
    return NextResponse.json({ error: 'Choix invalide' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('forum_poll_votes')
    .upsert({ topic_id: topicId, user_id: ctx.userId, option_index: optionIndex }, { onConflict: 'topic_id,user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
