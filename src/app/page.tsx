'use client'
import React from 'react'
import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { EvenementCard, Filtres } from '@/lib/types'
import { getDateRange } from '@/lib/filters'
import { useTheme } from '@/components/ThemeProvider'
import { haversineKm, GANGES } from '@/lib/distance'

const MapView     = dynamic(() => import('@/components/MapView'),     { ssr: false })
const BottomSheet = dynamic(() => import('@/components/BottomSheet'), { ssr: false })

const defaultFiltres: Filtres = { categories: [], quand: 'toujours' }
const NAV_H = 62

type NavTab = 'carte' | 'liste' | 'profil'

const IconCarte = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
    <line x1="9" y1="3" x2="9" y2="18"/>
    <line x1="15" y1="6" x2="15" y2="21"/>
  </svg>
)
const IconListe = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="9" y1="6" x2="20" y2="6"/>
    <line x1="9" y1="12" x2="20" y2="12"/>
    <line x1="9" y1="18" x2="20" y2="18"/>
    <circle cx="4.5" cy="6" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="4.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="4.5" cy="18" r="1.5" fill="currentColor" stroke="none"/>
  </svg>
)
const IconProfil = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
)

const NAV_TABS: { id: NavTab; label: string; Icon: () => React.JSX.Element }[] = [
  { id: 'carte',  label: 'Carte',  Icon: IconCarte  },
  { id: 'liste',  label: 'Liste',  Icon: IconListe  },
  { id: 'profil', label: 'Profil', Icon: IconProfil },
]

