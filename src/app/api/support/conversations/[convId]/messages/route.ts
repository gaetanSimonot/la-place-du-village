import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser, notifyAdmins } from '@/lib/server-auth'

/**
 * Récupère la conv + vérifie que le user a accès (owner ou admin).
 */
async function getConvAsMember(convId: string, userId: string, isAdmin: boolean) {
  const { data: conv } = await supabaseAdmin
    .from('support_conversations')
    .select('*')
    .eq('id', convId)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  if (!isAdmin && conv.user_id !== userId) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }
  return conv
}

/**
 * GET — Messages d'une conv + marquage en lu des messages venant de l'autre côté.
 * Renvoie : { messages, conversation, user (admin only) }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ convId: string }> },
) {
  const { convId } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const conv = await getConvAsMember(convId, ctx.userId, ctx.isAdmin)
  if (conv instanceof NextResponse) return conv

  const { data: messages, error } = await supabaseAdmin
    .from('support_messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Marque comme lus les messages venant de l'autre côté
  // - admin lit les messages user (sender_is_admin=false)
  // - user lit les messages admin (sender_is_admin=true)
  await supabaseAdmin
    .from('support_messages')
    .update({ lu_at: new Date().toISOString() })
    .eq('conversation_id', convId)
    .eq('sender_is_admin', !ctx.isAdmin)
    .is('lu_at', null)

  // Charge le profil user (utile côté admin pour le header)
  let userInfo: { user_id: string; display_name: string | null; avatar_url: string | null; email: string | null } | null = null
  if (ctx.isAdmin) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .eq('user_id', conv.user_id)
      .maybeSingle()

    const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(conv.user_id)

    userInfo = {
      user_id:      conv.user_id,
      display_name: profile?.display_name ?? null,
      avatar_url:   profile?.avatar_url ?? null,
      email:        authUser?.email ?? null,
    }
  }

  return NextResponse.json({ messages: messages ?? [], conversation: conv, user: userInfo })
}

/**
 * POST — Envoie un message.
 * Body : { content: string }
 * Notif :
 *   - Si admin envoie  → notifyUser(user, support_message)
 *   - Si user envoie   → notifyAdmins(support_message)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ convId: string }> },
) {
  const { convId } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const conv = await getConvAsMember(convId, ctx.userId, ctx.isAdmin)
  if (conv instanceof NextResponse) return conv

  if (conv.statut === 'closed') {
    return NextResponse.json({ error: 'Conversation fermée' }, { status: 409 })
  }

  const body = await req.json().catch(() => ({}))
  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  if (!content) return NextResponse.json({ error: 'Message vide' }, { status: 400 })
  if (content.length > 2000) return NextResponse.json({ error: 'Message trop long' }, { status: 400 })

  const { data: msg, error } = await supabaseAdmin
    .from('support_messages')
    .insert({
      conversation_id: convId,
      sender_id:       ctx.userId,
      sender_is_admin: ctx.isAdmin,
      content,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: senderProfile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('user_id', ctx.userId)
    .maybeSingle()

  const actorName = senderProfile?.display_name || ctx.email || (ctx.isAdmin ? 'Équipe La Place du Village' : 'Un utilisateur')

  if (ctx.isAdmin) {
    // Admin → user
    await notifyUser(conv.user_id, {
      type:        'support_message',
      actor_name:  'Équipe La Place du Village',
      target_type: 'support_conversation',
      target_id:   convId,
    })
  } else {
    // User → tous les admins
    await notifyAdmins({
      type:        'support_message',
      actor_name:  actorName,
      target_type: 'support_conversation',
      target_id:   convId,
    })
  }

  return NextResponse.json({ message: msg })
}
