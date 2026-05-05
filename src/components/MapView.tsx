'use client'
import { useEffect, useRef, useCallback } from 'react'
import { APIProvider, Map, InfoWindow, useMap } from '@vis.gl/react-google-maps'
import { MarkerClusterer } from '@googlemaps/markerclusterer'
import { EvenementCard, ProducerCard, isApproxLocation } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'
import { useTheme } from '@/components/ThemeProvider'

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

// Cache SVG par clé — évite de recalculer à chaque render
const svgCache: Record<string, string> = {}

// Calcule les dimensions d'un marqueur goutte pour une taille donnée
function getTearParams(selected: boolean, promoted: boolean, isMax: boolean) {
  const r       = isMax ? 10 : selected ? 9 : (promoted ? 8 : 7)
  const tailH   = Math.round(r * 1.0)
  const starH   = isMax ? 11 : 0   // hauteur réservée pour l'étoile au-dessus
  const pad     = 3
  const w       = r * 2 + pad * 2
  const h       = r * 2 + tailH + pad * 2 + starH
  const cx      = w / 2
  const cy      = pad + starH + r   // centre du cercle
  const tipY    = cy + r + tailH    // pointe en bas
  const holeR   = Math.max(2, Math.round(r * 0.30))
  return { r, tailH, starH, pad, w, h, cx, cy, tipY, holeR }
}

function getProducerTearParams(selected: boolean, isMax: boolean) {
  const r       = selected ? 10 : isMax ? 9 : 7
  const tailH   = Math.round(r * 1.0)
  const pad     = 3
  const w       = r * 2 + pad * 2
  const h       = r * 2 + tailH + pad * 2
  const cx      = w / 2
  const cy      = pad + r
  const tipY    = cy + r + tailH
  const holeR   = Math.max(2, Math.round(r * 0.30))
  return { r, tailH, pad, w, h, cx, cy, tipY, holeR }
}

// Trace la forme goutte: cercle en haut, pointe en bas
function tearPath(r: number, cx: number, cy: number, tipY: number): string {
  const tailH = tipY - cy - r
  const cpX   = r * 0.32
  const cpY   = tailH * 0.40
  return `M${cx},${tipY} C${cx-cpX},${tipY-cpY} ${cx-r},${cy+r*0.5} ${cx-r},${cy} A${r},${r} 0 1 1 ${cx+r},${cy} C${cx+r},${cy+r*0.5} ${cx+cpX},${tipY-cpY} ${cx},${tipY} Z`
}

function producerMarkerSvg(selected: boolean, isMax: boolean): string {
  const key = `producer|${selected}|${isMax}`
  if (svgCache[key]) return svgCache[key]
  const p    = getProducerTearParams(selected, isMax)
  const path = tearPath(p.r, p.cx, p.cy, p.tipY)
  const fill = isMax ? '#E8622A' : '#2D5A3D'
  const glow    = selected ? `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.r+4}" ry="${p.r+3}" fill="${fill}" opacity="0.16"/>` : ''
  const maxHalo = isMax && !selected ? `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.r+4}" ry="${p.r+3}" fill="${fill}" opacity="0.13"/>` : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}" height="${p.h}">
    ${maxHalo}${glow}
    <path d="${path}" fill="${fill}" fill-opacity="0.88" stroke="rgba(255,255,255,0.88)" stroke-width="${selected?2:1.2}"/>
    <circle cx="${p.cx}" cy="${p.cy}" r="${p.holeR}" fill="white" opacity="0.55"/>
  </svg>`
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`
  svgCache[key] = url
  return url
}

function markerSvg(categorie: string, selected: boolean, approx = false, promoted = false, isMax = false): string {
  const key = `${categorie}|${selected}|${approx}|${promoted}|${isMax}`
  if (svgCache[key]) return svgCache[key]
  const url = _buildMarkerSvg(categorie, selected, approx, promoted, isMax)
  svgCache[key] = url
  return url
}

