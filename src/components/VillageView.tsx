'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import type { Evenement } from '@/lib/types'
import { SectionHeaderV3, FeaturedEventCard, MiniEventCard, MoreEventsCard } from '@/components/HubView'
import PlansCardFinal from '@/components/PlansCardFinal'
import CinemaAffiche from '@/components/CinemaAffiche'
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

/** Le « mur du village » : logo + identité, titre, 4 raccourcis, Aujourd'hui + le fil du village (groupe). */
export default function VillageView({ onOpenProfil, onOpenSplash, onOpenAgendaToday, onUpgradePrompt, onOpenNotifs, unreadCount = 0 }: {
  onOpenProfil: () => void
  onOpenSplash?: () => void
  /** Cloche de la top bar → vue notifications du shell. */
  onOpenNotifs?: () => void
  /** Compteur non lus, fourni par le shell (unique porteur de useNotifications). */
  unreadCount?: number
  /** « Voir tout » de la section Aujourd'hui → carte agenda du jour. */
  onOpenAgendaToday?: () => void
  /** CTA abonnement (comptes gratuits) → SubscriptionModal du shell. */
  onUpgradePrompt?: (plan: 'habitants' | 'pro', label: string) => void
}) {
  const { user, profile, isAdmin } = useAuth()
  const { openAuthModal } = useAuthModal()
  const avatar = profile?.avatar_url ?? null
  // Prénom = premier mot du nom affiché. Tronqué en CSS pour les noms longs.
  const prenom = (profile?.display_name ?? '').trim().split(/\s+/)[0] || 'Profil'
  const initiale = prenom.charAt(0).toUpperCase() || '?'

  // CTA plans (comptes gratuits) — même dismiss persistant que sur l'ancien hub.
  const [plansCardDismissed, setPlansCardDismissed] = useState(false)
  useEffect(() => {
    try { if (localStorage.getItem('pdv-plans-card-dismissed') === '1') setPlansCardDismissed(true) } catch { /* noop */ }
  }, [])
  const showPlansCard = (profile?.plan ?? 'basic') === 'basic' && !plansCardDismissed && !!onUpgradePrompt

  return (
    <div className="min-h-full bg-creme pb-6">
      {/* Top bar bande blanche (identique carte) : logo + bouton Profil */}
      <div
        className="flex items-center justify-between gap-2.5 bg-white"
        style={{ padding: '8px 12px', paddingTop: 'max(8px, env(safe-area-inset-top, 8px))', borderBottom: '1px solid #EDE8E0', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}
      >
        <button
          type="button"
          onClick={onOpenSplash}
          aria-label="Accueil La Place du Village"
          className="shrink-0 border-none bg-transparent p-0"
          style={{ lineHeight: 0, cursor: 'pointer' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-topbar.webp" alt="La Place du Village" style={{ height: 38, width: 'auto', objectFit: 'contain', display: 'block' }} />
        </button>
        {user ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Cloche + pastille rouge — le compteur descend du shell, qui tient
                l'unique abonnement Realtime aux notifications (un seul appel de
                useNotifications dans tout l'arbre, sinon les channels se marchent
                dessus). */}
            <button
              type="button"
              onClick={onOpenNotifs}
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} non lues` : 'Notifications'}
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-none bg-transparent text-texte"
              style={{ cursor: 'pointer' }}
            >
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 0 0-12 0c0 6-3 7-3 7h18s-3-1-3-7" />
                <path d="M13.7 20a2 2 0 0 1-3.4 0" />
              </svg>
              {unreadCount > 0 && (
                <span
                  className="absolute inline-flex items-center justify-center rounded-full font-extrabold text-white"
                  style={{
                    top: 1, right: 1, minWidth: 17, height: 17, fontSize: 9.5, padding: '0 3.5px',
                    backgroundColor: '#E53935', border: '1.5px solid #fff',
                  }}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Pastille identité : avatar + prénom, remplace l'ancien « Profil » */}
            <button
              type="button"
              onClick={onOpenProfil}
              aria-label="Mon profil"
              className="flex h-9 shrink-0 items-center gap-2 rounded-full border-none pl-1 pr-3.5 text-[13px] font-extrabold text-white"
              style={{ backgroundColor: '#2D5A3D', cursor: 'pointer' }}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-extrabold"
                style={{ backgroundColor: '#E8F2EB', color: '#2D5A3D' }}
              >
                {avatar
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initiale}
              </span>
              <span className="max-w-[110px] truncate">{prenom}</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => openAuthModal()}
            className="flex h-9 shrink-0 items-center gap-2 rounded-full border-none px-4 text-[13px] font-extrabold text-white"
            style={{ backgroundColor: '#2D5A3D', cursor: 'pointer' }}
          >
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            Se connecter
          </button>
        )}
      </div>

      {/* Titre — 2 lignes, gros et gras (façon mockup) */}
      <div className="px-4 pb-4 pt-4">
        <h1 className="m-0 text-[27px] font-extrabold leading-[1.12] text-texte" style={{ letterSpacing: '-0.02em' }}>
          Aujourd&apos;hui<br />dans le village
        </h1>
      </div>

      {/* 4 tuiles */}
      <Tiles />

      {/* CTA abonnement (comptes gratuits, dismissable) — repris du hub */}
      {showPlansCard && (
        <PlansCardFinal
          onClick={() => onUpgradePrompt?.('habitants', 'Promotions illimitées')}
          onDismiss={() => { try { localStorage.setItem('pdv-plans-card-dismissed', '1') } catch { /* noop */ }; setPlansCardDismissed(true) }}
        />
      )}

      {/* Aujourd'hui — bento du hub (featured + minis), Voir tout → carte */}
      <TodaySection onVoirTout={onOpenAgendaToday} />

      {/* Au cinéma — sous l'agenda du jour, dont il est le prolongement. Le
          composant décide seul s'il s'affiche : réglage de visibilité, compte
          admin, et rien à l'affiche = pas de bloc du tout. */}
      <CinemaAffiche isAdmin={isAdmin} />

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

/* ── 4 raccourcis — cartes photo verticales (façon mockup) ──────────── */
function Tiles() {
  const router = useRouter()
  const [counts, setCounts] = useState<{ reels: number; debats: number; journal: number; annonces: number; debatPhoto?: string | null } | null>(null)

  useEffect(() => {
    fetch('/api/village/counts').then(r => (r.ok ? r.json() : null)).then(d => { if (d) setCounts(d) }).catch(() => {})
  }, [])

  const TILES: { key: 'reels' | 'debats' | 'journal' | 'annonces'; label: string; href: string; color: string; photo: string; icon: React.ReactNode }[] = [
    { key: 'reels', label: 'Reels', href: '/en-ce-moment?view=1', color: '#E8622A', photo: '/splash-bg-aujourdhui.jpg', icon: <><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></> },
    { key: 'debats', label: 'Débats', href: '/forum', color: '#7C3AED', photo: counts?.debatPhoto || '/hub-intro-slide.webp', icon: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /> },
    { key: 'journal', label: 'Journal', href: '/journal', color: '#7C5C3B', photo: '/og/journal.jpg', icon: <><rect x="2" y="4" width="20" height="16" rx="2" ry="2" /><line x1="6" y1="8" x2="18" y2="8" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="6" y1="16" x2="14" y2="16" /></> },
    { key: 'annonces', label: 'Annonces', href: '/annonces', color: '#2D5A3D', photo: '/og/annonces.jpg', icon: <><path d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></> },
  ]
  return (
    <div className="grid grid-cols-4 gap-2 px-4">
      {TILES.map(t => {
        const n = counts?.[t.key] ?? 0
        return (
          <button
            key={t.key}
            onClick={() => router.push(t.href)}
            className="flex flex-col items-center border-none bg-transparent p-0 text-center"
            style={{ cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          >
            {/* Carte photo verticale : gradient noir bas + pastille icône + badge count */}
            <div className="relative w-full overflow-hidden rounded-[16px]" style={{ aspectRatio: '0.68', background: '#E4DACA', boxShadow: '0 2px 8px rgba(44,28,16,0.10)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.photo} alt="" className="h-full w-full object-cover" />
              {/* Gradient noir depuis le bas → détache la pastille icône */}
              <span className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.18) 38%, rgba(0,0,0,0) 60%)' }} />
              <span
                className="absolute bottom-2 left-1/2 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full"
                style={{ background: t.color, color: '#fff', border: '3px solid rgba(251,244,232,0.95)' }}
              >
                <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
              </span>
              {/* Badge compteur en haut à droite (style notif) — masqué si 0 */}
              {n > 0 && (
                <span
                  className="absolute right-1.5 top-1.5 inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1 text-[10.5px] font-extrabold text-white"
                  style={{ background: t.color, border: '1.5px solid #fff' }}
                >
                  {n > 99 ? '99+' : n}
                </span>
              )}
            </div>
            <span className="mt-1.5 text-[12.5px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ── Aujourd'hui — bento repris du hub (featured + 2 minis + « +N ») ──── */
function TodaySection({ onVoirTout }: { onVoirTout?: () => void }) {
  const router = useRouter()
  // Date LOCALE (pas toISOString → décalage UTC), même logique que le hub.
  const _d = new Date()
  const todayYMD = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`
  const { data: hubData } = useSWR(`/api/hub?d=${todayYMD}`)

  const todayEvents: Evenement[] = (hubData?.todayEvents ?? []) as Evenement[]
  const todayTotal: number = hubData?.todayTotal ?? 0
  if (todayEvents.length === 0) return null

  const [featuredEv, ...restEvents] = todayEvents
  const miniEvents = restEvents.slice(0, 2)
  const shownEvents = (featuredEv ? 1 : 0) + miniEvents.length
  const remaining = Math.max(0, todayTotal - shownEvents)
  const showMoreCard = featuredEv && remaining > 0 && miniEvents.length < 2

  return (
    <div className="mt-5">
      <SectionHeaderV3
        title="Aujourd'hui"
        kicker={`· ${todayTotal}`}
        subtitle={`${todayTotal} événement${todayTotal > 1 ? 's' : ''} près de chez vous`}
        action="Voir tout"
        onAction={onVoirTout ?? (() => router.push('/?tab=carte'))}
      />
      <div
        className="grid gap-2 px-4"
        style={{
          gridTemplateColumns: '1.25fr 1fr',
          gridTemplateRows: miniEvents.length >= 1 ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr',
          height: miniEvents.length >= 1 ? 240 : undefined,
        }}
      >
        {featuredEv && (
          <FeaturedEventCard ev={featuredEv} onClick={() => router.push(`/evenement/${featuredEv.id}`)} />
        )}
        {miniEvents.map(ev => (
          <MiniEventCard key={ev.id} ev={ev} onClick={() => router.push(`/evenement/${ev.id}`)} />
        ))}
        {showMoreCard && (
          <MoreEventsCard count={remaining} onClick={onVoirTout ?? (() => router.push('/?tab=carte'))} />
        )}
      </div>
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
