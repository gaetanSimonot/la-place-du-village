'use client'
import { useState } from 'react'
import { toast } from 'sonner'

export interface PostData {
  id:          string
  user_id:     string
  texte:       string
  visibility:  'public' | 'amis' | 'prive'
  created_at:  string
}

interface Props {
  post:           PostData
  authorName:     string
  authorAvatar:   string | null
  isOwn:          boolean
  likeCount:      number
  commentCount:   number
  userHasLiked:   boolean
  onToggleLike:   () => void
  onDelete:       () => Promise<void> | void
  onComment:      () => void
}

export default function PostCard({
  post, authorName, authorAvatar, isOwn,
  likeCount, commentCount, userHasLiked,
  onToggleLike, onDelete, onComment,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const initial = (authorName || '·').trim().charAt(0).toUpperCase() || '·'

  async function handleDelete() {
    setMenuOpen(false)
    if (!confirm('Supprimer cette publication ?')) return
    await onDelete()
  }

  function handleSignal() {
    setMenuOpen(false)
    toast('Signalement noté', { description: 'Notre équipe va revoir cette publication.' })
  }

  async function handleShare() {
    const url = typeof window !== 'undefined'
      ? `${window.location.origin}/profil/${post.user_id}`
      : ''
    const text = post.texte.length > 120 ? `${post.texte.slice(0, 120)}…` : post.texte
    const data: ShareData = { title: 'La Place du Village', text, url }
    try {
      if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.(data)) {
        await navigator.share(data)
        return
      }
    } catch (e) {
      // utilisateur a annulé ou navigator.share a échoué — on tombe sur le fallback
      if (e instanceof Error && e.name === 'AbortError') return
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        toast.success('Lien copié dans le presse-papier')
      }
    } catch {
      toast.error('Impossible de partager')
    }
  }

  return (
    <article
      className="overflow-hidden rounded-[16px] border bg-white"
      style={{ borderColor: '#F0EAE0', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}
    >
      {/* Header */}
      <div className="flex items-start gap-2.5 px-3.5 pt-3">
        {authorAvatar ? (
          <img src={authorAvatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-[14px] text-white">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
            {authorName}
          </div>
          <div className="mt-[1px] flex items-center gap-1 text-[11px] text-texte-doux">
            {formatDate(post.created_at)}
            <span aria-hidden>·</span>
            <VisibilityIcon visibility={post.visibility} />
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Options"
            className="-mt-1 -mr-1 flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-texte-doux"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1.5" /><circle cx="5" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-[100]" onClick={() => setMenuOpen(false)} aria-hidden />
              <div
                className="absolute right-0 top-8 z-[110] w-[160px] overflow-hidden rounded-[12px] border bg-white"
                style={{ borderColor: '#E8E0D4', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
              >
                {isOwn ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex w-full items-center gap-2 bg-transparent px-3 py-2.5 text-left text-[12.5px] font-bold"
                    style={{ color: '#B53A22' }}
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
                    </svg>
                    Supprimer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSignal}
                    className="flex w-full items-center gap-2 bg-transparent px-3 py-2.5 text-left text-[12.5px] font-bold text-texte"
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <line x1="4" y1="21" x2="4" y2="3" />
                      <path d="M4 3h13l-2 7 2 7H4" />
                    </svg>
                    Signaler
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Texte */}
      <p
        className="m-0 whitespace-pre-wrap px-3.5 pb-3 pt-2 text-[14px] leading-[1.55] text-texte"
        style={{ wordBreak: 'break-word' }}
      >
        {post.texte}
      </p>

      {/* Footer compteurs + actions */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 text-[11px] text-texte-doux" style={{ borderTop: '1px solid #F0EAE0' }}>
        <span>{likeCount > 0 && <>{likeCount} j&apos;aime</>}</span>
        {commentCount > 0 && (
          <button
            type="button"
            onClick={onComment}
            className="bg-transparent text-[11px] text-texte-doux"
          >
            {commentCount} commentaire{commentCount > 1 ? 's' : ''}
          </button>
        )}
      </div>
      <div className="grid grid-cols-3" style={{ borderTop: '1px solid #F0EAE0' }}>
        <ActionBtn
          onClick={onToggleLike}
          active={userHasLiked}
          activeColor="#C84B2F"
          label="J'aime"
          icon={
            <svg width={16} height={16} viewBox="0 0 24 24" fill={userHasLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          }
        />
        <ActionBtn
          onClick={onComment}
          active={false}
          label="Commenter"
          icon={
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          }
        />
        <ActionBtn
          onClick={handleShare}
          active={false}
          label="Partager"
          icon={
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          }
        />
      </div>
    </article>
  )
}

function ActionBtn({
  onClick, active, activeColor, label, icon,
}: {
  onClick: () => void
  active:  boolean
  activeColor?: string
  label:   string
  icon:    React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 bg-transparent py-2.5 text-[12.5px]"
      style={{
        color:      active && activeColor ? activeColor : '#7A6A5A',
        fontWeight: active ? 800 : 700,
      }}
    >
      {icon} {label}
    </button>
  )
}

function VisibilityIcon({ visibility }: { visibility: 'public' | 'amis' | 'prive' }) {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-label={visibility}>
      {visibility === 'public' && <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>}
      {visibility === 'amis'   && <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></>}
      {visibility === 'prive'  && <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>}
    </svg>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = diffMs / 60000
    if (diffMins < 1) return 'à l\'instant'
    if (diffMins < 60) return `il y a ${Math.floor(diffMins)} min`
    const diffH = diffMins / 60
    if (diffH < 24) return `il y a ${Math.floor(diffH)} h`
    const diffD = diffH / 24
    if (diffD < 7) return `il y a ${Math.floor(diffD)} j`
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}
