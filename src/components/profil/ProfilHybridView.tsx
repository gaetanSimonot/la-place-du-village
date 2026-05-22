'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useFriendships } from '@/hooks/useFriendships'
import LoginView from '@/components/LoginView'
import EditProfileModal from '@/components/EditProfileModal'
import ProfilHeader, { type FicheProMini, type ViewMode } from './ProfilHeader'
import ProfilTabSwitcher, { type ProfilTab } from './ProfilTabSwitcher'
import AmisTab from './tabs/AmisTab'
import MurTabPlaceholder from './tabs/MurTabPlaceholder'
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
  return v === 'mur' || v === 'amis' || v === 'utile'
}

export default function ProfilHybridView() {
  const { user, profile, loading, updateProfile } = useAuth()
  const { pendingReceived } = useFriendships()

  const [activeTab, setActiveTab] = useState<ProfilTab>('mur')
  const [viewMode, setViewMode] = useState<ViewMode>('own')
  const [editOpen, setEditOpen] = useState(false)

  const [myEtabs, setMyEtabs] = useState<Etab[]>([])
  const [myProducers, setMyProducers] = useState<Producer[]>([])
  const [followersCount, setFollowersCount] = useState<number | null>(null)

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
      .select('id', { count: 'exact', head: true })
      .eq('followed_id', user.id)
      .then(({ count }) => {
        if (!cancelled) setFollowersCount(count ?? 0)
      })

    return () => {
      cancelled = true
    }
  }, [user?.id])

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
  const moduleUtileActive = profile?.display_settings?.module_utile ?? true

  // 1 seule fiche pro mini affichée : producteur prioritaire, sinon premier établissement.
  const ficheProMini: FicheProMini | null = (() => {
    if (myProducers.length > 0) {
      const p = myProducers[0]
      return {
        kind: 'producer',
        id: p.id,
        nom: p.nom,
        photoUrl: p.photos?.[0] ?? null,
        sub: p.commune ?? undefined,
      }
    }
    if (myEtabs.length > 0) {
      const e = myEtabs[0]
      return {
        kind: 'etab',
        id: e.id,
        nom: e.nom,
        photoUrl: e.photos?.[0] ?? null,
      }
    }
    return null
  })()

  return (
    <div className="min-h-full bg-creme pb-10 font-inter text-texte">
      <ProfilHeader
        viewMode={viewMode}
        displayName={displayName}
        avatarUrl={profile?.avatar_url ?? null}
        bannerUrl={profile?.banner_url ?? null}
        bio={profile?.bio ?? null}
        ville={profile?.ville ?? null}
        followersCount={followersCount}
        ficheProMini={ficheProMini}
        moduleUtileActive={moduleUtileActive}
        onModifyClick={() => setEditOpen(true)}
        onToggleViewMode={() => setViewMode(m => (m === 'own' ? 'public' : 'own'))}
      />

      <ProfilTabSwitcher
        active={activeTab}
        onChange={handleTabChange}
        amisAlert={pendingReceived.length > 0}
      />

      {activeTab === 'mur'   && <MurTabPlaceholder />}
      {activeTab === 'amis'  && <AmisTab />}
      {activeTab === 'utile' && <UtileTabPlaceholder />}

      {editOpen && (
        <EditProfileModal
          initialName={profile?.display_name ?? ''}
          initialGenre={(profile?.genre ?? null) as 'homme' | 'femme' | 'autre' | null}
          initialBannerUrl={profile?.banner_url ?? null}
          initialIsPublic={profile?.is_public ?? true}
          initialSearchable={profile?.searchable ?? true}
          email={user.email ?? ''}
          avatarUrl={profile?.avatar_url ?? null}
          onClose={() => setEditOpen(false)}
          onSave={async ({ name, genre, bannerUrl, isPublic, searchable }) => {
            const patch: {
              display_name?: string
              genre?: 'homme' | 'femme' | 'autre' | null
              banner_url?: string | null
              is_public?: boolean
              searchable?: boolean
            } = {}
            if (name.trim() && name.trim() !== profile?.display_name) patch.display_name = name.trim()
            if (genre !== (profile?.genre ?? null)) patch.genre = genre
            const cleanBanner = bannerUrl ? bannerUrl.split('?')[0] : null
            const currentBanner = profile?.banner_url ?? null
            if (cleanBanner !== currentBanner) patch.banner_url = cleanBanner
            if (isPublic !== (profile?.is_public ?? true)) patch.is_public = isPublic
            if (searchable !== (profile?.searchable ?? true)) patch.searchable = searchable
            if (Object.keys(patch).length > 0) await updateProfile(patch)
            setEditOpen(false)
          }}
        />
      )}
    </div>
  )
}
