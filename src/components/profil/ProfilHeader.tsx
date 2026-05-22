'use client'
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
  IcSpark,
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
  moduleUtileActive: boolean
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
  moduleUtileActive,
  onModifyClick,
  onToggleViewMode,
  onContactClick,
  onSubscribeClick,
}: Props) {
  const initial = displayName.trim().charAt(0).toUpperCase() || '·'
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

      {/* Identité — avatar overlap -38px */}
      <div className="relative z-[3] -mt-[38px] px-4">
        <div className="flex items-end gap-[14px]">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-20 w-20 shrink-0 rounded-full object-cover"
              style={{ border: '4px solid #FDFAF5', boxShadow: '0 4px 14px rgba(44,28,16,0.18)' }}
            />
          ) : (
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-[34px] leading-none text-white"
              style={{
                letterSpacing: '-0.02em',
                border: '4px solid #FDFAF5',
                boxShadow: '0 4px 14px rgba(44,28,16,0.18)',
              }}
            >
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1
                className="m-0 truncate font-serif text-[21px] text-texte"
                style={{ letterSpacing: '-0.02em', lineHeight: 1.05 }}
              >
                {displayName}
              </h1>
              {moduleUtileActive && (
                <span
                  className="inline-flex shrink-0 items-center gap-[3px] rounded-full px-[7px] py-[2px] text-[9px] font-extrabold"
                  style={{ background: '#EAF3E6', color: '#5B8A4A', letterSpacing: '0.06em' }}
                >
                  <IcSpark size={8} /> UTILE
                </span>
              )}
            </div>
            {metaLine && (
              <div className="mt-[3px] flex items-center gap-1 text-[11.5px] text-texte-doux">
                <IcPin size={11} /> {metaLine}
              </div>
            )}
          </div>
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
