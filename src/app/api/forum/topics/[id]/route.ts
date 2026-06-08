import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

type Params = { params: Promise<{ id: string }> }

/** PATCH — épingler (admin) ou éditer titre/corps (auteur ou admin). */
export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const { data: topic } = await supabaseAdmin
    .from('forum_topics').select('user_id').eq('id', id).maybeSingle()
  if (!topic) return NextResponse.json({ error: 'Sujet introuvable' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  const isOwnerOrAdmin = topic.user_id === ctx.userId || ctx.isAdmin

  // Épingler : admin uniquement
  if (typeof body?.pinned === 'boolean') {
    if (!ctx.isAdmin) return NextResponse.json({ error: 'Admin uniquement' }, { status: 403 })
    patch.pinned = body.pinned
  }
  // Éditer : auteur ou admin
  if (typeof body?.titre === 'string' && isOwnerOrAdmin) {
    const t = body.titre.trim()
    if (t) patch.titre = t.slice(0, 200)
  }
  if ('corps' in body && isOwnerOrAdmin) {
    patch.corps = typeof body.corps === 'string' ? (body.corps.trim().slice(0, 5000) || null) : null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier (ou non autorisé)' }, { status: 400 })
  }
  patch.updated_at = new Date().toISOString()

  const { error } = await supabaseAdmin.from('forum_topics').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** DELETE — supprimer un sujet (auteur ou admin). Cascade sur les réponses. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const { data: topic } = await supabaseAdmin
    .from('forum_topics').select('user_id').eq('id', id).maybeSingle()
  if (!topic) return NextResponse.json({ error: 'Sujet introuvable' }, { status: 404 })
  if (topic.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('forum_topics').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
