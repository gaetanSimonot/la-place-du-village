'use client'
import { useMemo, useState } from 'react'
import { CATEGORIES } from '@/lib/categories'
import type { Categorie, FiltreQuand, Filtres } from '@/lib/types'

const CATS = Object.keys(CATEGORIES) as Categorie[]

type CategorieOuTout = Categorie | '__tout'
type QuandOuTout    = FiltreQuand | 'toujours'

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const JOURS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM']

/* Dates manipulées en composantes LOCALES (jamais via toISOString(), qui
   convertit en UTC et décale d'un jour le soir en heure française). */
const pad = (n: number) => String(n).padStart(2, '0')
function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function formatCourt(iso: string): string {
  const d = fromISO(iso)
  return `${d.getDate()} ${MOIS[d.getMonth()].toLowerCase()}`
}

const QUAND_OPTIONS: { value: QuandOuTout; label: string }[] = [
  { value: 'toujours',      label: 'Tout' },
  { value: 'aujourd_hui',   label: "Aujourd'hui" },
  { value: 'cette_semaine', label: 'Cette semaine' },
  { value: 'ce_week_end',   label: 'Ce week-end' },
  { value: 'ce_mois',       label: 'Ce mois' },
]

interface Props {
  filtres: Filtres
  onFiltresChange: (f: Filtres) => void
  /** Callback optionnel à chaque changement (ex : snap sheet à half) */
  onChange?: () => void
}

/**
 * Remplace les anciens wheel-pickers par 2 boutons "cycle on tap" :
 * un tap → avance d'un cran dans la liste de filtres, en loop.
 * Chevrons haut/bas pour indiquer qu'on peut taper pour défiler.
 * Léger bounce au tap (scale 0.96 → 1) pour feedback haptique visuel.
 */
export default function AgendaFilterWheel({ filtres, onFiltresChange, onChange }: Props) {
  const quoiOptions = useMemo(() => [
    { value: '__tout' as CategorieOuTout, label: 'Tout' },
    ...CATS.map(id => ({ value: id as CategorieOuTout, label: CATEGORIES[id].label })),
  ], [])

  const quoiValue: CategorieOuTout = (filtres.categories[0] as Categorie | undefined) ?? '__tout'
  const quandValue: QuandOuTout    = filtres.quand
  const dateActive = filtres.date ?? null

  function cycleQuoi() {
    const idx = quoiOptions.findIndex(o => o.value === quoiValue)
    const next = quoiOptions[(idx + 1) % quoiOptions.length].value
    if (next === '__tout') onFiltresChange({ ...filtres, categories: [] })
    else onFiltresChange({ ...filtres, categories: [next as Categorie] })
    onChange?.()
  }

  // Taper sur "Quand" reprend la main sur le calendrier : c'est la sortie
  // naturelle d'une date précise, sans bouton d'effacement supplémentaire.
  function cycleQuand() {
    if (dateActive) {
      onFiltresChange({ ...filtres, date: null })
      onChange?.()
      return
    }
    const idx = QUAND_OPTIONS.findIndex(o => o.value === quandValue)
    const next = QUAND_OPTIONS[(idx + 1) % QUAND_OPTIONS.length].value
    onFiltresChange({ ...filtres, quand: next as FiltreQuand })
    onChange?.()
  }

  const quoiLabel  = quoiOptions.find(o => o.value === quoiValue)?.label ?? 'Tout'
  // Une date précise prime sur `quand` : on l'affiche dans le bouton Quand,
  // sinon le filtre actif serait invisible et l'utilisateur ne comprendrait
  // pas pourquoi sa liste est courte.
  const quandLabel = dateActive
    ? formatCourt(dateActive)
    : (QUAND_OPTIONS.find(o => o.value === quandValue)?.label ?? 'Tout')

  return (
    <div className="flex w-full gap-2">
      <CycleBtn kicker="Que faire" label={quoiLabel}  onClick={cycleQuoi} />
      <CycleBtn kicker="Quand"     label={quandLabel} onClick={cycleQuand} />
    </div>
  )
}

/**
 * Bouton calendrier rond, flottant en haut à droite du BottomSheet, + son
 * panneau. Volontairement SÉPARÉ de la rangée de filtres : tant qu'il en
 * faisait partie, il rognait la largeur des deux boutons cycle et leur
 * largeur se mettait à dépendre du libellé affiché.
 *
 * À monter comme enfant direct du sheet (qui est `position: absolute`), donc
 * positionné par rapport à lui : le bouton suit le haut du sheet quelle que
 * soit sa position de snap, sans rien savoir de sa géométrie.
 *
 * `pointerEvents: none` sur le conteneur, `auto` sur le bouton et le
 * panneau : la zone vide laisse passer le drag du sheet en dessous.
 */
