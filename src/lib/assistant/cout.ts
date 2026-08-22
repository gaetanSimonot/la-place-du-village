import { MODELE } from '@/lib/assistant/config'

/**
 * ASSISTANT VILLAGE — ce que coûte une réponse. SERVEUR UNIQUEMENT.
 *
 * Affiché en direct, mais aux seuls comptes admin : c'est un instrument de
 * réglage, pas une information pour les habitants.
 *
 * LE TARIF DÉPEND DU MODÈLE, et c'est tout l'objet de ce fichier. Une
 * première version appliquait le prix de Sonnet à tout le monde : une
 * conversation en gpt-4.1-mini s'affichait cinq fois trop chère, ce qui
 * rendait le sélecteur de modèle inutilisable — on ne pouvait pas comparer.
 *
 * CE QUI EST MESURÉ, ET CE QUI EST ESTIMÉ — la distinction compte.
 *
 *   Mesuré exactement : les tokens. Les API les renvoient à chaque appel, en
 *   distinguant ceux lus dans le cache de ceux qui l'alimentent et du reste.
 *
 *   Estimé : deux choses, et il faut le savoir.
 *     — La recherche web est facturée à l'appel, et l'API ne dit PAS combien
 *       d'appels ont eu lieu. On compte les fois où le modèle la déclenche.
 *     — La conversion en euros suppose un taux fixe. Le vrai est celui du
 *       jour de facturation.
 *
 * Tarifs relevés le 22/08/2026, en dollars par million de tokens.
 */

interface Tarif {
  entree: number
  sortie: number
  /** Prix d'un token relu dans le cache. */
  cacheLu: number
  /** Prix d'un token qui alimente le cache. Nul là où l'écriture est gratuite. */
  cacheEcrit: number
}

/**
 * Sonnet 5 est au tarif de lancement jusqu'au 31 août 2026 ; il passe ensuite
 * à 3 / 15. La bascule est datée ici pour qu'elle se fasse toute seule.
 */
const FIN_LANCEMENT = Date.parse('2026-09-01T00:00:00Z')
const sonnet = (): Tarif => Date.now() < FIN_LANCEMENT
  ? { entree: 2, sortie: 10, cacheLu: 0.2,  cacheEcrit: 2.5 }
  : { entree: 3, sortie: 15, cacheLu: 0.3,  cacheEcrit: 3.75 }

/**
 * Chez Anthropic, alimenter le cache coûte 25 % de plus qu'une entrée
 * normale, et le relire dix fois moins. Chez OpenAI, l'écriture est gratuite
 * et la lecture réduite — d'où les zéros en `cacheEcrit`, qui ne sont pas
 * des oublis.
 */
const TARIFS: Record<string, () => Tarif> = {
  'claude-sonnet-5':  sonnet,
  'claude-haiku-4-5': () => ({ entree: 1,    sortie: 5,   cacheLu: 0.1,   cacheEcrit: 1.25 }),
  'gpt-4.1-mini':     () => ({ entree: 0.40, sortie: 1.6, cacheLu: 0.10,  cacheEcrit: 0 }),
  'gpt-5-mini':       () => ({ entree: 0.25, sortie: 2,   cacheLu: 0.025, cacheEcrit: 0 }),
}

/** Une recherche web, facturée à l'appel par Anthropic. */
const PRIX_RECHERCHE_WEB = 0.01

/** Taux de conversion retenu pour l'affichage. Approximatif, assumé. */
const DOLLAR_EN_EURO = 0.92

export interface Consommation {
  /** Tokens d'entrée facturés plein tarif. */
  entree: number
  /** Tokens relus dans le cache. */
  cacheLu: number
  /** Tokens écrits dans le cache. */
  cacheEcrit: number
  sortie: number
  /** Nombre de fois où la recherche web a été déclenchée. */
  recherchesWeb: number
}

/**
 * Le coût d'un tour, en euros, AU TARIF DU MODÈLE QUI A RÉPONDU.
 *
 * Un modèle inconnu retombe sur celui du projet : mieux vaut un ordre de
 * grandeur qu'un zéro trompeur.
 */
export function coutEnEuros(c: Consommation, modele: string = MODELE): number {
  const t = (TARIFS[modele] ?? TARIFS[MODELE] ?? sonnet)()
  const dollars =
    (c.entree     / 1_000_000) * t.entree +
    (c.cacheLu    / 1_000_000) * t.cacheLu +
    (c.cacheEcrit / 1_000_000) * t.cacheEcrit +
    (c.sortie     / 1_000_000) * t.sortie +
    c.recherchesWeb * PRIX_RECHERCHE_WEB
  return dollars * DOLLAR_EN_EURO
}

/** « 1,4 c » ou « 0,12 € » — lisible d'un coup d'œil, sans virgule inutile. */
export function formaterCout(euros: number): string {
  if (euros >= 0.1) return `${euros.toFixed(2).replace('.', ',')} €`
  const centimes = euros * 100
  return `${(centimes < 1 ? centimes.toFixed(2) : centimes.toFixed(1)).replace('.', ',')} c`
}
