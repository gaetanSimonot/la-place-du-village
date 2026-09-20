import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * GET /api/maintenance — public, retourne { enabled: boolean }.
 *
 * FAIL OPEN : toute erreur (DB down, clé absente, exception) → { enabled: false }.
 * Le mode maintenance ne peut JAMAIS s'auto-déclencher sur incident.
 *
 * AUCUN CACHE, ET C'EST LE BUT.
 *
 * L'interrupteur servait a etre mis en <90 s : 30 s de CDN, 60 s de
 * revalidation en arriere-plan, plus l'intervalle du client. Or on n'allume
 * pas la maintenance pour dans une minute et demie — on l'allume parce que
 * quelque chose est casse MAINTENANT, et on l'eteint parce que c'est repare.
 * Une minute et demie d'ecart entre le geste et l'effet, c'est exactement le
 * moment ou l'on se demande si le geste a marche, et ou l'on s'y reprend.
 *
 * Les trois directives vont ENSEMBLE : `force-dynamic` seul ne suffit pas,
 * Next garde en cache le `fetch` vers Supabase et la route reexecutee relit
 * une reponse figee. Piege deja vecu sur /api/splash et /api/zone.
 *
 * Ce que ca coute : un appel de fonction par ouverture d'app et par minute
 * (le client interroge toutes les 60 s). A l'echelle du trafic actuel, c'est
 * indetectable — et c'est le prix d'un interrupteur qui repond.
 */

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('config')
      .select('value')
      .eq('key', 'maintenance_mode')
      .maybeSingle()

    if (error) return NextResponse.json({ enabled: false })

    return NextResponse.json(
      { enabled: data?.value === 'true' },
      {
        // `no-store` cote CDN aussi : sans lui, Vercel servirait la reponse
        // precedente a tous les autres visiteurs pendant la fenetre.
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  } catch {
    return NextResponse.json({ enabled: false })
  }
}
