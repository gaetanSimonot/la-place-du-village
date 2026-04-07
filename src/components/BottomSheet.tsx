'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, useMotionValue, animate, useDragControls, AnimatePresence } from 'framer-motion'
import { Evenement, Filtres, Categorie, FiltreQuand } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'
import Link from 'next/link'

const FULL_TOP = 60   // espace laissé en haut quand sheet pleine
const PEEK_H   = 116  // handle + count + 2 boutons filtres

const CATS = Object.keys(CATEGORIES) as Categorie[]

const QUAND_OPTIONS: { value: FiltreQuand; label: string; short: string }[] = [
  { value: 'toujours',       label: 'Toujours',      short: 'Toujours'   },
  { value: 'aujourd_hui',    label: "Aujourd'hui",   short: "Auj."       },
  { value: 'ce_week_end',    label: 'Ce week-end',   short: 'Ce WE'      },
  { value: 'cette_semaine',  label: 'Cette semaine', short: 'Semaine'    },
  { value: 'ce_mois',        label: 'Ce mois',       short: 'Ce mois'    },
]

interface Props {
  evenements: Evenement[]
  loading: boolean
  selectedId: string | null
  onSelectEvent: (id: string) => void
  onViewOnMap: (id: string) => void
  filtres: Filtres
  onFiltresChange: (f: Filtres) => void
  mode: 'peek' | 'half' | 'full'
  onModeChange: (m: 'peek' | 'half' | 'full') => void
  navHeight: number
}

