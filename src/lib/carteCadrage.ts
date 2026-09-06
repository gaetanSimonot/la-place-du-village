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

/**
 * Ce que le bandeau « à la une » occupe au bas de la carte, sur ordinateur.
 *
 * Valeur DÉCLARÉE, pas mesurée : elle ne bouge qu'avec le CSS qui la produit
 * (`.pcv-proBandeau` dans desktop-carte.css — 16 px de fond plus la carte
 * elle-même). Une mesure obligerait à attendre que le bandeau existe, alors
 * qu'un cadrage se calcule souvent avant.
 *
 * Sur ordinateur il n'y a pas de feuille : c'est la seule chose qui mange le
 * bas de la carte, et elle ne se négocie pas.
 */
export const PLANCHER_BANDEAU_PRO = 130

/**
 * Ce qu'un cadrage garde de la carte, quoi qu'il arrive.
 *
 * Une marge ne peut pas manger toute la fenêtre. Google ne dit pas ce qu'il
 * fait d'un cadrage dont les marges dépassent la carte — en pratique il recule
 * jusqu'au monde entier ; MapLibre, lui, refuse et se plaint dans la console.
 *
 * Or la feuille déployée masque TOUTE la carte : la marge basse y vaut sa
 * hauteur entière, et le moindre recadrage — une revalidation des données
 * suffit — envoyait la vue sur la France ou plus loin. On ne s'en apercevait
 * qu'en redescendant la feuille, la carte n'étant pas visible au moment du
 * dégât.
 */
const PART_UTILE_MINIMALE = 0.4

function surBureau(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
}

/**
 * La feuille a-t-elle une position, ou n'est-elle pas encore montée ?
 *
 * Elle est chargée à la demande : la carte peut vouloir se cadrer avant qu'elle
 * existe. Sa valeur de départ (9999) se lit comme une marge nulle, et cadrer
 * là-dessus donne une vue calculée sans elle, corrigée un instant plus tard —
 * un demi-cran de zoom qui bouge tout seul. Mieux vaut attendre une image.
 *
 * Vrai s'il n'y a rien à attendre : sur ordinateur la feuille est une colonne,
 * et sans valeur fournie il n'y a pas de feuille du tout.
 */
export function feuillePlacee(hauteurCarte: number, feuille: PositionFeuille): boolean {
  if (feuille == null || surBureau()) return true
  const y = lireY(feuille)
  return y != null && Number.isFinite(y) && y <= hauteurCarte
}

/**
 * La géométrie est-elle connue ? Deux conditions, une seule réponse.
 *
 * La carte doit avoir une hauteur — une fenêtre de hauteur nulle ne peut rien
 * produire de sensé, et un cadrage qu'on y lance recule jusqu'au monde. Et la
 * feuille doit avoir sa position, sans quoi la marge est fausse.
 *
 * Tant que ce n'est pas vrai, on ne cadre pas : on attend. Mieux vaut la vue
 * enregistrée qu'une vue calculée sur une géométrie qu'on ne connaît pas.
 */
export function cadrable(hauteurCarte: number, feuille: PositionFeuille): boolean {
  return hauteurCarte > 0 && feuillePlacee(hauteurCarte, feuille)
}

/**
 * Attendre que la géométrie soit connue, puis cadrer — au plus deux secondes.
 *
 * Une image suffit d'ordinaire ; la feuille, chargée à la demande, peut en
 * demander quelques dizaines. Passé le délai on renonce au cadrage plutôt que
 * d'en jouer un faux : la vue enregistrée reste, et le prochain changement de
 * liste réessaiera.
 *
 * Renvoie de quoi annuler, à rendre au nettoyage de l'effet.
 */
export function desQueCadrable(pret: () => boolean, cadrer: () => void, imagesMax = 120): () => void {
  let image = 0
  let restantes = imagesMax
  const tour = () => {
    if (pret()) { cadrer(); return }
    if (restantes-- <= 0) return
    image = requestAnimationFrame(tour)
  }
  image = requestAnimationFrame(tour)
  return () => cancelAnimationFrame(image)
}

export interface Bornes { minLat: number; minLng: number; maxLat: number; maxLng: number }

export function bornesDe(points: { lat: number; lng: number }[]): Bornes | null {
  if (points.length === 0) return null
  let minLat = 90, minLng = 180, maxLat = -90, maxLng = -180
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }
  return { minLat, minLng, maxLat, maxLng }
}

