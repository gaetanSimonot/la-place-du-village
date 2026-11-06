import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * GET /api/version — la version en ligne (le commit déployé).
 *
 * Lue par VersionAJour pour savoir si le téléphone a ouvert une vieille copie
 * de l'appli. Le service worker ne met jamais /api en cache : la réponse est
 * toujours celle du serveur.
 */
export async function GET() {
  return NextResponse.json(
    { version: process.env.VERCEL_GIT_COMMIT_SHA || 'dev' },
    { headers: { 'Cache-Control': 'no-store' } })
}
