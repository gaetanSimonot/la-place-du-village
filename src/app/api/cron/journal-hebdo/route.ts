import { NextRequest, NextResponse } from 'next/server'
import { generateJournalDraft } from '@/lib/journal-generator'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Cron Vercel — chaque lundi 07:00 UTC (≈ 8h Paris hiver / 9h Paris été).
 * Génère un brouillon de journal automatiquement. NE publie PAS :
 * l'admin doit valider depuis /admin/journal avant publication.
 *
 * Sécurité :
 *  - Si CRON_SECRET est défini en env Vercel, on vérifie le header
 *    `Authorization: Bearer ${CRON_SECRET}` (mode strict recommandé).
 *  - Sinon, fallback : on whiteliste le user-agent `vercel-cron/1.0`
 *    (envoyé par Vercel sur tous les appels cron). Ça permet au cron
 *    de tourner out-of-the-box sans config supplémentaire — au prix
 *    d'une protection plus faible (user-agent forgeable).
 *  - Pour blinder en prod : ajouter CRON_SECRET dans les env vars Vercel.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const ua = req.headers.get('user-agent') ?? ''
  const secret = process.env.CRON_SECRET

  const isAuthorized = secret
    ? auth === `Bearer ${secret}`
    : ua.toLowerCase().includes('vercel-cron')

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id, numero } = await generateJournalDraft()
    return NextResponse.json({ ok: true, id, numero })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
