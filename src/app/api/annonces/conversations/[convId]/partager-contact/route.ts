import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser } from '@/lib/server-auth'

/**
 * POST — le vendeur partage ses coordonnées (tel/email de l'annonce)
 * dans la conv via un message système (kind='system_contact').
 *
 * Idempotent : si un message system_contact existe déjà, renvoie 200 sans dupliquer.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ convId: string }> },
) {
  const { convId } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: conv } = await supabaseAdmin
    .from('annonces_conversations')
    .select('*, annonce:annonces(contact_tel, contact_email, titre)')
    .eq('id', convId)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })

  // Vendeur uniquement (admin override)
  if (conv.vendeur_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Seul le vendeur peut partager ses coordonnées' }, { status: 403 })
  }

  const annonce = (conv as { annonce: { contact_tel: string | null; contact_email: string | null; titre: string } }).annonce
  const tel   = annonce?.contact_tel
  const email = annonce?.contact_email

  if (!tel && !email) {
    return NextResponse.json({ error: 'Aucune coordonnée renseignée sur cette annonce' }, { status: 400 })
  }

  // Déduplication : un seul system_contact par conv
  const { data: existing } = await supabaseAdmin
    .from('annonces_messages')
    .select('id')
    .eq('conversation_id', convId)
    .eq('kind', 'system_contact')
    .maybeSingle()

  if (existing) return NextResponse.json({ success: true, alreadyShared: true })

  // Construit le contenu (parsé côté client)
  const lines: string[] = []
  if (tel)   lines.push(`tel:${tel}`)
  if (email) lines.push(`email:${email}`)
  const content = lines.join('\n')

  const { error } = await supabaseAdmin
    .from('annonces_messages')
    .insert({
      conversation_id: convId,
      sender_id:       ctx.userId,
      kind:            'system_contact',
      content,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notif à l'acheteur
  await notifyUser(conv.acheteur_id, {
    type:        'annonce_contact_partage',
    actor_name:  'Le vendeur',
    target_type: 'conversation',
    target_id:   convId,
  })

  return NextResponse.json({ success: true })
}
