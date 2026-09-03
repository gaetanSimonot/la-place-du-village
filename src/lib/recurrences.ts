import type { ExtractedData } from './extract'

/**
 * REGROUPEMENT DES RÉCURRENCES.
 *
 * Vécu le 03/09/2026 : une affiche de planning de cours de yoga (11 créneaux
 * hebdomadaires, 2 professeures, 4 communes) a produit 44 événements par
 * passage, 319 en tout — près de la moitié de l'agenda à venir.
 *
 * Le prompt demande désormais UN seul événement pour un planning. Mais un
 * prompt est une consigne, pas une garantie : celui d'avant disait de déplier
 * les récurrences, et le modèle a très bien obéi. Ce qui suit ne dépend
 * d'aucun modèle.
 *
 * Règle, purement mécanique : dans les événements tirés d'UN MÊME message, si
 * au moins 3 partagent le même titre, la même commune, la même heure ET
 * tombent tous le même jour de la semaine, ce n'est pas une série
 * d'événements — c'est un créneau qui se répète. On les fond en une seule
 * fiche allant de la première à la dernière date, en écrivant la récurrence
 * dans la description.
 *
 * Rien n'est mis de côté pour relecture, rien n'est perdu : la fusion est
 * automatique et l'information reste entière.
 */
const OCCURRENCES_POUR_UNE_SERIE = 3

const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] as const

/** Jour de la semaine d'une date ISO, calculé à midi UTC → insensible au DST. */
function jourDeLaSemaine(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay()
}

function clefDeSerie(e: ExtractedData): string {
  return [
    (e.titre ?? '').trim().toLowerCase(),
    (e.commune ?? '').trim().toLowerCase(),
    (e.heure ?? '').trim(),
  ].join('|')
}

/** Écrit « tous les mercredis à 16:30, du 9 au 30 septembre ». */
function phraseRecurrence(dates: string[], heure: string | null): string {
  const tri = [...dates].sort()
  const jour = JOURS_FR[jourDeLaSemaine(tri[0])]
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', timeZone: 'UTC',
    })
  const quand = heure ? `tous les ${jour}s à ${heure}` : `tous les ${jour}s`
  return `${quand.charAt(0).toUpperCase()}${quand.slice(1)}, du ${fmt(tri[0])} au ${fmt(tri[tri.length - 1])}.`
}

/**
 * Fond les créneaux qui se répètent. Les événements isolés ressortent
 * inchangés, dans leur ordre d'origine.
 */
export function regrouperRecurrences(events: ExtractedData[]): ExtractedData[] {
  const groupes = new Map<string, ExtractedData[]>()
  for (const e of events) {
    const k = clefDeSerie(e)
    const g = groupes.get(k)
    if (g) g.push(e)
    else groupes.set(k, [e])
  }

  const sortie: ExtractedData[] = []
  for (const groupe of Array.from(groupes.values())) {
    const dates = groupe.map(e => e.date_debut).filter((d): d is string => !!d)
    const memeJour = dates.length === groupe.length
      && new Set(dates.map(jourDeLaSemaine)).size === 1

    if (groupe.length < OCCURRENCES_POUR_UNE_SERIE || !memeJour) {
      sortie.push(...groupe)
      continue
    }

    const tri = [...dates].sort()
    const modele = groupe[0]
    const phrase = phraseRecurrence(tri, modele.heure)
    sortie.push({
      ...modele,
      date_debut: tri[0],
      date_fin: tri[tri.length - 1],
      description: modele.description ? `${modele.description}

${phrase}` : phrase,
    })
  }
  return sortie
}
