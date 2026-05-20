import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * GET /api/covoiturages/conversations
 *
 * Liste TOUTES les conversations de l'user (qu'il soit candidat ou conducteur).
 * Enrichi avec : trajet, autre membre (profil), dernier message, unread.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: convs, error } = await supabaseAdmin
    .from('covoit_conversations')
    .select('*')
    .or(`candidat_id.eq.${ctx.userId},conducteur_id.eq.${ctx.userId}`)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!convs?.length) return NextResponse.json({ conversations: [] })

  const otherIds = Array.from(new Set(
    convs.map(c => c.candidat_id === ctx.userId ? c.conducteur_id : c.candidat_id)
  ))
  const covoitIds = Array.from(new Set(convs.map(c => c.covoit_id)))
  const convIds   = convs.map(c => c.id)

  const [{ data: profiles }, { data: covoits }, { data: lastMessages }] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', otherIds),
    supabaseAdmin
      .from('covoiturages')
      .select('id, depart, destination, date_trajet, heure_depart, prix, statut')
      .in('id', covoitIds),
    supabaseAdmin
      .from('covoit_messages')
      .select('*')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false }),
  ])

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.user_id, p]))
  const covoitMap  = Object.fromEntries((covoits ?? []).map(c => [c.id, c]))

  const lastByConv:  Record<string, unknown> = {}
  const unreadByConv: Record<string, number> = {}
  for (const m of lastMessages ?? []) {
    if (!lastByConv[m.conversation_id]) lastByConv[m.conversation_id] = m
    if (m.sender_id && m.sender_id !== ctx.userId && !m.lu_at) {
      unreadByConv[m.conversation_id] = (unreadByConv[m.conversation_id] ?? 0) + 1
    }
  }

  const enriched = convs.map(c => {
    const otherId = c.candidat_id === ctx.userId ? c.conducteur_id : c.candidat_id
    return {
      ...c,
      role:         c.conducteur_id === ctx.userId ? 'conducteur' : 'candidat',
      other:        profileMap[otherId] ?? null,
      covoit:       covoitMap[c.covoit_id] ?? null,
      last_message: lastByConv[c.id] ?? null,
      unread_count: unreadByConv[c.id] ?? 0,
    }
  })

  return NextResponse.json({ conversations: enriched })
}
