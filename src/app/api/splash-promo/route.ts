import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
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

export async function GET() {
  const { data } = await supabaseAdmin
    .from('config').select('value').eq('key', SPLASH_PROMO_KEY).maybeSingle()
  return NextResponse.json(parseSplashPromo(data?.value), {
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  // On re-normalise côté serveur : le client peut envoyer n'importe quoi.
  const cfg = normalizeSplashPromo(body)

  const { error } = await supabaseAdmin
    .from('config')
    .upsert({ key: SPLASH_PROMO_KEY, value: JSON.stringify(cfg) }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Renvoie la config telle qu'enregistrée : le client affiche la valeur
  // effective (bornée) plutôt que ce qu'il croyait avoir saisi.
  return NextResponse.json({ success: true, config: cfg })
}