export function AgendaDateButton({
  filtres, onFiltresChange, onOpenChange,
}: Omit<Props, 'onChange'> & {
  /** Prévient le sheet de l'ouverture/fermeture pour qu'il se déploie puis
   *  revienne à sa position précédente. */
  onOpenChange?: (open: boolean) => void
}) {
  const dateActive = filtres.date ?? null
  const [calOpen, setCalOpen]     = useState(false)
  const [pressed, setPressed]     = useState(false)
  const [viewMonth, setViewMonth] = useState<Date>(() => new Date())

  function fermer() {
    setCalOpen(false)
    onOpenChange?.(false)
  }

  function toggle() {
    setPressed(true)
    window.setTimeout(() => setPressed(false), 180)
    if (calOpen) { fermer(); return }
    setViewMonth(fromISO(dateActive ?? toISO(new Date())))
    setCalOpen(true)
    onOpenChange?.(true)
  }

  // Un tap sur un jour applique tout de suite et referme : pas d'étape de
  // validation, le filtre reste réversible d'un tap sur "Quand".
  function choisirJour(iso: string) {
    onFiltresChange({ ...filtres, date: iso })
    fermer()
  }

  return (
    <div
      onPointerDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      style={{ position: 'absolute', top: 8, left: 16, right: 16, zIndex: 30, pointerEvents: 'none' }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          aria-label="Choisir une date précise"
          onClick={toggle}
          style={{
            pointerEvents: 'auto',
            width: 52, height: 52, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#2D5A3D', border: 'none', color: '#fff', cursor: 'pointer',
            boxShadow: pressed ? '0 1px 4px rgba(26,18,9,0.18)' : '0 3px 12px rgba(26,18,9,0.22)',
            transform: pressed ? 'scale(0.94)' : 'scale(1)',
            transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="5" width="18" height="16" rx="2.5" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <line x1="8" y1="3" x2="8" y2="6.5" />
            <line x1="16" y1="3" x2="16" y2="6.5" />
            <circle cx="8.5" cy="14.5" r="1.15" fill="currentColor" stroke="none" />
            <circle cx="15.5" cy="14.5" r="1.15" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>

      {calOpen && (
        <div style={{ pointerEvents: 'auto', marginTop: 8 }}>
          <DatePanel
            selected={dateActive}
            viewMonth={viewMonth}
            onViewMonthChange={setViewMonth}
            onPick={choisirJour}
            onCancel={fermer}
          />
        </div>
      )}
    </div>
  )
}

/* ── Panneau calendrier dépliant ─────────────────────────────────────── */
function DatePanel({
  selected, viewMonth, onViewMonthChange, onPick, onCancel,
}: {
  selected: string | null
  viewMonth: Date
  onViewMonthChange: (d: Date) => void
  onPick: (iso: string) => void
  onCancel: () => void
}) {
  const todayISO = toISO(new Date())

  // Grille du mois, lundi en première colonne. Les cases vides du début
  // décalent le 1er sur le bon jour de semaine.
  const cells = useMemo(() => {
    const y = viewMonth.getFullYear()
    const m = viewMonth.getMonth()
    const offset = (new Date(y, m, 1).getDay() + 6) % 7   // getDay: 0=dim → lundi=0
    const nbJours = new Date(y, m + 1, 0).getDate()
    const out: (string | null)[] = Array(offset).fill(null)
    for (let d = 1; d <= nbJours; d++) out.push(toISO(new Date(y, m, d)))
    return out
  }, [viewMonth])

  const shiftMonth = (delta: number) =>
    onViewMonthChange(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1))

  return (
    <div
      style={{
        marginTop: 10, borderRadius: 18, background: '#fff',
        border: '1px solid #C8DEC0', overflow: 'hidden',
        boxShadow: '0 6px 20px rgba(45,90,61,0.10)',
      }}
    >
      {/* Barre Annuler / titre. Pas de "Valider" : le tap sur un jour applique
          directement. Le bloc de droite est un fantôme de même largeur que
          "Annuler" pour que le titre reste optiquement centré. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #EDE8DF' }}>
        <button type="button" onClick={onCancel}
          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: '#5B8A4A', fontSize: 14, fontFamily: 'var(--font-body), sans-serif' }}>
          Annuler
        </button>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#1A1209' }}>Choisir une date</span>
        <span aria-hidden style={{ fontSize: 14, visibility: 'hidden', fontFamily: 'var(--font-body), sans-serif' }}>Annuler</span>
      </div>

      {/* Navigation mois */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 6px' }}>
        <NavArrow dir="prev" onClick={() => shiftMonth(-1)} />
        <span style={{ fontWeight: 700, fontSize: 16, color: '#1A1209' }}>
          {MOIS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
        </span>
        <NavArrow dir="next" onClick={() => shiftMonth(1)} />
      </div>

      {/* En-têtes jours */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '4px 10px 2px' }}>
        {JOURS.map(j => (
          <div key={j} style={{ textAlign: 'center', fontSize: 10, letterSpacing: '0.06em', color: '#9E9089', fontWeight: 600 }}>{j}</div>
        ))}
      </div>

      {/* Grille des jours */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, padding: '2px 10px 14px' }}>
        {cells.map((iso, i) => {
          if (!iso) return <div key={`v${i}`} />
          const isSelected = iso === selected
          const isToday    = iso === todayISO
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPick(iso)}
              style={{
                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto', width: 36, borderRadius: '50%', cursor: 'pointer',
                border: !isSelected && isToday ? '1.5px solid #C8DEC0' : '1.5px solid transparent',
                background: isSelected ? '#2D5A3D' : 'transparent',
                color: isSelected ? '#fff' : '#1A1209',
                fontSize: 15, fontWeight: isSelected || isToday ? 700 : 400,
                fontFamily: 'var(--font-body), sans-serif',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {Number(iso.slice(8, 10))}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function NavArrow({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={dir === 'prev' ? 'Mois précédent' : 'Mois suivant'}
      style={{ border: 'none', background: 'none', padding: 6, cursor: 'pointer', color: '#1A1209', display: 'flex' }}>
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points={dir === 'prev' ? '15 5 8 12 15 19' : '9 5 16 12 9 19'} />
      </svg>
    </button>
  )
}

/* ── Bouton cycle on tap avec chevrons haut/bas + bounce ───────────────
   `flex-auto` (flex: 1 1 auto) + minWidth : chaque bouton part de sa
   largeur naturelle avec un plancher à 140px. Combiné au conteneur en
   fit-content centré, la rangée s'élargit symétriquement quand un libellé
   est long ("Santé & bien-être") au lieu de déborder vers la droite : elle
   gagne autant de place à gauche qu'à droite et reste centrée.
   `flex-1` (basis 0) donnait au contraire deux moitiés strictes, ce qui
   forçait le libellé long à tronquer. */
function CycleBtn({
  kicker, label, onClick,
}: { kicker: string; label: string; onClick: () => void }) {
  const [pressed, setPressed] = useState(false)

  const handleClick = () => {
    setPressed(true)
    onClick()
    // Reset le bounce après l'animation
    window.setTimeout(() => setPressed(false), 180)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex flex-auto items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left"
      style={{
        minWidth: 140,
        background: '#E8F2EB',
        border: '1px solid #C8DEC0',
        boxShadow: pressed
          ? '0 1px 2px rgba(45,90,61,0.06)'
          : '0 2px 8px rgba(45,90,61,0.10)',
        transform: pressed ? 'scale(0.96)' : 'scale(1)',
        // Bounce élastique : overshoot léger au retour à 1 (cubic-bezier 0.34, 1.56, 0.64, 1)
        transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div className="min-w-0 flex-1">
        <div
          className="text-[10px] uppercase"
          style={{ letterSpacing: '0.1em', color: '#5B8A4A', fontWeight: 500 }}
        >
          {kicker}
        </div>
        <div
          className="mt-[2px] truncate font-serif text-[15px]"
          style={{ letterSpacing: '-0.005em', lineHeight: 1.15, color: '#1A1209' }}
        >
          {label}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1" style={{ color: '#5B8A4A' }}>
        {/* Chevron haut (circonflexe haut) */}
        <svg width={13} height={7} viewBox="0 0 24 14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="5 11 12 4 19 11" />
        </svg>
        {/* Chevron bas (circonflexe bas) */}
        <svg width={13} height={7} viewBox="0 0 24 14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="5 3 12 10 19 3" />
        </svg>
      </div>
    </button>
  )
}
