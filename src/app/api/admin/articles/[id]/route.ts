import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

type Patch = {
  statut?: 'en_attente' | 'valide' | 'refuse' | 'publie'
  refus_motif?: string | null
  titre?: string
  corps?: string
  photo_url?: string | null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = (await req.json()) as Patch

  const update: Record<string, unknown> = {}
  if (body.statut)                  update.statut = body.statut
  if (body.refus_motif !== undefined) update.refus_motif = body.refus_motif
  if (body.titre !== undefined)     update.titre = body.titre.trim()
  if (body.corps !== undefined)     update.corps = body.corps.trim()
  if (body.photo_url !== undefined) update.photo_url = body.photo_url

  const { data, error } = await supabaseAdmin
    .from('articles_journal')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ article: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { error } = await supabaseAdmin
    .from('articles_journal')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
