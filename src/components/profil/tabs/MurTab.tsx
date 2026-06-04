'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import PostComposer from '../PostComposer'
import PostCard, { type PostData } from '../PostCard'
import PostCommentsDrawer from '../PostCommentsDrawer'

interface Props {
  /** L'user dont on affiche le mur (en V1 = toujours l'user connecté = soi). */
  profileUserId: string
  authorName:    string
  authorAvatar:  string | null
}

interface PostWithLikes extends PostData {
  likeCount:    number
  commentCount: number
  userHasLiked: boolean
}

export default function MurTab({ profileUserId, authorName, authorAvatar }: Props) {
  const { user, loading: authLoading } = useAuth()
  const myId = user?.id ?? null
  const isOwnWall = myId === profileUserId

  const [composerOpen, setComposerOpen] = useState(false)
  const [commentsForPost, setCommentsForPost] = useState<PostWithLikes | null>(null)

  // ──────────────────────────────────────────────────────────────────────
  // État local + Realtime — MÊME pattern que le chat (fiable & instantané).
  //
  // La liste vit dans un useState qu'on met à jour DIRECTEMENT :
  //   - publier   → on ajoute le post en tête (instantané)
  //   - supprimer → on retire le post (instantané)
  //   - Realtime  → recharge quand ça change (autre appareil, like, comment)
  //
  // On ne charge qu'avec une session résolue (authReady) → évite la course
  // "load avant token prêt" qui vidait le mur via RLS. Plus de SWR/mutate :
  // la source de vérité est l'état local → re-render garanti (fini le bug
  // "il faut recharger pour voir le post / la suppression").
  // ──────────────────────────────────────────────────────────────────────
  const [posts, setPosts]     = useState<PostWithLikes[]>([])
  const [loading, setLoading] = useState(true)

  const authReady = !authLoading && !!myId

  const loadPosts = useCallback(async () => {
    if (!authReady) return
    try {
      // Lecture DIRECTE de la table (comme le chat) — aucune route serveur,
      // donc aucun cache possible. La RLS posts_select filtre la visibilité
      // (public / soi / amis). Pour son propre mur : tous ses posts.
      const { data: rows, error } = await supabase
        .from('posts')
        .select('id, user_id, texte, visibility, embed_kind, embed_ref_id, created_at')
        .eq('user_id', profileUserId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error

      const base = (rows ?? []) as PostData[]
      if (base.length === 0) { setPosts([]); return }

      // Agrège likes + commentaires pour ces posts (2 requêtes directes)
      const ids = base.map(p => p.id)
      const [likesRes, commentsRes] = await Promise.all([
        supabase.from('post_likes').select('post_id, user_id').in('post_id', ids),
        supabase.from('post_comments').select('post_id').in('post_id', ids),
      ])
      const likeCount = new Map<string, number>()
      const commentCount = new Map<string, number>()
      const liked = new Set<string>()
      for (const l of (likesRes.data ?? []) as { post_id: string; user_id: string }[]) {
        likeCount.set(l.post_id, (likeCount.get(l.post_id) ?? 0) + 1)
        if (l.user_id === myId) liked.add(l.post_id)
      }
      for (const c of (commentsRes.data ?? []) as { post_id: string }[]) {
        commentCount.set(c.post_id, (commentCount.get(c.post_id) ?? 0) + 1)
      }

      setPosts(base.map(p => ({
        ...p,
        likeCount:    likeCount.get(p.id) ?? 0,
        commentCount: commentCount.get(p.id) ?? 0,
        userHasLiked: liked.has(p.id),
      })))
    } catch {
      toast.error('Impossible de charger les publications')
    } finally {
      setLoading(false)
    }
  }, [authReady, profileUserId, myId])

  // Chargement initial dès que l'auth est prête
  useEffect(() => { loadPosts() }, [loadPosts])

  // Realtime : recharge quand post/like/comment change pour ce mur.
  useEffect(() => {
    if (!authReady) return
    const ch = supabase
      .channel(`mur-${profileUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts',         filter: `user_id=eq.${profileUserId}` }, () => loadPosts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes'    }, () => loadPosts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, () => loadPosts())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profileUserId, authReady, loadPosts])

  async function handleToggleLike(post: PostWithLikes) {
    if (!myId) {
      toast.error('Connecte-toi pour aimer')
      return
    }
    // Optimistic update
    setPosts(prev => prev.map(p =>
      p.id === post.id
        ? { ...p, userHasLiked: !p.userHasLiked, likeCount: p.likeCount + (p.userHasLiked ? -1 : 1) }
        : p,
    ))

    if (post.userHasLiked) {
      await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', myId)
    } else {
      await supabase.from('post_likes').insert({ post_id: post.id, user_id: myId })
    }
  }

  async function handleDelete(post: PostWithLikes) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { toast.error('Session expirée'); return }
    const res = await fetch(`/api/posts/${post.id}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error || 'Erreur suppression')
      return
    }
    setPosts(prev => prev.filter(p => p.id !== post.id))
    toast.success('Publication supprimée')
  }

  return (
    <div className="px-4 pt-[14px]">
      {/* Composer launcher (own wall seulement) */}
      {isOwnWall && (
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="flex w-full items-center gap-[10px] rounded-[14px] border bg-white p-3 text-left"
          style={{ borderColor: '#F0EAE0', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}
        >
          {authorAvatar ? (
            <img src={authorAvatar} alt="" className="h-[34px] w-[34px] shrink-0 rounded-full object-cover" />
          ) : (
            <div
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-primary text-[15px] font-extrabold text-white"
              style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}
            >
              {(authorName || '·').trim().charAt(0).toUpperCase() || '·'}
            </div>
          )}
          <span className="flex-1 rounded-full bg-cremeDeep px-3.5 py-2.5 text-[13px] text-texte-doux">
            Quoi de neuf à Ganges&nbsp;?
          </span>
        </button>
      )}

      {/* Liste posts */}
      <div className="mt-3 flex flex-col gap-3">
        {loading && posts.length === 0 && <SkeletonPosts />}
        {!loading && posts.length === 0 && (
          <EmptyState isOwn={isOwnWall} onComposer={() => setComposerOpen(true)} />
        )}
        {posts.map(p => (
          <PostCard
            key={p.id}
            post={p}
            authorName={authorName}
            authorAvatar={authorAvatar}
            isOwn={isOwnWall}
            likeCount={p.likeCount}
            commentCount={p.commentCount}
            userHasLiked={p.userHasLiked}
            onToggleLike={() => handleToggleLike(p)}
            onDelete={() => handleDelete(p)}
            onComment={() => setCommentsForPost(p)}
          />
        ))}
      </div>

      {composerOpen && isOwnWall && (
        <PostComposer
          authorName={authorName}
          authorAvatar={authorAvatar}
          onClose={() => setComposerOpen(false)}
          onPosted={newPost => setPosts(prev => [
            { ...newPost, likeCount: 0, commentCount: 0, userHasLiked: false },
            ...prev,
          ])}
        />
      )}

      {commentsForPost && (
        <PostCommentsDrawer
          postId={commentsForPost.id}
          postAuthorId={commentsForPost.user_id}
          onClose={() => setCommentsForPost(null)}
          onCountChange={count => {
            setPosts(prev => prev.map(p =>
              p.id === commentsForPost.id ? { ...p, commentCount: count } : p,
            ))
          }}
        />
      )}
    </div>
  )
}

/* ── Empty state ─────────────────────────────────────────────────────── */
function EmptyState({ isOwn, onComposer }: { isOwn: boolean; onComposer: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary-light text-primary">
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
          <line x1="16" y1="8" x2="2" y2="22" />
          <line x1="17.5" y1="15" x2="9" y2="15" />
        </svg>
      </div>
      <div className="text-[14px] font-extrabold text-texte">
        {isOwn ? 'Ton mur est vide' : 'Aucune publication'}
      </div>
      <p className="m-0 mt-1.5 max-w-[280px] text-[12.5px] leading-[1.5] text-texte-doux">
        {isOwn
          ? 'Partage une photo, un coup de cœur, un événement — tes amis et le village pourront réagir.'
          : 'Cette personne n\'a pas encore publié sur son mur.'}
      </p>
      {isOwn && (
        <button
          type="button"
          onClick={onComposer}
          className="mt-4 rounded-full bg-primary px-5 py-2.5 text-[13px] font-extrabold text-white"
        >
          Publier maintenant
        </button>
      )}
    </div>
  )
}

/* ── Skeleton ───────────────────────────────────────────────────────── */
function SkeletonPosts() {
  return (
    <>
      {[1, 2].map(i => (
        <div
          key={i}
          className="rounded-[16px] border bg-white p-3"
          style={{ borderColor: '#F0EAE0' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 animate-pulse rounded-full bg-cremeDeep" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-1/3 animate-pulse rounded bg-cremeDeep" />
              <div className="h-2.5 w-1/4 animate-pulse rounded bg-cremeDeep" />
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="h-3 w-full animate-pulse rounded bg-cremeDeep" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-cremeDeep" />
          </div>
        </div>
      ))}
    </>
  )
}
