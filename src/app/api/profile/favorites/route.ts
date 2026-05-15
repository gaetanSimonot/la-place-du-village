import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * GET — liste les IDs des événements favoris du user.
 * Réponse : { eventIds: string[] }
 *
 * POST — import en bulk depuis localStorage (au login).
 *   Body : { eventIds: string[] }
 *   Réponse : { imported: number }
 *
 *   Insère les IDs qui existent vraiment dans `evenements` (filtre silencieux
 *   pour éviter qu'un localStorage corrompu casse l'import). Ignore les
 *   conflits UNIQUE (favoris déjà présents).
 */
export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data, error } = await supabaseAdmin
    .from('event_favorites')
    .select('event_id')
    .eq('user_id', ctx.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ eventIds: (data ?? []).map(r => r.event_id) })
}

export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const rawIds: unknown = body?.eventIds
  if (!Array.isArray(rawIds)) {
    return NextResponse.json({ error: 'eventIds[] requis' }, { status: 400 })
  }

  const ids = rawIds.filter((v): v is string => typeof v === 'string').slice(0, 500)
  if (ids.length === 0) return NextResponse.json({ imported: 0 })

  // Filtre : ne garder que les IDs qui correspondent à un event réel
  const { data: validEvents } = await supabaseAdmin
    .from('evenements')
    .select('id')
    .in('id', ids)

  const validIds = new Set((validEvents ?? []).map(e => e.id))
  const toInsert = ids
    .filter(id => validIds.has(id))
    .map(event_id => ({ user_id: ctx.userId, event_id }))

  if (toInsert.length === 0) return NextResponse.json({ imported: 0 })

  // upsert pour ignorer les conflits UNIQUE silencieusement
  const { error } = await supabaseAdmin
    .from('event_favorites')
    .upsert(toInsert, { onConflict: 'user_id,event_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ imported: toInsert.length })
}
