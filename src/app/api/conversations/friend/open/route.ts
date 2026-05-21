import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { normalizePair } from '@/lib/friendships'

/**
 * POST /api/conversations/friend/open
 *
 * Body : { user_id }
 *
 * Ouvre ou crée la conversation avec un ami.
 *
 * GARDE-FOU CONSENTEMENT : les 2 users DOIVENT être amis (status='accepted'
 * dans friendships). Sans amitié → 403. Empêche les DM aux étrangers.
 *
 * Renvoie : { conversation_id }
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const targetId = typeof body?.user_id === 'string' ? body.user_id : null

  if (!targetId) return NextResponse.json({ error: 'user_id manquant' }, { status: 400 })
  if (targetId === ctx.userId) return NextResponse.json({ error: 'Impossible avec soi-même' }, { status: 400 })

  // GARDE-FOU : vérifier amitié
  const [u1, u2] = normalizePair(ctx.userId, targetId)
  const { data: friendship } = await supabaseAdmin
    .from('friendships')
    .select('id, status')
    .eq('user1_id', u1)
    .eq('user2_id', u2)
    .maybeSingle()

  if (!friendship || friendship.status !== 'accepted') {
    return NextResponse.json({ error: 'Vous devez être amis pour ouvrir une conversation' }, { status: 403 })
  }

  // Cherche une conv kind='friend' existante entre les 2
  // Une conv existante = 1 row dans conversations + 2 rows dans conversation_members
  // avec les 2 user_ids. On cherche les convs où je suis membre, puis on filtre.
  const { data: myConvIds } = await supabaseAdmin
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', ctx.userId)

  if (myConvIds && myConvIds.length > 0) {
    const ids = myConvIds.map(m => m.conversation_id)
    // Parmi mes convs, lesquelles ont aussi le target comme membre ?
    const { data: shared } = await supabaseAdmin
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', targetId)
      .in('conversation_id', ids)

    if (shared && shared.length > 0) {
      const sharedIds = shared.map(s => s.conversation_id)
      // Vérifier qu'au moins une est de kind='friend'
      const { data: friendConv } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .in('id', sharedIds)
        .eq('kind', 'friend')
        .maybeSingle()
      if (friendConv) {
        return NextResponse.json({ conversation_id: friendConv.id, created: false })
      }
    }
  }

  // Pas de conv existante → on crée
  const { data: newConv, error: convErr } = await supabaseAdmin
    .from('conversations')
    .insert({ kind: 'friend' })
    .select()
    .single()
  if (convErr || !newConv) return NextResponse.json({ error: convErr?.message ?? 'Erreur création conv' }, { status: 500 })

  // Insère les 2 membres
  const { error: memErr } = await supabaseAdmin
    .from('conversation_members')
    .insert([
      { conversation_id: newConv.id, user_id: ctx.userId },
      { conversation_id: newConv.id, user_id: targetId },
    ])
  if (memErr) {
    // Rollback : supprime la conv si erreur d'insert membres
    await supabaseAdmin.from('conversations').delete().eq('id', newConv.id)
    return NextResponse.json({ error: memErr.message }, { status: 500 })
  }

  return NextResponse.json({ conversation_id: newConv.id, created: true })
}
