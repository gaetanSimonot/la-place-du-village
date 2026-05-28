'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAnnonceFavorites } from '@/hooks/useAnnonceFavorites'
import { shareLink } from '@/lib/share'
import {
  getPrixAffiche,
  getNextDropDate,
  formatCountdown,
  getPrixTimeline,
  type Annonce,
} from '@/lib/annonces'

interface Props {
  annonce: Annonce
}

/* Type palette V3 : couleurs neutres mais distinguables.
   Source : handoff/mockups/annonces-mockup.jsx. */
const TYPE_PALETTE: Record<Annonce['type'], { label: string; bg: string; border: string; text: string }> = {
  vente:            { label: 'Vente',    bg: '#FFFFFF', border: '#E8E0D4', text: '#1A1209' },
  don:              { label: 'Don',      bg: '#E8F2EB', border: '#C5DCC9', text: '#2D5A3D' },
  troc:             { label: 'Troc',     bg: '#E8EEF7', border: '#C8D5E8', text: '#3A5D8C' },
  enchere_inversee: { label: 'Enchère',  bg: '#FFF0E5', border: '#F5C8A8', text: '#C84B2F' },
}

export default function AnnonceCard({ annonce }: Props) {
  const p = TYPE_PALETTE[annonce.type]
  const isEnchere = annonce.type === 'enchere_inversee'
  const isDon     = annonce.type === 'don'
  const isTroc    = annonce.type === 'troc'
  const photo = annonce.photos[0]
  const { isFav, toggle } = useAnnonceFavorites()
  const favored = isFav(annonce.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prixVal = (annonce as any).prix as number | null | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prixInitial = (annonce as any).prix_initial as number | null | undefined
  const showOld = !isEnchere && !isDon && !isTroc &&
    typeof prixInitial === 'number' && typeof prixVal === 'number' && prixInitial > prixVal

  return (
    <Link
      href={`/annonces/${annonce.id}`}
      className="flex h-full flex-col overflow-hidden rounded-card border bg-white text-inherit no-underline shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
      style={{ borderColor: '#F0EAE0' }}
    >
      {/* Image + chips */}
      <div className="relative h-[130px] bg-[#F0EBE3]">
        {photo ? (
          <img src={photo} alt={annonce.titre} className="block h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-texte-tres-doux">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="9" cy="9" r="2"/>
              <path d="m21 15-5-5L5 21"/>
            </svg>
          </div>
        )}
        {/* TypeChip */}
        <div
          className="absolute left-2 top-2 inline-flex items-center gap-[3px] rounded-[6px] border px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em]"
          style={{ backgroundColor: p.bg, borderColor: p.border, color: p.text }}
        >
          {p.label}{isEnchere && ' ↘'}
        </div>
        {/* Actions overlay : Favori (cœur) + Partager (3 cercles).
            Même style que les boutons des EventListCard dans BottomSheet :
            carrés 26x26 fond beige #EDE8DF, icône stroke 2. */}
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <button
            type="button"
            aria-label={favored ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            onClick={ev => { ev.stopPropagation(); ev.preventDefault(); toggle(annonce.id) }}
            style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#EDE8DF', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill={favored ? '#EC407A' : 'none'} stroke={favored ? '#EC407A' : '#6B5E4E'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#EDE8DF', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B5E4E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>
        </div>
        {annonce.sponsored && (
          <span className="absolute bottom-2 left-2 rounded-full bg-[#E8622A] px-2 py-[3px] text-[9px] font-extrabold uppercase tracking-[0.05em] text-white">
            En vedette
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1 px-[11px] pb-3 pt-2.5">
        <h3
          className="m-0 line-clamp-2 text-[13px] font-bold leading-[1.25] text-texte"
          style={{ letterSpacing: '-0.01em', minHeight: 33 }}
        >
          {annonce.titre}
        </h3>

        {annonce.ville && (
          <div className="flex items-center gap-[3px] truncate text-[11px] text-texte-doux">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/>
              <circle cx="12" cy="10" r="2.5"/>
            </svg>
            {annonce.ville}
          </div>
        )}

        {/* Prix row — divider dashed top */}
        <div
          className="mt-1 flex flex-wrap items-baseline gap-1.5 pt-2"
          style={{ borderTop: '1px dashed #E8E0D4' }}
        >
          {isDon ? (
            <span className="text-[14px] font-extrabold text-primary">Gratuit</span>
          ) : isTroc ? (
            <span className="inline-flex items-center gap-1 text-[12px] font-bold text-[#3A5D8C]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9"/>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
              Échange
            </span>
          ) : isEnchere ? (
            <>
              <span className="text-[15px] font-extrabold text-accent">{getPrixAffiche(annonce)}</span>
              {annonce.statut === 'active' && <EnchereCountdown annonce={annonce} />}
            </>
          ) : (
            <>
              <span className="text-[15px] font-extrabold text-texte">{getPrixAffiche(annonce)}</span>
              {showOld && (
                <span className="text-[11px] text-texte-tres-doux line-through">{prixInitial} €</span>
              )}
            </>
          )}
        </div>

        {/* Mini timeline pour enchères actives */}
        {isEnchere && annonce.statut === 'active' && (
          <div className="mt-2">
            <PrixMiniTimeline annonce={annonce} />
          </div>
        )}
      </div>
    </Link>
  )
}

function EnchereCountdown({ annonce }: { annonce: Annonce }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const next = getNextDropDate(now)
  const ms = next.getTime() - now.getTime()
  void annonce
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-accent">
      ↘ {formatCountdown(ms)}
    </span>
  )
}

function PrixMiniTimeline({ annonce }: { annonce: Annonce }) {
  const points = getPrixTimeline(annonce, 6)
  if (points.length < 2) return null

  const W = 280
  const H = 30
  const maxP = Math.max(...points.map(p => p.prix))
  const minP = Math.min(...points.map(p => p.prix))
  const range = maxP - minP || 1

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W
    const y = H - ((p.prix - minP) / range) * (H - 4) - 2
    return [x, y] as const
  })

  const pathD = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
      <path d={`${pathD} L${W},${H} L0,${H} Z`} fill="#C84B2F" fillOpacity="0.10" />
      <path d={pathD} stroke="#C84B2F" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" fill="#fff" stroke="#C84B2F" strokeWidth="1.3" />
      ))}
    </svg>
  )
}
