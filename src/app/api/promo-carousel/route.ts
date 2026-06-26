import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'

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

export async function GET() {
  const { data } = await supabaseAdmin.from('config').select('value').eq('key', KEY).maybeSingle()
  let cfg: { order: string[]; coupDeCoeur: string | null } = { order: [], coupDeCoeur: null }
  try { if (data?.value) cfg = { order: [], coupDeCoeur: null, ...JSON.parse(data.value) } } catch { /* noop */ }
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
  const { error } = await supabaseAdmin.from('config').upsert({ key: KEY, value }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
