import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

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

// Route publique — lecture seule de la config zone pour le filtrage et la carte
export async function GET() {
  const [centresRes, affichageRes, latRes, lngRes, zoomRes] = await Promise.all([
    supabaseAdmin.from('zone_centres').select('id, nom, lat, lng'),
    supabaseAdmin.from('config').select('value').eq('key', 'rayon_affichage_km').single(),
    supabaseAdmin.from('config').select('value').eq('key', 'carte_depart_lat').single(),
    supabaseAdmin.from('config').select('value').eq('key', 'carte_depart_lng').single(),
    supabaseAdmin.from('config').select('value').eq('key', 'carte_depart_zoom').single(),
  ])

  return NextResponse.json({
    centres:           centresRes.data ?? [],
    rayon_affichage:   parseInt(affichageRes.data?.value ?? '0',  10),
    carte_depart_lat:  parseFloat(latRes.data?.value  ?? '43.5785'),
    carte_depart_lng:  parseFloat(lngRes.data?.value  ?? '3.8940'),
    carte_depart_zoom: parseInt(zoomRes.data?.value   ?? '11', 10),
  })
}
