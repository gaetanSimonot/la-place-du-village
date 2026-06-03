'use client'
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import MapGL, { Marker, Popup, type MapRef } from 'react-map-gl/maplibre'
import Supercluster from 'supercluster'
import 'maplibre-gl/dist/maplibre-gl.css'
import { EvenementCard, ProducerCard, isApproxLocation, EtablissementCard } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatEventDate } from '@/lib/filters'
import { useTheme } from '@/components/ThemeProvider'
import { etabMarkerSvg, ETAB_TYPES } from '@/lib/etablissement-types'
import { getTearParams, getProducerTearParams, markerSvg, producerMarkerSvg } from '@/lib/mapMarkers'

const GANGES = { lat: 43.9333, lng: 3.7 }

// Fond de carte vectoriel gratuit, sans clé ni facturation (OpenFreeMap).
const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

// ── Clustering (supercluster) ────────────────────────────────────────────────
interface ClusterPoint { id: string; lng: number; lat: number }
type Viewport = { bbox: [number, number, number, number]; zoom: number } | null

type ClusterFeature = {
  geometry: { coordinates: [number, number] }
  properties:
    | { cluster: true; cluster_id: number; point_count: number }
    | { cluster?: false; id: string }
}

function useClusters(points: ClusterPoint[], viewport: Viewport, radius = 60) {
  const index = useMemo(() => {
    const sc = new Supercluster<{ id: string }>({ radius, maxZoom: 16 })
    sc.load(points.map(p => ({
      type: 'Feature' as const,
      properties: { id: p.id },
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
    })))
    return sc
  }, [points, radius])

  const clusters = useMemo<ClusterFeature[]>(() => {
    if (!viewport) return []
    return index.getClusters(viewport.bbox, Math.round(viewport.zoom)) as unknown as ClusterFeature[]
  }, [index, viewport])

  return { index, clusters }
}

// Bulle de cluster (paquet de points)
function ClusterBubble({ count, color }: { count: number; color: string }) {
  const size = count < 10 ? 32 : count < 50 ? 40 : 48
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, color: '#fff', fontWeight: 800, fontSize: 13,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '2px solid rgba(255,255,255,0.9)', boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      cursor: 'pointer',
    }}>{count}</div>
  )
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
  onOpenProducer?: (id: string) => void
  etablissements?: EtablissementCard[]
  onOpenEtablissement?: (id: string) => void
}

