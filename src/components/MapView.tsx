'use client'
import { useEffect, useRef, useCallback, useState } from 'react'
import MapTransportLayer, { type ArretTransport, type TraceTransport, type LigneTransport } from './MapTransportLayer'
import { APIProvider, Map, InfoWindow, useMap } from '@vis.gl/react-google-maps'
import { MarkerClusterer, SuperClusterAlgorithm } from '@googlemaps/markerclusterer'

// Clustering moins agressif : radius en px plus petit (les marqueurs ne se
// regroupent que s'ils sont vraiment proches à l'écran) + maxZoom plus bas
// (les marqueurs se séparent à un zoom moins poussé). Avant : défaut 60/16,
// d'où des clusters qui ne se cassaient qu'en zoomant très près.
const CLUSTER_OPTS = { radius: 40, maxZoom: 14 }
import { EvenementCard, ProducerCard, isApproxLocation, EtablissementCard } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatEventDate } from '@/lib/filters'
import { useTheme } from '@/components/ThemeProvider'
import { etabMarkerSvg, ETAB_TYPES } from '@/lib/etablissement-types'
import { getTearParams, getProducerTearParams, markerSvg, producerMarkerSvg } from '@/lib/mapMarkers'
import { useSuiviFeuille } from '@/hooks/useSuiviFeuille'
import { viserGoogle, hauteurBlocGoogle, desQueVignettePrete, margesCadrage, fenetreVisible, feuillePlacee, bornesDe, empreinteBornes } from '@/lib/carteCadrage'

/**
 * De combien la vignette se pose au-dessus du point. Une seule définition :
 * le rendu s'en sert pour la poser, le recadrage pour savoir où elle est.
 */
const DECALAGE_VIGNETTE       = 36
const DECALAGE_VIGNETTE_PROMU = 47
import type { MotionValue } from 'framer-motion'

const GANGES = { lat: 43.9333, lng: 3.7 }

