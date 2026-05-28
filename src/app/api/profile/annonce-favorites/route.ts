import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * GET — liste les IDs des annonces favoris du user.
 * Réponse : { annonceIds: string[] }
 *
 * POST — import en bulk depuis localStorage (au login).
 *   Body : { annonceIds: string[] }
 *   Réponse : { imported: number }
 *
 *   Insère les IDs qui existent vraiment dans `annonces` (filtre silencieux
 *   pour éviter qu'un localStorage corrompu casse l'import). Ignore les
 *   conflits UNIQUE (favoris déjà présents).
 *
 * Pattern identique à /api/profile/favorites (events).
 */
export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data, error } = await supabaseAdmin
    .from('annonce_favorites')
    .select('annonce_id')
    .eq('user_id', ctx.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ annonceIds: (data ?? []).map(r => r.annonce_id) })
}

export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const rawIds: unknown = body?.annonceIds
  if (!Array.isArray(rawIds)) {
    return NextResponse.json({ error: 'annonceIds[] requis' }, { status: 400 })
  }

  const ids = rawIds.filter((v): v is string => typeof v === 'string').slice(0, 500)
  if (ids.length === 0) return NextResponse.json({ imported: 0 })

  // Filtre : ne garder que les IDs qui correspondent à une annonce réelle
  const { data: validAnnonces } = await supabaseAdmin
    .from('annonces')
    .select('id')
    .in('id', ids)

  const validIds = new Set((validAnnonces ?? []).map(a => a.id))
  const toInsert = ids
    .filter(id => validIds.has(id))
    .map(annonce_id => ({ user_id: ctx.userId, annonce_id }))

  if (toInsert.length === 0) return NextResponse.json({ imported: 0 })

  // upsert pour ignorer les conflits UNIQUE silencieusement
  const { error } = await supabaseAdmin
    .from('annonce_favorites')
    .upsert(toInsert, { onConflict: 'user_id,annonce_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ imported: toInsert.length })
}
