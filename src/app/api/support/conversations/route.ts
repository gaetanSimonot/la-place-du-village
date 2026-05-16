import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyAdmins } from '@/lib/server-auth'

/**
 * POST — Crée une conversation support pour le user courant + 1er message.
 * Body : { message: string }
 * Renvoie : { conversation }
 *
 * Une nouvelle conv est créée à chaque appel (chaque "ticket" est distinct).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'Message vide' }, { status: 400 })
  if (message.length > 2000) return NextResponse.json({ error: 'Message trop long' }, { status: 400 })

  // Subject = 80 premiers caractères du message
  const subject = message.length > 80 ? message.slice(0, 77) + '…' : message

  const { data: conv, error: convErr } = await supabaseAdmin
    .from('support_conversations')
    .insert({ user_id: ctx.userId, subject })
    .select()
    .single()

  if (convErr || !conv) {
    return NextResponse.json({ error: convErr?.message ?? 'Erreur conversation' }, { status: 500 })
  }

  const { error: msgErr } = await supabaseAdmin
    .from('support_messages')
    .insert({
      conversation_id: conv.id,
      sender_id:       ctx.userId,
      sender_is_admin: false,
      content:         message,
    })

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 })
  }

  // Notif aux admins
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('user_id', ctx.userId)
    .maybeSingle()

  await notifyAdmins({
    type:        'support_message',
    actor_name:  profile?.display_name || ctx.email || 'Un utilisateur',
    target_type: 'support_conversation',
    target_id:   conv.id,
  })

  return NextResponse.json({ conversation: conv })
}

/**
 * GET — Liste les conversations support.
 *   - Si user normal : ses propres convs
 *   - Si admin       : toutes les convs (avec profil user enrichi)
 *
 * Chaque item est enrichi de last_message + unread_count.
 *   - Pour user : unread = messages admin non-lus
 *   - Pour admin : unread = messages user non-lus
 */
export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const q = supabaseAdmin
    .from('support_conversations')
    .select('*')
    .order('updated_at', { ascending: false })

  const { data: convs, error } = ctx.isAdmin
    ? await q
    : await q.eq('user_id', ctx.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!convs?.length) return NextResponse.json({ conversations: [] })

  // Last message + unread count par conv
  const convIds = convs.map(c => c.id)
  const { data: msgs } = await supabaseAdmin
    .from('support_messages')
    .select('*')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: false })

  const lastByConv: Record<string, unknown> = {}
  const unreadByConv: Record<string, number> = {}
  for (const m of msgs ?? []) {
    if (!lastByConv[m.conversation_id]) lastByConv[m.conversation_id] = m
    // unread du point de vue du lecteur
    const fromOtherSide = ctx.isAdmin ? !m.sender_is_admin : m.sender_is_admin
    if (fromOtherSide && !m.lu_at) {
      unreadByConv[m.conversation_id] = (unreadByConv[m.conversation_id] ?? 0) + 1
    }
  }

  // Profil user pour chaque conv (admin only)
  let userMap: Record<string, { user_id: string; display_name: string | null; avatar_url: string | null; email: string | null }> = {}
  if (ctx.isAdmin) {
    const userIds = Array.from(new Set(convs.map(c => c.user_id)))
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', userIds)

    const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.user_id, p]))

    // Emails depuis auth.users (profiles.email peut être null)
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
    const emailMap = Object.fromEntries((users ?? []).map(u => [u.id, u.email ?? null]))

    userMap = Object.fromEntries(userIds.map(uid => [uid, {
      user_id:      uid,
      display_name: profileMap[uid]?.display_name ?? null,
      avatar_url:   profileMap[uid]?.avatar_url ?? null,
      email:        emailMap[uid] ?? null,
    }]))
  }

  const enriched = convs.map(c => ({
    ...c,
    user:         userMap[c.user_id] ?? null,
    last_message: lastByConv[c.id] ?? null,
    unread_count: unreadByConv[c.id] ?? 0,
  }))

  return NextResponse.json({ conversations: enriched })
}
