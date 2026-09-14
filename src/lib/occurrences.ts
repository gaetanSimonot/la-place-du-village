/**
 * LES DATES D'UN ÉVÉNEMENT QUI REVIENT.
 *
 * Un rendez-vous régulier ne se décrit pas par une règle mais par la LISTE des
 * jours où il a lieu. Une règle ne sait pas dire « tous les jeudis sauf le 25
 * décembre », ni décrire les Puces de Ganges — six samedis entre juin et
 * octobre, ce qui n'est pas un rythme. La réalité locale est irrégulière : les
 * ateliers s'arrêtent aux vacances, une séance saute un jour férié.
 *
 * La règle reste utile, mais comme OUTIL DE SAISIE : « de janvier à octobre,
 * tous les samedis » produit quarante dates d'un clic, qu'on corrige ensuite à
 * la main. Ce sont les dates qui font foi, et elles sont visibles — on lit ce
 * qui est publié au lieu de le déduire.
 *
 * Ce fichier ne touche ni au réseau ni à la base : il se teste seul, et il est
 * partagé par l'extraction, l'écran d'édition et le rattrapage.
 */

/** Jours ISO : 1 = lundi … 7 = dimanche. La convention de tout le projet. */
export const JOURS_ISO = [
  { n: 1, court: 'Lun', long: 'lundi' },
  { n: 2, court: 'Mar', long: 'mardi' },
  { n: 3, court: 'Mer', long: 'mercredi' },
  { n: 4, court: 'Jeu', long: 'jeudi' },
  { n: 5, court: 'Ven', long: 'vendredi' },
  { n: 6, court: 'Sam', long: 'samedi' },
  { n: 7, court: 'Dim', long: 'dimanche' },
] as const

/** Le plafond de la contrainte SQL `evenements_dates_raisonnables`. */
export const MAX_DATES = 400

const JOUR_MS = 86_400_000

/** Une date `YYYY-MM-DD` en instant, à midi UTC. */
const instant = (ymd: string): number => Date.parse(`${ymd}T12:00:00Z`)

/** L'inverse : un instant en `YYYY-MM-DD`. */
const ymd = (t: number): string => new Date(t).toISOString().slice(0, 10)

/**
 * Le jour ISO d'une date.
 *
 * Calculé à midi UTC pour que le fuseau ne fasse jamais basculer d'un jour :
 * à minuit, Paris et UTC ne sont pas le même jour la moitié de l'année.
 */
export function jourISO(date: string): number {
  const j = new Date(`${date}T12:00:00Z`).getUTCDay()
  return j === 0 ? 7 : j
}

/** Une chaîne est-elle une date utilisable ? */
export function estUneDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(instant(v))
}

/**
 * Nettoie une liste de dates : ne garde que les vraies, sans doublon, triées.
 *
 * Ce qui vient d'un modèle ou d'un formulaire passe par ici avant la base. Le
 * plafond est celui de la contrainte SQL — une valeur refusée là-bas ferait
 * échouer l'écriture ENTIÈRE et perdrait l'événement, donc on coupe avant.
 * Liste vide → `null`, c'est-à-dire « pas de dates précises », le défaut sûr.
 */
export function nettoyerDates(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const dates = Array.from(new Set(v.filter(estUneDate))).sort()
  if (!dates.length) return null
  return dates.slice(0, MAX_DATES)
}

/**
 * Engendre les dates d'une période qui tombent sur certains jours.
 *
 * `jours` vide → tous les jours de la période, ce qui est le sens de « ouvert
 * en continu ». Les bornes sont incluses. Au-delà du plafond on s'arrête : une
 * génération qui déborde est une erreur de saisie, pas une programmation.
 */
export function engendrerDates(
  debut: string,
  fin: string,
  jours: number[] = [],
): string[] {
  if (!estUneDate(debut) || !estUneDate(fin)) return []
  const t1 = instant(debut)
  const t2 = instant(fin)
  if (t2 < t1) return []

  const voulus = new Set(jours.filter(j => Number.isInteger(j) && j >= 1 && j <= 7))
  const out: string[] = []

  for (let t = t1; t <= t2 && out.length < MAX_DATES; t += JOUR_MS) {
    const d = ymd(t)
    if (!voulus.size || voulus.has(jourISO(d))) out.push(d)
  }
  return out
}

/**
 * L'événement a-t-il lieu au moins une fois dans cette période ?
 *
 * C'est la question que pose l'agenda, et la seule. Sans dates précises, on
 * retombe sur le chevauchement de période — le comportement d'avant, celui
 * qu'il faut pour une exposition ouverte en continu.
 */
export function aLieuEntre(
  dates: string[] | null | undefined,
  from: string,
  to: string,
): boolean {
  if (!dates?.length) return true
  return dates.some(d => d >= from && d <= to)
}

/**
 * Ce qu'on montre d'une liste de dates : l'avenir seulement.
 *
 * L'historique reste en base — un atelier garde la trace des douze fois où il
 * a eu lieu — mais l'afficher n'apprendrait rien à personne et noierait les
 * dates qui comptent.
 */
export function datesAVenir(dates: string[] | null | undefined, aujourdhui: string): string[] {
  return (dates ?? []).filter(d => d >= aujourdhui)
}

/** Aujourd'hui à Paris. Le serveur tourne en UTC : sans ça, on bascule trop tôt. */
export function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/**
 * Le premier et le dernier jour d'une liste.
 *
 * `date_debut` et `date_fin` restent alignés dessus : toute la sélection SQL
 * du projet — agenda, newsletter, splash, compteurs — continue de fonctionner
 * sans être touchée, et les dates n'affinent qu'ensuite.
 */
export function bornes(dates: string[]): { debut: string; fin: string } | null {
  if (!dates.length) return null
  const triees = [...dates].sort()
  return { debut: triees[0], fin: triees[triees.length - 1] }
}
