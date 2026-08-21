import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * MODULE CINÉMA — types et garde d'accès.
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

/**
 * La fiche est-elle un cinéma actif, et cette personne peut-elle l'administrer ?
 *
 * À appeler CÔTÉ SERVEUR avant toute écriture : masquer un bouton dans l'UI
 * n'est pas une garde. L'admin de l'app passe partout.
 */
export async function peutAdministrerCinema(
  etablissementId: string,
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('etablissements')
    .select('user_id, plan, module_cinema')
    .eq('id', etablissementId)
    .maybeSingle()
  if (!data?.module_cinema) return false
  if (isAdmin) return true
  return data.user_id === userId && data.plan === 'pro'
}

/** Les fiches ayant le module accordé. Vide tant que rien n'est accordé. */
export async function listerCinemas(): Promise<Cinema[]> {
  const { data } = await supabaseAdmin
    .from('etablissements')
    .select(CINEMA_FIELDS)
    .eq('module_cinema', true)
    .order('nom')
  return (data ?? []) as Cinema[]
}
