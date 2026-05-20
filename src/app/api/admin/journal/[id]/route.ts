import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyAllUsers } from '@/lib/server-auth'

type Patch = Partial<{
  cover_kicker: string
  cover_titre: string
  cover_deck: string
  cover_image_url: string | null
  billet_titre: string
  billet_corps: string
  saviez_vous: string
  temps_lecture_min: number
  meteo: { temp?: number; vent?: string; conditions?: string } | null
  selection_event_ids: string[]
  selection_annonce_ids: string[]
  selection_bonplan_ids: string[]
  selection_article_id: string | null
  spotlight_etab_id: string | null
  spotlight_kind: 'etablissement' | 'producteur'
  statut: 'brouillon' | 'publie'
}>

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('journaux_hebdo')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ journal: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = (await req.json()) as Patch
  const update: Record<string, unknown> = {}

  for (const [k, v] of Object.entries(body)) {
    update[k] = v
  }

  // Si on bascule en publié, on tague l'article sélectionné comme publié
  // et on date publie_at.
  if (body.statut === 'publie') {
    update.publie_at = new Date().toISOString()
    if (body.selection_article_id) {
      await supabaseAdmin
        .from('articles_journal')
        .update({ statut: 'publie', journal_id: id })
        .eq('id', body.selection_article_id)
    }
  }

  const { data, error } = await supabaseAdmin
    .from('journaux_hebdo')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Invalide le cache Next.js pour que la page publique affiche les modifs
  // tout de suite (sinon ça reste sur l'ancienne version à cause du cache).
  try {
    revalidatePath(`/journal/${data.numero}`)
    revalidatePath('/journal')
    revalidatePath('/')   // tuile homepage
  } catch {
    // revalidatePath peut throw hors d'un context request, ignore
  }

  // Broadcast notif si on vient de publier (fail-silent)
  if (body.statut === 'publie') {
    await notifyAllUsers({
      type:        'journal_publie',
      actor_name:  'Le Journal du Village',
      target_type: 'journal',
      target_id:   id,
    })
  }

  return NextResponse.json({ journal: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  // Charge le numero AVANT delete pour revalidate la page publique
  const { data: existing } = await supabaseAdmin
    .from('journaux_hebdo')
    .select('numero')
    .eq('id', id)
    .maybeSingle()

  // Si un article était publié dans ce numéro, on le repasse en 'valide'
  await supabaseAdmin
    .from('articles_journal')
    .update({ statut: 'valide', journal_id: null })
    .eq('journal_id', id)

  const { error, count } = await supabaseAdmin
    .from('journaux_hebdo')
    .delete({ count: 'exact' })
    .eq('id', id)
  if (error) {
    console.error('[admin/journal DELETE] failed', { id, error })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  console.log('[admin/journal DELETE] ok', { id, deleted_count: count })

  // Invalide le cache des pages dépendantes
  try {
    if (existing?.numero != null) revalidatePath(`/journal/${existing.numero}`)
    revalidatePath('/journal')
    revalidatePath('/')
  } catch {}

  return NextResponse.json({ ok: true, deleted: count ?? 0 })
}
