import { createClient } from '@supabase/supabase-js'
import { haversineKm, GANGES } from './distance'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

interface ZoneCentre {
  id: string
  nom: string
  lat: number
  lng: number
}

export interface ZoneCheckResult {
  within: boolean      // true = dans la zone → accepter
  distanceMin: number  // distance au centre le plus proche (km)
  centreLePlusProche: string
  rayon: number
}

/** Vérifie si des coordonnées sont dans la zone configurée.
 *  Si aucun centre défini → Ganges par défaut.
 *  Si pas de coords → within:true (on ne peut pas rejeter sans coords).
 */
export async function checkZone(lat: number | null, lng: number | null): Promise<ZoneCheckResult> {
  // Récupérer rayon + centres en parallèle
  const [rayonRes, centresRes] = await Promise.all([
    supabaseAdmin.from('config').select('value').eq('key', 'rayon_km').single(),
    supabaseAdmin.from('zone_centres').select('id, nom, lat, lng'),
  ])

  const rayon   = parseInt(rayonRes.data?.value ?? '30', 10)
  const centres: ZoneCentre[] = centresRes.data?.length
    ? centresRes.data
    : [{ id: 'default', nom: 'Ganges', lat: GANGES.lat, lng: GANGES.lng }]

  // Pas de coords → on laisse passer (a_verifier)
  if (lat == null || lng == null) {
    return { within: true, distanceMin: 0, centreLePlusProche: centres[0].nom, rayon }
  }

  // Distance au centre le plus proche
  let distanceMin  = Infinity
  let centreLePlusProche = centres[0].nom

  for (const c of centres) {
    const d = haversineKm(lat, lng, c.lat, c.lng)
    if (d < distanceMin) {
      distanceMin         = d
      centreLePlusProche  = c.nom
    }
  }

  return {
    within: distanceMin <= rayon,
    distanceMin: Math.round(distanceMin),
    centreLePlusProche,
    rayon,
  }
}
