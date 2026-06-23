import { NextRequest, NextResponse } from 'next/server'
import { welcomeBacklog } from '@/lib/newsletterWelcome'

/**
 * GET /api/cron/newsletter-welcome — envoie l'édition active de la newsletter
 * aux abonnés qui ne l'ont pas encore reçue (nouveaux inscrits via le checkbox
 * d'inscription, etc.). Les abonnements via lien/toggle/ajout admin sont déjà
 * traités instantanément ; ce cron est le filet de rattrapage.
 *
 * Auth : Bearer CRON_SECRET, sinon user-agent vercel-cron.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const ua = req.headers.get('user-agent') ?? ''
  const secret = process.env.CRON_SECRET
  const ok = secret ? auth === `Bearer ${secret}` : ua.toLowerCase().includes('vercel-cron')
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sent = await welcomeBacklog(100)
  return NextResponse.json({ sent })
}
