import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * GET /api/conversations
 *
 * Liste les conversations dont je suis membre, enrichies avec :
 *   - kind
 *   - other_member (profil de l'autre user pour kind='friend')
 *   - last_message
 *   - unread_count (= messages.created_at > last_read_at && sender_id <> me)
 *
 * Query (optionnel) : ?kind=friend pour filtrer
 */
export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { searchParams } = new URL(req.url)
  const kindFilter = searchParams.get('kind')

  // 1. Mes appartenances (avec last_read_at)
  const { data: myMembers, error: memErr } = await supabaseAdmin
    .from('conversation_members')
    .select('conversation_id, last_read_at')
    .eq('user_id', ctx.userId)

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })
  if (!myMembers?.length) return NextResponse.json({ conversations: [] })

  const convIds = myMembers.map(m => m.conversation_id)
  const lastReadByConv: Record<string, string | null> = Object.fromEntries(
    myMembers.map(m => [m.conversation_id, m.last_read_at]),
  )

  // 2. Conversations elles-mêmes
  let q = supabaseAdmin
    .from('conversations')
    .select('*')
    .in('id', convIds)
    .order('updated_at', { ascending: false })
  if (kindFilter) q = q.eq('kind', kindFilter)

  const { data: convs, error: convErr } = await q
  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 })
  if (!convs?.length) return NextResponse.json({ conversations: [] })

  // 3. Tous les membres des convs (pour récupérer l'autre user de chaque)
  const { data: allMembers } = await supabaseAdmin
    .from('conversation_members')
    .select('conversation_id, user_id')
    .in('conversation_id', convs.map(c => c.id))

  const membersByConv: Record<string, string[]> = {}
  for (const m of allMembers ?? []) {
    if (!membersByConv[m.conversation_id]) membersByConv[m.conversation_id] = []
    membersByConv[m.conversation_id].push(m.user_id)
  }

  // 4. Profils des "autres" users
  const otherUserIds = Array.from(new Set(
    convs.flatMap(c => (membersByConv[c.id] ?? []).filter(uid => uid !== ctx.userId)),
  ))
  let profilesByUid: Record<string, { user_id: string; display_name: string | null; avatar_url: string | null; ville: string | null }> = {}
  if (otherUserIds.length > 0) {
    const { data: profs } = await supabaseAdmin
      .from('profiles')
      .select('user_id, display_name, avatar_url, ville')
      .in('user_id', otherUserIds)
    profilesByUid = Object.fromEntries(
      ((profs ?? []) as { user_id: string; display_name: string | null; avatar_url: string | null; ville: string | null }[])
        .map(p => [p.user_id, p]),
    )
  }

  // 5. Derniers messages + unread counts par conv
  const { data: msgs } = await supabaseAdmin
    .from('messages')
    .select('id, conversation_id, sender_id, content, created_at')
    .in('conversation_id', convs.map(c => c.id))
    .order('created_at', { ascending: false })

  const lastMsgByConv: Record<string, { content: string; created_at: string } | null> = {}
  const unreadByConv: Record<string, number> = {}
  for (const m of msgs ?? []) {
    if (!lastMsgByConv[m.conversation_id]) {
      lastMsgByConv[m.conversation_id] = { content: m.content, created_at: m.created_at }
    }
    const lastRead = lastReadByConv[m.conversation_id]
    if (m.sender_id !== ctx.userId && (!lastRead || m.created_at > lastRead)) {
      unreadByConv[m.conversation_id] = (unreadByConv[m.conversation_id] ?? 0) + 1
    }
  }

  // 6. Assemblage
  const enriched = convs.map(c => {
    const otherUid = (membersByConv[c.id] ?? []).find(uid => uid !== ctx.userId)
    return {
      ...c,
      other_member: otherUid ? (profilesByUid[otherUid] ?? null) : null,
      last_message: lastMsgByConv[c.id] ?? null,
      unread_count: unreadByConv[c.id] ?? 0,
    }
  })

  return NextResponse.json({ conversations: enriched })
}
