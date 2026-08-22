/**
 * ASSISTANT VILLAGE — ce que coûte une réponse. SERVEUR UNIQUEMENT.
 *
 * Affiché en direct, mais aux seuls comptes admin : c'est un instrument de
 * réglage, pas une information pour les habitants.
 *
 * CE QUI EST MESURÉ, ET CE QUI EST ESTIMÉ — la distinction compte.
 *
 *   Mesuré exactement : les tokens. L'API les renvoie à chaque appel, en
 *   distinguant ceux lus dans le cache (dix fois moins chers) de ceux qui
 *   l'alimentent (25 % plus chers) et du reste. On les additionne, on ne les
 *   devine pas.
 *
 *   Estimé : deux choses, et il faut le savoir.
 *     — La recherche web est facturée à l'appel, et l'API ne dit PAS combien
 *       d'appels ont eu lieu. On compte les fois où le modèle l'a déclenchée,
 *       ce qui est le bon ordre de grandeur sans être une facture.
 *     — La conversion en euros suppose un taux fixe. Le vrai est celui du
 *       jour de facturation.
 *
 * Les tarifs sont ceux de l'API Anthropic pour le modèle utilisé, en dollars
 * par million de tokens. À revoir si le modèle change (config.ts) ou si la
 * remise de lancement s'arrête.
 */

/** Sonnet 5, tarif de lancement en vigueur jusqu'au 31 août 2026. */
const PRIX_LANCEMENT = { entree: 2, sortie: 10 }
/** Tarif plein, qui s'appliquera ensuite. */
const PRIX_PLEIN = { entree: 3, sortie: 15 }
const FIN_LANCEMENT = Date.parse('2026-09-01T00:00:00Z')

/** Une recherche web, facturée à l'appel par Anthropic. */
const PRIX_RECHERCHE_WEB = 0.01

/** Taux de conversion retenu pour l'affichage. Approximatif, assumé. */
const DOLLAR_EN_EURO = 0.92

export interface Consommation {
  /** Tokens d'entrée facturés plein tarif. */
  entree: number
  /** Tokens relus dans le cache — un dixième du prix. */
  cacheLu: number
  /** Tokens écrits dans le cache — un quart plus cher que l'entrée. */
  cacheEcrit: number
  sortie: number
  /** Nombre de fois où la recherche web a été déclenchée. */
  recherchesWeb: number
}

/** Le coût d'un tour, en euros. */
export function coutEnEuros(c: Consommation): number {
  const prix = Date.now() < FIN_LANCEMENT ? PRIX_LANCEMENT : PRIX_PLEIN
  const dollars =
    (c.entree     / 1_000_000) * prix.entree +
    (c.cacheLu    / 1_000_000) * prix.entree * 0.1 +
    (c.cacheEcrit / 1_000_000) * prix.entree * 1.25 +
    (c.sortie     / 1_000_000) * prix.sortie +
    c.recherchesWeb * PRIX_RECHERCHE_WEB
  return dollars * DOLLAR_EN_EURO
}

/** « 1,4 c » ou « 0,12 € » — lisible d'un coup d'œil, sans virgule inutile. */
export function formaterCout(euros: number): string {
  if (euros >= 0.1) return `${euros.toFixed(2).replace('.', ',')} €`
  const centimes = euros * 100
  return `${(centimes < 1 ? centimes.toFixed(2) : centimes.toFixed(1)).replace('.', ',')} c`
}
