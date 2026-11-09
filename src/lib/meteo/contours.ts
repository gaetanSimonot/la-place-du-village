import { contours } from 'd3-contour'
import type { Image } from './lecture'
import { SEUIL_PLUIE, SEUIL_MODEREE, SEUIL_FORTE, type ZoneMeteo } from './zone'

/**
 * DES PIXELS AUX FORMES — les contours de pluie et de nuages.
 *
 * La grille AROME (1 km) est d'abord lissée (noyau 1-2-1), puis doublée par
 * interpolation : les bords des zones deviennent des courbes, pas des
 * escaliers. Les formes sont ensuite découpées par niveaux et rendues en
 * GeoJSON, que la carte remplit. Rien n'est dessiné à la main.
 */

const FACTEUR = 2

function lisser(v: Float32Array, w: number, h: number): Float32Array {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = v[y * w + Math.max(0, x - 1)], b = v[y * w + x], c = v[y * w + Math.min(w - 1, x + 1)]
    tmp[y * w + x] = (a + 2 * b + c) / 4
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = tmp[Math.max(0, y - 1) * w + x], b = tmp[y * w + x], c = tmp[Math.min(h - 1, y + 1) * w + x]
    out[y * w + x] = (a + 2 * b + c) / 4
  }
  return out
}

function agrandir(v: Float32Array, w: number, h: number): { v: Float32Array; w: number; h: number } {
  const W = (w - 1) * FACTEUR + 1, H = (h - 1) * FACTEUR + 1
  const out = new Float32Array(W * H)
  for (let Y = 0; Y < H; Y++) {
    const y = Y / FACTEUR, y0 = Math.floor(y), y1 = Math.min(h - 1, y0 + 1), fy = y - y0
    for (let X = 0; X < W; X++) {
      const x = X / FACTEUR, x0 = Math.floor(x), x1 = Math.min(w - 1, x0 + 1), fx = x - x0
      const a = v[y0 * w + x0], b = v[y0 * w + x1], c = v[y1 * w + x0], d = v[y1 * w + x1]
      out[Y * W + X] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
    }
  }
  return { v: out, w: W, h: H }
}

export interface Couche { type: 'FeatureCollection'; features: GeoJSON.Feature<GeoJSON.MultiPolygon, { niveau: number }>[] }

/* Les bords de la zone fine ne s'estompent pas : au-delà, la vue
   d'ensemble (vueEnsemble.ts) prend le relais, aux mêmes couleurs. */
function couches(champ: Float32Array, z: ZoneMeteo, seuils: number[]): Couche {
  const { v, w, h } = agrandir(lisser(champ, z.colonnes, z.lignes), z.colonnes, z.lignes)
  const pas = z.pas / FACTEUR
  const gen = contours().size([w, h]).thresholds(seuils)
  const features = gen(Array.from(v)).map((mp, k) => ({
    type: 'Feature' as const,
    properties: { niveau: k },
    geometry: {
      type: 'MultiPolygon' as const,
      // d3-contour place l'échantillon i au centre du pixel, en i + 0,5.
      coordinates: mp.coordinates.map(poly => poly.map(anneau => anneau.map(([x, y]) => [
        +(z.lon0 + (x - 0.5) * pas).toFixed(4),
        +(z.lat0 - (y - 0.5) * pas).toFixed(4),
      ]))),
    },
  }))
  return { type: 'FeatureCollection', features: features.filter(f => f.geometry.coordinates.length) }
}

/** Niveaux : 0 faible, 1 modérée, 2 forte. */
export const pluieEnFormes = (img: Image, z: ZoneMeteo) => couches(img.pluie, z, [SEUIL_PLUIE, SEUIL_MODEREE, SEUIL_FORTE])

export function orageEnFormes(img: Image, z: ZoneMeteo): Couche {
  const f = new Float32Array(img.orage.length)
  for (let i = 0; i < f.length; i++) f[i] = img.orage[i]
  return couches(f, z, [0.35])
}

