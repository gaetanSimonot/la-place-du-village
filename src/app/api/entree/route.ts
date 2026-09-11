import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseEntree } from '@/lib/entreeApp'

// Une config admin lue par une route : `force-dynamic` ne suffit pas, Next
// cache le fetch et sert l'ancienne valeur malgré la base à jour (piège
// documenté sur ce projet, vécu sur /api/splash).
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * GET /api/entree — l'écran d'accueil s'ouvre-t-il, et sur quelle page
 * atterrit-on.
 *
 * Public et sans compte : c'est le réglage de la porte d'entrée, il est le
 * même pour tout le monde. Le client la garde en cache et la relit au
 * lancement suivant — d'où `no-store`, pour qu'un changement en admin ne
 * traîne pas derrière un cache de CDN en plus du cache du client.
 */
export async function GET() {
  const { data } = await supabaseAdmin
    .from('config').select('value').eq('key', 'entree_app').maybeSingle()

  return NextResponse.json(parseEntree(data?.value), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
