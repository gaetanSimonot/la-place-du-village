import { NextRequest, NextResponse } from 'next/server'
import { affichesSansVignette, fabriquerVignette } from '@/lib/vignettesServeur'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const maxDuration = 60

/** Marge sous maxDuration : on s'arrête proprement, le prochain passage reprend. */
const BUDGET_MS = 45_000
const EN_PARALLELE = 4

/**
 * Cron toutes les 10 minutes — fabrique les miniatures d'affiches manquantes
 * (cf. lib/vignettes.ts).
 *
 * Un balayage plutôt qu'un appel à chaque envoi : les affiches arrivent par
 * une demi-douzaine de portes (formulaire, inbox, collecteurs hors du dépôt,
 * scraping, partage, envoi direct par URL signée). Le balayage les couvre
 * toutes, y compris celles qu'on ajoutera demain, et a servi au rattrapage
 * de l'existant. En attendant son passage, l'app affiche l'original.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const ua = req.headers.get('user-agent') ?? ''
  const secret = process.env.CRON_SECRET
  const isAuthorized = secret
    ? auth === `Bearer ${secret}`
    : ua.toLowerCase().includes('vercel-cron')
  if (!isAuthorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ?refaire=1 : regénère TOUTES les miniatures (réglages changés). Plusieurs
  // passages si besoin : ?refaire=1&depuis=N reprend à la N-ième affiche.
  const sp = req.nextUrl.searchParams
  const refaire = sp.get('refaire') === '1'
  const depuis = Math.max(0, Number(sp.get('depuis')) || 0)
  const debut = Date.now()
  const manquants = (await affichesSansVignette(refaire)).slice(refaire ? depuis : 0)
  let faites = 0, octets = 0
  const echecs: string[] = []
  const file = [...manquants]
  await Promise.all(Array.from({ length: EN_PARALLELE }, async () => {
    while (file.length && Date.now() - debut < BUDGET_MS) {
      const chemin = file.shift()!
      try { const n = await fabriquerVignette(chemin); octets += n; faites++ }
      catch (e) { echecs.push(`${chemin} : ${e instanceof Error ? e.message : String(e)}`) }
    }
  }))
  if (echecs.length) console.error('[cron vignettes] échecs', echecs)
  return NextResponse.json({
    manquantes: manquants.length, faites, restantes: file.length,
    echecs: echecs.length, ko: Math.round(octets / 1024), ms: Date.now() - debut,
  })
}
