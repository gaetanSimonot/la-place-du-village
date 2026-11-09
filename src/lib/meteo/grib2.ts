import { decoderAec } from './ccsds'

/**
 * LECTURE D'UN MESSAGE GRIB2 — juste ce que portent AROME et l'ECMWF :
 * grille régulière lat/lon (gabarit 3.0), produit 4.0 ou 4.8, compression
 * CCSDS (5.42) ou simple (5.0), avec ou sans bitmap.
 *
 * Un message = un champ (une variable, une échéance). On décode tout le
 * champ — le CCSDS ne se lit que d'un bout à l'autre — puis on n'en garde
 * qu'une fenêtre.
 */

export interface EnteteGrib {
  discipline: number
  categorie: number
  numero: number
  /** Gabarit de produit : 0 = instantané, 8 = cumul / moyenne sur une période. */
  gabaritProduit: number
  typeNiveau: number
  ni: number; nj: number
  la1: number; lo1: number; di: number; dj: number
  /** Indicateur de bitmap : 0 = présent, 255 = absent. */
  bitmap: number
}

/** Entier signé GRIB : bit de poids fort = signe (pas de complément à deux). */
function signe(b: Uint8Array, o: number, n: number): number {
  let v = b[o] & 0x7f
  for (let i = 1; i < n; i++) v = v * 256 + b[o + i]
  return b[o] & 0x80 ? -v : v
}
function nonSigne(b: Uint8Array, o: number, n: number): number {
  let v = 0
  for (let i = 0; i < n; i++) v = v * 256 + b[o + i]
  return v
}

interface Sections { s3: number; s4: number; s5: number; s6: number; s7: number; fin: number; discipline: number }

function sections(b: Uint8Array): Sections {
  if (b[0] !== 0x47 || b[1] !== 0x52 || b[2] !== 0x49 || b[3] !== 0x42 || b[7] !== 2) throw new Error('GRIB2 : en-tête invalide')
  const total = nonSigne(b, 8, 8)
  const s: Sections = { s3: -1, s4: -1, s5: -1, s6: -1, s7: -1, fin: total, discipline: b[6] }
  let p = 16
  while (p < total - 4) {
    const ln = nonSigne(b, p, 4), num = b[p + 4]
    if (num === 3) s.s3 = p
    else if (num === 4) s.s4 = p
    else if (num === 5) s.s5 = p
    else if (num === 6) s.s6 = p
    else if (num === 7) { s.s7 = p; break }
    if (ln <= 0) break
    p += ln
  }
  return s
}

/**
 * L'en-tête seul. Fonctionne sur le début d'un message (sections 0 à 4) :
 * c'est ce qui permet d'identifier un champ sans télécharger ses données.
 */
export function lireEntete(b: Uint8Array): Omit<EnteteGrib, 'bitmap'> {
  const total = Math.min(b.length, nonSigne(b, 8, 8))
  let p = 16, s3 = -1, s4 = -1
  while (p < total - 5) {
    const ln = nonSigne(b, p, 4), num = b[p + 4]
    if (num === 3) s3 = p
    if (num === 4) { s4 = p; break }
    if (ln <= 0) break
    p += ln
  }
  if (s3 < 0 || s4 < 0 || s4 + 25 > b.length) throw new Error('GRIB2 : en-tête incomplet')
  if (nonSigne(b, s3 + 12, 2) !== 0) throw new Error('GRIB2 : grille non régulière')
  return {
    discipline: b[6],
    categorie: b[s4 + 9], numero: b[s4 + 10],
    gabaritProduit: nonSigne(b, s4 + 7, 2),
    typeNiveau: b[s4 + 22],
    ni: nonSigne(b, s3 + 30, 4), nj: nonSigne(b, s3 + 34, 4),
    la1: signe(b, s3 + 46, 4) / 1e6, lo1: signe(b, s3 + 50, 4) / 1e6,
    di: nonSigne(b, s3 + 63, 4) / 1e6, dj: nonSigne(b, s3 + 67, 4) / 1e6,
  }
}

/** Une fenêtre de la grille : `l` lignes du nord au sud, `c` colonnes d'ouest en est. */
export interface Fenetre { lat0: number; lon0: number; pas: number; lignes: number; colonnes: number }

/** Un champ décodé : sa grille, et la valeur en (i, j) — NaN hors données. */
export interface Champ { e: Omit<EnteteGrib, 'bitmap'>; lire: (i: number, j: number) => number }