export default function HomePage() {
  const { fixedMap, setFixedMap } = useTheme()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filtres, setFiltres]       = useState<Filtres>(defaultFiltres)
  const [allEvenements, setAllEvenements] = useState<EvenementCard[]>([])
  const [loading, setLoading]       = useState(true)
  const [masquerPasses, setMasquerPasses] = useState<boolean | null>(null)
  const [zoneCentres, setZoneCentres]   = useState<{ lat: number; lng: number; nom: string }[]>([])
  const [rayonAffichage, setRayonAffichage] = useState<number | null>(null)
  const [zoneLoaded, setZoneLoaded]     = useState(false)

  // Zone user (localStorage)
  const [zonePopup, setZonePopup]       = useState(false)
  const [userRayon, setUserRayon]       = useState<number>(30)
  const [userVille, setUserVille]       = useState('')
  const [userCentre, setUserCentre]     = useState<{ lat: number; lng: number; nom: string } | null>(null)
  const [userZoneActive, setUserZoneActive] = useState(false)
  const [mapCenterOn, setMapCenterOn]   = useState<{ lat: number; lng: number } | null>(null)
  const [geocoding, setGeocoding]       = useState(false)
  const [sheetMode, setSheetMode]   = useState<'peek'|'half'|'full'>('half')
  const [navTab, setNavTab]         = useState<NavTab>('carte')
  const [fabOpen, setFabOpen]       = useState(false)
  const router = useRouter()

  const fetchZoneConfig = useCallback(() => {
    fetch('/api/zone')
      .then(r => r.json())
      .then(data => {
        setZoneCentres(data.centres ?? [])
        setRayonAffichage(data.rayon_affichage ?? 0)
      })
      .catch(() => {})
      .finally(() => setZoneLoaded(true))
  }, [])

  // Config chargée une seule fois au mount + écoute changements admin
  useEffect(() => {
    supabase.from('config').select('value').eq('key', 'masquer_passes').single()
      .then(({ data }) => setMasquerPasses(data?.value === 'true'))
    fetchZoneConfig()

    // Charger zone user depuis localStorage
    try {
      const saved = localStorage.getItem('pdv-zone-user')
      if (saved) {
        const z = JSON.parse(saved as string)
        setUserRayon(z.rayon ?? 30)
        setUserVille(z.nom ?? '')
        setUserCentre({ lat: z.lat, lng: z.lng, nom: z.nom ?? '' })
        setUserZoneActive(true)
      }
    } catch {}

    // Recharger la zone si l'admin la modifie (même onglet/session)
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pdv-zone-updated') fetchZoneConfig()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const fetchEvenements = useCallback(async () => {
    if (masquerPasses === null || !zoneLoaded) return // attendre les configs
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('evenements')
      .select('id, titre, categorie, date_debut, heure, image_url, lieux(id, nom, commune, lat, lng, place_id_google)')
      .eq('statut', 'publie')
      .order('date_debut', { ascending: true })

    if (filtres.categories.length > 0) query = query.in('categorie', filtres.categories)
    const range = getDateRange(filtres.quand)
    if (range) query = query.gte('date_debut', range.from).lte('date_debut', range.to)

    if (masquerPasses) {
      const d = new Date()
      const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      query = query.or(`date_fin.gte.${today},and(date_fin.is.null,date_debut.gte.${today})`)
    }

    const { data } = await query
    setAllEvenements((data as EvenementCard[]) ?? [])
    setLoading(false)
  }, [filtres, masquerPasses, zoneLoaded])

  useEffect(() => { fetchEvenements() }, [fetchEvenements])

  // Filtre zone appliqué sur la liste complète — recalculé à chaque changement de zone
  const evenements = useMemo(() => {
    const rayon   = userZoneActive ? userRayon : (rayonAffichage ?? 0)
    const centres = userZoneActive && userCentre
      ? [userCentre]
      : zoneCentres.length > 0 ? zoneCentres : [{ lat: GANGES.lat, lng: GANGES.lng, nom: 'Ganges' }]
    if (rayon <= 0) return allEvenements
    return allEvenements.filter(e => {
      const lat = e.lieux?.lat
      const lng = e.lieux?.lng
      if (lat == null || lng == null) return true
      return centres.some(c => haversineKm(lat, lng, c.lat, c.lng) <= rayon)
    })
  }, [allEvenements, rayonAffichage, zoneCentres, userZoneActive, userRayon, userCentre])

  const handleNavTab = (tab: NavTab) => {
    if (tab === 'profil') { router.push('/profil'); return }
    if (tab === 'liste') {
      setNavTab('liste')
      if (navTab !== 'liste') {
        setSheetMode('full')
      } else {
        // cycle : full → half → peek → full
        setSheetMode(m => m === 'full' ? 'half' : m === 'half' ? 'peek' : 'full')
      }
      return
    }
    setNavTab(tab)
    if (tab === 'carte') setSheetMode('half')
  }

  const handleViewOnMap = (id: string) => {
    setSelectedId(id)
    setNavTab('carte')
    setSheetMode('half')
  }

  const showFab = navTab === 'carte' && sheetMode !== 'full'

  return (
    <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', backgroundColor: '#e8dece' }}>

      {/* Carte plein écran — zIndex:1 crée un stacking context, contient les z-index internes de Google Maps */}
      <div className="absolute inset-0" style={{ bottom: NAV_H, zIndex: 1 }}>
        {/* Bande invisible en haut — laisse passer le geste "tirer pour rafraîchir" */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, zIndex: 5, pointerEvents: 'auto' }} />
        <MapView
          evenements={evenements}
          selectedId={selectedId}
          onSelectEvent={setSelectedId}
          onDeselect={() => setSelectedId(null)}
          onOpenEvent={id => router.push(`/evenement/${id}`)}
          centerOn={mapCenterOn}
        />
      </div>

      {/* Bouton Carte fixe — haut gauche */}
      <button
        onClick={() => setFixedMap(!fixedMap)}
        style={{
          position: 'absolute', top: 14, left: 14, zIndex: 200,
          width: 44, height: 44, borderRadius: 12,
          backgroundColor: fixedMap ? 'var(--primary)' : 'rgba(255,255,255,0.92)',
          border: fixedMap ? 'none' : '1px solid #E0D8CE',
          boxShadow: fixedMap ? '0 3px 16px rgba(0,0,0,0.28)' : '0 2px 10px rgba(0,0,0,0.14)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: fixedMap ? '#fff' : '#6B6B6B',
          opacity: navTab === 'carte' ? 1 : 0,
          pointerEvents: navTab === 'carte' ? 'auto' : 'none',
          transition: 'opacity 0.18s, background-color 0.18s',
        }}
      >
        {fixedMap ? (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        ) : (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
          </svg>
        )}
      </button>

      {/* Bouton zone user — sous carte fixe */}
      <button
        onClick={() => setZonePopup(true)}
        style={{
          position: 'absolute', top: 66, left: 14, zIndex: 200,
          width: 44, height: 44, borderRadius: 12,
          backgroundColor: userZoneActive ? 'var(--primary)' : 'rgba(255,255,255,0.92)',
          border: userZoneActive ? 'none' : '1px solid #E0D8CE',
          boxShadow: '0 2px 10px rgba(0,0,0,0.14)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: userZoneActive ? '#fff' : '#6B6B6B',
          opacity: navTab === 'carte' ? 1 : 0,
          pointerEvents: navTab === 'carte' ? 'auto' : 'none',
          transition: 'opacity 0.18s, background-color 0.18s',
          fontSize: 18,
        }}
        title="Filtrer par zone"
      >
        📍
      </button>

      {/* Popup zone user */}
      {zonePopup && (
        <>
          <div
            onClick={() => setZonePopup(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 300, backgroundColor: 'rgba(0,0,0,0.4)' }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
            backgroundColor: '#fff', borderRadius: '20px 20px 0 0',
            padding: '20px 20px 40px', fontFamily: 'Inter, sans-serif',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto 20px' }} />
            <p style={{ fontWeight: 700, fontSize: 16, color: '#2C1810', marginBottom: 4 }}>Ma zone d&apos;affichage</p>
            <p style={{ fontSize: 12, color: '#8A8A8A', marginBottom: 20 }}>Affiche uniquement les événements proches de chez toi.</p>

            {/* Ville */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#8A8A8A', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Village / Commune</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={userVille}
                  onChange={e => setUserVille(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && userVille.trim()) {
                      setGeocoding(true)
                      const r = await fetch(`/api/admin/geocode?q=${encodeURIComponent(userVille + ', Hérault, France')}`)
                      const d = await r.json()
                      if (d.lat) setUserCentre({ lat: d.lat, lng: d.lng, nom: userVille.trim() })
                      setGeocoding(false)
                    }
                  }}
                  placeholder="Ex: Ganges, Le Vigan..."
                  style={{ flex: 1, border: '1px solid #E0D8CE', borderRadius: 12, padding: '10px 14px', fontSize: 14, outline: 'none', backgroundColor: '#FBF7F0' }}
                />
                <button
                  onClick={async () => {
                    if (!userVille.trim()) return
                    setGeocoding(true)
                    const r = await fetch(`/api/admin/geocode?q=${encodeURIComponent(userVille + ', Hérault, France')}`)
                    const d = await r.json()
                    if (d.lat) setUserCentre({ lat: d.lat, lng: d.lng, nom: userVille.trim() })
                    setGeocoding(false)
                  }}
                  disabled={geocoding || !userVille.trim()}
                  style={{ padding: '10px 14px', borderRadius: 12, backgroundColor: '#C4622D', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: geocoding ? 0.5 : 1 }}
                >
                  {geocoding ? '…' : 'OK'}
                </button>
              </div>
              {userCentre && (
                <p style={{ fontSize: 11, color: '#C4622D', marginTop: 6 }}>📍 {userCentre.nom} localisé</p>
              )}
            </div>

            {/* Rayon */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#8A8A8A', textTransform: 'uppercase', letterSpacing: 1 }}>Rayon</p>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#C4622D' }}>{userRayon} km</span>
              </div>
              <input
                type="range" min={5} max={200} step={5}
                value={userRayon}
                onChange={e => setUserRayon(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#C4622D' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#C0B9B0', marginTop: 2 }}>
                <span>5 km</span><span>200 km</span>
              </div>
            </div>

            {/* Actions */}
            <button
              onClick={() => {
                if (!userCentre) return
                const z = { rayon: userRayon, nom: userCentre.nom, lat: userCentre.lat, lng: userCentre.lng }
                localStorage.setItem('pdv-zone-user', JSON.stringify(z))
                setUserZoneActive(true)
                setMapCenterOn({ lat: userCentre.lat, lng: userCentre.lng })
                setZonePopup(false)
              }}
              disabled={!userCentre}
              style={{ width: '100%', padding: '14px', borderRadius: 16, backgroundColor: '#C4622D', color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', marginBottom: 10, opacity: userCentre ? 1 : 0.4 }}
            >
              Appliquer ma zone
            </button>
            {userZoneActive && (
              <button
                onClick={() => {
                  localStorage.removeItem('pdv-zone-user')
                  setUserZoneActive(false)
                  setUserCentre(null)
                  setUserVille('')
                  setZonePopup(false)
                }}
                style={{ width: '100%', padding: '12px', borderRadius: 16, backgroundColor: 'transparent', color: '#8A8A8A', fontWeight: 600, fontSize: 14, border: '1px solid #E0D8CE', cursor: 'pointer' }}
              >
                Réinitialiser (utiliser zone par défaut)
              </button>
            )}
          </div>
        </>
      )}

      {/* FAB "+" — haut droite, visible seulement sur carte non-full */}
      <AnimatePresence>
        {showFab && (
          <motion.div key="fab"
            initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.18 }}
            style={{ position: 'absolute', top: 14, right: 14, zIndex: 200 }}
          >
            <AnimatePresence>
              {fabOpen && (
                <motion.div key="fab-bg"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => setFabOpen(false)}
                  style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.18)', zIndex: -1 }}
                />
              )}
            </AnimatePresence>

            <div style={{ position: 'relative' }}>
              <AnimatePresence>
                {fabOpen && [
                  { label: 'Photo / Affiche', icon: '📷', path: '/capturer' },
                  { label: 'Décrire en texte', icon: '✍️', path: '/ajouter' },
                ].map((opt, i) => (
                  <motion.button key={opt.path}
                    initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => { setFabOpen(false); router.push(opt.path) }}
                    style={{
                      position: 'absolute', right: 60, top: i === 0 ? 2 : 52,
                      display: 'flex', alignItems: 'center', gap: 8,
                      backgroundColor: '#fff', border: '1px solid #EDE8E0',
                      borderRadius: 14, padding: '10px 16px',
                      fontSize: 13, fontWeight: 600, color: '#2C2C2C',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
                      whiteSpace: 'nowrap', cursor: 'pointer',
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{opt.icon}</span> {opt.label}
                  </motion.button>
                ))}
              </AnimatePresence>

              <motion.button
                animate={{ rotate: fabOpen ? 45 : 0 }}
                onClick={() => setFabOpen(o => !o)}
                style={{
                  width: 50, height: 50, borderRadius: '50%',
                  backgroundColor: 'var(--primary)', color: '#fff',
                  fontSize: 28, fontWeight: 300,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 3px 16px rgba(0,0,0,0.28)',
                  border: 'none', cursor: 'pointer',
                }}
              >+</motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Sheet */}
      <BottomSheet
        evenements={evenements}
        loading={loading}
        selectedId={selectedId}
        onSelectEvent={setSelectedId}
        onViewOnMap={handleViewOnMap}
        filtres={filtres}
        onFiltresChange={setFiltres}
        mode={sheetMode}
        onModeChange={setSheetMode}
        navHeight={NAV_H}
      />

      {/* Bottom Nav — 3 onglets */}
      <nav style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: NAV_H,
        backgroundColor: '#fff', borderTop: '1px solid #EDE8E0',
        display: 'flex', zIndex: 30,
      }}>
        {NAV_TABS.map(tab => {
          const active = navTab === tab.id
          return (
            <button key={tab.id} onClick={() => handleNavTab(tab.id)} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
              borderTop: active ? '2.5px solid var(--primary)' : '2.5px solid transparent',
              transition: 'border-color 0.15s',
              paddingBottom: 4,
              color: active ? 'var(--primary)' : '#8A8A8A',
            }}>
              <tab.Icon />
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
