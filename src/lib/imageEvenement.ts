import type { Categorie } from './types'

/**
 * Illustration de repli, par catégorie, quand un événement n'a pas d'image.
 *
 * Sans elle, les événements sans affiche tombaient sur l'emoji de la
 * catégorie posé sur un aplat de couleur — le fameux caddie jaune des
 * marchés.
 *
 * Le cas s'est révélé bien plus large que les seuls marchés. Un programme
 * saisi d'une seule photo produit dix événements — les mardis de Ganges, un
 * cycle d'ateliers, une saison de concerts — et l'affiche ne suit qu'une
 * fois, quand elle suit. Tout le reste s'affichait sans image, et une liste
 * de cadres vides donne l'impression qu'il ne se passe rien.
 *
 * D'où une illustration pour CHAQUE catégorie, générée par
 * `scripts/generer-illustrations-categories.mjs`. Elles sont volontairement
 * abstraites — un motif aux couleurs de la catégorie, jamais une scène : une
 * photo générique de concert ferait croire à une photo DU concert, alors
 * qu'un motif se lit comme un pictogramme.
 */
const REPLI_PAR_CATEGORIE: Partial<Record<Categorie, string>> = {
  marche:          '/categories/marche.webp',
  concert:         '/categories/concert.webp',
  theatre:         '/categories/theatre.webp',
  sport:           '/categories/sport.webp',
  atelier:         '/categories/atelier.webp',
  fete:            '/categories/fete.webp',
  sante_bien_etre: '/categories/sante_bien_etre.webp',
  autre:           '/categories/autre.webp',
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
