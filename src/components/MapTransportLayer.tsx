'use client'

import { useEffect, useRef, useState } from 'react'
import { useMap, InfoWindow } from '@vis.gl/react-google-maps'

/**
 * Le calque « Transport » de la carte : les lignes de car et leurs arrets.
 *
 * LA CARTE NE PILOTE PAS LA RECHERCHE. On y LIT, on n'y choisit pas : cliquer
 * un arret donne son nom, cliquer une ligne donne son numero. Le depart et
 * l'arrivee se designent dans le panneau, par les pastilles.
 *
 * C'est un choix, pas un oubli : un clic sur la carte produisait une selection
 * dont on ne savait plus comment revenir — il court-circuitait la navigation
 * du panneau au lieu de la suivre.
 *
 * Une polyligne par ligne et par sens, un point par arret. Pas de
 * regroupement : des arrets alignes le long d'une route ne s'amassent pas
 * comme 1400 commerces, et les regrouper cacherait ce qu'on vient voir.
 */

export interface ArretTransport { stop_id: string; nom: string; lat: number; lng: number }

export interface TraceTransport {
  sens: number
  points: [number, number][]
  /** Chaque ligne a sa couleur officielle liO — la 608 est orange, la 101
   *  bleu clair. Dix lignes d'une seule teinte seraient illisibles. */
  route_id?: string
  couleur?: string
}

export interface LigneTransport {
  route_id: string
  nom_court: string | null
  nom_long: string | null
  couleur: string | null
}

export interface TransportProps {
  arrets: ArretTransport[]
  traces: TraceTransport[]
  lignes: LigneTransport[]
  couleur: string
  /** Le trajet choisi, surligne par-dessus les lignes. */
  troncon: [number, number][] | null
  /** Les deux arrets retenus dans le panneau. */
  arretDepart: string | null
  arretArrivee: string | null
  /**
   * Tant qu'aucune ville n'est saisie, les arrets s'effacent : 377 pastilles
   * blanches par-dessus dix lignes, ce n'est plus une carte. On voit les
   * LIGNES ; les arrets ne sont qu'une trame, cliquables si on veut leur nom.
   */
  discret: boolean
}

/**
 * Le repere d'un arret. Quatre etats, lisibles sans legende :
 *   — DEPART   : disque plein, cercle d'un anneau ;
 *   — ARRIVEE  : disque creux, cercle ;
 *   — arret d'une ville retenue : point net ;
 *   — arret du reseau au repos  : point minuscule, presque une trame.
 * Plein pour le depart, creux pour l'arrivee : c'est la convention des plans
 * de transport, on la lit sans y penser.
 */
