import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser } from '@/lib/server-auth'

/**
 * POST — l'acheteur note le vendeur après une vente conclue.
 *
 * Conditions :
 *  - conv.statut = 'closed'
 *  - user = acheteur
 *  - UNIQUE(conversation_id) → un seul rating par vente
 *
 * Body : { note: 1..5, comment?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ convId: string }> },
) {
  const { convId } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: conv } = await supabaseAdmin
    .from('annonces_conversations')
    .select('*')
    .eq('id', convId)
    .maybeSingle()

  if (!conv)                                  return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  if (conv.acheteur_id !== ctx.userId)        return NextResponse.json({ error: 'Seul l\'acheteur peut noter le vendeur' }, { status: 403 })
  if (conv.statut !== 'closed')               return NextResponse.json({ error: 'La vente n\'est pas encore conclue' }, { status: 409 })

  const body = await req.json().catch(() => ({}))
  const note    = Number(body?.note)
  const comment = typeof body?.comment === 'string' ? body.comment.trim() || null : null

  if (!Number.isInteger(note) || note < 1 || note > 5) {
    return NextResponse.json({ error: 'Note invalide (1 à 5)' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('annonces_ratings')
    .insert({
      conversation_id: convId,
      annonce_id:      conv.annonce_id,
      acheteur_id:     ctx.userId,
      vendeur_id:      conv.vendeur_id,
      note,
      comment,
    })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Vous avez déjà noté ce vendeur' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Notif vendeur
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('user_id', ctx.userId)
    .maybeSingle()

  await notifyUser(conv.vendeur_id, {
    type:        'annonce_note_recue',
    actor_name:  profile?.display_name || 'Un acheteur',
    target_type: 'conversation',
    target_id:   convId,
  })

  return NextResponse.json({ success: true })
}
