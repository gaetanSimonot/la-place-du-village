import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser } from '@/lib/server-auth'

/**
 * GET /api/conversations/[id]/messages
 *   Renvoie les messages d'une conv (du plus ancien au plus récent).
 *   Garde-fou : auth.uid() doit être membre (vérifié via is_conversation_member).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  // Check membership avant tout
  const { data: membership } = await supabaseAdmin
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', id)
    .eq('user_id', ctx.userId)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Interdit' }, { status: 403 })

  const { data: messages, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Pour les convs kind='friend' : flag canWrite (= toujours amis)
  let canWrite = true
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('kind')
    .eq('id', id)
    .maybeSingle()
  if (conv?.kind === 'friend') {
    const { data: members } = await supabaseAdmin
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', id)
    const otherId = (members ?? []).find(m => m.user_id !== ctx.userId)?.user_id
    if (otherId) {
      const [u1, u2] = ctx.userId < otherId ? [ctx.userId, otherId] : [otherId, ctx.userId]
      const { data: friendship } = await supabaseAdmin
        .from('friendships')
        .select('status')
        .eq('user1_id', u1)
        .eq('user2_id', u2)
        .maybeSingle()
      canWrite = friendship?.status === 'accepted'
    }
  }

  return NextResponse.json({ messages: messages ?? [], canWrite })
}

/**
 * POST /api/conversations/[id]/messages
 *   Body : { content }
 *   Envoie un message dans la conv.
 *   Notifie les autres membres (type 'friend_message').
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  if (!content) return NextResponse.json({ error: 'Message vide' }, { status: 400 })
  if (content.length > 4000) return NextResponse.json({ error: 'Message trop long' }, { status: 400 })

  // Check membership
  const { data: membership } = await supabaseAdmin
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', id)
    .eq('user_id', ctx.userId)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Interdit' }, { status: 403 })

  // GARDE-FOU AMITIÉ : pour les conv kind='friend', les 2 membres doivent
  // être TOUJOURS amis (status='accepted'). Si l'un a retiré l'autre, on
  // bloque l'envoi de nouveaux messages (la conv reste lisible mais figée).
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('kind')
    .eq('id', id)
    .maybeSingle()

  if (conv?.kind === 'friend') {
    const { data: members } = await supabaseAdmin
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', id)
    const otherId = (members ?? []).find(m => m.user_id !== ctx.userId)?.user_id
    if (otherId) {
      const [u1, u2] = ctx.userId < otherId ? [ctx.userId, otherId] : [otherId, ctx.userId]
      const { data: friendship } = await supabaseAdmin
        .from('friendships')
        .select('status')
        .eq('user1_id', u1)
        .eq('user2_id', u2)
        .maybeSingle()
      if (!friendship || friendship.status !== 'accepted') {
        return NextResponse.json({
          error: 'Vous n\'êtes plus amis. Reprenez d\'abord l\'amitié pour discuter à nouveau.',
          code:  'not_friends',
        }, { status: 403 })
      }
    }
  }

  // INSERT message
  const { data: msg, error: insErr } = await supabaseAdmin
    .from('messages')
    .insert({ conversation_id: id, sender_id: ctx.userId, content })
    .select()
    .single()
  if (insErr || !msg) return NextResponse.json({ error: insErr?.message ?? 'Erreur' }, { status: 500 })

  // Notif aux autres membres
  const { data: otherMembers } = await supabaseAdmin
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', id)
    .neq('user_id', ctx.userId)

  if (otherMembers && otherMembers.length > 0) {
    const { data: me } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('user_id', ctx.userId)
      .maybeSingle()
    await Promise.all(otherMembers.map(m =>
      notifyUser(m.user_id, {
        type:        'friend_message',
        actor_name:  me?.display_name || 'Un ami',
        target_type: 'conversation_unified',
        target_id:   id,
      }),
    ))
  }

  return NextResponse.json({ message: msg })
}
