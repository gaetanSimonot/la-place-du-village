import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getUserContextFromRequest } from '@/lib/server-auth'
import { normaliserHeros, herosVisible } from '@/lib/villageHero'

/**
 * LE HÉROS DU VILLAGE — lecture.
 *
 * C'est le SERVEUR qui décide si le héros part ou non. Le filtrer côté client
 * laisserait le contenu dans la réponse : n'importe qui verrait, dans l'onglet
 * réseau, ce qui n'est ouvert qu'aux admins pendant le rodage.
 *
 * Réponse : { heros } ou { heros: null }. Jamais d'erreur — un héros absent
 * n'est pas une panne, c'est le cas courant.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0
// Sans ça, Next met la lecture de config en cache et l'admin continue de voir
// l'ancien héros après l'avoir changé. Cf. le même piège sur /api/splash.
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  const { data } = await supabaseAdmin
    .from('config').select('value').eq('key', 'village_hero').maybeSingle()

  const heros = normaliserHeros(data?.value)
  if (!heros) return NextResponse.json({ heros: null })

  const ctx = await getUserContextFromRequest(req)
  const estAdmin = !!ctx?.isAdmin

  if (!herosVisible(heros, estAdmin)) {
    // L'admin doit pouvoir le retrouver pour le rallumer : on lui rend le
    // héros éteint, avec de quoi savoir qu'il l'est. Aux autres, rien.
    return NextResponse.json(estAdmin ? { heros, eteint: true } : { heros: null })
  }
  return NextResponse.json({ heros, eteint: false, estAdmin })
}
