'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, useMotionValue, animate, useDragControls } from 'framer-motion'
import { EvenementCard, Filtres, AppMode, ProducerCard, ProduitCategorie, EtablissementCard, EtablissementType } from '@/lib/types'
import { CATEGORIES, eventCategories } from '@/lib/categories'
import { PRODUIT_CATS } from '@/lib/produit-cats'
import { ETAB_TYPE_LIST } from '@/lib/etablissement-types'
import { formatEventDate, normSearch } from '@/lib/filters'
import { imageEvenement } from '@/lib/imageEvenement'
import { haversineKm } from '@/lib/distance'
import Link from 'next/link'
import ProducerBandeau from '@/components/ProducerBandeau'
import EtabBandeau from '@/components/EtabBandeau'

const FULL_TOP = 60   // espace laissé en haut quand sheet pleine

import { useTheme } from '@/components/ThemeProvider'
import ProBandeau from '@/components/ProBandeau'
import AgendaFilterWheel, { AgendaDateButton } from '@/components/AgendaFilterWheel'
import CategoryPicker from '@/components/CategoryPicker'
import { supabase } from '@/lib/supabase'
import { authedFetch } from '@/lib/swr-fetchers'
import MergeEventsModal from '@/components/MergeEventsModal'
import { texteBrut } from '@/components/TexteRiche'

const BATCH = 20

// PRODUIT_CATS importé depuis @/lib/produit-cats

interface Props {
  evenements: EvenementCard[]
  loading: boolean
  selectedId: string | null
  onSelectEvent: (id: string) => void
  onViewOnMap: (id: string) => void
  filtres: Filtres
  onFiltresChange: (f: Filtres) => void
  mode: 'peek' | 'half' | 'full'
  onModeChange: (m: 'peek' | 'half' | 'full') => void
  navHeight: number
  screenH: number
  onPeekHeightChange?: (h: number) => void
  /** Miroir vivant de l'état de la liste — écrit sans provoquer de rendu.
   *  `count` compte autant que `top` : au retour, la liste repart à 20 cartes,
   *  et une position de 1500px n'existe pas dans une liste de 20 cartes. */
  listStateRef?: React.MutableRefObject<{ top: number; count: number }>
  /** État à rendre au retour d'une fiche (null = rien à faire). */
  restoreListState?: { top: number; count: number } | null
  /** Appelé quand la restauration est finie — ou abandonnée. */
  onListStateRestored?: () => void
  proEvents?: EvenementCard[]
  onDiscoverPro?: (id: string) => void
  onOpenEvent?: (id: string) => void
  favIds?: string[]
  onToggleFav?: (id: string) => void
  appMode: AppMode
  onAppModeChange?: (m: AppMode) => void
  producers?: ProducerCard[]
  producerLoading?: boolean
  selectedProducerId?: string | null
  onSelectProducer?: (id: string | null) => void
  onViewProducerOnMap?: (id: string) => void
  onOpenProducer?: (id: string) => void
  selectedCats?: ProduitCategorie[]
  onSelectedCatsChange?: (cats: ProduitCategorie[]) => void
  availableProducerCats?: Set<ProduitCategorie>
  /** Produits en dispo chez au moins un producteur (liste brute, déjà comptée/triée). */
  availableProducts?: { nom: string; count: number }[]
  producerSearch?: string
  onProducerSearchChange?: (q: string) => void
  etabSearch?: string
  onEtabSearchChange?: (q: string) => void
  producerFavIds?: string[]
  onToggleProducerFav?: (id: string) => void
  featuredProducers?: ProducerCard[]
  etablissements?: EtablissementCard[]
  etablissementLoading?: boolean
  selectedEtabType?: EtablissementType | null
  onEtabTypeChange?: (t: EtablissementType | null) => void
  onOpenEtablissement?: (id: string) => void
  /** Sélection établissement — portée par la page, partagée avec la carte. */
  selectedEtabId?: string | null
  onSelectEtab?: (id: string | null) => void
  /** Bouton 📍 d'une carte établissement : sélectionne ET recentre la carte. */
  onViewEtabOnMap?: (id: string) => void
  /**
   * Remonte à la page la liste d'établissements RÉELLEMENT affichée ici.
   *
   * Sans ça, la liste et la carte lisaient deux sources différentes : la liste
   * peut afficher des résultats de recherche live (requête directe en base,
   * hors payload /api/annuaire) et applique en plus ses propres filtres note /
   * ville / rayon — la carte, elle, n'en savait rien et gardait ses punaises
   * d'origine. D'où des fiches trouvables dans la liste sans punaise associée.
   */
  onEtabsDisplayedChange?: (list: EtablissementCard[]) => void
  annuaireTab?: number
  onAnnuaireTabChange?: (idx: number) => void
  /** V3: hide Agenda/Annuaire segmented + in annuaire mode show only the active mode's button (no toggle) */
  topBarV3?: boolean
  /** Admin connecté → active le clic long de sélection multiple sur l'agenda. */
  isAdmin?: boolean
  /** Appelé après une mutation admin (suppression/fusion) pour rafraîchir la liste. */
  onAdminMutated?: () => void
}

