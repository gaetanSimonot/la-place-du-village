'use client'
import { useEffect, useRef, useCallback } from 'react'
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps'
import { MarkerClusterer } from '@googlemaps/markerclusterer'
import { Evenement, isApproxLocation } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'

const GANGES = { lat: 43.9333, lng: 3.7 }

function markerSvg(categorie: string, selected: boolean, approx = false): string {
  const cat = CATEGORIES[categorie as keyof typeof CATEGORIES] ?? CATEGORIES.autre
  const r = selected ? 18 : 14
  const size = r * 2 + 8
  const cx = size / 2
  const cy = r + 2
  const fill = approx ? 'white' : cat.color
  const stroke = cat.color
  const textColor = approx ? cat.color : 'white'
  const strokeDash = approx ? `stroke-dasharray="3 2"` : ''
  const label = approx ? '~' : cat.emoji
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 8}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2.5" ${strokeDash} opacity="${approx ? 0.75 : 1}"/>
    <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="${selected ? 14 : 11}" fill="${textColor}">${label}</text>
    <polygon points="${cx - 5},${cy + r} ${cx + 5},${cy + r} ${cx},${cy + r + 8}" fill="${cat.color}" opacity="${approx ? 0.75 : 1}"/>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

interface MarkersProps {
  evenements: Evenement[]
  selectedId: string | null
  onSelectEvent: (id: string) => void
}

function Markers({ evenements, selectedId, onSelectEvent }: MarkersProps) {
  const map = useMap()
  const clustererRef = useRef<MarkerClusterer | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])

  const clearAll = useCallback(() => {
    clustererRef.current?.clearMarkers()
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
  }, [])

  useEffect(() => {
    if (!map) return

    clearAll()

    const withLocation = evenements.filter(e => e.lieux?.lat && e.lieux?.lng)

    const newMarkers = withLocation.map(evt => {
      const isSelected = evt.id === selectedId
      const approx = isApproxLocation(evt.lieux)
      const size = isSelected ? 44 : 36
      const marker = new google.maps.Marker({
        position: { lat: evt.lieux!.lat!, lng: evt.lieux!.lng! },
        title: evt.titre + (approx ? ' (localisation approximative)' : ''),
        optimized: false,
        icon: {
          url: markerSvg(evt.categorie, isSelected, approx),
          scaledSize: new google.maps.Size(size, size + 8),
          anchor: new google.maps.Point(size / 2, size + 8),
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
}

export default function MapView({ evenements, selectedId, onSelectEvent }: Props) {
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
        zoomControl={true}
      >
        <Markers
          evenements={evenements}
          selectedId={selectedId}
          onSelectEvent={onSelectEvent}
        />
      </Map>
    </APIProvider>
  )
}
