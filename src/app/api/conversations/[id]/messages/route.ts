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
  const embedKindRaw  = body?.embed_kind
  const embedRefIdRaw = body?.embed_ref_id

  // Validation embed optionnel (mêmes kinds que posts)
  const ALLOWED_KINDS = ['event','etab','producer','annonce','promo','covoit','article']
  let validEmbedKind: string | null = null
  let validEmbedRefId: string | null = null
  if (embedKindRaw != null && embedRefIdRaw != null) {
    if (typeof embedKindRaw !== 'string' || !ALLOWED_KINDS.includes(embedKindRaw)) {
      return NextResponse.json({ error: 'embed_kind invalide' }, { status: 400 })
    }
    // embed_ref_id : string non vide, ≤ 128 chars. Pas de regex UUID stricte
    // car certaines tables (promotions etc.) peuvent avoir des PK bigint.
    if (typeof embedRefIdRaw !== 'string' || embedRefIdRaw.length === 0 || embedRefIdRaw.length > 128) {
      return NextResponse.json({ error: 'embed_ref_id invalide' }, { status: 400 })
    }
    validEmbedKind = embedKindRaw
    validEmbedRefId = embedRefIdRaw
  }

  // Texte requis SAUF si un embed est fourni (on peut envoyer juste un lien)
  if (!content && !validEmbedKind) return NextResponse.json({ error: 'Message vide' }, { status: 400 })
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

  // INSERT message — payload conditionnel. Si pas d'embed, on n'inclut PAS
  // les colonnes embed_kind/embed_ref_id dans l'insert. Comme ça :
  // - Si la migration 2026-05-22_embed_attachments.sql a été passée → INSERT
  //   fonctionne avec ou sans embed.
  // - Si la migration N'A PAS été passée → INSERT avec embed crashe (normal,
  //   les colonnes n'existent pas), mais INSERT sans embed marche toujours.
  const insertPayload: Record<string, unknown> = {
    conversation_id: id,
    sender_id:       ctx.userId,
    content,
  }
  if (validEmbedKind && validEmbedRefId) {
    insertPayload.embed_kind   = validEmbedKind
    insertPayload.embed_ref_id = validEmbedRefId
  }

  const { data: msg, error: insErr } = await supabaseAdmin
    .from('messages')
    .insert(insertPayload)
    .select()
    .single()
  if (insErr || !msg) {
    // Log côté serveur pour debug Vercel + retour structuré pour client
    console.error('[messages POST] INSERT error:', insErr)
    return NextResponse.json({
      error:   insErr?.message ?? 'Erreur',
      code:    insErr?.code,
      details: insErr?.details,
      hint:    insErr?.hint,
    }, { status: 500 })
  }

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
        coalesce:    true,  // 3 messages d'affilée = 1 notif, pas 3
      }),
    ))
  }

  return NextResponse.json({ message: msg })
}
