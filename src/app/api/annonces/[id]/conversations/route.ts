import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser } from '@/lib/server-auth'

/**
 * POST — création (ou récupération) d'une conversation entre l'user courant
 * (acheteur) et le vendeur de l'annonce. Idempotent via UNIQUE(annonce_id, acheteur_id).
 *
 * Body : { message?: string }  → si fourni, envoie un premier message + notif au vendeur
 * Renvoie : { conversation }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: annonceId } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: annonce } = await supabaseAdmin
    .from('annonces')
    .select('id, user_id, statut, titre')
    .eq('id', annonceId)
    .maybeSingle()

  if (!annonce) return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
  if (annonce.statut !== 'active' && annonce.statut !== 'don_final') {
    return NextResponse.json({ error: 'Annonce non disponible' }, { status: 409 })
  }
  if (annonce.user_id === ctx.userId) {
    return NextResponse.json({ error: 'Vous ne pouvez pas vous contacter vous-même' }, { status: 400 })
  }

  // Upsert : crée la conv si pas déjà existante (UNIQUE annonce_id, acheteur_id)
  const { data: conv, error: convErr } = await supabaseAdmin
    .from('annonces_conversations')
    .upsert(
      {
        annonce_id:  annonceId,
        acheteur_id: ctx.userId,
        vendeur_id:  annonce.user_id,
      },
      { onConflict: 'annonce_id,acheteur_id' },
    )
    .select()
    .single()

  if (convErr || !conv) {
    return NextResponse.json({ error: convErr?.message ?? 'Erreur conversation' }, { status: 500 })
  }

  // Premier message optionnel
  const body = await req.json().catch(() => ({}))
  const initialMessage = typeof body?.message === 'string' ? body.message.trim() : ''

  if (initialMessage) {
    await supabaseAdmin.from('annonces_messages').insert({
      conversation_id: conv.id,
      sender_id:       ctx.userId,
      kind:            'text',
      content:         initialMessage,
    })

    // Notif au vendeur (premier intérêt)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('user_id', ctx.userId)
      .maybeSingle()

    await notifyUser(annonce.user_id, {
      type:        'annonce_interet_recu',
      actor_name:  profile?.display_name || 'Un utilisateur',
      target_type: 'conversation',
      target_id:   conv.id,
    })
  }

  return NextResponse.json({ conversation: conv })
}

/**
 * GET — liste les conversations sur cette annonce (vendeur uniquement).
 *
 * Renvoie : { conversations: [{ ...conv, acheteur: { display_name, avatar_url }, last_message, unread_count }] }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: annonceId } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: annonce } = await supabaseAdmin
    .from('annonces')
    .select('user_id')
    .eq('id', annonceId)
    .maybeSingle()

  if (!annonce) return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
  if (annonce.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }

  const { data: convs, error } = await supabaseAdmin
    .from('annonces_conversations')
    .select('*')
    .eq('annonce_id', annonceId)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!convs?.length) return NextResponse.json({ conversations: [] })

  // Enrichit avec profile acheteur + last message + unread count
  const acheteurIds = Array.from(new Set(convs.map(c => c.acheteur_id)))
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('user_id, display_name, avatar_url')
    .in('user_id', acheteurIds)

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.user_id, p]))

  const convIds = convs.map(c => c.id)
  const { data: lastMessages } = await supabaseAdmin
    .from('annonces_messages')
    .select('*')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: false })

  // Dernier message par conv + count unread vu par le vendeur (ctx.userId)
  const lastByConv: Record<string, typeof lastMessages extends (infer T)[] | null ? T : never> = {}
  const unreadByConv: Record<string, number> = {}
  for (const m of lastMessages ?? []) {
    if (!lastByConv[m.conversation_id]) lastByConv[m.conversation_id] = m
    if (m.sender_id && m.sender_id !== ctx.userId && !m.lu_at) {
      unreadByConv[m.conversation_id] = (unreadByConv[m.conversation_id] ?? 0) + 1
    }
  }

  const enriched = convs.map(c => ({
    ...c,
    acheteur:     profileMap[c.acheteur_id] ?? null,
    last_message: lastByConv[c.id] ?? null,
    unread_count: unreadByConv[c.id] ?? 0,
  }))

  return NextResponse.json({ conversations: enriched })
}
