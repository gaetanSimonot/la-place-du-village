'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps'

interface Centre {
  id: string
  nom: string
  lat: number
  lng: number
}

/* ── Composants internes carte ── */

function MapCenterTracker({ onIdle }: { onIdle: (lat: number, lng: number, zoom: number) => void }) {
  const map  = useMap()
  const cbRef = useRef(onIdle)
  useEffect(() => { cbRef.current = onIdle })

  useEffect(() => {
    if (!map) return
    const l = map.addListener('idle', () => {
      const c = map.getCenter()
      const z = map.getZoom()
      if (c && z != null) cbRef.current(c.lat(), c.lng(), z)
    })
    return () => (l as google.maps.MapsEventListener).remove()
  }, [map])

  return null
}

function MapZoomButtons() {
  const map = useMap()
  const btn: React.CSSProperties = {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: 'white', border: '1px solid #E0D8CE',
    fontWeight: 700, fontSize: 18, cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  return (
    <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button style={btn} onClick={() => map?.setZoom((map.getZoom() ?? 11) + 1)}>+</button>
      <button style={btn} onClick={() => map?.setZoom((map.getZoom() ?? 11) - 1)}>−</button>
    </div>
  )
}

/* ── Composant principal ── */

export default function ZoneAdmin() {
  const [centres, setCentres]         = useState<Centre[]>([])
  const [rayonInsertion, setRayonInsertion] = useState(100)
  const [rayonAffichage, setRayonAffichage] = useState(50)
  const [carteLat,  setCarteLat]      = useState(43.5785)
  const [carteLng,  setCarteLng]      = useState(3.8940)
  const [carteZoom, setCarteZoom]     = useState(11)
  const [newNom, setNewNom]           = useState('')
  const [adding, setAdding]           = useState(false)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [deletingId, setDeletingId]   = useState<string | null>(null)

  // Carte picker
  const [mapOpen,   setMapOpen]   = useState(false)
  const [mapKey,    setMapKey]    = useState(0)
  const [pickLat,   setPickLat]   = useState(carteLat)
  const [pickLng,   setPickLng]   = useState(carteLng)
  const [pickZoom,  setPickZoom]  = useState(carteZoom)

  const fetchZone = useCallback(async () => {
    const res  = await fetch('/api/admin/zone')
    const data = await res.json()
    setCentres(data.centres ?? [])
    setRayonInsertion(data.rayon_insertion ?? 100)
    setRayonAffichage(data.rayon_affichage ?? 50)
    setCarteLat(data.carte_depart_lat   ?? 43.5785)
    setCarteLng(data.carte_depart_lng   ?? 3.8940)
    setCarteZoom(data.carte_depart_zoom ?? 11)
  }, [])

  useEffect(() => { fetchZone() }, [fetchZone])

  const validerZone = async () => {
    setSaving(true); setSaved(false)
    await fetch('/api/admin/zone', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rayon_insertion: rayonInsertion, rayon_affichage: rayonAffichage, carte_depart_lat: carteLat, carte_depart_lng: carteLng, carte_depart_zoom: carteZoom }),
    })
    setSaving(false); setSaved(true)
    localStorage.setItem('pdv-zone-updated', String(Date.now()))
    setTimeout(() => setSaved(false), 2000)
  }

  const addCentre = async () => {
    if (!newNom.trim()) return
    setAdding(true); setError(null)
    const res  = await fetch('/api/admin/zone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom: newNom.trim() }) })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Erreur') } else { setNewNom(''); await fetchZone() }
    setAdding(false)
  }

  const deleteCentre = async (id: string) => {
    setDeletingId(id)
    await fetch(`/api/admin/zone/${id}`, { method: 'DELETE' })
    await fetchZone(); setDeletingId(null)
  }

  const openMapPicker = () => {
    setPickLat(carteLat); setPickLng(carteLng); setPickZoom(carteZoom)
    setMapKey(k => k + 1)
    setMapOpen(true)
  }

  const confirmPosition = () => {
    setCarteLat(pickLat); setCarteLng(pickLng); setCarteZoom(pickZoom)
    setMapOpen(false)
  }

  return (
    <div className="p-4 space-y-5">

      {/* Centres */}
      <div className="bg-white rounded-2xl p-4 space-y-3">
        <p className="font-bold text-[#2C1810] text-sm">Centres de la zone</p>
        <p className="text-xs text-gray-400">Un événement est dans la zone s&apos;il est à portée d&apos;au moins un centre.</p>
        <div className="flex gap-2">
          <input value={newNom} onChange={e => { setNewNom(e.target.value); setError(null) }} onKeyDown={e => e.key === 'Enter' && addCentre()}
            placeholder="Nom du village (ex: Le Vigan)"
            className="flex-1 bg-[#FBF7F0] border border-[#E8E0D5] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C4622D]" />
          <button onClick={addCentre} disabled={adding || !newNom.trim()} className="bg-[#C4622D] text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50">
            {adding ? '…' : '+ Ajouter'}
          </button>
        </div>
        {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="space-y-2">
          {centres.map(c => (
            <div key={c.id} className="flex items-center gap-3 bg-[#FBF7F0] rounded-xl px-3 py-2.5">
              <span className="text-base">📍</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#2C1810]">{c.nom}</p>
                <p className="text-xs text-gray-400">{c.lat.toFixed(4)}, {c.lng.toFixed(4)}</p>
              </div>
              <button onClick={() => deleteCentre(c.id)} disabled={deletingId === c.id} className="text-red-300 hover:text-red-500 text-lg transition-colors disabled:opacity-40">🗑️</button>
            </div>
          ))}
          {centres.length === 0 && <p className="text-sm text-gray-400 text-center py-3">Aucun centre — Ganges utilisé par défaut</p>}
        </div>
      </div>

      {/* Rayon affichage */}
      <div className="bg-white rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-[#2C1810] text-sm">Rayon d&apos;affichage</p>
            <p className="text-xs text-gray-400 mt-0.5">Masque les events trop loin sur la carte et la liste</p>
          </div>
          <span className="text-[#C4622D] font-bold text-lg">{rayonAffichage} km</span>
        </div>
        <input type="range" min={5} max={200} step={5} value={rayonAffichage} onChange={e => setRayonAffichage(Number(e.target.value))} className="w-full accent-[#C4622D]" />
        <div className="flex justify-between text-xs text-gray-400"><span>5 km</span><span>200 km</span></div>
      </div>

      {/* Rayon insertion */}
      <div className="bg-white rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-[#2C1810] text-sm">Rayon d&apos;insertion</p>
            <p className="text-xs text-gray-400 mt-0.5">Rejette les events trop loin lors de la soumission</p>
          </div>
          <span className="text-[#C4622D] font-bold text-lg">{rayonInsertion} km</span>
        </div>
        <input type="range" min={5} max={200} step={5} value={rayonInsertion} onChange={e => setRayonInsertion(Number(e.target.value))} className="w-full accent-[#C4622D]" />
        <div className="flex justify-between text-xs text-gray-400"><span>5 km</span><span>200 km</span></div>
      </div>

      {/* Position de départ de la carte */}
      <div className="bg-white rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold text-[#2C1810] text-sm">Position de départ de la carte</p>
            <p className="text-xs text-gray-400 mt-0.5">Vue affichée à l&apos;ouverture de l&apos;app</p>
          </div>
          <button onClick={openMapPicker}
            className="bg-[#2D5A3D] text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shrink-0 ml-3">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
              <circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/>
            </svg>
            {mapOpen ? 'Fermer' : 'Choisir sur la carte'}
          </button>
        </div>

        {/* Coordonnées actuelles */}
        <div className="flex gap-2 text-xs text-gray-500 bg-[#F5F0EA] rounded-xl px-3 py-2 items-center">
          <span className="text-base">📍</span>
          <span className="font-mono">{carteLat.toFixed(5)}, {carteLng.toFixed(5)}</span>
          <span className="text-gray-400">— zoom {carteZoom}</span>
        </div>

        {/* Carte interactive */}
        {mapOpen && (
          <div style={{ position: 'relative', height: 300, borderRadius: 16, overflow: 'hidden', border: '2px solid #2D5A3D' }}>
            <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!}>
              <Map
                key={mapKey}
                defaultCenter={{ lat: pickLat, lng: pickLng }}
                defaultZoom={pickZoom}
                disableDefaultUI={true}
                gestureHandling="greedy"
                style={{ width: '100%', height: '100%' }}
              >
                <MapCenterTracker onIdle={(lat, lng, zoom) => { setPickLat(lat); setPickLng(lng); setPickZoom(zoom) }} />
                <MapZoomButtons />
              </Map>
            </APIProvider>

            {/* Crosshair — pin fixe au centre */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ marginBottom: 28 }}>
                <svg width="30" height="40" viewBox="0 0 30 40" fill="none">
                  <path d="M15 0C7.27 0 1 6.27 1 14c0 9.85 14 26 14 26s14-16.15 14-26C29 6.27 22.73 0 15 0z"
                    fill="#2D5A3D" stroke="white" strokeWidth="1.5"/>
                  <circle cx="15" cy="14" r="5" fill="white"/>
                </svg>
                {/* Ombre sous le pin */}
                <div style={{ width: 10, height: 4, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.25)', margin: '-2px auto 0', filter: 'blur(2px)' }} />
              </div>
            </div>

            {/* Coordonnées live */}
            <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: '4px 10px', boxShadow: '0 1px 6px rgba(0,0,0,0.15)', whiteSpace: 'nowrap' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#2C1810' }}>{pickLat.toFixed(5)}, {pickLng.toFixed(5)} — zoom {pickZoom}</span>
            </div>

            {/* Bouton confirmer */}
            <button onClick={confirmPosition}
              style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', backgroundColor: '#2D5A3D', color: 'white', border: 'none', borderRadius: 20, padding: '8px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.2)', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif' }}>
              ✓ Confirmer cette position
            </button>
          </div>
        )}

        {/* Zoom slider */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Zoom initial</p>
            <p className="text-xs text-gray-300 mt-0.5">8 = région · 11 = agglo · 14 = ville</p>
          </div>
          <span className="text-[#2D5A3D] font-bold text-lg ml-4">{carteZoom}</span>
        </div>
        <input type="range" min={6} max={16} step={1} value={carteZoom} onChange={e => setCarteZoom(Number(e.target.value))} className="w-full accent-[#2D5A3D]" />
        <div className="flex justify-between text-xs text-gray-400"><span>6 (région)</span><span>16 (rue)</span></div>
      </div>

      {/* Bouton valider */}
      <button onClick={validerZone} disabled={saving}
        className={`w-full py-4 rounded-2xl font-bold text-base transition-colors ${saved ? 'bg-green-500 text-white' : 'bg-[#C4622D] text-white disabled:opacity-50'}`}>
        {saving ? 'Sauvegarde…' : saved ? '✓ Zone validée — carte et liste mises à jour' : 'Valider la zone'}
      </button>
    </div>
  )
}