function _buildMarkerSvg(categorie: string, selected: boolean, approx = false, promoted = false, isMax = false): string {
  const cat  = CATEGORIES[categorie as keyof typeof CATEGORIES] ?? CATEGORIES.autre
  const p    = getTearParams(selected, promoted, isMax)
  const path = tearPath(p.r, p.cx, p.cy, p.tipY)

  const fillColor   = approx ? '#BBBBBB' : cat.color
  const fillOpacity = approx ? 0.52 : selected ? 0.94 : 0.82
  const strokeColor = 'rgba(255,255,255,0.88)'
  const strokeW     = selected ? 2 : 1.2
  const dashAttr    = approx ? `stroke-dasharray="2 1.5"` : ''

  const glow = selected
    ? `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.r+4}" ry="${p.r+3}" fill="${fillColor}" opacity="0.18"/>`
    : ''
  const maxHalo = isMax && !selected
    ? `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.r+4}" ry="${p.r+3}" fill="#EC407A" opacity="0.14"/>`
    : ''
  const star = isMax && p.starH > 0
    ? `<text x="${p.cx}" y="${p.starH - 1}" text-anchor="middle" dominant-baseline="auto" font-size="10" fill="#EC407A" opacity="0.92" font-family="sans-serif">✦</text>`
    : ''

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}" height="${p.h}">
    ${maxHalo}${glow}
    <path d="${path}" fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="${strokeColor}" stroke-width="${strokeW}" ${dashAttr}/>
    <circle cx="${p.cx}" cy="${p.cy}" r="${p.holeR}" fill="white" opacity="0.52"/>
    ${star}
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

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
    return () => listeners.forEach(l => l.remove())
  }, [map, onDragStart, onDragEnd, onCameraIdle])
  return null
}

interface MarkersProps {
  evenements: EvenementCard[]
  selectedId: string | null
  onSelectEvent: (id: string) => void
  fixedMap: boolean
  centerOn?: { lat: number; lng: number; zoom?: number } | null
}

function Markers({ evenements, selectedId, onSelectEvent, fixedMap, centerOn }: MarkersProps) {
  const map = useMap()
  const clustererRef = useRef<MarkerClusterer | null>(null)
  const markersRef   = useRef<google.maps.Marker[]>([])

  const clearAll = useCallback(() => {
    clustererRef.current?.clearMarkers()
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
  }, [])

  // Positionnement initial ou restauré — setCenter (fiable sur grande distance, contrairement à panTo)
  useEffect(() => {
    if (!map || !centerOn) return
    map.setCenter({ lat: centerOn.lat, lng: centerOn.lng })
    map.setZoom(centerOn.zoom ?? 11)
  }, [map, centerOn])

  // Pan vers l'événement sélectionné (désactivé en mode carte fixe)
  useEffect(() => {
    if (!map || !selectedId || fixedMap) return
    const evt = evenements.find(e => e.id === selectedId)
    if (evt?.lieux?.lat && evt?.lieux?.lng) {
      map.panTo({ lat: evt.lieux.lat, lng: evt.lieux.lng })
    }
  }, [map, selectedId, evenements, fixedMap])

  // Auto-fit bounds selon les événements visibles (désactivé en mode carte fixe)
  useEffect(() => {
    if (!map || fixedMap) return
    const withLoc = evenements.filter(e => e.lieux?.lat && e.lieux?.lng)
    if (withLoc.length === 0) return

    if (withLoc.length === 1) {
      map.panTo({ lat: withLoc[0].lieux!.lat!, lng: withLoc[0].lieux!.lng! })
      map.setZoom(14)
      return
    }

    const bounds = new google.maps.LatLngBounds()
    withLoc.forEach(e => bounds.extend({ lat: e.lieux!.lat!, lng: e.lieux!.lng! }))
    map.fitBounds(bounds, { top: 60, right: 20, bottom: 180, left: 20 })
  }, [map, evenements, fixedMap])

  useEffect(() => {
    if (!map) return
    clearAll()

    const withLoc = evenements.filter(e => e.lieux?.lat && e.lieux?.lng)
    const regularMarkers: google.maps.Marker[] = []

    const allNewMarkers = withLoc.map(evt => {
      const isSelected = evt.id === selectedId
      const approx     = isApproxLocation(evt.lieux)
      const isMax      = evt.promotion === 'max'
      const promoted   = evt.promotion === 'pro' || evt.promotion === 'max'
      const p          = getTearParams(isSelected, promoted, isMax)
      const marker     = new google.maps.Marker({
        position: { lat: evt.lieux!.lat!, lng: evt.lieux!.lng! },
        title: evt.titre,
        optimized: false,
        icon: {
          url: markerSvg(evt.categorie, isSelected, approx, promoted, isMax),
          scaledSize: new google.maps.Size(p.w, p.h),
          anchor: new google.maps.Point(p.cx, p.tipY),
        },
        zIndex: isSelected ? 999 : promoted ? 10 : 1,
      })
      marker.addListener('click', () => onSelectEvent(evt.id))
      // Promoted markers bypass the clusterer so they're always individually visible
      if (promoted) {
        marker.setMap(map)
      } else {
        regularMarkers.push(marker)
      }
      return marker
    })

    markersRef.current = allNewMarkers

    if (!clustererRef.current) {
      clustererRef.current = new MarkerClusterer({ map, markers: regularMarkers })
    } else {
      clustererRef.current.addMarkers(regularMarkers)
    }
  }, [map, evenements, selectedId, onSelectEvent, clearAll])

  return null
}

