'use client'
import React from 'react'
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ProfilView from '@/components/ProfilView'
import { EvenementCard, Filtres, ProduitCategorie, EtablissementCard, EtablissementType } from '@/lib/types'
import { getDateRange } from '@/lib/filters'
import { useTheme } from '@/components/ThemeProvider'
import { haversineKm, GANGES } from '@/lib/distance'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'

import ProBandeau from '@/components/ProBandeau'
import MaxSplash from '@/components/MaxSplash'
import FavorisView from '@/components/FavorisView'
import NotificationsView from '@/components/NotificationsView'
import CommerceRequestModal from '@/components/CommerceRequestModal'
import AppInfoModal from '@/components/AppInfoModal'
import AppSplash from '@/components/AppSplash'
import WelcomePopup from '@/components/WelcomePopup'
import HubView from '@/components/HubView'
import { ComingSoonModal, UpgradeModal } from '@/components/HubModals'
import { useFavorites } from '@/hooks/useFavorites'
import { useProducerFavorites } from '@/hooks/useProducerFavorites'
import { useNotifications } from '@/hooks/useNotifications'

const MapView                   = dynamic(() => import('@/components/MapView'),                    { ssr: false })
const BottomSheet               = dynamic(() => import('@/components/BottomSheet'),                { ssr: false })
const ProducteurPageClient      = dynamic(() => import('@/app/producteur/[id]/client'),            { ssr: false })
const EtablissementPageClient   = dynamic(() => import('@/app/etablissement/[id]/client'),         { ssr: false })

const defaultFiltres: Filtres = { categories: [], quand: 'toujours' }
const NAV_H = 62

type NavTab = 'accueil' | 'carte' | 'publier' | 'favoris' | 'profil' | 'notifs'

const IconHome = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z"/>
  </svg>
)
const IconCarte = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
    <line x1="9" y1="3" x2="9" y2="18"/>
    <line x1="15" y1="6" x2="15" y2="21"/>
  </svg>
)
const IconProfil = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
)
const IconCoeur = ({ filled }: { filled?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
)
const IconPlus = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const IconBell = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
)

