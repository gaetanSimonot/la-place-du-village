import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/** GET /api/village/counts — badges des tuiles du Village (reels/débats/journal/annonces). */
export async function GET() {
  const [reelsRes, debatsRes, journalRes, annoncesRes] = await Promise.all([
    supabaseAdmin.from('moments').select('id', { count: 'exact', head: true }).gt('expires_at', new Date().toISOString()),
    supabaseAdmin.from('forum_topics').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('journaux_hebdo').select('id', { count: 'exact', head: true }).eq('statut', 'publie'),
    supabaseAdmin.from('annonces').select('id', { count: 'exact', head: true }).in('statut', ['active', 'don_final']),
  ])
  return NextResponse.json(
    {
      reels:    reelsRes.count ?? 0,
      debats:   debatsRes.count ?? 0,
      journal:  journalRes.count ?? 0,
      annonces: annoncesRes.count ?? 0,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
