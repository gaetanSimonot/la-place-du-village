'use client'
import React from 'react'
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import useSWR from 'swr'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ProfilHybridView from '@/components/profil/ProfilHybridView'
import { EvenementCard, Filtres, ProduitCategorie, EtablissementCard, EtablissementType } from '@/lib/types'
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
import WelcomeModal from '@/components/WelcomeModal'
import HubView from '@/components/HubView'
import HubSearchModal, { type SearchKind } from '@/components/HubSearchModal'
import PublishMenuModal from '@/components/PublishMenuModal'
import BottomNavBar from '@/components/BottomNavBar'
import { ComingSoonModal } from '@/components/HubModals'
import SubscriptionModal from '@/components/SubscriptionModal'
import { useFavorites } from '@/hooks/useFavorites'
import { useProducerFavorites } from '@/hooks/useProducerFavorites'
import { useNotifications } from '@/hooks/useNotifications'

const MapView                   = dynamic(() => import('@/components/MapView'),                    { ssr: false })
const BottomSheet               = dynamic(() => import('@/components/BottomSheet'),                { ssr: false })
// ProducteurPageClient / EtablissementPageClient : retirés (sous-étape 5.2)
// Les fiches sont maintenant rendues via les intercepting routes
// @modal/(.)producteur/[id] et @modal/(.)etablissement/[id].

const defaultFiltres: Filtres = { categories: [], quand: 'toujours' }
const NAV_H = 62

type NavTab = 'accueil' | 'carte' | 'annonces' | 'favoris' | 'profil' | 'notifs'

