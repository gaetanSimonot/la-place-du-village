import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser } from '@/lib/server-auth'

/**
 * POST /api/covoiturages/[id]/conversations
 *
 * Candidate à un trajet : crée (ou récupère) la conversation entre l'user
 * courant (candidat) et le conducteur. Idempotent via UNIQUE(covoit_id, candidat_id).
 *
 * Body : { message?: string }  — si fourni, envoie un 1er message + notif au conducteur
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: covoitId } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: covoit } = await supabaseAdmin
    .from('covoiturages')
    .select('id, user_id, statut, depart, destination')
    .eq('id', covoitId)
    .maybeSingle()

  if (!covoit) return NextResponse.json({ error: 'Trajet introuvable' }, { status: 404 })
  if (covoit.statut === 'annule') {
    return NextResponse.json({ error: 'Trajet annulé' }, { status: 409 })
  }
  if (covoit.user_id === ctx.userId) {
    return NextResponse.json({ error: 'Vous ne pouvez pas candidater à votre propre trajet' }, { status: 400 })
  }

  const { data: conv, error: convErr } = await supabaseAdmin
    .from('covoit_conversations')
    .upsert(
      {
        covoit_id:     covoitId,
        candidat_id:   ctx.userId,
        conducteur_id: covoit.user_id,
      },
      { onConflict: 'covoit_id,candidat_id' },
    )
    .select()
    .single()

  if (convErr || !conv) {
    return NextResponse.json({ error: convErr?.message ?? 'Erreur conversation' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const initialMessage = typeof body?.message === 'string' ? body.message.trim() : ''

  if (initialMessage) {
    await supabaseAdmin.from('covoit_messages').insert({
      conversation_id: conv.id,
      sender_id:       ctx.userId,
      kind:            'text',
      content:         initialMessage,
    })

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('user_id', ctx.userId)
      .maybeSingle()

    await notifyUser(covoit.user_id, {
      type:        'covoit_candidat',
      actor_name:  profile?.display_name || 'Un voyageur',
      target_type: 'conversation',
      target_id:   conv.id,
    })
  }

  return NextResponse.json({ conversation: conv })
}

/**
 * GET /api/covoiturages/[id]/conversations
 *
 * Liste les conversations sur ce trajet (conducteur uniquement).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: covoitId } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: covoit } = await supabaseAdmin
    .from('covoiturages')
    .select('user_id')
    .eq('id', covoitId)
    .maybeSingle()
  if (!covoit) return NextResponse.json({ error: 'Trajet introuvable' }, { status: 404 })
  if (covoit.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }

  const { data: convs, error } = await supabaseAdmin
    .from('covoit_conversations')
    .select('*')
    .eq('covoit_id', covoitId)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!convs?.length) return NextResponse.json({ conversations: [] })

  const candidatIds = Array.from(new Set(convs.map(c => c.candidat_id)))
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('user_id, display_name, avatar_url')
    .in('user_id', candidatIds)
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.user_id, p]))

  const convIds = convs.map(c => c.id)
  const { data: lastMessages } = await supabaseAdmin
    .from('covoit_messages')
    .select('*')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: false })

  const lastByConv: Record<string, unknown> = {}
  const unreadByConv: Record<string, number> = {}
  for (const m of lastMessages ?? []) {
    if (!lastByConv[m.conversation_id]) lastByConv[m.conversation_id] = m
    if (m.sender_id && m.sender_id !== ctx.userId && !m.lu_at) {
      unreadByConv[m.conversation_id] = (unreadByConv[m.conversation_id] ?? 0) + 1
    }
  }

  const enriched = convs.map(c => ({
    ...c,
    candidat:     profileMap[c.candidat_id] ?? null,
    last_message: lastByConv[c.id] ?? null,
    unread_count: unreadByConv[c.id] ?? 0,
  }))

  return NextResponse.json({ conversations: enriched })
}
