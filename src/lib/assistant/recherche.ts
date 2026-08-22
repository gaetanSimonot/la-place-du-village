/**
 * ASSISTANT VILLAGE — comment on cherche. SERVEUR UNIQUEMENT.
 *
 * LE PRINCIPE, et il vaut pour toutes les recherches de l'assistant :
 * c'est l'assistant qui élargit, pas la base.
 *
 * Aucune troncature, aucun dictionnaire de synonymes ne fera jamais le lien
 * entre « manger italien » et « Trattoria da Nino » ou « Gnocchi & Co ». En
 * revanche, un modèle de langue sait parfaitement que les restaurants
 * italiens s'appellent pizzeria, trattoria, pasta ; que les électriciens
 * s'appellent Elec ; que les boulangeries s'appellent fournil. C'est donc
 * LUI qui fournit la liste de mots, et la base se contente de retenir toute
 * fiche où l'un d'eux apparaît.
 *
 * Ce fichier tient les deux moitiés de ce contrat : normaliser les mots
 * qu'il propose, et classer ce que la base renvoie.
 */

/** Sans accents, sans casse — la seule forme dans laquelle on compare. */
export const nu = (v: unknown): string =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Combien de mots on accepte du modèle, et leur longueur utile. */
const MAX_MOTS = 8
const MIN_LONGUEUR = 3

/**
 * Nettoie la liste de mots proposée par l'assistant.
 *
 * On accepte aussi une chaîne : les modèles renvoient parfois « pizza,
 * italien » au lieu d'un tableau, et refuser la recherche pour ça serait
 * absurde. Les mots trop courts partent — « le », « à » ramèneraient la
 * moitié du village.
 */
export function motsCles(brut: unknown): string[] {
  const liste = Array.isArray(brut)
    ? brut
    : typeof brut === 'string'
      ? brut.split(/[,;/]|\bou\b/)
      : []
  const out: string[] = []
  for (const m of liste) {
    if (typeof m !== 'string') continue
    const t = m.trim().slice(0, 40)
    if (t.length < MIN_LONGUEUR) continue
    if (!out.some(x => nu(x) === nu(t))) out.push(t)
    if (out.length >= MAX_MOTS) break
  }
  return out
}

/**
 * À quel point cette fiche répond-elle à ce qu'on cherche ?
 *
 * Deux règles, et elles suffisent :
 *   — le NOM compte plus que la description. « Pizzeria del Sol » est un
 *     restaurant italien ; un hôtel dont la description dit « à deux pas
 *     d'une pizzeria » ne l'est pas ;
 *   — le PREMIER mot de la liste compte plus que le dernier. L'assistant
 *     range du plus précis au plus large, on respecte son ordre.
 *
 * Le champ porte-nom change d'une table à l'autre (`nom`, `titre`, `title`) :
 * une seule fonction classe donc les lieux, les événements, les promotions
 * et les annonces.
 */
export function pertinence(ligne: Record<string, unknown>, mots: string[]): number {
  if (!mots.length) return 0
  const nom = nu(ligne.nom ?? ligne.titre ?? ligne.title)
  const desc = [ligne.description_courte, ligne.description_longue, ligne.description]
    .map(nu).join(' ')
  let score = 0
  mots.forEach((m, i) => {
    const t = nu(m)
    if (!t) return
    const poids = mots.length - i
    if (nom.includes(t)) score += poids * 3
    else if (desc.includes(t)) score += poids
  })
  return score
}

/**
 * Classe et coupe.
 *
 * Une fiche qui ne répond à aucun mot est écartée : mieux vaut trois
 * résultats justes que douze dont neuf sont là par accident. Sans mot
 * cherché, on garde l'ordre que la base a donné.
 */
export function classer<T extends Record<string, unknown>>(
  lignes: T[],
  mots: string[],
  limite: number,
): T[] {
  if (!mots.length) return lignes.slice(0, limite)
  return lignes
    .map(l => ({ l, s: pertinence(l, mots) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limite)
    .map(x => x.l)
}

/**
 * Même chose pour les lieux, où la mise en avant commerciale entre en jeu.
 *
 * Elle départage à pertinence ÉGALE, jamais avant : l'inverse ferait passer
 * un restaurant Partenaire dont la description contient « menu » devant un
 * vrai menuisier. Une mauvaise réponse coûte la confiance bien plus vite
 * qu'une bonne place ne rapporte.
 */
export function classerLieux<T extends Record<string, unknown>>(
  lignes: T[],
  mots: string[],
  limite: number,
): T[] {
  const enAvant = (e: T) => Number(e.is_featured === true || e.plan === 'pro')
  const note = (e: T) => Number(e.note_google ?? 0)
  if (!mots.length) {
    return [...lignes].sort((x, y) => enAvant(y) - enAvant(x) || note(y) - note(x)).slice(0, limite)
  }
  return lignes
    .map(l => ({ l, s: pertinence(l, mots) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || enAvant(b.l) - enAvant(a.l) || note(b.l) - note(a.l))
    .slice(0, limite)
    .map(x => x.l)
}

/**
 * Le texte que l'on montre pendant la recherche : « pizzeria, italien… ».
 *
 * L'assistant réfléchit à voix basse ; en dire un mot rassure sur ce qu'il
 * est en train de faire, sans transformer l'écran en journal technique.
 */
export function libelleRecherche(mots: string[]): string | null {
  if (!mots.length) return null
  return mots.slice(0, 3).join(', ')
}