export default function HomePage() {
  const { fixedMap, setFixedMap } = useTheme()
  const { user, profile, loading: authLoading, isAdmin } = useAuth()
  const { favIds, toggle: toggleFav } = useFavorites()
  const { favIds: producerFavIds, toggle: toggleProducerFav } = useProducerFavorites()
  const { unreadCount: notifCount, notifications, loading: notifLoading, loaded: notifLoaded, fetchAll: fetchNotifs, markRead: markNotifRead, markAllRead: markAllNotifsRead, removeNotif } = useNotifications()
  const { openAuthModal } = useAuthModal()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filtres, setFiltres]       = useState<Filtres>(defaultFiltres)
  const [allEvenements, setAllEvenements] = useState<EvenementCard[]>([])
  const [promoEventsData, setPromoEventsData] = useState<EvenementCard[]>([])
  const [splashFeaturedEvents, setSplashFeaturedEvents] = useState<EvenementCard[]>([])
  const [showWelcome, setShowWelcome]         = useState(false)
  // Welcome modal une fois par session navigateur (au lieu d'attendre la fin
  // d'un splash dédié, qui faisait doublon avec le splash natif PWA).
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!sessionStorage.getItem('pdv-welcome-shown')) setShowWelcome(true)
  }, [])
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
  // openProducerId / openEtablissementId : supprimés (sous-étape 5.2).
  // Les fiches s'affichent via intercepting routes (.)producteur/[id] et
  // (.)etablissement/[id] dans le slot @modal. État géré par le router Next.
  const [etablissements, setEtablissements]         = useState<EtablissementCard[]>([])
  const [etablissementLoading, setEtablissementLoading] = useState(false)
  const [selectedEtabType, setSelectedEtabType]     = useState<EtablissementType | null>(null)
  const [annuaireTab, setAnnuaireTab] = useState(0) // 0 = producteurs, 1 = commerces
  const [etabSearch, setEtabSearch] = useState('')
  const [selectedCats, setSelectedCats] = useState<ProduitCategorie[]>([])
  const [producerSearch, setProducerSearch] = useState('')
  const [loading, setLoading]       = useState(true)
  const [masquerPasses, setMasquerPasses] = useState(true)
  const [zoneCentres, setZoneCentres]   = useState<{ lat: number; lng: number; nom: string }[]>([])
  const [rayonAffichage, setRayonAffichage] = useState<number | null>(null)
  const [zoneLoaded, setZoneLoaded]     = useState(false)

  // SWR sur /api/annuaire — clé inclut le type filtre. Disable quand on n'est
  // pas en mode annuaire (key=null) → SWR ne fetch pas, mais garde le cache
  // de la dernière entrée. Au retour en annuaire, affichage instantané.
  const annuaireKey = appMode === 'annuaire'
    ? (selectedEtabType ? `/api/annuaire?type=${selectedEtabType}` : '/api/annuaire')
    : null

  const { data: annuaireData, isLoading: annuaireLoadingRaw } = useSWR(annuaireKey)

  // Tri "mes producteurs en premier" : PERSO côté client, appliqué sur le
  // payload SWR. useMemo pour ne pas recompute sans raison.
  useEffect(() => {
    if (!annuaireData) return
    const list: import('@/lib/types').ProducerCard[] = annuaireData.producers ?? []
    const myId = user?.id
    if (myId) {
      const idx = list.findIndex(p => p.user_id === myId)
      if (idx > 0) {
        const sorted = [...list]
        const [mine] = sorted.splice(idx, 1)
        sorted.unshift(mine)
        setProducers(sorted)
      } else {
        setProducers(list)
      }
    } else {
      setProducers(list)
    }
    setEtablissements(annuaireData.etablissements ?? [])
  }, [annuaireData, user?.id])

  useEffect(() => {
    const fetching = annuaireKey !== null && annuaireLoadingRaw && !annuaireData
    setProducerLoading(fetching)
    setEtablissementLoading(fetching)
  }, [annuaireKey, annuaireLoadingRaw, annuaireData])

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
  const [, setGeocoding]                = useState(false)
  const [adminMapSaved, setAdminMapSaved] = useState(false)
  const [sheetMode, setSheetMode]   = useState<'peek'|'half'|'full'>('half')
  const [sheetPeekH, setSheetPeekH] = useState(130)
  const [screenH, setScreenH]       = useState(812)
  const [navTab, setNavTab]         = useState<NavTab>(() => {
    if (typeof window === 'undefined') return 'accueil'
    const saved = sessionStorage.getItem('pdv-nav-tab') as NavTab | null
    return saved ?? 'accueil'
  })
  // Persiste navTab pour survivre aux navigations (ex: retour depuis /ajouter,
  // /capturer, /covoiturage/[id], etc.). Sans ça, navTab repart à 'accueil'
  // au mount → la condition `navTab === 'carte'` redevient fausse → les boutons
  // top (filtres, +, loupe) disparaissent à tort.
  useEffect(() => {
    try { sessionStorage.setItem('pdv-nav-tab', navTab) } catch {}
  }, [navTab])
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
  const [upgradePrompt, setUpgradePrompt] = useState<{ plan: 'habitants' | 'pro'; label: string } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [fabOpen, setFabOpen]       = useState(false)
  const [commerceFormOpen, setCommerceFormOpen] = useState(false)
  const [infoOpen, setInfoOpen]     = useState(false)
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

  const handlePublierClick = useCallback(() => {
    if (authLoading) return
    if (!user) { openAuthModal(); return }
    setFabOpen(true)
  }, [user, authLoading, openAuthModal])

  const handlePublishPick = useCallback((kind: 'event' | 'annonce' | 'commerce') => {
    setFabOpen(false)
    if (kind === 'event')      router.push('/ajouter')
    else if (kind === 'annonce') router.push('/annonces/nouvelle')
    else                       setCommerceFormOpen(true)
  }, [router])

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

  // After login (null → user) — restore la page d origine pour les flows
  // synchrones (signInWithPassword via AuthModal sur une fiche).
  // Pour OAuth, le callback redirige deja directement vers `next` via l URL,
  // donc cet effect ne fait rien (returnTo est null en sessionStorage).
  useEffect(() => {
    if (user && !prevUserRef.current) {
      try {
        const returnTo = sessionStorage.getItem('pdv-return-to')
        const wasPending = sessionStorage.getItem('pdv-login-pending')
        sessionStorage.removeItem('pdv-return-to')
        sessionStorage.removeItem('pdv-login-pending')
        // Si returnTo specifique != URL courante -> reload sur la cible
        if (returnTo && returnTo !== window.location.pathname + window.location.search) {
          window.location.href = returnTo
          return
        }
        // Si pas de returnTo specifique mais pending : on basculait avant sur
        // 'profil'. Ne fait sens que si l user vient de l onglet Profil
        // (LoginView). Pour eviter de l envoyer sur Profil depuis une fiche,
        // on ne bascule que si navTab est deja accueil (et que le user a
        // cliqué LoginView via la bottom-nav profil sans loggé).
        if (wasPending && !returnTo) {
          // No-op : la BottomNav reflete deja l onglet courant, et ProfilView
          // se met a jour automatiquement quand user devient defini.
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
        // Au retour d'une fiche event : force vue carte (sinon navTab reste à
        // 'accueil' et les FAB / boutons map disparaissent). Si l'user voulait
        // le Hub, il a son onglet pour y retourner.
        setShowHub(false)
        setNavTab('carte')
        // Centre aussi la map sur la dernière position si dispo
        if (s.mapLat != null && s.mapLng != null) {
          setMapCenterOn({ lat: s.mapLat, lng: s.mapLng, zoom: s.mapZoom })
        }
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

  // ──────────────────────────────────────────────────────────────────────
  // MIROIR URL ↔ état (sous-étape 5.1)
  //
  // L'URL devient un miroir de l'écran courant + filtres → refresh ou
  // partage de lien restaurent le bon écran SANS recharger ni démonter.
  // Pattern history.replaceState (pas router.push) → aucune nav Next,
  // aucun remount. Même approche que le ?tab= déjà en place sur /profil.
  //
  // Champs sync :
  //   ?mode=hub|agenda|annuaire   (showHub + appMode combinés)
  //   ?cat=concert,marche         (filtres.categories en CSV)
  //   ?quand=cette_semaine        (filtres.quand si != 'toujours')
  //   ?ann=commerces              (annuaireTab=1, omis si producteurs)
  //   ?prodcat=legumes,fruits     (selectedCats en CSV, mode annuaire only)
  //   ?q=texte                    (producerSearch ou etabSearch selon ann)
  //
  // URL > sessionStorage : si ?mode= explicit, on l'applique. Sinon les
  // autres useEffect (sessionStorage / pdv-nav-state) restent maîtres.
  // ──────────────────────────────────────────────────────────────────────

  // 1) RESTAURATION depuis URL au MOUNT (URL prend priorité si présente)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    if (!sp.has('mode')) return  // pas d'URL state → laisse sessionStorage faire

    const mode = sp.get('mode')
    if (mode === 'hub') {
      setShowHub(true)
    } else if (mode === 'agenda') {
      setShowHub(false)
      setAppMode('agenda')
    } else if (mode === 'annuaire') {
      setShowHub(false)
      setAppMode('annuaire')
    }

    // Filtres agenda
    const cat   = sp.get('cat')
    const quand = sp.get('quand')
    if (cat || quand) {
      setFiltres(prev => ({
        categories: cat
          ? (cat.split(',').filter(Boolean) as import('@/lib/types').Categorie[])
          : prev.categories,
        quand: (quand as import('@/lib/types').FiltreQuand) ?? prev.quand,
      }))
    }

    // Onglet + filtres annuaire
    const ann = sp.get('ann')
    const annTabFromUrl = ann === 'commerces' ? 1 : 0
    if (ann === 'commerces') setAnnuaireTab(1)
    else if (ann === 'producteurs') setAnnuaireTab(0)

    const prodcat = sp.get('prodcat')
    if (prodcat) setSelectedCats(prodcat.split(',').filter(Boolean) as ProduitCategorie[])

    // Recherche selon l'onglet annuaire courant (déduit depuis l'URL)
    const q = sp.get('q')
    if (q) {
      if (annTabFromUrl === 1) setEtabSearch(q)
      else                     setProducerSearch(q)
    }
  }, [])

  // 2) SYNC état → URL (replaceState, miroir non bloquant)
  useEffect(() => {
    const sp = new URLSearchParams()
    const mode = showHub ? 'hub' : appMode
    // hub est l'état par défaut → on garde l'URL propre sans ?mode= dans ce cas
    if (mode !== 'hub') sp.set('mode', mode)

    if (mode === 'agenda') {
      if (filtres.categories.length > 0) sp.set('cat', filtres.categories.join(','))
      if (filtres.quand !== 'toujours')  sp.set('quand', filtres.quand)
    } else if (mode === 'annuaire') {
      if (annuaireTab === 1) sp.set('ann', 'commerces')
      if (annuaireTab === 0 && selectedCats.length > 0) sp.set('prodcat', selectedCats.join(','))
      const q = (annuaireTab === 0 ? producerSearch : etabSearch).trim()
      if (q) sp.set('q', q)
    }

    // Préserve les autres query params éventuels (?tab=, etc. utilisés par d'autres flows)
    const current = new URLSearchParams(window.location.search)
    current.forEach((v, k) => {
      if (k !== 'mode' && k !== 'cat' && k !== 'quand' && k !== 'ann' && k !== 'prodcat' && k !== 'q') {
        sp.set(k, v)
      }
    })

    const search = sp.toString()
    const newUrl = window.location.pathname + (search ? `?${search}` : '')
    if (window.location.pathname + window.location.search !== newUrl) {
      window.history.replaceState(window.history.state, '', newUrl)
    }
  }, [showHub, appMode, filtres, annuaireTab, selectedCats, producerSearch, etabSearch])

  // Config chargée une seule fois au mount + écoute changements admin
  useEffect(() => {
    supabase.from('config').select('value').eq('key', 'masquer_passes').single()
      .then(({ data, error }) => setMasquerPasses(error ? true : data?.value !== 'false'))
    fetchZoneConfig()
    // Cleanup silencieux : nécessite admin (la route est maintenant gardée).
    // Si l'user n'est pas admin → 403 silencieux, pas de souci.
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const tk = session?.access_token
      if (!tk) return
      fetch('/api/admin/cleanup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tk}` },
      }).catch(() => {})
    })()

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

  // SWR sur /api/agenda — clé inclut les filtres (cat + quand + masquerPasses)
  // pour que chaque combinaison ait sa propre entrée cache. Le retour sur la
  // page (quitter / revenir) sert depuis cache mémoire SWR instantanément,
  // puis revalide en fond (revalidateOnFocus hérité du SWRProvider global).
  const agendaKey = useMemo(() => {
    if (!zoneLoaded) return null  // pas de fetch tant que zone pas prête
    const params = new URLSearchParams()
    if (filtres.categories.length > 0) params.set('cat', filtres.categories.join(','))
    params.set('quand', filtres.quand)
    if (masquerPasses) params.set('masquerPasses', '1')
    return `/api/agenda?${params.toString()}`
  }, [filtres, masquerPasses, zoneLoaded])

  const { data: agendaData, isLoading: agendaLoadingRaw } = useSWR(agendaKey)

  // Sync des states existants depuis agendaData (le rendu utilise les states
  // legacy → minimisation du diff dans la grosse page.tsx).
  useEffect(() => {
    if (!agendaData) return
    setAllEvenements((agendaData.evenements as EvenementCard[]) ?? [])
    setPromoEventsData((agendaData.promoEvents as EvenementCard[]) ?? [])
    setSplashFeaturedEvents((agendaData.splashFeatured as EvenementCard[]) ?? [])
  }, [agendaData])

  // Loading initial : tant que SWR n'a pas remonté de data ET qu'on est en train
  // de fetcher, on affiche le loader. Au retour (cache hit), data est déjà là
  // → pas de loader, affichage instantané.
  useEffect(() => {
    setLoading(agendaKey !== null && agendaLoadingRaw && !agendaData)
  }, [agendaKey, agendaLoadingRaw, agendaData])

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
  const maxEventsLegacy = useMemo(() => promoEventsData.filter(e => e.promotion === 'max'), [promoEventsData])
  // Bandeau shows all promoted events (both pro and max)
  const proEvents = useMemo(() => promoEventsData.filter(e => e.promotion === 'pro' || e.promotion === 'max'), [promoEventsData])

  // Splash : featured_slots slot='splash' (override) > fallback legacy promotion='max'
  const splashEvents = splashFeaturedEvents.length > 0 ? splashFeaturedEvents : maxEventsLegacy

  const handleNavTab = (tab: NavTab) => {
    // Note : si une intercepting route (.)producteur/[id] ou (.)etablissement/[id]
    // est ouverte, la nav vers la home est gérée par Next.js. Pas besoin de
    // close manuel comme avant.
    if (tab === 'accueil') { setShowHub(true); setNavTab('accueil'); return }
    if (tab === 'annonces') { router.push('/annonces'); return }
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
  const enterAgendaToday = () => {
    setShowHub(false)
    setAppMode('agenda')
    setFiltres(f => ({ ...f, quand: 'aujourd_hui' }))
    setNavTab('carte')
    setSheetMode('full') // sheet plein pour voir la liste filtrée
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

  // "Voir tout sur la carte" depuis la modale recherche globale
  const handleSearchViewAll = useCallback((kind: SearchKind, query: string) => {
    setShowHub(false)
    setSelectedId(null)
    setNavTab('carte')
    setSheetMode('half')
    if (kind === 'evenement') {
      setAppMode('agenda')
      setSearchQuery(query)
    } else if (kind === 'etablissement') {
      setAppMode('annuaire')
      setAnnuaireTab(1)
      setSelectedEtabType(null)
      setEtabSearch(query)
    } else {
      setAppMode('annuaire')
      setAnnuaireTab(0)
      setProducerSearch(query)
    }
  }, [])

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
    // Quand l'user fait une recherche active → ignore le filtre zone/rayon
    // (il cherche un nom précis, doit pouvoir trouver même hors zone)
    const hasActiveSearch = etabSearch.trim().length > 0

    return etablissements
      .filter(e => {
        if (hasActiveSearch) return true
        if (rayon <= 0 || e.lat == null || e.lng == null) return true
        return centres.some(c => haversineKm(e.lat!, e.lng!, c.lat, c.lng) <= rayon)
      })
      .filter(e => {
        if (!hasActiveSearch) return true
        const q = etabSearch.toLowerCase().trim()
        return e.nom.toLowerCase().includes(q) || (e.commune ?? '').toLowerCase().includes(q)
      })
  }, [etablissements, etabSearch, userZoneActive, userRayon, userCentre, zoneCentres, rayonAffichage])

  // ─────────────────────────────────────────────────────────────────────
  // Sous-étape 5.2 : overlays producteur/établissement → intercepting routes
  // Next.js (slot @modal au root layout). openProducer/openEtablissement
  // deviennent de simples router.push : le slot intercepte le soft-nav et
  // affiche la fiche par-dessus la home (children) — la home + sa carte
  // restent montées dessous → pas de remount.
  //
  // Refresh / lien direct sur /producteur/[id] ou /etablissement/[id] →
  // la vraie route prend le relais plein écran (SSR OpenGraph).
  //
  // Supprimé :
  //   - openProducerIdRef / openEtablissementIdRef
  //   - history.pushState hack
  //   - listener popstate dédié aux overlays + coordination HistoryTrap
  //   - closeProducer / closeEtablissement (router.back() côté fiche suffit)
  // ─────────────────────────────────────────────────────────────────────
  // { scroll: false } : Next ne scrolle pas la window au push → la home
  // (carte + sheet + listes) reste visuellement figée pendant que le shell
  // modal s'ouvre par-dessus. Au retour (close modal), aucun re-scroll
  // non plus → scroll interne préservé comme avec l'ancien overlay.
  const openProducer      = useCallback((id: string) => router.push(`/producteur/${id}`,    { scroll: false }), [router])
  const openEtablissement = useCallback((id: string) => router.push(`/etablissement/${id}`, { scroll: false }), [router])

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

  return (
    <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', backgroundColor: '#e8dece' }}>

      {/* Hub d'accueil — couvre tout sauf la bottom nav */}
      {showHub && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: NAV_H, zIndex: 25, overflowY: 'auto', backgroundColor: 'var(--creme)' }}>
          <HubView
            onSelectAgenda={enterAgenda}
            onSelectAgendaToday={enterAgendaToday}
            onSelectAnnuaire={enterAnnuaire}
            onSelectProducteurs={enterProducteurs}
            onComingSoon={setComingSoonLabel}
            onUpgradePrompt={(plan, label) => setUpgradePrompt({ plan, label })}
            onOpenNotifs={() => handleNavTab('notifs')}
            onOpenInfo={() => setInfoOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
            unreadCount={notifCount}
          />
        </div>
      )}

      {/* Modale "Bientôt disponible" */}
      {comingSoonLabel && (
        <ComingSoonModal label={comingSoonLabel} onClose={() => setComingSoonLabel(null)} />
      )}

      {/* Modale "Abonnement requis" — pitch Stripe direct */}
      {upgradePrompt && (
        <SubscriptionModal
          context={{ kind: 'feature', featureLabel: upgradePrompt.label, minPlan: upgradePrompt.plan }}
          onClose={() => setUpgradePrompt(null)}
          currentPlan={(profile?.plan as 'basic' | 'habitants' | 'pro') ?? 'basic'}
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
        // showBtns : les fiches producteur/etab ouvertes ne sont plus
        // un state local — elles sont gérées par les intercepting routes.
        // Le slot @modal au layout masque les boutons via z-index.
        const showBtns = !showHub && navTab === 'carte' && sheetMode !== 'full' && !searchOpen
        // V3 derived map mode (evt/etab/prod)
        const mapMode: 'evt' | 'etab' | 'prod' =
          appMode === 'agenda' ? 'evt' : annuaireTab === 1 ? 'etab' : 'prod'
        const setMapMode = (m: 'evt' | 'etab' | 'prod') => {
          if (m === 'evt') { setAppMode('agenda') }
          else { setAppMode('annuaire'); setAnnuaireTab(m === 'etab' ? 1 : 0) }
        }
        const MODES = [
          { id: 'evt' as const, label: 'Événements' },
          { id: 'etab' as const, label: 'Commerces' },
          { id: 'prod' as const, label: 'Producteurs' },
        ]
        const FBTN: React.CSSProperties = { width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1A1209', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }
        // Filtre texte actif (hérité de la recherche du hub) — chip visible et effaçable
        const activeSearch =
          mapMode === 'evt'  ? searchQuery   :
          mapMode === 'etab' ? etabSearch    :
                               producerSearch
        const clearActiveSearch = () => {
          if (mapMode === 'evt')       setSearchQuery('')
          else if (mapMode === 'etab') setEtabSearch('')
          else                         setProducerSearch('')
        }
        return (
          <>
            {/* V3 — Top bar : back + segmented 3-mode + Publier+ */}
            {showBtns && (
              <div style={{ position: 'absolute', top: 14, left: 12, right: 12, zIndex: 200, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => { setShowHub(true); setNavTab('accueil') }}
                  aria-label="Retour au hub"
                  style={{ width: 42, height: 42, borderRadius: 14, background: '#fff', border: '1px solid #E8E0D4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1A1209', cursor: 'pointer', flexShrink: 0, boxShadow: '0 3px 12px rgba(0,0,0,0.12)' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                  </svg>
                </button>
                <div style={{ flex: 1, display: 'flex', background: '#fff', borderRadius: 14, padding: 4, gap: 2, border: '1px solid #E8E0D4', boxShadow: '0 3px 12px rgba(0,0,0,0.12)' }}>
                  {MODES.map(m => {
                    const active = mapMode === m.id
                    return (
                      <button
                        key={m.id}
                        onClick={() => setMapMode(m.id)}
                        style={{
                          flex: 1, padding: '7px 4px', borderRadius: 10, border: 'none', cursor: 'pointer',
                          background: active ? '#2D5A3D' : 'transparent',
                          color: active ? '#fff' : '#7A6A5A',
                          fontFamily: 'Inter, sans-serif', fontWeight: active ? 800 : 700, fontSize: 11,
                          whiteSpace: 'nowrap', transition: 'all 0.15s',
                        }}
                      >
                        {m.label}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={handlePublierClick}
                  aria-label="Publier"
                  style={{ width: 42, height: 42, borderRadius: 14, background: '#2D5A3D', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', flexShrink: 0, boxShadow: '0 4px 14px rgba(45,90,61,0.35)' }}
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <line x1="10" y1="3" x2="10" y2="17" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
                    <line x1="3" y1="10" x2="17" y2="10" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )}

            {/* V3 — Stack 3 boutons flottants 38px à gauche (sous la top bar) */}
            {showBtns && (
              <div style={{ position: 'absolute', top: 70, left: 14, zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => setZonePopup(true)} style={FBTN} aria-label="Réglages de la carte">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
                <button onClick={() => setSearchOpen(true)} style={FBTN} aria-label="Recherche">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                </button>
                <button onClick={() => setInfoOpen(true)} style={FBTN} aria-label="Infos / FAQ">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                </button>
              </div>
            )}

            {/* Chip filtre texte actif — vient de la recherche du hub, retirable */}
            {showBtns && activeSearch.trim() && (
              <div style={{
                position: 'absolute', top: 70, left: 64, right: 14, zIndex: 200,
                display: 'flex', justifyContent: 'flex-start',
              }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  maxWidth: '100%',
                  background: '#fff', border: '1px solid #E8E0D4', borderRadius: 999,
                  padding: '7px 6px 7px 12px',
                  boxShadow: '0 3px 12px rgba(0,0,0,0.12)',
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7A6A5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: '#1A1209',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: 180,
                  }}>
                    {activeSearch}
                  </span>
                  <button
                    type="button"
                    onClick={clearActiveSearch}
                    aria-label="Retirer le filtre"
                    style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: '#F0EAE0', border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#7A6A5A', cursor: 'pointer', flexShrink: 0, padding: 0,
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )
      })()}

      {/* Réglages de la carte — V3 */}
      {zonePopup && (
        <>
          <div
            onClick={() => setZonePopup(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(26,18,9,0.55)', backdropFilter: 'blur(3px)' }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
            backgroundColor: '#fff', borderRadius: '22px 22px 0 0',
            display: 'flex', flexDirection: 'column',
            maxHeight: '88dvh',
            fontFamily: 'Inter, sans-serif',
          }}>
            {/* Grabber */}
            <div style={{ width: 40, height: 4, borderRadius: 999, background: '#E4DED2', margin: '10px auto 6px', flexShrink: 0 }} />

            {/* Header DM Serif + reset link */}
            <div style={{ padding: '8px 20px 14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
              <h2 style={{
                margin: 0, fontFamily: 'var(--font-dm-serif), Georgia, serif',
                fontSize: 22, color: '#1A1209', letterSpacing: '-0.01em', lineHeight: 1.1,
              }}>
                Réglages de la carte
              </h2>
              {userZoneActive && (
                <button
                  onClick={() => {
                    localStorage.removeItem('pdv-zone-user')
                    setUserZoneActive(false)
                    setUserCentre(null)
                    setUserVille('')
                  }}
                  style={{ background: 'none', border: 'none', color: '#2D5A3D', fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                >
                  Réinitialiser
                </button>
              )}
            </div>

            {/* Scroll body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
              {/* CENTRÉ SUR */}
              <p style={{ fontSize: 11, fontWeight: 800, color: '#7A6A5A', textTransform: 'uppercase', letterSpacing: 1, margin: '6px 4px 8px' }}>Centré sur</p>
              <div style={{
                background: '#FDFAF5', border: '1px solid #F0EAE0', borderRadius: 14,
                padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: '#E8F2EB', color: '#2D5A3D', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1209', letterSpacing: '-0.01em' }}>
                    {userCentre?.nom ?? userVille ?? 'Ganges'}
                  </div>
                  <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2 }}>
                    {userZoneActive ? 'Zone personnelle active' : 'Zone par défaut du village'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
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
                    placeholder="Changer…"
                    style={{ width: 110, border: '1px solid #E0D8CE', borderRadius: 10, padding: '7px 10px', fontSize: 12, outline: 'none', background: '#fff', fontFamily: 'inherit' }}
                  />
                </div>
              </div>

              {/* RAYON DE RECHERCHE */}
              <p style={{ fontSize: 11, fontWeight: 800, color: '#7A6A5A', textTransform: 'uppercase', letterSpacing: 1, margin: '14px 4px 8px' }}>Rayon de recherche</p>
              <div style={{ background: '#FDFAF5', border: '1px solid #F0EAE0', borderRadius: 14, padding: '14px 14px 16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
                  <span style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif', fontSize: 32, color: '#2D5A3D', lineHeight: 1 }}>{userRayon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#2D5A3D' }}>km</span>
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                  {[5, 10, 30, 50, 100].map(km => {
                    const active = userRayon === km
                    return (
                      <button
                        key={km}
                        onClick={() => setUserRayon(km)}
                        style={{
                          padding: '6px 12px', borderRadius: 999,
                          fontSize: 12, fontWeight: 800, cursor: 'pointer',
                          background: active ? '#2D5A3D' : '#fff',
                          color: active ? '#fff' : '#7A6A5A',
                          border: `1px solid ${active ? '#2D5A3D' : '#E5DDD2'}`,
                          fontFamily: 'inherit',
                        }}
                      >
                        {km} km
                      </button>
                    )
                  })}
                </div>
                <input
                  type="range" min={5} max={200} step={5}
                  value={userRayon}
                  onChange={e => setUserRayon(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#2D5A3D' }}
                />
              </div>

              {/* COMPORTEMENT */}
              <p style={{ fontSize: 11, fontWeight: 800, color: '#7A6A5A', textTransform: 'uppercase', letterSpacing: 1, margin: '14px 4px 8px' }}>Comportement</p>
              <div style={{ background: '#FDFAF5', border: '1px solid #F0EAE0', borderRadius: 14, marginBottom: 16, overflow: 'hidden' }}>
                <button
                  onClick={() => setFixedMap(!fixedMap)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1209' }}>Fixer la carte</div>
                    <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2 }}>Empêche le déplacement libre.</div>
                  </div>
                  <div style={{
                    width: 36, height: 22, borderRadius: 999,
                    background: fixedMap ? '#2D5A3D' : '#E5DDD2',
                    position: 'relative', transition: 'background 0.18s', flexShrink: 0,
                  }}>
                    <div style={{
                      position: 'absolute', top: 2, left: fixedMap ? 16 : 2,
                      width: 18, height: 18, borderRadius: '50%',
                      background: '#fff', transition: 'left 0.18s',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                </button>
                <div style={{ height: 1, background: '#F0EAE0' }} />
                <button
                  onClick={() => setMasquerPasses(!masquerPasses)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1209' }}>Masquer les événements passés</div>
                    <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2 }}>Cache les événements terminés.</div>
                  </div>
                  <div style={{
                    width: 36, height: 22, borderRadius: 999,
                    background: masquerPasses ? '#2D5A3D' : '#E5DDD2',
                    position: 'relative', transition: 'background 0.18s', flexShrink: 0,
                  }}>
                    <div style={{
                      position: 'absolute', top: 2, left: masquerPasses ? 16 : 2,
                      width: 18, height: 18, borderRadius: '50%',
                      background: '#fff', transition: 'left 0.18s',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                </button>
              </div>

              {isAdmin && (
                <>
                  <div style={{ borderTop: '1px solid #F0EBE3', margin: '8px 0 12px' }} />
                  <button
                    onClick={async () => {
                      const cam = mapCameraRef.current
                      if (!cam) return
                      const pos = { lat: cam.lat, lng: cam.lng, zoom: cam.zoom }
                      const { data: { session: sess } } = await supabase.auth.getSession()
                      const tk = sess?.access_token
                      await fetch('/api/admin/zone', {
                        method: 'PATCH',
                        headers: {
                          'Content-Type': 'application/json',
                          ...(tk ? { Authorization: `Bearer ${tk}` } : {}),
                        },
                        body: JSON.stringify({ carte_depart_lat: pos.lat, carte_depart_lng: pos.lng, carte_depart_zoom: pos.zoom }),
                      })
                      try { localStorage.setItem('pdv-carte-depart', JSON.stringify(pos)) } catch {}
                      setMapCenterOn(pos)
                      setAdminMapSaved(true)
                      setTimeout(() => setAdminMapSaved(false), 2000)
                    }}
                    style={{
                      width: '100%', padding: '12px', borderRadius: 14, border: 'none',
                      background: adminMapSaved ? '#2D5A3D' : '#1C3829',
                      color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      transition: 'background-color 0.3s', fontFamily: 'inherit',
                      marginBottom: 12,
                    }}
                  >
                    <span>{adminMapSaved ? '✓' : '📍'}</span>
                    {adminMapSaved ? 'Point de départ enregistré !' : 'Fixer le point de départ ici'}
                  </button>
                </>
              )}
            </div>

            {/* Sticky CTA "Appliquer" */}
            <div style={{ padding: '12px 16px 16px', borderTop: '1px solid #F0EAE0', background: '#fff', flexShrink: 0, paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' }}>
              <button
                onClick={() => {
                  if (userCentre) {
                    const z = { rayon: userRayon, nom: userCentre.nom, lat: userCentre.lat, lng: userCentre.lng }
                    localStorage.setItem('pdv-zone-user', JSON.stringify(z))
                    setUserZoneActive(true)
                    setMapCenterOn({ lat: userCentre.lat, lng: userCentre.lng })
                  }
                  setZonePopup(false)
                }}
                style={{ width: '100%', padding: 14, borderRadius: 14, background: '#2D5A3D', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Appliquer
              </button>
            </div>
          </div>
        </>
      )}

      {/* FAB haut centre — mode-aware */}

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
        topBarV3
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
            onDelete={removeNotif}
            onOpenProducer={openProducer}
            onBack={() => handleNavTab('accueil')}
          />
        </div>
      )}

      {/* Profil — panneau inline au-dessus de la carte (refonte V3 — hybride social) */}
      {navTab === 'profil' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: NAV_H,
          zIndex: 25, overflowY: 'auto', backgroundColor: 'var(--creme)',
        }}>
          <ProfilHybridView />
        </div>
      )}

      {/* Fiches producteur/établissement : sous-étape 5.2 — rendues via
          intercepting routes Next.js dans le slot @modal du root layout.
          Plus de rendu local : router.push('/producteur/[id]') depuis la
          carte ouvre la fiche par-dessus children sans démonter la home. */}

      <MaxSplash events={splashEvents} loading={loading} />

      {showWelcome && <WelcomeModal onClose={() => {
        setShowWelcome(false)
        sessionStorage.setItem('pdv-welcome-shown', '1')
      }} />}

      {commerceFormOpen && <CommerceRequestModal onClose={() => setCommerceFormOpen(false)} />}
      {infoOpen && <AppInfoModal onClose={() => setInfoOpen(false)} />}

      {/* Modale recherche globale — accessible depuis hub (loupe header) et carte (loupe gauche) */}
      <HubSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onViewAll={handleSearchViewAll}
      />

      {/* Modale "Publier" — 5 options (event, annonce, capture, commerce, producteur) */}
      <PublishMenuModal
        open={fabOpen}
        onClose={() => setFabOpen(false)}
        onPick={handlePublishPick}
      />

      {/* Bottom Nav — composant unifié, navigation par state interne via onNavigate */}
      <BottomNavBar
        activeTab={navTab}
        onNavigate={(id) => handleNavTab(id as NavTab)}
      />

    </div>
  )
}

