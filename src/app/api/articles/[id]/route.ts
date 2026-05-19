import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { validateArticleInput } from '@/lib/articles'

type Patch = Partial<{
  titre: string
  corps: string
  photo_url: string | null
  statut: 'brouillon' | 'en_attente'
}>

async function loadOwn(userId: string, id: string) {
  const { data } = await supabaseAdmin
    .from('articles_journal')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  if (data.user_id !== userId) return null
  return data
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const { id } = await params
  const row = await loadOwn(ctx.userId, id)
  if (!row) return NextResponse.json({ error: 'Article introuvable' }, { status: 404 })
  return NextResponse.json({ article: row })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const { id } = await params
  const row = await loadOwn(ctx.userId, id)
  if (!row) return NextResponse.json({ error: 'Article introuvable' }, { status: 404 })
  // On n'autorise les modifs que tant que l'article n'est pas publié.
  if (row.statut === 'publie') {
    return NextResponse.json({ error: 'Cet article est déjà publié, il ne peut plus être modifié.' }, { status: 409 })
  }

  const body = (await req.json()) as Patch

  // Si on soumet (statut='en_attente'), validation stricte
  if (body.statut === 'en_attente') {
    const titre = body.titre ?? row.titre
    const corps = body.corps ?? row.corps
    const err = validateArticleInput({ titre, corps, photo_url: body.photo_url ?? row.photo_url })
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (body.titre !== undefined)     update.titre = body.titre.trim()
  if (body.corps !== undefined)     update.corps = body.corps.trim()
  if (body.photo_url !== undefined) update.photo_url = body.photo_url
  if (body.statut !== undefined)    update.statut = body.statut

  const { data, error } = await supabaseAdmin
    .from('articles_journal')
    .update(update)
    .eq('id', id)
    .eq('user_id', ctx.userId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ article: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const { id } = await params
  const row = await loadOwn(ctx.userId, id)
  if (!row) return NextResponse.json({ error: 'Article introuvable' }, { status: 404 })
  if (row.statut === 'publie') {
    return NextResponse.json({ error: 'Cet article est publié, contacte un admin pour le retirer.' }, { status: 409 })
  }
  const { error } = await supabaseAdmin
    .from('articles_journal')
    .delete()
    .eq('id', id)
    .eq('user_id', ctx.userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
