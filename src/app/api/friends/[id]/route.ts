import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * DELETE /api/friends/[id]
 *
 * Couvre 3 cas équivalents côté API :
 *   - Annuler une demande envoyée (status='pending', je suis requested_by)
 *   - Refuser une demande reçue (status='pending', je ne suis pas requested_by)
 *   - Défaire un ami (status='accepted')
 *
 * Pas de notif (silencieux pour respecter la pudeur des refus/désamics).
 *
 * Conditions : auth.uid() est l'un des 2 participants.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: f } = await supabaseAdmin
    .from('friendships')
    .select('user1_id, user2_id, status')
    .eq('id', id)
    .maybeSingle()

  if (!f) return NextResponse.json({ error: 'Relation introuvable' }, { status: 404 })
  if (f.user1_id !== ctx.userId && f.user2_id !== ctx.userId) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('friendships').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