export default function BottomSheet({
  evenements, loading, selectedId, onSelectEvent, onViewOnMap,
  filtres, onFiltresChange, mode, onModeChange, navHeight,
}: Props) {
  const [screenH, setScreenH]     = useState(812)
  const dragControls              = useDragControls()

  // Filtre "Que faire" — cursor dans CATS, -1 = row fermée
  const [quoiOpen,   setQuoiOpen]   = useState(false)
  const [quoiCursor, setQuoiCursor] = useState(-1)
  // Filtre "Quand donc" — cursor dans QUAND_OPTIONS
  const [quandOpen,   setQuandOpen]   = useState(false)
  const [quandCursor, setQuandCursor] = useState(0)

  // Refs pour auto-scroll des rows
  const quoiPillRefs  = useRef<(HTMLButtonElement | null)[]>([])
  const quandPillRefs = useRef<(HTMLButtonElement | null)[]>([])

  const getSnaps = useCallback((h: number, navH: number) => {
    const sh = h - FULL_TOP - navH
    return {
      peek: sh - PEEK_H,
      half: Math.round(sh * 0.5),
      full: 0,
    }
  }, [])

  const y = useMotionValue(9999)

  useEffect(() => {
    const h = window.innerHeight
    setScreenH(h)
    y.set(getSnaps(h, navHeight).half) // départ à la moitié
  }, [getSnaps, navHeight, y])

  const isMounted = useRef(false)
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return }
    const snaps = getSnaps(screenH, navHeight)
    animate(y, snaps[mode], { type: 'spring', stiffness: 340, damping: 36 })
  }, [mode, screenH, navHeight, getSnaps, y])

  const snaps = getSnaps(screenH, navHeight)

  const snapTo = useCallback((target: 'peek' | 'half' | 'full') => {
    onModeChange(target)
    animate(y, getSnaps(screenH, navHeight)[target], { type: 'spring', stiffness: 340, damping: 36 })
  }, [onModeChange, y, getSnaps, screenH, navHeight])

  const handleDragEnd = (_: unknown, info: { velocity: { y: number } }) => {
    const current = y.get()
    const vy = info.velocity.y
    const s  = getSnaps(screenH, navHeight)
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
      setQuoiCursor(0)
      if (mode === 'peek') snapTo('half')
      return
    }
    setQuoiCursor(prev => (prev + 1) % CATS.length)
  }

  // ── "Quand donc" button : cycle single-select ──
  const handleQuandBtn = () => {
    if (!quandOpen) {
      setQuandOpen(true)
      if (mode === 'peek') snapTo('half')
    }
    const next = (quandCursor + 1) % QUAND_OPTIONS.length
    setQuandCursor(next)
    onFiltresChange({ ...filtres, quand: QUAND_OPTIONS[next].value })
  }

  // Auto-scroll vers le pill actif
  useEffect(() => {
    quoiPillRefs.current[quoiCursor]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [quoiCursor])
  useEffect(() => {
    quandPillRefs.current[quandCursor]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [quandCursor])

  const toggleCategorie = (cat: Categorie) => {
    const cats = filtres.categories.includes(cat)
      ? filtres.categories.filter(c => c !== cat)
      : [...filtres.categories, cat]
    onFiltresChange({ ...filtres, categories: cats })
  }

  const resetQuoi = () => {
    setQuoiOpen(false)
    setQuoiCursor(-1)
    onFiltresChange({ ...filtres, categories: [] })
  }

  const resetQuand = () => {
    setQuandOpen(false)
    setQuandCursor(0)
    onFiltresChange({ ...filtres, quand: 'toujours' })
  }

  const hasQuoi  = filtres.categories.length > 0
  const hasQuand = filtres.quand !== 'toujours'

  const quoiLabel  = quoiCursor < 0 ? 'Que faire ?' : `${CATEGORIES[CATS[quoiCursor]].emoji} ${CATEGORIES[CATS[quoiCursor]].label}`
  const quandLabel = QUAND_OPTIONS[quandCursor]?.label ?? 'Quand donc ?'
  const quandBtnLabel = !quandOpen && !hasQuand ? 'Quand donc ?' : quandLabel

  const sortedEvents = selectedId
    ? [...evenements.filter(e => e.id === selectedId), ...evenements.filter(e => e.id !== selectedId)]
    : evenements

  const SHEET_H = screenH - FULL_TOP - navHeight

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
        left: 0, right: 0, top: FULL_TOP,
        height: SHEET_H,
        backgroundColor: '#fff',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -4px 28px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column',
        zIndex: 20, overflow: 'hidden',
      }}
    >
      {/* ── Zone de drag : handle + compteur + boutons filtres ── */}
      <div
        onPointerDown={e => dragControls.start(e)}
        style={{ flexShrink: 0, cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
      >
        {/* Poignée visuelle */}
        <div style={{ padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto' }} />
        </div>

        {/* Compteur */}
        <div style={{ padding: '0 16px 7px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#8A8A8A', fontFamily: 'Inter, sans-serif', letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0 }}>
            {loading ? '—' : `${evenements.length} événement${evenements.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Deux gros boutons filtres */}
        <div style={{ display: 'flex', gap: 10, padding: '0 16px 10px' }}>
        <button onClick={handleQuoiBtn} style={{
          flex: 1, height: 50, borderRadius: 14, border: 'none',
          backgroundColor: hasQuoi ? '#E8622A' : '#FAF7F2',
          color: hasQuoi ? '#fff' : '#2C2C2C',
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
          backgroundColor: hasQuand ? '#E8622A' : '#FAF7F2',
          color: hasQuand ? '#fff' : '#2C2C2C',
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
                flexShrink: 0, padding: '6px 14px', borderRadius: 999, border: '1.5px solid #EDE8E0',
                backgroundColor: !hasQuoi ? '#E8622A' : '#FAF7F2',
                color: !hasQuoi ? '#fff' : '#8A8A8A',
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
                    onClick={() => { setQuoiCursor(i); toggleCategorie(cat) }}
                    style={{
                      flexShrink: 0,
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 13px', borderRadius: 999,
                      border: `2px solid ${isCursor ? info.color : isActive ? info.color + '88' : '#EDE8E0'}`,
                      backgroundColor: isActive ? info.color : isCursor ? info.color + '18' : '#FAF7F2',
                      color: isActive ? '#fff' : isCursor ? info.color : '#6B6B6B',
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
              {QUAND_OPTIONS.map((opt, i) => {
                const isCursor = quandCursor === i
                return (
                  <button
                    key={opt.value}
                    ref={el => { quandPillRefs.current[i] = el }}
                    onClick={() => { setQuandCursor(i); onFiltresChange({ ...filtres, quand: opt.value }); if (opt.value === 'toujours') resetQuand() }}
                    style={{
                      flexShrink: 0,
                      padding: '6px 14px', borderRadius: 999,
                      border: `2px solid ${isCursor ? '#E8622A' : '#EDE8E0'}`,
                      backgroundColor: isCursor ? '#E8622A' : '#FAF7F2',
                      color: isCursor ? '#fff' : '#6B6B6B',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                      minHeight: 34,
                      boxShadow: isCursor ? '0 0 0 3px rgba(232,98,42,0.2)' : 'none',
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
      <div style={{ height: 1, backgroundColor: '#F0EBE3', flexShrink: 0 }} />

      {/* ── Liste ── */}
      <div
        style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}
        onPointerDown={e => e.stopPropagation()}
      >
        {loading ? (
          [1,2,3].map(i => <SkeletonCard key={i} />)
        ) : sortedEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#8A8A8A' }}>
            <p style={{ fontSize: 48, marginBottom: 10 }}>🏡</p>
            <p style={{ fontWeight: 700, fontSize: 16, fontFamily: 'Syne, sans-serif', color: '#2C2C2C' }}>Aucun événement</p>
            <p style={{ fontSize: 13, marginTop: 6 }}>Modifie les filtres ou ajoute quelque chose !</p>
          </div>
        ) : (
          sortedEvents.map(evt => (
            <EventListCard key={evt.id} evt={evt}
              isSelected={evt.id === selectedId}
              onSelect={() => onSelectEvent(evt.id)}
              onViewOnMap={() => onViewOnMap(evt.id)}
            />
          ))
        )}
      </div>
    </motion.div>
  )
}

/* ── Card événement ── */
function EventListCard({ evt, isSelected, onSelect, onViewOnMap }: {
  evt: Evenement; isSelected: boolean; onSelect: () => void; onViewOnMap: () => void
}) {
  const cat  = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  const lieu = evt.lieux

  return (
    <Link href={`/evenement/${evt.id}`} onClick={onSelect} style={{
      display: 'block', position: 'relative', height: 128,
      borderRadius: 16, overflow: 'hidden', textDecoration: 'none', flexShrink: 0,
      boxShadow: isSelected ? `0 0 0 2.5px #E8622A, 0 4px 16px rgba(232,98,42,0.18)` : '0 2px 10px rgba(44,44,44,0.1)',
    }}>
      {evt.image_url
        ? <img src={evt.image_url} alt={evt.titre} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color, opacity: 0.8 }} />
      }
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.2) 55%, transparent 100%)' }} />

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 12px 10px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, backgroundColor: cat.color, color: '#fff', borderRadius: 999, padding: '2px 8px', marginBottom: 4 }}>
          {cat.emoji} {cat.label}
        </span>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'Syne, sans-serif', lineHeight: 1.25, margin: '0 0 2px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {evt.titre}
        </h3>
        {evt.date_debut && (
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.82)', margin: 0, fontFamily: 'Inter, sans-serif' }}>
            {formatDate(evt.date_debut)}{evt.heure ? ` · ${evt.heure.slice(0,5)}` : ''}{lieu?.commune ? ` · ${lieu.commune}` : ''}
          </p>
        )}
      </div>

      {lieu?.lat && lieu?.lng && (
        <button onClick={e => { e.preventDefault(); e.stopPropagation(); onViewOnMap() }}
          style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
          🗺️
        </button>
      )}

      {isSelected && <div style={{ position: 'absolute', top: 8, left: 8, width: 8, height: 8, borderRadius: '50%', backgroundColor: '#E8622A', boxShadow: '0 0 0 2px #fff' }} />}
    </Link>
  )
}

function SkeletonCard() {
  return <div style={{ height: 128, borderRadius: 16, backgroundColor: '#EDE8E0', flexShrink: 0 }} className="animate-pulse" />
}
