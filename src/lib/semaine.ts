/**
 * LA SEMAINE EN COURS — du lundi au dimanche, en heure de Paris.
 *
 * Un seul endroit pour ce calcul, parce qu'il est piégeux : le serveur tourne
 * en UTC, et `toISOString()` sur une date locale recule d'un jour dès qu'on
 * est avant 2 h du matin en France. Une newsletter titrée « semaine du 6 au
 * 12 » alors qu'on est le lundi 7 — c'est exactement l'erreur que ça produit.
 *
 * Tout passe donc par `Intl` avec `timeZone: 'Europe/Paris'`, jamais par
 * `toISOString()`. Cf. la note « Dates — serveur Vercel = UTC, pas Paris ».
 */

const JOURS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** `2026-09-07`, en heure de Paris. */
export function jourParis(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

export interface Semaine {
  /** Lundi, au format `2026-09-07`. */
  debut: string
  /** Dimanche, au format `2026-09-13`. */
  fin: string
  /** « Semaine du 7 au 13 septembre » — le mois n'est répété que s'il change. */
  libelle: string
}

/**
 * La semaine qui contient `ref` (par défaut : maintenant), lundi → dimanche.
 */
export function semaineDe(ref: Date = new Date()): Semaine {
  const nomJour = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' }).format(ref)
  const depuisLundi = Math.max(0, JOURS.indexOf(nomJour))

  const lundi = new Date(ref)
  lundi.setDate(lundi.getDate() - depuisLundi)
  const dimanche = new Date(lundi)
  dimanche.setDate(dimanche.getDate() + 6)

  return { debut: jourParis(lundi), fin: jourParis(dimanche), libelle: libelleSemaine(lundi, dimanche) }
}

const jourNu  = (d: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric' }).format(d)
const jourMois = (d: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' }).format(d)
const moisSeul = (d: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', month: 'long' }).format(d)

/**
 * « Semaine du 7 au 13 septembre » quand le mois ne change pas,
 * « Semaine du 28 septembre au 4 octobre » quand il change.
 */
export function libelleSemaine(lundi: Date, dimanche: Date): string {
  const memeMois = moisSeul(lundi) === moisSeul(dimanche)
  return memeMois
    ? `Semaine du ${jourNu(lundi)} au ${jourMois(dimanche)}`
    : `Semaine du ${jourMois(lundi)} au ${jourMois(dimanche)}`
}
