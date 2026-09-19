import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { territoireDeLaRequete } from '@/lib/territoires'
import { lireConfig, ecrireConfig } from '@/lib/configTerritoire'
import { SPLASH_PROMO_KEY, normalizeSplashPromo, parseSplashPromo } from '@/lib/splashPromo'

// Lecture d'une config admin : force-dynamic ne suffit pas, Next cache le fetch
// supabase et sert l'ancienne valeur (déjà vécu sur /api/splash, cf. la tuile
// « À découvrir » bloquée). Les trois lignes sont nécessaires ensemble.
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * Réglages des splashs promotionnels de l'offre Habitant.
 * Stocké dans config('splash_promo'). Voir src/lib/splashPromo.ts.
 *
 * GET  (public) → la config complète, défauts compris
 * POST (admin)  → enregistre après validation
 *
 * Pas de cache CDN : l'admin doit voir l'effet de son réglage immédiatement,
 * et la charge est négligeable (une ligne, lue au plus une fois par session).
 */

export async function GET(req: NextRequest) {
  // Chaque territoire a sa campagne — et surtout sa propre frontiere
  // veterans/nouveaux (`activatedAt`). Herite, un territoire tout neuf
  // considererait ses premiers habitants comme des anciens.
  const valeur = await lireConfig(SPLASH_PROMO_KEY, await territoireDeLaRequete(req.url))
  return NextResponse.json(parseSplashPromo(valeur), {
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  // On re-normalise côté serveur : le client peut envoyer n'importe quoi.
  const incoming = normalizeSplashPromo(body)

  // `activatedAt` n'est JAMAIS pris dans le corps de la requête — sinon
  // n'importe quel admin pourrait déplacer la frontière vétérans/nouveaux,
  // volontairement ou par un copier-coller malheureux. Elle est posée une
  // seule fois, à la première bascule off → on, et conservée ensuite : le
  // système peut être éteint puis rallumé sans que la frontière ne bouge.
  const terr = await territoireDeLaRequete(req.url)
  const stored = parseSplashPromo(await lireConfig(SPLASH_PROMO_KEY, terr))
  const activatedAt = stored.activatedAt ?? (incoming.enabled ? new Date().toISOString() : null)

  // « Relancer le cycle » : action explicite (body.resetCycle), pas un champ de
  // formulaire. Comme activatedAt, la valeur est posée par le serveur et jamais
  // reprise du corps de la requête — sinon un enregistrement ordinaire pourrait
  // relancer la campagne de 253 personnes par accident.
  const cycleEpoch = body?.resetCycle === true
    ? new Date().toISOString()
    : stored.cycleEpoch

  const cfg = { ...incoming, activatedAt, cycleEpoch }

  const res = await ecrireConfig(SPLASH_PROMO_KEY, JSON.stringify(cfg), terr)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 })

  // Renvoie la config telle qu'enregistrée : le client affiche la valeur
  // effective (bornée) plutôt que ce qu'il croyait avoir saisi.
  return NextResponse.json({ success: true, config: cfg })
}