// Style Mapbox "Warm" adapté pour Google Maps (fallback)
const WARM_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry',              stylers: [{ color: '#ede8df' }] },
  { elementType: 'labels.text.stroke',    stylers: [{ color: '#f5f1eb' }] },
  { elementType: 'labels.text.fill',      stylers: [{ color: '#7a6a5a' }] },
  { featureType: 'water', elementType: 'geometry',           stylers: [{ color: '#aac4d8' }] },
  { featureType: 'water', elementType: 'labels.text.fill',   stylers: [{ color: '#7a9ab0' }] },
  { featureType: 'landscape',             elementType: 'geometry', stylers: [{ color: '#e4ddd2' }] },
  { featureType: 'landscape.natural',     elementType: 'geometry', stylers: [{ color: '#d8cfc2' }] },
  { featureType: 'road',                  elementType: 'geometry', stylers: [{ color: '#f8f3ec' }] },
  { featureType: 'road',                  elementType: 'geometry.stroke', stylers: [{ color: '#ddd4c4' }] },
  { featureType: 'road.highway',          elementType: 'geometry', stylers: [{ color: '#f4d97a' }] },
  { featureType: 'road.highway',          elementType: 'geometry.stroke', stylers: [{ color: '#e8c860' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#e8a055' }] },
  { featureType: 'poi',                   elementType: 'geometry', stylers: [{ color: '#d4cbba' }] },
  { featureType: 'poi.park',              elementType: 'geometry.fill', stylers: [{ color: '#b8c89a' }] },
  { featureType: 'poi.park',              elementType: 'labels.text.fill', stylers: [{ color: '#607a40' }] },
  { featureType: 'poi',                   elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business',          stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',               elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative',        elementType: 'geometry.stroke', stylers: [{ color: '#c5b9a8' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#8c6e5a' }] },
]

function MapDragListener({ onDragStart, onDragEnd, onCameraIdle }: {
  onDragStart?: () => void
  onDragEnd?: () => void
  onCameraIdle?: (lat: number, lng: number, zoom: number) => void
}) {
  const map = useMap()
  useEffect(() => {
    if (!map) return
    const listeners: google.maps.MapsEventListener[] = []
    if (onDragStart)   listeners.push(map.addListener('dragstart', onDragStart))
    if (onDragEnd)     listeners.push(map.addListener('dragend',   onDragEnd))
    if (onCameraIdle)  listeners.push(map.addListener('idle', () => {
      const c = map.getCenter(); const z = map.getZoom()
      if (c && z !== undefined) onCameraIdle(c.lat(), c.lng(), z)
    }))
    return () => listeners.forEach(l => l?.remove())
  }, [map, onDragStart, onDragEnd, onCameraIdle])
  return null
}

/**
 * La carte se recale quand la feuille bouge — la règle est dans le crochet.
 *
 * Google Maps n'a pas de marge de cadrage (`padding` n'existe que dans
 * `fitBounds`) : on déplace donc le centre à la main. Et surtout PAS avec
 * `panBy()`, qui anime tout seul dès que la distance est courte — appelé à
 * chaque image, il prendrait un retard visible sur le doigt. `setCenter` est
 * instantané ; le calcul passe par la projection, où un pixel vaut
 * 1 / 2^zoom unité de monde.
 */
function SuiviFeuille({ sheetY, panEnCoursRef }: {
  sheetY?: MotionValue<number>
  panEnCoursRef?: React.MutableRefObject<boolean>
}) {
  const map = useMap()
  const { fixedMap } = useTheme()
  useSuiviFeuille(sheetY, panEnCoursRef, !!map && !fixedMap, dyFond => {
    if (!map) return
    const proj = map.getProjection()
    const c    = map.getCenter()
    const z    = map.getZoom()
    if (!proj || !c || z === undefined) return
    const pt = proj.fromLatLngToPoint(c)
    if (!pt) return
    // Le fond descend de `dyFond` ⇔ le centre remonte d'autant : vers le nord,
    // donc vers les petits `y` du monde projeté.
    const nc = proj.fromPointToLatLng(new google.maps.Point(pt.x, pt.y - dyFond / 2 ** z))
    if (nc) map.setCenter(nc)
  })
  return null
}

/**
 * Le plus loin où la carte a le droit de reculer sur ordinateur. En dessous,
 * on quitte la vallée : à ce niveau l'écran couvre environ 80 km, ce qui tient
 * Ganges et ses alentours sans partir vers la mer.
 */
const ZOOM_MIN_BUREAU = 11

/**
 * Les deux façons de bouger la carte sans y toucher — et ce qui les sépare.
 *
 * RESTAURER : reposer un centre relevé par `getCenter()`, donc un centre de
 * div. Aucun décalage, sinon la vue glisserait à chaque aller-retour.
 * VISER : amener un lieu sous les yeux, au milieu de ce qui n'est pas masqué.
 *
 * Elles vivaient dans la même propriété, d'où le 📍 d'une carte de la liste
 * qui posait son commerce derrière la feuille.
 */
function Cadrage({ restaurerVue, viserLieu, sheetY }: {
  restaurerVue?: { lat: number; lng: number; zoom?: number } | null
  viserLieu?: { lat: number; lng: number; zoom?: number; cle?: string; avecVignette?: boolean } | null
  sheetY?: MotionValue<number>
}) {
  const map = useMap()

  // setCenter et non panTo : fiable sur grande distance.
  useEffect(() => {
    if (!map || !restaurerVue) return
    map.setCenter({ lat: restaurerVue.lat, lng: restaurerVue.lng })
    map.setZoom(restaurerVue.zoom ?? 11)
  }, [map, restaurerVue])

  useEffect(() => {
    if (!map || !viserLieu) return
    const point = { lat: viserLieu.lat, lng: viserLieu.lng }
    const opts  = { feuille: sheetY, zoom: viserLieu.zoom }
    if (!viserLieu.avecVignette) { viserGoogle(map, point, opts); return }
    // Le 📍 d'une carte de la liste sélectionne aussi la fiche : une vignette
    // s'ouvre, on vise donc le bloc. Le décalage retenu est celui du cas
    // courant — une punaise mise en avant est 11 px plus haute, ce qui ne se
    // voit pas sur un bloc de 250.
    return desQueVignettePrete(
      () => hauteurBlocGoogle(DECALAGE_VIGNETTE),
      bloc => viserGoogle(map, point, { ...opts, bloc }),
    )
  }, [map, viserLieu, sheetY])

  return null
}

/**
 * L'apparence d'une punaise — sa seule différence entre choisie et pas choisie.
 *
 * Sortie de la création exprès : changer de sélection ne touche plus qu'aux
 * deux punaises concernées. Avant, l'effet de création dépendait de la
 * sélection et reconstruisait la couche entière à chaque clic — 258 punaises
 * détruites et refaites, plus la ré-indexation du regroupement, pour deux
 * icônes qui changent.
 */
function habillerEvenement(marker: google.maps.Marker, evt: EvenementCard, choisie: boolean) {
  const promu = evt.promotion === 'pro' || evt.promotion === 'max'
  const isMax = evt.promotion === 'max'
  const p     = getTearParams(choisie, promu, isMax)
  marker.setIcon({
    url: markerSvg(evt.categorie, choisie, isApproxLocation(evt.lieux), promu, isMax),
    scaledSize: new google.maps.Size(p.w, p.h),
    anchor: new google.maps.Point(p.cx, p.tipY),
  })
  marker.setZIndex(choisie ? 999 : promu ? 10 : 1)
}

interface MarkersProps {
  evenements: EvenementCard[]
  selectedId: string | null
  onSelectEvent: (id: string) => void
  fixedMap: boolean
  sheetY?: MotionValue<number>
  /** Le bloc punaise + vignette ne tient pas dans la place qui reste. */
  onBlocTropGrand?: () => void
}

function Markers({ evenements, selectedId, onSelectEvent, fixedMap, sheetY, onBlocTropGrand }: MarkersProps) {
  const map = useMap()
  const clustererRef = useRef<MarkerClusterer | null>(null)
  const markersRef   = useRef<google.maps.Marker[]>([])
  /** id → punaise et sa donnée : rhabiller une punaise sans chercher les autres.
   *  Un objet et non un `Map` : dans ce fichier, `Map` est le composant carte. */
  const parId = useRef<Record<string, { marker: google.maps.Marker; evt: EvenementCard }>>({})
  /** Sélection courante, lue par la création ET par l'habillage. Un état ici
   *  remettrait la sélection dans les dépendances de la création. */
  const selectionRef = useRef<string | null>(selectedId)

  const clearAll = useCallback(() => {
    clustererRef.current?.clearMarkers()
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
    parId.current = {}
  }, [])

  /**
   * Amener l'événement choisi sous les yeux — UNE fois, au moment du choix.
   *
   * Cet effet dépend aussi de `evenements`, et ce tableau change d'identité
   * bien plus souvent que la sélection (un filtre, une revalidation, une
   * recherche). Sans le garde-fou, chacun de ces changements rejouait le
   * recadrage : on poussait la carte pour regarder à côté, et elle revenait
   * se coller sur la vignette ouverte. Une vignette ouverte reste ouverte, et
   * la carte reste où l'utilisateur l'a mise.
   */
  const dernierRecadre = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedId) { dernierRecadre.current = null; return }
    if (!map || fixedMap) return
    if (dernierRecadre.current === selectedId) return
    const evt = evenements.find(e => e.id === selectedId)
    if (!evt?.lieux?.lat || !evt?.lieux?.lng) return
    dernierRecadre.current = selectedId
    const point = { lat: evt.lieux.lat, lng: evt.lieux.lng }
    // On ne vise pas la punaise mais le bloc punaise + vignette : la vignette
    // se déploie au-dessus, la centrer sur le point la ferait sortir par le
    // haut. Il faut donc attendre qu'elle existe pour la mesurer.
    return desQueVignettePrete(
      () => hauteurBlocGoogle(DECALAGE_VIGNETTE),
      bloc => {
        // Trop haut pour la place qui reste : on prévient la page, qui laisse
        // la feuille descendre. On vise quand même tout de suite — le suivi
        // garde le bloc au milieu pendant qu'elle tombe, et il s'y trouve
        // encore quand la fenêtre a fini de grandir.
        if (bloc > fenetreVisible(map.getDiv()?.clientHeight ?? 0, sheetY)) onBlocTropGrand?.()
        viserGoogle(map, point, { feuille: sheetY, bloc })
      },
    )
  }, [map, selectedId, evenements, fixedMap, sheetY, onBlocTropGrand])

  /**
   * Le cadrage automatique a DÉJÀ eu lieu ? (bureau seulement)
   *
   * Sur mobile il rejoue à chaque changement de liste, et c'est voulu : la
   * carte est petite, on veut voir ce que le filtre vient de sélectionner.
   *
   * Sur un grand écran c'est insupportable : à chaque cran de filtre la carte
   * recule puis revient, tout bouge sous les yeux. On cadre une fois, à
   * l'arrivée, puis on laisse la vue tranquille — c'est ce que fait n'importe
   * quelle carte de recherche.
   */
  const cadrageFait = useRef(false)
  /** Les bornes du dernier cadrage joué — pour ne pas le rejouer à l'identique. */
  const derniereEmpreinte = useRef<string | null>(null)

  // Auto-fit bounds selon les événements visibles (désactivé en mode carte fixe)
  useEffect(() => {
    if (!map || fixedMap) return
    const surBureau = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
    if (surBureau && cadrageFait.current) return
    const withLoc = evenements.filter(e => e.lieux?.lat && e.lieux?.lng)
    if (withLoc.length === 0) return

    // Cet effet se rejoue à chaque changement d'identité de la liste — un
    // filtre, mais aussi une revalidation qui renvoie exactement les mêmes
    // lieux. Or un cadrage ne regarde QUE les bornes : ni les titres, ni les
    // promotions, ni l'ordre. Mêmes bornes, même vue, rien à rejouer.
    const points = withLoc.map(e => ({ lat: e.lieux!.lat!, lng: e.lieux!.lng! }))
    const empreinte = empreinteBornes(bornesDe(points)!)
    if (derniereEmpreinte.current === empreinte) return

    const cadrer = () => {
      derniereEmpreinte.current = empreinte
      if (surBureau) cadrageFait.current = true

      if (points.length === 1) {
        viserGoogle(map, points[0], { feuille: sheetY, zoom: 14 })
        return
      }

      const bounds = new google.maps.LatLngBounds()
      points.forEach(p => bounds.extend(p))
      // Le bas ne vaut plus 180 en dur : il vaut ce que la feuille masque
      // vraiment, qui va de ~130 en position basse à la moitié de l'écran à
      // mi-hauteur. Le haut reste à 60 — il protège de la barre de
      // l'application, pas de la feuille.
      map.fitBounds(bounds, margesCadrage(map.getDiv()?.clientHeight ?? 0, sheetY, {
        // Meme arbitrage que le transport : voir TOUS les evenements prime
        // sur les garder au-dessus de la feuille. Les tenir dans le tiers haut
        // de l'ecran obligerait a reculer jusqu'a la region entiere — et ceux
        // qui passent sous la feuille sont justement ceux que la liste montre.
        haut: 60, cotes: 20, partFeuille: 0.5,
      }))

      poserPlancherBureau()
    }

    // La feuille est chargée à la demande : elle peut ne pas encore avoir de
    // position. Cadrer sans elle donnerait une vue calculée sur une marge de
    // 20 px, corrigée un instant plus tard — on attend qu'elle se pose.
    if (feuillePlacee(map.getDiv()?.clientHeight ?? 0, sheetY)) { cadrer(); return }
    const stop = sheetY!.on('change', () => {
      if (!feuillePlacee(map.getDiv()?.clientHeight ?? 0, sheetY)) return
      stop()
      cadrer()
    })
    return stop

    // PLANCHER DE ZOOM (bureau seulement).
    //
    // Le cadrage automatique recule jusqu'à contenir TOUS les événements
    // visibles. Avec un rayon d'affichage de 115 km et près de 300 événements,
    // il finit par montrer la carte jusqu'à Marseille : on ne voit plus le
    // village, qui est pourtant le sujet. On l'empêche de descendre sous un
    // seuil, une fois le cadrage terminé.
    //
    // Réservé au bureau : sur un écran de 430 px, le même cadrage donne une
    // vue toute différente, et le mobile ne doit pas bouger.
    function poserPlancherBureau() {
      if (!surBureau) return
      const carte = map!
      google.maps.event.addListenerOnce(carte, 'idle', () => {
        const z = carte.getZoom()
        if (typeof z === 'number' && z < ZOOM_MIN_BUREAU) {
          // On resserre ET on revient sur le village. Sans le recentrage, le
          // cadrage laisse la carte au barycentre des événements, qui tombe
          // vers Montpellier : on voit la vallée dans un coin de l'écran.
          carte.setZoom(ZOOM_MIN_BUREAU)
          carte.setCenter(GANGES)
        }
      })
    }
  }, [map, evenements, fixedMap, sheetY])

  useEffect(() => {
    if (!map) return
    clearAll()

    const withLoc = evenements.filter(e => e.lieux?.lat && e.lieux?.lng)
    const regularMarkers: google.maps.Marker[] = []

    const allNewMarkers = withLoc.map(evt => {
      const promoted = evt.promotion === 'pro' || evt.promotion === 'max'
      const marker   = new google.maps.Marker({
        position: { lat: evt.lieux!.lat!, lng: evt.lieux!.lng! },
      // `optimized` : Google dessine la punaise dans un canevas partage au lieu
      // d'en faire un element du document. A 258 punaises pour l'agenda, 1000
      // pour les commerces et 377 pour les arrets, c'est la difference entre
      // une carte qui glisse et une carte qui rame — chaque deplacement de
      // camera repositionnait autant de noeuds HTML.
      //
      // Ce que ca coute : plus de CSS ni d'animation par punaise, et le
      // chevauchement se resout au canevas. Les couches ne se melangent jamais
      // (un mode de carte a la fois), et les icones sont des SVG en URL de
      // donnees, qui passent tels quels.
        title: evt.titre,
        optimized: true,
      })
      habillerEvenement(marker, evt, evt.id === selectionRef.current)
      marker.addListener('click', () => onSelectEvent(evt.id))
      // Promoted markers bypass the clusterer so they're always individually visible
      if (promoted) {
        marker.setMap(map)
      } else {
        regularMarkers.push(marker)
      }
      parId.current[evt.id] = { marker, evt }
      return marker
    })

    markersRef.current = allNewMarkers

    if (!clustererRef.current) {
      clustererRef.current = new MarkerClusterer({ map, markers: regularMarkers, algorithm: new SuperClusterAlgorithm(CLUSTER_OPTS) })
    } else {
      clustererRef.current.addMarkers(regularMarkers)
    }
  }, [map, evenements, onSelectEvent, clearAll])

  // Changer de sélection : deux icônes, pas une couche.
  useEffect(() => {
    const avant = selectionRef.current
    if (avant === selectedId) return
    selectionRef.current = selectedId
    for (const id of [avant, selectedId]) {
      if (!id) continue
      const e = parId.current[id]
      if (e) habillerEvenement(e.marker, e.evt, id === selectedId)
    }
  }, [selectedId])

  return null
}

