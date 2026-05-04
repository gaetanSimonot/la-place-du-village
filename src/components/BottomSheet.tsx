'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, useMotionValue, animate, useDragControls, AnimatePresence } from 'framer-motion'
import { EvenementCard, Filtres, Categorie, FiltreQuand } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'
import Link from 'next/link'

const FULL_TOP = 60   // espace laissé en haut quand sheet pleine

const CATS = Object.keys(CATEGORIES) as Categorie[]

const QUAND_OPTIONS: { value: FiltreQuand; label: string; short: string }[] = [
  { value: 'aujourd_hui',    label: "Aujourd'hui",   short: "Auj."    },
  { value: 'cette_semaine',  label: 'Cette semaine', short: 'Semaine' },
  { value: 'ce_week_end',    label: 'Ce week-end',   short: 'Ce WE'   },
  { value: 'ce_mois',        label: 'Ce mois',       short: 'Ce mois' },
]

import { useTheme } from '@/components/ThemeProvider'
import ProBandeau from '@/components/ProBandeau'

const BATCH = 20

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
  proEvents?: EvenementCard[]
  onDiscoverPro?: (id: string) => void
  onOpenEvent?: (id: string) => void
  favIds?: string[]
  onToggleFav?: (id: string) => void
}

export default function BottomSheet({
  evenements, loading, selectedId, onSelectEvent, onViewOnMap,
  filtres, onFiltresChange, mode, onModeChange, navHeight, screenH,
  onPeekHeightChange, proEvents = [], onDiscoverPro, onOpenEvent,
  favIds = [], onToggleFav,
}: Props) {
  const { sheetBg } = useTheme()
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

  // Filtre "Que faire" — cursor dans CATS, -1 = row fermée
  const [quoiOpen,   setQuoiOpen]   = useState(false)
  const [quoiCursor, setQuoiCursor] = useState(-1)
  // Filtre "Quand donc" — cursor dans QUAND_OPTIONS, -1 = reset
  const [quandOpen,   setQuandOpen]   = useState(false)
  const [quandCursor, setQuandCursor] = useState(-1)

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

  const quoiLabel     = quoiCursor < 0 ? 'Que faire ?' : `${CATEGORIES[CATS[quoiCursor]].emoji} ${CATEGORIES[CATS[quoiCursor]].label}`
  const quandBtnLabel = quandCursor < 0 ? 'Quand donc ?' : QUAND_OPTIONS[quandCursor].short

  // Reset visibleCount quand la liste change (nouveau filtre)
  useEffect(() => { setVisibleCount(BATCH) }, [evenements])

  // Scroll en haut quand on descend en peek
  useEffect(() => {
    if (mode === 'peek') listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [mode])

  const sortedEvents = selectedId
    ? [...evenements.filter(e => e.id === selectedId), ...evenements.filter(e => e.id !== selectedId)]
    : evenements

  const visibleEvents = sortedEvents.slice(0, visibleCount)

  return (
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
        <div style={{ padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: sheetBg.border, margin: '0 auto' }} />
        </div>

        {/* Logo + Compteur */}
        <div style={{ padding: '0 16px 7px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/logo.svg" width={28} height={28} alt="" style={{ flexShrink: 0, borderRadius: 6 }} />
          <p style={{ fontSize: 11, fontWeight: 700, color: sheetBg.sub, fontFamily: 'Inter, sans-serif', letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0 }}>
            {loading ? '—' : `${evenements.length} événement${evenements.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Deux gros boutons filtres */}
        <div style={{ display: 'flex', gap: 10, padding: '0 16px 10px' }}>
        <button onClick={handleQuoiBtn} style={{
          flex: 1, height: 50, borderRadius: 14, border: 'none',
          backgroundColor: hasQuoi ? 'var(--primary)' : '#3A3028',
          color: '#FAF5EE',
          fontSize: 14, fontWeight: 700, fontFamily: 'Syne, sans-serif',
          cursor: 'pointer', overflow: 'hidden', position: 'relative',
        }}>
          <AnimatePresence mode="wait">
            <motion.span key={quoiLabel}
              initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.13 }}
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >{quoiLabel}</motion.span>
          </AnimatePresence>
        </button>

        <button onClick={handleQuandBtn} style={{
          flex: 1, height: 50, borderRadius: 14, border: 'none',
          backgroundColor: hasQuand ? 'var(--primary)' : '#3A3028',
          color: '#FAF5EE',
          fontSize: 14, fontWeight: 700, fontFamily: 'Syne, sans-serif',
          cursor: 'pointer', overflow: 'hidden', position: 'relative',
        }}>
          <AnimatePresence mode="wait">
            <motion.span key={quandBtnLabel}
              initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.13 }}
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >{quandBtnLabel}</motion.span>
          </AnimatePresence>
        </button>
        </div>{/* fin boutons */}
      </div>{/* fin zone drag */}

      {/* ── Row "Que faire" ── */}
      <AnimatePresence>
        {quoiOpen && (
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
                    <span style={{ fontSize: 14 }}>{info.emoji}</span>
                    <span>{info.label}</span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Row "Quand donc" ── */}
      <AnimatePresence>
        {quandOpen && (
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

      {/* ── Séparateur ── */}
      <div style={{ height: 1, backgroundColor: sheetBg.border }} />
      </div>{/* fin header mesuré */}

      {/* ProBandeau — visible en mode half et full */}
      {mode !== 'peek' && proEvents.length > 0 && (
        <ProBandeau events={proEvents} onDiscover={onDiscoverPro ?? (() => {})} />
      )}

      {/* ── Liste ── */}
      <div
        ref={listRef}
        style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}
        onPointerDown={e => e.stopPropagation()}
      >
        {loading ? (
          [1,2,3].map(i => <SkeletonCard key={i} />)
        ) : sortedEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: sheetBg.sub }}>
            <p style={{ fontSize: 48, marginBottom: 10 }}>🏡</p>
            <p style={{ fontWeight: 700, fontSize: 16, fontFamily: 'Syne, sans-serif', color: sheetBg.text }}>Aucun événement</p>
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
            {/* Sentinelle scroll infini */}
            {visibleCount < sortedEvents.length && (
              <div ref={loaderRef} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #E0D8CE', borderTopColor: 'var(--primary)', animation: 'spin 0.7s linear infinite' }} />
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
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
              display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
              fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
              color: '#fff', backgroundColor: cat.color,
              borderRadius: 999, padding: '2px 7px',
            }}>{cat.emoji} {cat.label}</span>
            {lieu?.commune && (
              <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lieu.commune}
              </span>
            )}
          </div>
          <h3 style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14,
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
            <p style={{ fontSize: 11, color: '#78716C', margin: 0, fontFamily: 'Inter, sans-serif' }}>
              {formatDate(evt.date_debut)}{evt.heure ? ` · ${evt.heure.slice(0,5)}` : ''}
            </p>
          ) : <div />}

          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {lieu?.lat && lieu?.lng && (
              <button onClick={e => { e.preventDefault(); e.stopPropagation(); onViewOnMap() }}
                style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#F3F0EB', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#78716C' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                  <circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/>
                </svg>
              </button>
            )}
            <button onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFav?.() }}
              style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#F3F0EB', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill={isFav ? '#EC407A' : 'none'} stroke={isFav ? '#EC407A' : '#78716C'} strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
            <button onClick={e => {
              e.preventDefault(); e.stopPropagation()
              const url = `${window.location.origin}/evenement/${evt.id}`
              if (navigator.share) { navigator.share({ title: evt.titre, url }).catch(() => {}) }
              else { navigator.clipboard.writeText(url).catch(() => {}) }
            }}
              style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#F3F0EB', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#78716C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <div style={{ height: 86, borderRadius: 14, flexShrink: 0, display: 'flex', overflow: 'hidden', backgroundColor: '#fff', boxShadow: '0 1px 6px rgba(44,44,44,0.06)' }} className="animate-pulse">
      <div style={{ width: 86, backgroundColor: '#EDE8E0' }} />
      <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ height: 10, borderRadius: 6, backgroundColor: '#EDE8E0', width: '38%' }} />
        <div style={{ height: 13, borderRadius: 6, backgroundColor: '#EDE8E0', width: '88%' }} />
        <div style={{ height: 10, borderRadius: 6, backgroundColor: '#EDE8E0', width: '52%' }} />
      </div>
    </div>
  )
}
