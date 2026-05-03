import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { processMessage } from '@/lib/processMessage'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data: msg, error } = await supabaseAdmin
    .from('messages_entrants')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !msg) {
    return NextResponse.json({ error: 'Message introuvable' }, { status: 404 })
  }

  await supabaseAdmin.from('messages_entrants').update({ statut: 'a_traiter' }).eq('id', params.id)

  const result = await processMessage(params.id, msg.contenu, msg.image_url, msg.source)

  await supabaseAdmin.from('messages_entrants').update({
    statut: result.statut,
    raison: result.raison || null,
    extraction: result.extraction ?? null,
    evenement_id: result.premier_evenement_id ?? null,
  }).eq('id', params.id)

  return NextResponse.json({ ok: true, ...result })
}
