import { NextResponse } from 'next/server'

/**
 * GET /api/cron/purge-moments — DÉSACTIVÉ.
 *
 * Les moments (reels) ne sont plus supprimés après 24h : ils disparaissent
 * de l'accueil (filtre expires_at) mais restent accrochés au mur de leur
 * auteur (onglet « Reels »), comme les publications. On ne purge donc plus
 * ni les lignes ni les médias Storage. Route conservée en no-op pour ne pas
 * casser un éventuel appel cron déjà programmé.
 */
export async function GET() {
  return NextResponse.json({ purged: 0, disabled: true })
}