export default function BottomSheet({
  evenements, loading, selectedId, onSelectEvent, onViewOnMap,
  filtres, onFiltresChange, mode, onModeChange, navHeight, screenH,
  onPeekHeightChange, proEvents = [], onDiscoverPro, onOpenEvent,
  listStateRef, restoreListState = null, onListStateRestored,
  favIds = [], onToggleFav,
  appMode, onAppModeChange, producers = [], producerLoading = false,
  selectedProducerId = null, onSelectProducer, onViewProducerOnMap,
  selectedCats = [], onSelectedCatsChange,
  availableProducts = [],
  producerSearch = '', onProducerSearchChange,
  etabSearch = '', onEtabSearchChange,
  producerFavIds = [], onToggleProducerFav,
  featuredProducers = [], onOpenProducer,
  etablissements = [], etablissementLoading = false,
  selectedEtabType = null, onEtabTypeChange, onOpenEtablissement,
  selectedEtabId = null, onSelectEtab, onViewEtabOnMap, onEtabsDisplayedChange,
  annuaireTab: annuaireTabProp, onAnnuaireTabChange,
  topBarV3 = false,
  isAdmin = false, onAdminMutated,
}: Props) {
  const { sheetBg } = useTheme()
  const [peekH, setPeekH]         = useState(130) // hauteur mesurée du header
  const [visibleCount, setVisibleCount] = useState(BATCH)
  const [visibleEtabCount, setVisibleEtabCount] = useState(BATCH)

  // ── Sélection multiple admin (clic long sur l'agenda) ──
  const [selectMode, setSelectMode] = useState(false)
  const [picked, setPicked]         = useState<Set<string>>(new Set())
  const [adminBusy, setAdminBusy]   = useState(false)
  const [mergeOpen, setMergeOpen]   = useState(false)
  // Retrait optimiste : fiches masquées immédiatement après suppression/fusion
  // (avant que la revalidation SWR/CDN ne rattrape — l'agenda est caché 60s).
  const [hiddenIds, setHiddenIds]   = useState<Set<string>>(new Set())
  const hideIds = (ids: string[]) => setHiddenIds(prev => new Set([...Array.from(prev), ...ids]))
  const enterSelect = (id: string) => { setSelectMode(true); setPicked(new Set([id])) }
  const togglePick = (id: string) => setPicked(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    if (n.size === 0) setSelectMode(false)
    return n
  })
  const exitSelect = () => { setSelectMode(false); setPicked(new Set()) }
  const deleteSelected = async () => {
    if (picked.size === 0) return
    if (!confirm(`Supprimer définitivement ${picked.size} événement(s) ?`)) return
    setAdminBusy(true)
    const ids = Array.from(picked)
    await Promise.all(ids.map(id => authedFetch(`/api/admin/evenements/${id}`, { method: 'DELETE' }).catch(() => null)))
    setAdminBusy(false); hideIds(ids); exitSelect(); onAdminMutated?.()
  }
  const openMerge = () => { if (picked.size >= 2) setMergeOpen(true) }
  const handleMerged = (absorbedIds: string[]) => {
    hideIds(absorbedIds)   // retrait immédiat des fiches absorbées
    setMergeOpen(false)
    exitSelect()
    onAdminMutated?.()
  }

  const headerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  /** Restauration déjà appliquée (ou abandonnée) — ne se rejoue jamais. */
  const restoreDoneRef = useRef(false)
  /** Événement à amener en haut dès qu'assez de cartes seront rendues. */
  const pendingScrollRef = useRef<string | null>(null)
  /** Sélection précédente : l'auto-défilement ne réagit qu'à un CHANGEMENT. */
  const prevSelectedRef = useRef<string | null>(null)

  /**
   * Retour d'une fiche événement : on rend à la liste le nombre de cartes
   * qu'elle avait, PUIS sa position. Dans cet ordre — sinon on demande un
   * défilement de 1500px à une liste qui n'en fait que 600.
   *
   * `restoreDoneRef` garantit que ça ne se joue qu'une fois. Et on abandonne
   * au bout d'une seconde et demie plutôt que de rester en attente : une
   * restauration qui ne finit jamais bloquerait tout le reste.
   */
  useEffect(() => {
    if (!restoreListState || restoreDoneRef.current) return
    if (!evenements.length) return
    if (visibleCount < restoreListState.count) { setVisibleCount(restoreListState.count); return }
    const list = listRef.current
    if (!list) return
    const raf = requestAnimationFrame(() => {
      if (restoreDoneRef.current) return
      restoreDoneRef.current = true
      list.scrollTop = restoreListState.top
      onListStateRestored?.()
    })
    return () => cancelAnimationFrame(raf)
  }, [restoreListState, evenements.length, visibleCount, onListStateRestored])

  // Filet de sécurité : quoi qu'il arrive, on ne reste pas bloqué en attente.
  useEffect(() => {
    if (!restoreListState || restoreDoneRef.current) return
    const t = setTimeout(() => {
      if (restoreDoneRef.current) return
      restoreDoneRef.current = true
      onListStateRestored?.()
    }, 1500)
    return () => clearTimeout(t)
  }, [restoreListState, onListStateRestored])
  const obsRef = useRef<IntersectionObserver | null>(null)
  const loaderRef = useCallback((el: HTMLDivElement | null) => {
    if (obsRef.current) { obsRef.current.disconnect(); obsRef.current = null }
    if (!el) return
    obsRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setVisibleCount(n => n + BATCH)
    }, { threshold: 0.1 })
    obsRef.current.observe(el)
  }, [])
  const etabObsRef = useRef<IntersectionObserver | null>(null)
  const etabLoaderRef = useCallback((el: HTMLDivElement | null) => {
    if (etabObsRef.current) { etabObsRef.current.disconnect(); etabObsRef.current = null }
    if (!el) return
    etabObsRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setVisibleEtabCount(n => n + BATCH)
    }, { threshold: 0.1 })
    etabObsRef.current.observe(el)
  }, [])
  const dragControls              = useDragControls()

  // Annuaire state — contrôlé par le parent si onAnnuaireTabChange est fourni
  const [annuaireTabIdxLocal, setAnnuaireTabIdxLocal] = useState(0)
  const annuaireTabIdx = annuaireTabProp ?? annuaireTabIdxLocal
  const setAnnuaireTabIdx = (idx: number) => {
    setAnnuaireTabIdxLocal(idx)
    onAnnuaireTabChange?.(idx)
  }

  // Filtre établissements
  const [etabFilterOpen, setEtabFilterOpen] = useState(false)
  const [etabMinNote, setEtabMinNote]       = useState(0)
  const [etabVille, setEtabVille]           = useState('')
  const [etabRayon, setEtabRayon]           = useState<number | null>(null)

  // Recherche live globale (BDD) — même pattern que la loupe HubSearchModal.
  // ESC_OR : PostgREST .or() utilise les virgules/parenthèses comme séparateurs,
  // il faut donc les échapper dans le terme utilisateur sinon la query plante
  // silencieusement (data null, on affiche "rien trouvé").
  const [etabSearchHits, setEtabSearchHits] = useState<EtablissementCard[] | null>(null)
  useEffect(() => {
    const q = etabSearch.trim()
    if (q.length < 2) { setEtabSearchHits(null); return }
    let cancelled = false
    const t = setTimeout(async () => {
      const escaped = q.replace(/,/g, '\\,').replace(/\)/g, '\\)').replace(/\(/g, '\\(')
      const like = `%${escaped}%`
      let query = supabase
        .from('etablissements')
        .select('id, type, nom, commune, lat, lng, photos, note_google, is_featured, statut, description_courte, plan')
        .or(`nom.ilike.${like},commune.ilike.${like}`)
        .limit(50)
      if (selectedEtabType) query = query.eq('type', selectedEtabType)
      const { data, error } = await query
      if (cancelled) return
      if (error) console.warn('[etab search]', error)
      setEtabSearchHits((data ?? []) as EtablissementCard[])
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [etabSearch, selectedEtabType])

  // Pas d'équivalent producteur ici : contrairement aux établissements, les
  // producteurs sont TOUS déjà chargés côté page (/api/producers ne pagine
  // pas) et `producers` arrive déjà filtré par la recherche. Une requête
  // directe `select('*')` renverrait des lignes brutes SANS les champs
  // dérivés (produit_categories, produits_disponibles, photo_url sont
  // calculés par l'API depuis la relation products) → crash au rendu.

  // ResizeObserver sur le header pour mesurer sa hauteur réelle
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setPeekH(el.offsetHeight))
    ro.observe(el)
    setPeekH(el.offsetHeight) // mesure initiale
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    onPeekHeightChange?.(peekH)
  }, [peekH, onPeekHeightChange])

  const getSnaps = useCallback((h: number, navH: number, ph: number) => {
    const sh = h - FULL_TOP - navH
    return {
      peek: FULL_TOP + sh - ph,
      half: FULL_TOP + Math.round(sh * 0.5),
      full: 0,
    }
  }, [])

  const y = useMotionValue(9999)

  useEffect(() => {
    y.set(getSnaps(screenH, navHeight, peekH).half) // départ à la moitié — screenH vient du parent
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isMounted = useRef(false)
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return }
    const snaps = getSnaps(screenH, navHeight, peekH)
    animate(y, snaps[mode], { type: 'spring', stiffness: 340, damping: 36 })
  }, [mode, screenH, navHeight, peekH, getSnaps, y])

  const snaps = getSnaps(screenH, navHeight, peekH)

  const snapTo = useCallback((target: 'peek' | 'half' | 'full') => {
    onModeChange(target)
    animate(y, getSnaps(screenH, navHeight, peekH)[target], { type: 'spring', stiffness: 340, damping: 36 })
  }, [onModeChange, y, getSnaps, screenH, navHeight, peekH])

  const handleDragEnd = (_: unknown, info: { velocity: { y: number } }) => {
    const current = y.get()
    const vy = info.velocity.y
    const s  = getSnaps(screenH, navHeight, peekH)
    let target: 'peek' | 'half' | 'full'
    if (vy > 400) {
      target = current > s.half ? 'peek' : 'half'
    } else if (vy < -400) {
      target = current < s.half ? 'full' : 'half'
    } else {
      const opts: ['peek'|'half'|'full', number][] = [['peek', s.peek], ['half', s.half], ['full', s.full]]
      target = opts.sort((a, b) => Math.abs(a[1]-current) - Math.abs(b[1]-current))[0][0]
    }
    snapTo(target)
  }

  // Quand un filtre agenda change, on remonte le sheet en half si on était en peek
  const handleAgendaFilterChange = () => {
    if (mode === 'peek') snapTo('half')
  }

  // Calendrier : on déploie en plein écran le temps de choisir (à half le
  // panneau serait coupé en bas sur la plupart des téléphones), puis on
  // restaure la position d'avant dès qu'une date est prise ou qu'on annule.
  const modeAvantCalendrier = useRef<'peek' | 'half' | 'full'>('half')
  const handleCalendarOpenChange = useCallback((open: boolean) => {
    if (open) {
      modeAvantCalendrier.current = mode
      snapTo('full')
    } else {
      snapTo(modeAvantCalendrier.current)
    }
  }, [mode, snapTo])

  // Centre de la ville saisie (lat/lng du premier établissement correspondant)
  const villeCenter = useMemo(() => {
    const q = etabVille.trim().toLowerCase()
    if (!q) return null
    const e = etablissements.find(e2 => e2.commune?.toLowerCase().includes(q) && e2.lat && e2.lng)
    return e ? { lat: e.lat!, lng: e.lng! } : null
  }, [etablissements, etabVille])

  // Liste affichée :
  //  - Si recherche live active (etabSearchHits != null) → on prend les hits
  //    BDD globale (cohérent avec la loupe d'en haut). Filtre par type appliqué
  //    côté supabase pour minimiser le payload.
  //  - Sinon → liste locale filtrée par zone/rayon/note (mode "navigation").
  const displayedEtabs = useMemo(() => {
    if (etabSearchHits) {
      // Search active : applique uniquement les filtres légers (note min)
      return etabSearchHits.filter(e => {
        if (etabMinNote > 0 && (!e.note_google || e.note_google < etabMinNote)) return false
        return true
      })
    }
    return etablissements.filter(e => {
      if (etabMinNote > 0 && (!e.note_google || e.note_google < etabMinNote)) return false
      if (etabVille.trim()) {
        if (!e.commune?.toLowerCase().includes(etabVille.trim().toLowerCase())) return false
      }
      if (etabRayon && villeCenter && e.lat && e.lng) {
        if (haversineKm(villeCenter.lat, villeCenter.lng, e.lat, e.lng) > etabRayon) return false
      }
      return true
    })
  }, [etablissements, etabSearchHits, etabMinNote, etabVille, etabRayon, villeCenter])

  // Remontée de la liste affichée vers la page → la carte pose ses punaises sur
  // EXACTEMENT ce que la liste montre (recherche live et filtres locaux inclus).
  // Le callback est stabilisé dans un ref : passé en fonction fléchée inline par
  // le parent, il change à chaque rendu et rebouclerait l'effet à l'infini.
  const etabsChangeRef = useRef(onEtabsDisplayedChange)
  useEffect(() => { etabsChangeRef.current = onEtabsDisplayedChange })
  useEffect(() => {
    etabsChangeRef.current?.(displayedEtabs)
  }, [displayedEtabs])

  const etabFilterActive = etabMinNote > 0 || !!etabVille.trim() || etabRayon !== null

  // Producteurs affichés : `producers` est déjà filtré par la recherche et les
  // catégories côté page (filteredProducers), donc rien à refaire ici.
  const displayedProducers: ProducerCard[] = producers

  // Reset state quand on change de mode
  useEffect(() => {
    if (appMode === 'agenda') {
      onSelectedCatsChange?.([])
      onProducerSearchChange?.('')
      onEtabSearchChange?.('')
    }
  }, [appMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset visibleCount quand la liste change (nouveau filtre)
  useEffect(() => { setVisibleCount(BATCH) }, [evenements])
  useEffect(() => { setVisibleEtabCount(BATCH) }, [etablissements])

  // L'événement sélectionné garde SA place dans la liste. On le remontait
  // autrefois en tête, ce qui réorganisait tout sous les doigts : maintenant
  // c'est la liste qui défile jusqu'à lui.
  const visibleSource = hiddenIds.size > 0 ? evenements.filter(e => !hiddenIds.has(e.id)) : evenements

  /** Amène la carte d'un événement en haut de la liste. */
  const scrollToCard = useCallback((id: string) => {
    const list = listRef.current
    if (!list) return
    // rAF : laisser le rendu poser la carte avant de mesurer sa position.
    requestAnimationFrame(() => {
      const card = list.querySelector<HTMLElement>(`[data-evt-id="${CSS.escape(id)}"]`)
      if (!card) return
      const top = card.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop
      list.scrollTo({ top: Math.max(0, top - 4), behavior: 'smooth' })
    })
  }, [])

  /**
   * Sélection d'un événement : on l'amène en haut sans toucher à l'ordre.
   *
   * Ne réagit qu'à un CHANGEMENT de sélection — surtout pas à la longueur de
   * la liste, sinon chaque lot chargé par le défilement infini renverrait
   * l'utilisateur en haut pendant qu'il descend. Et rien tant qu'une
   * restauration est en cours : elle est prioritaire.
   */
  useEffect(() => {
    if (selectedId === prevSelectedRef.current) return
    prevSelectedRef.current = selectedId
    if (!selectedId) return
    if (restoreListState && !restoreDoneRef.current) return
    const idx = visibleSource.findIndex(e => e.id === selectedId)
    if (idx < 0) return
    if (idx >= visibleCount) {
      // Pas encore rendu : on étend la pagination et on défile au prochain tour.
      pendingScrollRef.current = selectedId
      setVisibleCount(Math.ceil((idx + 1) / BATCH) * BATCH)
      return
    }
    scrollToCard(selectedId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  /**
   * Suite du cas ci-dessus. Ne fait quelque chose QUE s'il y a une cible en
   * attente : les lots chargés par le défilement infini passent au travers.
   */
  useEffect(() => {
    const id = pendingScrollRef.current
    if (!id) return
    pendingScrollRef.current = null
    scrollToCard(id)
  }, [visibleCount, scrollToCard])

  // Scroll en haut quand on descend en peek — sauf si une restauration est en
  // cours : on revient d'une fiche et remettre la liste en haut annulerait
  // précisément ce qu'on cherche à rendre.
  useEffect(() => {
    if (restoreListState && !restoreDoneRef.current) return
    if (mode === 'peek') listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Suggestions de produits basées sur les producers filtrés par catégorie
  const suggestions = useMemo(() => {
    const q = normSearch(producerSearch.trim())
    if (!q) return []
    const names = new Set<string>()
    producers.forEach(p => {
      p.produits_disponibles?.forEach(pr => {
        if (normSearch(pr.nom).includes(q)) names.add(pr.nom)
      })
    })
    return Array.from(names).slice(0, 6)
  }, [producers, producerSearch])

  const visibleEvents = visibleSource.slice(0, visibleCount)

  return (
    <>
    <motion.div
      className="pcv-sheetCol"
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: snaps.peek }}
      dragElastic={0.05}
      onDragEnd={handleDragEnd}
      style={{
        y,
        position: 'absolute',
        left: 0, right: 0, top: 0,
        height: screenH - navHeight,
        backgroundColor: sheetBg.bg,
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -4px 28px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column',
        zIndex: 20, overflow: 'hidden',
        transition: 'background-color 0.2s',
      }}
    >
      {/* Bouton calendrier flottant — enfant DIRECT du sheet, donc hors du
          header mesuré : il ne peut pas influer sur peekH (et donc ni sur les
          snaps, ni sur la position du ProBandeau qui s'y accroche). */}
      {appMode === 'agenda' && (
        <AgendaDateButton
          filtres={filtres}
          onFiltresChange={onFiltresChange}
          onOpenChange={handleCalendarOpenChange}
        />
      )}

      {/* ── Header mesuré (peek height source) ── */}
      <div ref={headerRef} style={{ flexShrink: 0 }}>
      {/* ── Zone de drag : handle + compteur + boutons filtres ── */}
      <div
        onPointerDown={e => dragControls.start(e)}
        style={{ flexShrink: 0, cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
      >
        {/* Poignée visuelle */}
        <div style={{ padding: '10px 0 6px' }}>
          <div style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: '#C8BDB0', margin: '0 auto' }} />
        </div>

        {/* ── Header agenda : compteur + filtres ── */}
        {appMode === 'agenda' && (
          <>
            <div style={{
              // Réserve à droite pour le bouton calendrier flottant (52px +
              // marge), sinon la fin de la ligne passe dessous sur écran étroit.
              padding: '2px 76px 8px 16px',
              textAlign: 'center',
              fontFamily: 'var(--font-body), sans-serif',
              fontSize: 13, color: '#7A6A5A',
            }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: '#1A1209' }}>
                {evenements.length}
              </span>
              {' '}
              événement{evenements.length > 1 ? 's' : ''}
              <span style={{ opacity: 0.5 }}> · </span>
              <span style={{ fontSize: 11, color: '#9E9089' }}>marchés · ateliers · concerts</span>
            </div>
            {/* Wheels centrés ~300px, marges latérales restent grabable */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '0 16px 14px',
            }}>
              <div
                onPointerDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                // fit-content (et non width:100% + maxWidth:300) : la rangée
                // prend exactement la largeur de ses deux boutons, et le
                // parent en justifyContent:center la recentre. Un libellé long
                // l'élargit donc à gauche autant qu'à droite au lieu de la
                // faire déborder d'un seul côté. maxWidth:100% garde le
                // plafond de l'écran.
                style={{ touchAction: 'pan-y', width: 'fit-content', maxWidth: '100%' }}
              >
                <AgendaFilterWheel
                  filtres={filtres}
                  onFiltresChange={onFiltresChange}
                  onChange={handleAgendaFilterChange}
                />
              </div>
            </div>
          </>
        )}

        {appMode !== 'agenda' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 16px 10px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: 'var(--font-body), sans-serif', fontWeight: 800, fontSize: 18, color: '#1C1917', margin: 0, lineHeight: 1.1 }}>
                {annuaireTabIdx === 0
                  ? `${displayedProducers.length} producteur${displayedProducers.length !== 1 ? 's' : ''}`
                  : `${displayedEtabs.length} commerce${displayedEtabs.length !== 1 ? 's' : ''}`
                }
              </p>
              <p style={{ fontSize: 12, color: '#9E9089', margin: '2px 0 0' }}>
                {annuaireTabIdx === 0
                  ? 'Producteurs · artisans · locaux…'
                  : 'Restos · bars · hébergements…'
                }
              </p>
            </div>
            {/* Segmented control Agenda / Annuaire — caché en V3 (3-mode top remplace) */}
            {!topBarV3 && (
              <div style={{ display: 'flex', backgroundColor: '#E8F2EB', borderRadius: 999, padding: 3, gap: 2, flexShrink: 0 }}>
                <button onClick={() => onAppModeChange?.('agenda')} style={{
                  padding: '5px 13px', borderRadius: 999, border: 'none',
                  backgroundColor: 'transparent',
                  color: '#2D5A3D',
                  fontFamily: 'var(--font-body), sans-serif', fontWeight: 700, fontSize: 11,
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background-color 0.15s, color 0.15s',
                }}>Agenda</button>
                <button onClick={() => onAppModeChange?.('annuaire')} style={{
                  padding: '5px 13px', borderRadius: 999, border: 'none',
                  backgroundColor: '#2D5A3D',
                  color: '#fff',
                  fontFamily: 'var(--font-body), sans-serif', fontWeight: 700, fontSize: 11,
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background-color 0.15s, color 0.15s',
                }}>Annuaire</button>
              </div>
            )}
          </div>
        )}

        {/* Filtres annuaire — wheel horizontal selon tab actif.
            En !V3, mini-toggle Producteurs/Commerces au-dessus pour switch. */}
        {appMode !== 'agenda' && (
          <div style={{ padding: '0 16px 10px' }}>
            {!topBarV3 && (
              <div style={{ display: 'flex', backgroundColor: '#E8F2EB', borderRadius: 999, padding: 3, gap: 2, marginBottom: 8, width: 'fit-content' }}>
                <button onClick={() => setAnnuaireTabIdx(0)} style={{
                  padding: '5px 13px', borderRadius: 999, border: 'none',
                  backgroundColor: annuaireTabIdx === 0 ? '#2D5A3D' : 'transparent',
                  color: annuaireTabIdx === 0 ? '#fff' : '#2D5A3D',
                  fontFamily: 'var(--font-body), sans-serif', fontWeight: 700, fontSize: 11,
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background-color 0.15s, color 0.15s',
                }}>Producteurs</button>
                <button onClick={() => setAnnuaireTabIdx(1)} style={{
                  padding: '5px 13px', borderRadius: 999, border: 'none',
                  backgroundColor: annuaireTabIdx === 1 ? '#2D5A3D' : 'transparent',
                  color: annuaireTabIdx === 1 ? '#fff' : '#2D5A3D',
                  fontFamily: 'var(--font-body), sans-serif', fontWeight: 700, fontSize: 11,
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background-color 0.15s, color 0.15s',
                }}>Commerces</button>
              </div>
            )}
            {annuaireTabIdx === 0 ? (
              <CategoryPicker
                ariaLabel="Filtre catégorie produit"
                items={PRODUIT_CATS.map(c => ({ id: c.id, label: c.label, emoji: c.emoji }))}
                activeId={selectedCats[0] ?? null}
                onChange={id => {
                  onSelectedCatsChange?.(id ? [id as typeof PRODUIT_CATS[number]['id']] : [])
                  if (mode === 'peek') snapTo('half')
                }}
              />
            ) : (
              <CategoryPicker
                ariaLabel="Filtre type commerce"
                items={ETAB_TYPE_LIST.map(t => ({ id: t.id, label: t.label, emoji: t.emoji, color: t.color }))}
                activeId={selectedEtabType ?? null}
                onChange={id => {
                  onEtabTypeChange?.((id as typeof ETAB_TYPE_LIST[number]['id'] | null) ?? null)
                  if (mode === 'peek') snapTo('half')
                }}
              />
            )}
          </div>
        )}
      </div>{/* fin zone drag */}

      {/* ── Rows annuaire (filtres déplacés dans le header, search & etab filter restent) ── */}
      {appMode === 'annuaire' && (
        <>

          {/* Barre de recherche + suggestions */}
          {annuaireTabIdx === 0 ? (
            <div style={{ padding: '0 16px 10px', position: 'relative' }} onPointerDown={e => e.stopPropagation()}>
              <div style={{ position: 'relative' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#AAA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input type="text" value={producerSearch} onChange={e => onProducerSearchChange?.(e.target.value)}
                  placeholder="Producteur, produit, commune…"
                  style={{ width: '100%', padding: '10px 36px 10px 34px', borderRadius: producerSearch && suggestions.length > 0 ? '12px 12px 0 0' : 12, border: `1.5px solid ${sheetBg.border}`, borderBottom: producerSearch && suggestions.length > 0 ? 'none' : `1.5px solid ${sheetBg.border}`, fontSize: 13, fontFamily: 'var(--font-body), sans-serif', color: '#2C1810', backgroundColor: sheetBg.bg, outline: 'none', boxSizing: 'border-box' }} />
                {producerSearch && (
                  <button onClick={() => onProducerSearchChange?.('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#AAA', fontSize: 15, padding: 2, display: 'flex' }}>✕</button>
                )}
              </div>
              {producerSearch && suggestions.length > 0 && (
                <div style={{ position: 'absolute', left: 16, right: 16, zIndex: 50, backgroundColor: sheetBg.bg, border: `1.5px solid ${sheetBg.border}`, borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden', boxShadow: '0 6px 16px rgba(0,0,0,0.10)' }}>
                  {suggestions.map((s, i) => (
                    <button key={s} onPointerDown={e => { e.preventDefault(); e.stopPropagation(); onProducerSearchChange?.(s) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', borderTop: i > 0 ? `1px solid ${sheetBg.border}` : 'none', backgroundColor: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#2C1810', fontFamily: 'var(--font-body), sans-serif' }}>
                      <span style={{ color: '#8A8A8A', fontSize: 12 }}>🛒</span>
                      <span style={{ flex: 1 }}>{s}</span>
                      <span style={{ fontSize: 10, color: '#AAA', fontWeight: 600 }}>produit</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Pastilles produits — raccourcis vers la recherche : cliquer
                  revient à taper le nom du produit, donc tout le reste (liste,
                  punaises de la carte, URL ?q=, chip d'effacement) suit sans
                  logique dupliquée. Rien ne s'affiche tant qu'aucun producteur
                  n'a mis de produit en disponibilité. */}
              {availableProducts.length > 0 && (
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 8, paddingBottom: 2, scrollbarWidth: 'none' }}>
                  {availableProducts.map(p => {
                    const active = normSearch(producerSearch.trim()) === normSearch(p.nom)
                    return (
                      <button
                        key={p.nom}
                        onClick={() => onProducerSearchChange?.(active ? '' : p.nom)}
                        style={{
                          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                          padding: '6px 11px', borderRadius: 999, cursor: 'pointer',
                          border: `1.5px solid ${active ? '#2D5A3D' : sheetBg.border}`,
                          backgroundColor: active ? '#2D5A3D' : 'transparent',
                          color: active ? '#fff' : sheetBg.text,
                          fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body), sans-serif',
                          whiteSpace: 'nowrap',
                        }}>
                        <span>{p.nom}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.65 }}>{p.count}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '0 16px 10px' }} onPointerDown={e => e.stopPropagation()}>
              <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
                {/* Input recherche */}
                <div style={{ flex: 1, position: 'relative' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#AAA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    type="text"
                    inputMode="search"
                    enterKeyHint="search"
                    value={etabSearch}
                    onChange={e => onEtabSearchChange?.(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
                    placeholder="Commerce, commune…"
                    style={{ width: '100%', padding: '10px 34px 10px 34px', borderRadius: 12, border: `1.5px solid ${sheetBg.border}`, fontSize: 13, fontFamily: 'var(--font-body), sans-serif', color: '#2C1810', backgroundColor: sheetBg.bg, outline: 'none', boxSizing: 'border-box' }}
                  />
                  {etabSearch && (
                    <button onClick={() => onEtabSearchChange?.('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#AAA', fontSize: 15, padding: 2, display: 'flex' }}>✕</button>
                  )}
                </div>
                {/* Bouton filtre note */}
                <button onClick={() => setEtabFilterOpen(o => !o)}
                  style={{ width: 44, height: 44, borderRadius: 12, border: `1.5px solid ${etabFilterActive ? 'var(--primary)' : sheetBg.border}`, background: etabFilterActive ? 'var(--primary)' : sheetBg.bg, color: etabFilterActive ? '#fff' : sheetBg.sub, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                  </svg>
                </button>
              </div>

              {/* Popup filtres */}
              {etabFilterOpen && (
                <div style={{ marginTop: 8, background: sheetBg.bg, border: `1.5px solid ${sheetBg.border}`, borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                  {/* Note minimum — 5 étoiles interactives */}
                  <div>
                    <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: sheetBg.sub, textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontFamily: 'var(--font-body), sans-serif' }}>Note minimum</p>
                    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      {[1,2,3,4,5].map(s => (
                        <button key={s} onClick={() => setEtabMinNote(s === etabMinNote ? 0 : s)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px', lineHeight: 0 }}>
                          <svg width="30" height="30" viewBox="0 0 24 24"
                            fill={s <= etabMinNote ? '#F59E0B' : 'none'}
                            stroke={s <= etabMinNote ? '#F59E0B' : '#C8BAA8'}
                            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                          </svg>
                        </button>
                      ))}
                      {etabMinNote > 0 && (
                        <button onClick={() => setEtabMinNote(0)}
                          style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: sheetBg.sub, fontFamily: 'var(--font-body), sans-serif', padding: '2px 4px' }}>
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Séparateur */}
                  <div style={{ height: 1, background: sheetBg.border }} />

                  {/* Ville + Rayon */}
                  <div>
                    <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: sheetBg.sub, textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontFamily: 'var(--font-body), sans-serif' }}>Ville & Rayon</p>
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#AAA" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>
                      </svg>
                      <input type="text" value={etabVille} onChange={e => setEtabVille(e.target.value)}
                        placeholder="Commune…"
                        style={{ width: '100%', padding: '9px 10px 9px 30px', borderRadius: 10, border: `1.5px solid ${etabVille ? 'var(--primary)' : sheetBg.border}`, fontSize: 13, fontFamily: 'var(--font-body), sans-serif', color: '#2C1810', background: sheetBg.bg, outline: 'none', boxSizing: 'border-box' as const }} />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {([null, 5, 10, 20, 50] as const).map(r => (
                        <button key={String(r)} onClick={() => setEtabRayon(r)}
                          style={{ flex: 1, padding: '7px 0', borderRadius: 10, border: `1.5px solid ${etabRayon === r ? 'var(--primary)' : sheetBg.border}`, background: etabRayon === r ? 'var(--primary)' : sheetBg.pill, color: etabRayon === r ? '#fff' : sheetBg.sub, fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body), sans-serif', transition: 'all 0.12s' }}>
                          {r === null ? 'Tout' : `${r}km`}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              )}

            </div>
          )}
        </>
      )}

      {/* ── Séparateur ── */}
      <div style={{ height: 1, backgroundColor: sheetBg.border }} />
      </div>{/* fin header mesuré */}

      {/* ── Liste ── */}
      <style>{`.pdv-list-noscroll{scrollbar-width:none}.pdv-list-noscroll::-webkit-scrollbar{display:none}`}</style>
      <div
        ref={listRef}
        onScroll={e => { if (listStateRef) listStateRef.current = { top: (e.currentTarget as HTMLDivElement).scrollTop, count: visibleCount } }}
        className="pdv-list-noscroll"
        style={{
          flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10,
          padding: '4px 16px 0',
          // La feuille fait toute la hauteur de l'écran mais elle est décalée
          // vers le bas : en 'half' comme en 'peek', sa partie basse est hors
          // champ. Sans cette marge, les dernières cartes tombent dans la zone
          // invisible et rien ne permet d'aller les chercher.
          paddingBottom: 24 + (mode === 'full' ? 0 : snaps[mode]),
        }}
        onPointerDown={e => e.stopPropagation()}
      >
        {appMode === 'annuaire' && annuaireTabIdx === 1 ? (
          etablissementLoading ? [1,2,3].map(i => <SkeletonCard key={i} />) :
          etablissements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: sheetBg.sub }}>
              <p style={{ fontSize: 48, marginBottom: 10 }}>🏪</p>
              <p style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-body), sans-serif', color: sheetBg.text }}>Commerces locaux</p>
              <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5, fontFamily: 'var(--font-body), sans-serif' }}>Les fiches arrivent bientôt.</p>
            </div>
          ) : (
            <>
              {(() => {
                const featured = etablissements.filter(e => e.plan === 'pro' || e.is_featured)
                if (featured.length === 0) return null
                if (mode === 'full') return (
                  <div style={{
                    position: 'sticky', top: -4, zIndex: 5,
                    marginLeft: -16, marginRight: -16, marginTop: -4,
                    backgroundColor: sheetBg.bg,
                    paddingTop: 4, paddingBottom: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.07)',
                  }}>
                    <EtabBandeau etablissements={featured} onDiscover={id => onOpenEtablissement?.(id)} />
                  </div>
                )
                if (mode !== 'peek') return <EtabBandeau etablissements={featured} onDiscover={id => onOpenEtablissement?.(id)} />
                return null
              })()}
              {displayedEtabs.slice(0, visibleEtabCount).map(e => (
                <EtablissementListCard
                  key={e.id}
                  etab={e}
                  isSelected={e.id === selectedEtabId}
                  onSelect={() => onSelectEtab?.(e.id)}
                  onViewOnMap={() => onViewEtabOnMap?.(e.id)}
                  onOpen={() => onOpenEtablissement?.(e.id)}
                />
              ))}
              {visibleEtabCount < displayedEtabs.length && (
                <div ref={etabLoaderRef} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #E0D8CE', borderTopColor: 'var(--primary)', animation: 'spin 0.7s linear infinite' }} />
                </div>
              )}
            </>
          )
        ) : appMode === 'annuaire' ? (
          producerLoading ? [1,2,3].map(i => <SkeletonCard key={i} />) :
          displayedProducers.length === 0 ? (
            // Deux cas distincts : filtre trop restrictif (on le dit et on
            // propose de l'effacer) vs base réellement vide.
            producerSearch.trim() || selectedCats.length > 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: sheetBg.sub }}>
                <p style={{ fontSize: 48, marginBottom: 10 }}>🔍</p>
                <p style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-body), sans-serif', color: sheetBg.text }}>
                  {producerSearch.trim() ? `Aucun producteur pour « ${producerSearch.trim()} »` : 'Aucun producteur dans ces catégories'}
                </p>
                <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5, fontFamily: 'var(--font-body), sans-serif' }}>
                  Essaie un autre mot, ou élargis les filtres.
                </p>
                <button
                  onClick={() => { onProducerSearchChange?.(''); onSelectedCatsChange?.([]) }}
                  style={{ marginTop: 14, padding: '8px 16px', borderRadius: 999, border: `1.5px solid ${sheetBg.border}`, backgroundColor: 'transparent', color: sheetBg.text, fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-body), sans-serif', cursor: 'pointer' }}>
                  Effacer les filtres
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: sheetBg.sub }}>
                <p style={{ fontSize: 48, marginBottom: 10 }}>🌿</p>
                <p style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-body), sans-serif', color: sheetBg.text }}>Producteurs locaux</p>
                <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5, fontFamily: 'var(--font-body), sans-serif' }}>Les fiches arrivent bientôt.</p>
              </div>
            )
          ) : (
            <>
              {featuredProducers.length > 0 && mode !== 'peek' && (
                <ProducerBandeau producers={featuredProducers} onDiscover={id => { onSelectProducer?.(id) }} />
              )}
              {displayedProducers.map(p => (
                <ProducerListCard
                  key={p.id}
                  producer={p}
                  isSelected={p.id === selectedProducerId}
                  onSelect={() => onSelectProducer?.(p.id)}
                  onViewOnMap={() => onViewProducerOnMap?.(p.id)}
                  onOpenProducer={() => onOpenProducer?.(p.id)}
                  isFav={producerFavIds.includes(p.id)}
                  onToggleFav={() => onToggleProducerFav?.(p.id)}
                />
              ))}
            </>
          )
        ) : loading ? (
          [1,2,3].map(i => <SkeletonCard key={i} />)
        ) : visibleSource.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: sheetBg.sub }}>
            <p style={{ fontSize: 48, marginBottom: 10 }}>🏡</p>
            <p style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-body), sans-serif', color: sheetBg.text }}>Aucun événement</p>
            <p style={{ fontSize: 13, marginTop: 6 }}>Modifie les filtres ou ajoute quelque chose !</p>
          </div>
        ) : (
          <>
            {/* Bandeau sticky en haut de liste (mode full uniquement) */}
            {appMode === 'agenda' && proEvents.length > 0 && mode === 'full' && (
              <div style={{
                position: 'sticky', top: -4, zIndex: 5,
                marginLeft: -16, marginRight: -16, marginTop: -4,
                backgroundColor: sheetBg.bg,
                paddingTop: 4, paddingBottom: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.07)',
              }}>
                <ProBandeau events={proEvents} onDiscover={onDiscoverPro ?? (() => {})} compact={true} />
              </div>
            )}

            {visibleEvents.map(evt => (
              <EventListCard key={evt.id} evt={evt}
                isSelected={evt.id === selectedId}
                onSelect={() => onSelectEvent(evt.id)}
                onViewOnMap={() => onViewOnMap(evt.id)}
                onOpenEvent={onOpenEvent ? () => onOpenEvent(evt.id) : undefined}
                isFav={favIds.includes(evt.id)}
                onToggleFav={onToggleFav ? () => onToggleFav(evt.id) : undefined}
                selectMode={selectMode}
                isPicked={picked.has(evt.id)}
                onLongPress={isAdmin ? () => enterSelect(evt.id) : undefined}
                onTogglePick={() => togglePick(evt.id)}
              />
            ))}
            {visibleCount < visibleSource.length && (
              <div ref={loaderRef} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #E0D8CE', borderTopColor: 'var(--primary)', animation: 'spin 0.7s linear infinite' }} />
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>

    {/* ── Barre flottante de sélection multiple (admin) ── */}
    {selectMode && picked.size > 0 && (
      <div style={{
        position: 'fixed', left: 12, right: 12, bottom: navHeight + 12, zIndex: 60,
        background: '#2C1810', color: '#fff', borderRadius: 16,
        padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8,
        boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
      }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>
          {picked.size} sélectionné{picked.size > 1 ? 's' : ''}
        </span>
        <button onClick={exitSelect} disabled={adminBusy}
          style={{ background: 'transparent', color: '#C9BCAD', border: 'none', fontSize: 13, padding: '6px 8px', cursor: 'pointer', opacity: 0.8 }}>
          Annuler
        </button>
        {picked.size >= 2 && (
          <button onClick={openMerge} disabled={adminBusy}
            style={{ background: 'var(--vert, #2D5A3D)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, padding: '8px 12px', cursor: 'pointer', opacity: adminBusy ? 0.5 : 1 }}>
            Fusionner ({picked.size})
          </button>
        )}
        <button onClick={deleteSelected} disabled={adminBusy}
          style={{ background: '#D64545', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, padding: '8px 12px', cursor: 'pointer', opacity: adminBusy ? 0.5 : 1 }}>
          {adminBusy ? '…' : 'Supprimer'}
        </button>
      </div>
    )}

    {/* Aperçu de fusion (admin) */}
    {mergeOpen && picked.size >= 2 && (
      <MergeEventsModal
        ids={Array.from(picked)}
        onClose={() => setMergeOpen(false)}
        onMerged={handleMerged}
      />
    )}

  </>
  )
}

/* ── Card événement — layout horizontal : image gauche, texte droite ── */
function EventListCard({ evt, isSelected, onSelect, onViewOnMap, onOpenEvent, isFav, onToggleFav,
  selectMode, isPicked, onLongPress, onTogglePick }: {
  evt: EvenementCard; isSelected: boolean; onSelect: () => void; onViewOnMap: () => void
  onOpenEvent?: () => void; isFav?: boolean; onToggleFav?: () => void
  // Sélection multiple admin (clic long sur l'agenda)
  selectMode?: boolean; isPicked?: boolean
  onLongPress?: () => void; onTogglePick?: () => void
}) {
  const cats = eventCategories(evt)
  const cat  = CATEGORIES[cats[0]] ?? CATEGORIES.autre
  const lieu = evt.lieux

  // Détection clic long (touch + souris) sans déclencher la navigation.
  // Seuil de mouvement 10px : on n'annule QUE si le doigt bouge vraiment
  // (un scroll), pas au micro-jitter — sinon le long-press ne se déclenche
  // jamais sur tactile (pointermove émis en continu doigt immobile).
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lpFired = useRef(false)
  const lpStart = useRef<{ x: number; y: number } | null>(null)
  const cancelLongPress = () => {
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null }
    lpStart.current = null
  }

  return (
    <Link href={`/evenement/${evt.id}`}
      data-evt-id={evt.id}
      onClick={e => {
        // Si un clic long vient de se déclencher → on avale le clic (pas de nav).
        if (lpFired.current) { e.preventDefault(); lpFired.current = false; return }
        if (selectMode) { e.preventDefault(); onTogglePick?.(); return }
        onSelect(); onOpenEvent?.()
      }}
      onPointerDown={e => {
        if (!onLongPress) return
        lpFired.current = false
        lpStart.current = { x: e.clientX, y: e.clientY }
        lpTimer.current = setTimeout(() => { lpFired.current = true; onLongPress() }, 450)
      }}
      onPointerMove={e => {
        if (lpStart.current && (Math.abs(e.clientX - lpStart.current.x) > 10 || Math.abs(e.clientY - lpStart.current.y) > 10)) cancelLongPress()
      }}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onContextMenu={e => { if (onLongPress) e.preventDefault() }}
      style={{
      display: 'flex', height: 86, flexShrink: 0, position: 'relative',
      WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none',
      borderRadius: 14, overflow: 'hidden', textDecoration: 'none',
      backgroundColor: '#fff',
      boxShadow: isPicked
        ? `0 0 0 2.5px var(--vert, #2D5A3D), 0 4px 18px rgba(0,0,0,0.18)`
        : isSelected
        ? `0 0 0 2.5px var(--primary), 0 4px 18px rgba(0,0,0,0.14)`
        : '0 1px 6px rgba(44,44,44,0.09)',
    }}>
      {/* Pastille de sélection (mode sélection admin) */}
      {selectMode && (
        <div style={{
          position: 'absolute', top: 6, left: 6, zIndex: 2,
          width: 22, height: 22, borderRadius: 999,
          background: isPicked ? 'var(--vert, #2D5A3D)' : 'rgba(255,255,255,0.92)',
          border: isPicked ? 'none' : '2px solid #B8AFA2',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        }}>
          {isPicked && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      )}
      {/* Image gauche — l'affiche de l'événement, sinon l'illustration de sa
          catégorie, sinon l'emoji sur aplat (comportement historique). */}
      <div style={{ width: 86, flexShrink: 0, position: 'relative', overflow: 'hidden', backgroundColor: cat.color + '22' }}>
        {imageEvenement(evt)
          ? <img src={imageEvenement(evt)!} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: evt.image_url ? (evt.image_position ?? '50% 50%') : '50% 50%' }} />
          : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>{cat.emoji}</div>
        }
      </div>

      {/* Contenu droite */}
      <div style={{ flex: 1, padding: '8px 10px 8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        {/* Haut : badge(s) + titre */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3, flexWrap: 'nowrap', overflow: 'hidden' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', flexShrink: 0,
              fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
              color: '#fff', backgroundColor: cat.color,
              borderRadius: 999, padding: '2px 7px',
            }}>{cat.label}</span>
            {/* Catégories additionnelles → pastilles colorées compactes */}
            {cats.slice(1).map(c => {
              const extra = CATEGORIES[c] ?? CATEGORIES.autre
              return (
                <span key={c} title={extra.label} style={{
                  flexShrink: 0, width: 9, height: 9, borderRadius: 999,
                  backgroundColor: extra.color, border: '1.5px solid #fff',
                  boxShadow: '0 0 0 0.5px rgba(0,0,0,0.08)',
                }} />
              )
            })}
            {lieu?.commune && (
              <span style={{ fontSize: 10, color: '#6B5E4E', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lieu.commune}
              </span>
            )}
          </div>
          <h3 style={{
            fontFamily: 'var(--font-body), sans-serif', fontWeight: 700, fontSize: 14,
            color: '#1C1917', margin: 0, lineHeight: 1.3,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {evt.titre}
          </h3>
        </div>

        {/* Bas : date + actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {evt.date_debut ? (
            <p style={{ fontSize: 11, color: '#6B5E4E', margin: 0, }}>
              {formatEventDate(evt.date_debut, evt.date_fin)}{evt.heure && !evt.date_fin ? ` · ${evt.heure.slice(0,5)}` : ''}
            </p>
          ) : <div />}

          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {lieu?.lat && lieu?.lng && (
              <button onClick={e => { e.preventDefault(); e.stopPropagation(); onViewOnMap() }}
                style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#EDE8DF', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B5E4E' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                  <circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/>
                </svg>
              </button>
            )}
            <button onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFav?.() }}
              style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#EDE8DF', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill={isFav ? '#EC407A' : 'none'} stroke={isFav ? '#EC407A' : '#6B5E4E'} strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
            <button onClick={e => {
              e.preventDefault(); e.stopPropagation()
              const url = `${window.location.origin}/evenement/${evt.id}`
              if (navigator.share) { navigator.share({ title: evt.titre, url }).catch(() => {}) }
              else { navigator.clipboard.writeText(url).catch(() => {}) }
            }}
              style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#EDE8DF', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B5E4E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </Link>
  )
}

function ProducerListCard({ producer, isSelected, onSelect, onViewOnMap, onOpenProducer, isFav, onToggleFav }: {
  producer: ProducerCard; isSelected: boolean; onSelect: () => void; onViewOnMap: () => void
  onOpenProducer?: () => void; isFav?: boolean; onToggleFav?: () => void
}) {
  const cats = producer.produit_categories
    .slice(0, 2)
    .map(id => PRODUIT_CATS.find(p => p.id === id))
    .filter(Boolean)

  return (
    <div onClick={() => { onSelect(); onOpenProducer?.() }} style={{
      display: 'flex', height: 86, flexShrink: 0,
      borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
      backgroundColor: '#fff',
      boxShadow: isSelected
        ? '0 0 0 2.5px #2D5A3D, 0 4px 18px rgba(0,0,0,0.14)'
        : '0 1px 6px rgba(44,44,44,0.09)',
    }}>
      <div style={{ width: 86, flexShrink: 0, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {producer.photo_url
          ? <img src={producer.photo_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 32 }}>🌿</span>}
      </div>
      <div style={{ flex: 1, padding: '8px 10px 8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        <div>
          <p style={{ fontFamily: 'var(--font-body), sans-serif', fontWeight: 700, fontSize: 14, color: '#1C1917', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{producer.nom}</p>
          {producer.commune && <p style={{ fontSize: 11, color: '#6B5E4E', margin: 0, }}>📍 {producer.commune}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden', flex: 1, minWidth: 0 }}>
            {cats.map(c => c && (
              <span key={c.id} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, backgroundColor: '#E8F2EB', color: '#2D5A3D', fontWeight: 700, fontFamily: 'var(--font-body), sans-serif', whiteSpace: 'nowrap' }}>
                {c.emoji} {c.label}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {producer.lat && producer.lng && (
              <button onClick={e => { e.preventDefault(); e.stopPropagation(); onViewOnMap() }}
                style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#EDE8DF', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B5E4E' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                  <circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/>
                </svg>
              </button>
            )}
            <button onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFav?.() }}
              style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#EDE8DF', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill={isFav ? '#EC407A' : 'none'} stroke={isFav ? '#EC407A' : '#6B5E4E'} strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
            <button onClick={e => {
              e.preventDefault(); e.stopPropagation()
              const url = `${window.location.origin}/producteur/${producer.id}`
              if (navigator.share) { navigator.share({ title: producer.nom, url }).catch(() => {}) }
              else { navigator.clipboard.writeText(url).catch(() => {}) }
            }}
              style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#EDE8DF', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B5E4E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EtablissementListCard({ etab, isSelected, onSelect, onViewOnMap, onOpen }: {
  etab: EtablissementCard; isSelected: boolean
  onSelect: () => void; onViewOnMap: () => void; onOpen: () => void
}) {
  const typeInfo = ETAB_TYPE_LIST.find(t => t.id === etab.type)
  const photo = etab.photos?.[0]

  // Clic sur la carte = sélectionner PUIS ouvrir la fiche — même geste que les
  // producteurs. La sélection étant portée par la page, elle survit à
  // l'aller-retour sur la fiche : au retour, la punaise est toujours ouverte.
  return (
    <div onClick={() => { onSelect(); onOpen() }} style={{
      display: 'flex', height: 86, flexShrink: 0,
      borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
      backgroundColor: '#fff',
      boxShadow: isSelected
        ? '0 0 0 2.5px #2D5A3D, 0 4px 18px rgba(0,0,0,0.14)'
        : '0 1px 6px rgba(44,44,44,0.09)',
    }}>
      <div style={{ width: 86, flexShrink: 0, backgroundColor: typeInfo?.bg ?? '#F5F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {photo
          ? <img src={photo} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 30 }}>{typeInfo?.emoji ?? '🏪'}</span>}
      </div>
      <div style={{ flex: 1, padding: '8px 10px 8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: typeInfo?.color ?? '#555', backgroundColor: typeInfo?.bg ?? '#F5F0E8', borderRadius: 999, padding: '2px 7px', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
              {typeInfo?.emoji} {typeInfo?.label}
            </span>
            {etab.is_featured && <span style={{ fontSize: 9, color: '#B45309', fontWeight: 700 }}>★</span>}
          </div>
          <p style={{ fontFamily: 'var(--font-body), sans-serif', fontWeight: 700, fontSize: 14, color: '#1C1917', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etab.nom}</p>
          {etab.commune && <p style={{ fontSize: 11, color: '#6B5E4E', margin: 0, }}>📍 {etab.commune}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          {etab.note_google ? (
            <span style={{ fontSize: 11, color: '#92400E', fontWeight: 700, flexShrink: 0 }}>⭐ {etab.note_google.toFixed(1)}</span>
          ) : <div />}
          {etab.description_courte && (
            <p style={{ fontSize: 10, color: '#8A8A8A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0, paddingLeft: 6, }}>{texteBrut(etab.description_courte)}</p>
          )}
          {/* Voir sur la carte — même bouton que les producteurs et les
              événements. Absent si la fiche n'a pas de coordonnées : il n'y
              aurait aucune punaise à montrer. */}
          {etab.lat && etab.lng && (
            <button onClick={e => { e.preventDefault(); e.stopPropagation(); onViewOnMap() }}
              aria-label="Voir sur la carte"
              style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#EDE8DF', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B5E4E', flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                <circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div style={{ height: 86, borderRadius: 14, flexShrink: 0, display: 'flex', overflow: 'hidden', backgroundColor: '#FDFAF5', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }} className="animate-pulse">
      <div style={{ width: 86, backgroundColor: '#EDE8DF' }} />
      <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ height: 10, borderRadius: 6, backgroundColor: '#EDE8DF', width: '38%' }} />
        <div style={{ height: 13, borderRadius: 6, backgroundColor: '#EDE8DF', width: '88%' }} />
        <div style={{ height: 10, borderRadius: 6, backgroundColor: '#EDE8E0', width: '52%' }} />
      </div>
    </div>
  )
}
