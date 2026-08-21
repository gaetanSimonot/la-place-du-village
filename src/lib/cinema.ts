/**
 * MODULE CINÉMA — types et helpers PARTAGÉS.
 *
 * Ce fichier est importé par des composants client : il ne doit contenir
 * aucun accès base. Les fonctions serveur (garde d'accès, requêtes) vivent
 * dans cinema-server.ts — `supabase-admin` porte la clé service et son
 * import côté client fait planter la page au montage.
 *
 * Un cinéma n'est pas une entité : c'est une fiche établissement à laquelle
 * trois conditions cumulatives ouvrent le module.
 *
 *   1. fiche revendiquée      → etablissements.user_id
 *   2. abonnement Pro actif   → etablissements.plan = 'pro'
 *   3. module accordé par toi → etablissements.module_cinema
 *
 * Volontairement PAS dans capabilities.ts : ce fichier accorde des droits par
 * PLAN D'UTILISATEUR, alors que le module cinéma est un droit PAR FICHE. L'y
 * forcer créerait un système parallèle mal placé.
 */

export interface Cinema {
  id: string
  nom: string
  commune: string | null
  slug: string | null
  adresse: string | null
  site_web: string | null
  billetterie_url: string | null
  photos: string[] | null
}

export interface Film {
  id: string
  titre: string
  titre_original: string | null
  annee: number | null
  duree_min: number | null
  realisateur: string | null
  casting: string | null
  genres: string[] | null
  synopsis: string | null
  affiche_url: string | null
  bande_annonce_url: string | null
  avertissement: string | null
}

export type VersionFilm = 'vf' | 'vost' | 'vo'

export interface Seance {
  id: string
  etablissement_id: string
  film_id: string
  date: string          // YYYY-MM-DD
  heure: string         // HH:MM:SS
  version: VersionFilm
  salle: string | null
  billetterie_url: string | null
  note: string | null
}

export const VERSIONS: { id: VersionFilm; label: string }[] = [
  { id: 'vf',   label: 'VF' },
  { id: 'vost', label: 'VOST' },
  { id: 'vo',   label: 'VO' },
]

/**
 * Visibilité du bloc « Au cinéma aujourd'hui » sur la page Village.
 * Stockée dans config('cinema_village_public').
 *   masque → personne, pas même les admins
 *   admin  → les comptes admin seulement (rodage)
 *   tous   → tous les habitants
 */
export type VisibiliteCinema = 'masque' | 'admin' | 'tous'

/** Tolère les anciennes valeurs booléennes ('true'/'false'). */
export function parseVisibilite(v: string | null | undefined): VisibiliteCinema {
  if (v === 'tous' || v === 'true') return 'tous'
  if (v === 'masque') return 'masque'
  return 'admin'
}

/** Champs d'un cinéma, factorisés — la liste sert à plusieurs requêtes. */
export const CINEMA_FIELDS = 'id, nom, commune, slug, adresse, site_web, billetterie_url, photos'

/**
 * Aujourd'hui à Paris (YYYY-MM-DD). Le serveur Vercel est en UTC : sans ça,
 * « les séances d'aujourd'hui » basculent une à deux heures trop tôt.
 */
export function dateParis(offsetJours = 0): string {
  const d = new Date(Date.now() + offsetJours * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

/** « 20:30:00 » → « 20h30 ». */
export function formatHeure(heure: string): string {
  const [h, m] = heure.split(':')
  return m && m !== '00' ? `${Number(h)}h${m}` : `${Number(h)}h`
}
