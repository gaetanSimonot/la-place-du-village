import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { chargerIdentitesEtab } from '@/lib/identite'

/**
 * GET /api/annonces/public — liste publique d'annonces actives.
 *
 * Avant : page /annonces faisait une query Supabase directe côté client à
 * chaque changement de filtre (type, categorie, tri) → re-render bloquant.
 * Après : 1 fetch HTTP cacheable par variation URL.
 *
 * Query params :
 *   ?type=offre|demande|don|enchere_inversee
 *   ?categorie=mobilier|outils|...
 *   ?tri=date_desc|prix_asc|prix_desc   (défaut: date_desc)
 *
 * Cache : variant par URL, 60s s-maxage + 120s SWR.
 * PUBLIC : pas de requireUser (la page /annonces est ouverte). Les flags
 * type "c'est mon annonce" / favoris restent côté client (PERSO).
 */

export const revalidate = 60

const TRI_VALUES = ['date_desc', 'prix_asc', 'prix_desc'] as const
type Tri = typeof TRI_VALUES[number]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type      = searchParams.get('type')
  const categorie = searchParams.get('categorie')
  const triRaw    = (searchParams.get('tri') ?? 'date_desc') as Tri
  const tri: Tri  = TRI_VALUES.includes(triRaw) ? triRaw : 'date_desc'

  let query = supabaseAdmin
    .from('annonces')
    .select('*')
    .in('statut', ['active', 'don_final'])
    .order('sponsored', { ascending: false })

  if (type)      query = query.eq('type', type)
  if (categorie) query = query.eq('categorie', categorie)

  switch (tri) {
    case 'prix_asc':  query = query.order('prix_actuel', { ascending: true,  nullsFirst: false }); break
    case 'prix_desc': query = query.order('prix_actuel', { ascending: false, nullsFirst: false }); break
    default:          query = query.order('created_at',  { ascending: false })
  }

  query = query.limit(100)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Blase : on remplace l'auteur par la fiche ET on retire `user_id` de la
  // réponse publique. Sans ça, l'id partirait au navigateur et permettrait de
  // remonter au profil personnel derrière l'identité affichée.
  const brut = (data ?? []) as { user_id: string; etablissement_id?: string | null }[]
  const identites = await chargerIdentitesEtab(supabaseAdmin, brut.map(a => a.etablissement_id))

  const annonces = brut.map(a => {
    const etab = a.etablissement_id ? identites.get(a.etablissement_id) : undefined
    if (!etab) return a
    return {
      ...a,
      user_id: null,
      auteur_nom:    etab.nom,
      auteur_avatar: etab.photos?.[0] ?? null,
      auteur_href:   `/etablissement/${etab.id}`,
    }
  })

  return NextResponse.json({ annonces }, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  })
}
