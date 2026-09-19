import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { territoireDeLaRequete } from '@/lib/territoires'

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { searchParams } = req.nextUrl
  const statut = searchParams.get('statut')
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  let query = supabaseAdmin
    .from('messages_entrants')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (statut && statut !== 'tous') {
    query = query.eq('statut', statut)
  }

  /*
   * La reception est celle du territoire administre. Le message porte deja
   * son territoire — pose a l'arrivee par le groupe d'ou il vient — donc
   * relire Pau depuis la vue cevenole melangerait deux villes dans la meme
   * file, sans moyen de les distinguer a l'oeil.
   */
  const terr = await territoireDeLaRequete(req.url)
  if (terr) query = query.eq('territoire_id', terr.id)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ messages: data ?? [], total: count ?? 0 })
}
