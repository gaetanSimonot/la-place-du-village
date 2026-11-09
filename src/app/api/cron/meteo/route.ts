import { NextRequest, NextResponse } from 'next/server'
import { produireArome, produireJours } from '@/lib/meteo/production'
import { ZONES_METEO } from '@/lib/meteo/zone'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const maxDuration = 300

/**
 * Cron météo.
 *
 *   ?source=arome  toutes les 3 h : la dernière sortie AROME → images horaires
 *   ?source=jours  deux fois par jour : la dernière sortie ECMWF → jours.json
 *
 * Si la sortie est déjà publiée, la tâche s'arrête tout de suite.
 * `?forcer=1` refait quand même (après un changement d'encodage).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const ua = req.headers.get('user-agent') ?? ''
  const secret = process.env.CRON_SECRET
  const isAuthorized = secret
    ? auth === `Bearer ${secret}`
    : ua.toLowerCase().includes('vercel-cron')
  if (!isAuthorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const source = sp.get('source') === 'jours' ? 'jours' : 'arome'
  const forcer = sp.get('forcer') === '1'
  const bilans: Record<string, unknown> = {}
  for (const z of Object.values(ZONES_METEO)) {
    try {
      bilans[z.slug] = source === 'jours' ? await produireJours(z, forcer) : await produireArome(z, forcer)
    } catch (e) {
      console.error(`[cron meteo ${source}] ${z.slug}`, e)
      bilans[z.slug] = { erreur: e instanceof Error ? e.message : String(e) }
    }
  }
  return NextResponse.json({ source, bilans })
}
