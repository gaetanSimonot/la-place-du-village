import { supabaseAdmin } from './supabase-admin'
import { territoireParDefaut, type Territoire } from './territoires'

/**
 * LIRE ET ÉCRIRE UN RÉGLAGE, POUR UN TERRITOIRE DONNÉ.
 *
 * `config` reste la table du territoire par défaut, intacte : ses 17 écritures
 * et ses 71 lectures continuent sans rien savoir de tout ceci. Les valeurs
 * propres à un autre territoire vivent dans `config_territoire`, et ce module
 * est le seul endroit qui sait lequel des deux interroger.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LA DISTINCTION QUI COMPTE : hériter, ou se taire.
 *
 * Quand Pau n'a pas de valeur pour une clé, il y a DEUX bonnes réponses selon
 * la nature de la clé, et les confondre produit des bugs opposés :
 *
 *   ÉDITORIAL — le héros, le splash, le carrousel, le sous-titre, la lettre.
 *   Ce sont des choses ÉCRITES pour un endroit. Hériter afficherait le journal
 *   des Cévennes aux habitants de Pau : un mensonge visible. On rend `null`.
 *
 *   TECHNIQUE — la maintenance, le style de carte, le modèle de l'assistant,
 *   ses quotas. Ce sont des réglages de l'outil, pas du lieu. Se taire les
 *   casserait : un territoire sans modèle d'assistant n'aurait plus
 *   d'assistant du tout. On hérite du global.
 *
 * La liste ci-dessous est donc une donnée, pas une opinion : c'est elle qui
 * décide, et elle se lit d'un coup d'œil.
 * ────────────────────────────────────────────────────────────────────────
 */

/**
 * Les clés ÉCRITES POUR UN ENDROIT. Absentes pour un territoire → `null`,
 * jamais la valeur d'un autre.
 */
export const CLES_EDITORIALES = new Set([
  'village_hero',
  'hub_subtitle',
  'hub_section_order',
  'hub_section_hidden',
  'hub_hero_intro_enabled',
  'hub_hero_intro_image_url',
  'splash_hero_image_url',
  'splash_decouvrir',
  'splash_promo',
  'promo_carousel',
  'image_library',
  'entree_app',
  'newsletter_current',
  'newsletter_draft',
  'newsletter_auto_last',
  'radio_topbar_logo',
  'radio_village_public',
  'cinema_village_public',
  'carte_depart_lat',
  'carte_depart_lng',
  'carte_depart_zoom',
])

/** Vrai si la clé se tait plutôt que d'hériter. */
export function estEditoriale(cle: string): boolean {
  return CLES_EDITORIALES.has(cle)
}

/** Cache 30 s : ces réglages sont lus plusieurs fois par rendu de page. */
const CACHE_MS = 30_000
const cache = new Map<string, { a: number; v: string | null }>()
const clefCache = (t: string, k: string) => `${t}|${k}`

/** Vide le cache d'un territoire — après une écriture admin. */
export function oublierConfig(territoireId?: string) {
  if (!territoireId) { cache.clear(); return }
  // Array.from plutot qu'une iteration directe : la cible TypeScript du
  // projet n'autorise pas de parcourir un iterateur de Map.
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(territoireId + '|')) cache.delete(k)
  }
}

async function lireGlobale(cle: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('config').select('value').eq('key', cle).maybeSingle()
  return data?.value ?? null
}

/**
 * La valeur d'un réglage pour ce territoire.
 *
 * Territoire par défaut (ou inconnu) → `config`, exactement comme avant.
 * Autre territoire → sa propre valeur ; à défaut, héritage ou `null` selon la
 * nature de la clé.
 */
export async function lireConfig(
  cle: string,
  territoire: Territoire | null,
): Promise<string | null> {
  const defaut = await territoireParDefaut()
  const estDefaut = !territoire || !defaut || territoire.id === defaut.id
  if (estDefaut) return lireGlobale(cle)

  const cc = clefCache(territoire.id, cle)
  const hit = cache.get(cc)
  if (hit && Date.now() - hit.a < CACHE_MS) return hit.v

  const { data } = await supabaseAdmin
    .from('config_territoire')
    .select('value')
    .eq('territoire_id', territoire.id)
    .eq('key', cle)
    .maybeSingle()

  const v = data?.value ?? (estEditoriale(cle) ? null : await lireGlobale(cle))
  cache.set(cc, { a: Date.now(), v })
  return v
}

/** Plusieurs réglages d'un coup, sans multiplier les allers-retours. */
export async function lireConfigs(
  cles: string[],
  territoire: Territoire | null,
): Promise<Record<string, string | null>> {
  const paires = await Promise.all(cles.map(async c => [c, await lireConfig(c, territoire)] as const))
  return Object.fromEntries(paires)
}

/**
 * Écrit un réglage POUR CE TERRITOIRE.
 *
 * Territoire par défaut → `config`, avec le même `onConflict: 'key'` que les
 * dix-sept écritures existantes : rien ne change pour elles.
 * Autre territoire → `config_territoire`.
 */
export async function ecrireConfig(
  cle: string,
  valeur: string | null,
  territoire: Territoire | null,
): Promise<{ ok: boolean; error?: string }> {
  const defaut = await territoireParDefaut()
  const estDefaut = !territoire || !defaut || territoire.id === defaut.id

  if (estDefaut) {
    const { error } = await supabaseAdmin
      .from('config')
      .upsert({ key: cle, value: valeur ?? '' }, { onConflict: 'key' })
    return error ? { ok: false, error: error.message } : { ok: true }
  }

  const { error } = await supabaseAdmin
    .from('config_territoire')
    .upsert(
      { territoire_id: territoire.id, key: cle, value: valeur, updated_at: new Date().toISOString() },
      { onConflict: 'territoire_id,key' },
    )
  oublierConfig(territoire.id)
  return error ? { ok: false, error: error.message } : { ok: true }
}
