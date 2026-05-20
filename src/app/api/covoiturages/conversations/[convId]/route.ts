import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser } from '@/lib/server-auth'

/**
 * PATCH /api/covoiturages/conversations/[convId]
 *
 * Conducteur change le statut de la conversation :
 *   - 'validee'  → confirme la place (incrémente places_prises ; passe à 'complet'
 *                  si plein), envoie message système et notif au candidat.
 *   - 'refusee'  → ferme la conv, message système + notif.
 *   - 'closed'   → ferme sans validation (libère la place si validée auparavant).
 *
 * Body : { statut: 'validee' | 'refusee' | 'closed' }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ convId: string }> },
) {
  const { convId } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const target = body?.statut as 'validee' | 'refusee' | 'closed' | undefined
  if (!target || !['validee', 'refusee', 'closed'].includes(target)) {
    return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
  }

  const { data: conv } = await supabaseAdmin
    .from('covoit_conversations')
    .select('*')
    .eq('id', convId)
    .maybeSingle()
  if (!conv) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  if (conv.conducteur_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Conducteur uniquement' }, { status: 403 })
  }

  const { data: covoit } = await supabaseAdmin
    .from('covoiturages')
    .select('id, places, places_prises, depart, destination, statut')
    .eq('id', conv.covoit_id)
    .maybeSingle()
  if (!covoit) return NextResponse.json({ error: 'Trajet introuvable' }, { status: 404 })

  // 1. Update conv statut
  const { error: convErr } = await supabaseAdmin
    .from('covoit_conversations')
    .update({ statut: target })
    .eq('id', convId)
  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 })

  // 2. Side-effects sur le trajet : si on valide, on incrémente places_prises ;
  //    si on bascule depuis 'validee' vers autre chose, on décrémente.
  let placesPrises = covoit.places_prises
  if (target === 'validee' && conv.statut !== 'validee') {
    placesPrises = Math.min(covoit.places, covoit.places_prises + 1)
  } else if (conv.statut === 'validee' && target !== 'validee') {
    placesPrises = Math.max(0, covoit.places_prises - 1)
  }
  const newCovoitStatut = placesPrises >= covoit.places ? 'complet'
                        : covoit.statut === 'complet' ? 'actif'
                        : covoit.statut
  if (placesPrises !== covoit.places_prises || newCovoitStatut !== covoit.statut) {
    await supabaseAdmin
      .from('covoiturages')
      .update({ places_prises: placesPrises, statut: newCovoitStatut })
      .eq('id', covoit.id)
  }

  // 3. Message système + notif
  const systemMsg =
    target === 'validee' ? '✓ Place validée par le conducteur. Vous pouvez échanger vos coordonnées.'
  : target === 'refusee' ? '✕ Le conducteur n\'a pas retenu votre demande.'
  :                        'Conversation clôturée par le conducteur.'

  await supabaseAdmin.from('covoit_messages').insert({
    conversation_id: convId,
    sender_id:       null,
    kind:            'system',
    content:         systemMsg,
  })

  const notifType = target === 'validee' ? 'covoit_validee'
                  : target === 'refusee' ? 'covoit_refusee'
                  :                        'covoit_closed'
  await notifyUser(conv.candidat_id, {
    type:        notifType,
    actor_name:  `${covoit.depart} → ${covoit.destination}`,
    target_type: 'conversation',
    target_id:   convId,
  })

  return NextResponse.json({ ok: true })
}
