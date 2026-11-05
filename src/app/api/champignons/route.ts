import { NextRequest, NextResponse } from 'next/server'
import { territoireDeLaRequete } from '@/lib/territoires'
import { lireConfig } from '@/lib/configTerritoire'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseVisibiliteBois, type Champignon } from '@/lib/champignons'
import { estInvite } from '@/lib/invites-server'
import { getUserContextFromRequest } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * GET /api/champignons — le guide « Dans nos bois » du territoire.
 *
 * Public, sans compte. Les espèces du territoire, plus celles qui valent
 * partout (`territoire_id` null). Quarante fiches tiennent dans une réponse.
 *
 * Même règle de visibilité que les autres modules : la route dit ce qu'il en
 * est (`villageVisibilite`, `villageInvite`), c'est le bloc du Village qui
 * décide de s'afficher. La page /bois, elle, reste toujours accessible.
 */
export async function GET(req: NextRequest) {
  const terr = await territoireDeLaRequete(req.url)
  const villageVisibilite = parseVisibiliteBois(await lireConfig('bois_village_public', terr))

  // L'invitation se tranche ici ; la liste des invités ne sort jamais.
  const moi = await getUserContextFromRequest(req)
  const villageInvite = await estInvite(
    'bois_village_public', terr?.par_defaut ? null : terr?.id ?? null, moi?.userId ?? null)

  let q = supabaseAdmin
    .from('champignons')
    .select('id, nom, nom_latin, statut, milieux, couleurs, saison, reconnaitre, sosies, cuisine, danger, photo_url, photo_credit, ordre')
    .eq('actif', true)
    .order('ordre')
  q = terr?.id ? q.or(`territoire_id.eq.${terr.id},territoire_id.is.null`) : q.is('territoire_id', null)
  const { data, error } = await q

  return NextResponse.json({
    especes: (error ? [] : data ?? []) as Champignon[],
    villageVisibilite,
    villageInvite,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