interface ProducerMarkersProps {
  producers: ProducerCard[]
  selectedProducerId: string | null
  onSelectProducer: (id: string | null) => void
}

function habillerProducteur(marker: google.maps.Marker, prod: ProducerCard, choisi: boolean) {
  const pp = getProducerTearParams(choisi, prod.is_max)
  marker.setIcon({
    url: producerMarkerSvg(choisi, prod.is_max),
    scaledSize: new google.maps.Size(pp.w, pp.h),
    anchor: new google.maps.Point(pp.cx, pp.tipY),
  })
  marker.setZIndex(choisi ? 999 : prod.is_max ? 10 : 1)
}

function ProducerMarkers({ producers, selectedProducerId, onSelectProducer }: ProducerMarkersProps) {
  const map = useMap()
  const markersRef = useRef<google.maps.Marker[]>([])
  const parId = useRef<Record<string, { marker: google.maps.Marker; prod: ProducerCard }>>({})
  const selectionRef = useRef<string | null>(selectedProducerId)

  useEffect(() => {
    if (!map) return
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
    parId.current = {}

    const withLoc = producers.filter(p => p.lat && p.lng)
    markersRef.current = withLoc.map(p => {
      const marker = new google.maps.Marker({
        position: { lat: p.lat!, lng: p.lng! },
        title: p.nom,
        optimized: true,   // cf. la couche des evenements
        map,
      })
      habillerProducteur(marker, p, p.id === selectionRef.current)
      // La sélection se lit dans la boîte, pas dans la fermeture : sans ça, une
      // punaise créée non choisie ne saurait jamais se déchoisir.
      marker.addListener('click', () => onSelectProducer(selectionRef.current === p.id ? null : p.id))
      parId.current[p.id] = { marker, prod: p }
      return marker
    })
    return () => { markersRef.current.forEach(m => m.setMap(null)) }
  }, [map, producers, onSelectProducer])

  useEffect(() => {
    const avant = selectionRef.current
    if (avant === selectedProducerId) return
    selectionRef.current = selectedProducerId
    for (const id of [avant, selectedProducerId]) {
      if (!id) continue
      const e = parId.current[id]
      if (e) habillerProducteur(e.marker, e.prod, id === selectedProducerId)
    }
  }, [selectedProducerId])

  return null
}

