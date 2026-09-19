import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { territoireDeLaRequete } from '@/lib/territoires'
import { lireConfig, ecrireConfig } from '@/lib/configTerritoire'

export const dynamic = 'force-dynamic'

/**
 * Réglage du carrousel « À ne pas manquer » des promotions :
 *  - order        : ordre d'affichage choisi par l'admin (liste d'ids de promo).
 *  - coupDeCoeur  : la promo qui porte le badge « ★ Coup de cœur » (ou null).
 * Stocké dans config('promo_carousel').
 *
 * GET (public)  → { order, coupDeCoeur }
 * POST (admin)  → enregistre
 */
const KEY = 'promo_carousel'

export async function GET(req: NextRequest) {
  // L'ordre du carrousel designe des promos PRECISES, par leur identifiant.
  // Herite d'un autre territoire il ne designerait rien : la cle est
  // editoriale, donc `lireConfig` rend `null` plutot que celui du voisin.
  const valeur = await lireConfig(KEY, await territoireDeLaRequete(req.url))
  let cfg: { order: string[]; coupDeCoeur: string | null } = { order: [], coupDeCoeur: null }
  try { if (valeur) cfg = { order: [], coupDeCoeur: null, ...JSON.parse(valeur) } } catch { /* noop */ }
  return NextResponse.json(cfg)
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const body = await req.json().catch(() => ({}))
  const value = JSON.stringify({
    order: Array.isArray(body.order) ? body.order.filter((x: unknown) => typeof x === 'string') : [],
    coupDeCoeur: typeof body.coupDeCoeur === 'string' ? body.coupDeCoeur : null,
  })
  const res = await ecrireConfig(KEY, value, await territoireDeLaRequete(req.url))
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 })
  return NextResponse.json({ success: true })
}
