'use client'
import React from 'react'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
  const mapDragTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sheetBeforeMapRef = useRef<'peek'|'half'|'full' | null>(null)

  const onMapDragStart = useCallback(() => {
    if (mapDragTimerRef.current) clearTimeout(mapDragTimerRef.current)
    setSheetMode(prev => {
      if (prev === 'half') { sheetBeforeMapRef.current = 'half'; return 'peek' }
      return prev
    })
  }, [])

  const onMapDragEnd = useCallback(() => {
    mapDragTimerRef.current = setTimeout(() => {
      if (sheetBeforeMapRef.current === 'half') {
        sheetBeforeMapRef.current = null
        setSheetMode('half')
      }
    }, 350)
  }, [])
  const [fabPressed, setFabPressed] = useState(false)
  const [fabActive, setFabActive]   = useState<string | null>(null)
  const fabCenterRef = useRef({ x: 0, y: 0 })
  const router = useRouter()

  const FAB_OPTS: { key: string; label: string; icon: React.ReactNode; path: string; dx: number; dy: number }[] = [
    {
      key: 'photo', label: 'Photo', path: '/capturer', dx: -108, dy: 4,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      ),
    },
    {
      key: 'texte', label: 'Texte', path: '/ajouter', dx: -80, dy: 92,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
      ),
    },
  ]

  const onFabDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    fabCenterRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    setFabPressed(true)
    setFabOpen(true)
    setFabActive(null)
  }

  const onFabMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!fabOpen) return
    const { x: cx, y: cy } = fabCenterRef.current
    let best: string | null = null
    let bestDist = 58
    for (const opt of FAB_OPTS) {
      const d = Math.hypot(e.clientX - (cx + opt.dx), e.clientY - (cy + opt.dy))
      if (d < bestDist) { bestDist = d; best = opt.key }
    }
    setFabActive(best)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onFabUp = (_e: React.PointerEvent<HTMLButtonElement>) => {
    setFabPressed(false)
    if (fabActive) {
      const opt = FAB_OPTS.find(o => o.key === fabActive)
      if (opt) { setFabOpen(false); setFabActive(null); router.push(opt.path); return }
    }
    setFabActive(null)
    // tap sans slide → garde le menu ouvert pour clic manuel
  }

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
  }, [fetchZoneConfig]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Quand la liste redescend (half/peek), réactiver le mode carte pour les boutons
  useEffect(() => {
    if (sheetMode !== 'full') setNavTab('carte')
  }, [sheetMode])

  // Sélection d'un marqueur → peek ; déselection → half
  useEffect(() => {
    if (selectedId) {
      setSheetMode(prev => {
        if (prev === 'half') { sheetBeforeMapRef.current = 'half'; return 'peek' }
        return prev
      })
    } else {
      if (sheetBeforeMapRef.current === 'half') {
        sheetBeforeMapRef.current = null
        setSheetMode('half')
      }
    }
  }, [selectedId])

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
          onMapDragStart={onMapDragStart}
          onMapDragEnd={onMapDragEnd}
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

      {/* FAB radial — haut droite, visible seulement sur carte non-full */}
      <AnimatePresence>
        {showFab && (
          <motion.div key="fab"
            initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            style={{ position: 'absolute', top: 14, right: 14, zIndex: 200 }}
          >
            {/* Backdrop */}
            <AnimatePresence>
              {fabOpen && (
                <motion.div key="fab-bg"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => { setFabOpen(false); setFabActive(null) }}
                  style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.22)', zIndex: -1 }}
                />
              )}
            </AnimatePresence>

            {/* Options radiales */}
            <div style={{ position: 'relative', width: 52, height: 52 }}>
              {FAB_OPTS.map((opt) => (
                <motion.div
                  key={opt.key}
                  initial={false}
                  animate={{
                    x: fabOpen ? opt.dx : 0,
                    y: fabOpen ? opt.dy : 0,
                    scale: fabOpen ? (fabActive === opt.key ? 1.18 : 1) : 0,
                    opacity: fabOpen ? 1 : 0,
                  }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  style={{
                    position: 'absolute', top: 0, left: 0,
                    width: 52, height: 52,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    pointerEvents: fabOpen ? 'auto' : 'none',
                    gap: 5,
                  }}
                  onClick={() => { setFabOpen(false); setFabActive(null); router.push(opt.path) }}
                >
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    backgroundColor: fabActive === opt.key ? 'var(--primary)' : '#fff',
                    boxShadow: fabActive === opt.key
                      ? '0 6px 24px rgba(0,0,0,0.30)'
                      : '0 3px 14px rgba(0,0,0,0.18)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background-color 0.12s, box-shadow 0.12s',
                    cursor: 'pointer',
                    color: fabActive === opt.key ? '#fff' : 'var(--primary)',
                  }}>
                    {opt.icon}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: '#fff', whiteSpace: 'nowrap',
                    textShadow: '0 1px 4px rgba(0,0,0,0.6)',
                    fontFamily: 'Inter, sans-serif',
                    position: 'absolute', top: 56,
                  }}>{opt.label}</span>
                </motion.div>
              ))}

              {/* FAB button */}
              <motion.button
                animate={{ scale: fabPressed ? 1.12 : 1, rotate: fabOpen ? 45 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                onPointerDown={onFabDown}
                onPointerMove={onFabMove}
                onPointerUp={onFabUp}
                onPointerCancel={onFabUp}
                style={{
                  position: 'relative', zIndex: 1,
                  width: 52, height: 52, borderRadius: '50%',
                  backgroundColor: 'var(--primary)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 18px rgba(0,0,0,0.30)',
                  border: 'none', cursor: 'pointer', touchAction: 'none',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <line x1="10" y1="2" x2="10" y2="18" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
                  <line x1="2" y1="10" x2="18" y2="10" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
                </svg>
              </motion.button>
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
