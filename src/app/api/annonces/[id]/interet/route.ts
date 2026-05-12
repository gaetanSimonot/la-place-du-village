import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser } from '@/lib/server-auth'

/**
 * POST — marque un intérêt sur l'annonce.
 * Body : { message?: string }
 * Notifie le posteur (type 'annonce_interet_recu').
 * Idempotent : UNIQUE(annonce_id, user_id) → si déjà marqué, met juste à jour le message.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: annonce } = await supabaseAdmin
    .from('annonces')
    .select('id, user_id, titre, statut')
    .eq('id', id)
    .maybeSingle()

  if (!annonce) return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
  if (annonce.statut !== 'active' && annonce.statut !== 'don_final') {
    return NextResponse.json({ error: 'Annonce non disponible' }, { status: 409 })
  }
  if (annonce.user_id === ctx.userId) {
    return NextResponse.json({ error: 'Vous ne pouvez pas marquer votre propre annonce' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const message = typeof body?.message === 'string' ? body.message.trim() || null : null

  // Upsert sur la contrainte unique (annonce_id, user_id)
  const { error } = await supabaseAdmin
    .from('annonces_interets')
    .upsert(
      { annonce_id: id, user_id: ctx.userId, message },
      { onConflict: 'annonce_id,user_id' },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Récupère le display_name du user qui marque l'intérêt pour la notif
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('user_id', ctx.userId)
    .maybeSingle()

  await notifyUser(annonce.user_id, {
    type:        'annonce_interet_recu',
    actor_name:  profile?.display_name || 'Un utilisateur',
    target_type: 'annonce',
    target_id:   id,
  })

  return NextResponse.json({ success: true })
}

/**
 * DELETE — retire son intérêt sur l'annonce.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { error } = await supabaseAdmin
    .from('annonces_interets')
    .delete()
    .eq('annonce_id', id)
    .eq('user_id', ctx.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
