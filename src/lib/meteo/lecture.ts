import {
  decoderPluie, decoderNuages, decoderTemp, decoderOrage,
  SEUIL_PLUIE, SEUIL_MODEREE, SEUIL_FORTE, BUCKET_METEO,
  type ZoneMeteo, type JoursMeteo,
} from './zone'

/**
 * LIRE LA MÉTÉO DANS LE NAVIGATEUR — des pixels aux phrases.
 * Rien d'inventé ici : chaque mot vient d'une valeur lue dans les images
 * AROME ou dans le fichier des jours ECMWF.
 */

export const urlMeteo = (chemin: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_METEO}/${chemin}`

export interface Image {
  t: number
  /** Le vent de la même heure, s'il est publié. */
  vent?: Vent
  pluie: Float32Array
  nuages: Float32Array
  temp: Float32Array
  orage: Uint8Array
}

/**
 * Télécharge une image-données et en relit les pixels. `z` donne la taille
 * de la grille : la zone fine, ou sa vue d'ensemble (`zone.large`, dont la
 * température n'est pas renseignée).
 */
export async function chargerImage(chemin: string, t: number, z: { lignes: number; colonnes: number }): Promise<Image> {
  const r = await fetch(urlMeteo(chemin))
  if (!r.ok) throw new Error(`image ${r.status}`)
  const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  const c = document.createElement('canvas')
  c.width = z.colonnes; c.height = z.lignes
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0)
  const px = ctx.getImageData(0, 0, z.colonnes, z.lignes).data
  const n = z.colonnes * z.lignes
  const img: Image = { t, pluie: new Float32Array(n), nuages: new Float32Array(n), temp: new Float32Array(n), orage: new Uint8Array(n) }
  for (let i = 0; i < n; i++) {
    img.pluie[i] = decoderPluie(px[i * 4])
    img.nuages[i] = decoderNuages(px[i * 4 + 1])
    img.temp[i] = decoderTemp(px[i * 4 + 2])
    img.orage[i] = decoderOrage(px[i * 4 + 2]) ? 1 : 0
  }
  return img
}

/** Le vent d'une heure, sur sa grille de 5 km (cf. fenetreVent). */
export interface Vent { kmh: Uint8Array; dir: Uint8Array; rafales: Uint8Array; lignes: number; colonnes: number; lat0: number; lon0: number; pas: number }

export async function chargerVent(chemin: string, g: { lat0: number; lon0: number; pas: number; lignes: number; colonnes: number }): Promise<Vent> {
  const r = await fetch(urlMeteo(chemin))
  if (!r.ok) throw new Error(`vent ${r.status}`)
  const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  const c = document.createElement('canvas')
  c.width = g.colonnes; c.height = g.lignes
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0)
  const px = ctx.getImageData(0, 0, g.colonnes, g.lignes).data
  const n = g.colonnes * g.lignes
  const v: Vent = { kmh: new Uint8Array(n), dir: new Uint8Array(n), rafales: new Uint8Array(n), ...g }
  for (let i = 0; i < n; i++) { v.kmh[i] = px[i * 4]; v.dir[i] = px[i * 4 + 1]; v.rafales[i] = px[i * 4 + 2] }
  return v
}

/** Le vent au point : vitesse et rafales (km/h), direction d'où il vient (degrés). */
export function ventAu(v: Vent, p: Point): { kmh: number; rafales: number; dir: number } {
  const l = Math.max(0, Math.min(v.lignes - 1, Math.round((v.lat0 - p.lat) / v.pas)))
  const c = Math.max(0, Math.min(v.colonnes - 1, Math.round((p.lng - v.lon0) / v.pas)))
  const i = l * v.colonnes + c
  return { kmh: v.kmh[i], rafales: v.rafales[i], dir: (v.dir[i] / 255) * 360 }
}

const POINTS_CARDINAUX = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest']
/** « du sud-est » */
export const directionEnMots = (deg: number) => POINTS_CARDINAUX[Math.round(deg / 45) % 8]

export interface Point { lat: number; lng: number }

export function dansZone(p: Point, z: ZoneMeteo): boolean {
  return p.lat <= z.lat0 && p.lat >= z.lat0 - (z.lignes - 1) * z.pas &&
    p.lng >= z.lon0 && p.lng <= z.lon0 + (z.colonnes - 1) * z.pas
}

export interface Valeur { pluie: number; nuages: number; temp: number; orage: boolean }

/**
 * La valeur au village : la pluie et l'orage sur un petit voisinage (3 km),
 * pour qu'une averse qui passe à 500 m ne soit pas ratée ; la température et
 * les nuages au point même.
 */
export function valeurAu(img: Image, p: Point, z: ZoneMeteo): Valeur {
  const l = Math.round((z.lat0 - p.lat) / z.pas), c = Math.round((p.lng - z.lon0) / z.pas)
  const i = Math.max(0, Math.min(z.lignes - 1, l)) * z.colonnes + Math.max(0, Math.min(z.colonnes - 1, c))
  let somme = 0, nb = 0, orage = false
  for (let dl = -1; dl <= 1; dl++) for (let dc = -1; dc <= 1; dc++) {
    const ll = l + dl, cc = c + dc
    if (ll < 0 || cc < 0 || ll >= z.lignes || cc >= z.colonnes) continue
    const k = ll * z.colonnes + cc
    somme += img.pluie[k]; nb++
    if (img.orage[k]) orage = true
  }
  return { pluie: nb ? somme / nb : img.pluie[i], nuages: img.nuages[i], temp: img.temp[i], orage }
}

/* ── Le ciel en mots ─────────────────────────────────────────────────── */

export type Ciel = 'soleil' | 'lune' | 'eclaircies' | 'eclaircies-nuit' | 'nuages' | 'couvert' | 'pluie' | 'forte' | 'orage'

/** Hauteur du soleil (degrés) — formule courte, à un degré près. */
export function hauteurSoleil(t: number, p: Point): number {
  const d = new Date(t)
  const jour = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000
  const decl = -23.44 * Math.cos((2 * Math.PI / 365) * (jour + 10)) * Math.PI / 180
  const heureSol = d.getUTCHours() + d.getUTCMinutes() / 60 + p.lng / 15
  const angle = (heureSol - 12) * 15 * Math.PI / 180
  const lat = p.lat * Math.PI / 180
  return Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(angle)) * 180 / Math.PI
}

export function cielDe(v: Valeur, jour: boolean): Ciel {
  if (v.orage) return 'orage'
  if (v.pluie >= SEUIL_MODEREE) return 'forte'
  if (v.pluie >= SEUIL_PLUIE) return 'pluie'
  if (v.nuages >= 85) return 'couvert'
  if (v.nuages >= 50) return 'nuages'
  if (v.nuages >= 20) return jour ? 'eclaircies' : 'eclaircies-nuit'
  return jour ? 'soleil' : 'lune'
}

export function etatEnMots(v: Valeur, jour: boolean): string {
  if (v.orage) return 'Orage'
  if (v.pluie >= SEUIL_FORTE) return 'Pluie forte'
  if (v.pluie >= SEUIL_MODEREE) return 'Pluie modérée'
  if (v.pluie >= SEUIL_PLUIE) return 'Pluie faible'
  if (v.nuages >= 85) return 'Ciel couvert'
  if (v.nuages >= 50) return 'Nuageux'
  if (v.nuages >= 20) return jour ? 'Éclaircies' : 'Quelques nuages'
  return jour ? 'Ensoleillé' : 'Ciel dégagé'
}

const fmtHeure = new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Paris' })
/** « 20h », « 5h » */
export const heure = (t: number) => `${Number(fmtHeure.format(new Date(t)).replace(/\D/g, ''))}h`

/**
 * « s'arrête vers 20h » / « pluie vers 3h ». Une image d'heure t porte la
 * pluie tombée entre t − 1 h et t : la pluie commence (ou cesse) donc vers
 * t − 1 h.
 */
export function suiteEnMots(serie: { t: number; v: Valeur; pas: number }[], iMaintenant: number): string {
  const ici = serie[iMaintenant]
  if (!ici) return ''
  const pleut = ici.v.pluie >= SEUIL_PLUIE
  for (let k = iMaintenant + 1; k < serie.length && serie[k].t - ici.t <= 24 * 3_600_000; k++) {
    const s = serie[k]
    const debut = s.t - s.pas * 3_600_000
    if (pleut && s.v.pluie < SEUIL_PLUIE) return `s'arrête vers ${heure(debut)}`
    if (!pleut && s.v.pluie >= SEUIL_PLUIE) return `pluie vers ${heure(debut)}`
  }
  return pleut ? 'pas d’accalmie avant demain' : 'pas de pluie d’ici demain'
}

