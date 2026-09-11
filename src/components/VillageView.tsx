'use client'
import { useCallback, useEffect, useState } from 'react'

import DesktopVillageSidebar from '@/components/desktop/DesktopVillageSidebar'
import DesktopVillageHero from '@/components/desktop/DesktopVillageHero'
import DesktopVillageSections from '@/components/desktop/DesktopVillageSections'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import type { Evenement } from '@/lib/types'
import { SectionHeaderV3, FeaturedEventCard, MiniEventCard, MoreEventsCard } from '@/components/hub/CartesHub'
import PlansCardFinal from '@/components/PlansCardFinal'
import CinemaAffiche from '@/components/CinemaAffiche'
import PostComposer from '@/components/profil/PostComposer'
import PostCard, { type PostData } from '@/components/profil/PostCard'
import PostCommentsDrawer from '@/components/profil/PostCommentsDrawer'
import BarreAssistant from '@/components/assistant/BarreAssistant'
import HerosVillage from '@/components/village/HerosVillage'
import { chargerIdentitesEtab } from '@/lib/identite'

interface VillagePost extends PostData {
  likeCount: number
  commentCount: number
  userHasLiked: boolean
  authorName: string
  authorAvatar: string | null
  authorHref: string
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
      {/* Top bar bande blanche (identique carte) : logo + bouton Profil.
          pcv-hide : sur ordinateur, l'en-tête du site porte déjà le logo,
          le profil et les notifications — cette barre ferait doublon. */}
      <div
        className="pcv-hide flex items-center justify-between gap-2.5 bg-white"
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

            {/* Raccourci admin vers les réglages de la page — le héros, l'ordre
                et la visibilité des sections s'y trouvent. Seul un admin le
                voit, et il ne coûte rien aux autres : le bouton n'existe pas. */}
            {isAdmin && (
              <Link
                href="/admin/hub-carousel"
                aria-label="Réglages de la page Village"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full no-underline"
                style={{ color: '#7A6A5A' }}
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </Link>
            )}

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

      {/* Grille bureau : le fil existant à gauche, la colonne d'encarts à
          droite. Les deux enveloppes sont en `display: contents` en dessous de
          1024 px — elles n'existent donc pas pour la mise en page mobile, qui
          reste exactement celle d'avant. */}
      <div className="pcv-villageGrid">
      <div className="pcv-villageMain">

      {/* Héros bureau — remplace le titre et les quatre tuiles ci-dessous,
          qui sont masqués au-dessus de 1024 px. */}
      <DesktopVillageHero />

      {/* ── Haut de page : le héros et le titre sur un fond photo commun ──
          Reprise du héros de la version ordinateur. Le voile va du translucide
          en haut à l'opaque en bas : la photo se fond dans la page, et le
          titre reste lisible sans qu'on ait à assombrir l'image.
          `pcv-hide` sur le fond seulement — le héros du village, lui, existe
          sur les deux tailles d'écran. */}
      <div className="pcv-topPhoto">
        <div className="pcv-topPhoto-bg" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/splash-bg-aujourdhui.jpg" alt="" />
        </div>
        <div className="pcv-topPhoto-ct">
          {/* Le héros mis en avant — indépendant de l'assistant : chacun
              demande au serveur s'il est ouvert à cette personne.
              `pcv-hide` : sur ordinateur il vit dans la colonne de droite,
              sous la carte de la zone. Coincé ici, il tombait SOUS le héros
              de bureau — deux mises en avant l'une sur l'autre, dont aucune
              ne portait. Même composant, posé ailleurs : c'est le traitement
              déjà réservé à l'encart d'abonnement juste en dessous. */}
          <div className="pcv-hide"><HerosVillage /></div>

          {/* Titre — deux lignes, deux couleurs de la charte.
              pcv-hide : sur bureau, c'est le héros qui porte le titre. */}
          <div className="pcv-hide">
            <h1 className="m-0 px-4 pb-5 pt-1 text-[27px] font-extrabold leading-[1.12]" style={{ letterSpacing: '-0.02em' }}>
              <span style={{ color: '#2D5A3D' }}>Aujourd&apos;hui</span><br />
              <span style={{ color: '#C84B2F' }}>près de chez vous</span>
            </h1>
          </div>
        </div>
      </div>

