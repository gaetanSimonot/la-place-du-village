/**
 * LES COMMUNES, ÉCRITES D'UNE SEULE FAÇON.
 *
 * Le problème mesuré le 16/09/2026 : 221 graphies distinctes en base pour une
 * soixantaine de communes réelles. Saint-Hippolyte-du-Fort s'y écrivait à lui
 * seul de cinq manières — « St-Hippolyte-du-Fort », « St Hippolyte du Fort »,
 * « Saint-Hippolyte du Fort »… Pour l'app, c'étaient cinq endroits différents :
 * cinq entrées de filtre, cinq compteurs, et une recherche qui en trouve un
 * sur cinq.
 *
 * La clé ci-dessous ramène toutes ces écritures à une seule chaîne. Elle sert
 * à COMPARER, jamais à afficher — on garde la plus jolie graphie rencontrée
 * pour l'écran.
 *
 * CE QU'ELLE NE FAIT PAS, DÉLIBÉRÉMENT. Elle ne rapproche que ce qui est
 * identique une fois normalisé. « Saint Hippolyte des Fleurs » reste distinct
 * de « Saint-Hippolyte-du-Fort » — ce n'est pas la même chaîne, et deviner
 * qu'il s'agit d'une faute serait fusionner deux villages sur une intuition.
 * De même « Ganges / St Hippolyte du Fort » reste à part : c'est une fiche qui
 * en désigne deux, pas une graphie de plus.
 */

/**
 * La clé de comparaison d'une commune.
 *
 * Minuscules, accents retirés, ponctuation en espaces, puis tout collé. Les
 * abréviations d'usage sont traduites AVANT le collage, sinon « st » collé à
 * la suite ne se distinguerait plus d'un début de mot.
 */
export function cleCommune(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bst\b/g, 'saint')
    .replace(/\bste\b/g, 'sainte')
    .replace(/\bsts\b/g, 'saints')
    .trim()
    .replace(/\s+/g, '')
}

/**
 * Deux écritures désignent-elles la même commune ?
 *
 * Une commune ABSENTE est compatible avec tout : une fiche sans commune ne
 * contredit personne, et l'écarter pour ça a déjà laissé passer des doublons.
 */
export function memeCommune(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = cleCommune(a), kb = cleCommune(b)
  if (!ka || !kb) return true
  return ka === kb
}

/**
 * Entre deux écritures de la même commune, laquelle garder à l'écran ?
 *
 * On préfère celle qui porte le plus d'information : les accents d'abord —
 * « Avèze » vaut mieux que « Aveze » —, puis « Saint » écrit en entier, puis
 * les traits d'union, et à égalité la plus fréquente. Le but n'est pas la
 * beauté mais la stabilité : il faut que le même lot de graphies élise
 * toujours la même gagnante, quel que soit l'ordre de lecture.
 */
/**
 * AUCUNE LETTRE ACCENTUÉE ÉCRITE EN CLAIR DANS UNE EXPRESSION RÉGULIÈRE ICI.
 *
 * Une classe comme `[A-Z<accents>]` se lit très bien mais ne survit pas
 * toujours au voyage — compilation TypeScript, réécriture du fichier par un
 * script, changement d'encodage. Elle cesse alors de correspondre à quoi que
 * ce soit, EN SILENCE : le score tombe à zéro pour tout le monde et le
 * départage se fait au hasard. Vécu deux fois le 16/09/2026.
 *
 * On passe donc par `toUpperCase` / `toLowerCase`, qui connaissent les accents
 * sans qu'on ait à les écrire.
 */
const estMajuscule = (c: string): boolean => c === c.toUpperCase() && c !== c.toLowerCase()
const estMinuscule = (c: string): boolean => c === c.toLowerCase() && c !== c.toUpperCase()

/** Le texte dépouillé de ses accents. Les codes sont échappés, pas écrits. */
const sansAccents = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')