interface ProducerMarkersProps {
  producers: ProducerCard[]
  selectedProducerId: string | null
  onSelectProducer: (id: string | null) => void
}

function ProducerMarkers({ producers, selectedProducerId, onSelectProducer }: ProducerMarkersProps) {
  const map = useMap()
  const markersRef = useRef<google.maps.Marker[]>([])

  useEffect(() => {
    if (!map) return
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    const withLoc = producers.filter(p => p.lat && p.lng)
    markersRef.current = withLoc.map(p => {
      const sel  = p.id === selectedProducerId
      const pp   = getProducerTearParams(sel, p.is_max)
      const marker = new google.maps.Marker({
        position: { lat: p.lat!, lng: p.lng! },
        title: p.nom,
        optimized: false,
        map,
        icon: {
          url: producerMarkerSvg(sel, p.is_max),
          scaledSize: new google.maps.Size(pp.w, pp.h),
          anchor: new google.maps.Point(pp.cx, pp.tipY),
        },
        zIndex: sel ? 999 : p.is_max ? 10 : 1,
      })
      marker.addListener('click', () => onSelectProducer(sel ? null : p.id))
      return marker
    })
    return () => { markersRef.current.forEach(m => m.setMap(null)) }
  }, [map, producers, selectedProducerId, onSelectProducer])

  return null
}

interface Props {
  evenements: EvenementCard[]
  selectedId: string | null
  onSelectEvent: (id: string) => void
  onDeselect: () => void
  onOpenEvent: (id: string) => void
  centerOn?: { lat: number; lng: number; zoom?: number } | null
  onMapDragStart?: () => void
  onMapDragEnd?: () => void
  onCameraIdle?: (lat: number, lng: number, zoom: number) => void
  producers?: ProducerCard[]
  selectedProducerId?: string | null
  onSelectProducer?: (id: string | null) => void
}

export default function MapView({ evenements, selectedId, onSelectEvent, onDeselect, onOpenEvent, centerOn, onMapDragStart, onMapDragEnd, onCameraIdle, producers = [], selectedProducerId = null, onSelectProducer }: Props) {
  const selectedEvent    = selectedId ? evenements.find(e => e.id === selectedId) : null
  const selectedProducer = selectedProducerId ? producers.find(p => p.id === selectedProducerId) : null
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
        styles={mapStyle.styles.length > 0 ? mapStyle.styles : WARM_STYLE}
      >
        <MapDragListener onDragStart={onMapDragStart} onDragEnd={onMapDragEnd} onCameraIdle={onCameraIdle} />
        <Markers
          evenements={evenements}
          selectedId={selectedId}
          onSelectEvent={onSelectEvent}
          fixedMap={fixedMap}
          centerOn={centerOn}
        />
        <ProducerMarkers
          producers={producers}
          selectedProducerId={selectedProducerId}
          onSelectProducer={onSelectProducer ?? (() => {})}
        />

        {/* InfoWindow producteur sélectionné */}
        {selectedProducer && selectedProducer.lat && selectedProducer.lng && (
          <InfoWindow
            position={{ lat: selectedProducer.lat, lng: selectedProducer.lng }}
            onCloseClick={() => onSelectProducer?.(null)}
            pixelOffset={[0, -38]}
          >
            <div style={{ position: 'relative', width: 200, overflow: 'visible', fontFamily: 'Inter, sans-serif' }}>
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
                  <a href={`/producteur/${selectedProducer.id}`} style={{ display: 'block', textAlign: 'center', padding: '7px', borderRadius: 8, backgroundColor: '#2D5A3D', color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                    Voir la fiche →
                  </a>
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
            pixelOffset={[0, -36]}
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
                  fontFamily: 'Inter, sans-serif',
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
                      {formatDate(selectedEvent.date_debut)}
                      {selectedEvent.heure && ` · ${selectedEvent.heure.slice(0, 5)}`}
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
