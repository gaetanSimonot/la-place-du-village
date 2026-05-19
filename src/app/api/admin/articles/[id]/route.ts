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

  let attachedTo: { numero: number } | null = null

  // Si on passe l'article en "valide" : tenter de l'attacher au journal courant
  // (= dernier numéro publié) s'il n'en a pas déjà un. Sinon → reste en
  // file d'attente pour le prochain cron.
  if (body.statut === 'valide') {
    const { data: currentJournal } = await supabaseAdmin
      .from('journaux_hebdo')
      .select('id, numero, selection_article_id')
      .eq('statut', 'publie')
      .order('publie_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (currentJournal && !currentJournal.selection_article_id) {
      // Place libre : on attache + on publie l'article
      update.statut = 'publie'
      update.journal_id = currentJournal.id
      await supabaseAdmin
        .from('journaux_hebdo')
        .update({ selection_article_id: id })
        .eq('id', currentJournal.id)
      attachedTo = { numero: currentJournal.numero }
    }
    // Sinon : statut reste 'valide', il rejoindra le prochain numéro automatiquement
  }

  const { data, error } = await supabaseAdmin
    .from('articles_journal')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ article: data, attachedTo })
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
