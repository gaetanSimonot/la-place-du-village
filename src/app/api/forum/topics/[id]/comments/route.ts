import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { validerIdentiteDemandee } from '@/lib/identite'

type Params = { params: Promise<{ id: string }> }

/** POST — répondre à un sujet (tout user connecté). Citation via reply_to_id. */
export async function POST(req: NextRequest, { params }: Params) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const { id: topicId } = await params

  const body = await req.json().catch(() => ({}))
  const texte = typeof body?.texte === 'string' ? body.texte.trim() : ''
  if (texte.length < 1 || texte.length > 5000) {
    return NextResponse.json({ error: 'Message vide ou trop long' }, { status: 400 })
  }
  const replyTo = typeof body?.reply_to_id === 'string' ? body.reply_to_id : null

  const { data: topic } = await supabaseAdmin
    .from('forum_topics').select('id').eq('id', topicId).maybeSingle()
  if (!topic) return NextResponse.json({ error: 'Sujet introuvable' }, { status: 404 })

  // Blase : répondre sous une fiche exige que la fiche soit attribuée.
  const blase = await validerIdentiteDemandee(supabaseAdmin, ctx.userId, body?.etablissement_id)
  if (blase === false) {
    return NextResponse.json({ error: 'Vous ne gérez pas cette fiche' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('forum_comments')
    .insert({ topic_id: topicId, user_id: ctx.userId, texte, reply_to_id: replyTo, etablissement_id: blase })
    .select('id, topic_id, user_id, texte, reply_to_id, edited_at, created_at, etablissement_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comment: data }, { status: 201 })
}
