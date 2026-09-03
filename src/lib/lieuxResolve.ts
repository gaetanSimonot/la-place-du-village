import { supabaseAdmin } from './supabase-admin'

/**
 * TROUVER un lieu avant d'en CRÉER un.
 *
 * Constat du 03/09/2026 : la table `lieux` portait 1134 lignes pour environ
 * 285 lieux réels. « Le petit dojo » y figurait 88 fois, « St-Hippolyte-du-
 * Fort » 84 fois. Cause : /api/extract et processMessage inséraient un lieu
 * neuf à CHAQUE événement, sans jamais regarder s'il existait déjà.
 *
 * Deux conséquences, l'une visible et l'autre sournoise :
 *   • la carte empile des dizaines de repères au même endroit ;
 *   • deux copies du même événement ne partagent pas leur `lieu_id`, donc
 *     tout ce qui compare des événements par lieu les croit distincts — la
 *     vérification anti-doublon comprise.
 *
 * scraper-recurrent.ts faisait déjà les choses correctement. Cette fonction
 * est cette logique, mise en commun : d'abord l'identifiant Google, le plus
 * fiable ; à défaut le nom et la commune ; et seulement si rien ne
 * correspond, on crée.
 */

export interface GeoLieu {
  lat: number | null
  lng: number | null
  adresse: string | null
  place_id_google: string | null
}

export async function trouverOuCreerLieu(
  nom: string,
  commune: string | null,
  geo: GeoLieu,
): Promise<{ id: string | null; reutilise: boolean; error?: string }> {
  // 1. Par identifiant Google — le plus sûr : deux orthographes d'un même
  //    lieu retombent dessus.
  if (geo.place_id_google) {
    const { data } = await supabaseAdmin
      .from('lieux').select('id').eq('place_id_google', geo.place_id_google).limit(1).maybeSingle()
    if (data?.id) return { id: data.id, reutilise: true }
  }

  // 2. Par nom + commune, insensible à la casse.
  let q = supabaseAdmin.from('lieux').select('id').ilike('nom', nom).limit(1)
  if (commune) q = q.ilike('commune', commune)
  const { data: parNom } = await q.maybeSingle()
  if (parNom?.id) return { id: parNom.id, reutilise: true }

  // 3. Rien ne correspond : on crée.
  const { data: cree, error } = await supabaseAdmin
    .from('lieux')
    .insert({
      nom,
      adresse:         geo.adresse ?? null,
      lat:             geo.lat,
      lng:             geo.lng,
      place_id_google: geo.place_id_google,
      commune,
    })
    .select('id')
    .single()

  if (error || !cree) return { id: null, reutilise: false, error: error?.message ?? 'lieu_insert_failed' }
  return { id: cree.id, reutilise: false }
}
