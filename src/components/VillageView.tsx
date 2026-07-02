'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import PostComposer from '@/components/profil/PostComposer'
import PostCard, { type PostData } from '@/components/profil/PostCard'
import PostCommentsDrawer from '@/components/profil/PostCommentsDrawer'

interface VillagePost extends PostData {
  likeCount: number
  commentCount: number
  userHasLiked: boolean
  authorName: string
  authorAvatar: string | null
}

/** Le « mur du village » : logo + Profil, titre, 4 raccourcis + le fil du village (groupe). */
export default function VillageView({ onOpenProfil }: { onOpenProfil: () => void }) {
  const { user, profile } = useAuth()
  const avatar = profile?.avatar_url ?? null

  return (
    <div className="min-h-full bg-creme pb-6">
      {/* Top bar bande blanche (identique carte) : logo + bouton Profil */}
      <div
        className="flex items-center justify-between gap-2.5 bg-white"
        style={{ padding: '8px 12px', paddingTop: 'max(8px, env(safe-area-inset-top, 8px))', borderBottom: '1px solid #EDE8E0', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/splash-logo-v4.png" alt="La Place du Village" style={{ height: 38, width: 'auto', objectFit: 'contain', display: 'block' }} />
        <button
          type="button"
          onClick={onOpenProfil}
          aria-label="Mon profil"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border bg-white px-3.5 text-[13px] font-extrabold text-texte"
          style={{ borderColor: '#E8E0D4' }}
        >
          <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
          Profil
        </button>
      </div>

      {/* Titre */}
      <div className="px-4 pb-3 pt-3">
        <h1 className="m-0 font-serif text-[22px] text-texte" style={{ letterSpacing: '-0.01em' }}>
          Aujourd&apos;hui dans le village
        </h1>
      </div>

      {/* 4 tuiles */}
      <Tiles />

      {/* Fil du village */}
      <div className="mt-4 px-4">
        <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-primary">
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Le fil du village
        </div>
      </div>
      <VillageFeed user={user} avatar={avatar} authorName={profile?.display_name ?? 'Moi'} />
    </div>
  )
}

/* ── 4 raccourcis ─────────────────────────────────────────────────────── */
function Tiles() {
  const router = useRouter()
  const TILES: { key: string; label: string; href: string; color: string; icon: React.ReactNode }[] = [
    { key: 'reels', label: 'Reels', href: '/en-ce-moment', color: '#E8622A', icon: <><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></> },
    { key: 'journal', label: 'Le journal', href: '/journal', color: '#7C5C3B', icon: <><rect x="2" y="4" width="20" height="16" rx="2" ry="2" /><line x1="6" y1="8" x2="18" y2="8" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="6" y1="16" x2="14" y2="16" /></> },
    { key: 'annonces', label: 'Annonces', href: '/annonces', color: '#2D5A3D', icon: <><path d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></> },
    { key: 'forum', label: 'Place publique', href: '/forum', color: '#7C3AED', icon: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /> },
  ]
  return (
    <div className="grid grid-cols-2 gap-2.5 px-4">
      {TILES.map(t => (
        <button
          key={t.key}
          onClick={() => router.push(t.href)}
          className="flex items-center gap-2.5 rounded-[16px] border bg-white p-3.5 text-left"
          style={{ borderColor: '#F0EAE0', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: `${t.color}1A`, color: t.color }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
          </span>
          <span className="text-[13.5px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>{t.label}</span>
        </button>
      ))}
    </div>
  )
}

/* ── Le fil du village (posts sur_village de tout le monde) ────────────── */
function VillageFeed({ user, avatar, authorName }: { user: ReturnType<typeof useAuth>['user']; avatar: string | null; authorName: string }) {
  const myId = user?.id ?? null
  const { openAuthModal } = useAuthModal()
  const [posts, setPosts] = useState<VillagePost[]>([])
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [commentsForPost, setCommentsForPost] = useState<VillagePost | null>(null)

  const loadPosts = useCallback(async () => {
    try {
      const { data: rows } = await supabase
        .from('posts')
        .select('id, user_id, texte, visibility, embed_kind, embed_ref_id, media, created_at')
        .eq('sur_village', true)
        .order('created_at', { ascending: false })
        .limit(100)
      const base = (rows ?? []) as PostData[]
      if (base.length === 0) { setPosts([]); return }

      const authorIds = Array.from(new Set(base.map(p => p.user_id)))
      const ids = base.map(p => p.id)
      const [profRes, likesRes, commentsRes] = await Promise.all([
        supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', authorIds),
        supabase.from('post_likes').select('post_id, user_id').in('post_id', ids),
        supabase.from('post_comments').select('post_id').in('post_id', ids),
      ])
      const prof = new Map<string, { name: string; avatar: string | null }>()
      for (const p of (profRes.data ?? []) as { user_id: string; display_name: string | null; avatar_url: string | null }[]) {
        prof.set(p.user_id, { name: p.display_name || 'Villageois', avatar: p.avatar_url })
      }
      const likeCount = new Map<string, number>(); const commentCount = new Map<string, number>(); const liked = new Set<string>()
      for (const l of (likesRes.data ?? []) as { post_id: string; user_id: string }[]) {
        likeCount.set(l.post_id, (likeCount.get(l.post_id) ?? 0) + 1)
        if (l.user_id === myId) liked.add(l.post_id)
      }
      for (const c of (commentsRes.data ?? []) as { post_id: string }[]) {
        commentCount.set(c.post_id, (commentCount.get(c.post_id) ?? 0) + 1)
      }
      setPosts(base.map(p => ({
        ...p,
        authorName: prof.get(p.user_id)?.name ?? 'Villageois',
        authorAvatar: prof.get(p.user_id)?.avatar ?? null,
        likeCount: likeCount.get(p.id) ?? 0,
        commentCount: commentCount.get(p.id) ?? 0,
        userHasLiked: liked.has(p.id),
      })))
    } catch {
      toast.error('Impossible de charger le fil du village')
    } finally {
      setLoading(false)
    }
  }, [myId])

  useEffect(() => { loadPosts() }, [loadPosts])

  useEffect(() => {
    const ch = supabase
      .channel('fil-village')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts', filter: 'sur_village=eq.true' }, () => loadPosts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, () => loadPosts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, () => loadPosts())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadPosts])

  async function handleToggleLike(post: VillagePost) {
    if (!myId) { openAuthModal(); return }
    setPosts(prev => prev.map(p => p.id === post.id
      ? { ...p, userHasLiked: !p.userHasLiked, likeCount: p.likeCount + (p.userHasLiked ? -1 : 1) }
      : p))
    if (post.userHasLiked) await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', myId)
    else await supabase.from('post_likes').insert({ post_id: post.id, user_id: myId })
  }

  async function handleDelete(post: VillagePost) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { toast.error('Session expirée'); return }
    const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || 'Erreur suppression'); return }
    setPosts(prev => prev.filter(p => p.id !== post.id))
    toast.success('Publication supprimée')
  }

  return (
    <div className="px-4 pt-1">
      {/* Composer launcher — poste sur le village */}
      <button
        type="button"
        onClick={() => { if (!myId) { openAuthModal(); return } setComposerOpen(true) }}
        className="flex w-full items-center gap-[10px] rounded-[14px] border bg-white p-3 text-left"
        style={{ borderColor: '#F0EAE0', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}
      >
        {avatar
          ? <img src={avatar} alt="" className="h-[34px] w-[34px] shrink-0 rounded-full object-cover" />
          : <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-primary text-[15px] font-extrabold text-white">{(authorName || '·').charAt(0).toUpperCase()}</div>}
        <span className="flex-1 rounded-full bg-cremeDeep px-3.5 py-2.5 text-[13px] text-texte-doux">Partage avec tout le village…</span>
      </button>

      <div className="mt-3 flex flex-col gap-3">
        {loading && posts.length === 0 && <p className="py-8 text-center text-[13px] text-texte-doux">Chargement…</p>}
        {!loading && posts.length === 0 && (
          <p className="px-6 py-10 text-center text-[13px] leading-[1.5] text-texte-doux">
            Le fil du village est vide. Sois le premier à publier quelque chose !
          </p>
        )}
        {posts.map(p => (
          <PostCard
            key={p.id}
            post={p}
            authorName={p.authorName}
            authorAvatar={p.authorAvatar}
            isOwn={p.user_id === myId}
            likeCount={p.likeCount}
            commentCount={p.commentCount}
            userHasLiked={p.userHasLiked}
            onToggleLike={() => handleToggleLike(p)}
            onDelete={() => handleDelete(p)}
            onComment={() => setCommentsForPost(p)}
          />
        ))}
      </div>

      {composerOpen && (
        <PostComposer
          authorName={authorName}
          authorAvatar={avatar}
          toVillage
          onClose={() => setComposerOpen(false)}
          onPosted={() => loadPosts()}
        />
      )}

      {commentsForPost && (
        <PostCommentsDrawer
          postId={commentsForPost.id}
          postAuthorId={commentsForPost.user_id}
          onClose={() => setCommentsForPost(null)}
          onCountChange={count => setPosts(prev => prev.map(p => p.id === commentsForPost.id ? { ...p, commentCount: count } : p))}
        />
      )}
    </div>
  )
}
