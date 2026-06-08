import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

type Params = { params: Promise<{ id: string }> }

/** PATCH — éditer sa propre réponse (marquée "modifié"). */
export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const { data: c } = await supabaseAdmin
    .from('forum_comments').select('user_id').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Réponse introuvable' }, { status: 404 })
  if (c.user_id !== ctx.userId) {
    return NextResponse.json({ error: 'Seul l\'auteur peut éditer' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const texte = typeof body?.texte === 'string' ? body.texte.trim() : ''
  if (texte.length < 1 || texte.length > 5000) {
    return NextResponse.json({ error: 'Message vide ou trop long' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('forum_comments')
    .update({ texte, edited_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, topic_id, user_id, texte, reply_to_id, edited_at, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comment: data })
}

/** DELETE — supprimer une réponse (auteur ou admin = modération). */
export async function DELETE(req: NextRequest, { params }: Params) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const { data: c } = await supabaseAdmin
    .from('forum_comments').select('user_id').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Réponse introuvable' }, { status: 404 })
  if (c.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('forum_comments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
