import { supabase } from './supabase'
import { estEditoriale } from './configCles'

/**
 * LIRE DES RÉGLAGES DEPUIS LE NAVIGATEUR, pour un territoire donné.
 *
 * Le pendant client de `configTerritoire.ts`, avec exactement la même règle —
 * les deux partagent `CLES_EDITORIALES`, sans quoi l'admin enregistrerait un
 * héros là où l'app en lirait un autre.
 *
 * Lecture directe Supabase et non `fetch('/api/…')` : le service worker peut
 * intercepter les routes API, et ces réglages pilotent l'affichage.
 *
 * `territoireId` vaut `null` pour le territoire par défaut — on lit alors
 * `config`, exactement comme le faisaient les écrans avant ce chantier.
 */
export async function lireConfigsClient(
  cles: string[],
  territoireId: string | null,
  estDefaut: boolean,
): Promise<Record<string, string | null>> {
  const globales = async (): Promise<Record<string, string | null>> => {
    const { data } = await supabase.from('config').select('key, value').in('key', cles)
    const m: Record<string, string | null> = {}
    for (const c of cles) m[c] = null
    for (const r of (data ?? []) as { key: string; value: string | null }[]) m[r.key] = r.value
    return m
  }

  if (estDefaut || !territoireId) return globales()

  const [{ data: propres }, base] = await Promise.all([
    supabase.from('config_territoire').select('key, value')
      .eq('territoire_id', territoireId).in('key', cles),
    globales(),
  ])

  const m: Record<string, string | null> = {}
  const parTerritoire = new Map(
    ((propres ?? []) as { key: string; value: string | null }[]).map(r => [r.key, r.value]),
  )
  for (const c of cles) {
    // Sa valeur si elle existe ; sinon `null` pour l'éditorial, la globale
    // pour le technique.
    m[c] = parTerritoire.has(c) ? (parTerritoire.get(c) ?? null) : (estEditoriale(c) ? null : base[c])
  }
  return m
}

/**
 * Enregistre un réglage pour le territoire administré.
 *
 * Passe toujours par `/api/admin/config`, qui tranche entre `config` et
 * `config_territoire` selon la nature de la clé : la décision ne doit exister
 * qu'à UN endroit, et c'est côté serveur.
 */
export function urlEcritureConfig(slugTerritoire: string | null): string {
  return slugTerritoire
    ? `/api/admin/config?territoire=${encodeURIComponent(slugTerritoire)}`
    : '/api/admin/config'
}