/**
 * De quoi savoir si un cadrage automatique donnerait la MEME vue qu'avant.
 *
 * Seules les bornes comptent : un cadrage ne regarde ni les titres, ni les
 * promotions, ni l'ordre de la liste. Une revalidation qui renvoie les mêmes
 * lieux ne doit donc pas rejouer le cadrage — sinon la carte bouge sans qu'on
 * lui ait rien demandé.
 *
 * Cinq décimales, soit le mètre : deux réponses identiques ne doivent pas
 * différer sur une décimale de flottant.
 */
export function empreinteBornes(b: Bornes): string {
  const r = (v: number) => v.toFixed(5)
  return `${r(b.minLat)}|${r(b.minLng)}|${r(b.maxLat)}|${r(b.maxLng)}`
}

export interface OptionsCadrage {
  /** Air au-dessus — la barre de l'application, sur mobile. */
  haut: number
  /** Air à gauche et à droite. */
  cotes: number
  /** Air en bas, EN PLUS de ce qui est masqué. Défaut : autant que les côtés. */
  bas?: number
  /**
   * Ce qu'on concède à la feuille, en part de ce qu'elle masque vraiment.
   *
   * 1 = on la respecte entièrement. En dessous, on accepte que le bas du
   * cadrage passe sous elle — parce que reculer assez pour tout montrer
   * au-dessus coûterait plus que ça ne rapporte. Ne s'applique qu'à la
   * feuille : le bandeau du bureau n'est pas négociable.
   */
  partFeuille?: number
}

/**
 * Les marges d'un cadrage automatique, dans un seul vocabulaire.
 *
 * Elles étaient dites de quatre façons pour quatre appels — un objet à quatre
 * côtés ici, un nombre unique là — et aucune ne savait où était la feuille :
 * un `bottom: 180` en dur valait à peu près la position basse et se trompait
 * de 160 px à mi-hauteur.
 */
export function margesCadrage(
  hauteurCarte: number,
  feuille: PositionFeuille,
  { haut, cotes, bas, partFeuille = 1 }: OptionsCadrage,
): { top: number; right: number; bottom: number; left: number } {
  const masque = surBureau()
    ? PLANCHER_BANDEAU_PRO
    : margeBasse(hauteurCarte, feuille) * partFeuille
  const basse = (bas ?? cotes) + Math.round(masque)
  // Hauteur inconnue : on ne peut rien plafonner, donc on ne concède rien.
  // Ce cas ne doit pas arriver — un cadrage ne se lance qu'une fois la
  // géométrie connue (cf. `cadrable`) — et s'il arrive, mieux vaut une marge
  // nulle qu'une marge que rien ne borne.
  const plafond = hauteurCarte
    ? Math.max(0, Math.round(hauteurCarte * (1 - PART_UTILE_MINIMALE)) - haut)
    : 0
  return {
    top:    haut,
    right:  cotes,
    bottom: Math.min(basse, plafond),
    left:   cotes,
  }
}

/**
 * La hauteur réellement disponible pour poser un bloc, à cet instant.
 *
 * Se calcule sur la place qu'il RESTE, jamais sur une hauteur d'écran de
 * référence : `innerHeight` bouge quand la barre du navigateur apparaît ou
 * disparaît, et un grand téléphone passe alors sous le seuil le temps d'un
 * défilement. C'est la place du moment qui décide, pas le modèle d'appareil.
 */
export function fenetreVisible(hauteurCarte: number, feuille: PositionFeuille): number {
  return Math.max(0, hauteurCarte - margeBasse(hauteurCarte, feuille))
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
 * Rejouer une action une fois que plus rien ne bouge.
 *
 * À l'arrivée sur la carte, tout se pose en même temps : la carte prend sa
 * hauteur, la feuille rejoint son palier, la hauteur d'écran réelle remplace
 * sa valeur par défaut, les données arrivent. Un cadrage joué au milieu de ça
 * est calculé sur une géométrie qui n'est pas encore la bonne — et comme les
 * bornes, elles, ne changent plus ensuite, rien ne vient le corriger : la vue
 * fausse reste jusqu'à ce qu'on touche un filtre.
 *
 * On rejoue donc le MÊME cadrage, une fois, quand la feuille s'est tue. C'est
 * une condition de calme et non un délai fixe : chaque mouvement de la feuille
 * repousse l'échéance, et le cadrage part quand elle s'arrête pour de bon.
 *
 * Renvoie de quoi annuler, à rendre au nettoyage de l'effet.
 */
export function quandToutEstPose(feuille: PositionFeuille, agir: () => void, calme = 400): () => void {
  let minuteur: ReturnType<typeof setTimeout>
  const repousser = () => { clearTimeout(minuteur); minuteur = setTimeout(agir, calme) }
  const off = feuille && typeof feuille !== 'number' ? feuille.on('change', repousser) : null
  repousser()
  return () => { clearTimeout(minuteur); off?.() }
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
