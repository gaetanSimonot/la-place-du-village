'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAnnonceFavorites } from '@/hooks/useAnnonceFavorites'
import { shareLink } from '@/lib/share'
import {
  getPrixAffiche,
  getNextDropDate,
  formatCountdown,
  type Annonce,
} from '@/lib/annonces'

interface Props {
  annonce: Annonce
}

/* Type palette V3 : couleurs neutres mais distinguables.
   Source : handoff/mockups/annonces-mockup.jsx. */
const TYPE_PALETTE: Record<Annonce['type'], { label: string; bg: string; border: string; text: string }> = {
  vente:            { label: 'Vente',    bg: '#FAF6EF', border: '#E8E0D4', text: '#8A6A3A' },
  don:              { label: 'Don',      bg: '#E8F2EB', border: '#C5DCC9', text: '#2D5A3D' },
  troc:             { label: 'Troc',     bg: '#EEDFC8', border: '#E0CBA8', text: '#9A6B2F' },
  service:          { label: 'Service',  bg: '#E6F2F0', border: '#C2DED9', text: '#2E7D74' },
  enchere_inversee: { label: 'Enchère',  bg: '#FFF0E5', border: '#F5C8A8', text: '#C84B2F' },
}

/* « il y a » compact : à l'instant / 5 min / 3 h / 2 j / 1 sem.
   Calcul client-side (heure locale) — cf. feedback_dates_timezone. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const min = Math.floor(diff / 60000)
  if (min < 1)  return "à l'instant"
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24)   return `${h} h`
  const j = Math.floor(h / 24)
  if (j < 7)    return `${j} j`
  return `${Math.floor(j / 7)} sem`
}

export default function AnnonceCard({ annonce }: Props) {
  const p = TYPE_PALETTE[annonce.type]
  const isEnchere = annonce.type === 'enchere_inversee'
  const isDon     = annonce.type === 'don'
  const isTroc    = annonce.type === 'troc'
  const isService = annonce.type === 'service'
  const photo = annonce.photos[0]
  const { isFav, toggle } = useAnnonceFavorites()
  const favored = isFav(annonce.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prixVal = (annonce as any).prix as number | null | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prixInitial = (annonce as any).prix_initial as number | null | undefined
  const showOld = !isEnchere && !isDon && !isTroc && !isService &&
    typeof prixInitial === 'number' && typeof prixVal === 'number' && prixInitial > prixVal

  return (
    <Link
      href={`/annonces/${annonce.id}`}
      className="relative flex gap-3 overflow-hidden rounded-card border bg-white p-2.5 text-inherit no-underline shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
      style={{ borderColor: '#F0EAE0' }}
    >
      {/* Vignette carrée à gauche */}
      <div className="relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-[12px] bg-[#F0EBE3]">
        {photo ? (
          <img src={photo} alt={annonce.titre} className="block h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-texte-tres-doux">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="9" cy="9" r="2"/>
              <path d="m21 15-5-5L5 21"/>
            </svg>
          </div>
        )}
        {annonce.sponsored && (
          <span className="absolute bottom-1 left-1 rounded-full bg-[#E8622A] px-1.5 py-[2px] text-[8px] font-extrabold uppercase tracking-[0.04em] text-white">
            Vedette
          </span>
        )}
      </div>

      {/* Corps à droite */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Ligne 1 : badge type + actions (cœur / partage) */}
        <div className="flex items-start justify-between gap-2">
          <span
            className="inline-flex items-center rounded-[6px] border px-2 py-[3px] text-[10px] font-extrabold uppercase tracking-[0.07em]"
            style={{ backgroundColor: p.bg, borderColor: p.border, color: p.text }}
          >
            {p.label}{isEnchere && ' ↘'}
          </span>
          <div className="-mr-0.5 -mt-0.5 flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={favored ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              onClick={ev => { ev.stopPropagation(); ev.preventDefault(); toggle(annonce.id) }}
              className="flex h-7 w-7 items-center justify-center rounded-full"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={favored ? '#EC407A' : 'none'} stroke={favored ? '#EC407A' : '#9A8A78'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
            <button
              type="button"
              aria-label="Partager cette annonce"
              onClick={ev => {
                ev.stopPropagation(); ev.preventDefault()
                shareLink({
                  title: annonce.titre,
                  text:  `${annonce.titre} — ${getPrixAffiche(annonce)}${annonce.ville ? ' • ' + annonce.ville : ''}`,
                  url:   `https://laplaceduvillage.app/annonces/${annonce.id}`,
                })
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9A8A78" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Titre */}
        <h3
          className="mt-1 line-clamp-1 text-[15px] font-bold leading-[1.2] text-texte"
          style={{ letterSpacing: '-0.01em' }}
        >
          {annonce.titre}
        </h3>

        {/* Description */}
        {annonce.description && (
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.35] text-texte-doux">
            {annonce.description}
          </p>
        )}

        {/* Ligne bas : ville (gauche) + prix & temps (droite) */}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
          <div className="flex min-w-0 items-center gap-[3px] text-[11px] text-texte-doux">
            {annonce.ville && (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/>
                  <circle cx="12" cy="10" r="2.5"/>
                </svg>
                <span className="truncate">{annonce.ville}</span>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isDon ? (
              <span className="text-[15px] font-extrabold text-primary">Gratuit</span>
            ) : isTroc ? (
              <span className="text-[13px] font-bold text-[#9A6B2F]">Échange</span>
            ) : isService ? (
              <span className="text-[13px] font-bold text-[#2E7D74]">Service</span>
            ) : isEnchere ? (
              <span className="inline-flex items-center gap-1">
                <span className="text-[15px] font-extrabold text-accent">{getPrixAffiche(annonce)}</span>
                {annonce.statut === 'active' && <EnchereCountdown />}
              </span>
            ) : (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-[15px] font-extrabold text-texte">{getPrixAffiche(annonce)}</span>
                {showOld && (
                  <span className="text-[11px] text-texte-tres-doux line-through">{prixInitial} €</span>
                )}
              </span>
            )}
            <span className="text-[11px] text-texte-tres-doux">{timeAgo(annonce.created_at)}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

function EnchereCountdown() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const next = getNextDropDate(now)
  const ms = next.getTime() - now.getTime()
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-accent">
      ↘ {formatCountdown(ms)}
    </span>
  )
}
