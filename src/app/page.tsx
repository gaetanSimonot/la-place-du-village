'use client'
import React from 'react'
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import useSWR from 'swr'
import { useMotionValue } from 'framer-motion'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { EvenementCard, Filtres, ProduitCategorie, EtablissementCard, EtablissementType } from '@/lib/types'
import { useTheme } from '@/components/ThemeProvider'
import { haversineKm, GANGES } from '@/lib/distance'
import { normSearch } from '@/lib/filters'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'

import ProBandeau from '@/components/ProBandeau'
import AgendaFilterWheel, { AgendaDateButton } from '@/components/AgendaFilterWheel'
import DesktopMapFilters from '@/components/desktop/DesktopMapFilters'
import DesktopEventModal from '@/components/desktop/DesktopEventModal'
import VillageView from '@/components/VillageView'
import HubSearchModal, { type SearchKind } from '@/components/HubSearchModal'
import PublishMenuModal from '@/components/PublishMenuModal'
import BottomNavBar, { NAV_H } from '@/components/BottomNavBar'
import { toast } from 'sonner'
import { trackEvent } from '@/lib/analytics'
import { ComingSoonModal } from '@/components/HubModals'
import { useFavorites } from '@/hooks/useFavorites'
import { useProducerFavorites } from '@/hooks/useProducerFavorites'
import { useNotifications } from '@/hooks/useNotifications'
import { ecranBureau } from '@/lib/bureau'


/**
 * Ecrans et modales charges A LA DEMANDE.
 *
 * L'ecran carte les importait tous en dur : leur code etait telecharge et
 * analyse avant que la carte apparaisse, alors qu'aucun ne s'affiche au
 * demarrage. 417 ko a l'ouverture, dont plus du quart pour des ecrans qu'on
 * n'ouvre peut-etre jamais.
 *
 * Le village n'est PAS dans cette liste : c'est l'ecran d'atterrissage de la
 * version bureau, il doit etre la sans attendre.
 */
const ProfilHybridView     = dynamic(() => import('@/components/profil/ProfilHybridView'), { ssr: false })
const FavorisView          = dynamic(() => import('@/components/FavorisView'),             { ssr: false })
const NotificationsView    = dynamic(() => import('@/components/NotificationsView'),       { ssr: false })
const HubView              = dynamic(() => import('@/components/HubView'),                 { ssr: false })
const TransportPanneau     = dynamic(() => import('@/components/TransportPanneau'),        { ssr: false })
const CommerceRequestModal = dynamic(() => import('@/components/CommerceRequestModal'),    { ssr: false })
const SubscriptionModal    = dynamic(() => import('@/components/SubscriptionModal'),       { ssr: false })
const AppInfoModal         = dynamic(() => import('@/components/AppInfoModal'),            { ssr: false })
const WelcomeModal         = dynamic(() => import('@/components/WelcomeModal'),            { ssr: false })
const EditorialSplash      = dynamic(() => import('@/components/EditorialSplash'),         { ssr: false })
const MaxSplash            = dynamic(() => import('@/components/MaxSplash'),               { ssr: false })
const MapView                   = dynamic(() => import('@/components/MapViewSwitch'),              { ssr: false })
const BottomSheet               = dynamic(() => import('@/components/BottomSheet'),                { ssr: false })
// ProducteurPageClient / EtablissementPageClient : retirés (sous-étape 5.2)
// Les fiches sont maintenant rendues via les intercepting routes
// @modal/(.)producteur/[id] et @modal/(.)etablissement/[id].

const defaultFiltres: Filtres = { categories: [], quand: 'toujours' }

