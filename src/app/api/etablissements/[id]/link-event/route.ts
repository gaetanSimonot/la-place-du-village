import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/** Vérifie que le user gère la fiche (ou est admin). */
async function ownsEtab(etabId: string, ctx: { userId: string; isAdmin: boolean }) {
  const { data: etab } = await supabaseAdmin
    .from('etablissements').select('user_id').eq('id', etabId).maybeSingle()
  if (!etab) return { ok: false as const, status: 404, error: 'Établissement introuvable' }
  if (etab.user_id !== ctx.userId && !ctx.isAdmin) {
    return { ok: false as const, status: 403, error: 'Vous ne gérez pas cet établissement' }
  }
  return { ok: true as const }
}

/** POST — rattache un événement existant à la fiche. Body : { eventId }. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const owns = await ownsEtab(id, ctx)
  if (!owns.ok) return NextResponse.json({ error: owns.error }, { status: owns.status })

  const { eventId } = await req.json().catch(() => ({}))
  if (!eventId) return NextResponse.json({ error: 'eventId requis' }, { status: 400 })

  const { data: evt } = await supabaseAdmin
    .from('evenements').select('id').eq('id', eventId).maybeSingle()
  if (!evt) return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 })

  const { error } = await supabaseAdmin
    .from('evenements').update({ etablissement_id: id }).eq('id', eventId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

/** DELETE — détache un événement de la fiche. ?eventId=… */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const owns = await ownsEtab(id, ctx)
  if (!owns.ok) return NextResponse.json({ error: owns.error }, { status: owns.status })

  const eventId = new URL(req.url).searchParams.get('eventId')
  if (!eventId) return NextResponse.json({ error: 'eventId requis' }, { status: 400 })

  // Ne détache que si l'event est bien rattaché à CETTE fiche.
  const { error } = await supabaseAdmin
    .from('evenements').update({ etablissement_id: null })
    .eq('id', eventId).eq('etablissement_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
