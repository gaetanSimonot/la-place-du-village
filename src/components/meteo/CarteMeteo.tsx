'use client'
import { useCallback, useRef, useState } from 'react'
import MapGL, { Source, Layer, Marker, type MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Couche } from '@/lib/meteo/contours'
import type { ZoneMeteo } from '@/lib/meteo/zone'
import type { Point } from '@/lib/meteo/lecture'

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
      else if (l.type === 'fill' && id.includes('water')) m.setPaintProperty(l.id, 'fill-color', '#DCE7E4')
      else if (l.type === 'fill' && /park|wood|forest|grass|landcover|landuse/.test(id)) m.setPaintProperty(l.id, 'fill-color', '#E6EEDD')
      else if (l.type === 'line' && id.includes('water')) m.setPaintProperty(l.id, 'line-color', '#C9DAD6')
    } catch { /* couche sans cette propriété */ }
  }
}

export default function CarteMeteo({ zone, pluie, orage, nuages, montrerPluie, montrerNuages, point, basCarte }: {
  zone: ZoneMeteo
  pluie: Couche | null
  orage: Couche | null
  nuages: Couche | null
  montrerPluie: boolean
  montrerNuages: boolean
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
  }, [])

  const zoom = (d: number) => ref.current?.getMap().easeTo({ zoom: (ref.current?.getMap().getZoom() ?? 9) + d, duration: 250 })

  return (
    <div className="relative h-full w-full">
      <MapGL
        ref={ref}
        mapStyle={STYLE}
        initialViewState={{ longitude: point.lng, latitude: point.lat, zoom: 8.6, padding: { top: 0, bottom: basCarte, left: 0, right: 0 } }}
        // La carte ne sort pas de la zone couverte par les données : au-delà,
        // le ciel est inconnu et le voile des nuages s'arrêterait net.
        maxBounds={[[zone.lon0 + 0.06, sud + 0.06], [est - 0.06, zone.lat0 - 0.06]]}
        minZoom={7}
        maxZoom={12.5}
        dragRotate={false}
        touchPitch={false}
        attributionControl={{ compact: true }}
        onLoad={auChargement}
        style={{ width: '100%', height: '100%' }}
      >
        {pret && (
          <>
            {/* Nuages : un voile blanc translucide, son ombre légèrement décalée dessous. */}
            <Source id="nuages" type="geojson" data={montrerNuages && nuages ? nuages : VIDE}>
              <Layer id="nuages-ombre" type="fill" beforeId={avant}
                paint={{ 'fill-color': '#3B2F22', 'fill-opacity': ['match', ['get', 'niveau'], 0, 0.05, 0.08], 'fill-translate': [3, 4] }} />
              <Layer id="nuages-voile" type="fill" beforeId={avant}
                paint={{ 'fill-color': '#FFFFFF', 'fill-opacity': ['match', ['get', 'niveau'], 0, 0.42, 0.62] }} />
            </Source>
            <Source id="pluie" type="geojson" data={montrerPluie && pluie ? pluie : VIDE}>
              <Layer id="pluie-fond" type="fill" beforeId={avant}
                paint={{ 'fill-color': ['match', ['get', 'niveau'], 0, COULEURS_PLUIE[0], 1, COULEURS_PLUIE[1], COULEURS_PLUIE[2]], 'fill-opacity': 0.78 }} />
              <Layer id="pluie-bord" type="line" beforeId={avant}
                paint={{ 'line-color': '#1F5296', 'line-opacity': 0.35, 'line-width': 0.8 }} />
            </Source>
            <Source id="orage" type="geojson" data={montrerPluie && orage ? orage : VIDE}>
              <Layer id="orage-fond" type="fill" beforeId={avant} paint={{ 'fill-color': COULEUR_ORAGE, 'fill-opacity': 0.82 }} />
              <Layer id="orage-bord" type="line" beforeId={avant} paint={{ 'line-color': '#8E2F1B', 'line-width': 1 }} />
            </Source>
          </>
        )}
        <Marker longitude={point.lng} latitude={point.lat} anchor="center">
          <span aria-hidden style={{ display: 'block', width: 14, height: 14, borderRadius: 999, background: '#2D5A3D', border: '3px solid #FFFFFF', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }} />
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
