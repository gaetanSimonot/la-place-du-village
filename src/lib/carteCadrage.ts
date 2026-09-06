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
 * du div doit être ce qui se trouve `marge / 2` pixels PLUS BAS que lui. Et
 * quand ce point porte une vignette, c'est le BLOC qu'on centre, pas le point :
 * `(marge - bloc) / 2`.
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
  /**
   * Hauteur de ce qui se déploie AU-DESSUS du point, vignette comprise.
   *
   * Une punaise sélectionnée n'est pas un point : c'est un bloc. La vignette
   * s'ouvre au-dessus d'elle, et centrer le point revient à envoyer la
   * vignette sortir par le haut. On centre donc le bloc entier, ce qui pose
   * la punaise sous le milieu et la vignette au-dessus.
   *
   * Conséquence à connaître : la punaise se retrouve à `bloc / 2` sous le
   * milieu de la fenêtre. Elle reste au-dessus de la feuille tant que le bloc
   * tient dans la fenêtre. Sinon elle passe dessous — c'est la limite, pas un
   * réglage à corriger ici.
   */
  bloc?: number
}

/**
 * Hauteur du bloc punaise + vignette, MESURÉE dans le document.
 *
 * Mesurer plutôt que constanter : la vignette change de hauteur selon qu'il y
 * a une image, un titre sur deux lignes, une note. Une valeur figée serait
 * fausse la moitié du temps et vieillirait mal.
 *
 * À appeler quand la vignette est née — sinon elle renvoie 0, et le point est
 * visé seul comme avant.
 */
export function hauteurBlocGoogle(decalagePunaise: number): number {
  if (typeof document === 'undefined') return 0
  const bulle = document.querySelector('.gm-style-iw-c') as HTMLElement | null
  return bulle ? Math.abs(decalagePunaise) + bulle.offsetHeight : 0
}

export function hauteurBlocMaplibre(decalagePunaise: number): number {
  if (typeof document === 'undefined') return 0
  const bulle = document.querySelector('.maplibregl-popup-content') as HTMLElement | null
  return bulle ? Math.abs(decalagePunaise) + bulle.offsetHeight : 0
}

/**
 * Mesurer la vignette dès qu'elle est dans le document, puis viser.
 *
 * La vignette naît dans le même passage que la sélection, mais c'est l'API de
 * la carte qui pose son morceau de document, pas React : elle n'est donc pas
 * là quand notre effet s'exécute. On laisse passer une image ou deux. Si elle
 * ne vient pas, on vise quand même — le point seul, comme avant.
 *
 * Renvoie de quoi annuler, à rendre au nettoyage de l'effet.
 */
export function desQueVignettePrete(
  mesurer: () => number,
  viser: (bloc: number) => void,
  essais = 3,
): () => void {
  let image = 0
  let restants = essais
  const tour = () => {
    const bloc = mesurer()
    if (bloc > 0 || restants-- <= 0) { viser(bloc); return }
    image = requestAnimationFrame(tour)
  }
  image = requestAnimationFrame(tour)
  return () => cancelAnimationFrame(image)
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
  { feuille, zoom, anime = true, bloc = 0 }: Visee = {},
): void {
  const marge = margeBasse(map.getDiv()?.clientHeight ?? 0, feuille)
  const z     = zoom ?? map.getZoom()
  const proj  = map.getProjection()
  const bas   = (marge - bloc) / 2

  let cible: google.maps.LatLng | google.maps.LatLngLiteral = point
  // Sans projection (carte pas encore prête) ou sans marge (bureau), le point
  // brut EST le bon centre : on ne renonce pas au recadrage pour autant.
  if (bas !== 0 && proj && z != null) {
    const pt = proj.fromLatLngToPoint(new google.maps.LatLng(point.lat, point.lng))
    const dc = pt && proj.fromPointToLatLng(new google.maps.Point(pt.x, pt.y + bas / 2 ** z))
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
  { feuille, zoom, anime = true, bloc = 0 }: Visee = {},
): void {
  const marge = margeBasse(map.getContainer()?.clientHeight ?? 0, feuille)
  map.easeTo({
    center: [point.lng, point.lat],
    ...(zoom != null ? { zoom } : {}),
    // Le point d'arrivée, mesuré depuis le centre du conteneur : au-dessus de
    // lui de la moitié de ce que la feuille cache, moins la moitié du bloc.
    offset: [0, -(marge - bloc) / 2],
    ...(anime ? {} : { duration: 0 }),
  })
}
