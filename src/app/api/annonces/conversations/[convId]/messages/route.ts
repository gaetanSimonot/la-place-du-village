import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser } from '@/lib/server-auth'

/**
 * Helper : récupère la conv + vérifie que l'user est membre.
 * Retourne la conv ou une Response 403/404.
 */
async function getConvAsMember(convId: string, userId: string, isAdmin: boolean) {
  const { data: conv } = await supabaseAdmin
    .from('annonces_conversations')
    .select('*')
    .eq('id', convId)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  if (conv.acheteur_id !== userId && conv.vendeur_id !== userId && !isAdmin) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }
  return conv
}

/**
 * GET — tous les messages de la conv + marque comme lus ceux envoyés par l'autre.
 * Renvoie : { messages, conversation, annonce: { id, titre, photos, contact_tel, contact_email, vendeur_id } }
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
    .from('annonces_messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Marque comme lus les messages envoyés par l'autre (pas par soi)
  await supabaseAdmin
    .from('annonces_messages')
    .update({ lu_at: new Date().toISOString() })
    .eq('conversation_id', convId)
    .neq('sender_id', ctx.userId)
    .is('lu_at', null)

  // Charge l'annonce associée (titre, photos, contacts)
  const { data: annonce } = await supabaseAdmin
    .from('annonces')
    .select('id, titre, photos, contact_tel, contact_email, statut, user_id')
    .eq('id', conv.annonce_id)
    .maybeSingle()

  return NextResponse.json({ messages: messages ?? [], conversation: conv, annonce })
}

/**
 * POST — envoie un message texte.
 * Body : { content: string }
 * Notifie l'autre membre de la conv.
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
    .from('annonces_messages')
    .insert({
      conversation_id: convId,
      sender_id:       ctx.userId,
      kind:            'text',
      content,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notif à l'autre
  const otherId = ctx.userId === conv.acheteur_id ? conv.vendeur_id : conv.acheteur_id
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('user_id', ctx.userId)
    .maybeSingle()

  await notifyUser(otherId, {
    type:        'annonce_message',
    actor_name:  profile?.display_name || 'Un utilisateur',
    target_type: 'conversation',
    target_id:   convId,
  })

  return NextResponse.json({ message: msg })
}