const NAV_TABS: { id: NavTab; label: string; Icon: (p: { active: boolean; badge?: number }) => React.JSX.Element; isFab?: boolean }[] = [
  { id: 'accueil', label: 'Accueil', Icon: () => <IconHome /> },
  { id: 'carte',   label: 'Carte',   Icon: () => <IconCarte /> },
  { id: 'publier', label: 'Publier', Icon: () => <IconPlus />, isFab: true },
  { id: 'favoris', label: 'Favoris', Icon: ({ active }) => <IconCoeur filled={active} /> },
  { id: 'notifs',  label: 'Notifs',  Icon: ({ badge }) => (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <IconBell />
      {badge && badge > 0 ? (
        <span style={{ position: 'absolute', top: -4, right: -5, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#E53935', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', fontFamily: 'Inter, sans-serif', border: '1.5px solid #fff' }}>
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </div>
  )},
  { id: 'profil',  label: 'Profil',  Icon: () => <IconProfil /> },
]

export default function HomePage() {
  const { fixedMap, setFixedMap } = useTheme()
  const { user, loading: authLoading, isAdmin } = useAuth()
  const { favIds, toggle: toggleFav } = useFavorites()
  const { favIds: producerFavIds, toggle: toggleProducerFav } = useProducerFavorites()
  const { unreadCount: notifCount, notifications, loading: notifLoading, loaded: notifLoaded, fetchAll: fetchNotifs, markRead: markNotifRead, markAllRead: markAllNotifsRead } = useNotifications()
  const { openAuthModal } = useAuthModal()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filtres, setFiltres]       = useState<Filtres>(defaultFiltres)
  const [allEvenements, setAllEvenements] = useState<EvenementCard[]>([])
  const [promoEventsData, setPromoEventsData] = useState<EvenementCard[]>([])
  const [splashDone, setSplashDone]           = useState(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem('pdv-splash-done') === '1'
  })
  const [showWelcome, setShowWelcome]         = useState(false)
  const [appMode, setAppMode]                 = useState<'agenda' | 'annuaire'>('agenda')
  // Restore annuaire mode after returning from a producer page
  useEffect(() => {
    const saved = sessionStorage.getItem('appMode')
    if (saved === 'annuaire') { setAppMode('annuaire'); sessionStorage.removeItem('appMode') }
  }, [])
  useEffect(() => { sessionStorage.setItem('appMode', appMode) }, [appMode])
  const [producers, setProducers]             = useState<import('@/lib/types').ProducerCard[]>([])
  const [producerLoading, setProducerLoading] = useState(false)
  const [selectedProducerId, setSelectedProducerId] = useState<string | null>(null)
  const [openProducerId, setOpenProducerIdState]    = useState<string | null>(null)
  const openProducerIdRef = useRef<string | null>(null)
  const [etablissements, setEtablissements]         = useState<EtablissementCard[]>([])
  const [etablissementLoading, setEtablissementLoading] = useState(false)
  const [selectedEtabType, setSelectedEtabType]     = useState<EtablissementType | null>(null)
  const [openEtablissementId, setOpenEtablissementId] = useState<string | null>(null)
  const openEtablissementIdRef = useRef<string | null>(null)
  const [annuaireTab, setAnnuaireTab] = useState(0) // 0 = producteurs, 1 = commerces
  const [etabSearch, setEtabSearch] = useState('')
  const [selectedCats, setSelectedCats] = useState<ProduitCategorie[]>([])
  const [producerSearch, setProducerSearch] = useState('')
  const [loading, setLoading]       = useState(true)
  const [masquerPasses, setMasquerPasses] = useState(true)
  const [zoneCentres, setZoneCentres]   = useState<{ lat: number; lng: number; nom: string }[]>([])
  const [rayonAffichage, setRayonAffichage] = useState<number | null>(null)
  const [zoneLoaded, setZoneLoaded]     = useState(false)

  // Fetch producers when entering annuaire mode (/api/producers est NetworkOnly dans le SW)
  useEffect(() => {
    if (appMode !== 'annuaire') return
    setProducerLoading(true)
    fetch('/api/producers')
      .then(r => r.json())
      .then(d => {
        const list: import('@/lib/types').ProducerCard[] = d.producers ?? []
        const myId = user?.id
        if (myId) {
          const idx = list.findIndex(p => p.user_id === myId)
          if (idx > 0) { const [mine] = list.splice(idx, 1); list.unshift(mine) }
        }
        setProducers(list)
      })
      .catch(() => {})
      .finally(() => setProducerLoading(false))
  }, [appMode, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch établissements quand on entre en mode annuaire
  useEffect(() => {
    if (appMode !== 'annuaire') return
    setEtablissementLoading(true)
    const url = selectedEtabType ? `/api/etablissements?type=${selectedEtabType}` : '/api/etablissements'
    fetch(url)
      .then(r => r.json())
      .then(d => setEtablissements(d.etablissements ?? []))
      .catch(() => {})
      .finally(() => setEtablissementLoading(false))
  }, [appMode, selectedEtabType]) // eslint-disable-line react-hooks/exhaustive-deps

  // Zone user (localStorage)
  const [zonePopup, setZonePopup]       = useState(false)
  const [userRayon, setUserRayon]       = useState<number>(30)
  const [userVille, setUserVille]       = useState('')
  const [userCentre, setUserCentre]     = useState<{ lat: number; lng: number; nom: string } | null>(null)
  const [userZoneActive, setUserZoneActive] = useState(false)
  const [mapCenterOn, setMapCenterOn]   = useState<{ lat: number; lng: number; zoom?: number } | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const s = localStorage.getItem('pdv-carte-depart')
      return s ? JSON.parse(s) : null
    } catch { return null }
  })
  const mapCameraRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null)
  const prevUserRef  = useRef<typeof user>(null)
  const [geocoding, setGeocoding]       = useState(false)
  const [adminMapSaved, setAdminMapSaved] = useState(false)
  const [sheetMode, setSheetMode]   = useState<'peek'|'half'|'full'>('half')
  const [sheetPeekH, setSheetPeekH] = useState(130)
  const [screenH, setScreenH]       = useState(812)
  const [navTab, setNavTab]         = useState<NavTab>('accueil')
  // Hub : écran d'accueil avec tuiles. Par défaut au lancement.
  // Restauré false si l'user était dans un module avant un refresh.
  const [showHub, setShowHub] = useState(() => {
    if (typeof window === 'undefined') return true
    return sessionStorage.getItem('pdv-show-hub') !== '0'
  })
  useEffect(() => {
    try { sessionStorage.setItem('pdv-show-hub', showHub ? '1' : '0') } catch {}
  }, [showHub])

  // Modales du hub
  const [comingSoonLabel, setComingSoonLabel] = useState<string | null>(null)
  const [upgradePrompt, setUpgradePrompt] = useState<{ plan: 'pro' | 'max'; label: string } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [fabOpen, setFabOpen]       = useState(false)
  const [paramsOpen, setParamsOpen] = useState(false)
  const [commerceFormOpen, setCommerceFormOpen] = useState(false)
  const [infoOpen, setInfoOpen]     = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
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
  const router = useRouter()

  // Si on arrive sur / avec ?tab=X (depuis BottomNavBar des pages externes),
  // restaure le bon onglet et quitte le hub. Lecture client-side directe
  // pour éviter le bailout static de useSearchParams().
  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get('tab')
    if (tabParam === 'favoris' || tabParam === 'notifs' || tabParam === 'profil') {
      setShowHub(false)
      setNavTab(tabParam)
      window.history.replaceState({}, '', '/')
    }
  }, [])

  const FAB_OPTS: { key: string; label: string; icon: React.ReactNode; path: string }[] = [
    {
      key: 'photo', label: 'Photo', path: '/capturer',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      ),
    },
    {
      key: 'texte', label: 'Texte', path: '/ajouter',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
      ),
    },
  ]

  const navigateOrAuth = useCallback((path: string) => {
    if (authLoading) return
    if (!user) { setFabOpen(false); openAuthModal(); return }
    router.push(path)
  }, [user, authLoading, openAuthModal, router])

  const handlePublierClick = useCallback(() => {
    if (authLoading) return
    if (!user) { openAuthModal(); return }
    setFabOpen(prev => !prev)
  }, [user, authLoading, openAuthModal])

  const fetchZoneConfig = useCallback(() => {
    fetch('/api/zone')
      .then(r => r.json())
      .then(data => {
        setZoneCentres(data.centres ?? [])
        setRayonAffichage(data.rayon_affichage ?? 0)
        if (data.carte_depart_lat && data.carte_depart_lng) {
          const pos = { lat: data.carte_depart_lat, lng: data.carte_depart_lng, zoom: data.carte_depart_zoom ?? 11 }
          try { localStorage.setItem('pdv-carte-depart', JSON.stringify(pos)) } catch {}
          setMapCenterOn(pos)
        }
      })
      .catch(() => {})
      .finally(() => setZoneLoaded(true))
  }, [])

  useLayoutEffect(() => {
    const update = () => setScreenH(window.innerHeight)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // After login (null → user) — si le flag login-pending est posé, aller sur profil
  // Sauf si pdv-return-to est défini (login depuis une fiche) — dans ce cas on ne touche pas à la nav
  useEffect(() => {
    if (user && !prevUserRef.current) {
      try {
        const returnTo = sessionStorage.getItem('pdv-return-to')
        if (returnTo) {
          sessionStorage.removeItem('pdv-return-to')
          sessionStorage.removeItem('pdv-login-pending')
          window.location.href = returnTo
          return
        }
        if (sessionStorage.getItem('pdv-login-pending')) {
          sessionStorage.removeItem('pdv-login-pending')
          setNavTab('profil')
        }
      } catch {}
    }
    prevUserRef.current = user
  }, [user])

  // Restore navigation state on back-navigation from event page
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('pdv-nav-state')
      if (!saved) return
      sessionStorage.removeItem('pdv-nav-state')
      const s = JSON.parse(saved)
      if (s.filtres)    setFiltres(s.filtres)
      if (s.sheetMode)  setSheetMode(s.sheetMode)
      if (s.appMode) setAppMode(s.appMode as 'agenda' | 'annuaire')
      if (s.selectedProducerId) setSelectedProducerId(s.selectedProducerId)
      if (s.selectedId) {
        setSelectedId(s.selectedId)
      } else if (s.mapLat != null && s.mapLng != null) {
        setMapCenterOn({ lat: s.mapLat, lng: s.mapLng, zoom: s.mapZoom })
      }
    } catch {}
  }, []) // mount only

  // Nettoyage défensif au démarrage — évite les états bloquants sur cold restart
  useEffect(() => {
    try {
      const nav = sessionStorage.getItem('pdv-nav-state')
      if (nav) {
        const parsed = JSON.parse(nav)
        // Si la clé existe mais est invalide/vieille, on la purge
        if (!parsed || typeof parsed !== 'object') sessionStorage.removeItem('pdv-nav-state')
      }
    } catch {
      sessionStorage.removeItem('pdv-nav-state')
    }
  }, [])

  // Config chargée une seule fois au mount + écoute changements admin
  useEffect(() => {
    supabase.from('config').select('value').eq('key', 'masquer_passes').single()
      .then(({ data, error }) => setMasquerPasses(error ? true : data?.value !== 'false'))
    fetchZoneConfig()
    fetch('/api/admin/cleanup', { method: 'POST' }).catch(() => {})

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

  const fetchEvenements = useCallback(async (silent = false) => {
    if (!zoneLoaded) return // attendre la zone
    if (!silent) setLoading(true)

    const SELECT = 'id, titre, categorie, date_debut, heure, image_url, image_position, promotion, promo_ordre, lieux(id, nom, commune, lat, lng, place_id_google)'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase.from('evenements').select(SELECT).eq('statut', 'publie').order('date_debut', { ascending: true }).limit(300)
    if (filtres.categories.length > 0) query = query.in('categorie', filtres.categories)
    const range = getDateRange(filtres.quand)
    if (range) query = query.gte('date_debut', range.from).lte('date_debut', range.to)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let promoQuery: any = supabase.from('evenements').select(SELECT).eq('statut', 'publie').in('promotion', ['pro', 'max']).order('date_debut', { ascending: true })

    if (masquerPasses) {
      const d = new Date()
      const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      query = query.or(`date_fin.gte.${today},and(date_fin.is.null,date_debut.gte.${today})`)
      promoQuery = promoQuery.or(`date_fin.gte.${today},and(date_fin.is.null,date_debut.gte.${today})`)
    }

    try {
      const [{ data }, { data: promoData }] = await Promise.all([query, promoQuery])
      setAllEvenements((data as EvenementCard[]) ?? [])
      setPromoEventsData((promoData as EvenementCard[]) ?? [])
    } catch {
      // réseau coupé (app en arrière-plan) — on vide pas les données existantes
    } finally {
      if (!silent) setLoading(false)
    }
  }, [filtres, masquerPasses, zoneLoaded])

  useEffect(() => { fetchEvenements() }, [fetchEvenements])

  // Relancer le fetch quand l'app revient au premier plan
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fetchEvenements(true) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchEvenements])

  // Sheet full → active le mode liste ; sheet réduite → revient en carte
  // Exception : sur le hub ou les onglets statiques, on ne touche pas au navTab
  useEffect(() => {
    if (showHub) return
    if (sheetMode !== 'full') {
      setNavTab(prev => (prev === 'profil' || prev === 'favoris' || prev === 'notifs' || prev === 'accueil') ? prev : 'carte')
    }
  }, [sheetMode, showHub])

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
  const evenementsZone = useMemo(() => {
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

  // Filtre texte appliqué après tous les autres filtres
  const evenements = useMemo(() => {
    if (!searchQuery.trim()) return evenementsZone
    const q = searchQuery.toLowerCase()
    return evenementsZone.filter(e =>
      e.titre.toLowerCase().includes(q) ||
      e.lieux?.commune?.toLowerCase().includes(q) ||
      e.lieux?.nom?.toLowerCase().includes(q)
    )
  }, [evenementsZone, searchQuery])

  // Promoted events bypass user category/date filters — fetched independently
  const maxEvents = useMemo(() => promoEventsData.filter(e => e.promotion === 'max'), [promoEventsData])
  // Bandeau shows all promoted events (both pro and max)
  const proEvents = useMemo(() => promoEventsData.filter(e => e.promotion === 'pro' || e.promotion === 'max'), [promoEventsData])

  const handleNavTab = (tab: NavTab) => {
    // Ferme tout overlay etab/producer ouvert quand l'user clique sur la bottom nav
    if (openProducerIdRef.current) { setOpenProducerIdState(null); openProducerIdRef.current = null }
    if (openEtablissementIdRef.current) { setOpenEtablissementId(null); openEtablissementIdRef.current = null }
    if (tab === 'accueil') { setShowHub(true); setNavTab('accueil'); return }
    if (tab === 'publier') { setPublishOpen(true); return }
    // Pour tous les autres onglets, on quitte le hub si on y était
    if (showHub) setShowHub(false)
    if (tab === 'profil')  { setNavTab('profil');  return }
    if (tab === 'favoris') { setNavTab('favoris'); return }
    if (tab === 'notifs')  { setNavTab('notifs');  return }
    setNavTab(tab)
    if (tab === 'carte') setSheetMode('half')
  }

  // Handlers tuiles du hub
  const enterAgenda = () => {
    setShowHub(false)
    setAppMode('agenda')
    setNavTab('carte')
    setSheetMode('half')
  }
  const enterAnnuaire = (typeFilter?: EtablissementType) => {
    setShowHub(false)
    setAppMode('annuaire')
    setAnnuaireTab(1)
    setSelectedEtabType(typeFilter ?? null)
    setNavTab('carte')
    setSheetMode('half')
  }
  const enterProducteurs = () => {
    setShowHub(false)
    setAppMode('annuaire')
    setAnnuaireTab(0)
    setNavTab('carte')
    setSheetMode('half')
  }

  const handleViewOnMap = (id: string) => {
    setSelectedId(id)
    setNavTab('carte')
    setSheetMode('half')
  }

  const availableProducerCats = useMemo(() => {
    const s = new Set<ProduitCategorie>()
    producers.forEach(p => p.produit_categories.forEach(c => s.add(c)))
    return s
  }, [producers])

  const filteredProducers = useMemo(() => {
    return producers
      .filter(p => selectedCats.length === 0 || selectedCats.some(c => p.produit_categories.includes(c)))
      .filter(p => {
        if (!producerSearch) return true
        const q = producerSearch.toLowerCase()
        return (
          p.nom.toLowerCase().includes(q) ||
          (p.commune ?? '').toLowerCase().includes(q) ||
          p.produits_disponibles.some(pr => pr.nom.toLowerCase().includes(q))
        )
      })
  }, [producers, selectedCats, producerSearch])

  const featuredProducers = useMemo(() => producers.filter(p => p.is_featured), [producers])

  const filteredEtablissements = useMemo(() => {
    const rayon   = userZoneActive ? userRayon : (rayonAffichage ?? 0)
    const centres = userZoneActive && userCentre
      ? [userCentre]
      : zoneCentres.length > 0 ? zoneCentres : [{ lat: GANGES.lat, lng: GANGES.lng, nom: 'Ganges' }]

    return etablissements
      .filter(e => {
        if (rayon <= 0 || e.lat == null || e.lng == null) return true
        return centres.some(c => haversineKm(e.lat!, e.lng!, c.lat, c.lng) <= rayon)
      })
      .filter(e => {
        if (!etabSearch.trim()) return true
        const q = etabSearch.toLowerCase()
        return e.nom.toLowerCase().includes(q) || (e.commune ?? '').toLowerCase().includes(q)
      })
  }, [etablissements, etabSearch, userZoneActive, userRayon, userCentre, zoneCentres, rayonAffichage])

  const openProducer = useCallback((id: string) => {
    openProducerIdRef.current = id
    setOpenProducerIdState(id)
    history.pushState({ pdv: 'producer', id }, '', `/producteur/${id}`)
  }, [])

  const closeProducer = useCallback(() => {
    if (!openProducerIdRef.current) return
    openProducerIdRef.current = null
    setOpenProducerIdState(null)
    if (window.location.pathname.startsWith('/producteur/')) history.back()
  }, [])

  // Ferme l'overlay producteur quand l'utilisateur appuie sur "retour"
  useEffect(() => {
    const onPop = () => {
      if (openProducerIdRef.current) {
        openProducerIdRef.current = null
        setOpenProducerIdState(null)
      }
      if (openEtablissementIdRef.current) {
        openEtablissementIdRef.current = null
        setOpenEtablissementId(null)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const openEtablissement = useCallback((id: string) => {
    openEtablissementIdRef.current = id
    setOpenEtablissementId(id)
    history.pushState({ pdv: 'etablissement', id }, '', `/etablissement/${id}`)
  }, [])

  const closeEtablissement = useCallback(() => {
    if (!openEtablissementIdRef.current) return
    openEtablissementIdRef.current = null
    setOpenEtablissementId(null)
    if (window.location.pathname.startsWith('/etablissement/')) history.back()
  }, [])

  const handleViewProducerOnMap = (id: string) => {
    const p = producers.find(x => x.id === id)
    setSelectedProducerId(id)
    setNavTab('carte')
    setSheetMode('half')
    if (p?.lat && p?.lng) setMapCenterOn({ lat: p.lat, lng: p.lng, zoom: 15 })
  }

  const saveNavForEvent = useCallback((id: string) => {
    try {
      sessionStorage.setItem('pdv-nav-state', JSON.stringify({
        filtres, sheetMode: 'peek', selectedId: id,
        mapLat: mapCameraRef.current?.lat,
        mapLng: mapCameraRef.current?.lng,
        mapZoom: mapCameraRef.current?.zoom,
      }))
    } catch {}
  }, [filtres])


  const openEvent = useCallback((id: string) => {
    saveNavForEvent(id)
    router.push(`/evenement/${id}`)
  }, [saveNavForEvent, router])

  const showFab = !showHub && navTab === 'carte' && sheetMode !== 'full' && !openProducerId && !openEtablissementId

  return (
    <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', backgroundColor: '#e8dece' }}>

      {/* Hub d'accueil — couvre tout sauf la bottom nav */}
      {showHub && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: NAV_H, zIndex: 25, overflowY: 'auto', backgroundColor: 'var(--creme)' }}>
          <HubView
            onSelectAgenda={enterAgenda}
            onSelectAnnuaire={enterAnnuaire}
            onSelectProducteurs={enterProducteurs}
            onComingSoon={setComingSoonLabel}
            onUpgradePrompt={(plan, label) => setUpgradePrompt({ plan, label })}
            onOpenNotifs={() => handleNavTab('notifs')}
            unreadCount={notifCount}
          />
        </div>
      )}

      {/* Modale "Bientôt disponible" */}
      {comingSoonLabel && (
        <ComingSoonModal label={comingSoonLabel} onClose={() => setComingSoonLabel(null)} />
      )}

      {/* Modale "Abonnement requis" */}
      {upgradePrompt && (
        <UpgradeModal
          requiredPlan={upgradePrompt.plan}
          label={upgradePrompt.label}
          onClose={() => setUpgradePrompt(null)}
          onGoToPlan={() => {
            setUpgradePrompt(null)
            setShowHub(false)
            setNavTab('profil')
          }}
        />
      )}

      {/* Carte plein écran — zIndex:1 crée un stacking context, contient les z-index internes de Google Maps */}
      <div className="absolute inset-0" style={{ bottom: NAV_H, zIndex: 1 }}>
        {/* Bande invisible en haut — laisse passer le geste "tirer pour rafraîchir" */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, zIndex: 5, pointerEvents: 'auto' }} />
        <MapView
          evenements={appMode === 'annuaire' ? [] : evenements}
          producers={appMode === 'annuaire' && annuaireTab === 0 ? filteredProducers : []}
          selectedProducerId={selectedProducerId}
          onSelectProducer={setSelectedProducerId}
          onOpenProducer={openProducer}
          etablissements={appMode === 'annuaire' && annuaireTab === 1 ? filteredEtablissements : []}
          onOpenEtablissement={openEtablissement}
          selectedId={selectedId}
          onSelectEvent={setSelectedId}
          onDeselect={() => setSelectedId(null)}
          onOpenEvent={openEvent}
          centerOn={mapCenterOn}
          onMapDragStart={onMapDragStart}
          onMapDragEnd={onMapDragEnd}
          onCameraIdle={(lat, lng, zoom) => { mapCameraRef.current = { lat, lng, zoom } }}
        />
      </div>

      {/* ─── Boutons carte — haut gauche + haut droite ─── */}
      {(() => {
        const showBtns = !showHub && navTab === 'carte' && sheetMode !== 'full' && !openProducerId && !openEtablissementId
        const BTN: React.CSSProperties = { width: 44, height: 44, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.14)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E0D8CE', transition: 'background-color 0.15s' }
        const activeColor = (on: boolean): React.CSSProperties => on ? { backgroundColor: 'var(--primary)', border: 'none', color: '#fff' } : { backgroundColor: 'rgba(255,255,255,0.92)', color: '#6B6B6B' }
        return (
          <>
            {/* Stack gauche */}
            <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8, opacity: showBtns && !searchOpen ? 1 : 0, pointerEvents: showBtns && !searchOpen ? 'auto' : 'none', transition: 'opacity 0.18s' }}>

              {/* Paramètres */}
              <button onClick={() => setParamsOpen(p => !p)} style={{ ...BTN, ...activeColor(paramsOpen) }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>

              {/* Sub-buttons */}
              <AnimatePresence>
                {paramsOpen && (
                  <motion.div key="params-sub" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.14 }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button onClick={() => setFixedMap(!fixedMap)} style={{ ...BTN, ...activeColor(fixedMap) }}>
                      {fixedMap
                        ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>}
                    </button>
                    <button onClick={() => { setZonePopup(true); setParamsOpen(false) }} style={{ ...BTN, ...activeColor(userZoneActive), fontSize: 18 }}>📍</button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Loupe */}
              <button onClick={() => { setSearchOpen(true); setParamsOpen(false); setTimeout(() => searchInputRef.current?.focus(), 80) }}
                style={{ ...BTN, ...activeColor(false) }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
              </button>
            </div>

            {/* Bouton Info — haut droite */}
            <button onClick={() => setInfoOpen(true)} style={{ ...BTN, position: 'absolute', top: 14, right: 14, zIndex: 200, opacity: showBtns ? 1 : 0, pointerEvents: showBtns ? 'auto' : 'none', transition: 'opacity 0.18s', backgroundColor: 'rgba(255,255,255,0.92)', color: '#6B6B6B' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </button>

            {/* Barre de recherche */}
            <AnimatePresence>
              {searchOpen && showBtns && (
                <motion.div key="search-bar" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
                  style={{ position: 'absolute', top: 14, left: 14, right: 14, zIndex: 210, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.16)', border: '1px solid #E0D8CE', padding: '0 12px', height: 44 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8A8A8A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input ref={searchInputRef}
                      value={appMode === 'annuaire' ? producerSearch : searchQuery}
                      onChange={e => appMode === 'annuaire' ? setProducerSearch(e.target.value) : setSearchQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); setProducerSearch('') } }}
                      placeholder={appMode === 'annuaire' ? 'Rechercher un producteur…' : 'Rechercher un événement…'}
                      style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, backgroundColor: 'transparent', marginLeft: 8, color: '#2C1810', fontFamily: 'Inter, sans-serif' }}
                    />
                    {(searchQuery || producerSearch) && (
                      <button onClick={() => { setSearchQuery(''); setProducerSearch('') }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#AAA', fontSize: 15, padding: '0 2px', display: 'flex' }}>✕</button>
                    )}
                  </div>
                  <button onClick={() => { setSearchOpen(false); setSearchQuery(''); setProducerSearch('') }}
                    style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12, border: 'none', backgroundColor: 'rgba(255,255,255,0.92)', boxShadow: '0 2px 10px rgba(0,0,0,0.14)', cursor: 'pointer', color: '#6B6B6B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>✕</button>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )
      })()}

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

            {isAdmin && (
              <>
                <div style={{ borderTop: '1px solid #F0EBE3', margin: '16px 0 12px' }} />
                <button
                  onClick={async () => {
                    const cam = mapCameraRef.current
                    if (!cam) return
                    const pos = { lat: cam.lat, lng: cam.lng, zoom: cam.zoom }
                    await fetch('/api/admin/zone', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ carte_depart_lat: pos.lat, carte_depart_lng: pos.lng, carte_depart_zoom: pos.zoom }),
                    })
                    try { localStorage.setItem('pdv-carte-depart', JSON.stringify(pos)) } catch {}
                    setMapCenterOn(pos)
                    setAdminMapSaved(true)
                    setTimeout(() => setAdminMapSaved(false), 2000)
                  }}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 16, border: 'none',
                    backgroundColor: adminMapSaved ? '#2D5A3D' : '#1C3829',
                    color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'background-color 0.3s',
                  }}
                >
                  <span>{adminMapSaved ? '✓' : '📍'}</span>
                  {adminMapSaved ? 'Point de départ enregistré !' : 'Fixer le point de départ de la carte ici'}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* FAB haut centre — mode-aware */}
      <AnimatePresence>
        {showFab && (
          <motion.div key="fab"
            initial={{ opacity: 0, scale: 0.85, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.85, y: -4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            style={{ position: 'absolute', top: 14, left: 0, right: 0, zIndex: 200, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}
          >
            {appMode === 'annuaire' ? (
              <button onClick={() => { if (!user) openAuthModal(); else setCommerceFormOpen(true) }}
                style={{ height: 40, borderRadius: 20, border: 'none', backgroundColor: '#2D5A3D', color: '#fff', display: 'flex', alignItems: 'center', gap: 7, padding: '0 16px', boxShadow: '0 4px 18px rgba(0,0,0,0.25)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', pointerEvents: 'auto' }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <line x1="10" y1="2" x2="10" y2="18" stroke="white" strokeWidth="2.4" strokeLinecap="round"/>
                  <line x1="2" y1="10" x2="18" y2="10" stroke="white" strokeWidth="2.4" strokeLinecap="round"/>
                </svg>
                <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>Référencer</span>
              </button>
            ) : (
              <div style={{ position: 'relative', pointerEvents: 'auto' }}>
                {fabOpen && <div onClick={() => setFabOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: -1 }} />}
                <button onClick={handlePublierClick}
                  style={{ height: 40, borderRadius: 20, border: 'none', backgroundColor: '#2D5A3D', color: '#fff', display: 'flex', alignItems: 'center', gap: 7, padding: '0 16px', boxShadow: '0 4px 18px rgba(0,0,0,0.25)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <line x1="10" y1="2" x2="10" y2="18" stroke="white" strokeWidth="2.4" strokeLinecap="round"/>
                    <line x1="2" y1="10" x2="18" y2="10" stroke="white" strokeWidth="2.4" strokeLinecap="round"/>
                  </svg>
                  <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>Publier</span>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={fabOpen ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'}/>
                  </svg>
                </button>
                <AnimatePresence>
                  {fabOpen && (
                    <motion.div key="fab-drop"
                      initial={{ opacity: 0, scale: 0.9, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -6 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                      style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 8, backgroundColor: '#fff', borderRadius: 14, boxShadow: '0 6px 28px rgba(0,0,0,0.18)', overflow: 'hidden', minWidth: 152 }}>
                      {FAB_OPTS.map((opt, i) => (
                        <button key={opt.key} onClick={() => { setFabOpen(false); navigateOrAuth(opt.path) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 16px', border: 'none', borderTop: i > 0 ? '1px solid #F2ECE4' : 'none', backgroundColor: 'transparent', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: '#2C1810', textAlign: 'left' }}>
                          <div style={{ color: '#2D5A3D' }}>{opt.icon}</div>
                          {opt.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ProBandeau flottant sur la carte — 2/3 largeur, se fait avaler par le sheet (zIndex 19 < 20) */}
      {!showHub && proEvents.length > 0 && appMode === 'agenda' && navTab !== 'profil' && navTab !== 'favoris' && navTab !== 'notifs' && (
        <div style={{
          position: 'absolute', left: 0, right: '33%',
          bottom: NAV_H + sheetPeekH,
          zIndex: 19,
          opacity: sheetMode === 'full' ? 0 : 1,
          pointerEvents: sheetMode === 'full' ? 'none' : 'auto',
          transition: 'opacity 0.2s',
        }}>
          <ProBandeau events={proEvents} onDiscover={openEvent} compact={false} />
        </div>
      )}

      {/* Bottom Sheet — masqué sur le hub */}
      {!showHub && <BottomSheet
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
        screenH={screenH}
        onPeekHeightChange={setSheetPeekH}
        proEvents={proEvents}
        onDiscoverPro={openEvent}
        onOpenEvent={saveNavForEvent}
        favIds={favIds}
        onToggleFav={toggleFav}
        appMode={appMode}
        onAppModeChange={setAppMode}
        producers={filteredProducers}
        producerLoading={producerLoading}
        selectedProducerId={selectedProducerId}
        onSelectProducer={setSelectedProducerId}
        onViewProducerOnMap={handleViewProducerOnMap}
        selectedCats={selectedCats}
        onSelectedCatsChange={setSelectedCats}
        availableProducerCats={availableProducerCats}
        producerSearch={producerSearch}
        onProducerSearchChange={setProducerSearch}
        producerFavIds={producerFavIds}
        onToggleProducerFav={toggleProducerFav}
        featuredProducers={featuredProducers}
        onOpenProducer={openProducer}
        etablissements={filteredEtablissements}
        etablissementLoading={etablissementLoading}
        selectedEtabType={selectedEtabType}
        onEtabTypeChange={setSelectedEtabType}
        onOpenEtablissement={openEtablissement}
        etabSearch={etabSearch}
        onEtabSearchChange={setEtabSearch}
        annuaireTab={annuaireTab}
        onAnnuaireTabChange={setAnnuaireTab}
      />}

      {/* Favoris — panneau inline au-dessus de la carte */}
      {navTab === 'favoris' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: NAV_H,
          zIndex: 25, overflowY: 'auto', backgroundColor: 'var(--creme)',
        }}>
          <FavorisView
            events={allEvenements.filter(e => favIds.includes(e.id))}
            onToggleFav={toggleFav}
            onOpenProducer={openProducer}
            onOpenEtablissement={openEtablissement}
          />
        </div>
      )}

      {/* Notifications — panneau inline au-dessus de la carte */}
      {navTab === 'notifs' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: NAV_H,
          zIndex: 25, overflowY: 'auto', backgroundColor: 'var(--creme)',
        }}>
          <NotificationsView
            notifications={notifications}
            loading={notifLoading}
            loaded={notifLoaded}
            onOpen={fetchNotifs}
            onMarkRead={markNotifRead}
            onMarkAllRead={markAllNotifsRead}
            onOpenProducer={openProducer}
          />
        </div>
      )}

      {/* Profil — panneau inline au-dessus de la carte */}
      {navTab === 'profil' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: NAV_H,
          zIndex: 25, overflowY: 'auto', backgroundColor: 'var(--creme)',
        }}>
          <ProfilView />
        </div>
      )}

      {/* Overlay fiche producteur — sans navigation, retour = popstate
          bottom: NAV_H laisse la bottom bar toujours visible et utilisable */}
      {openProducerId && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: NAV_H, zIndex: 35, overflowY: 'auto', backgroundColor: '#F2EBE0' }}>
          <ProducteurPageClient id={openProducerId} onBack={closeProducer} />
        </div>
      )}

      {/* Overlay fiche établissement — idem, nav toujours accessible */}
      {openEtablissementId && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: NAV_H, zIndex: 35, overflowY: 'auto', backgroundColor: '#FDFAF6' }}>
          <EtablissementPageClient id={openEtablissementId} onBack={closeEtablissement} />
        </div>
      )}

      <MaxSplash events={maxEvents} loading={loading} />

      {!splashDone && <AppSplash onDone={() => {
        sessionStorage.setItem('pdv-splash-done', '1')
        setSplashDone(true)
        if (typeof window !== 'undefined' && !localStorage.getItem('pdv-welcome-seen')) {
          setShowWelcome(true)
        }
      }} />}
      {showWelcome && <WelcomePopup onClose={() => {
        setShowWelcome(false)
        localStorage.setItem('pdv-welcome-seen', '1')
      }} />}

      {commerceFormOpen && <CommerceRequestModal onClose={() => setCommerceFormOpen(false)} />}
      {infoOpen && <AppInfoModal onClose={() => setInfoOpen(false)} />}

      {/* Bottom Nav avec FAB central "Publier" */}
      <nav style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: NAV_H,
        backgroundColor: '#fff', borderTop: '1px solid #EDE8E0',
        display: 'flex', zIndex: 30, alignItems: 'stretch',
      }}>
        {NAV_TABS.map(tab => {
          const active = navTab === tab.id
          const badge = tab.id === 'notifs' ? notifCount : undefined
          if (tab.isFab) {
            return (
              <div key={tab.id} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <button
                  onClick={() => handleNavTab(tab.id)}
                  style={{
                    position: 'absolute', top: -22,
                    width: 60, height: 60, borderRadius: '50%',
                    border: '4px solid #fff', backgroundColor: 'var(--primary)',
                    color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 6px 16px rgba(45,90,61,0.35)',
                  }}
                  aria-label="Publier"
                >
                  <tab.Icon active={active} />
                </button>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#8A8A8A', fontFamily: 'Inter, sans-serif', marginTop: 30 }}>
                  {tab.label}
                </span>
              </div>
            )
          }
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
              <tab.Icon active={active} badge={badge} />
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Modale Publier */}
      {publishOpen && (
        <PublishChoiceModal
          onClose={() => setPublishOpen(false)}
          onCommerceRequest={() => { setPublishOpen(false); setCommerceFormOpen(true) }}
        />
      )}
    </div>
  )
}

function PublishChoiceModal({ onClose, onCommerceRequest }: { onClose: () => void; onCommerceRequest: () => void }) {
  const router = useRouter()

  const handleChoice = (action: () => void) => { onClose(); action() }

  const choices = [
    {
      id: 'annonce',
      icon: '🏷️',
      iconBg: '#FBE9E7', iconColor: '#C0392B',
      label: 'Une annonce',
      desc: 'Vente, troc, don ou enchère inversée',
      action: () => router.push('/annonces/nouvelle'),
    },
    {
      id: 'evenement',
      icon: '🎉',
      iconBg: '#E8F2EB', iconColor: '#2D5A3D',
      label: 'Un événement',
      desc: 'Concert, marché, soirée — photo ou saisie texte',
      action: () => router.push('/ajouter'),
    },
    {
      id: 'pro',
      icon: '🏪',
      iconBg: '#EEF3FF', iconColor: '#3A5BC7',
      label: 'Un professionnel',
      desc: 'Soumettre une fiche établissement / commerce',
      action: onCommerceRequest,
    },
  ]

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
        backgroundColor: '#FDFAF6', borderRadius: '24px 24px 0 0',
        padding: '20px 20px 32px', fontFamily: 'Inter, sans-serif',
        boxShadow: '0 -8px 30px rgba(0,0,0,0.2)',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto 18px' }} />
        <h3 style={{ margin: '0 0 18px', fontSize: 19, fontWeight: 900, color: '#1A1209', textAlign: 'center' }}>
          Que veux-tu publier ?
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {choices.map(c => (
            <button
              key={c.id}
              onClick={() => handleChoice(c.action)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', borderRadius: 14,
                border: '1.5px solid #E5DDD2', backgroundColor: '#fff',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}
            >
              <span style={{
                width: 44, height: 44, borderRadius: 12, backgroundColor: c.iconBg, color: c.iconColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
              }}>{c.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#1A1209' }}>{c.label}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#8A7A6A' }}>{c.desc}</p>
              </div>
              <span style={{ color: '#C8B8A8', fontSize: 18 }}>›</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
