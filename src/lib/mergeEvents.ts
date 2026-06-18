import { mergeCategories, eventCategories } from './categories'
import type { Categorie } from './types'

export interface MergeInput {
  id: string
  titre: string
  description: string | null
  heure: string | null
  categorie?: string | null
  categories?: string[] | null
}

export interface MergedResult {
  principalId: string
  absorbedIds: string[]
  categorie: Categorie
  categories: Categorie[]
  description: string
}

/**
 * Construit la fiche fusionnée à partir d'une liste ORDONNÉE d'événements.
 * `ordered[0]` = fiche principale conservée (date/lieu/image/titre gardés) ;
 * les autres deviennent son programme (ajouté à la description).
 *
 * Fonction PURE partagée client (aperçu) + serveur (commit) → l'aperçu
 * affiché correspond exactement au résultat enregistré.
 */
export function buildMergedEvent(ordered: MergeInput[]): MergedResult {
  const principal = ordered[0]
  const absorbed  = ordered.slice(1)

  const categories = mergeCategories(...ordered.map(e => eventCategories(e)))

  const lines = absorbed.map(e => {
    const h = e.heure ? `${e.heure.slice(0, 5)} — ` : ''
    const d = e.description?.trim() ? ` : ${e.description.trim()}` : ''
    return `• ${h}${e.titre}${d}`
  })
  const programme = lines.length ? `\n\nProgramme :\n${lines.join('\n')}` : ''
  const description = `${(principal.description ?? '').trim()}${programme}`.trim()

  return {
    principalId: principal.id,
    absorbedIds: absorbed.map(e => e.id),
    categorie: categories[0],
    categories,
    description,
  }
}
