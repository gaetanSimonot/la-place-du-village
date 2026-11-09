'use client'
import { useCallback, useRef, useState } from 'react'
import MapGL, { Source, Layer, Marker, type MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Couche } from '@/lib/meteo/contours'
import type { ZoneMeteo } from '@/lib/meteo/zone'
import type { Point } from '@/lib/meteo/lecture'
import type { ImageCarte } from '@/lib/meteo/vueEnsemble'

/**
 * La carte : un fond clair et sobre (OpenFreeMap « positron », recoloré en
 * crème et vert pâle) pour que la pluie et les nuages ressortent.
 * Les formes sont posées SOUS les noms de lieux, qui restent lisibles.
 */

const STYLE = 'https://tiles.openfreemap.org/styles/positron'

/** Bleus du clair au foncé, terracotta pour l'orage. */
export const COULEURS_PLUIE = ['#9CC7EA', '#4C8FCF', '#1F5296']
export const COULEUR_ORAGE = '#C84B2F'

const VIDE: Couche = { type: 'FeatureCollection', features: [] }

function recolorer(m: MapLibreMap) {
  for (const l of m.getStyle().layers ?? []) {
    const id = l.id.toLowerCase()
    try {
      if (l.type === 'background') m.setPaintProperty(l.id, 'background-color', '#FDFAF5')
      else if (l.type === 'fill' && id.includes('water')) m.setPaintProperty(l.id, 'fill-color', '#C6DCE6')
      else if (l.type === 'fill' && /park|wood|forest|grass|landcover|landuse/.test(id)) m.setPaintProperty(l.id, 'fill-color', '#E6EEDD')
      else if (l.type === 'line' && id.includes('water')) m.setPaintProperty(l.id, 'line-color', '#C9DAD6')
      // Les noms de villages et de bourgs : plus foncés, plus grands, et
      // dès le zoom 8 — ils doivent se lire par-dessus la pluie.
      else if (l.type === 'symbol' && /^label_(village|town|other|city)/.test(id)) {
        m.setPaintProperty(l.id, 'text-color', '#2E261E')
        m.setPaintProperty(l.id, 'text-halo-color', 'rgba(253,250,245,0.92)')
        m.setPaintProperty(l.id, 'text-halo-width', 1.6)
        if (id === 'label_village') {
          m.setLayerZoomRange(l.id, 8, 24)
          m.setLayoutProperty(l.id, 'text-size', ['interpolate', ['linear'], ['zoom'], 8, 11, 11, 14, 14, 16])
        }
        if (id === 'label_town') m.setLayoutProperty(l.id, 'text-size', ['interpolate', ['linear'], ['zoom'], 7, 13, 11, 16, 14, 18])
      }
    } catch { /* couche sans cette propriété */ }
  }
}

/** En dessous, la vue d'ensemble dessine seule ; au-dessus, les contours au km. */
const ZOOM_RAPPROCHE = 8.5

/**
 * À l'ouverture : de loin, assez pour reconnaître la France, le centre
 * remonté vers le nord pour que les Cévennes tombent dans la partie visible
 * au-dessus du panneau.
 */
const VUE_DEPART = { longitude: 2.4, latitude: 46.1, zoom: 5.2 }

