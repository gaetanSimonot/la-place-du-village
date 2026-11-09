import type { Image } from './lecture'
import { SEUIL_PLUIE, SEUIL_MODEREE, SEUIL_FORTE, distanceKm, fondu, type ZoneMeteo } from './zone'

/**
 * LA VUE D'ENSEMBLE — quand on dézoome.
 *
 * Une grille de 5 km jusqu'à 400 km autour du village, dessinée en image
 * transparente posée sur la carte (une couche « image » de MapLibre), avec
 * les mêmes couleurs que les contours de la zone fine. Pleine jusqu'à
 * 250 km, elle s'efface ensuite. Là où la zone fine existe, elle s'efface
 * complètement : ce sont les contours au kilomètre qui parlent.
 *
 * La carte est en projection de Mercator, la grille en degrés réguliers :
 * sur 7° de latitude, poser l'une sur l'autre décalerait le milieu d'une
 * dizaine de kilomètres. Chaque ligne de l'image est donc recalculée à sa
 * vraie latitude.
 */

const FACTEUR = 4
/** Mêmes teintes que les contours (CarteMeteo), opacités incluses. */
const PLUIE: [number, number, number][] = [[156, 199, 234], [76, 143, 207], [31, 82, 150]]
const ORAGE: [number, number, number] = [200, 75, 47]
const A_PLUIE = 0.78, A_ORAGE = 0.82, A_NUAGES = 0.16, A_COUVERT = 0.3

const melange = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
  t <= 0 ? a : t >= 1 ? b : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

const mercY =(lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
const latDeY = (y: number) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90

export interface ImageCarte { url: string; coins: [[number, number], [number, number], [number, number], [number, number]] }

/**
 * `trou` : laisser vide la zone fine (vue rapprochée, où ses contours au
 * kilomètre s'affichent). Vue de loin, l'image dessine tout, zone fine
 * comprise — deux finesses côte à côte laisseraient voir un rectangle.
 */
export function dessinerVueEnsemble(img: Image, z: ZoneMeteo, voir: { pluie: boolean; nuages: boolean; trou: boolean }): ImageCarte {
  const L = z.large
  const W = (L.colonnes - 1) * FACTEUR + 1, H = (L.lignes - 1) * FACTEUR + 1
  const latN = L.lat0, latS = L.lat0 - (L.lignes - 1) * L.pas
  const lonO = L.lon0, lonE = L.lon0 + (L.colonnes - 1) * L.pas
  const yN = mercY(latN), yS = mercY(latS)
  // La zone fine, où la vue d'ensemble se tait.
  const fN = z.lat0 + z.pas / 2, fS = z.lat0 - (z.lignes - 0.5) * z.pas
  const fO = z.lon0 - z.pas / 2, fE = z.lon0 + (z.colonnes - 0.5) * z.pas

  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  const out = ctx.createImageData(W, H)
  const px = out.data
  const lire = (t: Float32Array | Uint8Array, r: number, k: number) => {
    const r0 = Math.min(L.lignes - 1, Math.max(0, Math.floor(r))), r1 = Math.min(L.lignes - 1, r0 + 1), fr = r - r0
    const k0 = Math.min(L.colonnes - 1, Math.max(0, Math.floor(k))), k1 = Math.min(L.colonnes - 1, k0 + 1), fk = k - k0
    const a = t[r0 * L.colonnes + k0], b = t[r0 * L.colonnes + k1], cc = t[r1 * L.colonnes + k0], d = t[r1 * L.colonnes + k1]
    return (a * (1 - fk) + b * fk) * (1 - fr) + (cc * (1 - fk) + d * fk) * fr
  }

  for (let y = 0; y < H; y++) {
    const lat = latDeY(yN + ((yS - yN) * y) / (H - 1))
    const r = (L.lat0 - lat) / L.pas
    for (let x = 0; x < W; x++) {
      const lon = lonO + ((lonE - lonO) * x) / (W - 1)
      if (voir.trou && lat <= fN && lat >= fS && lon >= fO && lon <= fE) continue
      const f = fondu(distanceKm(z.centre.lat, z.centre.lng, lat, lon), L.pleinKm, L.maxKm)
      if (f <= 0) continue
      const k = x / FACTEUR, dk = 1 / FACTEUR
      const dr = (r - (L.lat0 - latDeY(yN + ((yS - yN) * (y + 1)) / (H - 1))) / L.pas)
      /* Bords lissés (anticrénelage) : au lieu d'un seuil tranché, chaque
         pixel prend une part du niveau selon sa distance au seuil, rapportée
         à la variation du champ d'un pixel au suivant. Sans ça, les bords
         font des escaliers dès qu'on zoome un peu. */
      const champ = (t: Float32Array | Uint8Array) => {
        const v = lire(t, r, k)
        const g = Math.abs(lire(t, r, k + dk) - v) + Math.abs(lire(t, r - dr, k) - v)
        return (s: number) => Math.max(0, Math.min(1, (v - s) / Math.max(g, 1e-6) + 0.5))
      }
      let R = 0, G = 0, B = 0, A = 0
      // Le voile des nuages…
      if (voir.nuages) {
        const n = champ(img.nuages)
        const a = A_NUAGES * n(50) + (A_COUVERT - A_NUAGES) * n(85)
        if (a > 0) { R = 255; G = 255; B = 255; A = a }
      }
      // … et la pluie par-dessus, du clair au foncé, l'orage au-dessus de tout.
      if (voir.pluie) {
        const p = champ(img.pluie), o = champ(img.orage)
        const c0 = p(SEUIL_PLUIE), c1 = p(SEUIL_MODEREE), c2 = p(SEUIL_FORTE), co = o(0.35)
        let couleur: [number, number, number] = PLUIE[0]
        couleur = melange(couleur, PLUIE[1], c1)
        couleur = melange(couleur, PLUIE[2], c2)
        couleur = melange(couleur, ORAGE, co)
        const a = Math.max(A_PLUIE * c0, A_ORAGE * co)
        if (a > 0) {
          const aOut = a + A * (1 - a)
          R = (couleur[0] * a + R * A * (1 - a)) / aOut
          G = (couleur[1] * a + G * A * (1 - a)) / aOut
          B = (couleur[2] * a + B * A * (1 - a)) / aOut
          A = aOut
        }
      }
      if (A <= 0) continue
      const i = (y * W + x) * 4
      px[i] = R; px[i + 1] = G; px[i + 2] = B; px[i + 3] = Math.round(A * f * 255)
    }
  }
  ctx.putImageData(out, 0, 0)
  return { url: c.toDataURL('image/png'), coins: [[lonO, latN], [lonE, latN], [lonE, latS], [lonO, latS]] }
}
