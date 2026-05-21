import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser } from '@/lib/server-auth'

/**
 * POST — le passager note le conducteur après un trajet terminé.
 *
 * Conditions :
 *  - conv.statut = 'validee' (le conducteur avait accepté le passager)
 *  - covoit.is_completed = true (le conducteur a marqué le trajet comme effectué)
 *  - user = candidat (passager)
 *  - UNIQUE(conversation_id) → un seul rating par conv passager x trajet
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
    .from('covoit_conversations')
    .select('*')
    .eq('id', convId)
    .maybeSingle()

  if (!conv)                              return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  if (conv.candidat_id !== ctx.userId)    return NextResponse.json({ error: 'Seul le passager peut noter le conducteur' }, { status: 403 })
  if (conv.statut !== 'validee')          return NextResponse.json({ error: 'La place n\'a pas été confirmée' }, { status: 409 })

  // Le trajet doit être marqué terminé par le conducteur
  const { data: covoit } = await supabaseAdmin
    .from('covoiturages')
    .select('id, is_completed, user_id')
    .eq('id', conv.covoit_id)
    .maybeSingle()

  if (!covoit)                            return NextResponse.json({ error: 'Trajet introuvable' }, { status: 404 })
  if (!covoit.is_completed)               return NextResponse.json({ error: 'Le trajet n\'a pas encore été marqué comme effectué' }, { status: 409 })

  const body = await req.json().catch(() => ({}))
  const note    = Number(body?.note)
  const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, 1000) || null : null

  if (!Number.isInteger(note) || note < 1 || note > 5) {
    return NextResponse.json({ error: 'Note invalide (1 à 5)' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('covoit_ratings')
    .insert({
      conversation_id: convId,
      covoit_id:       conv.covoit_id,
      passager_id:     ctx.userId,
      conducteur_id:   conv.conducteur_id,
      note,
      comment,
    })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Vous avez déjà noté ce conducteur pour ce trajet' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Notif au conducteur — "Tu as reçu une note ⭐"
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('user_id', ctx.userId)
    .maybeSingle()

  await notifyUser(conv.conducteur_id, {
    type:        'covoit_note_recue',
    actor_name:  profile?.display_name || 'Un passager',
    target_type: 'covoit_conversation',
    target_id:   convId,
  })

  return NextResponse.json({ success: true })
}
