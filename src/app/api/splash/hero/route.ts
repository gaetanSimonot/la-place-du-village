import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { territoireDeLaRequete } from '@/lib/territoires'
import { ecrireConfig } from '@/lib/configTerritoire'

export const dynamic = 'force-dynamic'

/**
 * POST (admin) — règle l'image héro du splash (slot dédié, indépendant du hub).
 * Body = { url: string } (URL publique de l'image, '' pour réinitialiser).
 * Stocké dans config('splash_hero_image_url').
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const body = await req.json().catch(() => ({}))
  const value = typeof body.url === 'string' ? body.url : ''
  // Le reglage appartient au territoire administre : c'est `ecrireConfig` qui
  // tranche entre `config` (territoire par defaut, table inchangee) et
  // `config_territoire`. La decision ne doit exister qu'a UN endroit.
  const terr = await territoireDeLaRequete(req.url)
  const res = await ecrireConfig('splash_hero_image_url', value, terr)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 })
  return NextResponse.json({ success: true })
}