interface EtabMarkersProps {
  etablissements: EtablissementCard[]
  selectedEtabId: string | null
  onSelectEtab: (id: string | null) => void
  fixedMap: boolean
  sheetY?: MotionValue<number>
  /** Fiche déjà visée par le chemin « viser un lieu » — ne pas viser deux fois. */
  dejaVise?: string | null
}

function habillerEtablissement(marker: google.maps.Marker, etab: EtablissementCard, choisi: boolean) {
  const promu = etab.plan === 'pro' || etab.is_featured
  const h     = promu ? 47 : 36
  marker.setIcon({
    url: etabMarkerSvg(choisi, etab.type, etab.plan, etab.is_featured),
    scaledSize: new google.maps.Size(28, h),
    anchor: new google.maps.Point(14, h),
  })
  marker.setZIndex(choisi ? 999 : promu ? 10 : 1)
}

function EtablissementMarkers({ etablissements, selectedEtabId, onSelectEtab, fixedMap, sheetY, dejaVise = null }: EtabMarkersProps) {
  const map = useMap()
  const clustererRef = useRef<MarkerClusterer | null>(null)
  const markersRef   = useRef<google.maps.Marker[]>([])
  const parId = useRef<Record<string, { marker: google.maps.Marker; etab: EtablissementCard }>>({})
  const selectionRef = useRef<string | null>(selectedEtabId)

  // Pan vers l'établissement sélectionné — strictement la même mécanique que
  // les événements (cf. Markers ci-dessus) : c'est ce qui permet à la liste de
  // piloter la carte, la sélection étant désormais portée par la page.
  const dernierRecadre = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedEtabId) { dernierRecadre.current = null; return }
    if (!map || fixedMap) return
    if (dernierRecadre.current === selectedEtabId) return
    // Le 📍 de la liste vise déjà ce point, avec son zoom : le laisser faire.
    if (dejaVise === selectedEtabId) { dernierRecadre.current = selectedEtabId; return }
    const etab = etablissements.find(e => e.id === selectedEtabId)
    if (!etab?.lat || !etab?.lng) return
    dernierRecadre.current = selectedEtabId
    const point   = { lat: etab.lat, lng: etab.lng }
    const promoted = etab.plan === 'pro' || etab.is_featured
    return desQueVignettePrete(
      () => hauteurBlocGoogle(promoted ? DECALAGE_VIGNETTE_PROMU : DECALAGE_VIGNETTE),
      bloc => viserGoogle(map, point, { feuille: sheetY, bloc }),
    )
  }, [map, selectedEtabId, etablissements, fixedMap, sheetY, dejaVise])

  useEffect(() => {
    if (!map) return

    clustererRef.current?.clearMarkers()
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
    parId.current = {}

    const withLoc = etablissements.filter(e => e.lat && e.lng)
    const regularMarkers: google.maps.Marker[] = []

    const newMarkers = withLoc.map(e => {
      const promoted = e.plan === 'pro' || e.is_featured
      const marker = new google.maps.Marker({
        position: { lat: e.lat!, lng: e.lng! },
        title: e.nom,
        optimized: true,   // cf. la couche des evenements
      })
      habillerEtablissement(marker, e, e.id === selectionRef.current)
      // Cf. producteurs : la sélection se lit dans la boîte, pas dans la fermeture.
      marker.addListener('click', () => onSelectEtab(selectionRef.current === e.id ? null : e.id))
      if (promoted) {
        marker.setMap(map)
      } else {
        regularMarkers.push(marker)
      }
      parId.current[e.id] = { marker, etab: e }
      return marker
    })
    markersRef.current = newMarkers

    if (!clustererRef.current) {
      clustererRef.current = new MarkerClusterer({ map, markers: regularMarkers, algorithm: new SuperClusterAlgorithm(CLUSTER_OPTS) })
    } else {
      clustererRef.current.addMarkers(regularMarkers)
    }

    return () => {
      clustererRef.current?.clearMarkers()
      markersRef.current.forEach(m => m.setMap(null))
    }
  }, [map, etablissements, onSelectEtab])

  useEffect(() => {
    const avant = selectionRef.current
    if (avant === selectedEtabId) return
    selectionRef.current = selectedEtabId
    for (const id of [avant, selectedEtabId]) {
      if (!id) continue
      const e = parId.current[id]
      if (e) habillerEtablissement(e.marker, e.etab, id === selectedEtabId)
    }
  }, [selectedEtabId])

  return null
}