type NavTab = 'accueil' | 'carte' | 'annonces' | 'favoris' | 'profil' | 'notifs' | 'village' | 'bonsplans'

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
  const [splashOpen, setSplashOpen]           = useState(false)  // splash éditorial — affiché 1× par session (ouverture de l'app)
  // Welcome modal une seule fois pour toujours (par device).
  // localStorage persiste entre les sessions browser et survit aux relances
  // de la PWA, contrairement à sessionStorage qui se vide à chaque nouvelle
  // session — d'où le splash qui revenait sans cesse avant ce fix.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (ecranBureau()) return
    if (!localStorage.getItem('pdv-welcome-shown')) setShowWelcome(true)
  }, [])
  // Splash éditorial : 1× par session (= ouverture de l'app). sessionStorage se
  // vide quand l'app est fermée → réapparaît au prochain lancement, mais PAS lors
  // des navigations internes (qui remontent la home et le faisaient revenir).
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (ecranBureau()) return
    if (sessionStorage.getItem('pdv-splash-seen') !== '1') {
      setSplashOpen(true)
      sessionStorage.setItem('pdv-splash-seen', '1')
    }
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
  // Sélection établissement — au niveau de la PAGE, comme selectedId pour les
  // événements. Elle vivait dans MapView : la liste ne pouvait pas la piloter
  // et elle disparaissait au retour d'une fiche. Ici, la home reste montée sous
  // le slot @modal → la punaise est toujours ouverte au retour.
  const [selectedEtabId, setSelectedEtabId] = useState<string | null>(null)
  // Liste d'établissements réellement affichée par le BottomSheet (recherche
  // live + filtres locaux compris). `null` tant qu'il ne s'est pas exprimé :
  // on retombe alors sur la liste de l'API, comportement d'avant.
  const [displayedEtabs, setDisplayedEtabs] = useState<EtablissementCard[] | null>(null)
  // 0 = producteurs, 1 = commerces.
  // DÉFAUT = commerces (1) : Producteurs ne doit JAMAIS être un mode auto.
  // Producteurs ne s'active QUE sur choix explicite (tuile hub, segment
  // "Producteurs" en haut de carte, recherche tombée sur un producteur,
  // ou URL avec ?ann=producteurs).
  const [annuaireTab, setAnnuaireTab] = useState(1)
  const [etabSearch, setEtabSearch] = useState('')
  const [selectedCats, setSelectedCats] = useState<ProduitCategorie[]>([])
  const [producerSearch, setProducerSearch] = useState('')
  const [loading, setLoading]       = useState(true)
  const [masquerPasses, setMasquerPasses] = useState(true)
  // Fond de carte global (piloté par l'admin via config.map_provider) — défaut Google
  const [mapProvider, setMapProvider] = useState<'google' | 'maplibre'>('google')

  /* ── Mode transport ────────────────────────────────────────────────────
     Un quatrieme mode de carte, a cote d'Evenements/Commerces/Producteurs.
     Il n'entre PAS dans `appMode` : celui-ci commande la feuille, les
     filtres, l'agenda, la recherche… le greffer la-dedans obligerait a
     toucher a tout. Le transport se superpose : la carte garde son fond, on
     y ajoute une ligne et ses arrets. */
  const [modeTransport, setModeTransport] = useState(false)
  const [ligneTransport, setLigneTransport] = useState<{
    lignes: { route_id: string; nom_court: string | null; nom_long: string | null; couleur: string | null }[]
    arrets: { stop_id: string; nom: string; lat: number; lng: number }[]
    traces: { sens: number; points: [number, number][]; route_id?: string; couleur?: string }[]
  } | null>(null)
  // Les deux arrets retenus dans le panneau — la carte les marque.
  const [arretsRetenus, setArretsRetenus] = useState<{ depart: string | null; arrivee: string | null }>({ depart: null, arrivee: null })

  const majArretsRetenus = useCallback((depart: string | null, arrivee: string | null) => {
    setArretsRetenus(a => (a.depart === depart && a.arrivee === arrivee ? a : { depart, arrivee }))
  }, [])
  // Les communes de la recherche : la carte n'affiche que LEURS arrets, au
  // lieu de couvrir la vallee de 98 points.
  const [communesTransport, setCommunesTransport] = useState<{ depart: string | null; arrivee: string | null }>({ depart: null, arrivee: null })
  const [trajetChoisi, setTrajetChoisi] = useState<string | null>(null)
  const [troncon, setTroncon] = useState<[number, number][] | null>(null)
  // Les arrets DESSERVIS par le trajet choisi, avec leur heure de passage.
  // C'est la reponse a « ou et a quelle heure je monte », qui vaut mieux que
  // de faire choisir un arret a l'aveugle avant meme de connaitre les bus.
  const [arretsDesservis, setArretsDesservis] = useState<{ stop_id: string; nom: string; lat: number | null; lng: number | null; heure: string | null }[]>([])

  const majCommunes = useCallback((depart: string | null, arrivee: string | null) => {
    setCommunesTransport(c => (c.depart === depart && c.arrivee === arrivee ? c : { depart, arrivee }))
  }, [])

  /** Le trajet choisi : on demande sa portion de route et on la surligne. */
  const choisirTrajet = useCallback(async (t: { trip_id: string; arret_depart: string; arret_arrivee: string } | null) => {
    setTrajetChoisi(t?.trip_id ?? null)
    if (!t) { setTroncon(null); setArretsDesservis([]); return }
    try {
      const r = await fetch(`/api/transport/troncon?trip=${encodeURIComponent(t.trip_id)}&de=${t.arret_depart}&vers=${t.arret_arrivee}`)
      const d = await r.json()
      setTroncon(r.ok && Array.isArray(d.points) && d.points.length > 1 ? d.points : null)
      setArretsDesservis(r.ok && Array.isArray(d.arrets) ? d.arrets : [])
    } catch {
      setTroncon(null); setArretsDesservis([])
    }
  }, [])

  /** Les arrets a montrer : ceux des communes choisies, sinon tous. */
  const arretsAffiches = useMemo(() => {
    // Un seul point par arret PHYSIQUE. Le GTFS decrit chaque sens comme un
    // arret distinct — deux fiches au meme endroit, l'une pour l'aller,
    // l'autre pour le retour. Superposees sur la carte, elles font un point
    // qui en cache un autre et un clic qui tombe au hasard sur l'un des deux.
    const vus = new Set<string>()
    const tous = (ligneTransport?.arrets ?? []).filter(a => {
      const cle = a.nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      if (vus.has(cle)) return false
      vus.add(cle)
      return true
    })
    // Un trajet est choisi : on ne montre QUE les arrets qu'il dessert.
    if (arretsDesservis.length > 0) {
      const ids = new Set(arretsDesservis.map(a => a.stop_id))
      return tous.filter(a => ids.has(a.stop_id))
    }
    const retenues = [communesTransport.depart, communesTransport.arrivee].filter(Boolean) as string[]
    if (retenues.length === 0) return tous
    return tous.filter(a => retenues.includes(a.nom.split(' - ')[0].trim()))
  }, [ligneTransport, communesTransport, arretsDesservis])

  // La ligne n'est chargee qu'a la premiere entree dans le mode, et gardee
  // ensuite : elle ne change qu'au passage du cron, une fois par semaine.
  useEffect(() => {
    if (!modeTransport || ligneTransport) return
    let vivant = true
    // Sans `?route=`, la route sert TOUT le reseau importe — dix lignes.
    fetch('/api/transport/ligne')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivant && d?.lignes?.length) setLigneTransport(d) })
      .catch(() => toast('Horaires de bus indisponibles'))
    return () => { vivant = false }
  }, [modeTransport, ligneTransport])
  /**
   * La zone d'affichage — centres et rayon — avec sa derniere valeur connue.
   *
   * Elle vient de /api/zone. Tant qu'elle n'est pas la, le rayon vaut zero, et
   * un rayon nul veut dire « pas de filtre » : l'application montre alors TOUT
   * ce que la base contient, sans limite geographique. C'est le pire repli
   * possible — une requete lente ou avortee (on navigue vite) ouvre la porte a
   * des evenements a 700 km, qui faussent les compteurs et surtout le cadrage
   * automatique, dont l'englobant part alors au centre de la France.
   *
   * On garde donc la derniere zone connue en memoire locale et on demarre
   * dessus. La zone d'une commune ne change qu'a la main, par l'admin : la
   * valeur d'hier est infiniment plus juste que « aucune limite ».
   */
  const [zoneCentres, setZoneCentres]   = useState<{ lat: number; lng: number; nom: string }[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('pdv-zone-connue') || '{}').centres ?? [] } catch { return [] }
  })
  const [rayonAffichage, setRayonAffichage] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    try { return JSON.parse(localStorage.getItem('pdv-zone-connue') || '{}').rayon ?? null } catch { return null }
  })
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
  /**
   * REJOUER une vue enregistrée — pas viser un lieu.
   *
   * Le centre qu'on rejoue ici a été relevé par `getCenter()`, c'est donc un
   * centre de div : la carte le repose tel quel, au même endroit. Le relire
   * comme un centre visible décalerait la vue un peu plus à chaque
   * aller-retour. Trois sources : la carte de départ de l'admin, le retour
   * d'une fiche, l'enregistrement d'une nouvelle carte de départ.
   */
  const [vueARestaurer, setVueARestaurer] = useState<{ lat: number; lng: number; zoom?: number } | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const s = localStorage.getItem('pdv-carte-depart')
      return s ? JSON.parse(s) : null
    } catch { return null }
  })
  /**
   * VISER un lieu — l'amener sous les yeux, au milieu de ce qu'on voit.
   *
   * Rien à voir avec la restauration ci-dessus, même si les deux finissaient
   * jusqu'ici dans la même propriété : le 📍 d'une carte de la liste posait
   * donc son commerce derrière la feuille, alors que taper sa punaise le
   * plaçait correctement.
   *
   * `cle` dit à la carte que ce lieu est DÉJÀ visé par ce chemin — le
   * recadrage de sélection, qui vise le même point, se tait alors au lieu de
   * viser deux fois.
   */
  /**
   * Une vue quittee a ete rendue : la carte ne doit PAS cadrer par-dessus.
   *
   * Quand on revient sur la carte, on veut la retrouver ou on l'a laissee — pas
   * un cadrage sur l'englobant des evenements, aussi juste soit-il. Ce drapeau
   * dit a la carte de laisser la vue restauree tranquille.
   */
  const [vueRestauree, setVueRestauree] = useState(false)
  /** Miroir du drapeau, lisible depuis un rappel figé au montage. */
  const vueRestaureeRef = useRef(false)
  const [lieuAViser, setLieuAViser] = useState<
    { lat: number; lng: number; zoom?: number; cle?: string; avecVignette?: boolean } | null
  >(null)
  const mapCameraRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null)
  const prevUserRef  = useRef<typeof user>(null)
  const [, setGeocoding]                = useState(false)
  const [adminMapSaved, setAdminMapSaved] = useState(false)
  const [sheetMode, setSheetMode]   = useState<'peek'|'half'|'full'>('half')
  /**
   * Position verticale de la feuille — écrite par elle, lue par la carte.
   *
   * La carte n'a pas de « fenêtre » à elle : elle occupe tout l'écran et la
   * feuille lui en mange le bas. Son centre visible est donc à mi-chemin de ce
   * qui dépasse, et il se déplace dès que la feuille bouge. En suivant cette
   * valeur image par image, le fond se décale d'autant et le point regardé ne
   * quitte jamais le milieu de ce qu'on voit.
   *
   * Une valeur de mouvement et non un état : un état déclencherait un rendu de
   * la page entière à chaque image d'animation.
   */
  // 9999 = « pas encore placée », la convention de la feuille elle-même. Zéro
  // voudrait dire « déployée en plein écran », donc une carte entièrement
  // masquée : tout ce qui lit cette valeur pour en déduire la place restante
  // calculerait un cadrage impossible pendant les quelques images qui séparent
  // le montage de la page de celui de la feuille.
  const sheetY = useMotionValue(9999)
  /**
   * Où la feuille VA se poser — pas où elle est.
   *
   * Deux besoins, deux valeurs. Suivre la feuille, c'est coller à l'instant :
   * `sheetY`. Cadrer, c'est calculer la place que la liste va occuper une fois
   * posée : cette valeur-ci. La feuille connaît son palier d'arrivée dès le
   * premier rendu, bien avant d'y arriver — un cadrage n'a donc jamais eu de
   * raison d'attendre qu'elle finisse son mouvement.
   */
  const sheetYRepos = useMotionValue(9999)
  /**
   * La feuille est en train de tomber parce qu'on déplace la carte.
   *
   * Le repli du geste et son retour ne se traitent PAS pareil, et c'est voulu.
   *
   * À l'aller, la feuille tombe pendant que le doigt commande : compenser cette
   * chute ne fait pas que glisser le fond, ça dévore le geste — la compensation
   * part dans le sens inverse du doigt et l'annule, la carte s'ébroue puis se
   * bloque. Tant que le doigt commande, la carte ne bouge donc pas toute seule.
   *
   * Au retour, plus personne ne touche à rien, et ce qu'on venait d'amener au
   * milieu doit y rester quand la fenêtre rétrécit : la remontée est suivie.
   *
   * La condition est « la feuille descend suite à un déplacement de carte » :
   * posée quand la chute part, levée quand la remontée part. Pas une fenêtre de
   * temps — un geste qui traîne reste couvert, un geste bref ne laisse pas la
   * fin de la chute se faire compenser.
   */
  const chuteDuPanEnCours = useRef(false)
  const [sheetPeekH, setSheetPeekH] = useState(130)
  const [screenH, setScreenH]       = useState(812)
  const [navTab, setNavTab]         = useState<NavTab>(() => {
    if (typeof window === 'undefined') return 'carte'
    const saved = sessionStorage.getItem('pdv-nav-tab')
    // Sanitize : les anciennes sessions peuvent porter 'accueil'/'annonces'
    // (onglets disparus de la refonte) → retomber sur la carte.
    const valid: NavTab[] = ['carte', 'village', 'profil', 'favoris', 'notifs']
    if ((valid as string[]).includes(saved ?? '')) return saved as NavTab
    // Premier arrivage : sur ordinateur on atterrit sur Le village, qui est
    // l'accueil de la version bureau ; sur mobile, la carte, inchangée.
    // Même point de rupture que desktop.css.
    return window.matchMedia('(min-width: 1024px)').matches ? 'village' : 'carte'
  })
  // Persiste navTab pour survivre aux navigations (ex: retour depuis /ajouter,
  // /capturer, /covoiturage/[id], etc.). Sans ça, navTab repart à 'accueil'
  // au mount → la condition `navTab === 'carte'` redevient fausse → les boutons
  // top (filtres, +, loupe) disparaissent à tort.
  useEffect(() => {
    try { sessionStorage.setItem('pdv-nav-tab', navTab) } catch {}
    // L'en-tête bureau a besoin de savoir quel onglet est ouvert pour souligner
    // le bon. L'URL ne peut pas le dire : la synchronisation y écrit toujours
    // ?mode=agenda, y compris quand on est sur Le village.
    try { document.documentElement.dataset.vue = navTab } catch {}
  }, [navTab])
  // Hub : écran d'accueil avec tuiles. Par défaut au lancement.
  // Restauré false si l'user était dans un module avant un refresh.
  // Refonte « app simple » : plus de hub d'accueil. showHub reste dans le code
  // (overlay HubView conservé) mais n'est jamais activé dans ce flux.
  const [showHub, setShowHub] = useState(false)
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

  // L'Assistant Village peut proposer d'inscrire un commerce : il ouvre alors
  // cette page avec ?commerce=1, et c'est le formulaire habituel qui prend le
  // relais. useSearchParams ferait basculer la page en rendu client complet.
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get('commerce') === '1') setCommerceFormOpen(true)
    } catch { /* noop */ }
  }, [])
  const [infoOpen, setInfoOpen]     = useState(false)

  /**
   * Partager l'application — et non la page où l'on se trouve.
   *
   * On envoie /app, l'aiguillage : Android part vers la fiche Play, iPhone
   * reçoit le mode d'emploi « ajouter à l'écran d'accueil », les autres
   * arrivent sur le site. Un lien vers l'accueil obligerait celui qui le
   * reçoit à trouver seul comment installer.
   */
  const partagerApp = useCallback(async () => {
    const url = 'https://laplaceduvillage.app/app'
    const titre = 'La Place du Village'
    const texte = 'Tout ce qui se passe autour de Ganges — événements, commerces, bons plans.'
    trackEvent('partage_app', { source: 'topbar' })
    if (typeof navigator !== 'undefined' && navigator.share) {
      // Un partage annulé n'est pas une erreur : on ne dit rien.
      try { await navigator.share({ title: titre, text: texte, url }) } catch { /* annulé */ }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Lien copié — il n’y a plus qu’à le coller.')
    } catch {
      toast.error('Le lien n’a pas pu être copié.')
    }
  }, [])
  const mapDragTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sheetBeforeMapRef = useRef<'peek'|'half'|'full' | null>(null)

  /**
   * Le seul cas où la carte a le droit de faire descendre la feuille.
   *
   * Taper une punaise ne replie plus rien : la carte vise pour la position où
   * la feuille se trouve. Mais sur un petit écran — ou sur un grand dont la
   * barre de navigateur vient de réapparaître — le bloc punaise + vignette est
   * plus haut que la place qui reste, et il n'y a pas de cadrage qui le fasse
   * tenir. On descend d'un cran, une seule fois, et on ne remonte pas tout
   * seul : la feuille reste où elle est jusqu'à ce que l'utilisateur la
   * reprenne.
   */
  const laisserLaPlaceALaVignette = useCallback(() => {
    setSheetMode(prev => (prev === 'half' ? 'peek' : prev))
  }, [])

  /**
   * Deplacer la carte replie la feuille, qui remonte quand on lache.
   *
   * C'est juste sur l'agenda et l'annuaire : on pousse la carte pour voir un
   * repere cache sous la liste, et on veut la liste hors du chemin le temps du
   * geste.
   *
   * PAS EN TRANSPORT. Le panneau y est un formulaire : on ecrit deux villes,
   * on regarde la carte, on revient au champ. Le voir tomber puis rebondir a
   * chaque effleurement de la carte rend la saisie penible. La feuille reste
   * ou l'utilisateur l'a mise — a mi-hauteur ou en haut, c'est lui qui decide.
   */
  const onMapDragStart = useCallback(() => {
    if (modeTransport) return
    if (mapDragTimerRef.current) clearTimeout(mapDragTimerRef.current)
    setSheetMode(prev => {
      if (prev === 'half') {
        sheetBeforeMapRef.current = 'half'
        chuteDuPanEnCours.current = true
        return 'peek'
      }
      return prev
    })
  }, [modeTransport])

  const onMapDragEnd = useCallback(() => {
    if (modeTransport) return
    mapDragTimerRef.current = setTimeout(() => {
      if (sheetBeforeMapRef.current === 'half') {
        sheetBeforeMapRef.current = null
        // La remontée commence : la carte reprend son suivi, à partir de la
        // position exacte où la feuille se trouve.
        chuteDuPanEnCours.current = false
        setSheetMode('half')
      }
    }, 350)
  }, [modeTransport])
  const router = useRouter()
  /** Post à rouvrir dans l'écran des notifications (deep-link ?post=). */
  const [notifPostId, setNotifPostId] = useState<string | null>(null)
  /** État courant de la liste d'événements (position + cartes rendues),
   *  tenu à jour par la feuille sans provoquer de rendu. */
  const listStateRef = useRef({ top: 0, count: 20 })
  /** État à rendre à la liste au retour d'une fiche événement. */
  const [restoreListState, setRestoreListState] = useState<{ top: number; count: number } | null>(null)

  // Si on arrive sur / avec ?tab=X (depuis BottomNavBar des pages externes),
  // restaure le bon onglet et quitte le hub. Lecture client-side directe
  // pour éviter le bailout static de useSearchParams().
  useEffect(() => {
    const sp0 = new URLSearchParams(window.location.search)
    const tabParam = sp0.get('tab')
    if (tabParam === 'carte' || tabParam === 'village' || tabParam === 'favoris' || tabParam === 'notifs' || tabParam === 'profil') {
      setShowHub(false)
      setNavTab(tabParam as NavTab)
      // ?post= : une notification de publication admin, ouverte depuis le
      // téléphone. On rouvre le post exactement comme un clic dans la liste.
      const postParam = sp0.get('post')
      if (tabParam === 'notifs' && postParam) setNotifPostId(postParam)
      // On ne nettoie pas pour le village : la synchronisation d'URL le
      // réinscrit aussitôt, et l'effacer ici le faisait disparaître entre les
      // deux montages de StrictMode en développement.
      if (tabParam !== 'village') window.history.replaceState({}, '', '/')
    }
    // ?splash=1 : le logo des autres pages ramène sur le splash d'accueil.
    if (sp0.get('splash') === '1') {
      // Sur ordinateur le logo ramène au village, pas au salon d'entrée.
      if (!ecranBureau()) setSplashOpen(true)
      window.history.replaceState({}, '', '/')
    }
  }, [])

  // Changement de vue demandé par l'en-tête bureau.
  //
  // Ses liens sont des navigations douces : la coquille reste montée, et les
  // effets qui lisent l'URL ne tournent qu'au montage. Sans ce relais, cliquer
  // « Carte » depuis Le village changeait l'adresse sans changer l'écran.
  useEffect(() => {
    const surVue = (e: Event) => {
      const vue = (e as CustomEvent<string>).detail
      setShowHub(false)
      if (vue === 'village') { setNavTab('village'); return }
      if (vue === 'annuaire') { setAppMode('annuaire'); setNavTab('carte'); return }
      if (vue === 'producteurs') { setAppMode('annuaire'); setAnnuaireTab(0); setNavTab('carte'); return }
      setAppMode('agenda'); setNavTab('carte')
    }
    window.addEventListener('pdv-vue', surVue)
    return () => window.removeEventListener('pdv-vue', surVue)
  }, [])

  /**
   * Google Maps ne repeint pas ses tuiles quand son conteneur est
   * redimensionné par la seule CSS — et c'est ce qui arrive tout le temps sur
   * bureau : la carte cède sa gauche à la colonne de filtres et à la liste, et
   * ces largeurs changent avec la fenêtre. Sans réveil, elle reste blanche.
   *
   * Une secousse ponctuelle au changement d'onglet ne suffisait pas : la carte
   * n'est pas encore créée à ce moment-là. On observe donc le conteneur et on
   * réveille à chaque fois qu'il change de taille, y compris à l'arrivée.
   *
   * Sans effet sur mobile : le conteneur n'y change jamais de taille.
   */
  const mapWrapRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = mapWrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let t: ReturnType<typeof setTimeout> | undefined
    const obs = new ResizeObserver(() => {
      clearTimeout(t)
      t = setTimeout(() => window.dispatchEvent(new Event('resize')), 80)
    })
    obs.observe(el)
    return () => { clearTimeout(t); obs.disconnect() }
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
        try {
          localStorage.setItem('pdv-zone-connue', JSON.stringify({
            centres: data.centres ?? [], rayon: data.rayon_affichage ?? 0,
          }))
        } catch {}
        if (data.carte_depart_lat && data.carte_depart_lng) {
          const pos = { lat: data.carte_depart_lat, lng: data.carte_depart_lng, zoom: data.carte_depart_zoom ?? 11 }
          try { localStorage.setItem('pdv-carte-depart', JSON.stringify(pos)) } catch {}
          // La carte de depart est un DEFAUT : elle ne remplace pas une vue
          // qu'on vient de rendre a l'utilisateur.
          if (!vueRestaureeRef.current) setVueARestaurer(pos)
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
      if (s.listState && typeof s.listState.top === 'number' && s.listState.top > 0) setRestoreListState(s.listState)
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
          setVueARestaurer({ lat: s.mapLat, lng: s.mapLng, zoom: s.mapZoom })
        }
      } else if (s.mapLat != null && s.mapLng != null) {
        setVueARestaurer({ lat: s.mapLat, lng: s.mapLng, zoom: s.mapZoom })
      }
      if (s.mapLat != null && s.mapLng != null) { vueRestaureeRef.current = true; setVueRestauree(true) }
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
  //   ?ann=producteurs            (annuaireTab=0, omis si commerces — défaut)
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
      // ?tab= a la priorité : il décrit l'onglet, ?mode décrit la carte. Sans
      // cette garde, revenir sur Le village puis rafraîchir renvoyait sur la
      // carte, puisque la synchronisation écrit toujours ?mode=agenda.
      if (sp.get('tab') !== 'village') setNavTab('carte')
    } else if (mode === 'annuaire') {
      setShowHub(false)
      setAppMode('annuaire')
      if (sp.get('tab') !== 'village') setNavTab('carte')
    }

    // Filtres agenda
    const cat   = sp.get('cat')
    const quand = sp.get('quand')
    const date  = sp.get('date')
    if (cat || quand || date) {
      setFiltres(prev => ({
        categories: cat
          ? (cat.split(',').filter(Boolean) as import('@/lib/types').Categorie[])
          : prev.categories,
        quand: (quand as import('@/lib/types').FiltreQuand) ?? prev.quand,
        date: /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date : prev.date ?? null,
      }))
    }

    // Onglet + filtres annuaire — défaut = commerces (1) si ?ann absent.
    // Producteurs (0) ne s'active QUE si ?ann=producteurs explicite.
    const ann = sp.get('ann')
    const annTabFromUrl = ann === 'producteurs' ? 0 : 1
    if (ann === 'producteurs') setAnnuaireTab(0)
    else if (ann === 'commerces') setAnnuaireTab(1)
    // ann absent → on ne set rien, le useState défaut (1 = commerces) s'applique

    const prodcat = sp.get('prodcat')
    if (prodcat) setSelectedCats(prodcat.split(',').filter(Boolean) as ProduitCategorie[])

    // Recherche selon l'onglet annuaire courant (déduit depuis l'URL)
    const q = sp.get('q')
    if (q) {
      if (annTabFromUrl === 0) setProducerSearch(q)
      else                     setEtabSearch(q)
    }
  }, [])

  // 2) SYNC état → URL (replaceState, miroir non bloquant)
  useEffect(() => {
    const sp = new URLSearchParams()
    // L'onglet Village doit survivre à un rafraîchissement : ?mode ne décrit
    // que la carte, il ne peut pas le porter.
    if (navTab === 'village') sp.set('tab', 'village')
    const mode = showHub ? 'hub' : appMode
    // hub est l'état par défaut → on garde l'URL propre sans ?mode= dans ce cas
    if (mode !== 'hub') sp.set('mode', mode)

    if (mode === 'agenda') {
      if (filtres.categories.length > 0) sp.set('cat', filtres.categories.join(','))
      if (filtres.quand !== 'toujours')  sp.set('quand', filtres.quand)
      if (filtres.date)                  sp.set('date', filtres.date)
    } else if (mode === 'annuaire') {
      // Commerces = défaut → on omet ?ann pour garder l'URL propre.
      // Producteurs = non-défaut → on l'annote explicitement.
      if (annuaireTab === 0) sp.set('ann', 'producteurs')
      if (annuaireTab === 0 && selectedCats.length > 0) sp.set('prodcat', selectedCats.join(','))
      const q = (annuaireTab === 0 ? producerSearch : etabSearch).trim()
      if (q) sp.set('q', q)
    }

    // Préserve les autres query params éventuels (?tab=, etc. utilisés par d'autres flows)
    const current = new URLSearchParams(window.location.search)
    current.forEach((v, k) => {
      if (k !== 'mode' && k !== 'cat' && k !== 'quand' && k !== 'ann' && k !== 'prodcat' && k !== 'q' && k !== 'tab') {
        sp.set(k, v)
      }
    })

    const search = sp.toString()
    const newUrl = window.location.pathname + (search ? `?${search}` : '')
    if (window.location.pathname + window.location.search !== newUrl) {
      window.history.replaceState(window.history.state, '', newUrl)
    }
  }, [showHub, appMode, filtres, annuaireTab, selectedCats, producerSearch, etabSearch, navTab])

  // Config chargée une seule fois au mount + écoute changements admin
  useEffect(() => {
    supabase.from('config').select('value').eq('key', 'masquer_passes').single()
      .then(({ data, error }) => setMasquerPasses(error ? true : data?.value !== 'false'))
    supabase.from('config').select('value').eq('key', 'map_provider').maybeSingle()
      .then(({ data }) => setMapProvider(data?.value === 'maplibre' ? 'maplibre' : 'google'))
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
    // Date précise du calendrier : prime sur `quand` côté API, et donne sa
    // propre entrée de cache CDN.
    if (filtres.date) params.set('date', filtres.date)
    if (masquerPasses) params.set('masquerPasses', '1')
    return `/api/agenda?${params.toString()}`
  }, [filtres, masquerPasses, zoneLoaded])

  const { data: agendaData, isLoading: agendaLoadingRaw, mutate: mutateAgenda } = useSWR(agendaKey)

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
      setNavTab(prev => (prev === 'profil' || prev === 'favoris' || prev === 'notifs' || prev === 'accueil' || prev === 'village') ? prev : 'carte')
    }
  }, [sheetMode, showHub])

  /*
   * Taper une punaise ne replie plus la feuille.
   *
   * Ce repli n'existait que parce que le recadrage était faux : la carte
   * amenait la punaise au centre de son div, c'est-à-dire derrière la liste,
   * et descendre la feuille était le seul moyen de la revoir. Il se jouait en
   * plus APRÈS la visée — celle-ci cadrait pour la position d'alors, la
   * feuille bougeait ensuite, et la vignette finissait beaucoup trop haut.
   *
   * La carte vise maintenant le milieu de la fenêtre qui lui reste, à la
   * position où la feuille se trouve. Il n'y a plus rien à replier.
   */

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
    setSplashOpen(false)   // toute navigation ferme le splash éditorial
    if (tab === 'bonsplans') { router.push('/promotions'); return }
    if (tab === 'annonces')  { router.push('/annonces'); return }
    if (tab === 'accueil')   { setNavTab('village'); return }   // legacy (retour notifs…) → Village
    if (showHub) setShowHub(false)
    if (tab === 'profil')  { setNavTab('profil');  return }
    if (tab === 'favoris') { setNavTab('favoris'); return }
    if (tab === 'notifs')  { setNavTab('notifs');  return }
    if (tab === 'village') { setNavTab('village'); return }
    setNavTab(tab)   // carte
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
    // `date: null` indispensable : une date précise restée active primerait
    // sur `quand` et la tuile "Aujourd'hui" n'afficherait pas aujourd'hui.
    setFiltres(f => ({ ...f, quand: 'aujourd_hui', date: null }))
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

  // Produits réellement en dispo chez au moins un producteur — source des
  // pastilles de filtrage rapide sous la recherche. Calculé sur la liste BRUTE
  // (`producers`, pas `filteredProducers`) : sinon les pastilles s'effaceraient
  // au fur et à mesure qu'on filtre, et on ne pourrait plus en changer.
  // Regroupement sur la forme normalisée (« Tomates » et « tomates » = 1 seule
  // pastille), en gardant la première orthographe rencontrée pour l'affichage.
  const availableProducts = useMemo(() => {
    const counts = new Map<string, { nom: string; count: number }>()
    producers.forEach(p => {
      const seen = new Set<string>()   // un producteur ne compte qu'une fois par produit
      ;(p.produits_disponibles ?? []).forEach(pr => {
        const label = pr.nom?.trim()
        if (!label) return
        const key = normSearch(label)
        if (seen.has(key)) return
        seen.add(key)
        const cur = counts.get(key)
        if (cur) cur.count++
        else counts.set(key, { nom: label, count: 1 })
      })
    })
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count || a.nom.localeCompare(b.nom, 'fr'))
      .slice(0, 12)
  }, [producers])

  const availableProducerCats = useMemo(() => {
    const s = new Set<ProduitCategorie>()
    producers.forEach(p => p.produit_categories.forEach(c => s.add(c)))
    return s
  }, [producers])

  // Recherche producteurs : nom + commune + noms des produits DISPONIBLES.
  // normSearch → insensible à la casse ET aux accents (`epinard` trouve
  // `Épinards`). C'est la seule source de vérité du filtre : la liste du
  // BottomSheet et les punaises de la carte consomment toutes deux ce tableau,
  // donc elles ne peuvent plus diverger.
  const filteredProducers = useMemo(() => {
    return producers
      .filter(p => selectedCats.length === 0 || selectedCats.some(c => p.produit_categories.includes(c)))
      .filter(p => {
        const q = normSearch(producerSearch.trim())
        if (!q) return true
        return (
          normSearch(p.nom).includes(q) ||
          normSearch(p.commune ?? '').includes(q) ||
          (p.produits_disponibles ?? []).some(pr => normSearch(pr.nom).includes(q))
        )
      })
  }, [producers, selectedCats, producerSearch])

  // Bandeau "à la une" dérivé de la liste FILTRÉE : sinon il continue de
  // pousser des producteurs hors recherche/catégorie pendant qu'on cherche.
  const featuredProducers = useMemo(() => filteredProducers.filter(p => p.is_featured), [filteredProducers])

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
    if (p?.lat && p?.lng) setLieuAViser({ lat: p.lat, lng: p.lng, zoom: 15, cle: id, avecVignette: true })
  }

  // Symétrique du précédent pour les établissements. On cherche la fiche dans
  // la liste AFFICHÉE (résultats de recherche live inclus) et non dans le seul
  // payload de l'API : sinon le bouton reste sans effet sur une fiche trouvée
  // par la recherche.
  const handleViewEtabOnMap = (id: string) => {
    const e = (displayedEtabs ?? filteredEtablissements).find(x => x.id === id)
    setSelectedEtabId(id)
    setNavTab('carte')
    setSheetMode('half')
    if (e?.lat && e?.lng) setLieuAViser({ lat: e.lat, lng: e.lng, zoom: 15, cle: id, avecVignette: true })
  }

  /**
   * Retenir la vue en quittant la carte, pour la rendre au retour.
   *
   * Sans ca, revenir sur la carte depuis un autre onglet remonte une page
   * neuve : filtres par defaut, camera par defaut, et un cadrage automatique
   * sur l'englobant des evenements — jamais la ou on avait laisse la carte.
   *
   * On ecrit dans la meme boite que le retour de fiche, qui sait deja tout
   * relire. Et on s'efface devant elle : ouvrir une fiche demonte aussi la
   * page, mais elle a deja ecrit un etat plus riche (selection, position de
   * liste) qu'il ne faut pas remplacer par le notre.
   */
  const vuePourRetourRef = useRef<{ filtres: Filtres; sheetMode: 'peek'|'half'|'full'; appMode: 'agenda' | 'annuaire' }>({ filtres, sheetMode, appMode })
  vuePourRetourRef.current = { filtres, sheetMode, appMode }
  useEffect(() => () => {
    try {
      if (sessionStorage.getItem('pdv-nav-state')) return
      const cam = mapCameraRef.current
      if (!cam) return
      const v = vuePourRetourRef.current
      sessionStorage.setItem('pdv-nav-state', JSON.stringify({
        filtres: v.filtres, sheetMode: v.sheetMode, appMode: v.appMode,
        mapLat: cam.lat, mapLng: cam.lng, mapZoom: cam.zoom,
      }))
    } catch {}
  }, [])

  const saveNavForEvent = useCallback((id: string) => {
    try {
      sessionStorage.setItem('pdv-nav-state', JSON.stringify({
        // La hauteur RÉELLE de la feuille, pas 'peek' : on rend la vue telle
        // qu'elle a été quittée, sinon il faut tout redérouler au retour.
        filtres, sheetMode, listState: listStateRef.current, selectedId: id,
        mapLat: mapCameraRef.current?.lat,
        mapLng: mapCameraRef.current?.lng,
        mapZoom: mapCameraRef.current?.zoom,
      }))
    } catch {}
  }, [filtres, sheetMode])


  const handleListStateRestored = useCallback(() => setRestoreListState(null), [])

  /** Fiche ouverte en fenêtre par-dessus la carte (bureau seulement). */
  const [eventModalId, setEventModalId] = useState<string | null>(null)

  const openEvent = useCallback((id: string) => {
    // Sur bureau, la fiche s'ouvre par-dessus : on ne quitte pas la carte,
    // donc il n'y a ni cadrage, ni filtres, ni position de liste à restaurer
    // au retour. Sur mobile, on change de page comme avant.
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
      setEventModalId(id)
      return
    }
    saveNavForEvent(id)
    router.push(`/evenement/${id}`)
  }, [saveNavForEvent, router])

  return (
    <div className="pcv-home" style={{ height: '100dvh', position: 'relative', overflow: 'hidden', backgroundColor: '#e8dece' }}>

      {/* Hub d'accueil — couvre tout sauf la bottom nav */}
      {showHub && (
        <div className="pcv-panel" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: NAV_H, zIndex: 25, overflowY: 'auto', backgroundColor: 'var(--creme)' }}>
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
            onOpenSplash={() => setSplashOpen(true)}
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
      <div ref={mapWrapRef} className="pcv-mapWrap absolute inset-0" style={{ bottom: NAV_H, zIndex: 1 }}>
        {/* Bande invisible en haut — laisse passer le geste "tirer pour rafraîchir" */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, zIndex: 5, pointerEvents: 'auto' }} />
        <MapView
          provider={mapProvider}
          /* En mode transport, la carte ne montre QUE la ligne : 274 marqueurs
             d'evenements par-dessus un trace de bus, on ne voit plus rien. */
          evenements={modeTransport || appMode === 'annuaire' ? [] : evenements}
          producers={!modeTransport && appMode === 'annuaire' && annuaireTab === 0 ? filteredProducers : []}
          selectedProducerId={selectedProducerId}
          onSelectProducer={setSelectedProducerId}
          onOpenProducer={openProducer}
          etablissements={!modeTransport && appMode === 'annuaire' && annuaireTab === 1 ? (displayedEtabs ?? filteredEtablissements) : []}
          selectedEtabId={selectedEtabId}
          onSelectEtab={setSelectedEtabId}
          onOpenEtablissement={openEtablissement}
          selectedId={selectedId}
          onSelectEvent={setSelectedId}
          onDeselect={() => setSelectedId(null)}
          onOpenEvent={openEvent}
          restaurerVue={vueARestaurer}
          vueRestauree={vueRestauree}
          viserLieu={lieuAViser}
          onMapDragStart={onMapDragStart}
          onMapDragEnd={onMapDragEnd}
          sheetY={sheetY}
          sheetYRepos={sheetYRepos}
          panEnCoursRef={chuteDuPanEnCours}
          onBlocTropGrand={laisserLaPlaceALaVignette}
          onCameraIdle={(lat, lng, zoom) => { mapCameraRef.current = { lat, lng, zoom } }}
          transport={modeTransport && ligneTransport ? {
            arrets: arretsAffiches,
            traces: ligneTransport.traces,
            lignes: ligneTransport.lignes,
            couleur: '#2D5A3D',
            troncon,
            arretDepart: arretsRetenus.depart,
            arretArrivee: arretsRetenus.arrivee,
            // Tant qu'aucune ville n'est saisie, les arrets s'effacent : 377
            // pastilles blanches par-dessus dix lignes, ce n'est plus une carte.
            discret: !communesTransport.depart && !communesTransport.arrivee,
          } : null}
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
          setModeTransport(false)
          if (m === 'evt') { setAppMode('agenda') }
          else { setAppMode('annuaire'); setAnnuaireTab(m === 'etab' ? 1 : 0) }
        }
        const MODES = [
          { id: 'evt' as const, label: 'Événements' },
          { id: 'etab' as const, label: 'Commerces' },
          { id: 'prod' as const, label: 'Producteurs' },
        ]
        /* Mode « Transport » — bouton de repérage seulement, à ce stade.
           Il ne fait encore rien : c'est une maquette pour juger de sa place à
           côté des trois autres modes. Les données sont prêtes (GTFS liO du
           réseau régional, ligne 608 Montpellier–Ganges–Le Vigan : 98 arrêts
           tous géolocalisés, 89 courses, tracés inclus), la vue reste à
           construire. */
        const IconeBus = () => (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11" />
            <path d="M4 11h16" /><circle cx="8" cy="16" r="1.4" /><circle cx="16" cy="16" r="1.4" />
            <path d="M6 19v1.5" /><path d="M18 19v1.5" />
          </svg>
        )

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
            {/* Top bar bande blanche : rangée 1 = logo + infos · rangée 2 = filtres */}
            {showBtns && (
              <div className="pcv-homeTop" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8, background: '#fff', padding: '8px 12px 10px', paddingTop: 'max(8px, env(safe-area-inset-top, 8px))', borderBottom: '1px solid #EDE8E0', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <button
                    onClick={() => setSplashOpen(true)}
                    aria-label="Accueil La Place du Village"
                    style={{ border: 'none', background: 'none', padding: 0, lineHeight: 0, cursor: 'pointer', flexShrink: 0 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo-topbar.webp" alt="La Place du Village" style={{ height: 38, width: 'auto', objectFit: 'contain', display: 'block' }} />
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {/* Partager l'application. Écrit en toutes lettres : une
                        icône seule se confond avec « partager cette page ». */}
                    <button
                      onClick={partagerApp}
                      aria-label="Partager l’application"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                        height: 34, padding: '0 11px', borderRadius: 999,
                        background: '#F7F1E6', border: '1px solid #E6DCC8', color: '#2D5A3D',
                        fontFamily: 'var(--font-body), sans-serif', fontWeight: 800, fontSize: 12.5,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                        <polyline points="16 6 12 2 8 6"/>
                        <line x1="12" y1="2" x2="12" y2="15"/>
                      </svg>
                      Partager
                    </button>
                    <button
                      onClick={() => setInfoOpen(true)}
                      aria-label="Infos / FAQ"
                      style={{ width: 38, height: 38, borderRadius: '50%', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1A1209', cursor: 'pointer', flexShrink: 0 }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', background: '#F7F1E6', borderRadius: 14, padding: 4, gap: 2 }}>
                  {MODES.map(m => {
                    const active = !modeTransport && mapMode === m.id
                    return (
                      <button
                        key={m.id}
                        onClick={() => setMapMode(m.id)}
                        style={{
                          flex: 1, padding: '8px 4px', borderRadius: 10, border: 'none', cursor: 'pointer',
                          background: active ? '#2D5A3D' : 'transparent',
                          color: active ? '#fff' : '#7A6A5A',
                          fontFamily: 'var(--font-body), sans-serif', fontWeight: active ? 800 : 700, fontSize: 12,
                          whiteSpace: 'nowrap', transition: 'all 0.15s',
                        }}
                      >
                        {m.label}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setModeTransport(true)}
                    aria-label="Transport"
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: modeTransport ? '#2D5A3D' : 'transparent',
                      color: modeTransport ? '#fff' : '#7A6A5A',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      fontFamily: 'var(--font-body), sans-serif',
                      fontWeight: modeTransport ? 800 : 700, fontSize: 12,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <IconeBus />Transport
                  </button>
                </div>
              </div>
            )}

            {/* Colonne de filtres du bureau, à gauche de la liste. Elle écrit
                dans le même `filtres` que les molettes de la barre flottante :
                les deux restent d'accord sans qu'on ait à les synchroniser. */}
            {showBtns && appMode === 'agenda' && (
              <DesktopMapFilters
                filtres={filtres}
                onFiltresChange={setFiltres}
                evenements={evenementsZone}
              />
            )}

            {/* ── Barre de commandes du bureau, flottante au bas de la carte ──
                Sur mobile, ces réglages vivent en haut de l'écran et dans la
                feuille : c'est là qu'ils tombent sous le pouce. Sur bureau
                l'œil est au centre, et une grande carte se pilote depuis le
                bas — on regroupe donc au même endroit le choix du type de
                carte, les deux filtres et le calendrier.
                Ce sont les MÊMES composants et le MÊME état que le mobile :
                rien n'est dupliqué, seuls les exemplaires mobiles sont
                masqués au-dessus de 1024 px. */}
            {showBtns && (
              <div className="pcv-only pcv-mapCtl">
                <div className="pcv-mapCtlSegs">
                  {MODES.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setMapMode(m.id)}
                      className={!modeTransport && mapMode === m.id ? 'pcv-mapCtlOn' : undefined}
                    >
                      {m.label}
                    </button>
                  ))}
                  <button onClick={() => setModeTransport(true)} aria-label="Transport"
                          className={modeTransport ? 'pcv-mapCtlOn' : undefined}>
                    <IconeBus />Transport
                  </button>
                </div>
                {appMode === 'agenda' && !modeTransport && (
                  <div className="pcv-mapCtlFiltres">
                    <AgendaFilterWheel filtres={filtres} onFiltresChange={setFiltres} />
                    <AgendaDateButton filtres={filtres} onFiltresChange={setFiltres} />
                  </div>
                )}
              </div>
            )}


            {/* Stack boutons flottants à gauche (sous la top bar) : réglages · loupe */}
            {showBtns && (
              <div className="pcv-mapTools" style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 116px)', left: 14, zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              </div>
            )}

            {/* (Le « + » Publier est revenu dans la bottom nav — plus de bouton flottant ici) */}

            {/* Chip filtre texte actif — vient de la recherche du hub, retirable */}
            {showBtns && activeSearch.trim() && (
              <div style={{
                position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 116px)', left: 64, right: 68, zIndex: 200,
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
            fontFamily: 'var(--font-body), sans-serif',
          }}>
            {/* Grabber */}
            <div style={{ width: 40, height: 4, borderRadius: 999, background: '#E4DED2', margin: '10px auto 6px', flexShrink: 0 }} />

            {/* Header DM Serif + reset link */}
            <div style={{ padding: '8px 20px 14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
              <h2 style={{
                margin: 0, fontFamily: 'var(--font-display), Georgia, serif',
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
                  <span style={{ fontFamily: 'var(--font-display), Georgia, serif', fontSize: 32, color: '#2D5A3D', lineHeight: 1 }}>{userRayon}</span>
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
                      setVueARestaurer(pos)
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
                    setLieuAViser({ lat: userCentre.lat, lng: userCentre.lng })
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
      {!showHub && proEvents.length > 0 && appMode === 'agenda' && navTab !== 'profil' && navTab !== 'favoris' && navTab !== 'notifs' && navTab !== 'village' && (
        <div className="pcv-proBandeau" style={{
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
        /* Le transport prend la liste, il ne se superpose pas : c'est un mode
           de la carte au meme titre qu'Evenements ou Commerces. La feuille
           garde sa poignee, ses paliers et son defilement. */
        contenuTransport={modeTransport && ligneTransport ? (
          <TransportPanneau
            lignes={ligneTransport.lignes}
            arrets={ligneTransport.arrets}
            trajetChoisi={trajetChoisi}
            arretsDesservis={arretsDesservis}
            onCommunesChange={majCommunes}
            onArretsRetenus={majArretsRetenus}
            onDemanderConnexion={() => openAuthModal()}
            onDemanderAbonnement={() => setUpgradePrompt({ label: 'la recherche vocale de cars', plan: 'habitants' })}
            onChoisirTrajet={choisirTrajet}
            onFermer={() => {
              setModeTransport(false)
              setArretsRetenus({ depart: null, arrivee: null })
              setTrajetChoisi(null); setTroncon(null)
            }}
          />
        ) : undefined}
        listStateRef={listStateRef}
        restoreListState={restoreListState}
        onListStateRestored={handleListStateRestored}
        evenements={evenements}
        loading={loading}
        selectedId={selectedId}
        onSelectEvent={setSelectedId}
        onViewOnMap={handleViewOnMap}
        filtres={filtres}
        onFiltresChange={setFiltres}
        mode={sheetMode}
        onModeChange={setSheetMode}
        sheetY={sheetY}
        sheetYRepos={sheetYRepos}
        navHeight={NAV_H}
        screenH={screenH}
        onPeekHeightChange={setSheetPeekH}
        proEvents={proEvents}
        onDiscoverPro={openEvent}
        // Bureau : ouvre la fiche en fenêtre. Mobile : mémorise l'état de
        // navigation avant que le lien de la carte change de page.
        onOpenEvent={openEvent}
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
        availableProducts={availableProducts}
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
        selectedEtabId={selectedEtabId}
        onSelectEtab={setSelectedEtabId}
        onViewEtabOnMap={handleViewEtabOnMap}
        onEtabsDisplayedChange={setDisplayedEtabs}
        etabSearch={etabSearch}
        onEtabSearchChange={setEtabSearch}
        annuaireTab={annuaireTab}
        onAnnuaireTabChange={setAnnuaireTab}
        topBarV3
        isAdmin={isAdmin}
        onAdminMutated={() => mutateAgenda()}
      />}

      {/* Fiche événement en fenêtre — bureau seulement (openEvent ne la pose
          qu'au-dessus de 1024 px). */}
      {eventModalId && (
        <DesktopEventModal id={eventModalId} onClose={() => setEventModalId(null)} />
      )}

      {/* Favoris — panneau inline au-dessus de la carte */}
      {navTab === 'favoris' && (
        <div className="pcv-panel" style={{
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
        <div className="pcv-panel" style={{
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
            initialPostId={notifPostId}
            onInitialPostConsumed={() => setNotifPostId(null)}
          />
        </div>
      )}

      {/* Profil — panneau inline au-dessus de la carte (refonte V3 — hybride social) */}
      {navTab === 'profil' && (
        <div className="pcv-panel" style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: NAV_H,
          zIndex: 25, overflowY: 'auto', backgroundColor: 'var(--creme)',
        }}>
          <ProfilHybridView
            onOpenNotifs={() => handleNavTab('notifs')}
            notifUnread={notifCount}
          />
        </div>
      )}

      {/* Village — mur du village (refonte app simple) */}
      {navTab === 'village' && (
        <div className="pcv-panel" style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: NAV_H,
          zIndex: 25, overflowY: 'auto', backgroundColor: 'var(--creme)',
        }}>
          <VillageView
            onOpenProfil={() => setNavTab('profil')}
            onOpenSplash={() => setSplashOpen(true)}
            onOpenNotifs={() => handleNavTab('notifs')}
            unreadCount={notifCount}
            onOpenAgendaToday={() => { enterAgendaToday(); setSheetMode('half') }}
            onUpgradePrompt={(plan, label) => setUpgradePrompt({ plan, label })}
          />
        </div>
      )}

      {/* Fiches producteur/établissement : sous-étape 5.2 — rendues via
          intercepting routes Next.js dans le slot @modal du root layout.
          Plus de rendu local : router.push('/producteur/[id]') depuis la
          carte ouvre la fiche par-dessus children sans démonter la home. */}

      <MaxSplash events={splashEvents} loading={loading} />

      {/* Splash éditorial — « salon » d'entrée (obligatoire pour l'instant) */}
      {splashOpen && (
        <EditorialSplash
          onExplore={() => {
            setSplashOpen(false)
            // Sur ordinateur on atterrit sur Le village, l'accueil de la
            // version bureau ; sur mobile, la carte, inchangée. Même point de
            // rupture que desktop.css.
            if (window.matchMedia('(min-width: 1024px)').matches) {
              setShowHub(false); setNavTab('village')
            } else {
              enterAgenda()
            }
          }}
          onRubrique={(href) => { setSplashOpen(false); router.push(href) }}
          onToday={() => { setSplashOpen(false); enterAgendaToday(); setSheetMode('half') }}
          isAdmin={isAdmin}
        />
      )}

      {showWelcome && <WelcomeModal onClose={() => {
        setShowWelcome(false)
        localStorage.setItem('pdv-welcome-shown', '1')
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
        onPlus={handlePublierClick}
      />

    </div>
  )
}

