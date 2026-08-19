/**
 * Choix des 3 tuiles « Aujourd'hui » du Village.
 *
 * Avant, le remplissage automatique prenait simplement les premiers événements
 * du jour triés par heure croissante. Depuis l'arrivée des marchés — tous à
 * 07:00 ou 08:00 et une dizaine par jour — ils raflaient mécaniquement les
 * trois places, et un concert du soir ne remontait jamais.
 *
 * Ce module ne décide QUE du remplissage automatique. Les positions forcées
 * par l'admin (featured_slots slot='homepage' avec position 1/2/3) gagnent
 * toujours et passent avant toute règle.
 *
 * Les règles, dans l'ordre :
 *   1. La tuile 1 n'est jamais un marché — sauf si la journée n'a QUE des
 *      marchés (mieux qu'une tuile vide), ou si l'admin l'a forcée.
 *   2. Un seul marché au maximum sur les trois tuiles. Un deuxième est toléré
 *      uniquement s'il n'y a rien d'autre ce jour-là.
 *   3. Jamais deux fois la même catégorie, tant qu'une alternative existe.
 *      C'est ce qui donne « concert + théâtre » plutôt que « concert + concert ».
 *   4. À égalité, l'ordre de préférence des catégories tranche, puis l'heure.
 */

/** Ordre de préférence pour le remplissage automatique. Le marché est dernier :
 *  il se répète chaque semaine, il a donc moins de valeur d'annonce qu'un
 *  spectacle qui n'arrive qu'une fois. */
export const PRIORITE_CATEGORIES: string[] = [
  'concert',
  'theatre',
  'fete',
  'atelier',
  'sport',
  'sante_bien_etre',
  'autre',
  'marche',
]

export interface EvenementTuile {
  id: string
  categorie?: string | null
  categories?: string[] | null
  heure?: string | null
}

/** Catégorie retenue pour le classement : la principale, sinon la première
 *  du tableau multi-catégories, sinon 'autre'. */
export function categoriePrincipale(e: EvenementTuile): string {
  return e.categorie || e.categories?.[0] || 'autre'
}

function rang(cat: string): number {
  const i = PRIORITE_CATEGORIES.indexOf(cat)
  return i === -1 ? PRIORITE_CATEGORIES.length : i
}

/** Trie par préférence de catégorie, puis par heure croissante (sans heure = fin). */
function trierParInteret<T extends EvenementTuile>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    const dr = rang(categoriePrincipale(a)) - rang(categoriePrincipale(b))
    if (dr !== 0) return dr
    const ha = a.heure ?? '99:99'
    const hb = b.heure ?? '99:99'
    return ha.localeCompare(hb)
  })
}

interface Contraintes {
  interditMarche:   boolean
  marchesRestants:  number
  categoriesPrises: Set<string>
}

/** Premier candidat du pool qui satisfait les contraintes. On tente d'abord en
 *  exigeant une catégorie nouvelle (diversité), puis sans cette exigence. */
function premierAcceptable<T extends EvenementTuile>(pool: T[], c: Contraintes): T | null {
  const accepte = (e: T, exigerNouvelleCategorie: boolean): boolean => {
    const cat = categoriePrincipale(e)
    if (cat === 'marche') {
      if (c.interditMarche) return false
      if (c.marchesRestants <= 0) return false
    }
    if (exigerNouvelleCategorie && c.categoriesPrises.has(cat)) return false
    return true
  }
  return pool.find(e => accepte(e, true)) ?? pool.find(e => accepte(e, false)) ?? null
}

/**
 * Construit la liste ordonnée des tuiles.
 *
 * @param candidats  Les événements publiés du jour (l'ordre d'entrée n'importe pas).
 * @param imposes    Positions forcées par l'admin : 1, 2 ou 3 → événement.
 * @param nbTuiles   Nombre d'emplacements (3 aujourd'hui : 1 grande + 2 petites).
 */
export function choisirTuilesDuJour<T extends EvenementTuile>(
  candidats: T[],
  imposes: Map<number, T> = new Map(),
  nbTuiles = 3,
): T[] {
  const idsImposes = new Set(Array.from(imposes.values()).map(e => e.id))
  const pool = trierParInteret(candidats.filter(e => !idsImposes.has(e.id)))

  const categoriesPrises = new Set<string>()
  let marchesUtilises = 0
  // Array.from() plutôt qu'itérer le Map directement : la cible TS du projet
  // n'autorise pas l'itération d'un MapIterator sans downlevelIteration.
  for (const e of Array.from(imposes.values())) {
    const cat = categoriePrincipale(e)
    categoriesPrises.add(cat)
    if (cat === 'marche') marchesUtilises++
  }

  const resultat: (T | null)[] = new Array(nbTuiles).fill(null)

  const remplir = (maxMarches: number) => {
    for (let pos = 1; pos <= nbTuiles; pos++) {
      const idx = pos - 1
      if (resultat[idx]) continue

      const impose = imposes.get(pos)
      if (impose) { resultat[idx] = impose; continue }

      // La tuile 1 refuse les marchés au premier essai. Si rien d'autre
      // n'existe ce jour-là, on relâche plutôt que de laisser un trou.
      const premierEssaiSansMarche = pos === 1
      let choisi = premierAcceptable(pool, {
        interditMarche:  premierEssaiSansMarche,
        marchesRestants: maxMarches - marchesUtilises,
        categoriesPrises,
      })
      if (!choisi && premierEssaiSansMarche) {
        choisi = premierAcceptable(pool, {
          interditMarche:  false,
          marchesRestants: maxMarches - marchesUtilises,
          categoriesPrises,
        })
      }
      if (!choisi) continue

      resultat[idx] = choisi
      pool.splice(pool.indexOf(choisi), 1)
      const cat = categoriePrincipale(choisi)
      categoriesPrises.add(cat)
      if (cat === 'marche') marchesUtilises++
    }
  }

  // Passe 1 : un marché maximum.
  remplir(1)

  // Passe 2 : si on n'a même pas deux tuiles, c'est qu'il n'y a rien d'autre
  // que des marchés aujourd'hui. On en tolère un second — mais jamais un mur
  // de trois marchés identiques.
  if (resultat.filter(Boolean).length < 2) remplir(2)

  return resultat.filter((e): e is T => e !== null)
}
