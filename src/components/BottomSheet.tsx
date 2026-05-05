'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, useMotionValue, animate, useDragControls, AnimatePresence } from 'framer-motion'
import { EvenementCard, Filtres, Categorie, FiltreQuand, AppMode, ProducerCard, ProduitCategorie } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { PRODUIT_CATS } from '@/lib/produit-cats'
import { formatDate } from '@/lib/filters'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import CaptureProducteur from '@/components/CaptureProducteur'
import ProducerBandeau from '@/components/ProducerBandeau'

const FULL_TOP = 60   // espace laissé en haut quand sheet pleine

const CATS = Object.keys(CATEGORIES) as Categorie[]

const QUAND_OPTIONS: { value: FiltreQuand; label: string; short: string }[] = [
  { value: 'aujourd_hui',    label: "Aujourd'hui",   short: "Auj."    },
  { value: 'cette_semaine',  label: 'Cette semaine', short: 'Semaine' },
  { value: 'ce_week_end',    label: 'Ce week-end',   short: 'Ce WE'   },
  { value: 'ce_mois',        label: 'Ce mois',       short: 'Ce mois' },
]

import { useTheme } from '@/components/ThemeProvider'

const BATCH = 20

const ANNUAIRE_TABS = [
  { id: 'producteurs',  label: 'Producteurs',     emoji: '🌿', active: true  },
  { id: 'restaurateurs',label: 'Restaurateurs',   emoji: '🍽️', active: false },
  { id: 'artisans',     label: 'Artisans',        emoji: '🔨', active: false },
  { id: 'sante',        label: 'Santé & bien-être',emoji: '💚', active: false },
]

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
  producerSearch?: string
  onProducerSearchChange?: (q: string) => void
  producerFavIds?: string[]
  onToggleProducerFav?: (id: string) => void
  featuredProducers?: ProducerCard[]
}

