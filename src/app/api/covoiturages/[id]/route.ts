import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser } from '@/lib/server-auth'

/**
 * GET /api/covoiturages/[id] — détail d'un trajet (public).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { data: covoit, error } = await supabaseAdmin
    .from('covoiturages')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!covoit) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  const { data: prof } = await supabaseAdmin
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('user_id', covoit.user_id)
    .maybeSingle()

  return NextResponse.json({ covoiturage: { ...covoit, conducteur: prof ?? null } })
}

/**
 * PATCH /api/covoiturages/[id] — modifie statut ou champs.
 * Conducteur uniquement (ou admin).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: existing } = await supabaseAdmin
    .from('covoiturages')
    .select('user_id, is_completed')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  if (existing.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  // Whitelist des champs éditables (conducteur ou admin)
  const allowed = ['depart', 'destination', 'date_trajet', 'heure_depart', 'heure_arrivee',
                   'prix', 'places', 'point_recup', 'vehicule', 'fumeur',
                   'animaux', 'bagages', 'description', 'statut',
                   'is_completed', 'regulier', 'jours_semaine', 'sens', 'detour_minutes'] as const
  const update: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) update[k] = body[k]
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  }

  // Si le conducteur marque le trajet terminé, on horodate
  const isMarkingCompleted = update.is_completed === true && !existing.is_completed
  if (isMarkingCompleted) {
    update.completed_at = new Date().toISOString()
  }

  const { data, error } = await supabaseAdmin
    .from('covoiturages')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Side-effect : trajet marqué terminé → notif aux passagers validés "Notez le conducteur"
  if (isMarkingCompleted) {
    try {
      const { data: convs } = await supabaseAdmin
        .from('covoit_conversations')
        .select('id, candidat_id')
        .eq('covoit_id', id)
        .eq('statut', 'validee')

      const { data: prof } = await supabaseAdmin
        .from('profiles')
        .select('display_name')
        .eq('user_id', existing.user_id)
        .maybeSingle()

      const actorName = prof?.display_name || 'Le conducteur'

      await Promise.all(
        (convs ?? []).map(c =>
          notifyUser(c.candidat_id, {
            type:        'covoit_rate_invitation',
            actor_name:  actorName,
            target_type: 'covoit_conversation',
            target_id:   c.id,
          })
        )
      )
    } catch (notifErr) {
      console.error('[covoit/PATCH] notif rate-invitation échouée (non bloquant):', notifErr)
    }
  }

  return NextResponse.json({ covoiturage: data })
}

/**
 * DELETE /api/covoiturages/[id] — supprime (conducteur ou admin).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: existing } = await supabaseAdmin
    .from('covoiturages')
    .select('user_id')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  if (existing.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('covoiturages').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
