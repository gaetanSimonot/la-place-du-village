import { NextRequest, NextResponse } from 'next/server'
import { generateJournalDraft } from '@/lib/journal-generator'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Cron Vercel — chaque lundi 08:00 (Europe/Paris).
 * Génère un brouillon de journal. NE publie PAS automatiquement :
 * l'admin doit valider depuis /admin/journal avant publication.
 *
 * Sécurité : Vercel envoie `Authorization: Bearer ${CRON_SECRET}`
 * Cf. https://vercel.com/docs/cron-jobs/manage-cron-jobs#protecting-cron-routes
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || auth !== expected) {
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