interface Props {
  evenements: EvenementCard[]
  selectedId: string | null
  onSelectEvent: (id: string) => void
  onDeselect: () => void
  onOpenEvent: (id: string) => void
  /** Rejouer une vue enregistrée — centre de div, tel quel. */
  restaurerVue?: { lat: number; lng: number; zoom?: number } | null
  /** Amener un lieu au milieu de ce qui n'est pas masqué. */
  viserLieu?: { lat: number; lng: number; zoom?: number; cle?: string; avecVignette?: boolean } | null
  /**
   * La vignette ouverte ne tient pas dans la place qui reste sous la barre du
   * haut. Seul cas où la carte demande à la feuille de s'écarter.
   */
  onBlocTropGrand?: () => void
  /**
   * Position du haut de la feuille (mobile) — la carte s'y accroche pour
   * garder son centre au milieu de la fenêtre qui lui reste. Cf.
   * `useSuiviFeuille`.
   */
  sheetY?: MotionValue<number>
  /**
   * Vrai tant qu'un doigt déplace la carte : le suivi de feuille se tait, sinon
   * la compensation de la chute annule le geste. Cf. `useSuiviFeuille`.
   */
  panEnCoursRef?: React.MutableRefObject<boolean>
  onMapDragStart?: () => void
  onMapDragEnd?: () => void
  onCameraIdle?: (lat: number, lng: number, zoom: number) => void
  producers?: ProducerCard[]
  selectedProducerId?: string | null
  onSelectProducer?: (id: string | null) => void
  onOpenProducer?: (id: string) => void
  etablissements?: EtablissementCard[]
  // Sélection établissement CONTRÔLÉE par la page (comme selectedId pour les
  // événements et selectedProducerId pour les producteurs). Elle vivait avant
  // en state interne ici : la liste ne pouvait donc pas la piloter, la carte ne
  // se recentrait pas, et tout était oublié au retour d'une fiche.
  // Les deux props restent optionnelles → si la page ne les fournit pas, le
  // composant retombe sur son state interne et se comporte comme avant.
  selectedEtabId?: string | null
  onSelectEtab?: (id: string | null) => void
  onOpenEtablissement?: (id: string) => void
  /** Mode transport : la ligne à dessiner, ou null si on n'y est pas. */
  transport?: {
    arrets: ArretTransport[]
    traces: TraceTransport[]
    lignes: LigneTransport[]
    couleur: string
    troncon: [number, number][] | null
    arretDepart: string | null
    arretArrivee: string | null
    discret: boolean
  } | null
}

