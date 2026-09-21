import type { Visibilite } from './visibilite'

/**
 * MODULE THÉÂTRE — types et règles partagés client ET serveur.
 *
 * Jumeau de `cinema.ts`, et pour les mêmes raisons : ce fichier ne doit
 * JAMAIS importer `supabase-admin`, sous peine de faire planter toute page
 * qui l'utilise côté navigateur. L'accès base vit dans `theatre-server.ts`.
 *
 * Le module vaut pour TOUS LES TERRITOIRES. C'est le théâtre Albarède qui
 * est à Ganges, pas le module.
 */

/** Les colonnes d'une fiche établissement dont l'écran théâtre a besoin. */
export const THEATRE_FIELDS =
  'id, nom, commune, adresse, lat, lng, photos, site_web, contact_tel, '
  + 'description_courte, slug, billetterie_url, territoire_id'

export interface Theatre {
  id: string
  nom: string
  commune: string | null
  adresse: string | null
  lat: number | null
  lng: number | null
  photos: string[] | null
  site_web: string | null
  contact_tel: string | null
  description_courte: string | null
  slug: string | null
  billetterie_url: string | null
  territoire_id: string | null
}

export interface Spectacle {
  id: string
  titre: string
  compagnie: string | null
  /**
   * Le mot de la compagnie, tel qu'elle l'écrit.
   *
   * « Cirque théâtre d'objet », « Duo bilingue Français — Langue des
   * signes », « Théâtre documenté poésie brute ». Le vocabulaire du
   * spectacle vivant est trop vivant pour une liste fermée : une salle qui
   * doit ranger son cirque-théâtre-d'objet dans « autre » a le sentiment,
   * à juste titre, qu'on n'a pas lu son programme.
   */
  genre: string | null
  duree_min: number | null
  public_conseille: string | null
  distribution: string | null
  synopsis: string | null
  citation: string | null
  affiche_url: string | null
  bande_annonce_url: string | null
}

export interface Representation {
  id: string
  etablissement_id: string
  spectacle_id: string
  date: string
  heure: string | null
  /** Où ça se joue, quand ce n'est pas dans les murs. */
  lieu: string | null
  scolaire: boolean
  billetterie_url: string | null
  note: string | null
}

/**
 * La visibilité du bloc Théâtre sur la page Village.
 *
 * Stockée dans config('theatre_village_public'), exactement comme celle du
 * cinéma : masqué, réservé aux admins le temps du rodage, ou ouvert à tous.
 */
export type VisibiliteTheatre = Visibilite

export function parseVisibiliteTheatre(v: unknown): VisibiliteTheatre {
  return v === 'tous' || v === 'admin' || v === 'masque' ? v : 'admin'
}

/**
 * Les représentations OUVERTES AU PUBLIC.
 *
 * Une séance scolaire n'est pas une séance : on ne peut pas y venir. Elle
 * figure au programme — le théâtre en est fier, et les parents la cherchent
 * — mais jamais dans la liste de ce qu'on peut aller voir.
 */
export function representationsPubliques(r: Representation[]): Representation[] {
  return r.filter(x => !x.scolaire)
}

/** « 20:00:00 » → « 20h », « 19:15:00 » → « 19h15 ». */
export function heureLisible(h: string | null | undefined): string | null {
  if (!h) return null
  const m = String(h).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  return m[2] === '00' ? `${Number(m[1])}h` : `${Number(m[1])}h${m[2]}`
}

/** « 110 » → « 1h50 », « 50 » → « 50 mn ». Rien quand la durée est inconnue. */
export function dureeLisible(min: number | null | undefined): string | null {
  if (!min || min <= 0) return null
  if (min < 60) return `${min} mn`
  const h = Math.floor(min / 60), r = min % 60
  return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, '0')}`
}
