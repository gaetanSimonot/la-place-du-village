/**
 * MODULE RADIO — types et helpers PARTAGÉS.
 *
 * Importé par des composants client : aucun accès base ici. Les requêtes
 * vivent dans les routes API — `supabase-admin` porte la clé service et son
 * import côté client fait planter la page au montage (même règle que
 * cinema.ts / cinema-server.ts).
 *
 * CE QU'EST UNE ÉMISSION. Radio Escapades diffuse chaque semaine sa sélection
 * culturelle. On en fait deux choses à la fois : on la donne à ÉCOUTER, et on
 * rend cliquable ce qu'elle annonce. La seconde moitié est la vraie valeur —
 * un podcast dit « samedi à Sauve » et personne ne retient l'adresse.
 *
 * CE QUI EST CITÉ N'EST PAS FORCÉMENT CHEZ NOUS. Une émission parle de ce
 * qu'elle veut ; une partie de ce qu'elle annonce n'est jamais passée par nos
 * collecteurs. Une mention porte donc TOUJOURS son titre en clair et
 * seulement PARFOIS un événement. Rattachée, on affiche la fiche et on y va ;
 * non rattachée, on affiche le titre et on s'arrête là. Un seul mécanisme avec
 * un champ vide, plutôt que deux listes à tenir d'accord.
 */

import type { EvenementCard } from './types'
import type { Visibilite } from './visibilite'

/**
 * La radio partenaire. En dur, parce qu'il n'y en a qu'une : le jour où il y
 * en a deux, ceci devient une table, pas avant. La colonne `radio` en base
 * garde la place au chaud.
 */
export const RADIO = {
  cle: 'escapades',
  nom: 'Radio Escapades',
  site: 'https://www.radio-escapades.org',
} as const

/**
 * Le libellé de la mention, écrit UNE fois.
 *
 * Il apparaît sur la fiche, dans la liste et sur la carte. Trois copies d'une
 * chaîne finissent toujours par se contredire à la première reformulation.
 */
export const MENTION_RADIO = 'Sélection Radio Escapades'

export type StatutEmission = 'brouillon' | 'publie' | 'archive'

export interface EmissionRadio {
  id: string
  radio: string
  titre: string
  description: string | null
  /** URL du podcast. Chez eux le plus souvent — le recopier serait une copie à tenir. */
  audio_url: string
  duree_s: number | null
  image_url: string | null
  /** Un LUNDI : la clé qui dit de quelle semaine l'émission parle. */
  semaine_debut: string
  statut: StatutEmission
}

export interface MentionRadio {
  id: string
  /** Toujours rempli — c'est ce qui s'affiche quand `evenement` est null. */
  titre: string
  /** Le lieu et la date en clair, pour les mentions sans fiche. */
  detail: string | null
  ordre: number
  /** `null` = pas dans l'app : la ligne se lit, mais ne mène nulle part. */
  evenement: EvenementCard | null
}

export interface PayloadRadio {
  emission: EmissionRadio | null
  mentions: MentionRadio[]
  /** Visibilité du bloc sur la page Village ET de la mention sur les fiches. */
  villageVisibilite: Visibilite
}

/**
 * Le lundi de la semaine d'une date, en heure de Paris.
 *
 * `semaineDe()` fait déjà ce calcul pour la newsletter ; on le réutilise au
 * lieu d'en écrire un deuxième, parce qu'il est piégeux — le serveur tourne en
 * UTC et `toISOString()` recule d'un jour avant 2 h du matin en France.
 */
export { semaineDe, jourParis } from './semaine'

/** « 1847 » → « 30 min ». Rien au-dessous d'une minute : ça n'apprend rien. */
export function formatDuree(secondes: number | null | undefined): string | null {
  if (!secondes || secondes < 60) return null
  const min = Math.round(secondes / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const reste = min % 60
  return reste ? `${h} h ${String(reste).padStart(2, '0')}` : `${h} h`
}

/**
 * Une URL d'audio est-elle plausible ?
 *
 * Validée à la saisie, pas à l'affichage : un lecteur qui reste muet sans rien
 * dire est le pire des retours. On vérifie la forme, pas le contenu — seul le
 * navigateur sait vraiment lire un fichier.
 */
export function audioUrlValide(url: string): boolean {
  try {
    const u = new URL(url.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}
