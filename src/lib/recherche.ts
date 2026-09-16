/**
 * CHERCHER SANS AVOIR À ÉCRIRE JUSTE.
 *
 * Le défaut mesuré le 16/09/2026 : la recherche des commerces comparait des
 * sous-chaînes brutes, sans même retirer les accents. Conséquences vécues sur
 * une seule fiche — « Lucile Le Bihan, Psychothérapie & Équithérapie » :
 *
 *   « équithérapie »    trouvait
 *   « equitherapie »    ne trouvait pas   (accents)
 *   « équithérapeute »  ne trouvait pas   (le métier, pas la pratique)
 *   « psychothérapeute » ne trouvait pas  (idem)
 *
 * Le dernier cas est le plus intéressant, et aucune tolérance aux fautes ne le
 * règle : entre « équithérapie » et « équithérapeute » il y a trois
 * corrections, bien au-delà d'un seuil raisonnable. Ce qui les relie, c'est
 * leur DÉBUT COMMUN — `equitherap`, onze lettres. C'est la mécanique juste
 * pour les noms de métier français, qui ne diffèrent que par la terminaison :
 * -ie / -eute / -iste / -ien.
 *
 * MOT À MOT, pas en bloc. « yoga equitherapie » ne se trouve dans aucun titre
 * d'un seul tenant ; chaque mot pris séparément, oui.
 *
 * ON PEUT ÊTRE LARGE ICI. Une recherche trop tolérante montre un résultat de
 * trop : on le voit, on l'ignore, ça ne coûte rien. C'est l'inverse du
 * géocodage, où une approximation s'enregistre en silence — et où ce fichier
 * n'a donc rien à faire.
 */

/** Minuscules, accents retirés. Les codes sont échappés, jamais écrits. */
export function aplatir(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Les mots utiles d'un texte : deux lettres au moins, ponctuation jetée. */
export function motsDe(s: string | null | undefined): string[] {
  return aplatir(s).split(/[^a-z0-9]+/).filter(m => m.length >= 2)
}

/** Longueur du début commun à deux mots. */
function debutCommun(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i++
  return i
}

/**
 * Un mot tapé correspond-il à un mot de la fiche ?
 *
 * Trois façons, de la plus stricte à la plus souple. Le seuil de cinq lettres
 * sur le début commun n'est pas arbitraire : en dessous, « mar » rapprocherait
 * marché, marseille et marmite.
 */
function motCorrespond(motFiche: string, motTape: string): boolean {
  if (motFiche === motTape) return true
  if (motFiche.startsWith(motTape) || motTape.startsWith(motFiche)) return true

  /*
   * LE MOT COLLE AU PRECEDENT.
   *
   * « DecoRoom » s'ecrit en un seul mot, et on le cherche en deux. « deco »
   * passe — c'est le debut — mais « room » est AU MILIEU, ni debut ni fin.
   * Comme chaque mot tape doit trouver preneur, la recherche echouait
   * entiere. Le cas est courant dans les enseignes : DecoRoom, BioCoop,
   * MaxiZoo.
   *
   * Quatre lettres au minimum : en dessous, « ain » rapprocherait pain,
   * bain, main et Saint.
   */
  if (motTape.length >= 4 && motFiche.indexOf(motTape) > 0) return true
  if (motTape.length >= 5 && motFiche.length >= 5) {
    const c = debutCommun(motFiche, motTape)
    if (c >= 5 && c >= Math.min(motFiche.length, motTape.length) - 4) return true
  }
  return false
}

/**
 * La fiche répond-elle à la recherche ?
 *
 * TOUS les mots tapés doivent trouver preneur, chacun dans n'importe lequel
 * des champs. Exiger la présence de chaque mot est ce qui permet d'affiner en
 * tapant : « yoga ganges » doit rendre moins que « yoga ».
 */
export function correspond(champs: (string | null | undefined)[], requete: string): boolean {
  const tapes = motsDe(requete)
  if (!tapes.length) return true

  const motsFiche: string[] = []
  for (const c of champs) for (const m of motsDe(c)) {
    if (motsFiche.indexOf(m) === -1) motsFiche.push(m)
  }
  if (!motsFiche.length) return false

  return tapes.every(t => motsFiche.some(m => motCorrespond(m, t)))
}