function pastilleArret(role: 'depart' | 'arrivee' | null, couleur: string, discret: boolean): string {
  const T = 34
  const c = T / 2
  let corps: string
  if (role === 'depart') {
    corps = `<circle cx="${c}" cy="${c}" r="12" fill="none" stroke="${couleur}" stroke-width="2.5" opacity="0.45"/>`
          + `<circle cx="${c}" cy="${c}" r="8" fill="${couleur}" stroke="#fff" stroke-width="3"/>`
  } else if (role === 'arrivee') {
    corps = `<circle cx="${c}" cy="${c}" r="12" fill="none" stroke="${couleur}" stroke-width="2.5" opacity="0.45"/>`
          + `<circle cx="${c}" cy="${c}" r="8" fill="#fff" stroke="${couleur}" stroke-width="4"/>`
  } else if (discret) {
    corps = `<circle cx="${c}" cy="${c}" r="3.4" fill="#fff" opacity="0.8"/>`
          + `<circle cx="${c}" cy="${c}" r="2" fill="${couleur}" opacity="0.7"/>`
  } else {
    corps = `<circle cx="${c}" cy="${c}" r="7" fill="#fff" opacity="0.95"/>`
          + `<circle cx="${c}" cy="${c}" r="5" fill="${couleur}" stroke="#fff" stroke-width="1.8"/>`
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}" viewBox="0 0 ${T} ${T}">${corps}</svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

/** « GANGES - MAIRIE » → { ville: 'Ganges', lieu: 'Mairie' }. */
function decouperNom(nom: string): { ville: string; lieu: string } {
  const joli = (t: string) =>
    t.toLowerCase().replace(/(^|[\s'’-])([a-zà-ÿ])/g, (_, s, c) => s + c.toUpperCase())
  const bouts = nom.split(' - ')
  return {
    ville: joli(bouts[0] ?? nom),
    lieu: bouts.length > 1 ? joli(bouts.slice(1).join(' - ')) : '',
  }
}

type Info =
  | { genre: 'arret'; position: google.maps.LatLngLiteral; nom: string }
  | { genre: 'ligne'; position: google.maps.LatLngLiteral; route_id: string }

export default function MapTransportLayer({
  arrets, traces, lignes, couleur, troncon, arretDepart, arretArrivee, discret,
}: TransportProps) {
  const map = useMap()
  const lignesRef = useRef<google.maps.Polyline[]>([])
  const tronconRef = useRef<google.maps.Polyline | null>(null)
  const arretsRef = useRef<google.maps.Marker[]>([])
  /** Ce qu'on LIT sur la carte — jamais ce qu'on y choisit. */
  const [info, setInfo] = useState<Info | null>(null)

  // Les lignes.
  useEffect(() => {
    if (!map) return
    lignesRef.current.forEach(l => l.setMap(null))
    lignesRef.current = traces.map(t => {
      const l = new google.maps.Polyline({
        // Le GTFS range ses points en [longitude, latitude] ; Google attend
        // l'inverse. Les intervertir dessine la ligne au milieu de l'ocean.
        path: t.points.map(([lng, lat]) => ({ lat, lng })),
        strokeColor: t.couleur ?? couleur,
        // Les lignes palissent des qu'un trajet est surligne : sans ca, les
        // traits se confondent et on ne voit pas ce qu'on a choisi.
        strokeOpacity: troncon ? 0.16 : 0.8,
        strokeWeight: 4.5,
        zIndex: 1,
        map,
      })
      const id = t.route_id
      if (id) {
        l.addListener('click', (e: google.maps.PolyMouseEvent) => {
          if (!e.latLng) return
          setInfo({ genre: 'ligne', position: e.latLng.toJSON(), route_id: id })
        })
      }
      return l
    })
    return () => { lignesRef.current.forEach(l => l.setMap(null)) }
  }, [map, traces, couleur, troncon])

  /**
   * Au premier affichage du reseau, on cadre dessus.
   *
   * Sans ca, on entre dans le mode Transport et on tombe la ou la carte etait
   * restee — vu en test : Mauguio, au bord de la mer, a cinquante kilometres
   * de la premiere ligne. Une seule fois : ensuite l'utilisateur navigue, et
   * lui reprendre la main a chaque rendu serait insupportable.
   */
  const cadreFait = useRef(false)
  useEffect(() => {
    if (!map || cadreFait.current || troncon) return
    const points = traces.flatMap(t => t.points)
    if (points.length < 2) return
    cadreFait.current = true
    const bornes = new google.maps.LatLngBounds()
    for (const [lng, lat] of points) bornes.extend({ lat, lng })
    map.fitBounds(bornes, 40)
  }, [map, traces, troncon])

  // Le trajet choisi, par-dessus.
  useEffect(() => {
    if (!map) return
    tronconRef.current?.setMap(null)
    tronconRef.current = null
    if (!troncon || troncon.length < 2) return
    const chemin = troncon.map(([lng, lat]) => ({ lat, lng }))
    tronconRef.current = new google.maps.Polyline({
      path: chemin, strokeColor: couleur, strokeOpacity: 1, strokeWeight: 7, zIndex: 3, map,
    })
    // On cadre sur le trajet : chercher soi-meme son bout de ligne dans la
    // vallee entiere serait absurde.
    const bornes = new google.maps.LatLngBounds()
    chemin.forEach(p => bornes.extend(p))
    map.fitBounds(bornes, 60)
    return () => { tronconRef.current?.setMap(null) }
  }, [map, troncon, couleur])

  // Les arrets.
  useEffect(() => {
    if (!map) return
    arretsRef.current.forEach(m => m.setMap(null))
    arretsRef.current = arrets.map(a => {
      const role: 'depart' | 'arrivee' | null =
        a.stop_id === arretDepart ? 'depart' : a.stop_id === arretArrivee ? 'arrivee' : null
      const m = new google.maps.Marker({
        position: { lat: a.lat, lng: a.lng },
        title: a.nom,
        optimized: false,
        icon: {
          url: pastilleArret(role, couleur, discret && !role),
          scaledSize: new google.maps.Size(34, 34),
          anchor: new google.maps.Point(17, 17),
        },
        zIndex: role ? 999 : 5,
        map,
      })
      // Lire, pas choisir : le clic donne le nom de l'arret, rien de plus.
      m.addListener('click', () =>
        setInfo({ genre: 'arret', position: { lat: a.lat, lng: a.lng }, nom: a.nom }))
      return m
    })
    return () => { arretsRef.current.forEach(m => m.setMap(null)) }
  }, [map, arrets, arretDepart, arretArrivee, couleur, discret])

  if (!info) return null

  const ligne = info.genre === 'ligne' ? lignes.find(l => l.route_id === info.route_id) : null
  const nom = info.genre === 'arret' ? decouperNom(info.nom) : null

  return (
    <InfoWindow position={info.position} pixelOffset={[0, -12]} onCloseClick={() => setInfo(null)}>
      <div style={{ padding: '2px 4px 4px', fontFamily: 'var(--font-body), sans-serif', maxWidth: 230 }}>
        {ligne && (
          <>
            <span style={{
              display: 'inline-block', fontSize: 11, fontWeight: 800, color: '#fff',
              background: ligne.couleur ?? couleur, borderRadius: 6, padding: '2px 7px', marginBottom: 5,
            }}>
              {ligne.nom_court ?? ligne.route_id}
            </span>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1A1209', lineHeight: 1.3 }}>
              {ligne.nom_long ?? ''}
            </p>
          </>
        )}
        {nom && (
          <>
            <span style={{
              display: 'block', fontSize: 9.5, fontWeight: 800, letterSpacing: '.11em',
              textTransform: 'uppercase', color: couleur, marginBottom: 2,
            }}>
              {nom.ville}
            </span>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: '#1A1209', lineHeight: 1.3 }}>
              {nom.lieu || nom.ville}
            </p>
          </>
        )}
      </div>
    </InfoWindow>
  )
}
