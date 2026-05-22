import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/annuaire — payload unique pour le mode annuaire (commerces +
 * producteurs).
 *
 * Avant : page.tsx en mode annuaire lançait 2 fetch HTTP en série côté
 * client (`/api/producers` puis `/api/etablissements`) à chaque entrée
 * dans le mode.
 * Après : 1 fetch HTTP qui regroupe les deux côté serveur (Promise.all
 * sur les routes existantes, ré-exposées via URL absolue interne) et
 * sert depuis le cache CDN.
 *
 * Query params :
 *   ?type=resto|bar|bien_etre|... (optionnel — filtre etablissements)
 *
 * Cache : variant par URL (chaque ?type=X = entrée CDN propre).
 * 60s s-maxage + 120s SWR.
 *
 * Note : on appelle /api/producers et /api/etablissements en interne via
 * fetch (URL absolue construite depuis req.url) pour ne PAS dupliquer
 * la logique enrichie (drafts merge, plan owner filter, normalize cats,
 * etc.). Overhead Vercel serverless ~10-20ms.
 */

export const revalidate = 60

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const type = searchParams.get('type')

  const etabUrl = type
    ? `${origin}/api/etablissements?type=${encodeURIComponent(type)}`
    : `${origin}/api/etablissements`
  const prodUrl = `${origin}/api/producers`

  const [prodRes, etabRes] = await Promise.all([
    fetch(prodUrl, { cache: 'no-store' }).catch(() => null),
    fetch(etabUrl, { cache: 'no-store' }).catch(() => null),
  ])

  const producers     = prodRes && prodRes.ok ? (await prodRes.json())?.producers ?? [] : []
  const etablissements = etabRes && etabRes.ok ? (await etabRes.json())?.etablissements ?? [] : []

  return NextResponse.json({
    producers,
    etablissements,
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  })
}