export function scoreGraphie(s: string): number {
  let n = 0

  // Porte des accents — « Avèze » vaut mieux que « Aveze ».
  if (sansAccents(s) !== s) n += 4

  // « Saint » écrit en entier plutôt qu'abrégé.
  if (/\bsaint/i.test(sansAccents(s))) n += 3

  // Les traits d'union de la graphie officielle : « Viols-le-Fort » en a deux,
  // « Viols le Fort » aucun.
  n += Math.min(3, (s.match(/-/g) ?? []).length) * 2

  /*
   * Les mots proprement capitalisés — une majuscule SUIVIE d'une minuscule.
   * « Viols-le-Fort » en compte deux, « Viols-le-fort » une seule, et
   * « CROS » aucune : les majuscules intégrales ne doivent pas l'emporter,
   * c'est de la saisie au clavier verrouillé, pas une graphie.
   */
  for (const mot of s.split(/[\s'’./,()-]+/)) {
    if (mot.length >= 2 && estMajuscule(mot[0]) && estMinuscule(mot[1])) n += 1
  }

  return n
}

/** La meilleure écriture d'un lot, à clé égale. */
export function meilleureGraphie(formes: string[]): string {
  return [...formes].sort((a, b) => {
    const d = scoreGraphie(b) - scoreGraphie(a)
    if (d !== 0) return d
    // Départage stable : la plus longue, puis l'ordre alphabétique.
    if (b.length !== a.length) return b.length - a.length
    return a.localeCompare(b, 'fr')
  })[0]
}

/* ── Rapprochement tolérant, pour PROPOSER — jamais pour décider ────────── */

/**
 * Le nombre de corrections pour passer d'un mot à l'autre.
 *
 * Bornée : au-delà de `max`, on arrête de compter et on rend `max + 1`. Sur
 * une liste de deux cents communes comparées à chaque frappe, ça évite de
 * dérouler la matrice entière pour des mots qui n'ont rien à voir.
 */
export function distance(a: string, b: string, max = 3): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1

  let precedente = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const courante = [i]
    let meilleureDeLaLigne = i
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1
      const v = Math.min(courante[j - 1] + 1, precedente[j] + 1, precedente[j - 1] + cout)
      courante.push(v)
      if (v < meilleureDeLaLigne) meilleureDeLaLigne = v
    }
    // Toute la ligne dépasse déjà le plafond : la suite ne redescendra pas.
    if (meilleureDeLaLigne > max) return max + 1
    precedente = courante
  }
  return precedente[b.length]
}

/**
 * Ce qu'on propose à quelqu'un qui tape « St-Hippo ».
 *
 * Trois passes, de la plus sûre à la plus tolérante, et on s'arrête à la
 * première qui rend quelque chose : égalité, puis début de mot, puis faute de
 * frappe. Chercher les trois d'un coup noierait la bonne réponse au milieu des
 * approximations.
 *
 * LE PRÉFIXE AVANT LA DISTANCE D'ÉDITION, et c'est important : quand on
 * abrège, on abrège par la fin. « Hippo » est à neuf corrections de
 * « Hippolyte » — aucune tolérance raisonnable ne les rapproche — alors que
 * c'en est le début exact.
 */
export function proposerCommunes(saisie: string, connues: string[], max = 8): string[] {
  const q = cleCommune(saisie)
  if (q.length < 2) return []

  const paires = connues.map(nom => ({ nom, cle: cleCommune(nom) }))

  const exactes = paires.filter(p => p.cle === q)
  if (exactes.length) return exactes.map(p => p.nom).slice(0, max)

  const debuts = paires.filter(p => p.cle.startsWith(q) || q.startsWith(p.cle))
  if (debuts.length) {
    return debuts.sort((a, b) => a.cle.length - b.cle.length).map(p => p.nom).slice(0, max)
  }

  const dedans = paires.filter(p => p.cle.includes(q))
  if (dedans.length) {
    return dedans.sort((a, b) => a.cle.length - b.cle.length).map(p => p.nom).slice(0, max)
  }

  /*
   * LE PRÉFIXE TOLÉRANT — abréger ET se tromper en même temps.
   *
   * « sainthipo » n'est le début exact de rien, et sa distance au nom complet
   * est énorme parce qu'il lui manque onze lettres. On compare donc la saisie
   * au DÉBUT du candidat, sur sa propre longueur : « sainthipo » contre
   * « sainthipp », une correction. C'est le cas le plus courant chez quelqu'un
   * qui tape vite le début d'un nom qu'il connaît mal.
   */
  const seuilDebut = Math.min(2, Math.floor(q.length / 5))
  if (seuilDebut >= 1) {
    const debutsFlous = paires
      .map(p => ({ ...p, d: distance(p.cle.slice(0, q.length), q, seuilDebut) }))
      .filter(p => p.d <= seuilDebut)
    if (debutsFlous.length) {
      return debutsFlous
        .sort((a, b) => a.d - b.d || a.cle.length - b.cle.length)
        .map(p => p.nom).slice(0, max)
    }
  }

  // Une correction par tranche de quatre lettres, deux au plus : sur un mot
  // court, tolérer deux fautes rapprocherait n'importe quoi de n'importe quoi.
  const seuil = Math.min(2, Math.floor(q.length / 4))
  if (seuil < 1) return []

  return paires
    .map(p => ({ ...p, d: distance(p.cle, q, seuil) }))
    .filter(p => p.d <= seuil)
    .sort((a, b) => a.d - b.d || a.cle.length - b.cle.length)
    .map(p => p.nom)
    .slice(0, max)
}
