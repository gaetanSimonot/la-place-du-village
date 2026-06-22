import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * GET /api/cron/purge-moments — supprime les moments expirés (> 24h) et leurs
 * médias Storage. Les moments expirés sont déjà masqués par le filtre
 * `expires_at > now` côté lecture ; ce cron libère juste l'espace de stockage.
 *
 * Auth : `Authorization: Bearer ${CRON_SECRET}` si défini, sinon user-agent
 * vercel-cron (même pattern que /api/cron/journal-hebdo).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const ua = req.headers.get('user-agent') ?? ''
  const secret = process.env.CRON_SECRET
  const isAuthorized = secret ? auth === `Bearer ${secret}` : ua.toLowerCase().includes('vercel-cron')
  if (!isAuthorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const nowISO = new Date().toISOString()
  const { data: expired, error } = await supabaseAdmin
    .from('moments')
    .select('id, media_url')
    .lte('expires_at', nowISO)
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (expired ?? []) as { id: string; media_url: string }[]
  if (rows.length === 0) return NextResponse.json({ purged: 0 })

  // Médias Storage (best-effort)
  const marker = '/storage/v1/object/public/moments/'
  const paths = rows
    .map(r => { const i = r.media_url.indexOf(marker); return i === -1 ? null : r.media_url.slice(i + marker.length) })
    .filter(Boolean) as string[]
  if (paths.length) await supabaseAdmin.storage.from('moments').remove(paths).catch(() => {})

  // Lignes (cascade sur vues/likes/commentaires)
  const { error: delErr } = await supabaseAdmin.from('moments').delete().in('id', rows.map(r => r.id))
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ purged: rows.length })
}
