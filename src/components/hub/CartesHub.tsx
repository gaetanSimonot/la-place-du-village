'use client'
import type { Evenement } from '@/lib/types'
import { imageEvenement } from '@/lib/imageEvenement'

/**
 * Les cartes d'événement de l'accueil, et les deux icônes qui vont avec.
 *
 * Elles vivaient dans HubView.tsx, et la page Le village les y importait — en
 * tirant donc les 56 ko de l'ancien écran d'accueil avec elles, sur l'écran
 * d'atterrissage de la version bureau, alors que HubView lui-même n'est plus
 * atteignable que par une URL en `?mode=hub`.
 *
 * Elles sont ici pour que HubView puisse se charger à la demande sans que Le
 * village en dépende. Mêmes composants, même rendu, rien d'autre n'a bougé.
 */

/* ─── Libellés de date, partagés par les cartes ──────────────────────── */

function dateLabel(iso: string | null): string {
  if (!iso) return ''
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(iso); d.setHours(0,0,0,0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0)  return 'Aujourd\'hui'
  if (diff === 1)  return 'Demain'
  if (diff === -1) return 'Hier'
  if (diff > 1 && diff < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' })
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/**
 * Label compact pour vignettes d'événements. Cas :
 *  - Event mono-jour avec heure → "HH:MM"
 *  - Event multi-jours (date_fin > date_debut) → "Jusqu'au DD mois" (les expos
 *    en cours auraient sinon une date_debut passée trompeuse).
 *  - Sinon → dateLabel(date_debut)
 */
export function eventWhenLabel(
  date_debut: string | null,
  date_fin: string | null,
  heure: string | null,
): string {
  const multiJour = !!date_debut && !!date_fin && date_fin !== date_debut
  if (multiJour && date_fin) {
    const fin = new Date(date_fin)
    return `Jusqu'au ${fin.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
  }
  if (heure) return heure.slice(0, 5)
  return date_debut ? dateLabel(date_debut) : '—'
}

function categorieKicker(c: string | null | undefined): string {
  if (!c) return 'ÉVÉNEMENT'
  return c.toUpperCase()
}

export const IconPin = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/>
    <circle cx="12" cy="10" r="2.5"/>
  </svg>
)

export const IconArrow = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="13 6 19 12 13 18"/>
  </svg>
)

/* ─── SectionHeader V3 ───────────────────────────────────────────────── */

export function SectionHeaderV3({
  title, kicker, subtitle, action, onAction,
}: {
  title: string
  kicker?: string
  subtitle?: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="px-4 pb-3 pt-6">
      <div className="flex items-baseline justify-between gap-2.5">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h3
            className="m-0 truncate font-serif text-[22px] font-normal leading-[1.1] text-texte"
            style={{ letterSpacing: '-0.02em' }}
          >
            {title}
          </h3>
          {kicker && (
            <span className="shrink-0 text-[11px] font-bold text-texte-doux">{kicker}</span>
          )}
        </div>
        {action && (
          <button
            type="button"
            onClick={onAction}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap bg-transparent p-0 text-[12px] font-bold text-primary"
          >
            {action}
            <IconArrow size={11} />
          </button>
        )}
      </div>
      {subtitle && (
        <p className="mt-1 text-[12px] font-medium text-texte-doux">{subtitle}</p>
      )}
    </div>
  )
}

/* ─── Aujourd'hui — FeaturedEventCard ────────────────────────────────── */

export function FeaturedEventCard({ ev, onClick }: { ev: Evenement; onClick: () => void }) {
  const time = eventWhenLabel(ev.date_debut, ev.date_fin, ev.heure)
  const kicker = `${categorieKicker(ev.categorie)} · À LA UNE`
  const where = ev.lieux?.nom ?? ev.lieux?.commune ?? '—'
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ gridColumn: 'span 1', gridRow: 'span 2', borderColor: '#F0EAE0' }}
      className="flex cursor-pointer flex-col overflow-hidden rounded-[16px] border bg-white shadow-[0_6px_20px_rgba(44,28,16,0.10)]"
    >
      {/* Affiche : remplit toute la hauteur dispo de la tuile (2 rangées) */}
      <div className="relative min-h-0 flex-1 bg-bord/40">
        {imageEvenement(ev)
          ? <img src={imageEvenement(ev)!} alt="" className="h-full w-full object-cover" />
          : <div className="h-full w-full bg-gradient-to-br from-[#A85138] to-[#6E2E1E]" />
        }
        <div className="absolute left-2 top-2 rounded-[5px] bg-accent px-2 py-[3px] text-[10px] font-extrabold tracking-[0.08em] text-white">
          {time}
        </div>
      </div>
      {/* Bloc texte compact en bas (pas de justify-between → plus de blanc) */}
      <div className="shrink-0 px-3 pb-3 pt-2.5">
        <div className="text-[9px] font-extrabold tracking-[0.12em] text-accent">{kicker}</div>
        <div
          className="mt-0.5 font-title text-[16px] leading-[1.15] text-texte"
          style={{ letterSpacing: '-0.01em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {ev.titre}
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-texte-doux">
          <IconPin size={11} />
          <span className="truncate">{where}</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Aujourd'hui — MiniEventCard ────────────────────────────────────── */

export function MiniEventCard({ ev, onClick }: { ev: Evenement; onClick: () => void }) {
  const time = eventWhenLabel(ev.date_debut, ev.date_fin, ev.heure)
  const kicker = categorieKicker(ev.categorie)
  const where = ev.lieux?.nom ?? ev.lieux?.commune ?? '—'
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ borderColor: '#F0EAE0' }}
      className="flex min-h-0 cursor-pointer flex-col overflow-hidden rounded-[14px] border bg-white shadow-[0_4px_14px_rgba(44,28,16,0.08)]"
    >
      {/* Image en haut (pleine largeur, croppée) */}
      <div className="relative min-h-0 flex-1 bg-bord/40">
        {imageEvenement(ev)
          ? <img src={imageEvenement(ev)!} alt="" className="h-full w-full object-cover" />
          : <div className="h-full w-full bg-gradient-to-br from-[#A8C28E] to-[#5B8A4A]" />
        }
        <div className="absolute left-1.5 top-1.5 rounded bg-white/95 px-1.5 py-[2px] text-[9px] font-extrabold text-texte">
          {time}
        </div>
      </div>
      {/* Infos en bas (hauteur fixe → l'image prend le reste) */}
      <div className="shrink-0 px-2.5 pb-1.5 pt-1">
        <div className="truncate text-[8px] font-extrabold tracking-[0.12em] text-primary">{kicker}</div>
        <div
          className="truncate font-title text-[12px] leading-[1.15] text-texte"
          style={{ letterSpacing: '-0.01em' }}
        >
          {ev.titre}
        </div>
        <div className="flex items-center gap-1 truncate text-[10px] text-texte-doux">
          <IconPin size={9} />
          <span className="truncate">{where}</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Aujourd'hui — placeholder "+N" si bento incomplet ──────────────── */

export function MoreEventsCard({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ borderColor: '#F0EAE0' }}
      className="flex cursor-pointer items-center justify-center overflow-hidden rounded-[14px] border-2 border-dashed bg-cremeDeep text-center"
    >
      <div className="flex flex-col items-center gap-1 px-3 py-4">
        <span className="font-serif text-[20px] leading-none text-primary">+{count}</span>
        <span className="text-[10px] font-bold tracking-[0.06em] text-texte-doux">
          ÉVÉNEMENT{count > 1 ? 'S' : ''}
        </span>
        <span className="text-[10px] font-bold text-primary">Voir tout →</span>
      </div>
    </button>
  )
}
