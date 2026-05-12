import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser } from '@/lib/server-auth'

/**
 * POST — clôt la vente depuis le chat. Réservé au vendeur (décision finale).
 *
 * Effets :
 *  - annonce.statut = 'vendu', vendu_at = now()
 *  - conv.statut = 'closed', closed_at = now(), closed_by = vendeur_id
 *  - message-système (kind='system_closed') posté dans la conv
 *  - notif à l'acheteur
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

  if (!conv) return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  if (conv.vendeur_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Seul le vendeur peut conclure la vente' }, { status: 403 })
  }
  if (conv.statut === 'closed') return NextResponse.json({ success: true, alreadyClosed: true })

  const now = new Date().toISOString()

  await supabaseAdmin
    .from('annonces')
    .update({ statut: 'vendu', vendu_at: now })
    .eq('id', conv.annonce_id)
    .eq('statut', 'active')

  await supabaseAdmin
    .from('annonces_conversations')
    .update({ statut: 'closed', closed_at: now, closed_by: ctx.userId })
    .eq('id', convId)

  await supabaseAdmin.from('annonces_messages').insert({
    conversation_id: convId,
    sender_id:       ctx.userId,
    kind:            'system_closed',
    content:         'Le vendeur a conclu la vente.',
  })

  await notifyUser(conv.acheteur_id, {
    type:        'annonce_vente_close',
    actor_name:  'Le vendeur',
    target_type: 'conversation',
    target_id:   convId,
  })

  return NextResponse.json({ success: true })
}
