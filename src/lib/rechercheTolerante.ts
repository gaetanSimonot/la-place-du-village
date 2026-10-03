/**
 * RECHERCHE TOLÉRANTE PAR NOM — accents, majuscules, ponctuation et fautes
 * de frappe ignorés.
 *
 * « cinema ganges » trouve « Cinéma Le Palace » à Ganges, « bobinne » trouve
 * « Cinéma La Bobine ». Un `ilike` ne fait rien de tout ça : « cinema » ne
 * trouve pas « Cinéma ».
 *
 * Chaque mot cherché doit trouver un écho — dans le nom (au début d'un mot,
 * dedans, ou à une ou deux fautes près selon sa longueur) ou, à défaut, dans
 * la commune. Le score classe : nom qui commence pareil > mot entier > faute.
 * En JS plutôt qu'en SQL : la table tient en mémoire (quelques milliers de
 * fiches) et Postgres n'a ni `unaccent` ni `pg_trgm` activés ici.
 */

export function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Distance d'édition (insertion, suppression, substitution, inversion de deux lettres). */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    let minLigne = Infinity
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      minLigne = Math.min(minLigne, d[i][j])
    }
    if (minLigne > max) return max + 1
  }
  return d[a.length][b.length]
}

/** Fautes tolérées pour un mot de cette longueur. */
const tolerance = (n: number) => (n <= 3 ? 0 : n <= 6 ? 1 : 2)

/** Écho d'un mot cherché dans une liste de mots : 0 (rien) à 1 (début exact). */
function echo(mot: string, mots: string[]): number {
  let meilleur = 0
  for (const m of mots) {
    if (m.startsWith(mot)) return 1
    if (m.includes(mot) && mot.length >= 3) meilleur = Math.max(meilleur, 0.85)
    // Le nom abrège le mot cherché : « Ciné » pour « cinema ».
    if (m.length >= 4 && mot.startsWith(m)) meilleur = Math.max(meilleur, 0.7)
    const t = tolerance(mot.length)
    if (t) {
      // Le mot cherché peut n'être que le début du nom (frappe en cours).
      const cible = m.length > mot.length + t ? m.slice(0, mot.length) : m
      const d = distance(mot, cible, t)
      if (d <= t) meilleur = Math.max(meilleur, 0.75 - 0.1 * d)
    }
  }
  return meilleur
}

/** Score d'une fiche pour une requête déjà normalisée ; 0 = écartée. */
export function scoreFiche(requete: string, nom: string, commune: string | null): number {
  const mots = requete.split(' ').filter(Boolean)
  if (!mots.length) return 0
  const nomN = normaliser(nom)
  const motsNom = nomN.split(' ')
  const motsCommune = commune ? normaliser(commune).split(' ') : []
  let total = 0
  let surNom = 0
  for (const mot of mots) {
    const n = echo(mot, motsNom)
    if (n > 0) { total += n; surNom++; continue }
    const c = echo(mot, motsCommune)
    if (c > 0) { total += c * 0.5; continue }
    return 0
  }
  if (!surNom) return 0 // la commune seule ne suffit pas : « ganges » listerait tout
  let score = total / mots.length
  if (nomN.startsWith(requete)) score += 0.3
  else if (nomN.includes(requete)) score += 0.15
  return score
}