      {/* Aujourd'hui — bento du hub (featured + minis), Voir tout → carte.
          Masqué sur bureau : la section « À la une aujourd'hui » ci-dessous
          montre les mêmes événements au gabarit trois tuiles. */}
      <div className="pcv-hide"><TodaySection onVoirTout={onOpenAgendaToday} /></div>

      {/* Sections bureau : à la une, territoire, agenda de la semaine. */}
      <DesktopVillageSections />

      {/* Au cinéma — remonté juste après l'agenda du jour, dont il est le
          prolongement. Le composant décide seul s'il s'affiche : réglage de
          visibilité, compte admin, et rien à l'affiche = pas de bloc. */}
      <CinemaAffiche isAdmin={isAdmin} />

      {/* CTA abonnement (comptes gratuits, dismissable) — repris du hub.
          pcv-hide : sur bureau il vit dans la colonne de droite, entre les
          bons plans et les annonces. Même composant, posé ailleurs. */}
      {showPlansCard && (
        <div className="pcv-hide">
          <PlansCardFinal
            onClick={() => onUpgradePrompt?.('habitants', 'Promotions illimitées')}
            onDismiss={() => { try { localStorage.setItem('pdv-plans-card-dismissed', '1') } catch { /* noop */ }; setPlansCardDismissed(true) }}
          />
        </div>
      )}

      {/* Nos rubriques — les 4 raccourcis, descendus sous l'agenda.
          Remplacées sur bureau par les quatre portes du héros. */}
      <div className="pcv-hide"><Tiles /></div>

      <VillageFeed user={user} avatar={avatar} authorName={profile?.display_name ?? 'Moi'} />

      </div>
      <DesktopVillageSidebar
        encartPromo={showPlansCard ? (
          <div className="pcv-sbPromo">
            <PlansCardFinal
              onClick={() => onUpgradePrompt?.('habitants', 'Promotions illimitées')}
              onDismiss={() => { try { localStorage.setItem('pdv-plans-card-dismissed', '1') } catch { /* noop */ }; setPlansCardDismissed(true) }}
            />
          </div>
        ) : null}
      />
      </div>

      {/* L'Assistant Village — bouton flottant par-dessus la page, hors du
          flux. Le composant décide seul de s'afficher : il demande au serveur
          si l'assistant est ouvert à cette personne. */}
      <BarreAssistant />
    </div>
  )
}

