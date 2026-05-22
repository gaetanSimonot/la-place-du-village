'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  IcMail,
  IcSettings,
  IcMore,
  IcEdit,
  IcEye,
  IcChat,
  IcUserPlus,
  IcPin,
  IcChev,
  IcLeaf,
  IcStore,
} from './icons'

export type ViewMode = 'own' | 'public'

export interface FicheProMini {
  kind: 'producer' | 'etab'
  id: string
  nom: string
  photoUrl: string | null
  sub?: string
}

interface Props {
  viewMode: ViewMode
  displayName: string
  avatarUrl: string | null
  bannerUrl: string | null
  bio: string | null
  ville: string | null
  followersCount: number | null
  ficheProMinis: FicheProMini[]
  isVerified: boolean
  onModifyClick: () => void
  onToggleViewMode: () => void
  onContactClick?: () => void
  onSubscribeClick?: () => void
}

export default function ProfilHeader({
  viewMode,
  displayName,
  avatarUrl,
  bannerUrl,
  bio,
  ville,
  followersCount,
  ficheProMinis,
  isVerified,
  onModifyClick,
  onToggleViewMode,
  onContactClick,
  onSubscribeClick,
}: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const initial = displayName.trim().charAt(0).toUpperCase() || '·'

  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen])
  const metaLine = [ville, followersCount != null ? `${followersCount} abonné${followersCount === 1 ? '' : 's'}` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      {/* Bannière 140px gradient ou photo + pattern feuillage */}
      <div
        className="relative h-[140px] w-full overflow-hidden"
        style={{
          background: bannerUrl
            ? `url(${bannerUrl}) center/cover no-repeat`
            : 'linear-gradient(135deg, #5B8A4A 0%, #2D5A3D 60%, #1A4028 100%)',
        }}
      >
        {!bannerUrl && (
          <svg
            viewBox="0 0 390 140"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            style={{ opacity: 0.18 }}
            aria-hidden
          >
            <defs>
              <pattern id="profilLeafPattern" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M30 10 Q42 22 30 50 Q18 22 30 10z" fill="#fff" opacity="0.5" />
              </pattern>
            </defs>
            <rect width="390" height="140" fill="url(#profilLeafPattern)" />
          </svg>
        )}

        {/* Top bar : titre + boutons */}
        <div className="relative z-[2] flex items-center justify-between gap-3 px-4 pt-3.5">
          <div
            className="font-serif text-[18px] leading-none text-white"
            style={{ letterSpacing: '-0.01em', textShadow: '0 1px 4px rgba(0,0,0,0.2)' }}
          >
            {viewMode === 'public' ? 'Aperçu public' : 'Mon profil'}
          </div>
          <div className="flex gap-2">
            {viewMode === 'own' ? (
              <>
                <CircleBtn href="/messages" ariaLabel="Messagerie">
                  <IcMail size={18} />
                </CircleBtn>
                <CircleBtn href="/reglages" ariaLabel="Réglages">
                  <IcSettings size={18} />
                </CircleBtn>
              </>
            ) : (
              <CircleBtn onClick={onToggleViewMode} ariaLabel="Revenir en vue privée">
                <IcMore size={18} />
              </CircleBtn>
            )}
          </div>
        </div>
      </div>

      {/* Avatar 96px — pénètre la bannière de -48px, cliquable pour lightbox */}
      <div className="relative z-[3] -mt-[48px] px-4">
        <button
          type="button"
          onClick={() => avatarUrl && setLightboxOpen(true)}
          disabled={!avatarUrl}
          aria-label={avatarUrl ? 'Voir mon avatar en grand' : 'Avatar'}
          className="block shrink-0 rounded-full bg-transparent p-0 disabled:cursor-default"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-24 w-24 rounded-full object-cover"
              style={{ border: '4px solid #FDFAF5', boxShadow: '0 6px 18px rgba(44,28,16,0.22)' }}
            />
          ) : (
            <div
              className="flex h-24 w-24 items-center justify-center rounded-full bg-primary font-serif text-[40px] leading-none text-white"
              style={{
                letterSpacing: '-0.02em',
                border: '4px solid #FDFAF5',
                boxShadow: '0 6px 18px rgba(44,28,16,0.22)',
              }}
            >
              {initial}
            </div>
          )}
        </button>

        {/* Nom + meta — empilés sous l'avatar (margin-top pour respirer hors bannière) */}
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              className="m-0 truncate font-serif text-[23px] text-texte"
              style={{ letterSpacing: '-0.02em', lineHeight: 1.05 }}
            >
              {displayName}
            </h1>
            {isVerified && <VerifiedBadge />}
          </div>
          {metaLine && (
            <div className="mt-[4px] flex items-center gap-1 text-[12px] text-texte-doux">
              <IcPin size={12} /> {metaLine}
            </div>
          )}
        </div>

        {bio && (
          <p className="m-0 mt-[10px] text-[13px] leading-[1.5] text-texte">{bio}</p>
        )}

        {/* Boutons d'action */}
        <div className="mt-3 flex gap-2">
          {viewMode === 'own' ? (
            <>
              <button
                onClick={onToggleViewMode}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[11px] border border-bord bg-white px-3.5 py-2.5 text-[13px] font-bold text-texte"
              >
                <IcEye size={14} /> Aperçu public
              </button>
              <button
                onClick={onModifyClick}
                title="Modifier mon profil"
                aria-label="Modifier mon profil"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-primary text-white"
              >
                <IcEdit size={15} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onContactClick}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[11px] bg-primary px-3.5 py-2.5 text-[13px] font-extrabold text-white"
                style={{ letterSpacing: '-0.005em' }}
              >
                <IcChat size={14} /> Contacter
              </button>
              <button
                onClick={onSubscribeClick}
                className="inline-flex items-center gap-1.5 rounded-[11px] border border-bord bg-white px-3.5 py-2.5 text-[13px] font-bold text-texte"
              >
                <IcUserPlus size={14} /> S&apos;abonner
              </button>
            </>
          )}
        </div>
      </div>

      {/* Lightbox avatar */}
      {lightboxOpen && avatarUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Avatar en grand"
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-[4000] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.92)' }}
        >
          <img
            src={avatarUrl}
            alt=""
            onClick={e => e.stopPropagation()}
            className="max-h-[80vh] max-w-[90vw] rounded-2xl object-contain"
            style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
          />
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label="Fermer"
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full text-white"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {ficheProMinis.length > 0 && (
        <div className="flex flex-col gap-2 px-4 pt-[14px]">
          {ficheProMinis.map(f => (
            <Link
              key={`${f.kind}-${f.id}`}
              href={f.kind === 'producer' ? `/producteur/${f.id}` : `/etablissement/${f.id}`}
              className="flex w-full items-center gap-[10px] rounded-[12px] border bg-white px-3 py-2.5 text-inherit no-underline"
              style={{ borderColor: '#F0EAE0' }}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-primary-light text-primary"
                aria-hidden
              >
                {f.photoUrl ? (
                  <img src={f.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : f.kind === 'producer' ? (
                  <IcLeaf size={16} />
                ) : (
                  <IcStore size={16} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="text-[9px] font-extrabold uppercase text-primary"
                  style={{ letterSpacing: '0.1em' }}
                >
                  {f.kind === 'producer' ? 'Ma fiche producteur' : 'Mon établissement'}
                </div>
                <div
                  className="mt-px truncate text-[13px] font-bold text-texte"
                  style={{ letterSpacing: '-0.01em' }}
                >
                  {f.nom}
                </div>
                {f.sub && <div className="mt-px text-[10.5px] text-texte-doux">{f.sub}</div>}
              </div>
              <span className="text-texte-tres-doux">
                <IcChev size={14} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

function CircleBtn({
  children,
  badge,
  href,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode
  badge?: number | null
  href?: string
  onClick?: () => void
  ariaLabel: string
}) {
  const className =
    'relative flex h-9 w-9 items-center justify-center rounded-full border text-white'
  const style = {
    background: 'rgba(255,255,255,0.18)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderColor: 'rgba(255,255,255,0.22)',
  } as const
  const badgeNode =
    badge && badge > 0 ? (
      <span
        className="absolute -right-[3px] -top-[3px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-extrabold text-white"
        style={{ border: '2px solid #FDFAF5' }}
      >
        {badge > 99 ? '99+' : badge}
      </span>
    ) : null

  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel} className={className} style={style}>
        {children}
        {badgeNode}
      </Link>
    )
  }
  return (
    <button onClick={onClick} aria-label={ariaLabel} className={className} style={style}>
      {children}
      {badgeNode}
    </button>
  )
}

/* ── Badge "Vérifié" — petit pill vert avec check ─────────────────────── */
function VerifiedBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-[2px] text-[9.5px] font-extrabold"
      style={{ background: '#E8F2EB', color: '#2D5A3D', letterSpacing: '0.06em' }}
      title="Profil vérifié"
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      VÉRIFIÉ
    </span>
  )
}
