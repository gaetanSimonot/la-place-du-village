import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notifyUser, requireAdmin } from '@/lib/server-auth'

/**
 * POST /api/admin/corrections/[id]/resolve
 * Body : { statut: 'validee' | 'rejetee' }
 *
 * Clôt une correction et notifie le proposeur :
 *  - 'validee' : l'événement a déjà été mis à jour par le PATCH admin du modal
 *    (le modal applique les valeurs PUIS appelle ce resolve). Ici on se contente
 *    de marquer la correction + notif "ta correction est validée".
 *  - 'rejetee' : aucune modif appliquée, notif "ta correction n'a pas été retenue".
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  try {
    const { statut } = await req.json()
    if (statut !== 'validee' && statut !== 'rejetee') {
      return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    }

    // Charge la correction (idempotent : on ne re-notifie pas si déjà traitée)
    const { data: correction, error: cErr } = await supabaseAdmin
      .from('event_corrections')
      .select('id, evenement_id, proposeur_id, statut')
      .eq('id', params.id)
      .single()
    if (cErr || !correction) {
      return NextResponse.json({ error: 'Correction introuvable' }, { status: 404 })
    }
    if (correction.statut !== 'en_attente') {
      return NextResponse.json({ success: true, alreadyResolved: true })
    }

    const { error: upErr } = await supabaseAdmin
      .from('event_corrections')
      .update({ statut, traite_at: new Date().toISOString(), traite_par: ctx.userId })
      .eq('id', params.id)
    if (upErr) throw new Error(upErr.message)

    // Notif au proposeur (best-effort). target = l'event corrigé.
    if (correction.proposeur_id) {
      const { data: evt } = await supabaseAdmin
        .from('evenements')
        .select('titre')
        .eq('id', correction.evenement_id)
        .maybeSingle()
      await notifyUser(correction.proposeur_id, {
        type:        statut === 'validee' ? 'correction_validee' : 'correction_rejetee',
        actor_name:  evt?.titre ?? 'un événement',
        target_type: 'event',
        target_id:   correction.evenement_id,
      }).catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 })
  }
}