/**
 * Les valeurs aux points de la fenêtre. Si la fenêtre est plus lâche que la
 * grille (5 km sur une grille de 1 km), chaque point est la MOYENNE du bloc
 * qu'il couvre : prendre un point sur cinq raterait les averses entre deux.
 * Sinon, plus proche voisin.
 */
export function extraire(ch: Champ, f: Fenetre): Float32Array {
  const { e } = ch
  const out = new Float32Array(f.lignes * f.colonnes)
  const lonRef = ((e.lo1 % 360) + 360) % 360
  const demi = Math.max(0, Math.floor(Math.round(f.pas / e.di) / 2))
  for (let l = 0; l < f.lignes; l++) {
    const lat = f.lat0 - l * f.pas
    const j0 = Math.round((e.la1 - lat) / e.dj)
    for (let c = 0; c < f.colonnes; c++) {
      const lon = (((f.lon0 + c * f.pas) % 360) + 360) % 360
      let i0 = Math.round((((lon - lonRef) % 360) + 360) % 360 / e.di)
      if (i0 >= e.ni && i0 - e.ni < 1) i0 = e.ni - 1
      let somme = 0, n = 0
      for (let dj = -demi; dj <= demi; dj++) {
        const j = j0 + dj
        if (j < 0 || j >= e.nj) continue
        for (let di = -demi; di <= demi; di++) {
          const i = i0 + di
          if (i < 0 || i >= e.ni) continue
          const v = ch.lire(i, j)
          if (!Number.isNaN(v)) { somme += v; n++ }
        }
      }
      out[l * f.colonnes + c] = n ? somme / n : NaN
    }
  }
  return out
}

/** Décode un message et n'en garde qu'une fenêtre. */
export function decoderFenetre(b: Uint8Array, f: Fenetre): Float32Array {
  return extraire(decoderMessage(b), f)
}

/** Décode un message complet (le CCSDS ne se lit que d'un bout à l'autre). */
export function decoderMessage(b: Uint8Array): Champ {
  const s = sections(b)
  if (s.s3 < 0 || s.s5 < 0 || s.s7 < 0) throw new Error('GRIB2 : sections manquantes')
  const e = lireEntete(b)
  const scan = b[s.s3 + 71]
  if (scan !== 0) throw new Error(`GRIB2 : balayage ${scan} non géré`)

  const npts = nonSigne(b, s.s5 + 5, 4)
  const gab5 = nonSigne(b, s.s5 + 9, 2)
  const dv = new DataView(b.buffer, b.byteOffset + s.s5 + 11, 4)
  const R = dv.getFloat32(0, false)
  const E = signe(b, s.s5 + 15, 2)
  const D = signe(b, s.s5 + 17, 2)
  const nbits = b[s.s5 + 19]
  const ln7 = nonSigne(b, s.s7, 4)
  const data = b.subarray(s.s7 + 5, s.s7 + ln7)

  let brut: Uint32Array
  if (nbits === 0) brut = new Uint32Array(npts)
  else if (gab5 === 42) brut = decoderAec(data, nbits, b[s.s5 + 22], nonSigne(b, s.s5 + 23, 2), b[s.s5 + 21], npts)
  else if (gab5 === 0) {
    brut = new Uint32Array(npts)
    let bp = 0
    for (let i = 0; i < npts; i++) {
      let v = 0
      for (let k = 0; k < nbits; k++, bp++) v = v * 2 + ((data[bp >>> 3] >>> (7 - (bp & 7))) & 1)
      brut[i] = v
    }
  } else throw new Error(`GRIB2 : compression ${gab5} non gérée`)

  const echelleE = 2 ** E, echelleD = 10 ** D
  const valeur = (x: number) => (R + x * echelleE) / echelleD

  // Grille → index compacté (le bitmap retire les points sans donnée).
  const ntot = e.ni * e.nj
  let compact: Int32Array | null = null
  if (s.s6 >= 0 && b[s.s6 + 5] === 0) {
    compact = new Int32Array(ntot)
    const bm = s.s6 + 6
    let k = 0
    for (let i = 0; i < ntot; i++) {
      compact[i] = (b[bm + (i >>> 3)] >>> (7 - (i & 7))) & 1 ? k++ : -1
    }
  }

  return {
    e,
    lire: (i, j) => {
      const g = j * e.ni + i
      const k = compact ? compact[g] : g
      return k >= 0 ? valeur(brut[k]) : NaN
    },
  }
}
