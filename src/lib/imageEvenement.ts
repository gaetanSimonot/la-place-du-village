import type { Categorie } from './types'

/**
 * Illustration de repli, par catégorie, quand un événement n'a pas d'image.
 *
 * Sans elle, les événements sans affiche tombaient sur l'emoji de la catégorie
 * posé sur un aplat de couleur — le fameux caddie jaune des marchés. Les
 * marchés en sont le cas typique : ils sont récurrents, personne ne produit
 * d'affiche pour le marché du mercredi, et ils n'auront donc jamais d'image
 * propre.
 *
 * Les autres catégories n'ont pas de repli : leurs événements viennent d'une
 * affiche ou d'une soumission, qui apporte presque toujours son image. Ajouter
 * une illustration générique pour un concert ferait croire à une photo du
 * concert — pour un marché, l'illustration se lit comme un pictogramme.
 */
const REPLI_PAR_CATEGORIE: Partial<Record<Categorie, string>> = {
  marche: '/categories/marche.webp',
}

interface EvenementImageable {
  image_url?: string | null
  categorie?: string | null
  categories?: string[] | null
}

/**
 * L'image à afficher : celle de l'événement, sinon le repli de sa catégorie,
 * sinon null (l'appelant garde alors son propre dégradé).
 *
 * La catégorie principale prime sur les secondaires : un « concert au marché »
 * garde le traitement d'un concert.
 */
export function imageEvenement(evt: EvenementImageable): string | null {
  if (evt.image_url) return evt.image_url
  const cats = [evt.categorie, ...(evt.categories ?? [])]
  for (const c of cats) {
    if (c && REPLI_PAR_CATEGORIE[c as Categorie]) return REPLI_PAR_CATEGORIE[c as Categorie]!
  }
  return null
}

/** Vrai si l'image affichée est un repli générique et non l'affiche de l'événement. */
export function estImageDeRepli(evt: EvenementImageable): boolean {
  return !evt.image_url && imageEvenement(evt) !== null
}
