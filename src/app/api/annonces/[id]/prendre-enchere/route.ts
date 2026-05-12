import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser } from '@/lib/server-auth'

/**
 * POST — prendre une enchère inversée au prix actuel.
 *
 * Premier-servi garanti par UNIQUE(annonce_id) sur annonces_encheres_prises.
 * En cas de course :
 *   - le 1er INSERT réussit → l'annonce passe en 'vendu'
 *   - les suivants reçoivent un conflit unique → 409
 *
 * Notifie le posteur (type 'annonce_enchere_prise').
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: annonce } = await supabaseAdmin
    .from('annonces')
    .select('id, user_id, type, statut, prix_actuel, titre')
    .eq('id', id)
    .maybeSingle()

  if (!annonce)                          return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
  if (annonce.type !== 'enchere_inversee') return NextResponse.json({ error: 'Pas une enchère' }, { status: 400 })
  if (annonce.statut !== 'active')       return NextResponse.json({ error: 'Enchère non active' }, { status: 409 })
  if (annonce.user_id === ctx.userId)    return NextResponse.json({ error: 'Vous ne pouvez pas prendre votre propre enchère' }, { status: 400 })
  if (annonce.prix_actuel == null)       return NextResponse.json({ error: 'Prix indisponible' }, { status: 409 })

  // INSERT (premier-servi via UNIQUE annonce_id)
  const { error: insertErr } = await supabaseAdmin
    .from('annonces_encheres_prises')
    .insert({
      annonce_id: id,
      user_id:    ctx.userId,
      prix_pris:  annonce.prix_actuel,
    })

  if (insertErr) {
    // Code 23505 = unique_violation : un autre user a été plus rapide
    if (insertErr.code === '23505') {
      return NextResponse.json({ error: 'Enchère déjà prise' }, { status: 409 })
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // L'annonce bascule en vendu
  const { error: updateErr } = await supabaseAdmin
    .from('annonces')
    .update({ statut: 'vendu', vendu_at: new Date().toISOString() })
    .eq('id', id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Ouvre une conversation entre acheteur (preneur) et vendeur pour finaliser
  // le retrait / paiement. Idempotent via UNIQUE(annonce_id, acheteur_id).
  const { data: conv } = await supabaseAdmin
    .from('annonces_conversations')
    .upsert(
      { annonce_id: id, acheteur_id: ctx.userId, vendeur_id: annonce.user_id },
      { onConflict: 'annonce_id,acheteur_id' },
    )
    .select()
    .single()

  // Message-système auto pour annoncer la prise dans le chat
  if (conv) {
    await supabaseAdmin.from('annonces_messages').insert({
      conversation_id: conv.id,
      sender_id:       ctx.userId,
      kind:            'text',
      content:         `J'ai pris votre enchère à ${annonce.prix_actuel} €. Voici nos coordonnées pour finaliser.`,
    })
  }

  // Notif au posteur — cible la conv pour qu'un clic ouvre direct le chat
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('user_id', ctx.userId)
    .maybeSingle()

  await notifyUser(annonce.user_id, {
    type:        'annonce_enchere_prise',
    actor_name:  profile?.display_name || 'Un utilisateur',
    target_type: conv ? 'conversation' : 'annonce',
    target_id:   conv?.id ?? id,
  })

  return NextResponse.json({
    success: true,
    prix_pris: annonce.prix_actuel,
    conversation_id: conv?.id ?? null,
  })
}
