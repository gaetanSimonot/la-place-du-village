import { createClient } from '@supabase/supabase-js'
import { INDICE_GEO_SECTEUR } from './extract'

/**
 * LE TERRITOIRE — qui décide de quoi, et pourquoi.
 *
 * L'app couvre plusieurs territoires : les Cévennes, puis Pau. Le territoire
 * n'est pas déduit après coup des coordonnées — il est DÉCLARÉ par la source.
 * Un groupe WhatsApp ou Signal appartient à un territoire, et tout ce qu'il
 * apporte en hérite. Les coordonnées ne servent qu'à vérifier ensuite.
 *
 * Pourquoi ce sens-là : le géocodage échoue régulièrement (27 fiches sans
 * lieu aujourd'hui), et un événement à la frontière de deux territoires n'a
 * pas de bonne réponse géométrique. Le groupe, lui, sait toujours.
 *
 * TOUT ICI SE DÉGRADE EN SILENCE. Tant que la migration
 * `2026-09-19_territoires.sql` n'est pas jouée, chaque fonction rend `null`
 * et les appelants retombent sur le comportement d'avant. Le code peut donc
 * partir en production avant la migration sans rien casser.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

export interface Territoire {
  id: string
  slug: string
  nom: string
  rayon_affichage_km: number
  rayon_insertion_km: number
  indice_geo: string
  par_defaut: boolean
  actif: boolean
}

/**
 * Cache mémoire 60 s, comme les prompts.
 *
 * Un territoire change une fois par an ; on le relit à chaque événement d'une
 * affiche qui en contient vingt. Sans cache, ouvrir l'ingestion multiplierait
 * les allers-retours sans rien apporter.
 */
const CACHE_MS = 60_000
let cache: { a: number; liste: Territoire[] } | null = null

async function tous(): Promise<Territoire[]> {
  if (cache && Date.now() - cache.a < CACHE_MS) return cache.liste
  const { data, error } = await supabaseAdmin
    .from('territoires')
    .select('id, slug, nom, rayon_affichage_km, rayon_insertion_km, indice_geo, par_defaut, actif')
  // Table absente (migration pas encore jouée) → on se tait et on rend vide.
  if (error || !data) return []
  const liste = data as Territoire[]
  cache = { a: Date.now(), liste }
  return liste
}

/** Vide le cache — après une écriture admin sur les territoires. */
export function oublierTerritoires() { cache = null }

/** Le territoire où atterrit qui n'a rien choisi. `null` avant migration. */
export async function territoireParDefaut(): Promise<Territoire | null> {
  const liste = await tous()
  return liste.find(t => t.par_defaut) ?? liste[0] ?? null
}

export async function territoireParId(id: string | null | undefined): Promise<Territoire | null> {
  if (!id) return null
  return (await tous()).find(t => t.id === id) ?? null
}

export async function territoireParSlug(slug: string | null | undefined): Promise<Territoire | null> {
  if (!slug) return null
  return (await tous()).find(t => t.slug === slug) ?? null
}

/**
 * Le territoire d'un groupe de collecteur.
 *
 * Un groupe non déclaré retombe sur le territoire par défaut — délibérément.
 * Brancher un groupe ne demande donc AUCUNE déclaration préalable pour
 * continuer à alimenter les Cévennes ; la table ne sert qu'à dire « celui-là
 * est ailleurs ». C'est ce qui permet d'ouvrir un territoire en y connectant
 * des groupes, sans rien casser pour ceux qui tournent déjà.
 */
export async function territoireDuGroupe(
  source: string | null | undefined,
  groupe: string | null | undefined,
): Promise<Territoire | null> {
  const defaut = await territoireParDefaut()
  if (!defaut) return null
  if (!source || !groupe) return defaut

  const { data, error } = await supabaseAdmin
    .from('territoire_groupes')
    .select('territoire_id')
    .eq('source', source)
    .eq('groupe', groupe)
    .maybeSingle()

  if (error || !data?.territoire_id) return defaut
  return (await territoireParId(data.territoire_id as string)) ?? defaut
}

/**
 * Le repère de géocodage du territoire, ou celui du code à défaut.
 *
 * Passerelle volontaire : tant que la migration n'est pas jouée, on rend la
 * constante historique et le géocodage se comporte comme aujourd'hui.
 */
export function indiceGeoDe(t: Territoire | null): string {
  return t?.indice_geo?.trim() || INDICE_GEO_SECTEUR
}

/**
 * Le territoire d'une requete de LECTURE (`?territoire=<slug>`).
 *
 * Un slug inconnu retombe sur le defaut : on ne sert jamais une page vide a
 * cause d'une faute de frappe. Le parametre n'est pas une autorisation — il
 * choisit une vue sur du contenu deja public. Ce qu'il protege, c'est la
 * coherence de l'affichage.
 *
 * A utiliser avec `filtrerParTerritoire` : le filtre ne doit JAMAIS etre pose
 * quand le territoire est inconnu, sinon un echec de lecture viderait l'ecran
 * pour tout le monde.
 */
export async function territoireDeLaRequete(url: string): Promise<Territoire | null> {
  let slug: string | null = null
  try { slug = new URL(url).searchParams.get('territoire') } catch { slug = null }
  return (await territoireParSlug(slug)) ?? (await territoireParDefaut())
}