/* ── Nos rubriques — 4 raccourcis en cartes blanches ─────────────────── */
function Tiles() {
  const router = useRouter()
  const [counts, setCounts] = useState<{ reels: number; debats: number; journal: number; annonces: number; debatPhoto?: string | null } | null>(null)

  useEffect(() => {
    fetch('/api/village/counts').then(r => (r.ok ? r.json() : null)).then(d => { if (d) setCounts(d) }).catch(() => {})
  }, [])

  /* Les photos ne servent plus : la carte est blanche, l'icône colorée porte
     la rubrique. `debatPhoto` reste dans la réponse de l'API, simplement
     inutilisé ici. */
  const TILES: { key: 'reels' | 'debats' | 'journal' | 'annonces'; label: string; href: string; color: string; icon: React.ReactNode }[] = [
    { key: 'reels', label: 'Reels', href: '/en-ce-moment?view=1', color: '#E8622A', icon: <><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></> },
    { key: 'debats', label: 'Débats', href: '/forum', color: '#7C3AED', icon: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /> },
    { key: 'journal', label: 'Journal', href: '/journal', color: '#7C5C3B', icon: <><rect x="2" y="4" width="20" height="16" rx="2" ry="2" /><line x1="6" y1="8" x2="18" y2="8" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="6" y1="16" x2="14" y2="16" /></> },
    { key: 'annonces', label: 'Annonces', href: '/annonces', color: '#2D5A3D', icon: <><path d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></> },
  ]

  return (
    <>
      <div className="flex items-baseline justify-between gap-2.5 px-4 pb-2.5 pt-[18px]">
        <span className="font-serif text-[20px] leading-[1.15] text-texte" style={{ letterSpacing: '-0.02em' }}>Nos rubriques</span>
      </div>
      <div className="grid grid-cols-4 gap-2 px-4">
        {TILES.map(t => {
          const n = counts?.[t.key] ?? 0
          return (
            <button
              key={t.key}
              onClick={() => router.push(t.href)}
              className="flex flex-col items-center gap-2 rounded-[18px] border-none bg-white px-1 pb-3 pt-3.5 text-center"
              style={{ cursor: 'pointer', boxShadow: '0 2px 10px rgba(44,28,16,.08)', WebkitTapHighlightColor: 'transparent' }}
            >
              <span className="relative flex h-[42px] w-[42px] items-center justify-center rounded-full" style={{ background: t.color, color: '#fff' }}>
                <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
                {/* Badge du compteur, posé sur le rond — masqué à zéro : une
                    pastille « 0 » annonce du vide au lieu de le taire. */}
                {n > 0 && (
                  <span
                    className="absolute inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[9.5px] font-extrabold text-white"
                    style={{ top: -5, right: -7, background: t.color, border: '1.5px solid #fff' }}
                  >
                    {n > 99 ? '99+' : n}
                  </span>
                )}
              </span>
              <span className="text-[12px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>{t.label}</span>
            </button>
          )
        })}
      </div>
    </>
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
    <div>
      {/* Le compte EST le titre. « Aujourd'hui · 14 » suivi de « 14 événements
          près de chez vous » disait deux fois la même chose, sous un gros
          titre qui commençait déjà par « Aujourd'hui ». */}
      <SectionHeaderV3
        compact
        title={`${todayTotal} événement${todayTotal > 1 ? 's' : ''}`}
        action="Voir tout l’agenda"
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
        .select('id, user_id, texte, visibility, embed_kind, embed_ref_id, embed_snapshot, media, created_at, etablissement_id')
        .eq('sur_village', true)
        .order('created_at', { ascending: false })
        .limit(100)
      const base = (rows ?? []) as PostData[]
      if (base.length === 0) { setPosts([]); return }

      const authorIds = Array.from(new Set(base.map(p => p.user_id)))
      const ids = base.map(p => p.id)
      const [profRes, likesRes, commentsRes, identites] = await Promise.all([
        supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', authorIds),
        supabase.from('post_likes').select('post_id, user_id').in('post_id', ids),
        supabase.from('post_comments').select('post_id').in('post_id', ids),
        chargerIdentitesEtab(supabase, base.map(p => p.etablissement_id)),
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
      setPosts(base.map(p => {
        // Blase : la fiche remplace le profil sur le fil du village.
        const etab = p.etablissement_id ? identites.get(p.etablissement_id) : undefined
        return {
        ...p,
        authorName: etab ? etab.nom : (prof.get(p.user_id)?.name ?? 'Villageois'),
        authorAvatar: etab ? (etab.photos?.[0] ?? null) : (prof.get(p.user_id)?.avatar ?? null),
        authorHref: etab ? `/etablissement/${etab.id}` : `/profil/${p.user_id}`,
        likeCount: likeCount.get(p.id) ?? 0,
        commentCount: commentCount.get(p.id) ?? 0,
        userHasLiked: liked.has(p.id),
      }}))
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
    <>
      {/* En-tête du fil, au même rang que « Au cinéma » et « Nos rubriques ».
          L'ancien sur-titre minuscule en capitales vertes tenait mal à côté
          d'eux : deux échelles de titre à dix pixels d'écart.

          Le compteur ne coûte AUCUNE requête — c'est le nombre de posts déjà
          chargés par ce composant. Masqué tant que le chargement n'a rien
          rendu, pour ne pas afficher « 0 publication » puis se corriger. */}
      <div className="flex items-baseline justify-between gap-2.5 px-4 pb-2.5 pt-[22px]">
        <span className="font-serif text-[20px] leading-[1.15] text-texte" style={{ letterSpacing: '-0.02em' }}>Le fil du village</span>
        {posts.length > 0 && (
          <span className="shrink-0 text-[11.5px]" style={{ color: '#7A6A5A' }}>
            {posts.length} publication{posts.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

    <div className="px-4">
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
            authorHref={p.authorHref}
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
    </>
  )
}
