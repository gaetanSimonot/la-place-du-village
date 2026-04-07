'use client'
import { useEffect, useRef, useCallback } from 'react'
import { APIProvider, Map, InfoWindow, useMap } from '@vis.gl/react-google-maps'
import { MarkerClusterer } from '@googlemaps/markerclusterer'
import { Evenement, isApproxLocation } from '@/lib/types'
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

// Icônes SVG évocateurs par catégorie
const CATEGORY_SHAPES: Record<string, string> = {
  concert:   '♪',
  theatre:   '🎭',
  sport:     '⚡',
  marche:    '🧺',
  atelier:   '🎨',
  fete:      '✦',
  autre:     '●',
}

function markerSvg(categorie: string, selected: boolean, approx = false): string {
  const cat = CATEGORIES[categorie as keyof typeof CATEGORIES] ?? CATEGORIES.autre
  const symbol = CATEGORY_SHAPES[categorie] ?? '●'

  const r     = selected ? 22 : 17
  const size  = r * 2 + 8
  const cx    = size / 2
  const cy    = r + 2
  const bg    = approx ? '#fff' : cat.color
  const stroke = cat.color
  const textColor = approx ? cat.color : '#fff'
  const dashAttr  = approx ? `stroke-dasharray="3 2"` : ''
  const fontSize  = selected ? 15 : 12
  const strokeW   = selected ? 3 : 2.5
  const opacity   = approx ? 0.8 : 1

  // Contour glow sur l'élément sélectionné
  const glow = selected
    ? `<circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="${cat.color}" opacity="0.2"/>`
    : ''

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 10}">
    ${glow}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${bg}" stroke="${stroke}" stroke-width="${strokeW}" ${dashAttr} opacity="${opacity}"/>
    <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="${fontSize}" fill="${textColor}" font-family="sans-serif">${symbol}</text>
    <polygon points="${cx - 5},${cy + r - 1} ${cx + 5},${cy + r - 1} ${cx},${cy + r + 10}" fill="${cat.color}" opacity="${opacity}"/>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

interface MarkersProps {
  evenements: Evenement[]
  selectedId: string | null
  onSelectEvent: (id: string) => void
  fixedMap: boolean
}

function Markers({ evenements, selectedId, onSelectEvent, fixedMap }: MarkersProps) {
  const map = useMap()
  const clustererRef = useRef<MarkerClusterer | null>(null)
  const markersRef   = useRef<google.maps.Marker[]>([])

  const clearAll = useCallback(() => {
    clustererRef.current?.clearMarkers()
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
  }, [])

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
    const newMarkers = withLoc.map(evt => {
      const isSelected = evt.id === selectedId
      const approx     = isApproxLocation(evt.lieux)
      const size       = isSelected ? 52 : 42
      const marker     = new google.maps.Marker({
        position: { lat: evt.lieux!.lat!, lng: evt.lieux!.lng! },
        title: evt.titre,
        optimized: false,
        icon: {
          url: markerSvg(evt.categorie, isSelected, approx),
          scaledSize: new google.maps.Size(size, size + 10),
          anchor: new google.maps.Point(size / 2, size + 10),
        },
        zIndex: isSelected ? 999 : 1,
      })
      marker.addListener('click', () => onSelectEvent(evt.id))
      return marker
    })

    markersRef.current = newMarkers

    if (!clustererRef.current) {
      clustererRef.current = new MarkerClusterer({ map, markers: newMarkers })
    } else {
      clustererRef.current.addMarkers(newMarkers)
    }
  }, [map, evenements, selectedId, onSelectEvent, clearAll])

  return null
}

interface Props {
  evenements: Evenement[]
  selectedId: string | null
  onSelectEvent: (id: string) => void
  onDeselect: () => void
  onOpenEvent: (id: string) => void
}

export default function MapView({ evenements, selectedId, onSelectEvent, onDeselect, onOpenEvent }: Props) {
  const selectedEvent = selectedId ? evenements.find(e => e.id === selectedId) : null
  const selectedCat   = selectedEvent
    ? (CATEGORIES[selectedEvent.categorie] ?? CATEGORIES.autre)
    : null
  const { mapStyle, fixedMap } = useTheme()

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
        <Markers
          evenements={evenements}
          selectedId={selectedId}
          onSelectEvent={onSelectEvent}
          fixedMap={fixedMap}
        />

        {/* Popup InfoWindow sur l'événement sélectionné */}
        {selectedEvent && selectedEvent.lieux?.lat && selectedEvent.lieux?.lng && (
          <InfoWindow
            position={{ lat: selectedEvent.lieux.lat, lng: selectedEvent.lieux.lng }}
            onCloseClick={onDeselect}
            pixelOffset={[0, -54]}
          >
            <div
              onClick={() => onOpenEvent(selectedEvent.id)}
              style={{
                fontFamily: 'Inter, sans-serif',
                width: 220, borderRadius: 12,
                overflow: 'hidden', fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {selectedEvent.image_url && (
                <img
                  src={selectedEvent.image_url}
                  alt={selectedEvent.titre}
                  style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
                />
              )}
              <div style={{ padding: '8px 10px 10px' }}>
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
          </InfoWindow>
        )}
      </Map>
    </APIProvider>
  )
}
