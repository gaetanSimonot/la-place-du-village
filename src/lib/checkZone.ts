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
  within: boolean
  distanceMin: number
  centreLePlusProche: string
  rayon: number
}

/** Vérifie si des coordonnées sont dans la zone d'INSERTION.
 *  Si pas de coords → within:true (on ne peut pas rejeter sans coords).
 *
 *  `rayonOverride` permet à une source de définir son propre rayon sans
 *  toucher au réglage global : une page « marchés des Cévennes » doit être
 *  filtrée plus serré (50 km) qu'une source d'événements locale (100 km).
 */
/**
 * `territoire` restreint la mesure aux centres de CE territoire, avec SON
 * rayon d'insertion. Sans lui — et tant que la migration des territoires
 * n'est pas jouee — on retombe sur l'ancien comportement : tous les centres,
 * le rayon global. C'est ce qui permet de livrer ce code avant la migration.
 *
 * Sans ce decoupage, ouvrir Pau ferait accepter les evenements de Pau dans
 * les Cevennes : `zone_centres` a ete concue pour UN territoire a plusieurs
 * points d'ancrage, pas pour plusieurs territoires.
 */
export async function checkZone(
  lat: number | null,
  lng: number | null,
  rayonOverride?: number | null,
  territoire?: { id: string; nom: string; rayon_insertion_km: number } | null,
): Promise<ZoneCheckResult> {
  const requeteCentres = supabaseAdmin.from('zone_centres').select('id, nom, lat, lng')
  const [rayonRes, centresRes] = await Promise.all([
    supabaseAdmin.from('config').select('value').eq('key', 'rayon_insertion_km').single(),
    territoire ? requeteCentres.eq('territoire_id', territoire.id) : requeteCentres,
  ])

  const rayon = rayonOverride != null && rayonOverride > 0
    ? rayonOverride
    : territoire?.rayon_insertion_km ?? parseInt(rayonRes.data?.value ?? '100', 10)
  const centres: ZoneCentre[] = centresRes.data?.length
    ? centresRes.data
    : [{ id: 'default', nom: territoire?.nom ?? 'Ganges', lat: GANGES.lat, lng: GANGES.lng }]

  if (lat == null || lng == null) {
    return { within: true, distanceMin: 0, centreLePlusProche: centres[0].nom, rayon }
  }

  let distanceMin = Infinity
  let centreLePlusProche = centres[0].nom

  for (const c of centres) {
    const d = haversineKm(lat, lng, c.lat, c.lng)
    if (d < distanceMin) { distanceMin = d; centreLePlusProche = c.nom }
  }

  return {
    within: distanceMin <= rayon,
    distanceMin: Math.round(distanceMin),
    centreLePlusProche,
    rayon,
  }
}
