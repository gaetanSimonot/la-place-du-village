'use client'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'

const COMING_SOON = 'Le mur de publications arrivera bientôt'

/* ── Icons inline (line stroke 1.8) ──────────────────────────────────── */
const IcImage = (s: number) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21,15 16,10 5,21" />
  </svg>
)
const IcEvent = (s: number) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)
const IcSmile = (s: number) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
)
const IcFeather = (s: number) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
    <line x1="16" y1="8" x2="2" y2="22" />
    <line x1="17.5" y1="15" x2="9" y2="15" />
  </svg>
)

export default function MurTabPlaceholder() {
  const { user, profile } = useAuth()
  const initial = (profile?.display_name ?? user?.email ?? '·').trim().charAt(0).toUpperCase() || '·'

  function notReady() {
    toast(COMING_SOON, { description: 'Publications, likes et commentaires arrivent dans la prochaine PR.' })
  }

  return (
    <div className="px-4 pt-[14px]">
      {/* Composer (fidèle au mockup, non fonctionnel) */}
      <div
        className="rounded-[14px] border bg-white p-3"
        style={{ borderColor: '#F0EAE0', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}
      >
        <div className="flex items-center gap-[10px]">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="h-[34px] w-[34px] shrink-0 rounded-full object-cover"
            />
          ) : (
            <div
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-primary text-[15px] font-extrabold text-white"
              style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}
            >
              {initial}
            </div>
          )}
          <button
            type="button"
            onClick={notReady}
            className="flex-1 rounded-full bg-cremeDeep px-3.5 py-2.5 text-left text-[13px] text-texte-doux"
          >
            Quoi de neuf à Ganges&nbsp;?
          </button>
        </div>
        <div
          className="mt-2.5 flex justify-around pt-2.5"
          style={{ borderTop: '1px solid #F0EAE0' }}
        >
          <Chip color="#5B8A4A" onClick={notReady}>
            {IcImage(15)} Photo
          </Chip>
          <Chip color="#C84B2F" onClick={notReady}>
            {IcEvent(15)} Événement
          </Chip>
          <Chip color="#E8622A" onClick={notReady}>
            {IcSmile(15)} Humeur
          </Chip>
        </div>
      </div>

      {/* État vide propre */}
      <div className="mt-6 flex flex-col items-center px-6 py-8 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary-light text-primary">
          {IcFeather(28)}
        </div>
        <div className="text-[14px] font-extrabold text-texte">Aucune publication pour le moment</div>
        <p className="m-0 mt-1.5 max-w-[280px] text-[12.5px] leading-[1.5] text-texte-doux">
          Le mur du village ouvrira bientôt. Tu pourras y partager photos, événements et coups de cœur avec tes amis.
        </p>
      </div>
    </div>
  )
}

function Chip({
  color, onClick, children,
}: {
  color: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 bg-transparent px-2 py-1 text-[12px] font-bold"
      style={{ color }}
    >
      {children}
    </button>
  )
}