export default function CarteMeteo({ zone, pluie, orage, point, nomPoint, basCarte, large, onSortieZone, onEchelle, onToucher }: {
  /** La vue d'ensemble de l'heure affichée. */
  large?: ImageCarte | null
  /** Appelé quand la vue déborde de la zone fine : il faut la vue d'ensemble. */
  onSortieZone?: () => void
  /** Vrai en vue rapprochée (contours au kilomètre), faux de loin. */
  onEchelle?: (rapproche: boolean) => void
  /** Un appui sur la carte : le point, et le nom du village affiché le plus proche. */
  onToucher?: (p: Point, nom: string | null) => void
  /** Le nom écrit à côté du point (« Ganges », « Chez vous »). */
  nomPoint?: string
  zone: ZoneMeteo
  pluie: Couche | null
  orage: Couche | null
  point: Point
  /** Hauteur masquée par le panneau en bas : le cadrage en tient compte. */
  basCarte: number
}) {
  const ref = useRef<MapRef>(null)
  const [avant, setAvant] = useState<string | undefined>(undefined)
  const [pret, setPret] = useState(false)

  const sud = zone.lat0 - (zone.lignes - 1) * zone.pas
  const est = zone.lon0 + (zone.colonnes - 1) * zone.pas

  const auChargement = useCallback(() => {
    const m = ref.current?.getMap()
    if (!m) return
    recolorer(m)
    // Les formes se glissent sous le premier calque de texte.
    const texte = (m.getStyle().layers ?? []).find(l => l.type === 'symbol')
    setAvant(texte?.id)
    setPret(true)
    // Ouverture de loin : la page doit le savoir tout de suite.
    onEchelle?.(m.getZoom() >= ZOOM_RAPPROCHE)
    if (m.getZoom() < ZOOM_RAPPROCHE) onSortieZone?.()
  }, [onEchelle, onSortieZone])

  const zoom = (d: number) => ref.current?.getMap().easeTo({ zoom: (ref.current?.getMap().getZoom() ?? 9) + d, duration: 250 })

  return (
    <div className="relative h-full w-full">
      <MapGL
        ref={ref}
        mapStyle={STYLE}
        initialViewState={{ ...VUE_DEPART, padding: { top: 0, bottom: basCarte, left: 0, right: 0 } }}
        // Dézoom libre jusqu'à la France entière. Au-delà de la zone fine,
        // c'est la vue d'ensemble qui montre le ciel (cf. vueEnsemble.ts).
        maxBounds={[[-12, 36], [18, 56]]}
        minZoom={4.5}
        // Toucher la carte : la météo de ce point, nommée d'après le village
        // affiché le plus proche (rien à demander à un service extérieur).
        onClick={e => {
          if (!onToucher) return
          const m = e.target
          const { x, y } = e.point
          const proches = m.queryRenderedFeatures([[x - 50, y - 50], [x + 50, y + 50]])
            .filter(f => f.layer.type === 'symbol' && /^label_(village|town|city|other)/.test(f.layer.id) && f.properties?.name)
          let nom: string | null = null, mieux = Infinity
          for (const f of proches) {
            if (f.geometry.type !== 'Point') continue
            const p = m.project(f.geometry.coordinates as [number, number])
            const d = Math.hypot(p.x - x, p.y - y)
            if (d < mieux) { mieux = d; nom = String(f.properties.name) }
          }
          onToucher({ lat: e.lngLat.lat, lng: e.lngLat.lng }, nom)
        }}
        onMoveEnd={e => {
          onEchelle?.(e.target.getZoom() >= ZOOM_RAPPROCHE)
          if (!onSortieZone) return
          const b = e.target.getBounds()
          if (b.getWest() < zone.lon0 || b.getEast() > est || b.getNorth() > zone.lat0 || b.getSouth() < sud) onSortieZone()
        }}
        maxZoom={14}
        dragRotate={false}
        touchPitch={false}
        attributionControl={{ compact: true }}
        onLoad={auChargement}
        style={{ width: '100%', height: '100%' }}
      >
        {pret && (
          <>
            {/* La vue d'ensemble, sous les contours de la zone fine. */}
            {large && (
              <Source id="ensemble" type="image" url={large.url} coordinates={large.coins}>
                <Layer id="ensemble-image" type="raster" beforeId={avant} paint={{ 'raster-resampling': 'linear', 'raster-fade-duration': 0 }} />
              </Source>
            )}
            {/* La pluie seule : la carte ne montre pas les nuages (demande du
                09/11) — ils restent dans la tuile de l'heure. */}
            <Source id="pluie" type="geojson" data={pluie ?? VIDE}>
              <Layer id="pluie-fond" type="fill" beforeId={avant}
                paint={{ 'fill-color': ['match', ['get', 'niveau'], 0, COULEURS_PLUIE[0], 1, COULEURS_PLUIE[1], COULEURS_PLUIE[2]], 'fill-opacity': 0.78 }} />
              <Layer id="pluie-bord" type="line" beforeId={avant}
                paint={{ 'line-color': '#1F5296', 'line-opacity': 0.35, 'line-width': 0.8 }} />
            </Source>
            <Source id="orage" type="geojson" data={orage ?? VIDE}>
              <Layer id="orage-fond" type="fill" beforeId={avant} paint={{ 'fill-color': COULEUR_ORAGE, 'fill-opacity': 0.82 }} />
              <Layer id="orage-bord" type="line" beforeId={avant} paint={{ 'line-color': '#8E2F1B', 'line-width': 1 }} />
            </Source>
          </>
        )}
        <Marker longitude={point.lng} latitude={point.lat} anchor="left" offset={[-7, 0]}>
          <span className="flex items-center gap-1.5" aria-hidden>
            <span style={{ display: 'block', width: 14, height: 14, borderRadius: 999, background: '#2D5A3D', border: '3px solid #FFFFFF', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }} />
            {nomPoint && (
              <span className="rounded-full bg-white px-2 py-0.5 text-[13px] font-extrabold text-[#2D5A3D]" style={{ boxShadow: '0 1px 4px rgba(44,28,16,.18)' }}>
                {nomPoint}
              </span>
            )}
          </span>
        </Marker>
      </MapGL>

      {/* Zoom : deux boutons de 44 px, à droite. */}
      <div className="absolute right-3 flex flex-col overflow-hidden rounded-[14px] bg-white" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 68px)', boxShadow: '0 2px 10px rgba(44,28,16,.12)' }}>
        <button type="button" onClick={() => zoom(1)} aria-label="Zoomer" className="flex h-11 w-11 items-center justify-center border-none bg-transparent text-[#2D5A3D]">
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <span className="h-px bg-[#EDE8E0]" />
        <button type="button" onClick={() => zoom(-1)} aria-label="Dézoomer" className="flex h-11 w-11 items-center justify-center border-none bg-transparent text-[#2D5A3D]">
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M5 12h14" /></svg>
        </button>
      </div>
    </div>
  )
}
