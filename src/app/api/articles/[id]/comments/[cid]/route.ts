import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * PATCH — édite son propre commentaire
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const { cid } = await params

  const { content } = (await req.json().catch(() => ({}))) as { content?: string }
  const c = (content ?? '').trim()
  if (!c) return NextResponse.json({ error: 'Vide' }, { status: 400 })

  // Vérifie ownership
  const { data: existing } = await supabaseAdmin
    .from('article_comments')
    .select('user_id')
    .eq('id', cid)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  if (existing.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('article_comments')
    .update({ content: c })
    .eq('id', cid)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comment: data })
}

/**
 * DELETE — supprime son propre commentaire
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const { cid } = await params

  const { data: existing } = await supabaseAdmin
    .from('article_comments')
    .select('user_id')
    .eq('id', cid)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  if (existing.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('article_comments')
    .delete()
    .eq('id', cid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
