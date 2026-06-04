'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ClientPortal from '@/components/ClientPortal'
import { PostEmbedRender } from '@/components/profil/PostCard'

interface PostRow {
  id: string; user_id: string; texte: string
  embed_kind: string | null; embed_ref_id: string | null; created_at: string
}

interface Props {
  postId:  string
  onClose: () => void
}

/**
 * Pop-up affichant un post (depuis une notification de broadcast admin).
 * Lecture directe Supabase (pas de route → pas de cache). Bouton vers le mur
 * de l'auteur en bas.
 */
export default function PostNotifModal({ postId, onClose }: Props) {
  const router = useRouter()
  const [post, setPost] = useState<PostRow | null>(null)
  const [author, setAuthor] = useState<{ name: string | null; avatar: string | null }>({ name: null, avatar: null })
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('posts')
        .select('id, user_id, texte, embed_kind, embed_ref_id, created_at')
        .eq('id', postId)
        .maybeSingle()
      if (cancelled) return
      if (!data) { setNotFound(true); setLoading(false); return }
      const p = data as PostRow
      setPost(p)
      const { data: prof } = await supabase
        .from('profiles').select('display_name, avatar_url').eq('user_id', p.user_id).maybeSingle()
      if (cancelled) return
      const pr = prof as { display_name: string | null; avatar_url: string | null } | null
      setAuthor({ name: pr?.display_name ?? null, avatar: pr?.avatar_url ?? null })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [postId])

  const goToWall = () => {
    if (post) router.push(`/profil/${post.user_id}`)
    onClose()
  }

  const initial = (author.name ?? '·').trim().charAt(0).toUpperCase() || '·'

  return (
    <ClientPortal>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[3600] flex items-center justify-center bg-black/55 px-4 backdrop-blur-[3px] font-inter"
        role="dialog"
        aria-modal="true"
      >
        <div
          onClick={e => e.stopPropagation()}
          className="flex w-full max-w-[440px] flex-col overflow-hidden rounded-3xl bg-white"
          style={{ maxHeight: '85dvh', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-4" style={{ borderBottom: '1px solid #F0EAE0' }}>
            <h2 className="m-0 font-serif text-[17px] text-texte" style={{ letterSpacing: '-0.005em' }}>Publication</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="flex h-9 w-9 items-center justify-center bg-transparent text-texte-doux"
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Contenu scrollable */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="h-7 w-7 animate-spin rounded-full border-4 border-bord border-t-primary" />
              </div>
            ) : notFound || !post ? (
              <p className="py-8 text-center text-[13px] text-texte-doux">Cette publication n&apos;existe plus.</p>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2.5">
                  {author.avatar ? (
                    <img src={author.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-[16px] text-white">{initial}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
                      {author.name ?? 'La Place du Village'}
                    </div>
                    <div className="text-[11px] text-texte-doux">{formatDate(post.created_at)}</div>
                  </div>
                </div>

                <p className="m-0 whitespace-pre-wrap text-[14px] leading-[1.55] text-texte" style={{ wordBreak: 'break-word' }}>
                  {post.texte}
                </p>

                {post.embed_kind && post.embed_ref_id && (
                  <div className="mt-3">
                    <PostEmbedRender kind={post.embed_kind} refId={post.embed_ref_id} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Bouton vers le mur */}
          {!loading && post && (
            <div className="shrink-0 px-4 pb-4 pt-2" style={{ borderTop: '1px solid #F0EAE0' }}>
              <button
                type="button"
                onClick={goToWall}
                className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-primary py-3 text-[14px] font-extrabold text-white"
              >
                Aller vers le mur
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </ClientPortal>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const diffMins = (Date.now() - d.getTime()) / 60000
    if (diffMins < 1) return 'à l\'instant'
    if (diffMins < 60) return `il y a ${Math.floor(diffMins)} min`
    if (diffMins < 60 * 24) return `il y a ${Math.floor(diffMins / 60)} h`
    const diffD = diffMins / (60 * 24)
    if (diffD < 7) return `il y a ${Math.floor(diffD)} j`
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}
