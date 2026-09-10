/**
 * VEILLE SUR LE COLLECTOR — réglages partagés.
 *
 * Deux routes se parlent à travers ce fichier : /api/collector/ping écrit le
 * battement de cœur, /api/cron/collector-veille le relit. La clé ne peut pas
 * vivre dans l'une des deux : Next.js n'autorise qu'un jeu d'exports précis
 * dans un `route.ts`, une constante en plus fait échouer le build.
 */

/** Clé du battement de cœur dans la table `config` (valeur = JSON). */
export const CLE_BATTEMENT = 'collector_heartbeat'

/**
 * Au-delà de ce silence, le collector est considéré à l'arrêt. Il bat à chaque
 * cycle de collecte (30 min par défaut) : trois heures, c'est six cycles
 * manqués, la conclusion est sûre.
 */
export const SEUIL_SILENCE_H = 3

/** On ne re-prévient pas plus d'une fois par demi-journée tant que ça dure. */
export const RAPPEL_H = 12

/** Ce que le téléphone raconte à chaque battement. L'heure fait foi côté serveur. */
export interface Battement {
  at: string
  posts: number | null
  envoyes: number | null
  whatsapp: boolean
  signal: boolean
}
