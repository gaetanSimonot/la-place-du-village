'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, useMotionValue, animate, useDragControls, AnimatePresence } from 'framer-motion'
import { Evenement, Filtres, Categorie, FiltreQuand } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'
import Link from 'next/link'

const FULL_TOP = 48
const PEEK_H   = 152  // handle + count + filters + pills space

const CATS = Object.keys(CATEGORIES) as Categorie[]

const QUAND_OPTIONS: { value: FiltreQuand; label: string }[] = [
  { value: 'toujours',       label: 'Toujours'      },
  { value: 'aujourd_hui',    label: "Aujourd'hui"   },
  { value: 'ce_week_end',    label: 'Ce week-end'   },
  { value: 'cette_semaine',  label: 'Cette semaine' },
  { value: 'ce_mois',        label: 'Ce mois'       },
]

interface Props {
  evenements: Evenement[]
  loading: boolean
  selectedId: string | null
  onSelectEvent: (id: string) => void
  onViewOnMap: (id: string) => void
  filtres: Filtres
  onFiltresChange: (f: Filtres) => void
  mode: 'peek' | 'full'
  navHeight: number
}

export default function BottomSheet({
  evenements, loading, selectedId, onSelectEvent, onViewOnMap,
  filtres, onFiltresChange, mode, navHeight,
}: Props) {
  const [screenH, setScreenH]   = useState(812)
  const dragControls            = useDragControls()
  const screenHRef              = useRef(812)

  // Cycling state pour les filtres
  const [quoiIdx, setQuoiIdx]   = useState(-1) // index courant dans CATS
  const [quandIdx, setQuandIdx] = useState(0)  // index courant dans QUAND_OPTIONS

  const getSnaps = useCallback((h: number, navH: number) => ({
    peek: h - FULL_TOP - navH - PEEK_H,
    full: 0,
  }), [])

  const y = useMotionValue(9999)

  useEffect(() => {
    const h = window.innerHeight
    screenHRef.current = h
    setScreenH(h)
    y.set(getSnaps(h, navHeight).peek)
  }, [getSnaps, navHeight, y])

  // Sync mode externe
  const isMounted = useRef(false)
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return }
    const snaps = getSnaps(screenH, navHeight)
    animate(y, snaps[mode], { type: 'spring', stiffness: 360, damping: 36 })
  }, [mode, screenH, navHeight, getSnaps, y])

  const snaps = getSnaps(screenH, navHeight)

  const handleDragEnd = (_: unknown, info: { velocity: { y: number } }) => {
    const current = y.get()
    const vy      = info.velocity.y
    const target  = (vy > 300 || current > snaps.peek / 2) ? 'peek' : 'full'
    animate(y, snaps[target], { type: 'spring', stiffness: 360, damping: 36 })
  }

  // ——— Logique filtres ———

  // "Que faire" : cycle + ajoute la catégorie
  const handleQuoiFaire = () => {
    const nextIdx = (quoiIdx + 1) % CATS.length
    setQuoiIdx(nextIdx)
    const cat = CATS[nextIdx]
    if (!filtres.categories.includes(cat)) {
      onFiltresChange({ ...filtres, categories: [...filtres.categories, cat] })
    }
  }

  const removeCategorie = (cat: Categorie) => {
    onFiltresChange({ ...filtres, categories: filtres.categories.filter(c => c !== cat) })
  }

  // "Quand donc" : cycle single-select
  const handleQuand = () => {
    const nextIdx = (quandIdx + 1) % QUAND_OPTIONS.length
    setQuandIdx(nextIdx)
    onFiltresChange({ ...filtres, quand: QUAND_OPTIONS[nextIdx].value })
  }

  const resetQuand = () => {
    setQuandIdx(0)
    onFiltresChange({ ...filtres, quand: 'toujours' })
  }

  const hasQuoi  = filtres.categories.length > 0
  const hasQuand = filtres.quand !== 'toujours'

  const quandLabel = QUAND_OPTIONS[quandIdx]?.label ?? 'Quand donc ?'

  // Label animé du bouton "Que faire"
  const quoiLabel = quoiIdx === -1
    ? 'Que faire ?'
    : `${CATEGORIES[CATS[quoiIdx]].emoji} ${CATEGORIES[CATS[quoiIdx]].label}`

  // Événement sélectionné remonté en tête
  const sortedEvents = selectedId
    ? [
        ...evenements.filter(e => e.id === selectedId),
        ...evenements.filter(e => e.id !== selectedId),
      ]
    : evenements

  const SHEET_H   = screenH - FULL_TOP - navHeight
  const isScrollable = mode === 'full'

  return (
    <motion.div
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: snaps.peek }}
      dragElastic={0.06}
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
      {/* ── Poignée ── */}
      <div
        onPointerDown={e => dragControls.start(e)}
        style={{ padding: '10px 0 4px', flexShrink: 0, cursor: 'grab', touchAction: 'none' }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto' }} />
      </div>

      {/* ── Compteur ── */}
      <div
        onPointerDown={e => dragControls.start(e)}
        style={{ padding: '0 16px 8px', flexShrink: 0, cursor: 'grab', touchAction: 'none' }}
      >
        <p style={{ fontSize: 12, fontWeight: 600, color: '#8A8A8A', fontFamily: 'Inter, sans-serif', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
          {loading ? '—' : `${evenements.length} événement${evenements.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* ── Deux gros boutons filtres ── */}
      <div
        style={{ display: 'flex', gap: 10, padding: '0 16px 10px', flexShrink: 0 }}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Que faire */}
        <button
          onClick={handleQuoiFaire}
          style={{
            flex: 1, height: 52, borderRadius: 14, border: 'none',
            backgroundColor: hasQuoi ? '#E8622A' : '#FAF7F2',
            color: hasQuoi ? '#fff' : '#2C2C2C',
            fontSize: 14, fontWeight: 700, fontFamily: 'Syne, sans-serif',
            cursor: 'pointer', overflow: 'hidden', position: 'relative',
          }}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={quoiLabel}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.14 }}
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {quoiLabel}
            </motion.span>
          </AnimatePresence>
        </button>

        {/* Quand donc */}
        <button
          onClick={handleQuand}
          style={{
            flex: 1, height: 52, borderRadius: 14, border: 'none',
            backgroundColor: hasQuand ? '#E8622A' : '#FAF7F2',
            color: hasQuand ? '#fff' : '#2C2C2C',
            fontSize: 14, fontWeight: 700, fontFamily: 'Syne, sans-serif',
            cursor: 'pointer', overflow: 'hidden', position: 'relative',
          }}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={quandLabel}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.14 }}
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {quandLabel}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>

      {/* ── Pills actifs ── */}
      <AnimatePresence>
        {(hasQuoi || hasQuand) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden', flexShrink: 0 }}
          >
            <div
              style={{
                display: 'flex', gap: 6, padding: '0 16px 10px',
                overflowX: 'auto',
                msOverflowStyle: 'none', scrollbarWidth: 'none',
              }}
              onPointerDown={e => e.stopPropagation()}
            >
              {filtres.categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => removeCategorie(cat)}
                  style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                    backgroundColor: CATEGORIES[cat].color + '22',
                    color: CATEGORIES[cat].color,
                    border: `1.5px solid ${CATEGORIES[cat].color}55`,
                    borderRadius: 999, padding: '4px 10px',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  {CATEGORIES[cat].emoji} {CATEGORIES[cat].label} ×
                </button>
              ))}
              {hasQuand && (
                <button
                  onClick={resetQuand}
                  style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                    backgroundColor: '#E8622A22', color: '#E8622A',
                    border: '1.5px solid #E8622A55',
                    borderRadius: 999, padding: '4px 10px',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  📅 {quandLabel} ×
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Liste ── */}
      <div
        style={{
          flex: 1,
          overflowY: isScrollable ? 'auto' : 'hidden',
          padding: '8px 16px 24px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
        onPointerDown={e => e.stopPropagation()}
      >
        {loading ? (
          [1, 2, 3].map(i => <SkeletonCard key={i} />)
        ) : sortedEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#8A8A8A' }}>
            <p style={{ fontSize: 48, marginBottom: 10 }}>🏡</p>
            <p style={{ fontWeight: 700, fontSize: 16, fontFamily: 'Syne, sans-serif', color: '#2C2C2C' }}>Aucun événement</p>
            <p style={{ fontSize: 13, marginTop: 6 }}>Modifie les filtres ou ajoute quelque chose !</p>
          </div>
        ) : (
          sortedEvents.map(evt => (
            <EventListCard
              key={evt.id}
              evt={evt}
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

/* ──────────────────────────────────────────────
   Card événement — image en fond, titre par-dessus
────────────────────────────────────────────── */
function EventListCard({
  evt, isSelected, onSelect, onViewOnMap,
}: {
  evt: Evenement
  isSelected: boolean
  onSelect: () => void
  onViewOnMap: () => void
}) {
  const cat  = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  const lieu = evt.lieux

  return (
    <Link
      href={`/evenement/${evt.id}`}
      onClick={onSelect}
      style={{
        display: 'block', position: 'relative',
        height: 130, borderRadius: 16, overflow: 'hidden',
        textDecoration: 'none',
        boxShadow: isSelected
          ? `0 0 0 2px #E8622A, 0 4px 16px rgba(232,98,42,0.2)`
          : '0 2px 10px rgba(44,44,44,0.1)',
        transition: 'box-shadow 0.2s',
        flexShrink: 0,
      }}
    >
      {/* Fond : image ou couleur catégorie */}
      {evt.image_url ? (
        <img
          src={evt.image_url} alt={evt.titre}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color, opacity: 0.85 }} />
      )}

      {/* Dégradé */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.05) 100%)',
      }} />

      {/* Contenu */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 12px 10px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontWeight: 700,
          backgroundColor: cat.color, color: '#fff',
          borderRadius: 999, padding: '2px 8px', marginBottom: 4,
          fontFamily: 'Inter, sans-serif',
        }}>
          {cat.emoji} {cat.label}
        </span>

        <h3 style={{
          fontSize: 14, fontWeight: 700, color: '#fff',
          fontFamily: 'Syne, sans-serif', lineHeight: 1.25,
          margin: 0, marginBottom: 2,
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {evt.titre}
        </h3>

        {evt.date_debut && (
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', margin: 0, fontFamily: 'Inter, sans-serif' }}>
            {formatDate(evt.date_debut)}{evt.heure ? ` · ${evt.heure.slice(0, 5)}` : ''}
            {lieu?.commune ? ` · ${lieu.commune}` : ''}
          </p>
        )}
      </div>

      {/* Bouton voir sur la carte */}
      {lieu?.lat && lieu?.lng && (
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onViewOnMap() }}
          title="Voir sur la carte"
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: 'rgba(255,255,255,0.92)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}
        >
          🗺️
        </button>
      )}

      {/* Indicateur sélectionné */}
      {isSelected && (
        <div style={{
          position: 'absolute', top: 8, left: 8,
          width: 8, height: 8, borderRadius: '50%',
          backgroundColor: '#E8622A',
          boxShadow: '0 0 0 2px #fff',
        }} />
      )}
    </Link>
  )
}

/* ── Skeleton ── */
function SkeletonCard() {
  return (
    <div style={{
      height: 130, borderRadius: 16, overflow: 'hidden',
      backgroundColor: '#EDE8E0', flexShrink: 0,
    }} className="animate-pulse" />
  )
}
