import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'

/**
 * GET /api/admin/evenements/[id]/corrections
 *
 * Liste les corrections EN ATTENTE proposées sur un événement, la plus
 * ancienne d'abord. Utilisé quand l'admin ouvre une notif "correction
 * proposée" → on charge la première en attente pour la revue dans le modal.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { data, error } = await supabaseAdmin
    .from('event_corrections')
    .select('id, evenement_id, proposeur_id, proposeur_nom, changes, changed_fields, statut, created_at')
    .eq('evenement_id', params.id)
    .eq('statut', 'en_attente')
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ corrections: data ?? [] })
}
