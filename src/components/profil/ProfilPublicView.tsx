'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { DisplaySettings, Profile } from '@/contexts/AuthContext'
import BottomNavBar from '@/components/BottomNavBar'
import ProfilHeader, { type FicheProMini } from './ProfilHeader'
import ProfilTabSwitcher, { type ProfilTab } from './ProfilTabSwitcher'
import MurTab from './tabs/MurTab'

interface Etab { id: string; nom: string; photos: string[] | null }
interface Producer { id: string; nom: string; photos: string[] | null; commune: string | null }

function isProfilTab(v: string | null): v is ProfilTab {
  return v === 'mur' || v === 'amis' || v === 'utile'
}

/**
 * Vue publique du profil d'un AUTRE user (route /profil/[id]).
 * Réutilise le profil hybride V4 : header bannière + 3 tabs (Mur/Amis/Utile)
 * en lecture seule. Respecte les display_settings du user visité.
 */
export default function ProfilPublicView({ viewedUserId }: { viewedUserId: string }) {
  const { user } = useAuth()
  const router = useRouter()

  const [profile, setProfile]         = useState<Profile | null>(null)
  const [loading, setLoading]         = useState(true)
  const [notFound, setNotFound]       = useState(false)
  const [myEtabs, setMyEtabs]         = useState<Etab[]>([])
  const [myProducers, setMyProducers] = useState<Producer[]>([])
  const [followersCount, setFollowersCount] = useState<number | null>(null)
  const [activeTab, setActiveTab]     = useState<ProfilTab>('mur')
  const [following, setFollowing]     = useState(false)
  const [followBusy, setFollowBusy]   = useState(false)

  const isOwn = user?.id === viewedUserId

  // Initialise activeTab depuis ?tab=
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

  // Fetch profile + données du user visité
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', viewedUserId)
        .maybeSingle()
      if (cancelled) return
      if (!p) { setNotFound(true); setLoading(false); return }
      setProfile({ ...p, id: viewedUserId } as Profile)

      const [{ data: e }, { data: pr }, { count: fc }] = await Promise.all([
        supabase.from('etablissements').select('id, nom, photos').eq('user_id', viewedUserId),
        supabase.from('producers').select('id, nom, photos, commune').eq('user_id', viewedUserId),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followed_id', viewedUserId),
      ])
      if (!cancelled) {
        setMyEtabs((e as Etab[] | null) ?? [])
        setMyProducers((pr as Producer[] | null) ?? [])
        setFollowersCount(fc ?? 0)
      }

      if (user && !isOwn) {
        const { data: f } = await supabase
          .from('follows')
          .select('follower_id')
          .eq('follower_id', user.id)
          .eq('followed_id', viewedUserId)
          .maybeSingle()
        if (!cancelled) setFollowing(!!f)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [viewedUserId, user, isOwn])

  async function handleSubscribe() {
    if (!user) { router.push('/profil'); return }
    if (followBusy) return
    setFollowBusy(true)
    if (following) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('followed_id', viewedUserId)
      setFollowing(false)
      setFollowersCount(c => Math.max(0, (c ?? 0) - 1))
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, followed_id: viewedUserId })
      setFollowing(true)
      setFollowersCount(c => (c ?? 0) + 1)
    }
    setFollowBusy(false)
  }

  function handleContact() {
    if (!user) { router.push('/profil'); return }
    if (isOwn) return
    router.push(`/messages?friend=${viewedUserId}`)
  }

  if (loading) {
    return (
      <div className="relative min-h-[100dvh] bg-creme pb-28">
        <div className="flex min-h-[100dvh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-bord border-t-primary" />
        </div>
        <BottomNavBar />
      </div>
    )
  }

  if (notFound || !profile) {
    return (
      <div className="relative min-h-[100dvh] bg-creme pb-28 font-inter">
        <div className="flex min-h-[100dvh] items-center justify-center">
          <p className="text-texte-doux">Profil introuvable</p>
        </div>
        <BottomNavBar />
      </div>
    )
  }

  const displayName = profile.display_name ?? 'Sans nom'
  const ds: DisplaySettings = (profile.display_settings ?? {
    banner: true, bio: true, fiche_pro: true, module_utile: true, pages_suivies: false, publications: true,
  }) as DisplaySettings

  // Application des toggles display_settings (visiteur uniquement, l'owner voit tout via /profil)
  const effectiveBannerUrl  = ds.banner ? (profile.banner_url ?? null) : null
  const effectiveBio        = ds.bio ? (profile.bio ?? null) : null
  const effectiveIsVerified = ds.module_utile ? (profile.is_verified ?? false) : false

  const ficheProMinis: FicheProMini[] = ds.fiche_pro ? [
    ...myProducers.map(p => ({ kind: 'producer' as const, id: p.id, nom: p.nom, photoUrl: p.photos?.[0] ?? null, sub: p.commune ?? undefined })),
    ...myEtabs.map(e => ({ kind: 'etab' as const, id: e.id, nom: e.nom, photoUrl: e.photos?.[0] ?? null })),
  ] : []

  // Tabs visibles selon display_settings
  const visibleTabs: ProfilTab[] = (['mur', 'amis', 'utile'] as const).filter(t =>
    (t === 'mur'   ? ds.publications  : true)
    && (t === 'utile' ? ds.module_utile : true),
  )

  // Si activeTab pas visible, fallback
  const safeTab: ProfilTab = visibleTabs.includes(activeTab) ? activeTab : (visibleTabs[0] ?? 'amis')

  return (
    <div className="min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      <ProfilHeader
        viewMode="public"
        displayName={displayName}
        avatarUrl={profile.avatar_url ?? null}
        bannerUrl={effectiveBannerUrl}
        bio={effectiveBio}
        ville={profile.ville ?? null}
        followersCount={followersCount}
        ficheProMinis={ficheProMinis}
        isVerified={effectiveIsVerified}
        onModifyClick={() => { /* no-op en public */ }}
        onToggleViewMode={() => router.back()}
        onContactClick={handleContact}
        onSubscribeClick={handleSubscribe}
      />

      {/* Indicateur de following pour l'user connecté */}
      {!isOwn && user && following && (
        <div className="px-4 pt-2 text-center text-[11px] text-texte-doux">
          Tu suis ce profil
        </div>
      )}

      <ProfilTabSwitcher
        active={safeTab}
        onChange={handleTabChange}
        visibleTabs={visibleTabs}
      />

      {safeTab === 'mur' && (
        <MurTab
          profileUserId={viewedUserId}
          authorName={displayName}
          authorAvatar={profile.avatar_url ?? null}
        />
      )}
      {safeTab === 'amis' && <AmisLecturePlaceholder name={displayName} />}
      {safeTab === 'utile' && (
        <div className="px-6 py-12 text-center">
          <p className="m-0 text-[13px] text-texte-doux">
            Le profil utile de {displayName} arrivera bientôt.
          </p>
        </div>
      )}

      <BottomNavBar />
    </div>
  )

  function AmisLecturePlaceholder({ name }: { name: string }) {
    void name
    void toast
    return (
      <div className="px-6 py-12 text-center">
        <p className="m-0 text-[13px] text-texte-doux">
          La liste d&apos;amis arrivera bientôt sur les profils publics.
        </p>
      </div>
    )
  }
}
