'use client'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { authedFetcher } from '@/lib/swr-fetchers'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useFriendships } from '@/hooks/useFriendships'
import LoginView from '@/components/LoginView'
import EditProfileModal from '@/components/EditProfileModal'
import PushPromptModal from '@/components/PushPromptModal'
import ProfilHeader, { type FicheProMini, type ViewMode } from './ProfilHeader'
import ProfilTabSwitcher, { type ProfilTab } from './ProfilTabSwitcher'
import AmisTab from './tabs/AmisTab'
import MurTab from './tabs/MurTab'
import ReelsTab from './tabs/ReelsTab'
import UtileTabPlaceholder from './tabs/UtileTabPlaceholder'

interface Etab {
  id: string
  nom: string
  photos: string[] | null
}
interface Producer {
  id: string
  nom: string
  photos: string[] | null
  commune: string | null
}

function isProfilTab(v: string | null): v is ProfilTab {
  return v === 'mur' || v === 'reels' || v === 'amis' || v === 'utile'
}

export default function ProfilHybridView({ onOpenNotifs, notifUnread }: { onOpenNotifs?: () => void; notifUnread?: number } = {}) {
  const { user, profile, loading, updateProfile } = useAuth()
  // Un seul consumer du hook useFriendships dans tout l'arbre /profil pour
  // éviter le double subscribe Realtime sur friendships-<userId>.
  // Le state est passé en prop à AmisTab.
  const friends = useFriendships()

  const [activeTab, setActiveTab] = useState<ProfilTab>('mur')
  const [viewMode, setViewMode] = useState<ViewMode>('own')
  const [editOpen, setEditOpen] = useState(false)

  const [myEtabs, setMyEtabs] = useState<Etab[]>([])
  const [myProducers, setMyProducers] = useState<Producer[]>([])
  const [followersCount, setFollowersCount] = useState<number | null>(null)

  // Messages non-lus (annonce + covoit + ami + support) → badge enveloppe.
  // SWR sur la même clé que la boîte unifiée : se met à jour en direct quand une
  // conversation est lue (les clients de conv appellent mutate('/api/messages')).
  const { data: msgData } = useSWR<{ conversations?: { unreadCount?: number }[] }>(user ? '/api/messages' : null, authedFetcher)
  const msgUnread = (msgData?.conversations ?? []).reduce((s, c) => s + (c.unreadCount || 0), 0)

  // Initialise activeTab depuis ?tab= (window.location pour éviter le bailout CSR
  // que useSearchParams provoque sur le prerender static).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const t = new URLSearchParams(window.location.search).get('tab')
    if (isProfilTab(t)) setActiveTab(t)
  }, [])

  function handleTabChange(next: ProfilTab) {
    setActiveTab(next)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    window.history.replaceState({}, '', url)
  }

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false

    supabase
      .from('etablissements')
      .select('id, nom, photos')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (!cancelled && data) setMyEtabs(data as Etab[])
      })

    supabase
      .from('producers')
      .select('id, nom, photos, commune')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (!cancelled && data) setMyProducers(data as Producer[])
      })

    supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('followed_id', user.id)
      .then(({ count }) => {
        if (!cancelled) setFollowersCount(count ?? 0)
      })

    return () => {
      cancelled = true
    }
  }, [user?.id])

  // Calculs liés aux toggles display_settings — avant les early returns pour
  // respecter les rules of hooks (useEffect doit être appelé inconditionnellement).
  const settings = profile?.display_settings ?? {
    banner: true, bio: true, fiche_pro: true, module_utile: true, pages_suivies: false, publications: true,
  }
  const inPublic = viewMode === 'public'

  const visibleTabs: ProfilTab[] = inPublic
    ? (['mur', 'reels', 'amis', 'utile'] as const).filter(t =>
        (t === 'mur'   ? settings.publications  : true)
        && (t === 'reels' ? settings.publications : true)
        && (t === 'utile' ? settings.module_utile : true),
      )
    : ['mur', 'reels', 'amis', 'utile']

  // Si l'activeTab disparaît du visibleTabs (passage en public avec toggle off),
  // bascule sur le premier tab visible (Amis dans le pire cas).
  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0] ?? 'amis')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inPublic, settings.publications, settings.module_utile])

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-creme">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-bord border-t-primary" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-full bg-creme font-inter">
        <div className="px-5 pb-6 pt-10 text-center">
          <h1
            className="m-0 mb-2 font-serif text-[26px] font-normal text-texte"
            style={{ letterSpacing: '-0.02em' }}
          >
            Bienvenue
          </h1>
          <p className="m-0 text-[14px] leading-[1.5] text-texte-doux">
            Connecte-toi pour accéder à ton espace, profiter des bons plans et participer à la vie du village.
          </p>
        </div>
        <LoginView />
      </div>
    )
  }

  const displayName = profile?.display_name ?? user.email?.split('@')[0] ?? 'Mon profil'
  const isVerified  = profile?.is_verified ?? false

  // Toutes les fiches pro (producteurs + établissements) que gère l'user.
  // Producteurs d'abord (kicker spécifique), puis établissements.
  const ficheProMinis: FicheProMini[] = [
    ...myProducers.map(p => ({
      kind: 'producer' as const,
      id: p.id,
      nom: p.nom,
      photoUrl: p.photos?.[0] ?? null,
      sub: p.commune ?? undefined,
    })),
    ...myEtabs.map(e => ({
      kind: 'etab' as const,
      id: e.id,
      nom: e.nom,
      photoUrl: e.photos?.[0] ?? null,
    })),
  ]

  // Application des toggles display_settings — uniquement en mode 'public' (aperçu).
  // En mode 'own', l'user voit tout son contenu peu importe ses settings.
  const effectiveBannerUrl     = inPublic && !settings.banner       ? null : (profile?.banner_url ?? null)
  const effectiveBio           = inPublic && !settings.bio          ? null : (profile?.bio ?? null)
  const effectiveFicheProMinis = inPublic && !settings.fiche_pro    ? []   : ficheProMinis
  const effectiveIsVerified    = inPublic && !settings.module_utile ? false : isVerified

  return (
    <div className="min-h-full bg-creme pb-28 font-inter text-texte">
      {/* Bandeau "Aperçu public" — visible quand viewMode='public', avec retour explicite */}
      {viewMode === 'public' && (
        <button
          type="button"
          onClick={() => setViewMode('own')}
          className="flex w-full items-center justify-center gap-2 px-4 py-2.5 text-[12px] font-bold text-white"
          style={{ background: '#1A1209', letterSpacing: '-0.005em' }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Tu es en aperçu public — Retour à ma vue
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      )}

      <ProfilHeader
        viewMode={viewMode}
        displayName={displayName}
        avatarUrl={profile?.avatar_url ?? null}
        bannerUrl={effectiveBannerUrl}
        bio={effectiveBio}
        ville={profile?.ville ?? null}
        followersCount={followersCount}
        ficheProMinis={effectiveFicheProMinis}
        isVerified={effectiveIsVerified}
        onModifyClick={() => setEditOpen(true)}
        onToggleViewMode={() => setViewMode(m => (m === 'own' ? 'public' : 'own'))}
        onOpenNotifs={onOpenNotifs}
        notifUnread={notifUnread}
        msgUnread={msgUnread}
      />

      <ProfilTabSwitcher
        active={activeTab}
        onChange={handleTabChange}
        amisAlert={friends.pendingReceived.length > 0}
        visibleTabs={visibleTabs}
      />

      {activeTab === 'mur'   && (
        <MurTab
          profileUserId={user.id}
          authorName={displayName}
          authorAvatar={profile?.avatar_url ?? null}
        />
      )}
      {activeTab === 'reels' && <ReelsTab profileUserId={user.id} />}
      {activeTab === 'amis'  && <AmisTab friends={friends} />}
      {activeTab === 'utile' && <UtileTabPlaceholder />}

      {/* Incitation à activer les notifications (sur sa propre vue uniquement) */}
      {viewMode === 'own' && <PushPromptModal />}

      {editOpen && (
        <EditProfileModal
          initialName={profile?.display_name ?? ''}
          initialBio={profile?.bio ?? null}
          initialVille={profile?.ville ?? null}
          initialLinkUrl={profile?.link_url ?? null}
          initialBannerUrl={profile?.banner_url ?? null}
          email={user.email ?? ''}
          avatarUrl={profile?.avatar_url ?? null}
          onClose={() => setEditOpen(false)}
          onSave={async ({ name, bio, ville, linkUrl, bannerUrl, avatarUrl }) => {
            const patch: {
              display_name?: string
              bio?: string | null
              ville?: string | null
              link_url?: string | null
              banner_url?: string | null
              avatar_url?: string | null
            } = {}
            if (name.trim() && name.trim() !== profile?.display_name) patch.display_name = name.trim()
            if (bio !== (profile?.bio ?? null))                        patch.bio = bio
            if (ville !== (profile?.ville ?? null))                    patch.ville = ville
            if (linkUrl !== (profile?.link_url ?? null))               patch.link_url = linkUrl
            const cleanBanner = bannerUrl ? bannerUrl.split('?')[0] : null
            const currentBanner = profile?.banner_url ?? null
            if (cleanBanner !== currentBanner)                         patch.banner_url = cleanBanner
            const cleanAvatar = avatarUrl ? avatarUrl.split('?')[0] : null
            const currentAvatar = profile?.avatar_url ?? null
            if (cleanAvatar !== currentAvatar)                         patch.avatar_url = cleanAvatar
            if (Object.keys(patch).length > 0) await updateProfile(patch)
            setEditOpen(false)
          }}
        />
      )}
    </div>
  )
}
