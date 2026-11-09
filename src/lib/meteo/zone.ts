/**
 * LA ZONE MÉTÉO ET LE FORMAT DES IMAGES — partagé serveur / navigateur.
 *
 * La tâche planifiée découpe les champs AROME sur cette fenêtre et en fait,
 * pour chaque heure, une petite image PNG où chaque pixel porte trois
 * mesures (une par couleur). La page relit ces pixels pour tracer les
 * contours et répondre « il pleut chez moi ? ». Ce ne sont pas des images à
 * regarder : ce sont des données compactes.
 *
 *   R  pluie (mm/h)      R = √(mm/h) × 25,5     → jusqu'à 100 mm/h, fin aux faibles pluies
 *   G  nuages (%)        G = % × 2,55
 *   B  température + orage
 *                        bit 7 = orage ; bits 0-6 = (°C + 20) × 2 → −20 à +43,5 °C
 */

export interface ZoneMeteo {
  slug: string
  nom: string
  /** Coin nord-ouest de la grille (centre du premier pixel). */
  lat0: number
  lon0: number
  /** Pas en degrés (AROME HD : 0,01°). */
  pas: number
  lignes: number
  colonnes: number
  /** Le village par défaut, quand on ne connaît pas la zone de la personne. */
  centre: { lat: number; lng: number; nom: string }
}

/**
 * Les Cévennes, du causse au littoral : le Mont Aigoual et Florac au nord,
 * Montpellier au sud, et assez de Méditerranée à l'est pour voir arriver un
 * épisode cévenol.
 */
export const ZONES_METEO: Record<string, ZoneMeteo> = {
  cevennes: {
    slug: 'cevennes', nom: 'Cévennes',
    lat0: 44.6, lon0: 2.85, pas: 0.01, lignes: 126, colonnes: 201,
    centre: { lat: 43.9333, lng: 3.7, nom: 'Ganges' },
  },
}

/** La zone d'un territoire. `null` = ce territoire n'a pas (encore) de météo. */
export function zoneMeteo(slug: string | null | undefined): ZoneMeteo | null {
  return ZONES_METEO[slug ?? 'cevennes'] ?? null
}

export const BUCKET_METEO = 'meteo'

/* ── Encodage des pixels ─────────────────────────────────────────────── */

export function encoderPluie(mmh: number): number {
  return Math.max(0, Math.min(255, Math.round(Math.sqrt(Math.max(0, Math.min(mmh, 100))) * 25.5)))
}
export function decoderPluie(r: number): number {
  const x = r / 25.5
  return x * x
}
export function encoderNuages(pct: number): number {
  return Math.max(0, Math.min(255, Math.round(pct * 2.55)))
}
export function decoderNuages(g: number): number {
  return g / 2.55
}
export function encoderTempOrage(c: number, orage: boolean): number {
  const t = Math.max(0, Math.min(127, Math.round((c + 20) * 2)))
  return (orage ? 128 : 0) | t
}
export function decoderTemp(b: number): number {
  return (b & 127) / 2 - 20
}
export function decoderOrage(b: number): boolean {
  return (b & 128) !== 0
}

/* ── Seuils (mm/h) — échelle d'intensité usuelle ─────────────────────── */

export const SEUIL_PLUIE = 0.2
export const SEUIL_MODEREE = 2.5
export const SEUIL_FORTE = 7.6

/* ── Ce que la tâche publie ──────────────────────────────────────────── */

export interface MetaMeteo {
  version: 1
  zone: ZoneMeteo
  /** Heure de la sortie AROME (ISO, UTC). */
  run: string
  genere: string
  source: string
  /** Une entrée par image : heure de validité (ISO, UTC) et chemin dans le bucket. */
  heures: { t: string; png: string }[]
}

/** Les jours (ECMWF) : une petite grille de points à 0,25° autour de la zone. */
export interface JoursMeteo {
  version: 1
  run: string
  genere: string
  source: string
  grille: { lat0: number; lon0: number; pas: number; lignes: number; colonnes: number }
  /**
   * Une entrée par échéance. Valeurs entières, ligne par ligne :
   * t2m en dixièmes de °C, tp = pluie CUMULÉE depuis le départ en dixièmes de
   * mm, tcc en %.
   */
  pas: { t: string; t2m: number[]; tp: number[]; tcc: number[] }[]
}
