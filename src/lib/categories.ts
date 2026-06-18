import { Categorie } from './types'

export const CATEGORIES: Record<Categorie, { label: string; emoji: string; color: string }> = {
  concert: { label: 'Concert',  emoji: '🎵', color: '#E74C3C' },
  theatre: { label: 'Théâtre',  emoji: '🎭', color: '#9B59B6' },
  sport:   { label: 'Sport',    emoji: '⚽', color: '#27AE60' },
  marche:  { label: 'Marché',   emoji: '🛒', color: '#F39C12' },
  atelier: { label: 'Atelier',  emoji: '🎨', color: '#3498DB' },
  fete:    { label: 'Fête',     emoji: '🎉', color: '#E91E63' },
  sante_bien_etre: { label: 'Santé & bien-être', emoji: '🌿', color: '#16A085' },
  autre:   { label: 'Autre',    emoji: '📌', color: '#95A5A6' },
}

const VALID = new Set(Object.keys(CATEGORIES))

/**
 * Catégories d'un événement, avec repli rétro-compatible :
 * - utilise `categories` (tableau) si présent et non vide ;
 * - sinon retombe sur `[categorie]` (ancien champ unique) ;
 * - garantit toujours au moins une catégorie valide (`autre`).
 * Filtre les valeurs inconnues (robustesse données legacy).
 */
export function eventCategories(
  e: { categorie?: string | null; categories?: string[] | null },
): Categorie[] {
  const raw = (e.categories && e.categories.length > 0)
    ? e.categories
    : (e.categorie ? [e.categorie] : [])
  const clean = raw.filter((c): c is Categorie => VALID.has(c))
  return clean.length > 0 ? clean : ['autre']
}

/** Union dédupliquée de plusieurs listes de catégories, dans l'ordre d'apparition. */
export function mergeCategories(...lists: (string[] | undefined | null)[]): Categorie[] {
  const seen = new Set<string>()
  const out: Categorie[] = []
  for (const list of lists) {
    for (const c of list ?? []) {
      if (VALID.has(c) && !seen.has(c)) { seen.add(c); out.push(c as Categorie) }
    }
  }
  return out.length > 0 ? out : ['autre']
}
