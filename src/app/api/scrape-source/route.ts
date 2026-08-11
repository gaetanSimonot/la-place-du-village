import { NextRequest, NextResponse } from 'next/server'
import { scrapeSource } from '@/lib/scraper'
import { requireAdmin } from '@/lib/server-auth'

// Une source récurrente = 1 appel modèle + jusqu'à ~80 géocodages. 60 s était
// trop court et coupait le scrape en plein milieu.
export const maxDuration = 300

/**
 * Déclenche le scrape d'une source.
 *
 * ?dryRun=1 → APERÇU : tout est calculé (extraction, géocodage, filtre zone,
 * dates) mais RIEN n'est écrit en base. C'est la façon de vérifier une source
 * récurrente avant de la brancher pour de bon.
 *
 * Route réservée aux admins : elle consomme du crédit API et écrit en base.
 */
async function run(req: NextRequest, id: string | null, dryRun: boolean) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  try {
    const result = await scrapeSource(id, { dryRun })
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const dryRun = body?.dryRun === true || req.nextUrl.searchParams.get('dryRun') === '1'
  return run(req, body?.id ?? req.nextUrl.searchParams.get('id'), dryRun)
}

export async function GET(req: NextRequest) {
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'
  return run(req, req.nextUrl.searchParams.get('id'), dryRun)
}
