import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { processMessage } from '@/lib/processMessage'
import { requireAdmin } from '@/lib/server-auth'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { data: msg, error } = await supabaseAdmin
    .from('messages_entrants')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !msg) {
    return NextResponse.json({ error: 'Message introuvable' }, { status: 404 })
  }

  await supabaseAdmin.from('messages_entrants').update({ statut: 'a_traiter' }).eq('id', params.id)

  // Le groupe vient de la ligne deja enregistree : un retraitement doit
  // ranger l'evenement dans le meme territoire que le premier passage.
  const result = await processMessage(params.id, msg.contenu, msg.image_url, msg.source, null, null, msg.groupe ?? null)

  await supabaseAdmin.from('messages_entrants').update({
    statut: result.statut,
    raison: result.raison || null,
    extraction: result.extraction ?? null,
    evenement_id: result.premier_evenement_id ?? null,
  }).eq('id', params.id)

  return NextResponse.json({ ok: true, ...result })
}