export default function MapViewMaplibre({
  evenements, selectedId, onSelectEvent, onDeselect, onOpenEvent, centerOn,
  onMapDragStart, onMapDragEnd, onCameraIdle,
  producers = [], selectedProducerId = null, onSelectProducer, onOpenProducer,
  etablissements = [], onOpenEtablissement,
}: Props) {
  const mapRef = useRef<MapRef | null>(null)
  const [viewport, setViewport] = useState<Viewport>(null)
  const [selectedEtabId, setSelectedEtabId] = useState<string | null>(null)
  const { fixedMap, sheetBg } = useTheme()

  const selectedEvent    = selectedId ? evenements.find(e => e.id === selectedId) : null
  const selectedProducer = selectedProducerId ? producers.find(p => p.id === selectedProducerId) : null
  const selectedEtab     = selectedEtabId ? etablissements.find(e => e.id === selectedEtabId) : null
  const selectedCat      = selectedEvent ? (CATEGORIES[selectedEvent.categorie] ?? CATEGORIES.autre) : null

  // CSS popup : retire le chrome maplibre par défaut (padding/fond/bouton),
  // on garde le contenu carte custom comme pour l'InfoWindow Google.
  useEffect(() => {
    if (document.querySelector('[data-pdv-mlp]')) return
    const s = document.createElement('style')
    s.setAttribute('data-pdv-mlp', '1')
    s.textContent = `
      .maplibregl-popup-content { padding: 0 !important; background: transparent !important; box-shadow: none !important; border-radius: 0 !important; }
      .maplibregl-popup-close-button { display: none !important; }
      .maplibregl-popup-tip { display: none !important; }
      .pdv-warm .maplibregl-canvas { filter: sepia(0.18) saturate(1.06) brightness(1.02) hue-rotate(-6deg); }
    `
    document.head.appendChild(s)
    return () => s.remove()
  }, [])

  const updateViewport = useCallback(() => {
    const m = mapRef.current
    if (!m) return
    const b = m.getBounds()
    setViewport({ bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom: m.getZoom() })
  }, [])

  // Positionnement initial / restauré (centerOn)
  useEffect(() => {
    const m = mapRef.current
    if (!m || !centerOn) return
    m.getMap().jumpTo({ center: [centerOn.lng, centerOn.lat], zoom: centerOn.zoom ?? 11 })
    updateViewport()
  }, [centerOn, updateViewport])

  // Auto-fit bounds sur les événements visibles (désactivé en carte fixe)
  useEffect(() => {
    const m = mapRef.current
    if (!m || fixedMap) return
    const withLoc = evenements.filter(e => e.lieux?.lat && e.lieux?.lng)
    if (withLoc.length === 0) return
    if (withLoc.length === 1) {
      m.getMap().easeTo({ center: [withLoc[0].lieux!.lng!, withLoc[0].lieux!.lat!], zoom: 14 })
      return
    }
    let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90
    withLoc.forEach(e => {
      minLng = Math.min(minLng, e.lieux!.lng!); maxLng = Math.max(maxLng, e.lieux!.lng!)
      minLat = Math.min(minLat, e.lieux!.lat!); maxLat = Math.max(maxLat, e.lieux!.lat!)
    })
    m.getMap().fitBounds([[minLng, minLat], [maxLng, maxLat]], {
      padding: { top: 60, right: 20, bottom: 180, left: 20 }, duration: 600,
    })
  }, [evenements, fixedMap])

  // Pan vers l'événement sélectionné (désactivé en carte fixe)
  useEffect(() => {
    const m = mapRef.current
    if (!m || !selectedId || fixedMap) return
    const evt = evenements.find(e => e.id === selectedId)
    if (evt?.lieux?.lat && evt?.lieux?.lng) {
      m.getMap().easeTo({ center: [evt.lieux.lng, evt.lieux.lat] })
    }
  }, [selectedId, evenements, fixedMap])

  // ── Points + split promu / régulier (les promus ne sont jamais clusterisés) ──
  const eventPts = useMemo(() =>
    evenements.filter(e => e.lieux?.lat && e.lieux?.lng),
  [evenements])
  const promotedEvents = useMemo(() => eventPts.filter(e => e.promotion === 'pro' || e.promotion === 'max'), [eventPts])
  const regularEvents  = useMemo<ClusterPoint[]>(() =>
    eventPts.filter(e => !(e.promotion === 'pro' || e.promotion === 'max'))
      .map(e => ({ id: e.id, lng: e.lieux!.lng!, lat: e.lieux!.lat! })),
  [eventPts])
  const eventById = useMemo(() => new Map(eventPts.map(e => [e.id, e])), [eventPts])

  const etabPts = useMemo(() => etablissements.filter(e => e.lat && e.lng), [etablissements])
  const promotedEtabs = useMemo(() => etabPts.filter(e => e.plan === 'pro' || e.is_featured), [etabPts])
  const regularEtabs  = useMemo<ClusterPoint[]>(() =>
    etabPts.filter(e => !(e.plan === 'pro' || e.is_featured)).map(e => ({ id: e.id, lng: e.lng!, lat: e.lat! })),
  [etabPts])
  const etabById = useMemo(() => new Map(etabPts.map(e => [e.id, e])), [etabPts])

  const { index: eventIndex, clusters: eventClusters } = useClusters(regularEvents, viewport)
  const { index: etabIndex, clusters: etabClusters } = useClusters(regularEtabs, viewport)

  const zoomToCluster = useCallback((index: Supercluster<{ id: string }>, clusterId: number, lng: number, lat: number) => {
    const m = mapRef.current
    if (!m) return
    const z = Math.min(index.getClusterExpansionZoom(clusterId), 16)
    m.getMap().easeTo({ center: [lng, lat], zoom: z })
  }, [])

  return (
    <div className="pdv-warm" style={{ width: '100%', height: '100%' }}>
      <MapGL
        ref={mapRef}
        mapStyle={OPENFREEMAP_STYLE}
        initialViewState={{ longitude: GANGES.lng, latitude: GANGES.lat, zoom: 12 }}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        onLoad={updateViewport}
        onMoveEnd={updateViewport}
        onDragStart={onMapDragStart}
        onDragEnd={onMapDragEnd}
        onIdle={() => {
          const m = mapRef.current
          if (!m || !onCameraIdle) return
          const c = m.getCenter()
          onCameraIdle(c.lat, c.lng, m.getZoom())
        }}
      >
        {/* ── Événements clusterisés ── */}
        {eventClusters.map((c, i) => {
          const [lng, lat] = c.geometry.coordinates
          if ('cluster' in c.properties && c.properties.cluster) {
            const { cluster_id, point_count } = c.properties
            return (
              <Marker key={`ec-${cluster_id}`} longitude={lng} latitude={lat} anchor="center"
                onClick={() => zoomToCluster(eventIndex, cluster_id, lng, lat)}>
                <ClusterBubble count={point_count} color="#2D5A3D" />
              </Marker>
            )
          }
          const evt = eventById.get(c.properties.id!)
          if (!evt) return null
          const isSel = evt.id === selectedId
          const approx = isApproxLocation(evt.lieux)
          const p = getTearParams(isSel, false, false)
          return (
            <Marker key={`e-${evt.id}-${i}`} longitude={lng} latitude={lat} anchor="bottom"
              onClick={() => onSelectEvent(evt.id)}>
              <img src={markerSvg(evt.categorie, isSel, approx, false, false)}
                width={p.w} height={p.h} alt="" style={{ cursor: 'pointer', display: 'block' }} />
            </Marker>
          )
        })}

        {/* ── Événements promus (jamais clusterisés) ── */}
        {promotedEvents.map(evt => {
          const isSel = evt.id === selectedId
          const isMax = evt.promotion === 'max'
          const approx = isApproxLocation(evt.lieux)
          const p = getTearParams(isSel, true, isMax)
          return (
            <Marker key={`ep-${evt.id}`} longitude={evt.lieux!.lng!} latitude={evt.lieux!.lat!} anchor="bottom"
              onClick={() => onSelectEvent(evt.id)}>
              <img src={markerSvg(evt.categorie, isSel, approx, true, isMax)}
                width={p.w} height={p.h} alt="" style={{ cursor: 'pointer', display: 'block' }} />
            </Marker>
          )
        })}

        {/* ── Producteurs (individuels) ── */}
        {producers.filter(p => p.lat && p.lng).map(prod => {
          const sel = prod.id === selectedProducerId
          const pp = getProducerTearParams(sel, prod.is_max)
          return (
            <Marker key={`p-${prod.id}`} longitude={prod.lng!} latitude={prod.lat!} anchor="bottom"
              onClick={() => onSelectProducer?.(sel ? null : prod.id)}>
              <img src={producerMarkerSvg(sel, prod.is_max)}
                width={pp.w} height={pp.h} alt="" style={{ cursor: 'pointer', display: 'block' }} />
            </Marker>
          )
        })}

        {/* ── Établissements clusterisés ── */}
        {etabClusters.map((c, i) => {
          const [lng, lat] = c.geometry.coordinates
          if ('cluster' in c.properties && c.properties.cluster) {
            const { cluster_id, point_count } = c.properties
            return (
              <Marker key={`tc-${cluster_id}`} longitude={lng} latitude={lat} anchor="center"
                onClick={() => zoomToCluster(etabIndex, cluster_id, lng, lat)}>
                <ClusterBubble count={point_count} color="#555" />
              </Marker>
            )
          }
          const e = etabById.get(c.properties.id!)
          if (!e) return null
          const isSel = e.id === selectedEtabId
          const h = 36
          return (
            <Marker key={`t-${e.id}-${i}`} longitude={lng} latitude={lat} anchor="bottom"
              onClick={() => setSelectedEtabId(isSel ? null : e.id)}>
              <img src={etabMarkerSvg(isSel, e.type, e.plan, e.is_featured)}
                width={28} height={h} alt="" style={{ cursor: 'pointer', display: 'block' }} />
            </Marker>
          )
        })}

        {/* ── Établissements promus (jamais clusterisés) ── */}
        {promotedEtabs.map(e => {
          const isSel = e.id === selectedEtabId
          const h = 47
          return (
            <Marker key={`tp-${e.id}`} longitude={e.lng!} latitude={e.lat!} anchor="bottom"
              onClick={() => setSelectedEtabId(isSel ? null : e.id)}>
              <img src={etabMarkerSvg(isSel, e.type, e.plan, e.is_featured)}
                width={28} height={h} alt="" style={{ cursor: 'pointer', display: 'block' }} />
            </Marker>
          )
        })}

        {/* ── Popup établissement ── */}
        {selectedEtab && selectedEtab.lat && selectedEtab.lng && (() => {
          const typeInfo = ETAB_TYPES[selectedEtab.type]
          const photo    = selectedEtab.photos?.[0]
          const promoted = selectedEtab.plan === 'pro' || selectedEtab.is_featured
          return (
            <Popup longitude={selectedEtab.lng} latitude={selectedEtab.lat} anchor="bottom"
              offset={[0, promoted ? -47 : -36]} closeButton={false} closeOnClick={false}
              onClose={() => setSelectedEtabId(null)} maxWidth="230px">
              <div style={{ position: 'relative', width: 210, overflow: 'visible', fontFamily: 'Inter, sans-serif' }}>
                <button onClick={() => setSelectedEtabId(null)}
                  style={{ position: 'absolute', top: -10, right: -10, zIndex: 10, width: 22, height: 22, borderRadius: '50%', backgroundColor: '#fff', border: '1.5px solid #ddd', boxShadow: '0 1px 5px rgba(0,0,0,0.22)', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, padding: 0 }}>✕</button>
                <div onClick={() => { onOpenEtablissement?.(selectedEtab.id); setSelectedEtabId(null) }}
                  style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', border: `2.5px solid ${sheetBg.bg}`, cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.18)' }}>
                  <div style={{ width: '100%', height: 95, position: 'relative', backgroundColor: typeInfo?.bg ?? '#F5F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {photo
                      ? <img src={photo} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 36 }}>{typeInfo?.emoji ?? '🏪'}</span>}
                  </div>
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
            </Popup>
          )
        })()}

        {/* ── Popup producteur ── */}
        {selectedProducer && selectedProducer.lat && selectedProducer.lng && (
          <Popup longitude={selectedProducer.lng} latitude={selectedProducer.lat} anchor="bottom"
            offset={[0, -38]} closeButton={false} closeOnClick={false}
            onClose={() => onSelectProducer?.(null)} maxWidth="220px">
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
                  <button onClick={() => onOpenProducer?.(selectedProducer.id)} style={{ display: 'block', width: '100%', textAlign: 'center', padding: '7px', borderRadius: 8, backgroundColor: '#2D5A3D', color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                    Voir la fiche →
                  </button>
                </div>
              </div>
            </div>
          </Popup>
        )}

        {/* ── Popup événement ── */}
        {selectedEvent && selectedEvent.lieux?.lat && selectedEvent.lieux?.lng && (
          <Popup longitude={selectedEvent.lieux.lng} latitude={selectedEvent.lieux.lat} anchor="bottom"
            offset={[0, -36]} closeButton={false} closeOnClick={false}
            onClose={onDeselect} maxWidth="240px">
            <div style={{ position: 'relative', width: 220, overflow: 'visible' }}>
              <button onClick={e => { e.stopPropagation(); onDeselect() }}
                style={{ position: 'absolute', top: -10, right: -10, zIndex: 10, width: 22, height: 22, borderRadius: '50%', backgroundColor: '#fff', border: '1.5px solid #ddd', boxShadow: '0 1px 5px rgba(0,0,0,0.22)', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, padding: 0, lineHeight: 1 }}>✕</button>
              <div onClick={() => onOpenEvent(selectedEvent.id)}
                style={{ fontFamily: 'Inter, sans-serif', borderRadius: 12, overflow: 'hidden', fontSize: 13, cursor: 'pointer', backgroundColor: '#fff', border: `2.5px solid ${sheetBg.bg}` }}>
                {selectedEvent.image_url && (
                  <img src={selectedEvent.image_url} alt={selectedEvent.titre} loading="lazy"
                    style={{ width: '100%', height: 100, objectFit: 'cover', objectPosition: selectedEvent.image_position ?? '50% 50%', display: 'block' }} />
                )}
                <div style={{ padding: '8px 10px 10px', backgroundColor: '#fff' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, backgroundColor: selectedCat!.color, color: '#fff', borderRadius: 999, padding: '2px 8px', marginBottom: 5 }}>
                    {selectedCat!.emoji} {selectedCat!.label}
                  </span>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#2C2C2C', lineHeight: 1.3, marginBottom: 4 }}>{selectedEvent.titre}</p>
                  {selectedEvent.date_debut && (
                    <p style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>
                      {formatEventDate(selectedEvent.date_debut, selectedEvent.date_fin)}
                      {selectedEvent.heure && !selectedEvent.date_fin && ` · ${selectedEvent.heure.slice(0, 5)}`}
                    </p>
                  )}
                  {selectedEvent.lieux && (
                    <p style={{ fontSize: 11, color: '#8A8A8A', marginTop: 2 }}>
                      📍 {selectedEvent.lieux.nom}{selectedEvent.lieux.commune ? `, ${selectedEvent.lieux.commune}` : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Popup>
        )}
      </MapGL>
    </div>
  )
}
