'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import PostComposer from '../PostComposer'
import PostCard, { type PostData } from '../PostCard'

interface Props {
  /** L'user dont on affiche le mur (en V1 = toujours l'user connecté = soi). */
  profileUserId: string
  authorName:    string
  authorAvatar:  string | null
}

interface PostWithLikes extends PostData {
  likeCount:    number
  userHasLiked: boolean
}

export default function MurTab({ profileUserId, authorName, authorAvatar }: Props) {
  const { user } = useAuth()
  const myId = user?.id ?? null
  const isOwnWall = myId === profileUserId

  const [posts, setPosts]       = useState<PostWithLikes[]>([])
  const [loading, setLoading]   = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)

  const loadPosts = useCallback(async () => {
    setLoading(true)
    // 1. Fetch posts (RLS filtre selon visibility + friendships)
    const { data: postsData, error: postsErr } = await supabase
      .from('posts')
      .select('id, user_id, texte, visibility, created_at')
      .eq('user_id', profileUserId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (postsErr) {
      toast.error('Impossible de charger les publications')
      setPosts([])
      setLoading(false)
      return
    }

    const list = (postsData ?? []) as PostData[]
    if (list.length === 0) {
      setPosts([])
      setLoading(false)
      return
    }

    // 2. Fetch likes pour tous les posts en une seule requête
    const ids = list.map(p => p.id)
    const { data: likesData } = await supabase
      .from('post_likes')
      .select('post_id, user_id')
      .in('post_id', ids)

    // 3. Aggrège : count par post + has_liked par moi
    const countByPost = new Map<string, number>()
    const myLikedSet  = new Set<string>()
    for (const l of likesData ?? []) {
      countByPost.set(l.post_id, (countByPost.get(l.post_id) ?? 0) + 1)
      if (l.user_id === myId) myLikedSet.add(l.post_id)
    }

    setPosts(list.map(p => ({
      ...p,
      likeCount:    countByPost.get(p.id) ?? 0,
      userHasLiked: myLikedSet.has(p.id),
    })))
    setLoading(false)
  }, [profileUserId, myId])

  useEffect(() => { loadPosts() }, [loadPosts])

  // Realtime : refresh quand un post ou un like change pour ce mur
  useEffect(() => {
    const ch = supabase
      .channel(`mur-${profileUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts',      filter: `user_id=eq.${profileUserId}` }, () => loadPosts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, () => loadPosts())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profileUserId, loadPosts])

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
            userHasLiked={p.userHasLiked}
            onToggleLike={() => handleToggleLike(p)}
            onDelete={() => handleDelete(p)}
          />
        ))}
      </div>

      {composerOpen && isOwnWall && (
        <PostComposer
          authorName={authorName}
          authorAvatar={authorAvatar}
          onClose={() => setComposerOpen(false)}
          onPosted={loadPosts}
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
