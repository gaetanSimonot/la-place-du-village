import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { territoireDeLaRequete } from '@/lib/territoires'

export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const statut = req.nextUrl.searchParams.get('statut')

  let query = supabaseAdmin
    .from('articles_journal')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (statut) query = query.eq('statut', statut)
  // La file de moderation est celle du territoire administre : un article
  // palois n'a rien a faire dans la revue cevenole, et inversement.
  const terr = await territoireDeLaRequete(req.url)
  if (terr) query = query.eq('territoire_id', terr.id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ articles: data ?? [] })
}