/* ── Les jours (ECMWF) ───────────────────────────────────────────────── */

export interface Jour { date: string; min: number; max: number; pluie: number; ciel: Ciel }

const fmtJour = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
const fmtHeureNum = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' })

export function joursAu(j: JoursMeteo, p: Point, combien: number): Jour[] {
  const g = j.grille
  const l = Math.max(0, Math.min(g.lignes - 1, Math.round((g.lat0 - p.lat) / g.pas)))
  const c = Math.max(0, Math.min(g.colonnes - 1, Math.round((p.lng - g.lon0) / g.pas)))
  const i = l * g.colonnes + c
  const parJour = new Map<string, { t: number; t2m: number; tp: number; tcc: number }[]>()
  for (const s of j.pas) {
    // Une échéance de minuit clôt la veille : on la range un instant avant.
    const t = Date.parse(s.t)
    const cle = fmtJour.format(new Date(t - 1))
    if (!parJour.has(cle)) parJour.set(cle, [])
    parJour.get(cle)!.push({ t, t2m: s.t2m[i] / 10, tp: s.tp[i] / 10, tcc: s.tcc[i] })
  }
  const aujourdhui = fmtJour.format(new Date())
  const cles = Array.from(parJour.keys()).filter(k => k >= aujourdhui).sort()
  const out: Jour[] = []
  let cumulAvant: number | null = null
  for (const k of Array.from(parJour.keys()).sort()) {
    const pts = parJour.get(k)!
    const fin = pts[pts.length - 1].tp
    const debut = cumulAvant ?? pts[0].tp
    cumulAvant = fin
    if (!cles.includes(k) || out.length >= combien || pts.length < 2) continue
    const pluie = Math.max(0, fin - debut)
    const temps = pts.map(x => x.t2m)
    const journee = pts.filter(x => { const h = Number(fmtHeureNum.format(new Date(x.t))); return h >= 9 && h <= 18 })
    const nuages = (journee.length ? journee : pts).reduce((a, x) => a + x.tcc, 0) / (journee.length || pts.length)
    const ciel: Ciel = pluie >= 10 ? 'forte' : pluie >= 1 ? 'pluie' : nuages >= 85 ? 'couvert' : nuages >= 50 ? 'nuages' : nuages >= 20 ? 'eclaircies' : 'soleil'
    out.push({ date: k, min: Math.min(...temps), max: Math.max(...temps), pluie, ciel })
  }
  return out
}

const fmtNomJour = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'Europe/Paris' })
export function nomDuJour(date: string): string {
  const aujourdhui = fmtJour.format(new Date())
  const demain = fmtJour.format(new Date(Date.now() + 86_400_000))
  if (date === aujourdhui) return 'Aujourd’hui'
  if (date === demain) return 'Demain'
  return fmtNomJour.format(new Date(`${date}T12:00:00Z`)).replace('.', '')
}