export default function MapView({ evenements, selectedId, onSelectEvent, onDeselect, onOpenEvent, restaurerVue, viserLieu, onBlocTropGrand, onMapDragStart, onMapDragEnd, onCameraIdle, sheetY, panEnCoursRef, producers = [], selectedProducerId = null, onSelectProducer, onOpenProducer, etablissements = [], selectedEtabId: selectedEtabIdProp, onSelectEtab, onOpenEtablissement, transport = null }: Props) {
  const [internalEtabId, setInternalEtabId] = useState<string | null>(null)
  const selectedEtabId    = selectedEtabIdProp !== undefined ? selectedEtabIdProp : internalEtabId
  const setSelectedEtabId = onSelectEtab ?? setInternalEtabId
  const selectedEvent    = selectedId ? evenements.find(e => e.id === selectedId) : null
  const selectedProducer = selectedProducerId ? producers.find(p => p.id === selectedProducerId) : null
  const selectedEtab     = selectedEtabId ? etablissements.find(e => e.id === selectedEtabId) : null
  const selectedCat   = selectedEvent
    ? (CATEGORIES[selectedEvent.categorie] ?? CATEGORIES.autre)
    : null
  const { mapStyle, fixedMap, sheetBg } = useTheme()

  // Supprime le chrome natif (header + bouton X) de l'InfoWindow Google Maps
  useEffect(() => {
    if (document.querySelector('[data-pdv-iw]')) return
    const s = document.createElement('style')
    s.setAttribute('data-pdv-iw', '1')
    s.textContent = `
      .gm-style-iw-chr { display: none !important; }
      .gm-style-iw-c   { padding: 0 !important; border-radius: 14px !important; overflow: visible !important; box-shadow: 0 4px 20px rgba(0,0,0,0.18) !important; }
      .gm-style-iw-d   { overflow: visible !important; max-height: unset !important; }
    `
    document.head.appendChild(s)
    return () => s.remove()
  }, [])

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!}>
      <Map
        defaultCenter={GANGES}
        defaultZoom={12}
        style={{ width: '100%', height: '100%' }}
        gestureHandling="greedy"
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        zoomControl={false}
        clickableIcons={false}
        /* Taper le fond referme la vignette ouverte — le geste attendu partout
           ailleurs. Un clic sur une punaise ne passe pas par ici (le marqueur
           consomme l'événement), la sélection ne peut donc pas s'annuler
           elle-même. */
        onClick={() => {
          onDeselect()
          setSelectedEtabId(null)
          onSelectProducer?.(null)
        }}
        styles={mapStyle.styles.length > 0 ? mapStyle.styles : WARM_STYLE}
      >
        <MapDragListener onDragStart={onMapDragStart} onDragEnd={onMapDragEnd} onCameraIdle={onCameraIdle} />
        <SuiviFeuille sheetY={sheetY} panEnCoursRef={panEnCoursRef} />
        <Cadrage restaurerVue={restaurerVue} viserLieu={viserLieu} sheetY={sheetY} />
        <Markers
          evenements={evenements}
          selectedId={selectedId}
          onSelectEvent={onSelectEvent}
          fixedMap={fixedMap}
          sheetY={sheetY}
          onBlocTropGrand={onBlocTropGrand}
        />
        <ProducerMarkers
          producers={producers}
          selectedProducerId={selectedProducerId}
          onSelectProducer={onSelectProducer ?? (() => {})}
        />
        <EtablissementMarkers
          etablissements={etablissements}
          selectedEtabId={selectedEtabId}
          onSelectEtab={setSelectedEtabId}
          fixedMap={fixedMap}
          sheetY={sheetY}
          dejaVise={viserLieu?.cle ?? null}
        />

        {transport && <MapTransportLayer {...transport} sheetY={sheetY} />}
        {/* Vignette établissement sélectionné */}
        {selectedEtab && selectedEtab.lat && selectedEtab.lng && (() => {
          const typeInfo = ETAB_TYPES[selectedEtab.type]
          const photo    = selectedEtab.photos?.[0]
          const promoted = selectedEtab.plan === 'pro' || selectedEtab.is_featured
          return (
            <InfoWindow
              position={{ lat: selectedEtab.lat, lng: selectedEtab.lng }}
              onCloseClick={() => setSelectedEtabId(null)}
              pixelOffset={[0, promoted ? -DECALAGE_VIGNETTE_PROMU : -DECALAGE_VIGNETTE]}
              /* Google recadre la carte sur sa vignette à chaque ouverture —
                 et elle se rouvre à chaque rendu. Résultat : le moindre
                 déplacement de carte était suivi d'un retour à la vignette. */
              disableAutoPan
            >
              <div style={{ position: 'relative', width: 210, overflow: 'visible', fontFamily: 'var(--font-body), sans-serif' }}>
                <button onClick={() => setSelectedEtabId(null)}
                  style={{ position: 'absolute', top: -10, right: -10, zIndex: 10, width: 22, height: 22, borderRadius: '50%', backgroundColor: '#fff', border: '1.5px solid #ddd', boxShadow: '0 1px 5px rgba(0,0,0,0.22)', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, padding: 0 }}>✕</button>
                {/* On garde la sélection en ouvrant la fiche — comme pour les
                    événements : au retour, la vignette est encore ouverte au
                    bon endroit. L'effacer ici obligeait à retrouver le point. */}
                <div onClick={() => onOpenEtablissement?.(selectedEtab.id)}
                  style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', border: `2.5px solid ${sheetBg.bg}`, cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.18)' }}>
                  {/* Image */}
                  <div style={{ width: '100%', height: 95, position: 'relative', backgroundColor: typeInfo?.bg ?? '#F5F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {photo
                      ? <img src={photo} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 36 }}>{typeInfo?.emoji ?? '🏪'}</span>
                    }
                  </div>
                  {/* Contenu */}
                  <div style={{ padding: '8px 10px 10px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 800, color: '#fff', backgroundColor: typeInfo?.color ?? '#555', borderRadius: 999, padding: '2px 7px', marginBottom: 4 }}>
                      {typeInfo?.emoji} {typeInfo?.label ?? selectedEtab.type}
                    </span>
                    {promoted && <span style={{ marginLeft: 4, fontSize: 9, color: '#EC407A', fontWeight: 800 }}>✦</span>}
                    <p style={{ fontWeight: 700, fontSize: 13, color: '#1A1209', margin: '0 0 2px', lineHeight: 1.3 }}>{selectedEtab.nom}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      {selectedEtab.commune && <span style={{ fontSize: 11, color: '#6B5E4E' }}>📍 {selectedEtab.commune}</span>}
                      {selectedEtab.note_google && <span style={{ fontSize: 11, color: '#92400E', fontWeight: 700 }}>⭐ {selectedEtab.note_google.toFixed(1)}</span>}
                    </div>
                    <button style={{ display: 'block', width: '100%', textAlign: 'center', padding: '7px', borderRadius: 8, backgroundColor: '#2D5A3D', color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                      Voir la fiche →
                    </button>
                  </div>
                </div>
              </div>
            </InfoWindow>
          )
        })()}

        {/* InfoWindow producteur sélectionné */}
        {selectedProducer && selectedProducer.lat && selectedProducer.lng && (
          <InfoWindow
            position={{ lat: selectedProducer.lat, lng: selectedProducer.lng }}
            onCloseClick={() => onSelectProducer?.(null)}
            pixelOffset={[0, -38]}
            disableAutoPan
          >
            <div style={{ position: 'relative', width: 200, overflow: 'visible', fontFamily: 'var(--font-body), sans-serif' }}>
              <button onClick={() => onSelectProducer?.(null)}
                style={{ position: 'absolute', top: -10, right: -10, zIndex: 10, width: 22, height: 22, borderRadius: '50%', backgroundColor: '#fff', border: '1.5px solid #ddd', boxShadow: '0 1px 5px rgba(0,0,0,0.22)', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, padding: 0 }}>✕</button>
              <div style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' }}>
                {selectedProducer.photo_url && (
                  <img src={selectedProducer.photo_url} alt="" style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
                )}
                <div style={{ padding: '8px 10px 10px' }}>
                  {selectedProducer.is_max && <span style={{ fontSize: 9, backgroundColor: '#E8622A', color: '#fff', borderRadius: 999, padding: '1px 6px', fontWeight: 800, marginBottom: 4, display: 'inline-block' }}>MAX</span>}
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#1A1209', margin: '0 0 2px', lineHeight: 1.3 }}>{selectedProducer.nom}</p>
                  {selectedProducer.commune && <p style={{ fontSize: 11, color: '#6B5E4E', margin: '0 0 6px' }}>📍 {selectedProducer.commune}</p>}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    {selectedProducer.produit_categories.slice(0, 3).map(c => (
                      <span key={c} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, backgroundColor: '#E8F2EB', color: '#2D5A3D', fontWeight: 700 }}>{c}</span>
                    ))}
                  </div>
                  <button onClick={() => onOpenProducer?.(selectedProducer.id)} style={{ display: 'block', width: '100%', textAlign: 'center', padding: '7px', borderRadius: 8, backgroundColor: '#2D5A3D', color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                    Voir la fiche →
                  </button>
                </div>
              </div>
            </div>
          </InfoWindow>
        )}

        {/* Popup InfoWindow sur l'événement sélectionné */}
        {selectedEvent && selectedEvent.lieux?.lat && selectedEvent.lieux?.lng && (
          <InfoWindow
            position={{ lat: selectedEvent.lieux.lat, lng: selectedEvent.lieux.lng }}
            onCloseClick={onDeselect}
            pixelOffset={[0, -DECALAGE_VIGNETTE]}
            disableAutoPan
          >
            {/* Wrapper overflow:visible pour que le bouton fermer dépasse de la carte */}
            <div style={{ position: 'relative', width: 220, overflow: 'visible' }}>

              {/* Bouton fermer rond flottant hors de la carte */}
              <button
                onClick={e => { e.stopPropagation(); onDeselect() }}
                style={{
                  position: 'absolute', top: -10, right: -10, zIndex: 10,
                  width: 22, height: 22, borderRadius: '50%',
                  backgroundColor: '#fff', border: '1.5px solid #ddd',
                  boxShadow: '0 1px 5px rgba(0,0,0,0.22)',
                  cursor: 'pointer', color: '#666',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, padding: 0, lineHeight: 1,
                }}
              >✕</button>

              {/* Carte cliquable */}
              <div
                onClick={() => onOpenEvent(selectedEvent.id)}
                style={{
                  fontFamily: 'var(--font-body), sans-serif',
                  borderRadius: 12, overflow: 'hidden',
                  fontSize: 13, cursor: 'pointer',
                  backgroundColor: '#fff',
                  border: `2.5px solid ${sheetBg.bg}`,
                }}
              >
                {selectedEvent.image_url && (
                  <img
                    src={selectedEvent.image_url}
                    alt={selectedEvent.titre}
                    loading="lazy"
                    style={{ width: '100%', height: 100, objectFit: 'cover', objectPosition: selectedEvent.image_position ?? '50% 50%', display: 'block' }}
                  />
                )}
                <div style={{ padding: '8px 10px 10px', backgroundColor: '#fff' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 10, fontWeight: 700,
                    backgroundColor: selectedCat!.color, color: '#fff',
                    borderRadius: 999, padding: '2px 8px', marginBottom: 5,
                  }}>
                    {selectedCat!.emoji} {selectedCat!.label}
                  </span>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#2C2C2C', lineHeight: 1.3, marginBottom: 4 }}>
                    {selectedEvent.titre}
                  </p>
                  {selectedEvent.date_debut && (
                    <p style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>
                      {formatEventDate(selectedEvent.date_debut, selectedEvent.date_fin)}
                      {selectedEvent.heure && !selectedEvent.date_fin && ` · ${selectedEvent.heure.slice(0, 5)}`}
                    </p>
                  )}
                  {selectedEvent.lieux && (
                    <p style={{ fontSize: 11, color: '#8A8A8A', marginTop: 2 }}>
                      📍 {selectedEvent.lieux.nom}
                      {selectedEvent.lieux.commune ? `, ${selectedEvent.lieux.commune}` : ''}
                    </p>
                  )}
                </div>
              </div>

            </div>
          </InfoWindow>
        )}
      </Map>
    </APIProvider>
  )
}
