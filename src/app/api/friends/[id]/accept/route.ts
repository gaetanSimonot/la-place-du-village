import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser } from '@/lib/server-auth'

/**
 * POST /api/friends/[id]/accept — accepter une demande d'ami.
 *
 * Conditions :
 *   - friendship.status = 'pending'
 *   - auth.uid() est l'un des 2 participants
 *   - auth.uid() <> requested_by (= je suis le destinataire, pas l'initiateur)
 *
 * Effet : status → 'accepted' + notif à l'initiateur.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(_req)
  if (ctx instanceof Response) return ctx

  const { data: f } = await supabaseAdmin
    .from('friendships')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!f) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })
  if (f.user1_id !== ctx.userId && f.user2_id !== ctx.userId) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }
  if (f.status !== 'pending') {
    return NextResponse.json({ error: 'Cette demande n\'est plus en attente' }, { status: 409 })
  }
  if (f.requested_by === ctx.userId) {
    return NextResponse.json({ error: 'Tu ne peux pas accepter ta propre demande' }, { status: 409 })
  }

  const { data: updated, error } = await supabaseAdmin
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notif à l'initiateur
  const { data: me } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('user_id', ctx.userId)
    .maybeSingle()
  await notifyUser(f.requested_by, {
    type:        'friend_request_accepted',
    actor_name:  me?.display_name || 'Un membre',
    target_type: 'friendship',
    target_id:   id,
  })

  return NextResponse.json({ friendship: updated })
}
