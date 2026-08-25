import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Identités d'établissement (« blase »).
 *
 * SOURCE UNIQUE de la question « sous quel nom ce contenu est-il publié ? ».
 * Aucun écran ne doit recomposer un nom d'auteur dans son coin : tout passe
 * par `resoudreAuteur()`, sinon l'identité finit par diverger d'une surface
 * à l'autre (même logique que notifRouting pour les notifications).
 *
 * Règle : `etablissement_id` NULL → profil personnel. Renseigné → la fiche.
 * `user_id` reste TOUJOURS renseigné en base (modération, quotas, droits) ;
 * seul l'affichage change.
 */

export interface Identite {
  kind:   'user' | 'etablissement'
  id:     string
  nom:    string
  avatar: string | null
  href:   string
}

/** Ce qu'un contenu porte en base pour désigner son auteur. */
export interface AuteurBrut {
  user_id:           string | null
  etablissement_id?: string | null
}

/** Profil personnel, tel que déjà chargé par les écrans existants. */
export interface ProfilBrut {
  user_id:      string
  display_name: string | null
  avatar_url?:  string | null
}

export interface EtabIdentite {
  id:      string
  nom:     string
  photos:  string[] | null
  /** Propriétaire de la fiche — sert à vérifier qu'un contenu la signe à bon droit. */
  user_id: string | null
}

/** Colonnes minimales à lire sur `etablissements` pour construire une identité. */
export const IDENTITE_ETAB_SELECT = 'id, nom, photos, user_id'

/**
 * Charge les identités de fiches en un seul appel.
 * Isomorphe : accepte `supabaseAdmin` (serveur) ou `supabase` (browser).
 * Les ids inconnus sont simplement absents de la Map.
 */
export async function chargerIdentitesEtab(
  client: SupabaseClient,
  ids: (string | null | undefined)[],
): Promise<Map<string, EtabIdentite>> {
  const uniques = Array.from(new Set(ids.filter(Boolean) as string[]))
  if (!uniques.length) return new Map()

  const { data } = await client
    .from('etablissements')
    .select(IDENTITE_ETAB_SELECT)
    .in('id', uniques)

  return new Map(((data ?? []) as EtabIdentite[]).map(e => [e.id, e]))
}

/**
 * Identité à AFFICHER pour un contenu.
 *
 * Repli volontaire sur le profil si la fiche est introuvable (supprimée) :
 * un contenu ne doit jamais devenir anonyme à cause d'une fiche manquante.
 */
export function resoudreAuteur(
  contenu:   AuteurBrut,
  profil:    ProfilBrut | null | undefined,
  identites: Map<string, EtabIdentite>,
): Identite {
  const etab = contenu.etablissement_id ? identites.get(contenu.etablissement_id) : undefined

  if (etab) {
    return {
      kind:   'etablissement',
      id:     etab.id,
      nom:    etab.nom,
      avatar: etab.photos?.[0] ?? null,
      href:   `/etablissement/${etab.id}`,
    }
  }

  return {
    kind:   'user',
    id:     contenu.user_id ?? '',
    nom:    profil?.display_name?.trim() || 'Un habitant',
    avatar: profil?.avatar_url ?? null,
    href:   contenu.user_id ? `/profil/${contenu.user_id}` : '#',
  }
}

/**
 * GARDE-FOU SERVEUR — à appeler dans toute route qui accepte un
 * `etablissement_id` venant du client, sinon n'importe qui publie sous le nom
 * d'un commerce du village.
 *
 * Volontairement SANS passe-droit admin : être admin donne le droit d'éditer
 * une fiche, pas celui de parler en son nom. Seule l'attribution réelle
 * (`etablissements.user_id`) ouvre le blase.
 *
 * @returns l'id validé, `null` si aucun blase demandé, `false` si refusé.
 */
export async function validerIdentiteDemandee(
  client: SupabaseClient,
  userId: string,
  demande: unknown,
): Promise<string | null | false> {
  if (demande === undefined || demande === null || demande === '') return null
  if (typeof demande !== 'string') return false

  const { data } = await client
    .from('etablissements')
    .select('id, user_id')
    .eq('id', demande)
    .maybeSingle()

  if (!data || (data as { user_id: string | null }).user_id !== userId) return false
  return demande
}
