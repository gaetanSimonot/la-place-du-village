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
  /** Saisi au formulaire ; absent des extractions automatiques. */
  code_postal?: string | null
  /** Territoire de la source qui apporte ce lieu. Absent avant migration. */
  territoire_id?: string | null
}

/** Deux adresses désignent-elles le même endroit ? Comparaison volontairement
 *  grossière : la ponctuation, la casse et « , France » ne distinguent rien. */
function memeAdresse(a: string | null, b: string | null): boolean {
  const cle = (x: string | null) => (x ?? '')
    .toLowerCase()
    .replace(/,?\s*france\s*$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const ka = cle(a), kb = cle(b)
  if (!ka || !kb) return false
  return ka === kb || ka.includes(kb) || kb.includes(ka)
}

/** Une fiche existante peut-elle accueillir ce qu'on apporte ? */
function compatible(apportee: string | null, existante: string | null): boolean {
  if (!apportee) return true                 // rien de plus précis à perdre
  if (!existante) return false               // la fiche est plus vague : on n'y range pas une adresse
  return memeAdresse(apportee, existante)
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

  /*
   * 2. Par nom + commune, insensible à la casse.
   *
   * AVEC UNE RESERVE, et elle compte : quand l'annonce ne donne pas de nom de
   * lieu, le nom vaut le nom de la commune. « 70 route du Pont de la Croix »
   * et « Le Vigan » tout court arrivent alors tous les deux sous le nom
   * « Le Vigan » — et le second reutilisait la fiche du premier, sans son
   * adresse et avec les coordonnées du centre du village.
   *
   * On ne réutilise donc une fiche que si elle est COMPATIBLE : soit on
   * n'apporte pas d'adresse, soit elle porte la même. Une adresse précise ne
   * se range jamais dans une fiche qui n'en a pas.
   */
  let q = supabaseAdmin.from('lieux').select('id, adresse').ilike('nom', nom).limit(1)
  if (commune) q = q.ilike('commune', commune)
  const { data: parNom } = await q.maybeSingle()
  if (parNom?.id && compatible(geo.adresse, parNom.adresse as string | null)) {
    return { id: parNom.id, reutilise: true }
  }

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
      code_postal:     geo.code_postal ?? null,
      // Le lieu nait dans le territoire de la source qui l'a apporte.
      // Absent avant la migration des territoires : la colonne est alors
      // simplement omise.
      ...(geo.territoire_id ? { territoire_id: geo.territoire_id } : {}),
    })
    .select('id')
    .single()

  if (error || !cree) return { id: null, reutilise: false, error: error?.message ?? 'lieu_insert_failed' }
  return { id: cree.id, reutilise: false }
}
