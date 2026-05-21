import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser } from '@/lib/server-auth'
import { normalizePair } from '@/lib/friendships'

/**
 * POST /api/friends/request — envoyer une demande d'ami.
 *
 * Body : { user_id }
 *
 * Comportement :
 *   - Si pas de relation existante → INSERT pending + notif au destinataire
 *   - Si relation pending dont JE suis requested_by → erreur (déjà envoyée)
 *   - Si relation pending dont l'AUTRE est requested_by → auto-accept
 *     (= si l'autre m'avait demandé et je clique aussi "Ajouter", on devient amis)
 *   - Si relation accepted → erreur (déjà amis)
 *   - Si relation blocked → 403
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const targetId = typeof body?.user_id === 'string' ? body.user_id : null

  if (!targetId) return NextResponse.json({ error: 'user_id manquant' }, { status: 400 })
  if (targetId === ctx.userId) return NextResponse.json({ error: 'Tu ne peux pas t\'ajouter toi-même' }, { status: 400 })

  // Vérifier que le user cible existe
  const { data: target } = await supabaseAdmin
    .from('profiles')
    .select('user_id, display_name')
    .eq('user_id', targetId)
    .maybeSingle()
  if (!target) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })

  const [u1, u2] = normalizePair(ctx.userId, targetId)

  // Cherche relation existante
  const { data: existing } = await supabaseAdmin
    .from('friendships')
    .select('*')
    .eq('user1_id', u1)
    .eq('user2_id', u2)
    .maybeSingle()

  if (existing) {
    if (existing.status === 'blocked') {
      return NextResponse.json({ error: 'Action impossible' }, { status: 403 })
    }
    if (existing.status === 'accepted') {
      return NextResponse.json({ error: 'Vous êtes déjà amis', friendship: existing }, { status: 409 })
    }
    // pending
    if (existing.requested_by === ctx.userId) {
      return NextResponse.json({ error: 'Demande déjà envoyée', friendship: existing }, { status: 409 })
    }
    // L'autre m'avait demandé → auto-accept
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', existing.id)
      .select()
      .single()
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    // Notif à l'initiateur original
    const { data: me } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('user_id', ctx.userId)
      .maybeSingle()
    await notifyUser(existing.requested_by, {
      type:        'friend_request_accepted',
      actor_name:  me?.display_name || 'Un membre',
      target_type: 'friendship',
      target_id:   existing.id,
    })

    return NextResponse.json({ friendship: updated, autoAccepted: true })
  }

  // Pas de relation existante → INSERT pending
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('friendships')
    .insert({
      user1_id:     u1,
      user2_id:     u2,
      status:       'pending',
      requested_by: ctx.userId,
    })
    .select()
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // Notif au destinataire
  const { data: me } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('user_id', ctx.userId)
    .maybeSingle()
  await notifyUser(targetId, {
    type:        'friend_request_received',
    actor_name:  me?.display_name || 'Un membre',
    target_type: 'friendship',
    target_id:   inserted.id,
  })

  return NextResponse.json({ friendship: inserted })
}