export default function BottomSheet({
  evenements, loading, selectedId, onSelectEvent, onViewOnMap,
  filtres, onFiltresChange, mode, onModeChange, navHeight, screenH,
  onPeekHeightChange, onOpenEvent,
  favIds = [], onToggleFav,
  appMode, producers = [], producerLoading = false,
  selectedProducerId = null, onSelectProducer, onViewProducerOnMap,
  selectedCats = [], onSelectedCatsChange,
  producerSearch = '', onProducerSearchChange,
  producerFavIds = [], onToggleProducerFav,
  featuredProducers = [], onOpenProducer,
}: Props) {
  const { sheetBg } = useTheme()
  const { user } = useAuth()
  const [userPlan, setUserPlan] = useState<string | null>(null)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [peekH, setPeekH]         = useState(130) // hauteur mesurée du header
  const [visibleCount, setVisibleCount] = useState(BATCH)
  const headerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const obsRef = useRef<IntersectionObserver | null>(null)
  const loaderRef = useCallback((el: HTMLDivElement | null) => {
    if (obsRef.current) { obsRef.current.disconnect(); obsRef.current = null }
    if (!el) return
    obsRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setVisibleCount(n => n + BATCH)
    }, { threshold: 0.1 })
    obsRef.current.observe(el)
  }, [])
  const dragControls              = useDragControls()

  useEffect(() => {
    if (!user?.id) return
    supabase.from('profiles').select('plan').eq('user_id', user.id).single()
      .then(({ data: p }) => { if (p) setUserPlan(p.plan ?? null) })
  }, [user?.id])

  // Filtre "Que faire" — cursor dans CATS, -1 = row fermée
  const [quoiOpen,   setQuoiOpen]   = useState(false)
  const [quoiCursor, setQuoiCursor] = useState(-1)
  // Filtre "Quand donc" — cursor dans QUAND_OPTIONS, -1 = reset
  const [quandOpen,   setQuandOpen]   = useState(false)
  const [quandCursor, setQuandCursor] = useState(-1)

  // Annuaire state
  const [annuaireTabIdx,  setAnnuaireTabIdx]  = useState(0)
  const [annuaireRowOpen, setAnnuaireRowOpen] = useState(false)

  // Refs pour auto-scroll des rows
  const quoiPillRefs  = useRef<(HTMLButtonElement | null)[]>([])
  const quandPillRefs = useRef<(HTMLButtonElement | null)[]>([])

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

  // ── "Que faire" button : cycle + sélectionne ──
  const handleQuoiBtn = () => {
    if (!quoiOpen) {
      setQuoiOpen(true)
      if (mode === 'peek') snapTo('half')
    }
    const next = quoiCursor + 1 < CATS.length ? quoiCursor + 1 : -1
    if (next === -1) {
      resetQuoi()
    } else {
      setQuoiCursor(next)
      onFiltresChange({ ...filtres, categories: [CATS[next]] })
    }
  }

  // ── "Quand donc" button : cycle + reset comme "Que faire" ──
  const handleQuandBtn = () => {
    if (!quandOpen) {
      setQuandOpen(true)
      if (mode === 'peek') snapTo('half')
    }
    const next = quandCursor + 1 < QUAND_OPTIONS.length ? quandCursor + 1 : -1
    if (next === -1) {
      resetQuand()
    } else {
      setQuandCursor(next)
      onFiltresChange({ ...filtres, quand: QUAND_OPTIONS[next].value })
    }
  }

  // Auto-scroll vers le pill actif
  useEffect(() => {
    quoiPillRefs.current[quoiCursor]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [quoiCursor])
  useEffect(() => {
    quandPillRefs.current[quandCursor]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [quandCursor])

  const resetQuoi = () => {
    setQuoiOpen(false)
    setQuoiCursor(-1)
    onFiltresChange({ ...filtres, categories: [] })
  }

  const resetQuand = () => {
    setQuandOpen(false)
    setQuandCursor(-1)
    onFiltresChange({ ...filtres, quand: 'toujours' })
  }

  const hasQuoi  = filtres.categories.length > 0
  const hasQuand = filtres.quand !== 'toujours'

  const quoiLabel     = quoiCursor < 0 ? 'Que faire ?' : CATEGORIES[CATS[quoiCursor]].label
  const quandBtnLabel = quandCursor < 0 ? 'Quand donc ?' : QUAND_OPTIONS[quandCursor].short

  // Reset state quand on change de mode
  useEffect(() => {
    if (appMode === 'annuaire') { setQuoiOpen(false); setQuandOpen(false) }
    else { setAnnuaireRowOpen(false); onSelectedCatsChange?.([]); onProducerSearchChange?.('') }
  }, [appMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnnuaireBtn = () => {
    if (!annuaireRowOpen) { setAnnuaireRowOpen(true); if (mode === 'peek') snapTo('half'); return }
    setAnnuaireRowOpen(false)
  }

  // Reset visibleCount quand la liste change (nouveau filtre)
  useEffect(() => { setVisibleCount(BATCH) }, [evenements])

  // Scroll en haut quand on descend en peek
  useEffect(() => {
    if (mode === 'peek') listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [mode])

  // Suggestions de produits basées sur les producers filtrés par catégorie
  const suggestions = useMemo(() => {
    if (!producerSearch || producerSearch.length < 1) return []
    const q = producerSearch.toLowerCase()
    const names = new Set<string>()
    producers.forEach(p => {
      p.produits_disponibles?.forEach(pr => {
        if (pr.nom.toLowerCase().includes(q)) names.add(pr.nom)
      })
    })
    return Array.from(names).slice(0, 6)
  }, [producers, producerSearch])

  const sortedEvents = selectedId
    ? [...evenements.filter(e => e.id === selectedId), ...evenements.filter(e => e.id !== selectedId)]
    : evenements

  const visibleEvents = sortedEvents.slice(0, visibleCount)

  return (
    <>
    <motion.div
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

        {/* Compteur d'événements (agenda, non-full) */}
        {appMode === 'agenda' && mode !== 'full' && (
          <div onPointerDown={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 16px 10px' }}>
            <img src="/icons/evenements.png" alt="" style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, objectFit: 'cover' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 16, color: '#1C1917', margin: 0, lineHeight: 1.1 }}>
                {evenements.length} événement{evenements.length > 1 ? 's' : ''}
              </p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#6B5E4E', margin: '1px 0 0', lineHeight: 1.2 }}>
                Autour de toi cette semaine
              </p>
              <p style={{ fontFamily: 'Lora, serif', fontSize: 10, color: '#9E9089', margin: '1px 0 0' }}>
                Marchés · ateliers · concerts…
              </p>
            </div>
            <button
              onClick={() => snapTo('full')}
              style={{
                flexShrink: 0, padding: '7px 13px', borderRadius: 999,
                border: '1.5px solid #2D5A3D', backgroundColor: 'transparent',
                color: '#2D5A3D', fontFamily: 'Inter, sans-serif', fontWeight: 700,
                fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
              Voir la liste →
            </button>
          </div>
        )}

        {/* Boutons filtres : agenda → deux boutons, annuaire → bouton unique */}
        {appMode === 'agenda' ? (
          <div style={{ display: 'flex', gap: 10, padding: '0 16px 10px' }}>
            <button onClick={handleQuoiBtn} style={{ flex: 1, height: 52, borderRadius: 14, border: 'none', backgroundColor: '#2D5A3D', color: '#fff', fontFamily: 'Inter, sans-serif', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 9, opacity: hasQuoi ? 1 : 0.85, overflow: 'hidden' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
                </svg>
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={quoiLabel} initial={{ y: 5, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -5, opacity: 0 }} transition={{ duration: 0.13 }} style={{ textAlign: 'left', overflow: 'hidden' }}>
                  <p style={{ fontWeight: 700, fontSize: 13, margin: 0, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{quoiLabel}</p>
                  {!hasQuoi && <p style={{ fontSize: 10, margin: '1px 0 0', color: 'rgba(255,255,255,0.65)', lineHeight: 1 }}>Explorer par activité</p>}
                </motion.div>
              </AnimatePresence>
            </button>
            <button onClick={handleQuandBtn} style={{ flex: 1, height: 52, borderRadius: 14, border: 'none', backgroundColor: '#2D5A3D', color: '#fff', fontFamily: 'Inter, sans-serif', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 9, opacity: hasQuand ? 1 : 0.85, overflow: 'hidden' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={quandBtnLabel} initial={{ y: 5, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -5, opacity: 0 }} transition={{ duration: 0.13 }} style={{ textAlign: 'left', overflow: 'hidden' }}>
                  <p style={{ fontWeight: 700, fontSize: 13, margin: 0, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{quandBtnLabel}</p>
                  {!hasQuand && <p style={{ fontSize: 10, margin: '1px 0 0', color: 'rgba(255,255,255,0.65)', lineHeight: 1 }}>Explorer par date</p>}
                </motion.div>
              </AnimatePresence>
            </button>
          </div>
        ) : (
          <div style={{ padding: '0 16px 10px' }}>
            {/* Bouton + capture produits — MAX uniquement en mode annuaire */}
            {userPlan === 'max' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                <button onClick={() => setCaptureOpen(true)} title="Ajouter des produits" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', backgroundColor: 'var(--primary)', color: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</button>
              </div>
            )}
            <button onClick={handleAnnuaireBtn} style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', backgroundColor: '#2D5A3D', color: '#fff', fontFamily: 'Inter, sans-serif', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, opacity: annuaireRowOpen ? 1 : 0.85, overflow: 'hidden' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 15 }}>
                {ANNUAIRE_TABS[annuaireTabIdx].emoji}
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={ANNUAIRE_TABS[annuaireTabIdx].id} initial={{ y: 5, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -5, opacity: 0 }} transition={{ duration: 0.13 }} style={{ textAlign: 'left' }}>
                  <p style={{ fontWeight: 700, fontSize: 13, margin: 0, lineHeight: 1.2 }}>{ANNUAIRE_TABS[annuaireTabIdx].label}</p>
                  <p style={{ fontSize: 10, margin: '1px 0 0', color: 'rgba(255,255,255,0.65)', lineHeight: 1 }}>Filtrer par catégorie</p>
                </motion.div>
              </AnimatePresence>
            </button>
          </div>
        )}
      </div>{/* fin zone drag */}

      {/* ── Row "Que faire" ── */}
      <AnimatePresence>
        {appMode === 'agenda' && quoiOpen && (
          <motion.div key="quoi-row"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden', flexShrink: 0 }}
          >
            <div style={{ display: 'flex', gap: 7, padding: '0 16px 10px', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              onPointerDown={e => e.stopPropagation()}>
              {/* Pill "Tout" */}
              <button onClick={resetQuoi} style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 999, border: `1.5px solid ${sheetBg.border}`,
                backgroundColor: !hasQuoi ? 'var(--primary)' : sheetBg.pill,
                color: !hasQuoi ? '#fff' : sheetBg.sub,
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                minHeight: 34,
              }}>Tout</button>

              {CATS.map((cat, i) => {
                const info     = CATEGORIES[cat]
                const isCursor = quoiCursor === i
                const isActive = filtres.categories.includes(cat)
                return (
                  <button
                    key={cat}
                    ref={el => { quoiPillRefs.current[i] = el }}
                    onClick={() => { setQuoiCursor(i); onFiltresChange({ ...filtres, categories: [cat] }) }}
                    style={{
                      flexShrink: 0,
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 13px', borderRadius: 999,
                      border: `2px solid ${isCursor ? info.color : isActive ? info.color + '88' : sheetBg.border}`,
                      backgroundColor: isActive ? info.color : isCursor ? info.color + '18' : sheetBg.pill,
                      color: isActive ? '#fff' : isCursor ? info.color : sheetBg.sub,
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                      minHeight: 34,
                      boxShadow: isCursor ? `0 0 0 3px ${info.color}30` : 'none',
                      transition: 'all 0.12s',
                    }}
                  >
                    {info.label}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Row "Quand donc" ── */}
      <AnimatePresence>
        {appMode === 'agenda' && quandOpen && (
          <motion.div key="quand-row"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden', flexShrink: 0 }}
          >
            <div style={{ display: 'flex', gap: 7, padding: '0 16px 10px', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              onPointerDown={e => e.stopPropagation()}>
              {/* Pill "Tout" */}
              <button onClick={resetQuand} style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 999, border: `1.5px solid ${sheetBg.border}`,
                backgroundColor: quandCursor < 0 ? 'var(--primary)' : sheetBg.pill,
                color: quandCursor < 0 ? '#fff' : sheetBg.sub,
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                minHeight: 34,
              }}>Tout</button>

              {QUAND_OPTIONS.map((opt, i) => {
                const isCursor = quandCursor === i
                return (
                  <button
                    key={opt.value}
                    ref={el => { quandPillRefs.current[i] = el }}
                    onClick={() => { setQuandCursor(i); onFiltresChange({ ...filtres, quand: opt.value }) }}
                    style={{
                      flexShrink: 0,
                      padding: '6px 14px', borderRadius: 999,
                      border: `2px solid ${isCursor ? 'var(--primary)' : sheetBg.border}`,
                      backgroundColor: isCursor ? 'var(--primary)' : sheetBg.pill,
                      color: isCursor ? '#fff' : sheetBg.sub,
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                      minHeight: 34,
                      boxShadow: isCursor ? '0 0 0 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.12s',
                    }}
                  >{opt.short}</button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Rows annuaire ── */}
      {appMode === 'annuaire' && (
        <>
          {/* Types (producteurs / restaurateurs / ...) */}
          <AnimatePresence>
            {annuaireRowOpen && (
              <motion.div key="annuaire-tabs" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 7, padding: '0 16px 10px', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }} onPointerDown={e => e.stopPropagation()}>
                  {ANNUAIRE_TABS.map((tab, idx) => (
                    <button key={tab.id}
                      onClick={() => tab.active && setAnnuaireTabIdx(idx)}
                      style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 999, border: `1.5px solid ${sheetBg.border}`, backgroundColor: annuaireTabIdx === idx ? 'var(--primary)' : tab.active ? sheetBg.pill : sheetBg.pill, color: annuaireTabIdx === idx ? '#fff' : tab.active ? sheetBg.sub : '#C0B8A8', fontSize: 12, fontWeight: 700, cursor: tab.active ? 'pointer' : 'default', fontFamily: 'Inter, sans-serif', minHeight: 34, display: 'flex', alignItems: 'center', gap: 5, opacity: tab.active ? 1 : 0.5 }}>
                      {tab.emoji} {tab.label}
                      {!tab.active && <span style={{ fontSize: 9 }}>bientôt</span>}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Catégories produits */}
          {annuaireTabIdx === 0 && (
            <div style={{ display: 'flex', gap: 7, padding: '0 16px 8px', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }} onPointerDown={e => e.stopPropagation()}>
              <button onClick={() => onSelectedCatsChange?.([])} style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 999, border: `1.5px solid ${sheetBg.border}`, backgroundColor: selectedCats.length === 0 ? 'var(--primary)' : sheetBg.pill, color: selectedCats.length === 0 ? '#fff' : sheetBg.sub, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', minHeight: 34 }}>Tout</button>
              {PRODUIT_CATS.map(cat => {
                const active = selectedCats.includes(cat.id)
                return (
                  <button key={cat.id} onClick={() => onSelectedCatsChange?.(active ? selectedCats.filter(c => c !== cat.id) : [...selectedCats, cat.id])}
                    style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 999, border: `1.5px solid ${active ? 'var(--primary)' : sheetBg.border}`, backgroundColor: active ? 'var(--primary)' : sheetBg.pill, color: active ? '#fff' : sheetBg.sub, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', minHeight: 34, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {cat.emoji} {cat.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Barre de recherche + suggestions */}
          <div style={{ padding: '0 16px 10px', position: 'relative' }} onPointerDown={e => e.stopPropagation()}>
            <div style={{ position: 'relative' }}>
              <input type="text" value={producerSearch} onChange={e => onProducerSearchChange?.(e.target.value)}
                placeholder="Producteur, produit, commune…"
                style={{ width: '100%', padding: '10px 36px 10px 14px', borderRadius: producerSearch && suggestions.length > 0 ? '12px 12px 0 0' : 12, border: `1.5px solid ${sheetBg.border}`, borderBottom: producerSearch && suggestions.length > 0 ? 'none' : `1.5px solid ${sheetBg.border}`, fontSize: 13, fontFamily: 'Inter, sans-serif', color: '#2C1810', backgroundColor: sheetBg.bg, outline: 'none', boxSizing: 'border-box' }} />
              {producerSearch ? (
                <button onClick={() => onProducerSearchChange?.('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#AAA', fontSize: 15, padding: 2, display: 'flex' }}>✕</button>
              ) : (
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#AAA', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
              )}
            </div>
            {producerSearch && suggestions.length > 0 && (
              <div style={{ position: 'absolute', left: 16, right: 16, zIndex: 50, backgroundColor: sheetBg.bg, border: `1.5px solid ${sheetBg.border}`, borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden', boxShadow: '0 6px 16px rgba(0,0,0,0.10)' }}>
                {suggestions.map((s, i) => (
                  <button key={s} onPointerDown={e => { e.preventDefault(); e.stopPropagation(); onProducerSearchChange?.(s) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', borderTop: i > 0 ? `1px solid ${sheetBg.border}` : 'none', backgroundColor: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#2C1810', fontFamily: 'Inter, sans-serif' }}>
                    <span style={{ color: '#8A8A8A', fontSize: 12 }}>🛒</span>
                    <span style={{ flex: 1 }}>{s}</span>
                    <span style={{ fontSize: 10, color: '#AAA', fontWeight: 600 }}>produit</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Séparateur ── */}
      <div style={{ height: 1, backgroundColor: sheetBg.border }} />
      </div>{/* fin header mesuré */}

      {/* ── Liste ── */}
      <div
        ref={listRef}
        style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}
        onPointerDown={e => e.stopPropagation()}
      >
        {appMode === 'annuaire' ? (
          producerLoading ? [1,2,3].map(i => <SkeletonCard key={i} />) :
          producers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: sheetBg.sub }}>
              <p style={{ fontSize: 48, marginBottom: 10 }}>🌿</p>
              <p style={{ fontWeight: 700, fontSize: 16, fontFamily: 'Inter, sans-serif', color: sheetBg.text }}>Producteurs locaux</p>
              <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5, fontFamily: 'Inter, sans-serif' }}>Les fiches arrivent bientôt.</p>
            </div>
          ) : (
            <>
              {featuredProducers.length > 0 && mode !== 'peek' && (
                <ProducerBandeau producers={featuredProducers} onDiscover={id => { onSelectProducer?.(id) }} />
              )}
              {producers.map(p => (
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
        ) : sortedEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: sheetBg.sub }}>
            <p style={{ fontSize: 48, marginBottom: 10 }}>🏡</p>
            <p style={{ fontWeight: 700, fontSize: 16, fontFamily: 'Inter, sans-serif', color: sheetBg.text }}>Aucun événement</p>
            <p style={{ fontSize: 13, marginTop: 6 }}>Modifie les filtres ou ajoute quelque chose !</p>
          </div>
        ) : (
          <>
            {visibleEvents.map(evt => (
              <EventListCard key={evt.id} evt={evt}
                isSelected={evt.id === selectedId}
                onSelect={() => onSelectEvent(evt.id)}
                onViewOnMap={() => onViewOnMap(evt.id)}
                onOpenEvent={onOpenEvent ? () => onOpenEvent(evt.id) : undefined}
                isFav={favIds.includes(evt.id)}
                onToggleFav={onToggleFav ? () => onToggleFav(evt.id) : undefined}
              />
            ))}
            {visibleCount < sortedEvents.length && (
              <div ref={loaderRef} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #E0D8CE', borderTopColor: 'var(--primary)', animation: 'spin 0.7s linear infinite' }} />
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>

    {captureOpen && <CaptureProducteur onClose={() => setCaptureOpen(false)} />}
  </>
  )
}

/* ── Card événement — layout horizontal : image gauche, texte droite ── */
function EventListCard({ evt, isSelected, onSelect, onViewOnMap, onOpenEvent, isFav, onToggleFav }: {
  evt: EvenementCard; isSelected: boolean; onSelect: () => void; onViewOnMap: () => void
  onOpenEvent?: () => void; isFav?: boolean; onToggleFav?: () => void
}) {
  const cat  = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  const lieu = evt.lieux

  return (
    <Link href={`/evenement/${evt.id}`} onClick={() => { onSelect(); onOpenEvent?.() }} style={{
      display: 'flex', height: 86, flexShrink: 0,
      borderRadius: 14, overflow: 'hidden', textDecoration: 'none',
      backgroundColor: '#fff',
      boxShadow: isSelected
        ? `0 0 0 2.5px var(--primary), 0 4px 18px rgba(0,0,0,0.14)`
        : '0 1px 6px rgba(44,44,44,0.09)',
    }}>
      {/* Image gauche */}
      <div style={{ width: 86, flexShrink: 0, position: 'relative', overflow: 'hidden', backgroundColor: cat.color + '22' }}>
        {evt.image_url
          ? <img src={evt.image_url} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%' }} />
          : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>{cat.emoji}</div>
        }
      </div>

      {/* Contenu droite */}
      <div style={{ flex: 1, padding: '8px 10px 8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        {/* Haut : badge + titre */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3, flexWrap: 'nowrap', overflow: 'hidden' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', flexShrink: 0,
              fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
              color: '#fff', backgroundColor: cat.color,
              borderRadius: 999, padding: '2px 7px',
            }}>{cat.label}</span>
            {lieu?.commune && (
              <span style={{ fontSize: 10, color: '#6B5E4E', fontWeight: 600, fontFamily: 'Lora, serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lieu.commune}
              </span>
            )}
          </div>
          <h3 style={{
            fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14,
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
            <p style={{ fontSize: 11, color: '#6B5E4E', margin: 0, fontFamily: 'Lora, serif' }}>
              {formatDate(evt.date_debut)}{evt.heure ? ` · ${evt.heure.slice(0,5)}` : ''}
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
    <Link href={`/producteur/${producer.id}`} onClick={() => { onSelect(); onOpenProducer?.() }} style={{
      display: 'flex', height: 86, flexShrink: 0,
      borderRadius: 14, overflow: 'hidden', textDecoration: 'none',
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
          <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14, color: '#1C1917', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{producer.nom}</p>
          {producer.commune && <p style={{ fontSize: 11, color: '#6B5E4E', margin: 0, fontFamily: 'Lora, serif' }}>📍 {producer.commune}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden', flex: 1, minWidth: 0 }}>
            {cats.map(c => c && (
              <span key={c.id} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, backgroundColor: '#E8F2EB', color: '#2D5A3D', fontWeight: 700, fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>
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
    </Link>
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
