import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { territoireParDefaut, territoireParSlug } from '@/lib/territoires'
import { lireConfigs } from '@/lib/configTerritoire'

/*
 * `force-dynamic` NE SUFFIT PAS, et ça s'est vu.
 *
 * Il rend la route dynamique, mais Next garde en cache le résultat des appels
 * à Supabase qu'elle contient : la route s'exécute, et relit une réponse
 * figée. Mesuré le 17/09/2026 — la table ne contenait plus que Ganges et le
 * rayon d'affichage valait 65 km en base, tandis que cette route servait
 * encore Montpellier et 115 km. Des événements à Sète, à plus de cent
 * kilomètres, remontaient dans l'agenda.
 *
 * Il faut les trois. Le piège est déjà documenté sur ce projet, vécu sur
 * /api/splash : cf. « force-dynamic insuffisant → fetchCache force-no-store ».
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/*
 * `?territoire=<slug>` sert le cadrage d'UN territoire.
 *
 * Sans le parametre — c'est-a-dire pour tout le monde aujourd'hui — on sert
 * celui par defaut, exactement comme avant. Le slug n'est pas une autorisation
 * : il ne donne acces qu'a des centres et un rayon, qui sont publics. Ce qu'il
 * protege, c'est la coherence de l'affichage, pas un secret.
 *
 * Le rayon et les centres viennent du TERRITOIRE, plus de `config` : c'est ce
 * qui permet de recentrer la carte sur Pau sans toucher aux 98 lectures de
 * config. Le point de depart de la carte, lui, y reste pour l'instant — il ne
 * differe que quand un territoire a son propre cadrage enregistre.
 */
// Route publique — lecture seule de la config zone pour le filtrage et la carte
export async function GET(req: NextRequest) {
  const slug = new URL(req.url).searchParams.get('territoire')
  const territoire = (await territoireParSlug(slug)) ?? (await territoireParDefaut())

  const requeteCentres = supabaseAdmin.from('zone_centres').select('id, nom, lat, lng')
  const [centresRes, affichageRes, cadrage] = await Promise.all([
    territoire ? requeteCentres.eq('territoire_id', territoire.id) : requeteCentres,
    supabaseAdmin.from('config').select('value').eq('key', 'rayon_affichage_km').single(),
    // Le point de depart de la carte appartient au territoire. Absent pour
    // lui, on retombe sur son PREMIER CENTRE plus bas : mieux vaut ouvrir sur
    // Pau que sur les Cevennes.
    lireConfigs(['carte_depart_lat', 'carte_depart_lng', 'carte_depart_zoom'], territoire),
  ])
  const centre0 = (centresRes.data ?? [])[0] as { lat: number; lng: number } | undefined

  return NextResponse.json({
    territoire: territoire ? { id: territoire.id, slug: territoire.slug, nom: territoire.nom } : null,
    centres:           centresRes.data ?? [],
    rayon_affichage:   territoire?.rayon_affichage_km ?? parseInt(affichageRes.data?.value ?? '0',  10),
    carte_depart_lat:  parseFloat(cadrage.carte_depart_lat  ?? String(centre0?.lat ?? 43.5785)),
    carte_depart_lng:  parseFloat(cadrage.carte_depart_lng  ?? String(centre0?.lng ?? 3.8940)),
    carte_depart_zoom: parseInt(cadrage.carte_depart_zoom   ?? '11', 10),
  })
}
