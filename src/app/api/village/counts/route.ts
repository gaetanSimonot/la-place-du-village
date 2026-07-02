import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/** GET /api/village/counts — badges des tuiles du Village + photo du débat le plus discuté. */
export async function GET() {
  const [reelsRes, debatsRes, journalRes, annoncesRes, commentsRes] = await Promise.all([
    supabaseAdmin.from('moments').select('id', { count: 'exact', head: true }).gt('expires_at', new Date().toISOString()),
    supabaseAdmin.from('forum_topics').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('journaux_hebdo').select('id', { count: 'exact', head: true }).eq('statut', 'publie'),
    supabaseAdmin.from('annonces').select('id', { count: 'exact', head: true }).in('statut', ['active', 'don_final']),
    supabaseAdmin.from('forum_comments').select('topic_id'),
  ])

  // Photo du débat le plus commenté (même logique que le splash) — fallback null.
  let debatPhoto: string | null = null
  try {
    const tally: Record<string, number> = {}
    for (const c of (commentsRes.data ?? []) as { topic_id: string }[]) {
      if (c.topic_id) tally[c.topic_id] = (tally[c.topic_id] ?? 0) + 1
    }
    const topId = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0]
    if (topId) {
      const { data: topic } = await supabaseAdmin.from('forum_topics').select('media').eq('id', topId).maybeSingle()
      const media = topic?.media as { url?: string }[] | null
      debatPhoto = Array.isArray(media) ? (media.find(m => m?.url)?.url ?? null) : null
    }
  } catch { /* noop */ }

  return NextResponse.json(
    {
      reels:    reelsRes.count ?? 0,
      debats:   debatsRes.count ?? 0,
      journal:  journalRes.count ?? 0,
      annonces: annoncesRes.count ?? 0,
      debatPhoto,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
