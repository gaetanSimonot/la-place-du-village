import type { MotionValue } from 'framer-motion'
import type { Map as MapLibreMap } from 'maplibre-gl'

/**
 * VISER UN POINT DANS LA FENÊTRE QU'ON VOIT — pas au milieu du div.
 *
 * Sur mobile, la carte occupe tout l'écran et la feuille lui en mange le bas.
 * Son milieu géométrique tombe donc DERRIÈRE la liste : y amener un événement,
 * c'est le cacher. Tous les recadrages de sélection passaient par là.
 *
 * La règle : pour qu'un point apparaisse au milieu de ce qu'on voit, le centre
 * du div doit être ce qui se trouve `marge / 2` pixels PLUS BAS que lui.
 *
 * Un seul endroit pour la géométrie, deux traductions : Google ne sait pas
 * viser à côté de son centre (il faut lui calculer le point décalé par la
 * projection), MapLibre le sait nativement (`offset`).
 *
 * Ce qui N'EST PAS ici, volontairement : la restauration d'une vue enregistrée
 * (`centerOn`). Elle rejoue un centre relevé par `getCenter()`, qui est un
 * centre de div : le relire comme un centre visible décalerait la vue à chaque
 * aller-retour. Les deux forment une boucle fermée, on ne touche ni à l'un ni
 * à l'autre.
 */

/** Le haut de la feuille, en pixels depuis le haut de la carte. */
type PositionFeuille = MotionValue<number> | number | undefined

function lireY(f: PositionFeuille): number | undefined {
  if (f == null) return undefined
  return typeof f === 'number' ? f : f.get()
}

/**
 * Ce que la feuille masque du bas de la carte, en pixels.
 *
 * Zéro sur ordinateur : la liste y est une colonne à gauche, la carte occupe
 * ce qui reste et son div ne contient donc que du visible.
 */
export function margeBasse(hauteurCarte: number, feuille: PositionFeuille): number {
  const y = lireY(feuille)
  if (y == null || !Number.isFinite(y) || !hauteurCarte) return 0
  if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) return 0
  return Math.max(0, Math.min(hauteurCarte, hauteurCarte - y))
}

export interface Visee {
  /** Position de la feuille — c'est elle qui donne la marge. */
  feuille?: PositionFeuille
  /** Zoom d'arrivée. Le décalage est calculé À CE zoom, pas au zoom courant. */
  zoom?: number
  /** false = saut sec. Défaut : déplacement animé. */
  anime?: boolean
}

/**
 * Fond Google : pas de visée décalée dans l'API, on calcule le point.
 *
 * Un pixel vaut 1 / 2^zoom unité de monde projeté, et l'axe y du monde
 * descend vers le sud — le centre visé est donc `marge / 2` unités-pixels
 * PLUS BAS que le point qu'on veut voir.
 */
export function viserGoogle(
  map: google.maps.Map,
  point: { lat: number; lng: number },
  { feuille, zoom, anime = true }: Visee = {},
): void {
  const marge = margeBasse(map.getDiv()?.clientHeight ?? 0, feuille)
  const z     = zoom ?? map.getZoom()
  const proj  = map.getProjection()

  let cible: google.maps.LatLng | google.maps.LatLngLiteral = point
  // Sans projection (carte pas encore prête) ou sans marge (bureau), le point
  // brut EST le bon centre : on ne renonce pas au recadrage pour autant.
  if (marge > 0 && proj && z != null) {
    const pt = proj.fromLatLngToPoint(new google.maps.LatLng(point.lat, point.lng))
    const dc = pt && proj.fromPointToLatLng(new google.maps.Point(pt.x, pt.y + (marge / 2) / 2 ** z))
    if (dc) cible = dc
  }

  if (anime) map.panTo(cible)
  else       map.setCenter(cible)
  if (zoom != null) map.setZoom(zoom)
}

/** Fond MapLibre : `offset` fait le travail, il suffit de le renseigner. */
export function viserMaplibre(
  map: MapLibreMap,
  point: { lat: number; lng: number },
  { feuille, zoom, anime = true }: Visee = {},
): void {
  const marge = margeBasse(map.getContainer()?.clientHeight ?? 0, feuille)
  map.easeTo({
    center: [point.lng, point.lat],
    ...(zoom != null ? { zoom } : {}),
    // Le point d'arrivée, mesuré depuis le centre du conteneur : au-dessus de
    // lui de la moitié de ce que la feuille cache.
    offset: [0, -marge / 2],
    ...(anime ? {} : { duration: 0 }),
  })
}
